#!/bin/bash
# MEMORY-table / flush health check for VICIdial db primary. Run every minute from cron on the primary only.
# Writes one CSV line to /var/log/astguiclient/flushmon.csv and an ALERT line to /var/log/astguiclient/flushmon-alerts.log
# (hook it to mail/Slack as needed). Thresholds are arguments or defaults.
MAXAGE=${1:-540}      # oldest vicidial_manager row (any status): rows live up to retention(240)+cadence(240) = 480 s just before a flush; alert above 540
MAXNEW=${2:-30}       # oldest PENDING (status NEW) manager command, seconds: normally < 2 s (AST_manager_send drains instantly)
MAXFLUSH=${3:-360}    # seconds since the last successful AST_flush_DBqueue.pl run (cron is every 4 min)
MAXRUN=${4:-60}       # flush runtime, seconds (measured 0-1 s on the 10-box); a run near 240 s would overlap the next cron
CAPPCT=${5:-70}       # % of the table's own max_data_length used (MEMORY tables carry the limit they were created with)
OUT=/var/log/astguiclient/flushmon.csv; AL=/var/log/astguiclient/flushmon-alerts.log
Q() { mysql -N asterisk -e "$1" 2>/dev/null; }
NOW=$(date '+%Y-%m-%d %H:%M:%S')
read MROWS MAGE MNEW MNEWAGE <<< "$(Q "SELECT COUNT(*), IFNULL(MAX(TIMESTAMPDIFF(SECOND,entry_date,NOW())),0), SUM(status='NEW'), IFNULL(MAX(IF(status='NEW',TIMESTAMPDIFF(SECOND,entry_date,NOW()),0)),0) FROM vicidial_manager" | tr '\t' ' ')"
read LROWS <<< "$(Q "SELECT COUNT(*) FROM vicidial_live_agents")"
read LASTFLUSH FLUSHRUN <<< "$(Q "SELECT IFNULL(TIMESTAMPDIFF(SECOND,db_time,NOW()),99999), IFNULL(CAST(REPLACE(stage,'Run seconds: ','') AS UNSIGNED),0) FROM vicidial_internal_log WHERE process='AST_flush_DBqueue.pl' AND action='finished' ORDER BY db_time DESC LIMIT 1" | tr '\t' ' ')"
FLUSHPROCS=$(pgrep -fc 'AST_flush_DBqueue[.]pl')
CAP=$(Q "SELECT GROUP_CONCAT(CONCAT(table_name,'=',ROUND(100*(data_length+index_length)/NULLIF(max_data_length,0)),'%') SEPARATOR ' ') FROM information_schema.tables WHERE table_schema='asterisk' AND engine='MEMORY' AND table_name IN ('vicidial_live_agents','vicidial_manager')")
MAXPCT=$(Q "SELECT IFNULL(MAX(ROUND(100*(data_length+index_length)/NULLIF(max_data_length,0))),0) FROM information_schema.tables WHERE table_schema='asterisk' AND engine='MEMORY' AND table_name IN ('vicidial_live_agents','vicidial_manager')")
FULLERR=$(grep -c "is full" /var/log/astguiclient/*.$(date +%Y-%m-%d) 2>/dev/null | awk -F: '{s+=$2} END {print s+0}')
echo "$NOW,$MROWS,$MAGE,$MNEW,$MNEWAGE,$LROWS,$LASTFLUSH,$FLUSHRUN,$FLUSHPROCS,$MAXPCT,$FULLERR,$CAP" >> $OUT
A=""
[ "$MAGE" -gt "$MAXAGE" ] && A="$A oldest_manager_row=${MAGE}s>${MAXAGE};"
[ "$MNEWAGE" -gt "$MAXNEW" ] && A="$A oldest_PENDING_command=${MNEWAGE}s>${MAXNEW} (manager_send stalled?);"
[ "$LASTFLUSH" -gt "$MAXFLUSH" ] && A="$A last_flush=${LASTFLUSH}s_ago>${MAXFLUSH} (cron missed/stalled);"
[ "$FLUSHRUN" -gt "$MAXRUN" ] && A="$A flush_runtime=${FLUSHRUN}s>${MAXRUN};"
[ "$FLUSHPROCS" -gt 1 ] && A="$A flush_overlap=${FLUSHPROCS}_processes;"
[ "$MAXPCT" -gt "$CAPPCT" ] && A="$A memory_table_capacity=${MAXPCT}%>${CAPPCT}% ($CAP);"
[ "$FULLERR" -gt 0 ] && A="$A table_full_errors_in_daemon_logs=$FULLERR;"
[ -n "$A" ] && echo "$NOW ALERT$A" >> $AL
exit 0
