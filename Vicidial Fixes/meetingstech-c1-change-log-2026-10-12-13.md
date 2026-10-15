# MeetingsTech — Change Record 2026-10-12

## c1 (41-box) — ALL CHANGES

| time | change | rollback |
|---|---|---|
| 09:53 | Added `--vlog-daily` to the 00:30 archive cron | `crontab /root/premig/crontab-BEFORE-20261012-095345.txt` |
| 14:05 | Flush cron `11 * * * *` → `11,26,41,56` (15-min) | — |
| 16:19 | **Reverted** flush cron back to hourly | `crontab /root/premig/crontab-BEFORE-flush15-20261012-140534.txt` |
| 16:22 | Agent servers `max_vicidial_trunks` 125 → **0** (AGENT-C1, AGENT1-4) | `/root/premig/agent-servers-trunks-REVERT-*.sql` |
| 16:24 | Deleted **261 phantom** `vicidial_auto_calls` rows (>1hr, not agent-linked) | snapshot: `/root/premig/auto_calls-phantoms-20261012-162308.tsv` |
| 16:27 | Killed my own blocking query on db2 (ID 4639427) | n/a |
| 18:17 | Ran `ADMIN_archive_log_tables.pl --daily --carrier-daily --vlog-daily` manually (711s) | n/a — data preserved in `_archive` |
| 18:59 | Added index `campai_dt_stat_usr(campaign_id,call_date,status,user)` to `vicidial_log` | `ALTER TABLE vicidial_log DROP INDEX campai_dt_stat_usr;` |
| 19:04 | Removed `FORCE INDEX` — `AST_VDadapt.pl` lines 82/83 swapped; VDadapt restarted | `cp /root/premig/AST_VDadapt.pl-BEFORE-20261012-190443 /usr/share/astguiclient/AST_VDadapt.pl` |
| 19:23 | `read_rnd_buffer_size` 16M→2M, `read_buffer_size` 4M→1M, `sort_buffer_size` 4M→2M, `tmp_table_size` 128M→512M | `/root/premig/my.cnf-BEFORE-20261012-192333` |
| 19:25 | **MariaDB restarted** (3s) to verify my.cnf loads clean | n/a |
| 19:32 | `thread_cache_size` 1000 → 2500 | `/root/premig/my.cnf-BEFORE-threadcache-20261012-193257` |

**By the client/you:** campaign 1023 switched to ext 8369 (~16:35) then back to 8370.

### Measured results

- `vicidial_log`: 4,256,330 → **1,644,859 rows** (524 MB → 142 MB). Archive gained exactly those rows — verified identical counts, no data loss.
- `vicidial_amd_log`: 3,107,476 → **1,106,611 rows**
- Index: VDadapt hour-bucket query **485 ms → 84 ms (5.6x)**, plan shows `Using index` (covering scan)
- Integrity: 380 tables checked clean before and after
- Replication: db2 + db3 both 0s, index replicated to both

## 10-box (mt) — CHANGES

| time | change | rollback |
|---|---|---|
| 12:57 | Added `campai_dt_stat_usr` index to `vicidial_log` (test bed) | `ALTER TABLE vicidial_log DROP INDEX campai_dt_stat_usr;` |
| 13:25 | Converted `vicidial_live_agents` to MEMORY — **then REVERTED** | reverted; table back to MyISAM/TEXT/BTREE |
| 18:36 | Removed `FORCE INDEX`, VDadapt restarted | `cp /root/premig/AST_VDadapt.pl-BEFORE-20261012-183654 ...` |

## Other

- SSH key added to Wicked ViciBox box 69.64.69.87 (read-only use; remove with `sed -i '/claude@steve-win11/d' /root/.ssh/authorized_keys`)
- 7-Zip installed on the Windows workstation
- ViciBox ISO mounted at `D:` — dismount when done

---

# KEY FINDINGS

## 1. AMDY failed at 16:18 — vendor issue, not ours

PDROP went 20-60/min to **1,500-2,000/min**. For ten minutes **zero** calls received a machine disposition (`AL/AA/A` = 0) while 15,000 were dropped. Calls entered ext 8370, never got a verdict back, and expired at `drop_call_seconds=30` into safe harbour.

Switching to 8369 fixed it **within one minute** (PDROP to ~20/min, machine dispositions resumed at ~1,200/min).

**TCP 2700 was reachable and `amd.py` was running throughout** — the socket accepted connections while returning no verdicts. Standard connectivity monitoring would not catch this.

**Timestamps for AMDY: failure 16:18, recovery on bypass 16:35.**

## 2. ViciBox ships NO extra indexes

Verified on a genuine ViciBox v11 install: `vicidial_log` has only `PRIMARY`, `call_date`, `lead_id` — identical to the SVN source. The composite index does not exist upstream in any form.

`FORCE INDEX (call_date)` dates to **r618, 2007-05-21** (mattf), with the commented alternative added in the *same* commit. Never revisited in 19 years.

**Wicked has 48 hand-built `idx_*` indexes across 12 tables AND still has `FORCE INDEX` active** — so VDadapt never used any of them. Pure write cost, zero benefit. This is the trap to avoid.

## 3. Replica lag froze the real-time screens — caused by my own query

A 3-way join I ran on db2 held a `vicidial_log` read lock for **778 seconds**, blocking one replication worker; the other 19 stacked behind it (in-order commit). db2 reached 841s lag while db3 held 0s.

Real-time reports read db2, so screens showed stale data — appearing as "1,663 calls stuck" when db1 actually had 512 and churning normally.

**Rule: no aggregate queries on db1 or db2. Use db3.**

## 4. Dial ratio is the root of several symptoms

`dial_level=16`, `available_only_ratio_tally=N`, `drop_call_seconds=30`. At 16 calls per available agent, answers arrive in floods, ~54 get served, the rest expire as PDROP. Produces idle agents **and** mass drops simultaneously. Also drives `vicidial_auto_calls` lock volume (top table at 1,802 observations).

## 5. 92.7% of answered calls are answering machines

Last-2-min sample: MACHINE 3,682 / HUMAN 236 / NOTSURE 56. HUMAN rate declined 6.54% to 4.36% through the day. `dial_statuses` still includes A/AL/AM/AA, so known machines are being redialled.

## 6. "Load 1.5" is not high on this box

64 cores — load 1.78 = 2.8% of capacity. c1's idle baseline is ~1.5-2.0 (not 0.5) because 41 servers' daemons generate **2,067 queries/sec with zero agents**. The 10-box, with 10 servers, idles at 0.49 / 318 q/s.

## 7. The key_buffer "60% rule" doesn't apply here

ViciBox's own config comments say "60% of system RAM" but ViciBox **ships 8 GB on a 62 GB box**. The rule is a proxy for "do the indexes fit in RAM".

c1's entire index set is **3.67 GB**; 125.69 GB is allocated but only **20.36% touched**, hit rate 99.836%. Left unchanged — costs nothing (the 3s restart proves it's virtual address space, not resident).

Wicked by contrast has **43.19 GB of indexes** against 62 GB RAM and only a 95.2% hit rate — there the rule would genuinely help.

---

# MEASURED AND REJECTED — do not revisit

| change | why rejected |
|---|---|
| InnoDB for `vicidial_log` | Matt Florell: MyISAM table locks are used deliberately as an **inter-process semaphore**. InnoDB would break VICIdial's IPC design. Not a performance trade-off — a correctness risk. |
| More slave parallel workers | 19 of 20 already idle on in-order commit. db3 holds 0s on identical config. |
| `vicidial_closer_log` composite index | Measured **7ms to 7ms**. Table is 35k rows vs 1.6M, already has 7 indexes including a composite. |
| `vicidial_live_agents` to MEMORY | 18-28% faster per op = 17-28 **microseconds**. Cost: all agents logged out on any MySQL restart. Also forces 3 TEXT to VARCHAR changes and silently converts all indexes BTREE to HASH. |
| Real-time reports to db1 | They hammer the agent tables (#2 and #4 in contention). Would move load onto the dial path. |
| Real-time to db3, historical to db2 | **Not possible** — `slave_db_server` is a single field; the report lists say *which* reports use the slave, not *which* slave. |

---

# OPEN / TOMORROW

**Measure under load. Baselines:** lock-wait rate **8.92%** at ~200 agents; `vicidial_log` was **44%** of contention; peaks 2-3s routine, 10-14s at the `:11`/`:33` crons.

1. **Did the index work in production?** The 5.6x was measured on an idle server.
2. **`thread_cache_size` 2500** — justified only if `Threads_created` runs well above `Max_used_connections` at peak. Peak was 1,740 today. Revert if not.
3. **`vicidial_auto_calls` HASH to BTREE** — 15 VICIdial query sites filter by time range; HASH cannot serve ranges so they full-scan (`type: ALL, key: NULL`). But the table is only ~2,000 rows under load, so the gain may be unmeasurable. Test on the 10-box with a populated table first.
4. **`:11` and `:33` cron stalls** — `AST_flush_DBqueue.pl` (delete + **12 OPTIMIZE TABLE**) and `AST_cleanup_agent_log.pl`. The 15-min experiment proved the mechanism (92s to 19s run, 13s to 4s lock) but was reverted.
5. **`cid_channels_recent_*`** — 41 tables, ~990 MB, sitting ~30x over their intended 2-minute window because the flush is hourly. The reader enforces its own 2-min bound so nothing breaks, but it's dead weight scanned on every call.
6. **Dial ratio / `dial_statuses`** — client decisions.
7. **Both clusters now diverge from stock VICIdial.** An upgrade overwrites `AST_VDadapt.pl` and restores `FORCE INDEX`, leaving the index costing writes with no benefit. **Add to post-upgrade checklist.**

---

# 2026-10-13 — CHANGES (shift day 2)

| time | change | rollback |
|---|---|---|
| 09:10 | **10-box** `AST_VDadapt.pl` line 83 → `FORCE INDEX (campai_dt_stat_usr)`; VDadapt restarted | `/root/premig/AST_VDadapt.pl-BEFORE-forcenew-20261013-091026` on mt-db1 |
| 11:38 | c1 `AST_VDadapt.pl` reverted to stock (FORCE INDEX call_date) at user request | `/root/premig/AST_VDadapt.pl-noforce-REVERTED-20261013-113724` |
| 12:02 | c1 `servers`: trunks=0 + balance=N on all 11 non-sip servers (db1/2/3, api, admin, archive, LB, agent1-4) | `/root/premig/nonsip-servers-trunks-REVERT-20261013-120216.sql` |
| 12:03 | c1 sip1-30 `max_vicidial_trunks` 125→150 | `/root/premig/sip-servers-trunks-REVERT-20261013-120257.sql` |
| 12:04 | deleted 156 phantom `vicidial_auto_calls` + 147 NEW `vicidial_manager` rows on non-sip servers | snapshots `/root/premig/auto_calls-nonsip-phantoms-20261013-120401.tsv`, `manager-nonsip-NEW-*.tsv` |
| 12:09 | c1 `AST_VDadapt.pl` line 83 → `FORCE INDEX (campai_dt_stat_usr)` (3-min window with broken line 83 while fixing, no SQL errors logged) | `/root/premig/VDadapt-BEFORE-forcenew-*` |
| 12:11 | c1 sip1-30 trunks 150→200 | `/root/premig/sip-servers-trunks150-REVERT-20261013-121115.sql` |
| 12:34 | agent1-4 sysctl `ip_local_port_range=15000 65000`, `tcp_tw_reuse=1` (persisted `/etc/sysctl.d/90-vicidial-tcp.conf`) | `/root/premig/sysctl-tcp-BEFORE-*.conf` on each |
| 12:46 | agent1-4 php-fpm `pm.max_children` 50→200 (reload) | `/root/premig/www.conf-BEFORE-*` |
| 13:02 | php-fpm 200→400 | `/root/premig/www.conf-200-BEFORE400-*` |
| 13:07 | **INCIDENT**: functions.php MXAG-guard sed broke CRLF file → PHP parse error ~20s/server, 3,696 failed polls on agent2 that minute; restored from backup | — |
| 13:09 | functions.php MXAG guard applied correctly (linted work copy) | — |
| 13:16 | functions.php guard **reverted** at user request (user attributes call-routing stall to it; data points to pool size) | patched copies `/root/premig/agc-functions.php-mxag-REVERTED-*` |
| 13:21 | db1 `max_connections` 4000→6000, `thread_cache_size` 2500→4000 (SET GLOBAL + my.cnf) | `/root/premig/my.cnf-BEFORE-maxconn-20261013-132057` |
| 13:30 | php-fpm 400→**150** (bounded DB queue; storms 23k→1.3k contended) | `/root/premig/www.conf-400-BEFORE150-*` |

**Client-side today:** Jesse (2493) + Edwin (122594) hand-set dial levels 1→20; Jesse loaded 1.1M leads 09:16-09:26 via DISABLE/ENABLE KEYS (35-101s agent freezes each); 1023 AMD ext 8369→8370 at 12:00:18; Admin (6666) dial_timeout 35→60 at 11:37.

**Findings:** PDROP = hangup during AMD (FastAGI_log.pl:2143); AMDY vendor lag 1.0→1.7s from 10:00; web 500s = EADDRNOTAVAIL (TIME_WAIT exhaustion) fixed by sysctl; inbound AGI `LOCK TABLES vicidial_live_agents WRITE` (agi-VDAD_ALL_inbound.agi:3132) freezes whole web tier 1-3s per inbound call under MDL; big php-fpm pools deepen MyISAM lock storms (20k/5min) → calls stop reaching agents; `user_authorization()` count `where user!=` is 40% of live_agents queue and unused without MXAG.

**Open:** VOIP quality (sip17 "Serious Network Trouble __sip_xmit" x6 at 13:1x — sweep all 30); vdc_db_query.php steady 500s (~20/min/server, no fatal); cid_channels_recent_* 30x bloat; :11/:33 crons; MXAG guard (reverted).

### 2026-10-13 afternoon additions

| time | change | rollback |
|---|---|---|
| 14:09 | **10-box**: `vicidial_live_agents` (closer_campaigns/external_ingroups/agent_territories → VARCHAR 200/200/45) + `vicidial_manager` → ENGINE=MEMORY; flush cron → every 4 min `--seconds=240 --session-flush -q`; MariaDB restart test passed (replica reconnected, no errors) | `/root/premig/live_agents+manager-BEFORE-memory-20261013-140928.sql`, `/root/premig/crontab-BEFORE-flush4min-20261013-140951.txt` on mt-db1 |
| 16:33 | **10-box mt-agent**: `mysqli_report(MYSQLI_REPORT_OFF);` line 2 of agc/ and vicidial/ dbconnect_mysqli.php (PHP 8.2 throws on VICIdial's by-design duplicate inserts → 500s) | `/root/premig/_var_www_html_*_dbconnect_mysqli.php-BEFORE-reportoff-*` |
| 16:34 | **c1 agent1**: same mysqli_report line (both files) | same backup naming in /root/premig |
| 16:50 | **c1 agent1**: `/var/www/html/agc` root:root 755 → root:apache 775 (VICIdial writes vicidial_mysqli_errors.txt / xfer_log.txt / call_url_log.txt / vicidial_debug.txt there; PHP 8 fwrite(false) is fatal) → 500s 15-21/min → **0** | `chgrp root; chmod 755` |
| 16:55 | **c1 agent2-4**: both changes → 500s **0** on all four from 16:56 | /root/premig on each |
| 18:20 | scheduled task `mtc1-live-agents-memory-conversion`: waits for ≤3 agents, then MEMORY conversion + 4-min flush on c1 | task reports its own rollback |

**Root cause of the all-day vdc_db_query 500s:** PHP 8.1+ mysqli default `MYSQLI_REPORT_ERROR|STRICT` → `manDiaLlogCaLL` duplicate vicidial_log insert (by design, Matt 2010: "That's normal. You can safely ignore") throws → request dies → post-insert UPDATEs (list_id, MANUAL comment, auto_calls uniqueid) skipped. ViciBox (Wicked) still ships PHP 7.4. **Per-cluster manual fix (Steve: do NOT add to the installer script):** mysqli_report line in both dbconnect files; chgrp apache + 775 on agc/.

**Still to apply:** admin + api boxes (same code, PHP 8.2). **Finding:** real-time report "3-WAY" is a heuristic (>1 agent INCALL on same lead_id) and shows the newest call's timer for all — four agents hand-dialling lead 23263763 (list 998) looked like one 3-way.

### 2026-10-13 17:52-18:00 — db1 sshd connection resets (NOT a cluster fault)
- Guard reported `kex_exchange_identification: Connection reset by peer` from db1 17:52-17:56; db1 itself was healthy (117 agents, 1,012 calls, 286 threads).
- Cause: 24 stale guard/monitor bash loops on Steve's desktop (every Monitor re-arm left the previous loop running since 09:18, plus four from 10-06) each SSH-ing db1 every 30 s → sshd MaxStartups/PerSourcePenalties dropped connections from 74.208.129.213 (190 drops 17:xx). Same mechanism as the "db2 rate-limiting" seen earlier.
- Fix: killed all but the current loop (PIDs listed in session); 0 drops after 17:59. No server-side change made.

### 2026-10-13 18:05-20:25 — MEMORY conversion put on hold; 10-box verification run
- Steve forwarded a review requiring a 10-box test before c1. Scheduled task `mtc1-live-agents-memory-conversion` DISABLED at 18:05 (c1 unchanged; re-enable or re-create with corrected column sizes if approved).
- Docs bundled with build 260515-1937 specify VARCHAR(8000)/(8000)/(1000); c1 has a 4,923-char closer_campaigns user. 10-box columns re-altered 18:09 (backup /root/premig/live_agents+manager-200cols-BEFORE-8000-20261013-180953.sql on mt-db1).
- 10-box (mt-*) only: replica/primary restart tests, rollback + redeploy, three 22-min load phases (40 simulated agents), inbound routing tests. Fixtures (LT*), loopback carrier, sip1 dialplan include, simulator on mt-admin, samplers and deploy/rollback SQL remain in place; teardown list in `Vicidial Fixes/meetingstech-memory-recipe-10box-verification-2026-10-13.md` section 5. mt-agent agc dir set root:apache 775 (same fix as c1).
- 10-box end state: live_agents/manager MEMORY with 8000/8000/1000, 4-min flush cron, LTCAMP inactive.

### 2026-10-13 21:24-21:28 — c1 MEMORY conversion APPLIED (Steve: "go ahead and change to the memory tables as Matt described")
- Pre-checks 21:24: 0 agents, 0 NEW manager rows, 0 inbound waiting, replication clean db2/db3 (GTID Slave_Pos, 0 s). 43 stale XFER rows in vicidial_auto_calls left as-is (not touched by the change).
- Backups on db1 /root/premig: `c1-live_agents+manager-BEFORE-memory-20261013-212433.sql`, `c1-crontab-BEFORE-flush4min-20261013-212433.txt`, `c1-my.cnf-BEFORE-heap-20261013-212433` (+ `c1-my.cnf-BEFORE-heap2G-*` per host), `c1-create-vicidial_{live_agents,manager}-BEFORE-*.txt`, read-only capture `c1-capture-20261013-210232/`.
- max_heap_table_size 512M -> 2G on db2, db3, db1 (SET GLOBAL + /etc/my.cnf line 62/64; replica SQL threads restarted so the applier carries 2G). tmp_table_size untouched (512M db1, 128M replicas). Sizing: manager rows ~5.1 KB each incl. index; c1 peak 6,807 dials/min x ~1.9 rows => ~100k rows in an 8-min window (~510 MB, over the old 512M limit); 2G gives ~400k rows = three missed flushes at peak.
- 21:25:34 `/root/premig/c1-DEPLOY-memory-recipe.sql` on db1 (SET SESSION max_heap 2G; VARCHAR(8000)/(8000)/(1000); ENGINE=MEMORY x2): 16 ms. Verified MEMORY + max_data_length 2042/1992 MB on db1, db2, db3; indexes HASH; replication 0 errors.
- db1 crontab line 20: `1,5,9,...,57 * * * * AST_flush_DBqueue.pl --seconds=240 --session-flush -q` (was `11 * * * * ... -q`); line 86: `* * * * * /root/premig/flushmon.sh` (CSV /var/log/astguiclient/flushmon.csv, alerts flushmon-alerts.log). First manual flush 1.6 s.
- Dummy row round trip (ZZTEST1 + manager ZZTESTMAN): insert/update/delete replicated to db2 and db3; no daemon errors on db1/sip1 in the following 6 min.
- Scheduled task `mtc1-live-agents-memory-conversion` DELETED (it carried the wrong 200/200/45 sizes).
- ROLLBACK: `mysql asterisk < /root/premig/c1-ROLLBACK-memory-recipe.sql` (with 0 agents, 0 NEW rows) + `crontab /root/premig/c1-crontab-BEFORE-flush4min-20261013-212433.txt`; heap can stay at 2G. After a db1 restart agents must re-login (MEMORY tables empty); after a db2/db3 restart run the coordinated resync (Vicidial Fixes report, section on replica recovery).
- NOT changed: FILL / local autodial delays (all 30 sip hosts are mixed; FILL host db1 default 2.5 s).

### 2026-10-14 09:2x — phone 9176 created on c1 (Steve's request)
- 30 rows in `phones` cloned from extension 3045 (one per sip, logins 9176a..9176ad, dialplan_number <serverprefix>9176, voicemail_id 9176, fullname "Steve 6666", new random conf_secret per row, same login password as the client phones, WEBRTC template). servers.rebuild_conf_files set; peer [9176] confirmed in sip-vicidial.conf on SIP1. User 6666 already had phone_login 9176.
- Rollback: `DELETE FROM phones WHERE extension='9176'; UPDATE servers SET rebuild_conf_files='Y' WHERE max_vicidial_trunks>0;`

### 2026-10-14 11:39 — c1 vicidial_manager secondary indexes HASH -> BTREE (Steve approved)
- Cause: the 4-minute flush's `DELETE from vicidial_manager where entry_date < ...` held the MEMORY table ~8 s per run (sampled 10:29:01.8-10:29:09.6, up to 585 waiting threads) because ~53% of rows (Originate) have uniqueid='' and sit in one HASH chain, making the delete quadratic. 10-box replay with c1's row mix: all-HASH 3,068 ms vs uniqueid BTREE 244 ms vs all three secondary BTREE 152 ms.
- Applied 11:39:28 on db1 (671 ms, 51k rows): `ALTER TABLE vicidial_manager DROP INDEX uniqueid, ADD INDEX uniqueid (uniqueid) USING BTREE, DROP INDEX callerid, ADD INDEX callerid (callerid) USING BTREE, DROP INDEX serverstat, ADD INDEX serverstat (server_ip,status) USING BTREE;` replicated to db2/db3 (verified BTREE, 0 errors). Backup `/root/premig/c1-create-vicidial_manager-BEFORE-btree-20261014-113927.txt`.
- Rollback: same statement with `USING HASH`. Deviation from the published recipe (index type only); re-apply after any upgrade that rebuilds the table.

### 2026-10-14 13:29 — c1 vicidial_agent_log index (campaign_id, event_time) (Steve: "go ahead and add the agent_log index after the next flush")
- Cause: AST_VDadapt.pl on db1 runs three per-campaign full-day aggregates over vicidial_agent_log every pass (sum pause/wait/talk/dispo, sum wait+talk+dispo, count lead_id>0) because all 7 active campaigns have Real-Time Agent Time Stats = CALLS_WAIT_CUST_ACW_PAUSE. No index started with campaign_id, so each was a 346k-row MyISAM scan (~1.1 s) => 21 scans ≈ 40 s of table lock per minute. Agent-side agent_log writes/reads queued behind it (up to 136 waiters; Table_locks_waited +129k/min), PHP-FPM hit max_children on agent2/3/4 (12:02-13:00) and the same at 17:39-17:57 on 2026-10-13. Measured impact: avg after-call (dispo) time 3-6 s before 11:30 -> 19-38 s after, avg agent wait 12-18 s -> 24-35 s, across all campaigns.
- Applied 13:29:14 on db1 after the 13:29:01 flush: `ALTER TABLE vicidial_agent_log ADD INDEX campaign_time (campaign_id, event_time);` 5,516 ms, replicated to db2 (lag 7 s) and db3 (0 s), 0 errors. Backup `/root/premig/c1-create-vicidial_agent_log-BEFORE-index-20261014-132623.txt`; rollback file `/root/premig/c1-ROLLBACK-agent_log-index-20261014-132623.sql`.
- Result: EXPLAIN type range on campaign_time (31k rows for campaign 1023 instead of 346k); 60-s sample at 0.5 s: VDadapt scan visible 2/120 samples (was ~80/120), agent_log waiters 0/120 (was up to 136).
- Rollback: `ALTER TABLE vicidial_agent_log DROP INDEX campaign_time;` (same few-second lock, replicates). Nothing updates campaign_id/event_time after insert, so the index costs one key per insert (~4/s).
- Related, not a c1 change: db2 lag spikes (60-93 s) are report queries from the admin host holding MyISAM read locks on vicidial_log (7-s SELECTs) while the in-order parallel applier waits; db3 (no readers) stays at 0. Steve moved the realtime report off the slave list in System Settings at ~13:20 and back on at ~13:26.

### 2026-10-14 18:21 — c1 vicidial_log_extended index dispo_poll (dispo_url_processed, call_date, lead_id) (Steve: "go ahead and add the log_extended index after agents log off")
- Cause (found by the client's 1-s DB logging, confirmed live): AST_VDauto_dial.pl on SIP1 (line 4472, the dispo-URL processor) polls `SELECT uniqueid,lead_id,call_date,caller_code FROM vicidial_log_extended WHERE call_date > <6h ago> AND dispo_url_processed='N' ORDER BY call_date,lead_id LIMIT 100000` every ~11 s; with no index on dispo_url_processed it was a 2.0M-row range + filesort taking 2-3 s, holding a MyISAM read lock ~25% of the time (up to 77-256 waiting statements per sample; vicidial_log_extended the top contended table all day).
- Applied by waiter /root/premig/vle-index.sh after agents logged off: proceeded 18:17:27 (2 agents, 8 live auto_calls rows, stale XFER rows ignored), waited for the 18:21:01 flush, ALTER 18:21:05-18:21:50 (45,522 ms on 3,143,657 rows, 218 MB data / 180 MB index). Replicated to db2 and db3 (verified 3 index columns, 0 lag, 0 errors). Backup `/root/premig/c1-create-vicidial_log_extended-BEFORE-index-20261014-181727.txt`; rollback file `/root/premig/c1-ROLLBACK-log_extended-index-20261014-181727.sql`.
- Result: EXPLAIN type range on dispo_poll, 35 rows, "Using index condition" (was 2,065,092 rows + filesort); the poll returns in 1 ms (was 1.8-3 s).
- Rollback: `ALTER TABLE vicidial_log_extended DROP INDEX dispo_poll;` (same ~45 s lock on a 3M-row table, so only with agents off). Cost: one extra key per insert and per dispo_url_processed N->Y update.

### 2026-10-15 06:45-07:17 — sip16-c1 failed to get network after reboot; eth0 converted to static (Steve: "add the static to this server and we will wait to see if happens to others")
- 06:45 reboot (not by me); host booted but NetworkManager's DHCP on eth0 got no lease for 20 min (log: "dhcp4 (eth0): beginning transaction (timeout in 45 seconds)" -> "ip-config-unavailable" -> "state changed no lease", retried every 47 s 06:48:52-07:08). NIC/link fine (igb, link up 1 Gbps). Second reboot 07:08 got a lease in 6 s => IONOS DHCP not answering, provider side. journald is not persistent on these hosts; diagnosis came from /var/log/messages.
- Back at 07:09: Asterisk up, keepalive screens, 43 IAX2 peers (30 online), VB-firewall whiteips 46 entries, db1 heartbeat 07:11:45.
- 07:17:04 eth0 made static with the DHCP-provided values: `nmcli con modify eth0 ipv4.method manual ipv4.addresses 74.208.87.138/32 ipv4.gateway 10.255.255.1 ipv4.dns "212.227.123.16 212.227.123.17" ipv4.routes "10.255.255.1/32, 169.254.169.254/32 10.255.255.1" ipv4.ignore-auto-dns yes` then `nmcli dev reapply eth0` (no connectivity loss; routes now proto static). IPv6 left on auto. Backups on sip16 `/root/premig/ifcfg-eth0-BEFORE-static-20261015-071704`, `nmcli-eth0-BEFORE-static-20261015-071704.txt`; rollback `/root/premig/ROLLBACK-static-eth0-20261015-071704.sh` (back to DHCP + reapply). Other 40 hosts unchanged (still DHCP) by Steve's decision: watch whether it recurs elsewhere.
