#!/bin/bash
# c1 shift watch (read-only). Prints a compact status block and a BREACH list. Run from the desktop.
S="ssh -o ConnectTimeout=12"; B=""
br() { B="$B\n  - $1"; }
echo "=== c1 watch $(date +%H:%M:%S)"
# ---------- db1 ----------
D1=$($S mtc1-db1 'bash -s' <<'EOF'
Q() { mysql -N asterisk -e "$1" 2>/dev/null; }
read TC MU MC CEMC AC <<< "$(mysql -N -e "SELECT (SELECT VARIABLE_VALUE FROM information_schema.global_status WHERE VARIABLE_NAME='THREADS_CONNECTED'),(SELECT VARIABLE_VALUE FROM information_schema.global_status WHERE VARIABLE_NAME='MAX_USED_CONNECTIONS'),@@max_connections,(SELECT VARIABLE_VALUE FROM information_schema.global_status WHERE VARIABLE_NAME='CONNECTION_ERRORS_MAX_CONNECTIONS'),(SELECT VARIABLE_VALUE FROM information_schema.global_status WHERE VARIABLE_NAME='ABORTED_CONNECTS')" | tr '\t' ' ')"
read MT MA MF <<< "$(free -m | awk '/^Mem:/{print $2, $7, $4}')"; RSS=$(ps -o rss= -C mariadbd 2>/dev/null | awk '{s+=$1} END {printf "%d", s/1024}')
W0=$(mysql -N -e "SHOW GLOBAL STATUS LIKE 'Table_locks_waited'" | awk '{print $2}'); I0=$(mysql -N -e "SHOW GLOBAL STATUS LIKE 'Table_locks_immediate'" | awk '{print $2}'); sleep 10
W1=$(mysql -N -e "SHOW GLOBAL STATUS LIKE 'Table_locks_waited'" | awk '{print $2}'); I1=$(mysql -N -e "SHOW GLOBAL STATUS LIKE 'Table_locks_immediate'" | awk '{print $2}')
RATE=$(awk "BEGIN{printf \"%.1f\", 100*($W1-$W0)/(($W1-$W0)+($I1-$I0)+0.001)}")
read MDL MDLMAX <<< "$(Q "SELECT COUNT(*), IFNULL(MAX(time),0) FROM information_schema.processlist WHERE state LIKE 'Waiting for table%'" | tr '\t' ' ')"
MDLT=$(Q "SELECT GROUP_CONCAT(CONCAT(t,'=',c) ORDER BY c DESC SEPARATOR ' ') FROM (SELECT SUBSTRING_INDEX(SUBSTRING_INDEX(LOWER(info),'vicidial_',-1),' ',1) t, COUNT(*) c FROM information_schema.processlist WHERE state LIKE 'Waiting for table%' GROUP BY t ORDER BY c DESC LIMIT 3) z")
AG=$(Q "SELECT CONCAT(COUNT(*),' (ready ',SUM(status='READY'),', incall ',SUM(status='INCALL'),', paused ',SUM(status='PAUSED'),', autopaused ',SUM(status='PAUSED' AND random_id='10'),')') FROM vicidial_live_agents")
AP=$(Q "SELECT SUM(status='PAUSED' AND random_id='10') FROM vicidial_live_agents"); AGN=$(Q "SELECT COUNT(*) FROM vicidial_live_agents")
CALLS=$(Q "SELECT CONCAT(COUNT(*),' (sent ',SUM(status='SENT'),', live ',SUM(status='LIVE'),', xfer ',SUM(status='XFER'),', in ',SUM(call_type='IN'),')') FROM vicidial_auto_calls")
PHANTOM=$(Q "SELECT COUNT(*) FROM vicidial_auto_calls a JOIN servers s ON s.server_ip=a.server_ip WHERE s.max_vicidial_trunks=0 AND a.status IN ('SENT','LIVE')")
read MR MAGE MNEW MNEWAGE <<< "$(Q "SELECT COUNT(*), IFNULL(MAX(TIMESTAMPDIFF(SECOND,entry_date,NOW())),0), SUM(status='NEW'), IFNULL(MAX(IF(status='NEW',TIMESTAMPDIFF(SECOND,entry_date,NOW()),0)),0) FROM vicidial_manager" | tr '\t' ' ')"
CAP=$(Q "SELECT GROUP_CONCAT(CONCAT(SUBSTRING(table_name,10),'=',ROUND(100*(data_length+index_length)/NULLIF(max_data_length,0)),'%') SEPARATOR ' ') FROM information_schema.tables WHERE table_schema='asterisk' AND engine='MEMORY' AND table_name IN ('vicidial_live_agents','vicidial_manager')")
FL=$(Q "SELECT CONCAT(TIMESTAMPDIFF(SECOND,db_time,NOW()),'s ago, ',stage) FROM vicidial_internal_log WHERE process='AST_flush_DBqueue.pl' AND action='finished' ORDER BY db_time DESC LIMIT 1")
ALERTS=$(grep -c "^$(date +%Y-%m-%d)" /var/log/astguiclient/flushmon-alerts.log 2>/dev/null); LASTALERT=$(grep "^$(date +%Y-%m-%d)" /var/log/astguiclient/flushmon-alerts.log 2>/dev/null | tail -1 | cut -c12-120)
CL=$(Q "SELECT table_rows FROM information_schema.tables WHERE table_schema='asterisk' AND table_name='call_log'")
PLAN=$(Q "EXPLAIN SELECT count(*) FROM vicidial_log FORCE INDEX (campai_dt_stat_usr) WHERE campaign_id='X' AND call_date > NOW()-INTERVAL 1 HOUR" | awk '{print $6}' | head -1)
SHORT=$(grep -c "TOTAL SHORTAGE: [1-9]" /var/log/astguiclient/vdautodial_FILL.$(date +%Y-%m-%d) 2>/dev/null)
ERR=0; for f in /var/log/astguiclient/*.$(date +%Y-%m-%d); do n=$(awk -v t="$(date -d '-10 min' '+%Y-%m-%d %H:%M:%S')" '$0 >= t' "$f" 2>/dev/null | grep -ci "DBD::\|is full\|SQL syntax\|too many connections"); ERR=$((ERR+n)); done
echo "DB1 conn=$TC/$MC (max_used $MU, max_conn_errors $CEMC, aborted $AC) mem_avail=${MA}MB/${MT}MB mariadb_rss=${RSS}MB lockwait=${RATE}% mdl_waiting=$MDL(max ${MDLMAX}s; on: ${MDLT:-none}) agents=$AG calls=$CALLS phantom_on_nonsip=$PHANTOM manager=$MR rows oldest ${MAGE}s pending $MNEW oldest ${MNEWAGE}s cap[$CAP] flush[$FL] flushmon_alerts_today=$ALERTS last[$LASTALERT] call_log=$CL vdadapt_index=$PLAN trunk_shortage_lines_today=$SHORT daemon_errors_10m=$ERR"
echo "V $TC $MC $MU $CEMC $MT $MA $RATE $MDL $MDLMAX $AP $AGN $PHANTOM $MAGE $MNEWAGE $ALERTS $CL $PLAN $ERR"
EOF
)
echo "$D1" | grep '^DB1'; set -- $(echo "$D1" | grep '^V ' | cut -d' ' -f2-)
TC=$1; MC=$2; MU=$3; CEMC=$4; MT=$5; MA=$6; RATE=$7; MDL=$8; MDLMAX=$9; AP=${10}; AGN=${11}; PH=${12}; MAGE=${13}; MNEWAGE=${14}; ALERTS=${15}; CL=${16}; PLAN=${17}; ERR=${18}
[ "${TC:-0}" -gt $((MC*8/10)) ] && br "db1 connections $TC of $MC (>80%)"
[ "${CEMC:-0}" -gt 0 ] && br "db1 max_connections errors counter = $CEMC (check delta)"
[ "${MA:-99999}" -lt $((MT/10)) ] && br "db1 available memory ${MA}MB (<10%)"
awk "BEGIN{exit !($RATE > 10)}" && br "db1 lock-wait rate ${RATE}% (>10%)"
[ "${MDL:-0}" -gt 200 ] && br "db1 $MDL threads waiting for table locks (max ${MDLMAX}s)"
[ "${MDLMAX:-0}" -gt 5 ] && br "db1 longest table-lock wait ${MDLMAX}s (>5s)"
[ "${AGN:-0}" -gt 0 ] && [ "${AP:-0}" -gt $((AGN/10)) ] && br "auto-paused agents $AP of $AGN (>10%)"
[ "${PH:-0}" -gt 0 ] && br "phantom calls on non-dialer servers: $PH"
[ "${MAGE:-0}" -gt 600 ] && br "manager oldest row ${MAGE}s (>600, flush missed?)"
[ "${MNEWAGE:-0}" -gt 30 ] && br "pending manager command ${MNEWAGE}s old (>30, AST_manager_send stalled?)"
[ "${ALERTS:-0}" -gt 0 ] && br "flushmon alerts today: $ALERTS"
[ "${CL:-0}" -gt 8000000 ] && br "call_log $CL rows (>8M)"
[ "$PLAN" != "campai_dt_stat_usr" ] && br "VDadapt plan not using campai_dt_stat_usr (got '$PLAN')"
[ "${ERR:-0}" -gt 0 ] && br "db1 daemon errors in last 10 min: $ERR"
# ---------- replicas ----------
for h in mtc1-db2 mtc1-db3; do
  R=$($S $h 'L=$(mysql -e "SHOW SLAVE STATUS\G" | awk "/Seconds_Behind_Master/{print \$2}"); SQ=$(mysql -e "SHOW SLAVE STATUS\G" | awk "/Slave_SQL_Running:/{print \$2}"); E=$(mysql -e "SHOW SLAVE STATUS\G" | awk "/Last_Errno/{print \$2}"); TC=$(mysql -N -e "SELECT VARIABLE_VALUE FROM information_schema.global_status WHERE VARIABLE_NAME=\"THREADS_CONNECTED\""); MA=$(free -m | awk "/^Mem:/{print \$7}"); echo "lag=${L:-NULL}s sql=$SQ err=$E conn=$TC mem_avail=${MA}MB"')
  echo "$h $R"; L=$(echo "$R" | sed 's/lag=\([^s]*\)s.*/\1/'); SQ=$(echo "$R" | sed 's/.*sql=\([A-Za-z]*\).*/\1/')
  [ "$SQ" != "Yes" ] && br "$h replication SQL thread not running"; [ "$L" != "NULL" ] && [ "${L:-0}" -gt 120 ] && br "$h lag ${L}s (>120)"
done
# ---------- web servers ----------
for h in mtc1-agent1 mtc1-agent2 mtc1-agent3 mtc1-agent4; do
  R=$($S $h 'L=$(ls -t /var/log/httpd/*access_log* 2>/dev/null | head -1); F=0; for m in 5 4 3 2 1; do t=$(date -d "-$m min" "+%d/%b/%Y:%H:%M"); n=$(grep -c "\[$t:.* 500 " $L); [ $n -gt $F ] && F=$n; done; MAXC=$(grep -c "max_children" /var/log/php-fpm/error.log 2>/dev/null); MAXC10=$(awk -v t="$(date -d "-10 min" "+[%d-%b-%Y %H:%M")" "\$0 >= t" /var/log/php-fpm/error.log 2>/dev/null | grep -c "max_children"); FAT=$(awk -v t="[$(date -d "-10 min" "+%d-%b-%Y %H:%M")" "\$0 >= t" /var/log/php-fpm/www-error.log 2>/dev/null | grep -c "PHP Fatal"); EADDR=$(awk -v t="[$(date -d "-10 min" "+%d-%b-%Y %H:%M")" "\$0 >= t" /var/log/php-fpm/www-error.log 2>/dev/null | grep -c "Cannot assign requested address"); TW=$(ss -tan state time-wait 2>/dev/null | wc -l); PROC=$(pgrep -fc "php-fpm: pool"); LQ=$(ss -xl 2>/dev/null | grep php-fpm | awk "{print \$2}" | head -1); LOAD=$(cut -d" " -f1 /proc/loadavg); MA=$(free -m | awk "/^Mem:/{print \$7}"); echo "500s/min(max of last5)=$F fatals10m=$FAT eaddrnotavail10m=$EADDR fpm_procs=$PROC fpm_maxchildren_warn10m=$MAXC10 fpm_listen_q=${LQ:-0} time_wait=$TW load=$LOAD mem_avail=${MA}MB"')
  echo "$h $R"
  F=$(echo "$R" | sed 's/.*last5)=\([0-9]*\).*/\1/'); FAT=$(echo "$R" | sed 's/.*fatals10m=\([0-9]*\).*/\1/'); EA=$(echo "$R" | sed 's/.*eaddrnotavail10m=\([0-9]*\).*/\1/'); MX=$(echo "$R" | sed 's/.*warn10m=\([0-9]*\).*/\1/'); TW=$(echo "$R" | sed 's/.*time_wait=\([0-9]*\).*/\1/'); PR=$(echo "$R" | sed 's/.*fpm_procs=\([0-9]*\).*/\1/'); LQ=$(echo "$R" | sed 's/.*fpm_listen_q=\([0-9]*\).*/\1/')
  [ "${F:-0}" -gt 20 ] && br "$h HTTP 500s $F/min"; [ "${FAT:-0}" -gt 20 ] && br "$h PHP fatals $FAT in 10 min"; [ "${EA:-0}" -gt 0 ] && br "$h ephemeral port exhaustion errors: $EA"
  [ "${MX:-0}" -gt 0 ] && br "$h php-fpm hit max_children $MX times in 10 min"; [ "${TW:-0}" -gt 40000 ] && br "$h TIME_WAIT $TW (>40k of the 50k port range)"; [ "${PR:-0}" -ge 150 ] && br "$h php-fpm pool full ($PR of 150 workers)"; [ "${LQ:-0}" -gt 50 ] && br "$h php-fpm listen queue $LQ"
done
# ---------- dialers (sample sip1, sip17) ----------
for h in mtc1-sip1 mtc1-sip17; do
  R=$($S $h 'X=$(grep -c "__sip_xmit\|Serious Network Trouble" /var/log/asterisk/messages 2>/dev/null); X10=$(awk -v t="[$(date -d "-10 min" "+%Y-%m-%d %H:%M")" "\$0 >= t" /var/log/asterisk/messages 2>/dev/null | grep -c "__sip_xmit"); SH=$(grep -c "LOCAL TRUNK SHORTAGE: [1-9]" /var/log/astguiclient/vdautodial.$(date +%Y-%m-%d) 2>/dev/null); TH=$(ls /proc/$(pgrep -o asterisk)/task 2>/dev/null | wc -l); CH=$(asterisk -rx "core show channels" | awk "/active channels/{print \$1}"); LOAD=$(cut -d" " -f1 /proc/loadavg); echo "sip_xmit_err_10m=$X10 (today $X) trunk_shortage_lines_today=$SH asterisk_threads=$TH channels=$CH load=$LOAD"')
  echo "$h $R"; X10=$(echo "$R" | sed 's/sip_xmit_err_10m=\([0-9]*\).*/\1/'); SH=$(echo "$R" | sed 's/.*lines_today=\([0-9]*\).*/\1/'); TH=$(echo "$R" | sed 's/.*threads=\([0-9]*\).*/\1/')
  [ "${X10:-0}" -gt 60 ] && br "$h SIP transmit errors in 10 min: $X10 (baseline ~45 from qualify probes to unreachable carrier peers)"; [ "${TH:-0}" -gt 5000 ] && br "$h asterisk threads $TH"
done
# ---------- db3 aggregates ----------
R=$($S mtc1-db3 "mysql -N asterisk -e \"SELECT CONCAT('dials10m=',COUNT(*),' delivered=',SUM(user NOT IN ('VDAD','VDCL','')),' DROP=',SUM(status='DROP'),' PDROP=',SUM(status='PDROP'),' pdrop_pct=',ROUND(100*SUM(status='PDROP')/COUNT(*),1)) FROM vicidial_log WHERE call_date > NOW()-INTERVAL 10 MINUTE; SELECT CONCAT('lagged10m=',SUM(sub_status='LAGGED'),' dead10m=',SUM(sub_status='DEAD')) FROM vicidial_agent_log WHERE event_time > NOW()-INTERVAL 10 MINUTE; SELECT CONCAT('closer_dup10m=',COUNT(*)) FROM (SELECT uniqueid FROM vicidial_closer_log WHERE call_date > NOW()-INTERVAL 10 MINUTE GROUP BY uniqueid HAVING COUNT(*)>1) x; SELECT CONCAT('peak_dials_per_min_last10=',MAX(c)) FROM (SELECT COUNT(*) c FROM vicidial_dial_log WHERE call_date > NOW()-INTERVAL 10 MINUTE GROUP BY DATE_FORMAT(call_date,'%H:%i')) y\"" | tr '\n' ' ')
echo "db3 $R"; PD=$(echo "$R" | sed 's/.*pdrop_pct=\([0-9.]*\).*/\1/'); LG=$(echo "$R" | sed 's/.*lagged10m=\([0-9]*\).*/\1/'); DD=$(echo "$R" | sed 's/.*dead10m=\([0-9]*\).*/\1/'); DUP=$(echo "$R" | sed 's/.*closer_dup10m=\([0-9]*\).*/\1/')
awk "BEGIN{exit !(${PD:-0} > 4)}" && br "PDROP ${PD}% (>4%)"; [ $(( ${LG:-0} + ${DD:-0} )) -gt 30 ] && br "lagged+dead agents $((LG+DD)) in 10 min"; [ "${DUP:-0}" -gt 0 ] && br "duplicate closer_log uniqueid: $DUP"
if [ -n "$B" ]; then echo -e "BREACHES:$B"; else echo "BREACHES: none"; fi
