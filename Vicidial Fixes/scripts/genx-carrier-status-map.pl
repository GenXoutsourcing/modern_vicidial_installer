#!/usr/bin/perl
# genx-carrier-status-map.pl  -  GenX 2026-10-23 (WGL variant: +404 Not Found -> CRINVL)
#
# Re-statuses auto-dial calls that the carrier rejected (SIP 603/403/503) from the
# stock NA/AB/ADC into per-reason statuses, keyed on vicidial_carrier_log
# sip_hangup_cause + sip_hangup_reason. Runs every minute from cron on the DB master.
#
# Modes:
#   --report-only   (DEFAULT) record what WOULD change in genx_carrier_status_map_log, touch nothing else
#   --apply         also rewrite vicidial_log / vicidial_list (only where the row still holds the old auto status)
#   --rollback      reverse every applied row recorded in the log table (vicidial_log, vicidial_log_archive, vicidial_list)
#   --summary       print counts from the log table and exit
#
# Safety: flock so runs never overlap; every SELECT capped at 5s (max_statement_time);
# windows are bounded by indexed call_date so the MyISAM read lock lasts ~40ms.

use strict;
use warnings;
use DBI;
use Fcntl qw(:flock);
use POSIX qw(strftime);

my $CONF     = '/etc/astguiclient.conf';
my $LOG      = '/var/log/astguiclient/genx-carrier-status-map.log';
my $LOCK     = '/var/run/genx-carrier-status-map.lock';
my $TABLE    = 'genx_carrier_status_map_log';
my $CL_WIN   = 5;    # minutes of vicidial_carrier_log to examine (overlapping; dedup by log table)
my $VL_WIN   = 20;   # minutes of vicidial_log to join against
my $MAX_SEC  = 5;    # max_statement_time for every SELECT
my $MAX_ROWS = 2000; # per run; a bigger backlog just takes more runs

# --- mapping: [sip code, reason regex (undef = any), new status, label] -- first match wins
my @MAP = (
  [603, undef,                           'CRSPAM', 'Carrier Declined 603 / SPAM DID'],
  [403, qr/^FAS/i,                       'CRFAS',  'Carrier 403 FAS'],
  [403, qr/Honeypot/i,                   'CRHONY', 'Carrier 403 Honeypot'],
  [403, qr/Invalid Prefix|Destination/i, 'CRINVL', 'Carrier 403 Invalid Prefix/Destination'],
  [403, qr/Unresponsive/i,               'CRUNRS', 'Carrier 403 Unresponsive'],
  [404, undef,                           'CRINVL', 'Carrier 404 Not Found'],
  [503, undef,                           'CRCONG', 'Carrier 503 Congestion'],
);
my @OLD_STATUSES = ('NA','AB','ADC');

my $mode = 'report';
for (@ARGV) {
  $mode = 'apply'    if /^--apply$/;
  $mode = 'rollback' if /^--rollback$/;
  $mode = 'summary'  if /^--summary$/;
  $mode = 'report'   if /^--report-only$/;
}

# --- db ---
my %c;
open(my $cf, '<', $CONF) or die "cannot read $CONF: $!";
while (<$cf>) { if (/^(VARDB_\w+)\s*=>\s*(.*?)\s*$/) { $c{$1} = $2 } }
close $cf;
my $dbh = DBI->connect("DBI:mysql:$c{VARDB_database}:$c{VARDB_server}:$c{VARDB_port}", $c{VARDB_user}, $c{VARDB_pass},
                       { RaiseError => 1, PrintError => 0, AutoCommit => 1 }) or die "db connect failed";

$dbh->do("CREATE TABLE IF NOT EXISTS $TABLE (
  uniqueid        VARCHAR(20) NOT NULL PRIMARY KEY,
  lead_id         INT UNSIGNED NOT NULL,
  campaign_id     VARCHAR(20),
  call_date       DATETIME,
  caller_code     VARCHAR(30),
  outbound_cid    VARCHAR(50),
  sip_code        SMALLINT,
  sip_reason      VARCHAR(100),
  old_status      VARCHAR(6),
  new_status      VARCHAR(6),
  applied         ENUM('N','Y','R') NOT NULL DEFAULT 'N',
  seen_at         DATETIME,
  applied_at      DATETIME,
  KEY (call_date), KEY (new_status), KEY (applied), KEY (lead_id)
) ENGINE=InnoDB");

sub now { strftime('%Y-%m-%d %H:%M:%S', localtime) }
open(my $lf, '>>', $LOG) or die "cannot open $LOG: $!";
sub logit { my $m = shift; print $lf now()." [$mode] $m\n"; }

# --- summary ---
if ($mode eq 'summary') {
  print "Carrier status map log ($TABLE)\n\n";
  my $r = $dbh->selectall_arrayref("SELECT DATE(call_date) d, new_status, applied, COUNT(*) c FROM $TABLE GROUP BY 1,2,3 ORDER BY 1,2,3");
  printf "%-12s %-8s %-7s %s\n", 'date','status','applied','calls';
  printf "%-12s %-8s %-7s %d\n", @$_ for @$r;
  print "\nTop outbound CIDs drawing 603 (all time in log):\n";
  $r = $dbh->selectall_arrayref("SELECT outbound_cid, COUNT(*) c FROM $TABLE WHERE sip_code=603 AND outbound_cid<>'' GROUP BY 1 ORDER BY c DESC LIMIT 20");
  printf "%-20s %d\n", @$_ for @$r;
  exit 0;
}

# --- lock ---
open(my $lk, '>', $LOCK) or die "cannot open $LOCK: $!";
unless (flock($lk, LOCK_EX | LOCK_NB)) { logit("previous run still active, skipping"); exit 0; }

# --- rollback ---
if ($mode eq 'rollback') {
  my $rows = $dbh->selectall_arrayref("SELECT uniqueid,lead_id,old_status,new_status FROM $TABLE WHERE applied='Y'");
  my ($vl,$vla,$vli) = (0,0,0);
  for my $r (@$rows) {
    my ($uid,$lead,$old,$new) = @$r;
    $vl  += $dbh->do("UPDATE vicidial_log SET status=? WHERE uniqueid=? AND lead_id=? AND status=?", undef, $old,$uid,$lead,$new);
    $vla += $dbh->do("UPDATE vicidial_log_archive SET status=? WHERE uniqueid=? AND lead_id=? AND status=?", undef, $old,$uid,$lead,$new);
    $vli += $dbh->do("UPDATE vicidial_list SET status=? WHERE lead_id=? AND status=?", undef, $old,$lead,$new);
    $dbh->do("UPDATE $TABLE SET applied='R' WHERE uniqueid=?", undef, $uid);
  }
  logit(sprintf("ROLLBACK rows=%d vicidial_log=%d vicidial_log_archive=%d vicidial_list=%d", scalar(@$rows), $vl, $vla, $vli));
  print "rolled back ".scalar(@$rows)." rows (log $vl, archive $vla, list $vli)\n";
  exit 0;
}

# --- apply mode refuses to run if the target statuses do not exist ---
if ($mode eq 'apply') {
  my %want = map { $_->[2] => 1 } @MAP;
  my $have = $dbh->selectcol_arrayref("SELECT status FROM vicidial_statuses WHERE status IN (".join(',', map {"'$_'"} keys %want).")");
  delete $want{$_} for @$have;
  if (%want) { logit("APPLY REFUSED: missing system statuses: ".join(' ', sort keys %want)); exit 1; }
}

# --- candidate scan ---
my $in_old = join(',', map {"'$_'"} @OLD_STATUSES);
my $sel = $dbh->prepare("SET STATEMENT max_statement_time=$MAX_SEC FOR
  SELECT l.uniqueid, l.lead_id, l.campaign_id, l.call_date, l.status, c.caller_code, c.sip_hangup_cause, c.sip_hangup_reason
  FROM vicidial_carrier_log c
  JOIN vicidial_log l ON l.lead_id=c.lead_id AND l.uniqueid LIKE CONCAT(SUBSTRING_INDEX(c.uniqueid,'.',1),'%')
  LEFT JOIN $TABLE g ON g.uniqueid=l.uniqueid
  WHERE c.call_date >= NOW() - INTERVAL $CL_WIN MINUTE
    AND c.sip_hangup_cause IN (603,403,404,503)
    AND l.call_date >= NOW() - INTERVAL $VL_WIN MINUTE
    AND l.user='VDAD' AND l.status IN ($in_old)
    AND g.uniqueid IS NULL
  LIMIT $MAX_ROWS");
$sel->execute;
my $cid_q = $dbh->prepare("SET STATEMENT max_statement_time=$MAX_SEC FOR SELECT outbound_cid FROM vicidial_dial_log WHERE lead_id=? AND caller_code=? ORDER BY call_date DESC LIMIT 1");
my $ins = $dbh->prepare("INSERT IGNORE INTO $TABLE (uniqueid,lead_id,campaign_id,call_date,caller_code,outbound_cid,sip_code,sip_reason,old_status,new_status,applied,seen_at,applied_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,NOW(),?)");

my %count; my ($scanned, $applied, $mapped) = (0, 0, 0);
while (my ($uid,$lead,$camp,$cdate,$old,$code,$sipc,$reason) = $sel->fetchrow_array) {
  $scanned++;
  $reason = '' unless defined $reason; $reason =~ s/\)$//;
  my $new;
  for my $m (@MAP) { if ($sipc == $m->[0] && (!defined $m->[1] || $reason =~ $m->[1])) { $new = $m->[2]; last } }
  next unless $new;                       # unmapped reason: leave it alone
  $cid_q->execute($lead, $code);
  my ($ocid) = $cid_q->fetchrow_array; $ocid = '' unless defined $ocid;
  $ocid = $1 if $ocid =~ /<(\d+)>/;       # keep only the number out of "V..." <7777770009>
  my $flag = 'N'; my $at = undef;
  if ($mode eq 'apply') {
    my $n1 = $dbh->do("UPDATE vicidial_log SET status=? WHERE uniqueid=? AND lead_id=? AND status=?", undef, $new,$uid,$lead,$old);
    $dbh->do("UPDATE vicidial_list SET status=? WHERE lead_id=? AND status=?", undef, $new,$lead,$old);
    if ($n1 > 0) { $flag = 'Y'; $at = now(); $applied++; }
  }
  $ins->execute($uid,$lead,$camp,$cdate,$code,$ocid,$sipc,$reason,$old,$new,$flag,$at);
  $count{"$old>$new"}++; $mapped++;
}
my $detail = join(' ', map { "$_=$count{$_}" } sort keys %count) || 'none';
logit("scanned=$scanned mapped=$mapped applied=$applied $detail");
close $lf;
