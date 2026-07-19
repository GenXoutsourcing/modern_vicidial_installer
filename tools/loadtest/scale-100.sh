#!/bin/bash
# ============================================================================
# Scale the load-test fixtures from the 25-agent pilot to 100 agents.
# Run ON the admin box AFTER setup.sh. Adds (all covered by teardown.sh):
#   - users + EXTERNAL/Local phones LT216-LT290 (25 more per telephony box)
#   - 95,000 more leads in list 601 (phones 8125700000+, clear of earlier ranges)
#   - hopper_level 500 on LOADTEST
# 100-agent run = 10 webphone (LT101-110) + 90 protocol (LT201-LT290).
# ============================================================================
set -euo pipefail
SIP_BOXES=("74.208.179.214" "62.151.183.120" "62.151.183.71")

DBHOST=$(awk -F'=> ' '/^VARDB_server/{print $2}' /etc/astguiclient.conf)
DBUSER=$(awk -F'=> ' '/^VARDB_user/{print $2}' /etc/astguiclient.conf)
DBPASS=$(awk -F'=> ' '/^VARDB_pass/{print $2}' /etc/astguiclient.conf)
M() { mysql -h "$DBHOST" -u "$DBUSER" -p"$DBPASS" asterisk -N -e "$1"; }

echo "== users + phones LT216-LT290 =="
for i in $(seq 216 290); do
  U="LT$i"
  BOX="${SIP_BOXES[$(( (i - 216) % 3 ))]}"
  M "INSERT IGNORE INTO vicidial_users (user, pass, full_name, user_level, user_group, phone_login, phone_pass, active)
     VALUES ('$U', 'GxLoad$U', 'Load Test Agent $i', 1, 'LOADTEST', '$U', 'GxLoad$U', 'Y')"
  EXISTS=$(M "SELECT COUNT(*) FROM phones WHERE login='$U'")
  if [ "$EXISTS" = "0" ]; then
    M "CREATE TEMPORARY TABLE _ltphone AS SELECT * FROM phones WHERE login='9176' AND server_ip='$BOX' LIMIT 1;
       UPDATE _ltphone SET login='$U', pass='GxLoad$U', extension='$U', dialplan_number='$U',
         voicemail_id='$U', conf_secret='GxLoad$U', fullname='Load Test Local Leg $i',
         protocol='EXTERNAL', template_id='', webphone_settings='', webphone_auto_answer='N',
         phone_ip='', computer_ip='', messages=0, old_messages=0;
       INSERT INTO phones SELECT * FROM _ltphone;
       DROP TEMPORARY TABLE _ltphone;"
  fi
done

echo "== +95k leads (8125700000+) =="
HAVE=$(M "SELECT COUNT(*) FROM vicidial_list WHERE list_id=601 AND phone_number >= '8125700000'")
if [ "$HAVE" -lt 95000 ]; then
  BATCH=""; N=0
  for i in $(seq 1 95000); do
    P=$(( 8125700000 + i ))
    BATCH="$BATCH,( 601, 'NEW', '1', '$P', 'LoadTest', 'ScaleLead $i', 'N', NOW(), '-5' )"
    N=$((N + 1))
    if [ "$N" -ge 1000 ]; then
      M "INSERT INTO vicidial_list (list_id, status, phone_code, phone_number, first_name, last_name, called_since_last_reset, entry_date, gmt_offset_now) VALUES ${BATCH:1}"
      BATCH=""; N=0
    fi
  done
  [ -n "$BATCH" ] && M "INSERT INTO vicidial_list (list_id, status, phone_code, phone_number, first_name, last_name, called_since_last_reset, entry_date, gmt_offset_now) VALUES ${BATCH:1}"
fi

echo "== campaign tuning =="
M "UPDATE vicidial_campaigns SET hopper_level=500 WHERE campaign_id='LOADTEST'"
M "UPDATE servers SET rebuild_conf_files='Y' WHERE active_asterisk_server='Y'"

echo "== summary =="
M "SELECT COUNT(*) AS lt_users FROM vicidial_users WHERE user LIKE 'LT2__';
   SELECT server_ip, COUNT(*) FROM phones WHERE login LIKE 'LT2__' GROUP BY server_ip;
   SELECT COUNT(*) AS leads FROM vicidial_list WHERE list_id=601 AND status='NEW'"
echo "scale-100 complete"
