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
