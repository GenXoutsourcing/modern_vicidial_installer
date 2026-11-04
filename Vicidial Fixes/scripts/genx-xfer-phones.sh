#!/bin/bash
# GenX 2026-11-04 (Aragon db1): phone numbers with an XFER call in the last 30 days, for the lead filters'
# "no XFER in 30 days" rule. Replaces the filters' NOT EXISTS subquery on vicidial_log, which locked the
# dialers every hopper run (and only saw today's calls, since vicidial_log is archived daily).
#   init  - load 30 days from vicidial_log_archive + vicidial_log (one-time; reads the archive, ~1-2 min)
#   inc   - upsert XFER calls from the last 90 min of vicidial_log (cron every 5 min; call_date index range)
#   purge - delete numbers whose last XFER is older than 30 days (cron nightly)
# Writes use binlog_format=ROW so db2 applies rows instead of re-running the SELECTs.
set -euo pipefail
exec 9>/run/genx-xfer-phones.lock
flock -n 9 || exit 0
M="mysql asterisk -N"
LOG=/var/log/astguiclient/genx-xfer-phones.log

$M -e "CREATE TABLE IF NOT EXISTS genx_xfer_phones (
  phone_number VARCHAR(18) NOT NULL PRIMARY KEY,
  last_xfer DATETIME NOT NULL,
  KEY last_xfer (last_xfer)
) ENGINE=InnoDB COMMENT='GenX: phones with an XFER in the last 30 days (lead filter lookup)'"

upsert() {  # $1 = source table, $2 = call_date lower bound expression
  $M -e "SET SESSION binlog_format=ROW;
  INSERT INTO genx_xfer_phones (phone_number, last_xfer)
    SELECT phone_number, MAX(call_date) FROM $1
    WHERE call_date >= $2 AND status='XFER' AND phone_number<>''
    GROUP BY phone_number
  ON DUPLICATE KEY UPDATE last_xfer = GREATEST(genx_xfer_phones.last_xfer, VALUES(last_xfer));
  SELECT ROW_COUNT();"
}

case "${1:-inc}" in
  init)  a=$(upsert vicidial_log_archive "NOW() - INTERVAL 30 DAY"); b=$(upsert vicidial_log "NOW() - INTERVAL 30 DAY"); msg="init archive=$a live=$b" ;;
  inc)   b=$(upsert vicidial_log "NOW() - INTERVAL 90 MINUTE"); msg="inc live=$b" ;;
  purge) d=$($M -e "SET SESSION binlog_format=ROW; DELETE FROM genx_xfer_phones WHERE last_xfer < NOW() - INTERVAL 30 DAY; SELECT ROW_COUNT();"); msg="purge deleted=$d" ;;
esac
echo "$(date '+%F %T') $msg total=$($M -e 'select count(*) from genx_xfer_phones')" >> $LOG
