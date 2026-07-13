#!/usr/bin/env python3
"""GenX 6-month full-volume demo seed for viciboxclone.

Simulates a production dialer: 3M leads across 12 lists, 60 agents + 3
supervisors, 100k-200k outbound dials per weekday (Saturdays ~40-70k) for the
last 182 days, with matching carrier_log, dial_log, agent_log, closer_log
(inbound), did_log, api_log, recording_log (locations point at real audio
files so playback works), timeclock and user_log rows.

Deterministic (fixed seed): run the SAME script on db1 AND db2 piped straight
into mysql as root — it emits SET sql_log_bin=0 so the two loads are
independent and the binlog doesn't balloon:
    python3 genx-demo-seed6m.py | mysql -u root asterisk

All call rows carry comments='DEMO6M'; leads are lead_id 1,000,000-3,999,999
in lists 111-122; agents 1001-1060; supervisors 2001-2003.
"""
import os
import random
import sys
import time
from datetime import date, datetime, timedelta

# SKIP_LEADS=1: don't re-emit the 3M vicidial_list rows (lead generation is
# modulo-based, not RNG-based, so call history is identical either way).
SKIP_LEADS = os.environ.get('SKIP_LEADS') == '1'

random.seed(20260711)
W = sys.stdout.write

SIP = '74.208.179.214'
CAMP = 'TESTCAMP'
GROUP = 'AGENTDIRECT'
UG = 'ADMIN'
HOST = 'admin.viciboxclone.genxcontactcenter.com'
AUDIO_DIR = '5mc4n12k5tgfqng9tqppw0fd0ft1mx'
AUDIO = ['0.wav', '1.wav', '2.wav', '3.wav', '1-yes-2-no.wav']

FIRST = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth',
         'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Carlos', 'Maria',
         'Kevin', 'Nancy', 'Brian', 'Lisa', 'Angela', 'Mark', 'Sandra', 'Eric', 'Ashley', 'Laura']
LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
        'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
        'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson']
STATES = [('IL', 'Chicago', '60601', '-5.00'), ('NY', 'New York', '10001', '-4.00'),
          ('CA', 'Los Angeles', '90001', '-7.00'), ('TX', 'Dallas', '75201', '-5.00'),
          ('FL', 'Miami', '33101', '-4.00'), ('OH', 'Columbus', '43004', '-4.00'),
          ('GA', 'Atlanta', '30301', '-4.00'), ('AZ', 'Phoenix', '85001', '-7.00')]
LISTS = [(111 + i, name) for i, name in enumerate([
    'Demo Auto Warranty', 'Demo Solar West', 'Demo Solar East', 'Demo Medicare T1', 'Demo Medicare T2',
    'Demo Home Services', 'Demo Insurance Aged', 'Demo Insurance Fresh', 'Demo Finance A', 'Demo Finance B',
    'Demo Callback Pool', 'Demo Web Leads'])]
AGENTS = [str(1000 + i) for i in range(1, 61)]
SUPERVISORS = [('2001', 'Sam Rivera (Supervisor)'), ('2002', 'Dana Brooks (Supervisor)'), ('2003', 'Chris Patel (Supervisor)')]

# 1000-slot outbound status lookup:
# (status, handled, lo_len, hi_len, dialstatus, hangup_cause, sip_cause, sip_reason, answered)
OUT = []
def add(status, permille, handled, lo, hi, dialstatus, cause, sip, reason, answered):
    OUT.extend([(status, handled, lo, hi, dialstatus, cause, sip, reason, answered)] * permille)
add('NA', 448, False, 15, 35, 'NOANSWER', 19, 480, 'Temporarily Unavailable', False)
add('AA', 240, False, 25, 50, 'ANSWER', 16, 200, 'OK', True)
add('B', 70, False, 8, 20, 'BUSY', 17, 486, 'Busy Here', False)
add('N', 60, False, 5, 15, 'CHANUNAVAIL', 19, 487, 'Request Terminated', False)
add('DROP', 35, False, 3, 25, 'ANSWER', 16, 200, 'OK', True)
add('PU', 22, True, 40, 120, 'ANSWER', 16, 200, 'OK', True)
add('DC', 18, True, 30, 90, 'ANSWER', 16, 200, 'OK', True)
add('NI', 36, True, 90, 300, 'ANSWER', 16, 200, 'OK', True)
add('SALE', 8, True, 240, 700, 'ANSWER', 16, 200, 'OK', True)
add('CALLBK', 12, True, 60, 240, 'ANSWER', 16, 200, 'OK', True)
add('DNC', 4, True, 30, 90, 'ANSWER', 16, 200, 'OK', True)
add('NA', 1000 - len(OUT), False, 15, 35, 'NOANSWER', 19, 480, 'Temporarily Unavailable', False)

IN_STATUSES = ([('SALE', 240, 700)] * 8 + [('NI', 90, 300)] * 30 + [('CALLBK', 60, 240)] * 10
               + [('DC', 20, 60)] * 8 + [('PU', 60, 200)] * 32 + [('DROP', 2, 30)] * 12)
API_FN = ['add_lead'] * 70 + ['update_lead'] * 18 + ['lead_info'] * 8 + ['dnc_check'] * 4

LEAD_STATUSES = (['NEW'] * 200 + ['NA'] * 300 + ['AA'] * 160 + ['NI'] * 90 + ['PU'] * 60 + ['B'] * 50
                 + ['SALE'] * 25 + ['CALLBK'] * 35 + ['DC'] * 30 + ['N'] * 25 + ['DROP'] * 15 + ['DNC'] * 10)

class Tbl:
    def __init__(self, table, cols, cap=1000):
        self.head = f'INSERT INTO {table} ({cols}) VALUES\n'
        self.rows = []
        self.cap = cap
        self.count = 0
    def add(self, row):
        self.rows.append(row)
        self.count += 1
        if len(self.rows) >= self.cap:
            self.flush()
    def flush(self):
        if self.rows:
            W(self.head)
            W(',\n'.join(self.rows))
            W(';\n')
            self.rows = []

BIG_TABLES = ['vicidial_list', 'vicidial_log', 'vicidial_carrier_log', 'vicidial_dial_log',
              'vicidial_agent_log', 'vicidial_closer_log', 'vicidial_did_log', 'vicidial_api_log',
              'recording_log']

W('SET SESSION sql_log_bin=0;\n')
W('SET SESSION bulk_insert_buffer_size=268435456;\n')
W('SET SESSION myisam_sort_buffer_size=1073741824;\n')
for t in BIG_TABLES:
    W(f'ALTER TABLE {t} DISABLE KEYS;\n')

# ---- lists, users ------------------------------------------------------------
W('DELETE FROM vicidial_lists WHERE list_id BETWEEN 111 AND 122;\n')
W('INSERT INTO vicidial_lists (list_id, list_name, campaign_id, active, list_description) VALUES '
  + ','.join(f"({lid},'{name}','{CAMP}','{'Y' if lid < 119 else 'N'}','Demo data - safe to delete')" for lid, name in LISTS)
  + ';\n')
for i, user in enumerate(AGENTS):
    fn = FIRST[i % len(FIRST)]
    ln = LAST[(i * 7 + 3) % len(LAST)]
    W(f"INSERT IGNORE INTO vicidial_users (user, pass, full_name, user_level, user_group, active, view_reports)"
      f" VALUES ('{user}','demo{random.randint(100000,999999)}','{fn} {ln} (Demo)',1,'{UG}','Y','0');\n")
for user, name in SUPERVISORS:
    W(f"INSERT IGNORE INTO vicidial_users (user, pass, full_name, user_level, user_group, active,"
      f" view_reports, access_recordings, modify_users, modify_campaigns, modify_lists, modify_leads,"
      f" modify_scripts, modify_filters, modify_call_times, modify_inbound_dids, modify_remoteagents,"
      f" modify_ingroups, load_leads, vdc_agent_api_access)"
      f" VALUES ('{user}','demo{random.randint(100000,999999)}','{name}',8,'{UG}','Y',"
      f"'1','1','1','1','1',2,'1','1','1','1','1','1','1','1');\n")

# ---- 3M leads ----------------------------------------------------------------
leads = Tbl('vicidial_list',
            'lead_id,entry_date,status,user,vendor_lead_code,list_id,gmt_offset_now,called_since_last_reset,'
            'phone_code,phone_number,first_name,last_name,address1,city,state,postal_code,gender,called_count,'
            'last_local_call_time')
today = date.today()
for lead_id in range(0 if SKIP_LEADS else 1_000_000, 4_000_000 if not SKIP_LEADS else 0):
    st_i = lead_id % 8
    state, city, postal, gmt = STATES[st_i]
    status = LEAD_STATUSES[lead_id % 1000]
    called = 0 if status == 'NEW' else (lead_id % 4) + 1
    fn = FIRST[lead_id % 30]
    ln = LAST[(lead_id // 30) % 30]
    list_id = 111 + lead_id % 12
    phone = 2000000000 + lead_id
    entry = today - timedelta(days=(lead_id % 200) + 1)
    last_call = f"'{today - timedelta(days=lead_id % 60)} 12:00:00'" if called else 'NULL'
    leads.add(f"({lead_id},'{entry} 10:00:00','{status}','','D6M{lead_id}',{list_id},'{gmt}','Y','1',"
              f"'{phone}','{fn}','{ln}','{(lead_id % 9000) + 100} {LAST[(lead_id // 7) % 30]} St','{city}',"
              f"'{state}','{postal}','U',{called},{last_call})")
leads.flush()

# ---- call history ------------------------------------------------------------
vl = Tbl('vicidial_log', 'uniqueid,lead_id,list_id,campaign_id,call_date,start_epoch,end_epoch,length_in_sec,'
                         'status,phone_code,phone_number,user,comments,processed,user_group,term_reason,alt_dial,called_count')
vcl = Tbl('vicidial_carrier_log', 'uniqueid,dialstatus,hangup_cause,channel,dial_time,answered_time,'
                                  'sip_hangup_cause,sip_hangup_reason,server_ip,call_date,lead_id,caller_code')
vdl = Tbl('vicidial_dial_log', 'caller_code,lead_id,server_ip,call_date,extension,channel,context,timeout,'
                               'outbound_cid,sip_hangup_cause,sip_hangup_reason,uniqueid')
val = Tbl('vicidial_agent_log', 'user,server_ip,event_time,lead_id,campaign_id,pause_epoch,pause_sec,wait_epoch,'
                                'wait_sec,talk_epoch,talk_sec,dispo_epoch,dispo_sec,status,user_group,comments,'
                                'sub_status,dead_sec,uniqueid')
cl = Tbl('vicidial_closer_log', 'lead_id,list_id,campaign_id,call_date,start_epoch,end_epoch,length_in_sec,status,'
                                'phone_code,phone_number,user,comments,processed,queue_seconds,user_group,term_reason,uniqueid')
did = Tbl('vicidial_did_log', 'uniqueid,channel,server_ip,caller_id_number,caller_id_name,extension,call_date,did_id,did_route')
api = Tbl('vicidial_api_log', 'user,api_date,api_script,`function`,agent_user,value,result,result_reason,source,data,run_time,webserver')
rec = Tbl('recording_log', 'channel,server_ip,extension,start_time,start_epoch,end_time,end_epoch,length_in_sec,'
                           'length_in_min,filename,location,lead_id,user,vicidial_id')
tc = Tbl('vicidial_timeclock_log', 'event_epoch,event_date,login_sec,event,user,user_group,ip_address', 500)
ul = Tbl('vicidial_user_log', 'user,event,campaign_id,event_date,event_epoch,user_group,server_ip,computer_ip,webserver', 500)

now = datetime.now()
seq = 10_000_000
rnd = random.random
rr = random.randrange

for back in range(182, -1, -1):
    day = today - timedelta(days=back)
    wd = day.weekday()
    if wd == 6:
        continue
    is_today = day == today
    day_s = day.isoformat()
    base = int(time.mktime(day.timetuple()))
    day_compact = day_s.replace('-', '')
    n_out = rr(100_000, 200_000) if wd < 5 else rr(40_000, 70_000)
    if is_today:
        if now.hour < 9:
            n_out = 0
        else:
            frac = min(1.0, ((now.hour - 9) * 60 + now.minute) / (9 * 60))
            n_out = int(n_out * frac)
    lo_s, hi_s = 9 * 3600, 18 * 3600
    if is_today and now.hour <= 18:
        hi_s = max(lo_s + 1800, now.hour * 3600 + now.minute * 60)
    n_in = n_out // 90
    n_api = n_out // 25

    for _ in range(n_out):
        seq += 1
        sod = rr(lo_s, hi_s)
        sec = base + sod
        dt = f'{day_s} {sod // 3600:02d}:{(sod % 3600) // 60:02d}:{sod % 60:02d}'
        status, handled, lo, hi, dialstatus, cause, sip, reason, answered = OUT[rr(1000)]
        length = rr(lo, hi)
        lead = rr(1_000_000, 4_000_000)
        phone = 2000000000 + lead
        list_id = 111 + lead % 12
        uid = f'{sec}.{seq}'
        agent = AGENTS[seq % 60] if handled else 'VDAD'
        vl.add(f"('{uid}',{lead},{list_id},'{CAMP}','{dt}',{sec},{sec + length},{length},'{status}','1',"
               f"'{phone}','{agent}','DEMO6M','Y','{UG}','{'AGENT' if handled else 'CALLER'}','MAIN',1)")
        vcl.add(f"('{uid}','{dialstatus}',{cause},'PJSIP/demo-{seq % 16777216:08x}',{rr(3, 28)},"
                f"{length if answered else 0},{sip},'{reason}','{SIP}','{dt}',{lead},'M{seq}')")
        vdl.add(f"('M{seq}',{lead},'{SIP}','{dt}','91{phone}','Local/91{phone}@default','default','60',"
                f"'\"DEMO\" <8005551234>',{sip},'{reason}','{uid}')")
        if handled:
            pause = rr(0, 90)
            wait = rr(3, 45)
            dispo = rr(8, 60)
            val.add(f"('{agent}','{SIP}','{dt}',{lead},'{CAMP}',{sec - wait - pause},{pause},{sec - wait},{wait},"
                    f"{sec},{length},{sec + length},{dispo},'{status}','{UG}','DEMO6M','',0,'{uid}')")
            if rnd() < 0.6:
                fname = f'{CAMP}_{day_compact}-{sod // 3600:02d}{(sod % 3600) // 60:02d}{sod % 60:02d}_{agent}_{phone}'
                loc = f'https://{HOST}/{AUDIO_DIR}/{AUDIO[seq % 5]}'
                end_dt = f'{day_s} {(sod + length) // 3600:02d}:{((sod + length) % 3600) // 60:02d}:{(sod + length) % 60:02d}'
                rec.add(f"('PJSIP/demo-{seq % 16777216:08x}','{SIP}','8309','{dt}',{sec},'{end_dt}',{sec + length},"
                        f"{length},'{length // 60}:{length % 60:02d}','{fname}','{loc}',{lead},'{agent}','{uid}')")

    for _ in range(n_in):
        seq += 1
        sod = rr(lo_s, hi_s)
        sec = base + sod
        dt = f'{day_s} {sod // 3600:02d}:{(sod % 3600) // 60:02d}:{sod % 60:02d}'
        status, lo, hi = IN_STATUSES[rr(100)]
        length = rr(lo, hi)
        queue = rr(20, 120) if status == 'DROP' else rr(2, 25)
        lead = rr(1_000_000, 4_000_000)
        phone = 2000000000 + lead
        uid = f'{sec}.{seq}'
        agent = AGENTS[seq % 60] if status != 'DROP' else 'VDCL'
        cl.add(f"({lead},{111 + lead % 12},'{GROUP}','{dt}',{sec},{sec + length},{length},'{status}','1',"
               f"'{phone}','{agent}','DEMO6M','Y',{queue},'{UG}','CALLER','{uid}')")
        did.add(f"('{uid}','PJSIP/in-{seq % 16777216:08x}','{SIP}','{phone}','{FIRST[lead % 30]} {LAST[lead % 29]}',"
                f"'8005551234','{dt}',900,'IN_GROUP')")
        if status != 'DROP':
            val.add(f"('{agent}','{SIP}','{dt}',{lead},'{GROUP}',{sec - queue - 10},10,{sec - queue},{queue},"
                    f"{sec},{length},{sec + length},{rr(8, 60)},'{status}','{UG}','DEMO6M','',0,'{uid}')")

    for _ in range(n_api):
        sod = rr(0, 86_340)
        dt = f'{day_s} {sod // 3600:02d}:{(sod % 3600) // 60:02d}:{sod % 60:02d}'
        fn = API_FN[rr(100)]
        ok = rnd() < 0.96
        api.add(f"('GENXAPI','{dt}','genxapi','{fn}','','{rr(1_000_000, 4_000_000)}',"
                f"'{'SUCCESS' if ok else 'ERROR'}','{'lead accepted' if ok else 'invalid phone_number'}',"
                f"'demo-crm','phone_number={rr(2000000000, 2147483647)}',{rr(0, 3)},'{HOST}')")

    active_agents = AGENTS if wd < 5 else AGENTS[:30]
    for user in active_agents:
        t_in = base + 8 * 3600 + rr(2700, 3540)
        t_out = base + 17 * 3600 + rr(0, 1200)
        dt_in = f'{day_s} 08:{(t_in - base - 28800) // 60:02d}:{(t_in - base) % 60:02d}'
        tc.add(f"({t_in},'{dt_in}',0,'LOGIN','{user}','{UG}','10.0.0.{int(user) % 250}')")
        ul.add(f"('{user}','LOGIN','{CAMP}','{dt_in}',{t_in},'{UG}','{SIP}','10.0.0.{int(user) % 250}','{HOST}')")
        if not is_today:
            dt_out = f'{day_s} 17:{(t_out - base - 61200) // 60:02d}:{(t_out - base) % 60:02d}'
            tc.add(f"({t_out},'{dt_out}',{t_out - t_in},'LOGOUT','{user}','{UG}','10.0.0.{int(user) % 250}')")

for tbl in (vl, vcl, vdl, val, cl, did, api, rec, tc, ul, leads):
    tbl.flush()
for t in BIG_TABLES:
    W(f'ALTER TABLE {t} ENABLE KEYS;\n')
W(f"-- seed6m: leads={leads.count} out={vl.count} carrier={vcl.count} dial={vdl.count} agent={val.count}"
  f" inbound={cl.count} api={api.count} recordings={rec.count} timeclock={tc.count}\n")
sys.stderr.write(f"seed6m done: out={vl.count} agent={val.count} rec={rec.count} api={api.count}\n")
