#!/bin/bash
# ============================================================================
# GenX load-test monitor. Run ON the admin box during a test.
# Every 10s: agent states, live calls per dialer, hopper depth, DB thread/
# slow-query counters, per-box sysload (servers table heartbeats), genx-ui RSS
# and /api/health latency, and LOADTEST call outcomes so far.
# CSV -> /tmp/genx-loadtest-monitor.csv, human line -> stdout.
# ============================================================================
set -u
DBHOST=$(awk -F'=> ' '/^VARDB_server/{print $2}' /etc/astguiclient.conf)
DBUSER=$(awk -F'=> ' '/^VARDB_user/{print $2}' /etc/astguiclient.conf)
DBPASS=$(awk -F'=> ' '/^VARDB_pass/{print $2}' /etc/astguiclient.conf)
M() { mysql -h "$DBHOST" -u "$DBUSER" -p"$DBPASS" asterisk -N -e "$1" 2>/dev/null; }
CSV=/tmp/genx-loadtest-monitor.csv
START_SQL=$(date '+%Y-%m-%d %H:%M:%S')

echo "ts,agents_ready,agents_incall,agents_paused,agents_queue,live_calls,calls_sip1,calls_sip2,calls_sip3,hopper,threads_conn,threads_run,slow_q,tlock_waited,load_sip1,load_sip2,load_sip3,load_db1,genx_rss_mb,health_ms,lt_calls,lt_drops" > "$CSV"
echo "monitor started $START_SQL (baseline for LOADTEST call counts)"

SLOW0=$(M "SHOW GLOBAL STATUS LIKE 'Slow_queries'" | awk '{print $2}')
TLOCK0=$(M "SHOW GLOBAL STATUS LIKE 'Table_locks_waited'" | awk '{print $2}')
while true; do
  TS=$(date '+%H:%M:%S')
  read -r READY INCALL PAUSED QUEUE <<< "$(M "SELECT
    SUM(status='READY'), SUM(status='INCALL'), SUM(status='PAUSED'), SUM(status='QUEUE')
    FROM vicidial_live_agents" | awk '{print $1, $2, $3, $4}')"
  read -r C1 C2 C3 CT <<< "$(M "SELECT
    SUM(server_ip='74.208.179.214'), SUM(server_ip='62.151.183.120'), SUM(server_ip='62.151.183.71'), COUNT(*)
    FROM vicidial_auto_calls" | awk '{print $1, $2, $3, $4}')"
  HOPPER=$(M "SELECT COUNT(*) FROM vicidial_hopper WHERE campaign_id='LOADTEST'")
  read -r TCONN TRUN <<< "$(M "SHOW GLOBAL STATUS WHERE Variable_name IN ('Threads_connected','Threads_running')" | awk '{print $2}' | paste -sd' ')"
  SLOW=$(( $(M "SHOW GLOBAL STATUS LIKE 'Slow_queries'" | awk '{print $2}') - ${SLOW0:-0} ))
  TLOCK=$(( $(M "SHOW GLOBAL STATUS LIKE 'Table_locks_waited'" | awk '{print $2}') - ${TLOCK0:-0} ))
  read -r L1 L2 L3 LDB <<< "$(M "SELECT
    MAX(CASE WHEN server_ip='74.208.179.214' THEN sysload END),
    MAX(CASE WHEN server_ip='62.151.183.120' THEN sysload END),
    MAX(CASE WHEN server_ip='62.151.183.71' THEN sysload END),
    MAX(CASE WHEN server_ip='198.71.60.189' THEN sysload END) FROM servers" | awk '{print $1, $2, $3, $4}')"
  RSS=$(( $(ps -o rss= -C node 2>/dev/null | sort -rn | head -1 | tr -d ' ' || echo 0) / 1024 ))
  T0=$(date +%s%3N)
  curl -so /dev/null -m 5 "http://127.0.0.1:3200/api/health" || true
  HMS=$(( $(date +%s%3N) - T0 ))
  read -r LTCALLS LTDROPS <<< "$(M "SELECT COUNT(*), SUM(status='DROP')
    FROM vicidial_log WHERE campaign_id='LOADTEST' AND call_date >= '$START_SQL'" | awk '{print $1, $2}')"
  LINE="$TS,${READY:-0},${INCALL:-0},${PAUSED:-0},${QUEUE:-0},${CT:-0},${C1:-0},${C2:-0},${C3:-0},${HOPPER:-0},${TCONN:-0},${TRUN:-0},${SLOW:-0},${TLOCK:-0},${L1:-0},${L2:-0},${L3:-0},${LDB:-0},${RSS:-0},${HMS:-0},${LTCALLS:-0},${LTDROPS:-0}"
  echo "$LINE" >> "$CSV"
  echo "$TS agents R/I/P/Q=${READY:-0}/${INCALL:-0}/${PAUSED:-0}/${QUEUE:-0} calls=${CT:-0} (s1=${C1:-0} s2=${C2:-0} s3=${C3:-0}) hopper=${HOPPER:-0} db=${TCONN:-0}c/${TRUN:-0}r slow+${SLOW:-0} tlockw+${TLOCK:-0} load s1/s2/s3/db1=${L1:-0}/${L2:-0}/${L3:-0}/${LDB:-0} genx=${RSS:-0}MB health=${HMS:-0}ms LT calls=${LTCALLS:-0} drops=${LTDROPS:-0}"
  sleep 10
done
