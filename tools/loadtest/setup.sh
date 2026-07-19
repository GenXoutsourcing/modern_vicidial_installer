#!/bin/bash
# ============================================================================
# GenX load-test fixture setup. Run ON the admin web box (has cron DB creds).
# Creates (all removable by teardown.sh):
#   - user group LOADTEST (scoped to the LOADTEST campaign, no forced timeclock)
#   - users   LT101-LT110 (webphone tier)  pass GxLoad<user>
#             LT201-LT215 (protocol tier)  pass GxLoad<user>
#   - phones  LT101-LT110: real WEBRTC webphones (cloned from phone 9176)
#             LT201-LT215: EXTERNAL/Local auto-answer legs (dialplan-served)
#             spread across the 3 telephony boxes
#   - campaign LOADTEST (clone of TESTCAMP): RATIO 2.0, dial_prefix 77,
#     24hours call time, ALLCALLS recording, URL hooks -> sink.php
#   - list 601 + N leads (phones 812556xxxx -> sink dialplan)
#   - sink.php + /var/log/genx-loadtest
# Then flags rebuild_conf_files so the new SIP peers regenerate.
# Dialplan on the sip boxes is installed separately (see README).
# ============================================================================
set -euo pipefail

LEADS="${LEADS:-5000}"
SINK_BASE="${SINK_BASE:-https://admin.viciboxclone.genxcontactcenter.com/genxapi/sink.php}"
SIP_BOXES=("74.208.179.214" "62.151.183.120" "62.151.183.71")

DBHOST=$(awk -F'=> ' '/^VARDB_server/{print $2}' /etc/astguiclient.conf)
DBUSER=$(awk -F'=> ' '/^VARDB_user/{print $2}' /etc/astguiclient.conf)
DBPASS=$(awk -F'=> ' '/^VARDB_pass/{print $2}' /etc/astguiclient.conf)
M() { mysql -h "$DBHOST" -u "$DBUSER" -p"$DBPASS" asterisk -N -e "$1"; }

echo "== user group LOADTEST =="
M "INSERT IGNORE INTO vicidial_user_groups (user_group, group_name, allowed_campaigns, forced_timeclock_login)
   VALUES ('LOADTEST', 'Load Test Agents', ' LOADTEST -', 'N')"

echo "== users =="
for i in $(seq 101 110) $(seq 201 215); do
  U="LT$i"
  M "INSERT IGNORE INTO vicidial_users (user, pass, full_name, user_level, user_group, phone_login, phone_pass, active)
     VALUES ('$U', 'GxLoad$U', 'Load Test Agent $i', 1, 'LOADTEST', '$U', 'GxLoad$U', 'Y')"
done

echo "== phones (clone webphone 9176 per box) =="
# webphone tier LT101-110: 4 on sip1, 3 on sip2, 3 on sip3
# protocol tier LT201-215: 5 per box
phone_box() { # $1 = index within its tier, $2 = tier (1|2)
  if [ "$2" = "1" ]; then
    case $(( ($1 - 101) % 10 )) in
      0|1|2|3) echo "${SIP_BOXES[0]}";; 4|5|6) echo "${SIP_BOXES[1]}";; *) echo "${SIP_BOXES[2]}";;
    esac
  else
    echo "${SIP_BOXES[$(( ($1 - 201) / 5 ))]}"
  fi
}

for i in $(seq 101 110); do
  U="LT$i"; BOX=$(phone_box "$i" 1); SECRET=$(head -c 10 /dev/urandom | od -An -tx1 | tr -d ' \n')
  M "CREATE TEMPORARY TABLE _ltphone AS SELECT * FROM phones WHERE login='9176' AND server_ip='$BOX' LIMIT 1;
     UPDATE _ltphone SET login='$U', pass='GxLoad$U', extension='$U', dialplan_number='$U',
       voicemail_id='$U', conf_secret='$SECRET', fullname='Load Test Webphone $i',
       phone_ip='', computer_ip='', messages=0, old_messages=0;
     INSERT INTO phones SELECT * FROM _ltphone;
     DROP TEMPORARY TABLE _ltphone;"
done

for i in $(seq 201 215); do
  U="LT$i"; BOX=$(phone_box "$i" 2)
  M "CREATE TEMPORARY TABLE _ltphone AS SELECT * FROM phones WHERE login='9176' AND server_ip='$BOX' LIMIT 1;
     UPDATE _ltphone SET login='$U', pass='GxLoad$U', extension='$U', dialplan_number='$U',
       voicemail_id='$U', conf_secret='GxLoad$U', fullname='Load Test Local Leg $i',
       protocol='EXTERNAL', template_id='', webphone_settings='', webphone_auto_answer='N',
       phone_ip='', computer_ip='', messages=0, old_messages=0;
     INSERT INTO phones SELECT * FROM _ltphone;
     DROP TEMPORARY TABLE _ltphone;"
done

echo "== campaign LOADTEST (clone of TESTCAMP) =="
M "CREATE TEMPORARY TABLE _ltcamp AS SELECT * FROM vicidial_campaigns WHERE campaign_id='TESTCAMP' LIMIT 1;
   UPDATE _ltcamp SET campaign_id='LOADTEST', campaign_name='Load Test (simulated)', active='Y',
     dial_method='RATIO', auto_dial_level='2.0', dial_timeout=25, dial_prefix='77', omit_phone_code='Y',
     local_call_time='24hours', dial_statuses=' NEW -', hopper_level=200, campaign_cid='8125551000',
     campaign_recording='ALLCALLS', campaign_allow_inbound='N', use_internal_dnc='N', use_campaign_dnc='N',
     campaign_calldate=NOW(),
     start_call_url='${SINK_BASE}?type=start&lead_id=--A--lead_id--B--&uniqueid=--A--uniqueid--B--&campaign=--A--campaign--B--&phone=--A--phone_number--B--',
     dispo_call_url='${SINK_BASE}?type=dispo&lead_id=--A--lead_id--B--&uniqueid=--A--uniqueid--B--&campaign=--A--campaign--B--&dispo=--A--dispo--B--&talk=--A--talk_time--B--',
     na_call_url='${SINK_BASE}?type=na&lead_id=--A--lead_id--B--&uniqueid=--A--uniqueid--B--&campaign=--A--campaign--B--&dispo=--A--dispo--B--';
   INSERT INTO vicidial_campaigns SELECT * FROM _ltcamp;
   DROP TEMPORARY TABLE _ltcamp;"

echo "== list 601 + $LEADS leads =="
M "INSERT IGNORE INTO vicidial_lists (list_id, list_name, campaign_id, active, list_description)
   VALUES (601, 'Load Test Leads', 'LOADTEST', 'Y', 'Simulated leads dialed into the genx-loadtest sink dialplan')"
BATCH=""
N=0
for i in $(seq 1 "$LEADS"); do
  P=$(printf '812556%04d' $(( (i - 1) % 10000 )))
  E=$(( (i - 1) / 10000 ))
  # >10k leads roll the exchange so numbers stay unique
  if [ "$E" -gt 0 ]; then P=$(printf '81255%d%04d' $(( 6 + E )) $(( (i - 1) % 10000 ))); fi
  BATCH="$BATCH,( 601, 'NEW', '1', '$P', 'LoadTest', 'Lead $i', 'N', NOW(), '-5' )"
  N=$((N + 1))
  if [ "$N" -ge 500 ]; then
    M "INSERT INTO vicidial_list (list_id, status, phone_code, phone_number, first_name, last_name, called_since_last_reset, entry_date, gmt_offset_now) VALUES ${BATCH:1}"
    BATCH=""; N=0
  fi
done
if [ -n "$BATCH" ]; then
  M "INSERT INTO vicidial_list (list_id, status, phone_code, phone_number, first_name, last_name, called_since_last_reset, entry_date, gmt_offset_now) VALUES ${BATCH:1}"
fi

echo "== GENXLOOP SIP loopback carrier (all telephony boxes) =="
M "INSERT INTO vicidial_server_carriers (carrier_id, carrier_name, registration_string, template_id, account_entry, protocol, globals_string, dialplan_entry, server_ip, active, carrier_description, user_group)
   SELECT 'GENXLOOP', 'Load Test Loopback', '', '',
     '[GENXLOOP]\ndisallow=all\nallow=ulaw\ntype=friend\nhost=127.0.0.1\ndirectmedia=no\ninsecure=port,invite\ncontext=genx-loadtest-behave\nqualify=no',
     'SIP', '', '', '0.0.0.0', 'Y', 'TEMPORARY load-test loopback peer - removed by tools/loadtest/teardown.sh', '---ALL---'
   FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM vicidial_server_carriers WHERE carrier_id='GENXLOOP')"

echo "== sink.php + log dir =="
mkdir -p /var/log/genx-loadtest
chown apache:apache /var/log/genx-loadtest
cp "$(dirname "$0")/sink.php" /var/www/html/genxapi/sink.php

echo "== flag conf rebuild on telephony boxes =="
M "UPDATE servers SET rebuild_conf_files='Y' WHERE active_asterisk_server='Y'"

echo "== summary =="
M "SELECT COUNT(*) AS lt_users FROM vicidial_users WHERE user LIKE 'LT1%' OR user LIKE 'LT2%';
   SELECT server_ip, protocol, COUNT(*) FROM phones WHERE login LIKE 'LT%' GROUP BY server_ip, protocol;
   SELECT campaign_id, active, dial_method, auto_dial_level, dial_prefix FROM vicidial_campaigns WHERE campaign_id='LOADTEST';
   SELECT COUNT(*) AS leads FROM vicidial_list WHERE list_id=601;"
echo "setup complete"
