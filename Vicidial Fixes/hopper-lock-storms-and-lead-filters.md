# Hopper lock storms and lead filters (Aragon, 2026-11-03/04)

**Symptom:** at 120-160 agents, active calls swung between ~20-250 and 600-700 every minute. Agents sat READY while customers waited, the campaign page took a long time to load, and the realtime report froze for 15-25 s at a time.

**What a storm looked like** (`information_schema.processlist`, sampled every second on db1):
- Every minute just after the hopper cron (:01-:02), 400-770 queries waited on table locks for 15-25 s.
- The holders were the hopper's per-campaign `SELECT count(*) / SELECT lead_id ... FROM vicidial_list FORCE INDEX(list_id) where called_since_last_reset='N' and status IN(...) and list_id IN(...) and (<lead filter>)`, run back to back for each campaign, 3-4 s each.
- The waiters were the dialers' `UPDATE vicidial_list`, every `INSERT INTO vicidial_log`, `vicidial_log` reads, and then `vicidial_live_agents`.

## 1. Root cause: `vicidial_log` subqueries inside lead filters — FIXED 2026-11-04 10:53

The client had added the same clause to three campaigns' lead filters on 10-30 and 11-03, which matches when the storms got worse:
```sql
AND NOT EXISTS ( SELECT 1 FROM vicidial_log AS vl
                 WHERE vl.phone_number = vicidial_list.phone_number
                   AND vl.status = 'XFER' AND vl.call_date >= NOW() - INTERVAL 30 DAY )
```
**Why it caused the storms:**
- The hopper runs every filtered campaign's count and lead select every minute, so 6 queries a minute read `vicidial_log`, which has no index on `phone_number` (1.39M rows examined per query).
- MyISAM read locks on `vicidial_log` block every call-end `INSERT INTO vicidial_log`. That backs up the dialer processes, which in turn hold up their `vicidial_list` and `vicidial_live_agents` work.

**The rule also didn't work:** `ADMIN_archive_log_tables.pl --daily` moves `vicidial_log` to `vicidial_log_archive` every night, so "XFER in the last 30 days" only ever saw today's calls.

**Fix:** remove the `NOT EXISTS (… vicidial_log …)` block from the filters (single-row `REGEXP_REPLACE`, backup first).

| | before | after |
|---|---|---|
| storm length | 14-25 s | ~5 s |
| peak waiters | 442-767 | ~180 |
| lock-wait ratio (Table_locks_waited / total) | 3.0% | 2.05-2.1% |
| slow queries (>3 s) | every minute | none |

**Standing rule: never reference `vicidial_log` (or any hot log table) in a lead filter.** Filters run inside the hopper's `vicidial_list` scan every minute.

## 2. The 30-day XFER rule done properly — `genx_xfer_phones` (LIVE 2026-11-04 11:09)

`scripts/genx-xfer-phones.sh` on the DB primary maintains a small InnoDB table of phone numbers with an XFER call in the last 30 days:
```sql
CREATE TABLE genx_xfer_phones (phone_number VARCHAR(18) PRIMARY KEY, last_xfer DATETIME NOT NULL, KEY last_xfer (last_xfer)) ENGINE=InnoDB;
```
- `init`: one-time load of 30 days from `vicidial_log_archive` plus the live table. On Aragon that took 2 min for 13,162 numbers, reading the archive only (it's written once a night, so dialers never wait on it). `binlog_format=ROW` for the session, so the replica applies rows instead of re-running the 2-minute SELECT.
- `inc`: cron `*/5 * * * * sleep 30; genx-xfer-phones.sh inc`. It upserts XFERs from the last 90 minutes of `vicidial_log` (a `call_date` index range). The `sleep 30` keeps its ~1 s read of `vicidial_log` away from the hopper's :01 run; at :00 it once queued 108 queries.
- `purge`: nightly `15 4 * * *`, deletes numbers whose last XFER is more than 30 days old.
- InnoDB (our own table, not a VICIdial log table), so the hopper reading it and the job writing it never block each other.

Filter clause, appended to each filter:
```sql
AND NOT EXISTS ( SELECT 1 FROM genx_xfer_phones gx
                 WHERE gx.phone_number = vicidial_list.phone_number
                   AND gx.last_xfer >= NOW() - INTERVAL 30 DAY )
```
MariaDB materializes it as a hash once per query: the ACA count went from 1.13 s to 1.26 s, and it excluded 758 leads (about 3× the old today-only version). The storms stayed at about 1-6 s.

## 3. Other lock sources found the same week (all on Aragon)

| finding | fix | where documented |
|---|---|---|
| Campaign page per-status counts with Expanded List Stats on | System Settings `expanded_list_stats=0` | MeetingsTech fixes section 23 |
| `dialable_leads()` count without index hint | `FORCE INDEX(list_id)` in vicidial/functions.php (stock md5 c568039b → 40ab2005) | MeetingsTech fixes section 18 |
| Someone with root set `$VLforce_index=''` in AST_VDhopper.pl. The hopper queries then scanned the whole `vicidial_list` (1.4-2.3M rows, 4-8 s each) | restore the stock SVN file (`FORCE INDEX(list_id)`, md5 e8622176 on r4035) | here |
| Missing indexes `vicidial_agent_log (campaign_id,event_time)`, `vicidial_log (user,call_date)`, `vicidial_log_extended (dispo_url_processed,call_date,lead_id)` (9 campaigns use Dispo Call URL) | added after shift: 12.9 / 18.8 / 19.7 s on ~1.1-1.4M rows each | MeetingsTech fixes sections 6/25 |
| `vicidial_ajax_log` grows ~6M rows/day while Agent Debug Logging is on (needed by the xfer button-click report) | stock end-of-day purge keeps 7 days; consider extracting the 3 button actions and purging to 1 day | here (open) |

## 4. What NOT to do (learned the hard way)

- **Don't stretch the hopper cron interval** (`*/2`) on campaigns with `use_auto_hopper=Y`. Auto-hopper sizes the hopper for about one minute of dialing: MEDICAR2 at dial level 8 (~625 leads/min) hit 0 halfway through every 2-minute gap and stopped dialing (calls swung 20↔370). Back to `* * * * *` fixed it.
- A composite `vicidial_list` index for the hopper count doesn't help: the stock hopper forces `list_id` (MeetingsTech section 18).
- InnoDB for VICIdial's own log tables is rejected by VICIdial Group (MeetingsTech section 14). `genx_*` helper tables are ours and can be InnoDB.
- Deactivating a huge list (302k leads) barely moved the storms while the filter subquery was the real holder. Find the holder first (sample `processlist` for the query that is running while others wait) before cutting data.

## 5. Monitoring snippet

Every second, print the waiter count and, when it is above 5, the longest-running non-waiting query:
```sql
SELECT count(*) FROM information_schema.processlist WHERE state LIKE '%lock%';
SELECT time, left(info,150) FROM information_schema.processlist
 WHERE command='Query' AND state NOT LIKE '%lock%' AND info NOT LIKE '%processlist%' AND time>=1
 ORDER BY time DESC LIMIT 1;
```
Healthy at ~150 agents: storms of 5 s or less, peak waiters under 200, and `Table_locks_waited` around 2% of all table locks.
