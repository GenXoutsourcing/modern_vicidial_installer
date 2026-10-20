# MeetingsTech c1 cluster: operating guide for the client-side Claude (Jesse)

Date: 2026-10-20. Maintained by GenX (Steve Turner). Read fully before touching anything on c1. This cluster carries 250+ live agents and roughly 1.6 million dials a day; a careless query or edit shows up on the agent floor within seconds.

## 1. Who you are on this system

- Use the VICIdial admin user created for you (user `jesseclaude`, level 9, group ADMIN, same rights as user 2493). Never use 2493, apilambda or 6666 for changes you make. Every admin page save and API call is logged to vicidial_admin_log and vicidial_api_log under the user that made it, and that is how changes are attributed and audited.
- If you need SQL access, read from **db2** (62.151.177.143, read-only replica) and never from db1 unless Steve says so. db1 is the dialing primary. Aggregates and long reads go to **db3** (70.35.205.239).
- You do not have, and should not ask for, root or shell access to the 41 servers. Schema, config and script changes are made by GenX only, with a backup and a change-log entry each time.

## 2. The cluster in one paragraph

db1 primary (74.208.140.95), db2 report replica, db3 aggregate replica. HAProxy agent load balancer agent-c1 (104.219.42.249) in front of agent1-4 (PHP-FPM, 150 workers each). admin-c1 (70.35.202.231) for admin pages and reports, api-c1 for third-party posts, archive-c1 for recordings. sip1-30 are the dialers, 200 trunks each on SmartCarrier (outbound account prefixes 41170 autodial, 23065 transfers). All non-DB hosts reboot daily at 06:45. VICIdial svn r4032, PHP 8.2, MariaDB.

## 3. Things that are deliberately non-stock (do not undo, do not "fix")

| what | why |
|---|---|
| vicidial_live_agents and vicidial_manager are ENGINE=MEMORY, flushed every 4 min by AST_flush_DBqueue.pl | 200+ agents; removes the worst MyISAM lock contention |
| Indexes: vicidial_log campai_dt_stat_usr, vicidial_agent_log campaign_time, vicidial_log_extended dispo_poll, vicidial_manager BTREE secondaries | VDadapt and dialer polls were table-scanning under locks |
| AST_VDadapt.pl line 83 FORCE INDEX (campai_dt_stat_usr) | makes the index above get used |
| agc/vdc_db_query.php "GENX agent_log guard" (2 sites in VDADcheckINCOMING) on agent1-4 | closes the READY-before-insert race that lost agent_log rows |
| vicidial/functions.php dialable_leads() FORCE INDEX(list_id) on admin, api, agent1-4 | the campaign page's dialable-leads count was holding vicidial_list for 7-10 s |
| mysqli_report(MYSQLI_REPORT_OFF) in both dbconnect files; agc dir group-writable; PHP-FPM 150 workers; sysctl port range | PHP 8 and 200+ agents |
| my.cnf: max_connections 6000, thread_cache 4000, max_heap_table_size 2G, tmp_table_size 512M, smaller per-thread buffers | tuning for this load |
| Archive crons: 00:30 daily/carrier/vlog-daily, 01:00 --days=7 --recording-log-days=30 | live log tables kept to 7 days; reports read the _archive tables too |
| servers table: max_vicidial_trunks=0 and vicidial_balance_active=N on every non-dialer host | stops phantom balance dialing from web/DB hosts |
| sip16 eth0 static | IONOS DHCP failed on reboot once |

A VICIdial upgrade silently reverts the PHP and Perl patches; tell GenX before any upgrade.

## 4. Do

- Make campaign, list, filter, in-group, DID and user changes through the admin pages or the non-agent API under your own user.
- Keep an eye on the hopper when you change list sets or dial level: every list activation change and every "Reset Hopper" empties the hopper, and at dial level 15-18 the campaign burns about 3,000 leads a minute, so hopper_level 5000 is about 85 seconds of dialing. Make list changes once, not eight times in twelve minutes.
- Add dialplan via System Settings, Custom Dialplan Entry; it reaches all 30 dialers within a minute. Verify with GenX if unsure; a syntax error there breaks every dialer's dialplan reload.
- Report problems with timestamps and the campaign or user involved. "Agents waiting" at HH:MM with the campaign id lets GenX answer in minutes.
- For AMD results use vicidial_amd_log (live, few days) and vicidial_amd_log_archive. For agent-side timing use vicidial_agent_log; LAGGED rows are written by the dialer after 30 s without a screen check-in.
- For reports, use the ones already routed to db2 (slave_db_server in System Settings). If you write your own SQL, run it on db2 or db3 and keep it under a few seconds on db2 (long reads there stall the replica for everyone's reports).

## 5. Do not

- Do not run ALTER TABLE, CREATE INDEX, OPTIMIZE, REPAIR, TRUNCATE, or change a table engine on any table. All of these lock a MyISAM table for minutes with agents on it. GenX does them off-hours with a backup.
- Do not run full-table scans on db1 (anything on vicidial_list, vicidial_log, vicidial_agent_log without an indexed WHERE on list_id, lead_id, call_date or event_time). A 20-second scan of vicidial_list on db1 queues every agent dispo behind it.
- Do not restart MariaDB, Apache, PHP-FPM, Asterisk or the keepalive screens, and do not reboot hosts. Do not edit my.cnf, crontabs, firewall, or anything under /etc.
- Do not edit vdc_db_query.php, functions.php, vicidial.php, AST_VDadapt.pl, AST_VDhopper.pl or AST_VDauto_dial.pl. They carry patches listed above; overwrite one and the problem it fixed comes back without a trace.
- Do not drop or add indexes "to help", including on vicidial_list. The composite index you might reason your way to was tested on 2026-10-19: the optimizer ignores it unforced, and it costs a 3.5-minute table lock each way.
- Do not hand-repair vicidial_agent_log rows while the bulk repair of the 7,685 damaged pairs from 10-12 to 10-17 is pending with GenX; the two will collide.
- Do not change the flush schedule, the archive --days values, or the servers table trunk settings.
- Do not create or modify DB users, firewall whitelist entries (the admin whitelist is 46 fixed IPs plus the 14-day agent-login list), or SSH keys.
- Do not point a second replica, a Lambda, or a reporting job at db1. External replication clients belong on db2 (one already is).
- Do not bulk-update vicidial_list from the API during peak (lead_dearchive runs at 23k a day already); batch it or schedule it after 18:30 ET.

## 6. Known open items (so you do not re-diagnose them)

- Missing agent_log rows: root cause fixed on 2026-10-19 (guard patch). Residual pairs before that date await a bulk repair by GenX.
- Lulaway Joburg office (196.25.126.2): intermittent packet loss on the South African side; agents there get LAGGED. Not a server issue.
- Campaign 1023 "agents waiting": contact rate and list mix, plus hopper starvation when the eligible pool under the zip filter runs dry. Lists refill only on manual resets; a recycle rule or scheduled list reset times would stop that.
- Web-tier handshake loss between agent hosts and db1 (IONOS path) causes brief PHP-FPM bursts at peaks; persistent mysqli connections are tested and ready if GenX and Steve decide to apply them.
- Dead-air share on 1023 is 30-60% of agent connects; that is the custom AMD classifying silence as human, on the client side.

## 7. Escalation

Anything that changes server state goes through Steve Turner. Give him the what, the why, and the time window; he will have GenX stage it with a backup and a rollback. For an outage-type symptom, send the timestamp, campaign, and what agents saw; the watch scripts on our side keep per-minute data for the day.
