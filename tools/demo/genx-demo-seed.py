#!/usr/bin/env python3
"""GenX demo-data seeder for the viciboxclone cluster.

Creates realistic-looking dialer history so every dashboard/report has data:
  - lists 101/102 in TESTCAMP with 5,000 leads
  - demo agents 1001-1008 (user_group ADMIN)
  - ~3 weeks of weekday call history + today: vicidial_log, carrier_log,
    dial_log, agent_log, closer_log (AGENTDIRECT inbound), did_log, timeclock
All call rows carry comments='DEMO'; leads live only in lists 101/102 and
agents are 1001-1008, so everything is identifiable for cleanup.

Writes SQL to stdout; pipe into mysql.
"""
import os
import random
from datetime import datetime, timedelta

# SATURDAYS_ONLY=1: top-up pass that only adds call history for Saturdays in
# the window (incl. today) at reduced volume — no leads/agents/lists/DID
# re-inserts, so it is safe to run after the main pass.
SATURDAYS_ONLY = os.environ.get('SATURDAYS_ONLY') == '1'

random.seed(42)
SIP = '74.208.179.214'
CAMP = 'TESTCAMP'
GROUP = 'AGENTDIRECT'
UG = 'ADMIN'

FIRST = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth',
         'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Carlos', 'Maria',
         'Kevin', 'Nancy', 'Brian', 'Lisa', 'Angela', 'Mark', 'Sandra', 'Eric', 'Ashley', 'Laura']
LAST = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
        'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
        'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson']
STATES = [('IL', 'Chicago', '60601', -5), ('NY', 'New York', '10001', -4), ('CA', 'Los Angeles', '90001', -7),
          ('TX', 'Dallas', '75201', -5), ('FL', 'Miami', '33101', -4), ('OH', 'Columbus', '43004', -4),
          ('GA', 'Atlanta', '30301', -4), ('AZ', 'Phoenix', '85001', -7)]
AGENTS = [(str(1000 + i), f'{FIRST[i]} {LAST[i]} (Demo)') for i in range(1, 9)]

# status, weight, is_agent_handled, (min_len, max_len)
OUT_STATUSES = [
    ('NA', 34, False, (15, 35)), ('AA', 22, False, (25, 50)), ('B', 6, False, (8, 20)),
    ('DC', 4, True, (30, 90)), ('N', 4, False, (5, 15)), ('PU', 8, True, (40, 120)),
    ('NI', 9, True, (90, 300)), ('SALE', 5, True, (240, 900)), ('CALLBK', 4, True, (60, 240)),
    ('DROP', 3, False, (3, 25)), ('DNC', 1, True, (30, 90)),
]
IN_STATUSES = [('SALE', 8, (240, 900)), ('NI', 30, (90, 300)), ('CALLBK', 10, (60, 240)),
               ('DC', 8, (20, 60)), ('PU', 32, (60, 200)), ('DROP', 12, (2, 30))]

def pick(weighted):
    total = sum(w[1] for w in weighted)
    n = random.uniform(0, total)
    for row in weighted:
        n -= row[1]
        if n <= 0:
            return row
    return weighted[0]

def esc(value):
    return str(value).replace('\\', '\\\\').replace("'", "\\'")

statements = []
def emit(sql):
    if not SATURDAYS_ONLY:
        statements.append(sql)

def batch_insert(table, columns, rows, chunk=500):
    for i in range(0, len(rows), chunk):
        values = ',\n'.join('(' + ','.join(row) + ')' for row in rows[i:i + chunk])
        statements.append(f'INSERT INTO {table} ({",".join(columns)}) VALUES\n{values};')

# ---- lists -----------------------------------------------------------------
emit("DELETE FROM vicidial_lists WHERE list_id IN (101,102);")
emit("INSERT INTO vicidial_lists (list_id, list_name, campaign_id, active, list_description) VALUES"
     " (101,'Demo Sales Leads','TESTCAMP','Y','Demo data - safe to delete'),"
     " (102,'Demo Aged Leads','TESTCAMP','Y','Demo data - safe to delete');")

# ---- demo inbound DID --------------------------------------------------------
emit("DELETE FROM vicidial_inbound_dids WHERE did_id = 900;")
emit("INSERT INTO vicidial_inbound_dids (did_id, did_pattern, did_description, did_active, did_route, group_id, user, user_group)"
     " VALUES (900,'8005551234','Demo Sales Line','Y','IN_GROUP','AGENTDIRECT','VDAD','---ALL---');")

# ---- agents ----------------------------------------------------------------
for user, name in AGENTS:
    emit(f"INSERT IGNORE INTO vicidial_users (user, pass, full_name, user_level, user_group, active, view_reports)"
         f" VALUES ('{user}','demo{random.randint(100000,999999)}','{esc(name)}',1,'{UG}','Y','0');")

# ---- leads -----------------------------------------------------------------
now = datetime.now()
leads = []           # (lead_id, phone, list_id, state_idx)
lead_rows = []
LEAD_BASE = 500000   # explicit lead_ids far above existing ones
for i in range(5000):
    lead_id = LEAD_BASE + i
    list_id = 101 if i < 4000 else 102
    st = random.randrange(len(STATES))
    state, city, postal, gmt = STATES[st]
    fn, ln = random.choice(FIRST), random.choice(LAST)
    phone = f"812555{i:04d}"
    entry = now - timedelta(days=random.randint(22, 45))
    leads.append((lead_id, phone, list_id, st))
    lead_rows.append([
        str(lead_id), f"'{entry:%Y-%m-%d %H:%M:%S}'", "'NEW'", "''", f"'DEMO{i:05d}'", str(list_id),
        f"'{gmt:.2f}'", "'Y'", "'1'", f"'{phone}'", f"'{esc(fn)}'", f"'{esc(ln)}'",
        f"'{random.randint(100,9999)} {random.choice(LAST)} St'", f"'{city}'", f"'{state}'", f"'{postal}'", "'U'", '0',
    ])
batch_insert('vicidial_list',
             ['lead_id', 'entry_date', 'status', 'user', 'vendor_lead_code', 'list_id', 'gmt_offset_now',
              'called_since_last_reset', 'phone_code', 'phone_number', 'first_name', 'last_name',
              'address1', 'city', 'state', 'postal_code', 'gender', 'called_count'],
             [] if SATURDAYS_ONLY else lead_rows)

# ---- call history ----------------------------------------------------------
vl_rows, vcl_rows, vdl_rows, val_rows, cl_rows, did_rows = [], [], [], [], [], []
lead_state = {}      # lead_id -> (last_status, calls, last_time)
seq = 0

def out_call(when):
    global seq
    seq += 1
    lead_id, phone, list_id, _ = random.choice(leads)
    status, _, handled, (lo, hi) = pick(OUT_STATUSES)
    length = random.randint(lo, hi)
    start = int(when.timestamp())
    end = start + length
    uid = f'{start}.{seq}'
    caller = f'M{start % 100000000}{seq % 1000:03d}'
    agent = random.choice(AGENTS)[0] if handled else 'VDAD'
    prev = lead_state.get(lead_id, (None, 0, None))
    lead_state[lead_id] = (status, prev[1] + 1, when)
    vl_rows.append([
        f"'{uid}'", str(lead_id), str(list_id), f"'{CAMP}'", f"'{when:%Y-%m-%d %H:%M:%S}'", str(start), str(end),
        str(length), f"'{status}'", "'1'", f"'{phone}'", f"'{agent}'", "'DEMO'", "'Y'", f"'{UG}'",
        "'CALLER'" if not handled else "'AGENT'", "'MAIN'", str(prev[1] + 1),
    ])
    answered = status not in ('NA', 'B', 'N', 'DROP')
    dialstatus = 'ANSWER' if answered else random.choice(['NOANSWER', 'NOANSWER', 'BUSY' if status == 'B' else 'NOANSWER', 'CHANUNAVAIL'])
    cause = 16 if answered else (17 if status == 'B' else random.choice([16, 19, 19]))
    sip_cause = 200 if answered else (486 if status == 'B' else random.choice([480, 487, 480]))
    sip_reason = {200: 'OK', 486: 'Busy Here', 480: 'Temporarily Unavailable', 487: 'Request Terminated'}[sip_cause]
    ring_sec = random.randint(3, 28)
    vcl_rows.append([
        f"'{uid}'", f"'{dialstatus}'", str(cause), f"'PJSIP/carrier-{seq % 100000:08x}'",
        str(ring_sec), str(length if answered else 0),
        str(sip_cause), f"'{sip_reason}'", f"'{SIP}'", f"'{when:%Y-%m-%d %H:%M:%S}'", str(lead_id), f"'{caller}'",
    ])
    vdl_rows.append([
        f"'{caller}'", str(lead_id), f"'{SIP}'", f"'{when:%Y-%m-%d %H:%M:%S}'", f"'91{phone}'",
        f"'Local/91{phone}@default'", "'default'", "'60'", "'\"DEMO\" <8005551234>'",
        str(sip_cause), f"'{sip_reason}'", f"'{uid}'",
    ])
    if handled:
        pause = random.randint(0, 90)
        wait = random.randint(3, 45)
        dispo = random.randint(8, 60)
        val_rows.append([
            f"'{agent}'", f"'{SIP}'", f"'{when:%Y-%m-%d %H:%M:%S}'", str(lead_id), f"'{CAMP}'",
            str(start - wait - pause), str(pause), str(start - wait), str(wait),
            str(start), str(length), str(end), str(dispo), f"'{status}'", f"'{UG}'", "'DEMO'",
            f"'{random.choice(['', '', 'BREAK', 'LUNCH'])}'", '0', f"'{uid}'",
        ])

def in_call(when):
    global seq
    seq += 1
    lead_id, phone, list_id, _ = random.choice(leads)
    status, _, (lo, hi) = pick(IN_STATUSES)
    length = random.randint(lo, hi)
    queue = random.randint(2, 25) if status != 'DROP' else random.randint(20, 120)
    start = int(when.timestamp())
    uid = f'{start}.{seq}'
    agent = random.choice(AGENTS)[0] if status != 'DROP' else 'VDCL'
    cl_rows.append([
        str(lead_id), str(list_id), f"'{GROUP}'", f"'{when:%Y-%m-%d %H:%M:%S}'", str(start), str(start + length),
        str(length), f"'{status}'", "'1'", f"'{phone}'", f"'{agent}'", "'DEMO'", "'Y'", str(queue), f"'{UG}'",
        "'CALLER'", f"'{uid}'",
    ])
    did_rows.append([
        f"'{uid}'", f"'PJSIP/inbound-{seq % 100000:08x}'", f"'{SIP}'", f"'{phone}'",
        f"'{esc(random.choice(FIRST))} {esc(random.choice(LAST))}'", "'8005551234'",
        f"'{when:%Y-%m-%d %H:%M:%S}'", '900', "'IN_GROUP'",
    ])
    if status != 'DROP':
        wait = queue
        dispo = random.randint(8, 60)
        val_rows.append([
            f"'{agent}'", f"'{SIP}'", f"'{when:%Y-%m-%d %H:%M:%S}'", str(lead_id), f"'{GROUP}'",
            str(start - wait - 10), '10', str(start - wait), str(wait),
            str(start), str(length), str(start + length), str(dispo), f"'{status}'", f"'{UG}'", "'DEMO'",
            "''", '0', f"'{uid}'",
        ])

tc_rows = []
day = now.date() - timedelta(days=21)
while day <= now.date():
    is_today = day == now.date()
    wanted = (day.weekday() == 5) if SATURDAYS_ONLY else (day.weekday() < 5)
    sat_factor = 0.55 if day.weekday() == 5 else 1.0
    if wanted:
        day_start = datetime(day.year, day.month, day.day, 9, 0, 0)
        end_hour = min(17, now.hour) if is_today else 17
        if not is_today or now.hour >= 9:
            n_out = int(random.randint(1250, 1550) * sat_factor)
            n_in = int(random.randint(65, 95) * sat_factor)
            if is_today:
                frac = max(0.05, min(1.0, ((now.hour - 9) * 60 + now.minute) / (9 * 60)))
                n_out = int(n_out * frac)
                n_in = int(n_in * frac)
            span_min = (end_hour - 9) * 60 + (now.minute if is_today and now.hour <= 17 else 59)
            span_min = max(span_min, 30)
            for _ in range(n_out):
                out_call(day_start + timedelta(minutes=random.uniform(0, span_min)))
            for _ in range(n_in):
                in_call(day_start + timedelta(minutes=random.uniform(0, span_min)))
        # timeclock: everyone in ~08:55, out ~17:05
        for user, _name in AGENTS:
            t_in = datetime(day.year, day.month, day.day, 8, random.randint(45, 59), random.randint(0, 59))
            t_out = datetime(day.year, day.month, day.day, 17, random.randint(0, 20), random.randint(0, 59))
            tc_rows.append([str(int(t_in.timestamp())), f"'{t_in:%Y-%m-%d %H:%M:%S}'", '0', "'LOGIN'",
                            f"'{user}'", f"'{UG}'", "'10.0.0.10'"])
            if not is_today:
                tc_rows.append([str(int(t_out.timestamp())), f"'{t_out:%Y-%m-%d %H:%M:%S}'",
                                str(int((t_out - t_in).total_seconds())), "'LOGOUT'",
                                f"'{user}'", f"'{UG}'", "'10.0.0.10'"])
    day += timedelta(days=1)

batch_insert('vicidial_log',
             ['uniqueid', 'lead_id', 'list_id', 'campaign_id', 'call_date', 'start_epoch', 'end_epoch',
              'length_in_sec', 'status', 'phone_code', 'phone_number', 'user', 'comments', 'processed',
              'user_group', 'term_reason', 'alt_dial', 'called_count'], vl_rows)
batch_insert('vicidial_carrier_log',
             ['uniqueid', 'dialstatus', 'hangup_cause', 'channel', 'dial_time', 'answered_time',
              'sip_hangup_cause', 'sip_hangup_reason', 'server_ip', 'call_date', 'lead_id', 'caller_code'],
             vcl_rows)
batch_insert('vicidial_dial_log',
             ['caller_code', 'lead_id', 'server_ip', 'call_date', 'extension', 'channel', 'context',
              'timeout', 'outbound_cid', 'sip_hangup_cause', 'sip_hangup_reason', 'uniqueid'], vdl_rows)
batch_insert('vicidial_agent_log',
             ['user', 'server_ip', 'event_time', 'lead_id', 'campaign_id', 'pause_epoch', 'pause_sec',
              'wait_epoch', 'wait_sec', 'talk_epoch', 'talk_sec', 'dispo_epoch', 'dispo_sec', 'status',
              'user_group', 'comments', 'sub_status', 'dead_sec', 'uniqueid'], val_rows)
batch_insert('vicidial_closer_log',
             ['lead_id', 'list_id', 'campaign_id', 'call_date', 'start_epoch', 'end_epoch', 'length_in_sec',
              'status', 'phone_code', 'phone_number', 'user', 'comments', 'processed', 'queue_seconds',
              'user_group', 'term_reason', 'uniqueid'], cl_rows)
batch_insert('vicidial_did_log',
             ['uniqueid', 'channel', 'server_ip', 'caller_id_number', 'caller_id_name', 'extension',
              'call_date', 'did_id', 'did_route'], did_rows)
batch_insert('vicidial_timeclock_log',
             ['event_epoch', 'event_date', 'login_sec', 'event', 'user', 'user_group', 'ip_address'], tc_rows)

# ---- final lead statuses / called counts -----------------------------------
status_updates = {}
for lead_id, (status, calls, last) in lead_state.items():
    status_updates.setdefault((status, calls), []).append((lead_id, last))
for (status, calls), items in status_updates.items():
    ids = ','.join(str(lead_id) for lead_id, _ in items)
    last = max(t for _, t in items)
    emit(f"UPDATE vicidial_list SET status='{status}', called_count={calls},"
         f" last_local_call_time='{last:%Y-%m-%d %H:%M:%S}' WHERE lead_id IN ({ids});")

for sql in statements:
    print(sql)
print(f"-- demo seed: {len(lead_rows)} leads, {len(vl_rows)} outbound calls, {len(cl_rows)} inbound,"
      f" {len(val_rows)} agent events, {len(tc_rows)} timeclock rows")
