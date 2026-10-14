# MEMORY recipe: 10-box verification and c1 deployment record (2026-10-13)

Scope: VICIdial Group's documented conversion of `vicidial_live_agents` and `vicidial_manager` to ENGINE=MEMORY with a 4-minute `AST_flush_DBqueue.pl` cron (docs/LOAD_BALANCING.txt lines 29-35, BASE_INSTALL.txt 313-317, forum thread by Matt Florell), verified on the idle 10-box (mt-*) against two rounds of reviewer requirements, then **applied on c1 at 21:25 on Steve's instruction** (section 12). The installed flush script on c1 db1 and the 10-box are byte-identical (sha256 f3e4fe7762078cdc).

Status legend: **PASS** = demonstrated with evidence on the 10-box; **PASS (c1)** = verified on c1 after deployment; **LIMITED** = demonstrated but with a stated gap; **NOT DEMONSTRATED** = cannot be shown on the 10-box.

## 1. Pass/fail table

| # | Check | Result | Evidence |
|---|---|---|---|
| 1 | Column sizes match the installed revision | PASS | Build 260515-1937 docs say VARCHAR(8000)/(8000)/(1000); c1 has a 4,923-char `closer_campaigns` user and 170 in-groups (2,427 chars if all assigned); sql_mode is non-strict (silent truncation). 10-box corrected 18:09; c1 deployed with these sizes. c1's stock `SHOW CREATE TABLE` is identical to the 10-box stock (md5 75abdb4b7c27). |
| 2 | Replica-only restart diverges silently | PASS (demonstrated) | Under 20-agent load: replica restarted, 60 s later primary 22 rows vs replica 9 (+ planted STALE1), replication Yes/Yes/0 errors, `Slave_skipped_errors` 52 (row-format events for missing rows are skipped; statement-format ones match 0 rows and raise nothing). Real-time counts: primary READY 11 / INCALL 9 / PAUSED 2 vs replica READY 6 / INCALL 3. |
| 3 | Coordinated live resync | PASS | `resync-orch.sh`: SQL thread stopped first; snapshot in one session under `LOCK TABLES ... READ` with `SHOW MASTER STATUS` + `@@gtid_binlog_pos` inside the lock (lock held < 1 s); `START SLAVE UNTIL` to exactly that position (file/pos on the 10-box, GTID form selected automatically for c1 whose replicas use `Slave_Pos`); DELETE+INSERT with `sql_log_bin=0`; resume. Replica stopped at exec pos 1041211418 = snapshot; STALE1 gone; after load ended both sides identical: 1,231 manager rows, same min/max entry_date, same max man_id, 2 live rows. Nothing replays call-control commands (vicidial_manager is only read on replicas). |
| 4 | Primary restart | PASS | Binlog carries `TRUNCATE TABLE` for both tables (and vicidial_hopper, already MEMORY in stock); replica IO reconnects within its 60 s retry and applies it; agents re-login. |
| 5 | Flush cutoffs as installed (`--seconds=240 --session-flush`) | PASS (corrected) | vicidial_manager < 240 s **regardless of status**; vicidial_sessions_recent < 240 s; vicidial_sip_event_recent < 480 s; cid_channels_recent* < 121 s (fixed, cadence-independent); dtmf_log, routing_initiated_recordings, parked_channels_recent (park_end_time), agent_vmm_overrides < 240 s; 3way_press_live 6 h; server_live_* 12 h. The earlier "1 hour / 2 hour" wording in this report was wrong. |
| 6 | Readers of the trimmed tables | PASS (reviewed) | See section 4: the only reader with a window longer than the new retention is the 5-minute `vicidial_sessions_recent` lookup in `manDiaLnextCaLL` (dial_ingroup path) and `api.php`; effective window becomes 4 minutes. |
| 7 | Agent session across flush cycles | PASS | LT021 logged in 20:51, made manual calls at 21:00, 21:04, 21:08 across flushes at 20:57, 21:01, 21:05, 21:09; login/conf/call/dispo all normal; `web_client_sessions` intact. |
| 8 | Pending command age and the 240 s cutoff | PASS (documented) | 167 five-second samples during a call session: pending (NEW) age max 0 s. A NEW command addressed to a server that never processes it was inserted 21:14:54 and **deleted unprocessed by the 21:21:01 flush at age 367 s** (survived the 21:17:01 flush at 127 s). Any command not processed within 240-480 s is lost; AST_manager_send normally processes within 1 s, and `flushmon` alerts at 30 s. |
| 9 | Flush runtime / overlap | PASS (measured) | 10-box: 11 runs under load at 0-1 s; c1 after deployment: 2 s, 0 s, 0 s. Stock hourly runs on c1 today took up to 125 s (MyISAM OPTIMIZE of a 32 MB manager table), which the conversion removes. Overlap is not impossible, it is monitored: `flushmon` alerts when two flush processes exist or a run exceeds 60 s. |
| 10 | Manual call origination | PASS | `manDiaLonly` -> manager `Originate Channel: Local/9600020@default, Exten: 7718125500010` -> customer leg joined the agent's ConfBridge (2 members), client-generated uniqueid logged, agent hangup via `manager_send Hangup`, `manDiaLlogCaLL end`, dispo A: vicidial_log row A/LT021/14 s. |
| 11 | Blind transfer | PASS | `RedirectVD` to `990009*LTIG_WAIT*...`: customer entered the in-group, LT022 received it (closer_log INCALL, queue 0 s), LT021 logged XFER; LT022 hangup/log/dispo A. |
| 12 | Attended (consultative) transfer | PASS | Originate of the in-group exten into LT021's room with the customer: LT022 answered (closer_log INCALL), 3 parties in LT021's room; customer redirected to LT022's room (9600021), consult leg dropped: LT021 room 1 member, LT022 room = LT022 + customer; both ends logged and dispositioned. |
| 13 | Park / retrieve | PASS | `RedirectToPark` -> channel executing 8301 (Answer, park_CID.agi, Playback(park)), `parked_channels` row, agent alone in room; `RedirectFromPark` to 9600020 -> customer back in the room (ConfBridge joined), park row removed. |
| 14 | Three-way | PASS | Originate of a third number into the room: 3 members; third-party hangup: 2; customer hangup: 1; vicidial_log A 45 s. |
| 15 | Conference / voice prompts | PASS | In-group welcome prompt (`play_welcome_message=ALWAYS`) played to the caller before delivery (`Playing 'auth-thankyou.gsm'` on SIP/LTLOOP-0000805d at 20:55:12, then LT022 received the call); park prompt (`Playback(park)`) executed on the parked leg; queue hold loop plays `sip-silence` while waiting. |
| 16 | Logout / re-login | PASS, one edge case | Logout hung up the phone leg, re-login reused room 9600020 and recreated the live row (agent_log LOGIN rows). Edge: logging out within ~1 s of login (before the phone leg is registered in the live row) leaves that leg orphaned in the room. |
| 17 | Inbound routing, sequential | PASS | 8/8 rank calls to the top-ranked agent, 8/8 longest-wait calls to the oldest `last_call_finish` agent (one same-second tie), queue 0 s, 0 duplicate uniqueid. |
| 18 | Concurrent inbound + outbound, multiple eligible agents | PASS (routing) / LIMITED (isolation) | 20 agents dialing outbound (144 dials in the window) while 10+10+12 inbound calls arrived in bursts: LTIG_WAIT 16/16 answered by 11 distinct agents, LTIG_RANK 13/16 by 10 distinct agents (3 callers hung up in queue), rank-9 agents took 5, rank-5 took 4, rank-1 took 4, max queue 0 s, 0 duplicate uniqueid, 0 duplicate manager Originate, 0 queue rows left. Limitation: my simulator's "inbound-only" agents still received outbound calls after their first ready (a missing client parameter), so blended/inbound-only isolation was not proven. The simulator's "DUPLICATE" lines are callerid collisions (10 callers with the same ANI in the same second share lead and callerid), not duplicate deliveries. |
| 19 | Load, MyISAM vs MEMORY (40 agents, 22 min each) | PASS (no regression), NOT DEMONSTRATED (improvement) | Section 6. Throughput, drop %, poll latency and lock-wait ratio equal within noise. |
| 20 | FILL / local autodial delay | PASS (measured), no change recommended for c1 | Section 8. |
| 21 | Sizing and monitoring | PASS (c1) | Section 9: heap 2G attached to both tables on db1/db2/db3; `flushmon` every minute. |
| 22 | c1 deployment | DONE 21:25 | Section 12. |

## 2. Environment
| Item | 10-box | c1 |
|---|---|---|
| VICIdial build | 260515-1937 | 260515-1937 |
| MariaDB | 10.6.28 | 10.6.28 |
| sql_mode | NO_ENGINE_SUBSTITUTION | NO_ENGINE_SUBSTITUTION |
| binlog / replication | MIXED; replica file/pos (Using_Gtid No) | MIXED; db2 and db3 use GTID (`Slave_Pos`), log_slave_updates on |
| max_heap_table_size before | 512M everywhere | 512M everywhere |
| Replica crons / keepalives | 12 lines, none of flush/VDauto_dial/adapt; keepalive `1` | db2/db3 same pattern; FILL (keepalive 7) and all cluster maintenance on db1 only |

## 3. MEMORY footprint and heap sizing (max_heap_table_size only; tmp_table_size left at 512M on db1 and 128M on replicas)
- Measured on the 10-box by loading copies of the converted tables: **vicidial_manager 5,033 bytes/row data + 105 bytes/row index = 5,138 bytes/row** (20,000 rows: 100.7 MB data, 2.1 MB index); **vicidial_live_agents 111,848 bytes/row allocated** (300 rows: 33.6 MB; MEMORY allocates fixed-width blocks, so this exceeds the 56,543-byte avg_row_length).
- c1 peak today: 6,807 dials/minute (db3 dial_log, 10:26), ~1.9 manager rows per dial (Originate + Redirect + Hangup mix measured at 386,695 rows per 118 min). Rows live up to retention + cadence = 480 s: **~100k rows = ~510 MB at peak, over the old 512M limit** (the 4-minute cron alone would have hit "table is full" on a bad minute). 2G holds ~400k rows = about three missed flushes at peak. live_agents at 500 agents = 56 MB.
- The limit attaches at ALTER time (`information_schema.tables.max_data_length`): 2042 MB / 1992 MB now on db1, db2 and db3. Changing the global later requires re-running `ALTER TABLE ... ENGINE=MEMORY` in a session with the new value. The replica applier threads were restarted after `SET GLOBAL` so they carried 2G when the ALTER replicated.

## 4. Readers of the trimmed tables (code inspection)
| Table | Written by | Read by | Effect of the new retention |
|---|---|---|---|
| vicidial_manager (240 s, any status) | agent clients (manager_send.php), AGIs, VDauto_dial | AST_manager_send.pl (status NEW only, within ~1 s), reports (history) | pending commands older than 240-480 s are deleted unprocessed (section 1 #8). |
| vicidial_sessions_recent (240 s) | manager_send.php (transfers), AGIs | vdc_db_query.php `manDiaLnextCaLL` dial_ingroup path and api.php: `call_date > NOW() - 5 MINUTE` lookup of other agents' sessions for a lead; ADMIN_keepalive_ALL.pl housekeeping | the 5-minute lookup effectively becomes 4 minutes. No authentication or routing use. |
| vicidial_sip_event_recent (480 s) | AST_manager_sip_AMI2.pl | conf_exten_check.php and vdc_db_query.php (180/183 check for the current manual dial), agi-VDAD_ALL_outbound.agi (dial timings of the current call) | all within seconds of the call; diagnostics beyond 8 minutes live in vicidial_sip_event_log, not this table. |
| cid_channels_recent* (121 s, unchanged) | AST_update_AMI2.pl | agi-VDAD_local_optimize.agi (routing lookup for the current call) | unchanged window; table stays small (9.6k rows vs 61.6k under the hourly cron). |
| parked_channels_recent (ended parks 240 s) | manager_send.php | FastAGI_log.pl | active parks have NULL end time and are never deleted. |
| routing_initiated_recordings (240 s) | AGIs | manager_send.php / vdc_db_query.php `processed='0' ... order by launch_time desc limit 1` | feature unused here; window shrinks from 1 h to 4 min. |
| vicidial_dtmf_log, vicidial_agent_vmm_overrides (240 s) | listen daemons, agent screen | agent screen during the call; archive | within-call data. |

## 5. Test rig (temporary, all prefixed LT; teardown list in section 11)
40 users/phones (EXTERNAL => `Local/LTnnn@lt-agent`, auto-answer), campaign LTCAMP (RATIO 2.0, prefix 77, exten 8365), 3,000 recycled leads, loopback SIP carrier LTLOOP into sip1 (ring 2-5 s, answer, talk), in-groups LTIG_RANK (inbound_group_rank: LT001-005 rank 9, LT006-010 rank 5, rest 1) and LTIG_WAIT (longest_wait_time), DIDs 7777771001/1002, inbound test calls as real SIP legs (`Local/<DID>@lt-origin` -> `SIP/LTLOOP`; Local-channel calls are rejected by agi-VDAD_ALL_inbound.agi), a Python simulator (`ltsim.py`) speaking the stock agent protocol (login, regCLOSER, VDADready, per-second conf_exten_check + VDADcheckINCOMING, manager_send Hangup, manDiaLlogCaLL end, updateDISPO, VDADready, userLOGout) and a scriptable agent (`agentctl.py`) used for the manual, transfer, park, three-way and prompt tests. Simulator defects fixed during the day: missing conf_exten_check (lag-pause after 30 s), hangup sent to the wrong endpoint (vdc_db_query has no Hangup action), relogin flag, agent_log_id not advanced. The last one was never fully fixed, so `vicidial_agent_log` timing columns are not used; READY-to-call wait is computed from the simulator's own timestamps.

## 6. Load phases, MyISAM vs MEMORY (40 agents, 22 minutes each, same rig)
| Metric | MEMORY #1 (19:06-19:29) | **MyISAM baseline** (19:29-19:52, hourly flush) | **MEMORY #2** (19:52-20:15, 4-min flush) |
|---|---|---|---|
| Dials / delivered to an agent | 4,305 / 4,117 (4-min lead gap) | 5,570 / 5,342 | 5,471 / 5,252 |
| DROP % | 4.4 | 4.1 | 4.0 |
| Simulator request errors | 0 | 0 | 0 |
| Duplicate assignment / duplicate uniqueid / duplicate manager Originate | 0 / 0 / 0 | 0 / 0 / 0 | 0 / 0 / 0 |
| Lag-paused agents | 0 | 0 | 0 |
| Poll p50 / p95 / p99 / max ms | 10 / 25 / 28 / 45 | 19 / 27 / 29 / 42 | 18 / 27 / 28 / 37 |
| Table lock waits per 20 s avg / max; waited ratio | 291 / 1,142 (idle-poll spike); 0.84% | 151 / 218; 0.45% | 174 / 284; 0.52% |
| DB threads max / slow queries | 72 / 0 | 75 / 0 | 74 / 0 |
| vicidial_manager rows max / oldest | 4,041 / 467 s | 13,523 / 1,620 s | 15,699 / 1,904 s before the first 4-min flush, then <= 3,214 / 387 s |
| Flush runs in window | 6 x 0 s | none | 5 runs: 1 s, then 0 s |
| cid_channels_recent sip1 rows / oldest | - | 61,557 / 1,574 s | 9,599 / 300 s |
| Replica | 40 rows mirrored, 0 s, 0 errors | same | same |

Functional pass; **performance benefit on c1 not demonstrated**: at 40 agents / ~70 calls / one dialer the database is idle under both engines. The c1 failure mode (113-785 threads behind one live_agents lock for 1-3 s at 250 agents, 2,500 calls, 30 dialers) cannot be produced on the 10-box. Rollback test (19:29): schema identical to the pre-change dump (TEXT NULL, MyISAM, BTREE), crontab restored, replica followed, the MyISAM phase then ran clean on that state.

## 7. Delay A/B on the 10-box (engine unchanged: MEMORY)
Measured with 20 agents, 6 minutes each, sip1 local AST_VDauto_dial.pl loop and db1 FILL loop at the defaults (2.5 s) versus `--delay=0.5` launched directly:

| Metric | A: 2.5 s loops | B: 0.5 s loops |
|---|---|---|
| sip1 autodial log lines per 20 s (loop cadence proxy) | 73 | 976 |
| READY-to-call wait from simulator timestamps (723 / 722 calls): avg / p50 / p90 / max | 1.19 / 1.05 / 1.05 / 8.3 s | 1.30 / 1.05 / 1.05 / 14.5 s |
| Dials / delivered / DROP % | 795 / 704 / 11.4 | 875 / 722 / 17.5 |
| DB statements per 20 s (Table_locks_immediate) / lock waits avg / ratio | 21,642 / 81 / 0.37% | 27,474 / 88 / 0.32% |
| Pending NEW commands max / age | 3 / 1 s (the 367 s sample is the deliberate aged row) | 2 / 1 s |
| Duplicates | 0 | 0 |

Result: no wait-time benefit at ratio 2 on a mixed host (the client polls once per second, which bounds the measurement), 27% more database statements and a higher drop rate. Not recommended for c1.

## 8. FILL / autodial delay: documentation vs installed code
- docs/LOAD_BALANCING.txt line 41: `--autodial-delay=X` "will allow you to set the delay to 100 milliseconds for these agent-only servers (the default is 2500ms)"; `--adfill-delay=X` on the FILL host "lower it down to 500ms if needed".
- Installed `ADMIN_keepalive_ALL.pl` lines 355-385: the value is run through `s/\D//gi` (digits only) and passed as `--delay=<digits>`; `AST_VDauto_dial.pl` line 199 and `AST_VDauto_dial_FILL.pl` line 106 treat `--delay` as **seconds** (`loop_delay = X * 1000` ms). Demonstrated on the 10-box: `-adfill-delay=0.5` -> child `--delay=05` -> **5 s loop** (16 log lines per 20 s vs 33 at the default); `-adfill-delay=100` -> `--delay=100` -> 100 s. A child launched directly with `--delay=0.5` runs at 500 ms (164 lines per 20 s) and survives later keepalive runs, but any restart relaunches it from the cron flags, which can only express whole seconds. Rollback: `screen -S ASTVDadFILL -X quit` (or ASTVDauto on a dialer), then run the keepalive.
- c1 map (db3 `phones` + `servers`): **all 30 sip hosts are mixed** (637 webphones each, 200 trunks, balance Y); FILL host = db1 (keepalive `1579E`), FILL running with default 2.5 s; local autodial on every sip at default 2.5 s (keepalive `--cu3way` only). There are no agent-only hosts, so the documented 100 ms local option does not apply, and the FILL loop only acts on trunk shortages (overflow), not on the normal agent-to-dial path. **Nothing changed on c1 for delays.**

## 9. Monitoring (`/root/premig/flushmon.sh`, cron every minute on db1; CSV `/var/log/astguiclient/flushmon.csv`, alerts `flushmon-alerts.log`)
Columns: time, manager rows, oldest manager row (s), pending NEW count, oldest pending (s), live_agents rows, seconds since last flush, last flush runtime, flush processes running, max % of attached capacity, "table is full" errors in daemon logs, per-table capacity. Alerts: oldest row > 540 s (rows legitimately reach 480 s just before a flush), oldest pending > 30 s (AST_manager_send stalled), last flush > 360 s ago (cron missed), runtime > 60 s, more than one flush process (overlap), capacity > 70%, any "is full" error. Installed on c1 db1 and the 10-box. First c1 readings: 13-25 manager rows, 7% capacity, pending 0.

## 10. Replica recovery procedure (c1 operations)
- **Primary (db1) restart**: both MEMORY tables are truncated on all hosts through the binlog; all agents must re-login (already true today for vicidial_hopper and vicidial_auto_calls). Nothing to resync.
- **Replica (db2 or db3) restart**: its copies come back empty and silently diverge (section 1 #2); reports read from db2 will be wrong until resync or until every agent re-logs in. Run from the desktop: `resync-orch.sh mtc1-db1 mtc1-db2` (or mtc1-db3). It uses GTID `UNTIL master_gtid_pos` on c1 automatically, holds a table READ lock on db1 for under a second, never writes to the replica's binlog, and never re-issues a manager command. It is safe while agents are logged in; the agreement check at the end is taken a few seconds apart, so rows that changed in between show as differences; re-run the check or compare counts once traffic quiets.

## 11. 10-box fixtures and teardown
Fixtures remain in place for further tests. Teardown: on mt-db1 `mysql asterisk < /root/premig/LOADTEST-teardown.sql` then `UPDATE servers SET rebuild_conf_files='Y' WHERE server_ip='173.201.38.33'`; on mt-sip1 remove `/etc/asterisk/extensions-lt.conf` and its `#include` line, `dialplan reload`; on mt-admin remove `/root/lt`; on mt-db1 remove the `flushmon.sh` cron line if not wanted there, `/root/premig/lt-resetter.sh`, samplers. The 10-box database settings left as deployed on c1 (MEMORY tables, 8000/8000/1000, 4-min flush); its heap limit is still 512M (`ALTER ... ENGINE=MEMORY` again after raising it if the 10-box is ever used for a peak test). `mt-agent:/var/www/html/agc` was set root:apache 775 (same fix as c1).

## 12. c1 deployment record (21:24-21:33, Steve: "go ahead and change to the memory tables")
Pre-checks: 0 logged-in agents, 0 NEW manager rows, 0 inbound waiting rows, no DDL running, db2/db3 Yes/Yes/0 s/0 errors (43 stale XFER rows in vicidial_auto_calls from today's three-way legs were left alone; the change does not touch that table).
Backups on db1 `/root/premig`: `c1-live_agents+manager-BEFORE-memory-20261013-212433.sql` (both tables), `c1-crontab-BEFORE-flush4min-20261013-212433.txt`, `c1-my.cnf-BEFORE-heap-20261013-212433` and per-host `c1-my.cnf-BEFORE-heap2G-*`, `c1-create-vicidial_{live_agents,manager}-BEFORE-*.txt`, read-only capture `c1-capture-20261013-210232/` (SHOW CREATE, SHOW INDEX, variables, crontab, keepalives, servers, flush script copy).
Steps: (1) `max_heap_table_size=2G` in `/etc/my.cnf` and `SET GLOBAL` on db2, db3, db1; replica SQL threads restarted; tmp_table_size untouched. (2) `c1-DEPLOY-memory-recipe.sql` on db1 (`SET SESSION max_heap_table_size=2147483648` + the five ALTERs): 16 ms; verified MEMORY, 8000/8000/1000, HASH indexes, max_data_length 2042/1992 MB on db1, db2, db3, replication clean. (3) db1 crontab: hourly `11 * * * * AST_flush_DBqueue.pl -q` -> `1,5,9,...,57 * * * * AST_flush_DBqueue.pl --seconds=240 --session-flush -q`; `flushmon.sh` every minute. (4) Manual flush 1.6 s; cron flushes at 21:26 (2 s), 21:29, 21:33 (0 s). (5) Dummy live_agents + manager rows inserted/updated/deleted on db1 and seen on db2 and db3. (6) No DBD/SQL/"is full" errors in db1 or sip1 daemon logs afterwards. (7) Scheduled task `mtc1-live-agents-memory-conversion` deleted (it carried the old 200/200/45 sizes). (8) Lock monitor re-armed on db1 through tomorrow 19:00 (`/root/premig/lockmon-tomorrow.sh`, log `lockmon-YYYYMMDD.log`).

Rollback (drained: 0 agents, 0 NEW rows): `mysql asterisk < /root/premig/c1-ROLLBACK-memory-recipe.sql` (ENGINE=MyISAM, TEXT NULL columns restored from the captured definition) then `crontab /root/premig/c1-crontab-BEFORE-flush4min-20261013-212433.txt`. Heap 2G can stay. Rows are transient and are not restored (restoring the dump would re-issue the 299 manager commands it contains).

## 13. Trial acceptance and rollback triggers for tomorrow's shift (bounded peak comparison)
Baseline from today's `/root/premig/lockmon-20261013.log` (same dial level 20, AMDY, import pattern; coordinate with the client so those do not change tomorrow): lock-wait rate 0.3-9% with peaks 2-14 s, live_agents freeze storms of 113-785 waiting threads, web 500s 0 after 16:55, agent poll p95 ~0.3 s, PDROP 1-2.7%.
Accept the change for the day if, at comparable agent count and dial level: peak table-lock wait rate and longest wait do not exceed today's; no "Waiting for table metadata lock" pileup above 200 threads lasting over 3 s; agent 500s stay at 0; PDROP and DROP not worse than today by more than 1 point; routing stays correct (no duplicate uniqueid in closer_log, no duplicate manager Originate); `flushmon` raises no capacity, overlap, runtime or pending-age alert; db2/db3 stay under 60 s lag and real-time report counts match db1 within one poll.
Roll back (at the next lull, after the drain procedure below) if any of: "table is full" error, `flushmon` pending-age alert that persists for 2 minutes, flush runtime over 60 s twice, lock storms clearly worse than today's, or any routing anomaly attributable to the tables.
Drain procedure for rollback: announce, set campaigns' dial level to 0 (stop originates), wait until `vicidial_auto_calls` has no LIVE/IN rows and `vicidial_manager` has no NEW rows, have agents log out (or accept that they must re-login), then run the rollback SQL and restore the crontab; replicas follow via the binlog.
