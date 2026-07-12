#!/usr/bin/perl
#
# genx-server-stats.pl - lightweight server stats reporter for non-Asterisk roles
#
# Stock VICIdial only updates servers.sysload/cpu_idle_percent/disk_usage and the
# server_updater heartbeat from AST_update.pl, which is an Asterisk-manager loop
# that only runs on telephony servers (ViciBox keepalive flag 1). On DB / web /
# archive / slave boxes nothing maintains those columns, so the legacy Reports
# page shows the server RED with frozen load/disk and the GenX UI shows stale
# numbers. This script maintains the same columns (same value formats as
# AST_update.pl) plus a server_performance history row when sys_perf_log='Y',
# without needing Asterisk. Run from cron every minute on non-telephony roles.

use strict;
use warnings;
use DBI;

my %conf;
open(my $cf, '<', '/etc/astguiclient.conf') or die "no astguiclient.conf: $!\n";
while (<$cf>) {
    next if (/^#/);
    $conf{$1} = $2 if (/^(VAR\w+)\s*=>\s*(.*?)\s*$/);
}
close($cf);

my $server_ip = $conf{VARserver_ip}  or die "VARserver_ip missing\n";
my $db_host   = $conf{VARDB_server}   || 'localhost';
my $db_name   = $conf{VARDB_database} || 'asterisk';
my $db_user   = $conf{VARDB_user}     || 'cron';
my $db_pass   = $conf{VARDB_pass}     // '';
my $db_port   = $conf{VARDB_port}     || '3306';

# sysload: 1-minute load average, digits only (i.e. load * 100 as integer),
# exactly like AST_update.pl's get_cpu_load().
open(my $la, '<', '/proc/loadavg') or die "no /proc/loadavg\n";
my $sysload = (split(/\s+/, <$la>))[0];
close($la);
$sysload =~ s/\D//g;
$sysload = 0 unless length($sysload);

# cpu_idle_percent: averaged over the WHOLE minute, not a 1-second snapshot.
# This script fires from cron at second :00 — the exact moment VICIdial's
# minute-aligned jobs (hopper refill, adapt stats, keepalives) burst — so a
# 1-second sample taken here systematically reported the burst as the box's
# steady load (an idle DB primary read a constant ~19% while stock
# AST_update boxes, which sample continuously, read 1%). Instead we diff
# /proc/stat against the counters saved by the PREVIOUS run: a true ~60s
# average, immune to the alignment. First run (no state file) falls back to
# the old two-sample method.
my $state_file = '/var/tmp/genx-server-stats.cpustat';
sub cpu_sample {
    open(my $st, '<', '/proc/stat') or die "no /proc/stat\n";
    my @f = split(/\s+/, <$st>);
    close($st);
    my $idle = $f[4] + ($f[5] // 0);            # idle + iowait
    my $total = 0; $total += $_ for @f[1..$#f];
    return ($idle, $total);
}
my ($idle_now, $total_now) = cpu_sample();
my ($idle_prev, $total_prev);
if (open(my $sf, '<', $state_file)) {
    ($idle_prev, $total_prev) = split(/\s+/, <$sf> // '');
    close($sf);
}
if (!defined $total_prev || !length($total_prev) || $total_now <= $total_prev) {
    # No usable state (first run, or counters reset by a reboot): fall back
    # to a 1-second sample just for this run.
    ($idle_prev, $total_prev) = ($idle_now, $total_now);
    sleep(1);
    ($idle_now, $total_now) = cpu_sample();
}
my $dt = $total_now - $total_prev;
my $cpu_idle = $dt > 0 ? int(100 * ($idle_now - $idle_prev) / $dt) : 100;
$cpu_idle = 100 if $cpu_idle > 100;
$cpu_idle = 0 if $cpu_idle < 0;
if (open(my $sf, '>', $state_file)) {
    print $sf "$idle_now $total_now\n";
    close($sf);
}

# disk_usage: "N pct|" per df row, same as AST_update.pl's get_disk_space().
my $disk_usage = '';
my $ct_pct = 0;
for my $line (`/bin/df -B 1048576 -x nfs -x cifs -x sshfs -x ftpfs 2>/dev/null`) {
    if ($line =~ /(\d+)\%/) {
        $ct_pct++;
        $disk_usage .= "$ct_pct $1|";
    }
}

my $dbh = DBI->connect("DBI:mysql:$db_name:$db_host:$db_port", $db_user, $db_pass,
    { RaiseError => 1, PrintError => 0 })
    or die "cannot connect to $db_host: $DBI::errstr\n";

$dbh->do("UPDATE servers SET sysload=?, cpu_idle_percent=?, disk_usage=? WHERE server_ip=?",
    undef, $sysload, $cpu_idle, $disk_usage, $server_ip);

# Heartbeat (legacy Reports page turns the server RED when this goes stale).
my ($updater_exists) = $dbh->selectrow_array(
    "SELECT COUNT(*) FROM server_updater WHERE server_ip=?", undef, $server_ip);
if ($updater_exists) {
    $dbh->do("UPDATE server_updater SET last_update=NOW() WHERE server_ip=?", undef, $server_ip);
} else {
    $dbh->do("INSERT INTO server_updater SET server_ip=?, last_update=NOW()", undef, $server_ip);
}

# Optional history row for the Server Performance report, gated like AST_update.pl.
my ($perf_log) = $dbh->selectrow_array(
    "SELECT sys_perf_log FROM servers WHERE server_ip=?", undef, $server_ip);
if (defined $perf_log && $perf_log eq 'Y') {
    my ($memtotal, $memfree) = (0, 0);
    if (open(my $mi, '<', '/proc/meminfo')) {
        while (<$mi>) {
            $memtotal = $1 if (/^MemTotal:\s+(\d+)/);
            $memfree  = $1 if (/^MemAvailable:\s+(\d+)/);
        }
        close($mi);
    }
    my $processes = 0;
    if (opendir(my $dh, '/proc')) {
        $processes = grep { /^\d+$/ } readdir($dh);
        closedir($dh);
    }
    $dbh->do("INSERT INTO server_performance (start_time, server_ip, sysload, freeram, usedram,
              processes, channels_total, trunks_total, clients_total, clients_zap, clients_iax,
              clients_local, clients_sip, live_recordings, cpu_user_percent, cpu_system_percent,
              cpu_idle_percent)
              VALUES (NOW(), ?, ?, ?, ?, ?, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, ?)",
        undef, $server_ip, $sysload, $memfree, ($memtotal - $memfree), $processes, $cpu_idle);
}

# The legacy Reports server list turns a server RED once server_updater is
# more than 10 seconds stale (and at 90+ seconds admin.php may clear the
# server's live calls/agents), and the GenX UI flags DOWN at 15 seconds.
# AST_update.pl refreshes every second on telephony boxes; emulate that here
# by re-touching the heartbeat every 4 seconds for the rest of this cron
# minute, so the worst-case gap to the next run's first write stays ~8s.
my $started = time();
while (time() - $started < 55) {
    sleep(4);
    $dbh->do("UPDATE server_updater SET last_update=NOW() WHERE server_ip=?", undef, $server_ip);
}

$dbh->disconnect;
exit 0;
