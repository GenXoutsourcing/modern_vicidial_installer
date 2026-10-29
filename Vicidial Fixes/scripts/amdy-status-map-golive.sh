#!/bin/bash
# aragon_amd_golive.sh - GenX 2026-10-28 - AMDY status map on Aragon db1 (r4035 / schema 1747), clone of the ResponseBPO go-live.
#   Scope: amd_type=AMD on vdad exten 8369 (stock AMD) or 8370 (AMDY) = 16 campaigns. Carrier CR* map already live since 18:27,
#   so the carrier cron is NOT touched. NOTSURE no-audio mapped under both old (NO_AUDIO_TIMEOUT) and new (NOAUDIODATA) amd.py names.
#   Copy to /root/amdy-status-map-golive.sh on the DB primary.  Preview: bash /root/amdy-status-map-golive.sh --preview
set -e
SCRIPT=/usr/local/bin/genx-carrier-status-map.pl
PREVIEW=0; [ "$1" = "--preview" ] && PREVIEW=1
D=/root/amd_map_rollback_$(date +%Y%m%d_%H%M%S)
AA_TOKENS="AAVM AAVMCR AAVMFL AASCRN AAFAS AARING AAIVR AASIL AANS"
RECYCLE_WITH_NA="CRCONG"; RECYCLE_WITH_AB="CRSPAM"
SCOPE="amd_type='AMD' AND campaign_vdad_exten IN (8369,8370)"
[ -x $SCRIPT ] || { echo "$SCRIPT missing/not executable"; exit 1; }
perl -c $SCRIPT

echo "== 0. preview of what would change"
mysql asterisk -e "SELECT campaign_id,active,campaign_vdad_exten,amd_status_map,LENGTH(dial_statuses) len_now,
  LENGTH(CONCAT(TRIM(TRAILING '-' FROM dial_statuses),'$AA_TOKENS -',
    IF(dial_statuses LIKE '% NA %','$RECYCLE_WITH_NA -',''),IF(dial_statuses LIKE '% AB %','$RECYCLE_WITH_AB -',''))) len_after
  FROM vicidial_campaigns WHERE $SCOPE ORDER BY active DESC, campaign_id"
mysql asterisk -N -e "SELECT CONCAT('   statuses already present: ',COUNT(*),'/17') FROM vicidial_statuses WHERE status IN ('AAVM','AAVMCR','AAVMFL','AASCRN','AAFAS','AADISC','AARING','AAIVR','AASIL','AAHONY','AANS','CRSPAM','CRFAS','CRHONY','CRINVL','CRUNRS','CRCONG')"
mysql asterisk -N -e "SELECT CONCAT('   AA rows today that would have been split: ',COUNT(*)) FROM vicidial_log WHERE call_date>CURDATE() AND status='AA'"
[ $PREVIEW = 1 ] && { echo "PREVIEW ONLY - nothing changed"; exit 0; }

mkdir -p $D
echo "== 1. snapshot -> $D"
crontab -l > $D/crontab.before
mysqldump asterisk vicidial_statuses --skip-extended-insert > $D/vicidial_statuses.sql
mysqldump asterisk vicidial_settings_containers --skip-extended-insert --where="container_type IN ('AMD_STATUS_MAP','AMD_AGENT_OPTIONS')" > $D/amd_containers.sql
mysql asterisk -N -e "SELECT CONCAT('UPDATE vicidial_campaigns SET dial_statuses=',QUOTE(dial_statuses),', amd_status_map=',QUOTE(amd_status_map),' WHERE campaign_id=',QUOTE(campaign_id),';') FROM vicidial_campaigns" > $D/restore_campaigns.sql
[ $(wc -l < $D/restore_campaigns.sql) -ge 5 ] || { echo "campaign snapshot looks wrong, abort"; exit 1; }
echo "   $(wc -l < $D/restore_campaigns.sql) campaign rows snapshotted"

echo "== 2. length pre-check (longest dial_statuses + new tokens must stay <= 255)"
MAXLEN=$(mysql asterisk -N -e "SELECT MAX(LENGTH(dial_statuses)) FROM vicidial_campaigns WHERE $SCOPE")
NEED=$(( ${#AA_TOKENS} + 1 + ${#RECYCLE_WITH_NA} + 1 + ${#RECYCLE_WITH_AB} + 2 ))
echo "   max=$MAXLEN need=+$NEED"
[ $(( MAXLEN + NEED )) -le 255 ] || { echo "would exceed 255, abort"; exit 1; }

echo "== 3. create 11 AA* + 6 CR* system statuses (INSERT IGNORE; never deleted)"
mysql asterisk -e "INSERT IGNORE INTO vicidial_statuses (status,status_name,selectable,human_answered,category,sale,dnc,customer_contact,not_interested,unworkable,scheduled_callback,completed,min_sec,max_sec,answering_machine) VALUES
('AAVM','AM Voicemail Greeting','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('AAVMCR','AM Carrier Voicemail','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('AAVMFL','AM Mailbox Full/Not Setup','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('AASCRN','AM Call Screener/Blocker','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('AAFAS','AM False Answer','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('AADISC','AM Disconnected Intercept','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('AARING','AM Ring/Busy After Answer','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('AAIVR','AM IVR or Music','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('AASIL','AM Silence After Answer','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('AAHONY','AM Honeypot','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('AANS','AMD Not Sure','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('CRSPAM','Carrier Declined 603 SPAM DID','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('CRFAS','Carrier 403 FAS Block','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('CRHONY','Carrier 403 Honeypot','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('CRINVL','Carrier 403/404 Invalid Number','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('CRUNRS','Carrier 403 Unresponsive','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N'),
('CRCONG','Carrier 503 Congestion','N','N','UNDEFINED','N','N','N','N','N','N','N',0,0,'N');"
mysql asterisk -N -e "SELECT CONCAT('   statuses present: ',COUNT(*),'/17') FROM vicidial_statuses WHERE status IN ('AAVM','AAVMCR','AAVMFL','AASCRN','AAFAS','AADISC','AARING','AAIVR','AASIL','AAHONY','AANS','CRSPAM','CRFAS','CRHONY','CRINVL','CRUNRS','CRCONG')"

echo "== 4. AMDY_status_map container"
mysql asterisk -e "INSERT INTO vicidial_settings_containers (container_id,container_notes,container_type,user_group,container_entry) VALUES
('AMDY_status_map','AMDY class to status map - GenX 2026-10-28 Aragon (cloned from ResponseBPO/WGL/MeetingsTech)','AMD_STATUS_MAP','---ALL---',
'; AMD status map for AMDY - AMDSTATUS,AMDRESPONSE => STATUS
; exact line beats wildcard; spaces and ;comments are stripped by the parser
MACHINE,* => AA
; --- generic voicemail greeting ---
MACHINE,VOICEMAILAMD => AAVM
MACHINE,VOICEMAILV2AMD => AAVM
MACHINE,CUSTOMVMAMD => AAVM
MACHINE,WELCOMEVMAMD => AAVM
MACHINE,HELLOMSGAMD => AAVM
MACHINE,THANKYOUAMD => AAVM
MACHINE,BEEPAMD => AAVM
MACHINE,SPANISHAMD => AAVM
MACHINE,AMD => AAVM
MACHINE,OTHERAMD => AAVM
; --- stock Asterisk AMD() causes (8369 campaigns, and the 8370 fallback on AMDY connection error) ---
MACHINE,LONGGREETING => AAVM
MACHINE,MAXWORDS => AAVM
MACHINE,MAXWORDLENGTH => AAVM
MACHINE,TOOLONG => AAVM
MACHINE,INITIALSILENCE => AAVM
; --- carrier / platform voicemail ---
MACHINE,PLVMSAMD => AAVMCR
MACHINE,VERIZONAMD => AAVMCR
MACHINE,TELAMD => AAVMCR
MACHINE,YOUMAILAMD => AAVMCR
MACHINE,ESFWDVMAMD => AAVMCR
MACHINE,GOOGLESUBAMD => AAVMCR
MACHINE,MAGICJACKAMD => AAVMCR
; --- mailbox full / not set up / cannot take message ---
MACHINE,MAILBOXFULLAMD => AAVMFL
MACHINE,CANTLEAVEAMD => AAVMFL
MACHINE,CANTTAKEAMD => AAVMFL
MACHINE,VMNOTSETUPAMD => AAVMFL
; --- call screening / spam blockers ---
MACHINE,CALLGUARDIPHONEAMD => AASCRN
MACHINE,CALLASSISTSCRNAMD => AASCRN
MACHINE,CALLASSISTAMD => AASCRN
MACHINE,HIYASCRNAMD => AASCRN
MACHINE,NOMOROBOAMD => AASCRN
MACHINE,SMARTBLKAMD => AASCRN
MACHINE,ALLSTATEBLKAMD => AASCRN
MACHINE,LADYBOTAMD => AASCRN
MACHINE,CALLRECAMD => AASCRN
; --- false answer supervision ---
MACHINE,FASAMD => AAFAS
MACHINE,FAS2AMD => AAFAS
MACHINE,FASV3AMD => AAFAS
MACHINE,FASV4AMD => AAFAS
MACHINE,FASRECLINEAMD => AAFAS
MACHINE,HELLOFASAMD => AAFAS
; --- disconnected / intercept recordings ---
MACHINE,DISCONNECTEDAMD => AADISC
MACHINE,SUBNOTAVAILAMD => AADISC
MACHINE,NETWORKAMD => AADISC
MACHINE,NUMBERSAMD => AADISC
; --- ring / busy tone after answer ---
MACHINE,RINGINGAMD => AARING
MACHINE,BUSYAMD => AARING
; --- IVR / music ---
MACHINE,IVRAMD => AAIVR
MACHINE,MUSICAMD => AAIVR
; --- silence / dead audio after answer ---
MACHINE,SILENCEAMD => AASIL
MACHINE,NOAUDIOAMD => AASIL
MACHINE,CLICKAMD => AASIL
; --- honeypot: never dial again ---
MACHINE,HONEYPOTAMD => AAHONY
; --- fax: reuse stock status ---
MACHINE,FAXAMD => FAXHU
; --- NOTSURE results that fall into the machine branch ---
NOTSURE,* => AANS
NOTSURE,NOAUDIODATA => ADAIR
NOTSURE,NO_AUDIO_TIMEOUT => ADAIR
KEEP-AL-AM-STATUSES');"

echo "== 5. campaigns in scope: dial statuses + map assignment"
mysql asterisk -e "UPDATE vicidial_campaigns SET dial_statuses=CONCAT(TRIM(TRAILING '-' FROM dial_statuses),'$AA_TOKENS -') WHERE $SCOPE AND dial_statuses NOT LIKE '% AAVM %';
UPDATE vicidial_campaigns SET dial_statuses=CONCAT(TRIM(TRAILING '-' FROM dial_statuses),'$RECYCLE_WITH_NA -') WHERE $SCOPE AND dial_statuses LIKE '% NA %' AND dial_statuses NOT LIKE '% $RECYCLE_WITH_NA %';
UPDATE vicidial_campaigns SET dial_statuses=CONCAT(TRIM(TRAILING '-' FROM dial_statuses),'$RECYCLE_WITH_AB -') WHERE $SCOPE AND dial_statuses LIKE '% AB %' AND dial_statuses NOT LIKE '% $RECYCLE_WITH_AB %';
UPDATE vicidial_campaigns SET amd_status_map='AMDY_status_map' WHERE $SCOPE;"
mysql asterisk -e "SELECT campaign_id,active,amd_status_map,LENGTH(dial_statuses) len,dial_statuses FROM vicidial_campaigns WHERE $SCOPE"
BAD=$(mysql asterisk -N -e "SELECT COUNT(*) FROM vicidial_campaigns WHERE $SCOPE AND (LENGTH(dial_statuses)>=255 OR dial_statuses NOT LIKE '% -')")
[ "$BAD" = "0" ] || { echo "DIAL_STATUSES SANITY FAIL ($BAD rows) - restoring"; mysql asterisk < $D/restore_campaigns.sql; exit 1; }
date '+%F %T' > $D/APPLIED_AT

echo "== 6. carrier cron untouched (already live)"

echo "== 7. rollback script"
cat > $D/rollback.sh <<EOF
#!/bin/bash
# Rollback of Aragon AMDY status map go-live ($D). Run as root on aragon db1. Statuses are NOT deleted (policy).
set -e
APPLIED_AT="\$(cat $D/APPLIED_AT)"
echo "3. restore campaigns (dial_statuses + amd_status_map)"
mysql asterisk < $D/restore_campaigns.sql
echo "4. delete AMDY_status_map container"
mysql asterisk -e "DELETE FROM vicidial_settings_containers WHERE container_id='AMDY_status_map'"
echo "5. remap AA* rows written since \$APPLIED_AT back to AA"
mysql asterisk -e "UPDATE vicidial_log SET status='AA' WHERE call_date>='\$APPLIED_AT' AND status IN ('AAVM','AAVMCR','AAVMFL','AASCRN','AAFAS','AADISC','AARING','AAIVR','AASIL','AAHONY','AANS');
UPDATE vicidial_list SET status='AA' WHERE modify_date>='\$APPLIED_AT' AND status IN ('AAVM','AAVMCR','AAVMFL','AASCRN','AAFAS','AADISC','AARING','AAIVR','AASIL','AAHONY','AANS');"
echo "ROLLBACK DONE. Statuses left in place per policy; snapshot: $D/vicidial_statuses.sql"
EOF
chmod +x $D/rollback.sh
echo; echo "GO-LIVE DONE at $(cat $D/APPLIED_AT).  Rollback: bash $D/rollback.sh"
echo "Verify within 2 min:  mysql asterisk -e \"select status,count(*) from vicidial_log where call_date>'$(cat $D/APPLIED_AT)' and status like 'AA%' group by 1\""
