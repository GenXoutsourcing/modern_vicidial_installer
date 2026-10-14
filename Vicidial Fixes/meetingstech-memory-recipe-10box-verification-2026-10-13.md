# MEMORY recipe verification on the MeetingsTech 10-box (2026-10-13)

Scope: VICIdial Group's documented conversion of `vicidial_live_agents` and `vicidial_manager` to ENGINE=MEMORY plus a 4-minute `AST_flush_DBqueue.pl` cron, tested on the idle 10-box (mt-*) per the reviewer's checklist. **c1 was not touched.** The 18:20 c1 conversion task is disabled pending review of this report.

## 0. Corrections accepted from the review

| # | Review point | Finding | Action |
|---|---|---|---|
| 1 | Column sizes must match the installed revision | Docs bundled with build 260515-1937 (`/usr/src/astguiclient/trunk/docs/LOAD_BALANCING.txt` lines 29-31, `BASE_INSTALL.txt` 313-315) say **VARCHAR(8000) / VARCHAR(8000) / VARCHAR(1000)**. My earlier 200/200/45 came from an old forum thread. A c1 user has a **4,923-character** `closer_campaigns` value and c1 has 170 in-groups (2,427 chars if all assigned); sql_mode is `NO_ENGINE_SUBSTITUTION` only, so 200 would have **silently truncated** in-group membership at login. | 10-box re-altered to 8000/8000/1000 (18:09). Deploy SQL rewritten. |
| 2 | Skipped replication errors hide divergence | Confirmed: after a replica-only restart the replica's MEMORY tables are empty while the primary keeps its rows; later UPDATE/DELETE on those rows produce **no error and no skipped-error counter** (statement format, 0 rows matched). Only new INSERTs reappear. | Divergence demonstrated and a resync procedure verified (section 4). Operational rule added. |
| 3 | Measure the whole flush script | It deletes from 14 tables and runs **23 OPTIMIZE TABLE** statements, including on MyISAM config tables (`vicidial_campaigns`, `vicidial_lists`, `vicidial_users`, `vicidial_inbound_groups`, `system_settings`) and all `cid_channels_recent_*`. On MEMORY tables OPTIMIZE is a no-op. The script has **no run-lock**. | Per-run runtime captured from `vicidial_internal_log` in every load phase (section 6). |
| 4 | Rollback must restore exact schema | `ENGINE=MyISAM` alone leaves VARCHAR columns. | Rollback SQL restores `TEXT DEFAULT NULL` columns, MyISAM, stock crontab; verified with a diff against the pre-change `SHOW CREATE TABLE` (section 7). Rows are deliberately not restored. |

## 1. Environment (before changes)

| Item | 10-box (mt-*) | c1 (for comparison) |
|---|---|---|
| VICIdial build | 260515-1937 (installer 260529-0914) | 260515-1937 |
| MariaDB | 10.6.28-MariaDB-log | 10.6.x |
| sql_mode | NO_ENGINE_SUBSTITUTION (non-strict: silent truncation) | NO_ENGINE_SUBSTITUTION |
| binlog_format / replication | MIXED; optimistic parallel, 20 threads; slave_skip_errors 1032,1062,1690; replica log_slave_updates=1, read_only=1 | same |
| max_heap_table_size | 512 MB on primary and replica (session default = global) | 512 MB on db1, db2, db3 |
| Replica crontab / keepalives | replica runs 12 cron lines, none of them flush/VDauto_dial/adapt/cleanup; keepalive `1` only. Cluster maintenance runs once, on the primary. | db2/db3 same pattern (verified 10-12) |
| Stock MEMORY tables already present | vicidial_hopper, vicidial_auto_calls, live_channels, live_sip_channels, parked_channels, server_updater, vicidial_campaign_server_stats, web_client_sessions | same schema |

Schema and index snapshots saved: `mt-db1:/root/premig/schema-db1-20261013-181133.txt`, `mt-db2:/root/premig/schema-db2-20261013-181155.txt`, stock CREATEs `mt-db1:/root/premig/STOCK-create-vicidial_live_agents.sql` and `STOCK-create-vicidial_manager.sql` (from the pre-change dump `live_agents+manager-BEFORE-memory-20261013-140928.sql`). Full crontab backup `mt-db1:/root/premig/crontab-BEFORE-flush4min-20261013-140951.txt`.

### MEMORY footprint (fixed-width rows)
| Table | Bytes per row (MEMORY, 8000/8000/1000) | At 300 agents / c1 peak manager | Rows that fit in 512 MB |
|---|---|---|---|
| vicidial_live_agents | 56,543 | 17 MB | ~9,500 rows |
| vicidial_manager | 3,563 | c1 writes ~3,300 rows/min at end of shift (386,695 rows in 118 min); peak hour est. ~8,000/min => ~64,000 rows in an 8-minute window = 230 MB | ~150,000 rows |

Recommendation for c1: raise `max_heap_table_size` (and `tmp_table_size`) to 1 GB on db1/db2/db3 before converting, so vicidial_manager cannot hit "table is full" if a flush run is missed.

### Index types
All indexes become HASH on MEMORY (stock recipe). VDauto_dial uses `last_update_time <` ranges and `ORDER BY last_call_time` on live_agents; with ≤ 300 rows these are full scans measured in microseconds. `USING BTREE` could be added to the three time indexes but that deviates from the published recipe; not done.

## 2. What populates the three resized columns
`closer_campaigns` is copied from the agent's in-group choice at login (`vicidial.php` line 5326) and on every regCLOSER (`vdc_db_query.php` 2063); `external_ingroups` is set by the agent API (13091, 15383); `agent_territories` by regTERRITORY (2248). A full in-group assignment is the worst case: c1 = 2,427 characters today, 8,000 allows ~3x growth. c1 has 0 territories.

## 3. Flush script analysis (`AST_flush_DBqueue.pl --seconds=240 --session-flush`)
- DELETEs: vicidial_manager (< now-240 s), vicidial_dtmf_log, routing_initiated_recordings, parked_channels_recent, cid_channels_recent + cid_channels_recent_<ip> (**always < now-2 min, independent of cron cadence**), vicidial_agent_vmm_overrides, vicidial_sip_event_recent (2 h), vicidial_3way_press_live (6 h), server_live_* (12 h), vicidial_sessions_recent (1 h, --session-flush), recording_live finished rows.
- OPTIMIZE TABLE on 23 tables; MEMORY tables return "storage engine doesn't support optimize" (instant). On c1 the MyISAM tables it touches are small except vicidial_sessions_recent (150k rows, 7.5 MB) and vicidial_manager itself today (153k rows, 32 MB, rebuilt every hour under a write lock, which the conversion removes).
- The cid_channels_recent window is unchanged by the cadence (2 minutes); the 4-minute cron only keeps the tables from growing to an hour of rows between runs.
- No overlap guard in the script: a run longer than 4 minutes would overlap the next. Runtime measured below.

## 4. Replica restart and divergence test (drained, 10-box)
Controlled rows LTTEST1-3 (PAUSED/READY/INCALL) + 1 manager row inserted on the primary and confirmed on the replica.

| Step | Result |
|---|---|
| `systemctl restart mariadb` on replica (1.07 s) | Replica: live_agents 0, manager 0; Slave_IO/SQL Yes, 0 s behind, Last_Errno 0, Slave_skipped_errors 0 |
| Primary: UPDATE 3 rows, INSERT LTTEST4, DELETE LTTEST1 | Primary: LTTEST2,3,4. Replica: **LTTEST4 only**. Replication status clean, skipped errors 0 => **silent divergence** (MIXED binlog sent the UPDATE/DELETE as statements that matched 0 rows). |
| Resync as root on replica: `mysqldump -h <primary> -u<astguiclient> --no-create-info --replace --skip-triggers --skip-lock-tables asterisk vicidial_live_agents vicidial_manager \| mysql --init-command="SET sql_log_bin=0" asterisk` | CHECKSUM TABLE identical on both (live_agents 731684192, manager 2753996687) |
| Primary restart (3.54 s) | Primary tables empty; binlog carries `TRUNCATE TABLE vicidial_live_agents` / `vicidial_manager` (and vicidial_hopper, already MEMORY in stock). Replica IO thread reconnects within its 60 s retry and applies the TRUNCATE: replica 0/0. Daemons reconnected, VDhopper refilled 59 rows. |

Operational rule for c1: after any **replica** restart (db2 or db3) run the resync above from that replica (safe: REPLACE, no binlog), or accept that reports read from db2 miss agents who logged in before the restart until they re-login. After a **primary** restart all agents must re-login (true today for vicidial_auto_calls and vicidial_hopper as well).

## 5. Test rig (temporary, all prefixed LT)
40 users/phones (EXTERNAL protocol => `Local/LTnnn@lt-agent`, auto-answer), campaign LTCAMP (RATIO 2.0, prefix 77, exten 8365 no AMD), 3,000 leads, loopback SIP carrier LTLOOP into context lt-behave on sip1 (ring 2-5 s, answer, 15-45 s), in-groups LTIG_RANK (inbound_group_rank; LT001-005 rank 9, LT006-010 rank 5) and LTIG_WAIT (longest_wait_time), DIDs 7777771001/1002, inbound test calls originated as real SIP legs (`Local/<DID>@lt-origin` -> `SIP/LTLOOP`), and a Python simulator on mt-admin that speaks the stock agent protocol (login, regCLOSER, VDADready, per-second conf_exten_check + VDADcheckINCOMING, Hangup, manDiaLlogCaLL end, updateDISPO, VDADready, userLOGout) and logs every request's latency. Teardown: `mt-db1:/root/premig/LOADTEST-teardown.sql` + `UPDATE servers SET rebuild_conf_files='Y' WHERE server_ip='173.201.38.33'`; sip1: remove `/etc/asterisk/extensions-lt.conf` and its `#include` line, `dialplan reload`; mt-admin `/root/lt`.

Two 10-box defects found and fixed on the way (same fixes as c1): `/var/www/html/agc` was root:root 755 so PHP 8 fataled on `fwrite(false)` (HTTP 500 on manDiaLlogCaLL); the stock PHP 8 mysqli exception default was already fixed earlier today.

## 6. Load phases (40 simulated agents, RATIO 2.0, 22 minutes each, identical rig)

Phase order: MEMORY (#1) -> rollback -> MyISAM baseline -> redeploy -> MEMORY (#2). MEMORY #1 lost ~4 minutes of dialing (19:17-19:21) when the 3,000-lead list was exhausted; lead recycling was added before the baseline, so **MyISAM vs MEMORY #2 is the like-for-like pair**. Sampler on db1 every 20 s (`/root/premig/ltsample-<phase>.csv`), request latency from the simulator (`mt-admin:/root/lt/<phase>.csv`).

| Metric | MEMORY #1 (19:06-19:29) | **MyISAM baseline** (19:29-19:52, stock hourly flush) | **MEMORY #2** (19:52-20:15, 4-min flush from 19:57) | Pass? |
|---|---|---|---|---|
| Dials (vicidial_log) / answered to an agent | 4,305 / 4,117 | 5,570 / 5,342 | 5,471 / 5,252 | equal within 2% |
| DROP % (ratio 2.0 with 5-12 s agent talk) | 4.4 | 4.1 | 4.0 | pass |
| Simulator request errors (all actions) | 0 of 50,600 | 0 of 34,500 | 0 of 35,200 | pass |
| Duplicate call assignment (sim) / duplicate uniqueid in vicidial_log | 0 / 0 | 0 / 0 | 0 / 0 | pass |
| Duplicate manager Originate (non-keepalive callerids) | 0 | 0 | 0 | pass |
| Agents lag-paused / logged out by VDauto_dial | 0 | 0 | 0 | pass |
| Agent poll `VDADcheckINCOMING` ms p50 / p95 / p99 / max | 10 / 25 / 28 / 45 | 19 / 27 / 29 / 42 | 18 / 27 / 28 / 37 | no regression |
| `conf_exten_check` p50 / p95 / max | 15 / 22 / 25 | 18 / 22 / 26 | 18 / 22 / 25 | no regression |
| `manDiaLlogCaLL` (call end) p50 / p95 / p99 / max | 19 / 40 / 54 / 73 | 19 / 36 / 50 / 74 | 19 / 35 / 46 / 62 | no regression |
| Login p50 / max | 62 / 73 | 59 / 68 | 58 / 67 | no regression |
| Table lock waits per 20 s avg / max; waited-to-immediate ratio | 291 / 1,142 (spike = 40 idle agents polling during the lead gap); 0.84% | 151 / 218; 0.45% | 174 / 284; 0.52% | **no measurable change at this scale** |
| DB threads max / slow queries (>3 s) | 72 / 0 | 75 / 0 | 74 / 0 | DB never the bottleneck |
| vicidial_manager rows max / oldest row | 4,041 / 467 s | 13,523 / 1,620 s (still growing, no flush in window) | 15,699 / 1,904 s before the first 4-min flush, then <= 3,214 / 387 s | bounded by the 4-min cron |
| Flush runs inside the window (`vicidial_internal_log`) | 6 runs, "Run seconds: 0" each | none (hourly :11 fell outside) | 5 runs: first 1 s (cleared 14k manager rows), then 0 s | no overlap possible |
| cid_channels_recent_<sip1> rows / oldest | not sampled | 61,557 / 1,574 s | 9,599 / 300 s | 2-minute window kept; table 6x smaller |
| Replica (mt-db2): live_agents mirrored / lag / errors | 40 / 0 s / 0 | 40 / 0 s / 0 | 40 / 0 s / 0 | pass |
| sip1 load average (12 cores; loopback doubles SIP legs) | ~8 | up to 12.3 | ~6 | telephony is the rig's ceiling |

Not valid in this run: `vicidial_agent_log` wait/talk averages (the simulator did not advance `agent_log_id` after each VDADready, so every call updated the login row). Call-to-agent routing delay was therefore measured through inbound `queue_seconds` (section 8) and the DROP rate, not through agent_log.

## 7. Rollback test (19:29, drained: 0 agents, 0 NEW manager rows)

| Check | Result |
|---|---|
| `ROLLBACK-memory-recipe.sql` (5 ALTERs) | 0.035 s |
| `SHOW CREATE TABLE` vs pre-change dump (AUTO_INCREMENT ignored) | **identical** for both tables (TEXT NULL columns, MyISAM, BTREE PRIMARY and last_call_finish) |
| Crontab restored from backup | hourly `11 * * * * AST_flush_DBqueue.pl -q` back |
| Replica | engines MyISAM on mt-db2, Slave_IO/SQL Yes, 0 s behind, Last_Errno 0 |
| Agent login + call routing afterwards | the MyISAM load phase ran on exactly this state: 40 logins, 5,342 calls delivered, 0 errors (section 6) |
| Transient state | both tables were empty at rollback time; the ALTER keeps rows if any exist, so the pre-condition is 0 agents and 0 `status='NEW'` manager rows. Stale call-control rows are never replayed from a dump. |

Redeploy (19:52): `DEPLOY-memory-recipe.sql` 0.121 s, engines MEMORY on primary and replica, columns varchar(8000)/(8000)/(1000), replica clean. The crontab sed in my chain script missed the stock `11 * * * *` line; the 4-minute line was installed by hand at 19:53 (45 s into the third phase), which is why that phase's first flush is at 19:57.

## 8. Inbound routing test (20:15-20:20, MEMORY state, outbound dialing off, 10 agents READY)

Calls were originated as real SIP legs (`Local/<DID>@lt-origin` -> `SIP/LTLOOP` -> `trunkinbound` -> `agi-DID_route.agi` -> `agi-VDAD_ALL_inbound.agi`), one every 12 s, with a snapshot of READY agents ordered by `last_call_finish` taken just before each originate. Agents talk 4-6 s, so every agent was READY again before the next call.

| In-group / method | Calls | Agent that took each call | Expected | Result |
|---|---|---|---|---|
| LTIG_RANK, `inbound_group_rank` (LT001-005 rank 9, LT006-010 rank 5) | 8 | LT001 x8 | highest rank first; never a rank-5 agent while a rank-9 agent is idle | pass |
| LTIG_WAIT, `longest_wait_time` | 8 | LT002, LT003, LT004, LT005, LT006, LT007, LT009, LT008 | the READY agent with the oldest `last_call_finish` each time | pass (LT008/LT009 shared the same finish second; the tie went LT009 then LT008) |
| Both | 16 | `queue_seconds` 0.00 on every row, `length_in_sec` 5-24 | | pass |
| Duplicate uniqueid in `vicidial_closer_log` / calls left in `vicidial_auto_calls` | 0 / 0 | | | pass |

Earlier attempts in this session surfaced two facts worth keeping: `agi-VDAD_ALL_inbound.agi` exits silently for calls arriving on a Local channel (so test calls must come in on a real SIP/IAX channel), and in-groups cloned from the client's config carry their business-hours call time (the first test call logged AFTHRS).

## 9. Deployment and rollback commands (c1)

Deploy (primary only, no agents logged in, after raising max_heap_table_size to 1G on db1/db2/db3):
```sql
ALTER TABLE vicidial_live_agents MODIFY closer_campaigns VARCHAR(8000) default '';
ALTER TABLE vicidial_live_agents MODIFY external_ingroups VARCHAR(8000) default '';
ALTER TABLE vicidial_live_agents MODIFY agent_territories VARCHAR(1000) default '';
ALTER TABLE vicidial_live_agents ENGINE=MEMORY;
ALTER TABLE vicidial_manager ENGINE=MEMORY;
```
Crontab on db1 (replace the hourly flush line):
```
1,5,9,13,17,21,25,29,33,37,41,45,49,53,57 * * * * /usr/share/astguiclient/AST_flush_DBqueue.pl --seconds=240 --session-flush -q
```
Rollback (primary only, no agents logged in; rows are transient and must NOT be replayed):
```sql
ALTER TABLE vicidial_live_agents ENGINE=MyISAM;
ALTER TABLE vicidial_live_agents MODIFY closer_campaigns TEXT DEFAULT NULL;
ALTER TABLE vicidial_live_agents MODIFY external_ingroups TEXT DEFAULT NULL;
ALTER TABLE vicidial_live_agents MODIFY agent_territories TEXT DEFAULT NULL;
ALTER TABLE vicidial_manager ENGINE=MyISAM;
```
then `crontab /root/premig/crontab-BEFORE-flush4min-<ts>.txt` on db1. Stale vicidial_manager rows: a MEMORY->MyISAM ALTER keeps whatever rows exist at that moment; do it only when `SELECT COUNT(*) FROM vicidial_manager WHERE status='NEW'` is 0 so no Originate/Redirect/Hangup command is re-issued.

## 10. Recommendation

Against the reviewer's four gates:

| Gate | Met on the 10-box? | Evidence |
|---|---|---|
| Routing remains correct | **yes** | 16/16 inbound calls to the expected agent, 0 duplicate assignments in 14,700 outbound deliveries, 0 duplicate manager commands, queue_seconds 0 |
| Replication recovery demonstrated | **yes, with a caveat** | replica restart leaves the replica's MEMORY tables empty and later updates diverge silently; the resync command restores identical checksums; a primary restart truncates both sides via the binlog |
| Flushes do not overlap or stall | **yes** | 11 runs at 0-1 s with no run-lock needed; manager and cid tables bounded |
| Representative load shows measurable improvement | **no** | at 40 agents / ~70 concurrent calls / one dialer the DB is idle in both engines (lock-wait ratio 0.45% vs 0.52%, poll p95 27 ms vs 27 ms). The only measured improvements are structural: vicidial_manager stays under ~3,200 rows instead of 15,700, cid_channels_recent 6x smaller, and the hourly OPTIMIZE write lock on a 32 MB MyISAM manager table disappears |

Recommendation: the recipe is **safe, reversible and functionally correct** on this build, and nothing in the test argues against it. It does **not** demonstrate the c1 benefit, because the c1 failure mode (113-785 threads queued behind one `vicidial_live_agents` table lock for 1-3 s at 250 agents, 2,500 calls and 30 dialers) does not occur on a 40-agent single-dialer rig in either engine. The expected c1 gain is shorter lock hold time per statement (memory operations vs MyISAM key-cache/disk writes), which only shows when the lock is saturated. Whether to deploy on c1 on the strength of VICIdial Group's recipe plus this correctness evidence is the reviewer's call. If deployed, the preconditions are: `max_heap_table_size`/`tmp_table_size` = 1G on db1, db2, db3 first; apply while 0 agents are logged in and 0 manager rows are NEW; install the 4-minute cron on db1 only; after any db2/db3 restart run the resync; after a db1 restart all agents re-login; keep the rollback SQL and crontab backup on db1; watch the first shift with the lock sampler and be ready to roll back at the first lunch lull.

## 11. Scale limitations of the 10-box test
- 40 agents, dial level 2, one dialer (sip1, 12 cores) with a loopback carrier that doubles SIP legs; sip1 reached load 12 while db1 sat at 50-75 threads and 0 slow queries. c1 runs 250 agents, 2,000-3,000 calls, 30 dialers and 4 web servers: the per-second statement rate on vicidial_live_agents was roughly 10x lower here.
- The MyISAM baseline window contained no hourly flush, so the cost of the stock hourly `OPTIMIZE TABLE vicidial_manager` (32 MB on c1) was not measured, only removed.
- Replica lag could not be stressed (write rate far below c1's 1 GB binlog per 7-8 minutes); divergence and recovery were demonstrated functionally, not under load.
- The simulated client does not load scripts, forms or lead search, and manual dial, transfers, park, 3-way and conference prompts were not exercised. PAUSED/READY transitions were exercised on every call (manDiaLlogCaLL sets PAUSED, VDADready sets READY).
- `vicidial_agent_log` timing columns were not usable (simulator defect noted above).
- The 10-box ran the test with the client's full configuration copy (9,203 users, 55 campaigns, 170 in-groups) but no real agents or carrier traffic.
