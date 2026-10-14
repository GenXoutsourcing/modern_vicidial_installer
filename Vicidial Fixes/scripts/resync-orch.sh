#!/bin/bash
# Coordinated live resync of the MEMORY tables (vicidial_live_agents, vicidial_manager) from a primary to ONE replica.
# usage: resync-orch.sh <primary ssh alias> <replica ssh alias>
# (a) replica SQL thread stopped first, so it cannot run past the snapshot position;
# (b) source copy taken in ONE session under LOCK TABLES ... READ (table lock only, no FLUSH TABLES WITH READ LOCK) with
#     SHOW MASTER STATUS and @@gtid_binlog_pos read inside the lock;
# (c) replica advanced with START SLAVE UNTIL to exactly that position (GTID form when the replica uses GTID, else file/pos);
# (d) both tables replaced wholesale with sql_log_bin=0, so replica-only rows disappear;
# (e) replication resumed: every primary write after the snapshot replays on top. vicidial_manager is only READ on replicas,
#     so no call-control command is ever re-issued by this procedure.
set -e
PRI=${1:?primary alias}; REP=${2:?replica alias}; S="ssh -o ConnectTimeout=15"; TS=$(date +%Y%m%d-%H%M%S); W=/root/premig/resync-$TS
echo "[1] $REP: stop SQL thread"
$S $REP "mysql -e 'STOP SLAVE SQL_THREAD'; mysql -e 'SHOW SLAVE STATUS\G' | awk '/Exec_Master_Log_Pos|Using_Gtid|Gtid_Slave_Pos/{print \"    \"\$0}'"
USING_GTID=$($S $REP "mysql -e 'SHOW SLAVE STATUS\G' | awk '/Using_Gtid/{print \$2}'")
echo "[2] $PRI: snapshot under table READ lock with coordinates (perl DBI, single session)"
cat > /tmp/resync-snap.pl <<'PL'
use DBI; my ($u,$p,$W)=(undef,undef,$ARGV[0]);
open(C,"/etc/astguiclient.conf"); while(<C>){ $u=$1 if /^VARDB_user => (.*)/; $p=$1 if /^VARDB_pass => (.*)/; } close(C); chomp($u); chomp($p);
my $dbh=DBI->connect("DBI:mysql:asterisk;mysql_socket=/var/lib/mysql/mysql.sock","root","",{RaiseError=>1});   # root via unix_socket: SHOW MASTER STATUS needs BINLOG MONITOR
my $t0=time; $dbh->do("LOCK TABLES vicidial_live_agents READ, vicidial_manager READ");
my ($file,$pos)=$dbh->selectrow_array("SHOW MASTER STATUS"); my ($gtid)=$dbh->selectrow_array("SELECT \@\@gtid_binlog_pos");
open(O,">$W/snapshot.sql"); print O "-- snapshot at $file:$pos gtid $gtid\nSET sql_log_bin=0;\nSET sql_mode='NO_ENGINE_SUBSTITUTION';\n";
for my $t ("vicidial_live_agents","vicidial_manager") {
  print O "DELETE FROM $t;\n";
  my $sth=$dbh->prepare("SELECT * FROM $t"); $sth->execute; my $cols=join(",",map {"`$_`"} @{$sth->{NAME}}); my $n=0;
  while (my $r=$sth->fetchrow_arrayref) { print O "INSERT INTO $t ($cols) VALUES (".join(",",map { defined $_ ? $dbh->quote($_) : "NULL" } @$r).");\n"; $n++; }
  print STDERR "    $t: $n rows\n";
}
close(O); $dbh->do("UNLOCK TABLES"); printf STDERR "    coordinates %s:%s gtid %s, lock held %d s\n", $file, $pos, $gtid, time-$t0;
open(P,">$W/pos"); print P "$file $pos $gtid\n"; close(P);
PL
scp -q /tmp/resync-snap.pl $PRI:/tmp/resync-snap.pl
$S $PRI "mkdir -p $W; perl /tmp/resync-snap.pl $W"
read FILE POS GTID <<< "$($S $PRI "cat $W/pos")"
scp -q $PRI:$W/snapshot.sql /tmp/resync-snapshot-$TS.sql && scp -q /tmp/resync-snapshot-$TS.sql $REP:/root/premig/resync-snapshot-$TS.sql
if [ "$USING_GTID" = "No" ]; then UNTIL="MASTER_LOG_FILE='$FILE', MASTER_LOG_POS=$POS"; else UNTIL="master_gtid_pos='$GTID'"; fi
echo "[3] $REP: apply replication up to the snapshot ($UNTIL), replace tables from the snapshot, resume"
$S $REP "mysql -e \"START SLAVE SQL_THREAD UNTIL $UNTIL\"; for i in \$(seq 1 120); do R=\$(mysql -e 'SHOW SLAVE STATUS\G' | awk '/Slave_SQL_Running:/{print \$2}'); [ \"\$R\" = No ] && break; sleep 1; done; E=\$(mysql -e 'SHOW SLAVE STATUS\G' | awk '/Exec_Master_Log_Pos/{print \$2}'); G=\$(mysql -N -e 'SELECT @@gtid_slave_pos'); echo \"    replica stopped: exec pos \$E (snapshot $POS), gtid_slave_pos \$G (snapshot $GTID), sql_running=\$R\"; [ \"\$R\" = No ] || { echo ERROR: replica still running; exit 1; }; mysql asterisk < /root/premig/resync-snapshot-$TS.sql && echo '    snapshot applied with sql_log_bin=0 (DELETE + INSERT, replica-only rows gone)'; mysql -e 'START SLAVE SQL_THREAD'; sleep 4; mysql -e 'SHOW SLAVE STATUS\G' | grep -E 'Slave_IO_Running|Slave_SQL_Running:|Seconds_Behind|Last_Errno' | tr '\n' ' '; echo"
echo "[4] agreement check: user/status/lead_id/conf_exten on both sides (a few seconds apart; differences are rows that changed in between)"
$S $PRI "mysql -N asterisk -e 'SELECT user,status,lead_id,conf_exten FROM vicidial_live_agents ORDER BY user'" > /tmp/resync-pri-$TS.txt
$S $REP "mysql -N asterisk -e 'SELECT user,status,lead_id,conf_exten FROM vicidial_live_agents ORDER BY user'" > /tmp/resync-rep-$TS.txt
if diff /tmp/resync-pri-$TS.txt /tmp/resync-rep-$TS.txt > /tmp/resync-diff-$TS.txt; then echo "    identical: $(wc -l < /tmp/resync-pri-$TS.txt) rows"; else echo "    $(grep -c '^[<>]' /tmp/resync-diff-$TS.txt) differing lines:"; head -6 /tmp/resync-diff-$TS.txt; fi
echo "    done $(date +%T)"
