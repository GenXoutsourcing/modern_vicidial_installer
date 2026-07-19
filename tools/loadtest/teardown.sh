#!/bin/bash
# ============================================================================
# GenX load-test teardown. Run ON the admin box.
# Removes every fixture setup.sh created. Call logs / agent logs / recordings
# from the runs are KEPT for analysis unless --purge-logs is passed.
# Dialplan + leftover channels on the sip boxes are cleaned separately
# (see README "Teardown" — needs ssh to the telephony boxes).
# ============================================================================
set -euo pipefail
PURGE_LOGS=0
[ "${1:-}" = "--purge-logs" ] && PURGE_LOGS=1

DBHOST=$(awk -F'=> ' '/^VARDB_server/{print $2}' /etc/astguiclient.conf)
DBUSER=$(awk -F'=> ' '/^VARDB_user/{print $2}' /etc/astguiclient.conf)
DBPASS=$(awk -F'=> ' '/^VARDB_pass/{print $2}' /etc/astguiclient.conf)
M() { mysql -h "$DBHOST" -u "$DBUSER" -p"$DBPASS" asterisk -N -e "$1"; }

echo "== live/session state =="
M "DELETE FROM vicidial_live_agents WHERE user LIKE 'LT1__' OR user LIKE 'LT2__'"
M "DELETE FROM vicidial_session_data WHERE user LIKE 'LT1__' OR user LIKE 'LT2__'"
M "DELETE FROM web_client_sessions WHERE extension LIKE 'LT___'"
M "UPDATE vicidial_confbridges SET extension='', leave_3way='0' WHERE extension LIKE '%/LT___'"
M "DELETE FROM vicidial_hopper WHERE campaign_id='LOADTEST'"
M "DELETE FROM vicidial_auto_calls WHERE campaign_id='LOADTEST'"

echo "== fixtures =="
M "DELETE FROM vicidial_users WHERE user LIKE 'LT1__' OR user LIKE 'LT2__'"
M "DELETE FROM phones WHERE login LIKE 'LT___'"
M "DELETE FROM vicidial_campaign_agents WHERE campaign_id='LOADTEST'"
M "DELETE FROM vicidial_campaigns WHERE campaign_id='LOADTEST'"
M "DELETE FROM vicidial_list WHERE list_id=601"
M "DELETE FROM vicidial_lists WHERE list_id=601"
M "DELETE FROM vicidial_user_groups WHERE user_group='LOADTEST'"
M "DELETE FROM vicidial_callbacks WHERE campaign_id='LOADTEST'"

if [ "$PURGE_LOGS" = "1" ]; then
  echo "== purging run logs =="
  M "DELETE FROM vicidial_log WHERE campaign_id='LOADTEST'"
  M "DELETE FROM vicidial_agent_log WHERE campaign_id='LOADTEST'"
  M "DELETE FROM vicidial_dial_log WHERE caller_code LIKE '%LOADTEST%'"
  M "DELETE FROM vicidial_user_log WHERE user LIKE 'LT1__' OR user LIKE 'LT2__'"
  M "DELETE FROM vicidial_timeclock_log WHERE user LIKE 'LT1__' OR user LIKE 'LT2__'"
  M "DELETE FROM vicidial_url_log WHERE campaign_id='LOADTEST'"
  M "DELETE rl FROM recording_log rl JOIN vicidial_log vl ON vl.uniqueid=rl.vicidial_id WHERE vl.campaign_id='LOADTEST'"
  M "DELETE FROM vicidial_call_notes WHERE call_notes LIKE 'loadtest note %'"
fi

echo "== admin-box files =="
rm -f /var/www/html/genxapi/sink.php
echo "(sink log kept at /var/log/genx-loadtest/sink.log — remove manually if done)"

echo "== flag conf rebuild (drops LT SIP peers) =="
M "UPDATE servers SET rebuild_conf_files='Y' WHERE active_asterisk_server='Y'"

echo "teardown complete. Remaining: dialplan + channel cleanup on sip boxes (README)."
