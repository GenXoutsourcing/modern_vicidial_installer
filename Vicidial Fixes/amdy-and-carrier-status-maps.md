# AMDY and carrier status maps

Two status maps that split VICIdial's catch-all auto statuses into reasons you can report on and recycle on:

- **AMDY status map**: AMDY (amdy.io AI AMD) machine verdicts land as 11 `AA*` statuses instead of all `AA`.
- **Carrier status map**: calls the carrier rejected (SIP 603/403/404/503) land as 6 `CR*` statuses instead of `NA` / `AB` / `ADC`.

Both are live on MeetingsTech c1 (2026-10-23), WickedGoodLeads (2026-10-23), ResponseBPO c1 (2026-10-27) and Aragon (2026-10-28). Neither is applied by the installer. Apply them per cluster with the go-live scripts below, after a preview.

| file | what it is |
|---|---|
| `scripts/genx-carrier-status-map.pl` | Carrier map cron for the DB primary: `--report-only`, `--apply`, `--rollback`, `--summary` |
| `scripts/amdy-status-map-golive.sh` | AMDY map go-live (Aragon version): `--preview`, snapshot, statuses, container, campaigns, `rollback.sh` |
| `scripts/carrier-sipcause-gosub.conf` | Dialplan fix for carriers whose dialplan retries on another trunk: without it every retried call logs SIP cause 0 and the carrier map sees nothing |

---

## 1. AMDY status map

### How it works

Stock VICIdial **AMD Status Map** (upstream 2026-06-20, schema **1743**: `vicidial_campaigns.amd_status_map` and `system_settings.amd_status_map`). It is a Settings Container of type `AMD_STATUS_MAP` with lines `AMDSTATUS,AMDRESPONSE => STATUS`.

- `VD_amd.agi` strips the `-duration-confidence` suffix from `AMDCAUSE`. So the key is the bare AMDY class, the same value as `vicidial_amd_log.AMDRESPONSE` (for example `PLVMSAMD-4.50-0.9361` becomes `PLVMSAMD`).
- An exact line beats `MACHINE,*`. Each call logs a WILDCARD line, then an EXACT line, in the SIP box's agiout log, and the exact line wins.
- `KEEP-AL-AM-STATUSES` keeps calls where a message was played as `AL` / `AM`.
- No dialplan, code or restart is involved. Assign the container to the campaign and the next call uses it.

**Older builds:** a build below schema 1743 (Aragon was r3981 / 1741) has no `amd_status_map` column. Update SVN first: `upgrade_2.14.sql` from the current schema marker on, then `install.pl`. See the Aragon notes in section 4.

### The 11 statuses

| status | AMDY classes | recycled? |
|---|---|---|
| AAVM | VOICEMAILAMD, VOICEMAILV2AMD, CUSTOMVMAMD, WELCOMEVMAMD, HELLOMSGAMD, THANKYOUAMD, BEEPAMD, SPANISHAMD, AMD, OTHERAMD (+ stock Asterisk AMD causes LONGGREETING, MAXWORDS, MAXWORDLENGTH, TOOLONG, INITIALSILENCE) | yes |
| AAVMCR | carrier/platform voicemail: PLVMSAMD, VERIZONAMD, TELAMD, YOUMAILAMD, ESFWDVMAMD, GOOGLESUBAMD, MAGICJACKAMD | yes |
| AAVMFL | MAILBOXFULLAMD, CANTLEAVEAMD, CANTTAKEAMD, VMNOTSETUPAMD | yes |
| AASCRN | call screeners and spam blockers: CALLGUARDIPHONEAMD, CALLASSISTSCRNAMD, CALLASSISTAMD, HIYASCRNAMD, NOMOROBOAMD, SMARTBLKAMD, ALLSTATEBLKAMD, LADYBOTAMD, CALLRECAMD | yes |
| AAFAS | false answer supervision: FASAMD, FAS2AMD, FASV3AMD, FASV4AMD, FASRECLINEAMD, HELLOFASAMD | yes |
| AARING | RINGINGAMD, BUSYAMD | yes |
| AAIVR | IVRAMD, MUSICAMD | yes |
| AASIL | SILENCEAMD, NOAUDIOAMD, CLICKAMD | yes |
| AANS | `NOTSURE,*` | yes |
| **AADISC** | DISCONNECTEDAMD, SUBNOTAVAILAMD, NETWORKAMD, NUMBERSAMD | **no** |
| **AAHONY** | HONEYPOTAMD | **no** |
| FAXHU (stock) | FAXAMD | as before |
| ADAIR (stock) | `NOTSURE,NOAUDIODATA` and `NOTSURE,NO_AUDIO_TIMEOUT` | as before |

The 52+ AMDY classes are grouped into 11 buckets on purpose: 52 statuses would be unusable in reports and dial-status lists. PLVMS/TEL meanings are inferred from the class names, not from AMDY documentation.

**amd.py version note:** the October amd.py (Crown/ResponseBPO build) reports no-audio as `NOTSURE,NOAUDIODATA`. The March build said `NOTSURE,NO_AUDIO_TIMEOUT`. Keep both lines in the map while any box still runs the old file.

### Recycling (dial_statuses)

The 9 recyclable `AA*` tokens are appended to every in-scope campaign that recycles `AA`, so leads keep being redialed exactly as when everything was `AA`. `AADISC` and `AAHONY` are deliberately **not** appended. That is a client-visible change: disconnected-number intercepts (NUMBERSAMD is ~1-10k/day depending on list) and honeypots stop being redialed. Say so before going live.

**Never remove tokens, and watch the 255 limit.** `dial_statuses` is varchar(255) and non-strict sql_mode truncates silently. On MeetingsTech three campaigns with long lists (1023, 5500, 5520) were cut mid-token by the append. The go-live script pre-checks max length + new tokens <= 255 and aborts. Fix long lists in the admin UI or with Lead Recycling; never by deleting tokens.

### Go-live

```bash
bash /root/amdy-status-map-golive.sh --preview   # prints per-campaign length before/after, statuses present, AA rows today; changes nothing
bash /root/amdy-status-map-golive.sh             # snapshot -> statuses (INSERT IGNORE) -> container -> campaigns -> rollback.sh
```
Scope in the script: `amd_type='AMD' AND campaign_vdad_exten IN (8369,8370)`. Adjust the scope to the cluster's AMD routing extensions.

Verify within 2 minutes of dialing:
```sql
SELECT status,COUNT(*) FROM vicidial_log WHERE call_date > '<APPLIED_AT>' AND status LIKE 'AA%' GROUP BY 1;
-- plain AA should stop; the split is typically AAVMCR > AAVM > AAVMFL > AASCRN > AADISC
```
and `grep "AMD status map EXACT MATCH" /var/log/astguiclient/agiout.*` on a SIP box.

Rollback: `bash /root/amd_map_rollback_<ts>/rollback.sh`. It restores every campaign's `dial_statuses` + `amd_status_map`, deletes the container and remaps `AA*` rows since go-live back to `AA`. Statuses are left in place (never delete statuses). The `vicidial_list` remap is by `modify_date`, so run it after shift on big lists.

---

## 2. Carrier status map

### How it works

`genx-carrier-status-map.pl` runs every minute from cron on the DB primary (it connects to the DB in `/etc/astguiclient.conf`; never run it on a replica). Each run:

1. reads `vicidial_carrier_log` for the last 5 minutes (indexed `call_date` range) with `sip_hangup_cause IN (603,403,404,503)`;
2. joins `vicidial_log` the way stock FastAGI_log does (`lead_id` + uniqueid prefix), last 20 minutes, `user='VDAD'`, status still `NA`/`AB`/`ADC`;
3. maps by SIP code + reason (first match wins), records every candidate in InnoDB `genx_carrier_status_map_log`, and in `--apply` updates `vicidial_log` (by uniqueid PK) and `vicidial_list` (by lead_id PK) only where the row still holds the old auto status.

flock prevents overlap, every SELECT has `max_statement_time=5`, and at most 2000 rows go per run. A run takes 20-260 ms. The MyISAM read lock is held for ~40 ms, and table lock waits stay at the dialer's background rate.

| SIP | reason | status |
|---|---|---|
| 603 | any (Decline: caller ID flagged as spam) | CRSPAM |
| 403 | `FAS...` | CRFAS |
| 403 | Honeypot | CRHONY |
| 403 | Invalid Prefix / Destination | CRINVL |
| 403 | Unresponsive | CRUNRS |
| 404 | Not Found | CRINVL |
| 503 | any (congestion) | CRCONG |

What the old status was depends on the carrier dialplan: 603 is usually `AB` (BUSY), 503 is `NA` (CONGESTION) and 404 is `ADC` (CHANUNAVAIL).

### Recycling

Append `CRSPAM` where the campaign recycles `AB`, and `CRCONG` where it recycles `NA`. That way those leads keep recycling as before. Nothing is appended for `ADC`. Check first: if no campaign recycles ADC, CRINVL changes only the label.

### Go-live

1. Install the script, add the cron `* * * * * /usr/local/bin/genx-carrier-status-map.pl --report-only >/dev/null 2>&1` (crontab via temp file + line-count assert, never piped).
2. Watch `genx_carrier_status_map_log` / `--summary` for a few minutes.
3. Create the 6 CR* statuses (`--apply` refuses to run while any is missing), append CRSPAM/CRCONG to dial_statuses as above, then change the cron flag to `--apply`.

Rollback: `genx-carrier-status-map.pl --rollback` reverses every `applied='Y'` row (vicidial_log, vicidial_log_archive, vicidial_list) from the log table itself, then set the cron back to `--report-only`.

`--summary` also lists the outbound CIDs drawing the most 603s. That list is only meaningful where `vicidial_dial_log.outbound_cid` holds the real DID (Aragon, TBI). It is not meaningful where the carrier substitutes caller IDs (MeetingsTech: placeholders 77777700xx).

### Check first: are SIP codes reaching the carrier log at all?

```sql
SELECT dialstatus, sip_hangup_cause, COUNT(*) FROM vicidial_carrier_log
 WHERE call_date >= NOW() - INTERVAL 1 HOUR GROUP BY 1,2 ORDER BY 3 DESC;
```
If BUSY/CONGESTION/CHANUNAVAIL rows all show `sip_hangup_cause = 0`, the map will find nothing. See section 3.

---

## 3. Carrier dialplans with trunk failover log SIP cause 0

**Symptom (Aragon 2026-10-28):** 99.9% of failed calls in `vicidial_carrier_log` had `sip_hangup_cause = 0`. Only 8 real rejects showed in 7 days, while the Asterisk log showed thousands of cause 21/34/1 hangups. ANSWER-after-retry also logged 0. Calls that were never retried (NOANSWER 487, CANCEL 183) logged correctly.

**Cause:** the carrier entry retried BUSY/CONGESTION/CHANUNAVAIL on TBI_2/TBI_3. After more than one `Dial()` the channel has several dialed channels, and `HANGUPCAUSE_KEYS()` returns a comma list. The stock `[default]` h handler passes `${HANGUPCAUSE(${HANGUPCAUSE_KEYS()},tech)}`, which then evaluates to nothing.

**Fix:** `scripts/carrier-sipcause-gosub.conf`.
- In the carrier entry: `Gosub(gxsipcause,1(${TRUNK}))` right after each `Dial()`, plus the `gxsipcause` subroutine. It finds the last attempt's channel (`SIP/TBI_<n>-`) in the key list and stores its tech cause in `GXSIPCAUSE`.
- On every SIP box: the `[default]` h line logs `${GXSIPCAUSE}` when set. Otherwise it behaves exactly as stock.

**Final state on Aragon (2026-10-29 12:08, carrier entry "v4"):** the carrier's ORIGINAL retry logic and `Dial(...,60,...)`, plus three additions:
1. `Gosub(gxsipcause,1(${TRUNK}))` right after each `Dial()`.
2. `GotoIf(${REGEX("^SIP 603" ${GXSIPCAUSE})}?done)` placed before the BUSY retry. It stops failover on 603 only; 486/480/403, 404 and 503 still fail over.
3. The `[default]` h line logs `GXSIPCAUSE` **only when the call was not answered**: `${IF($["${GXSIPCAUSE}"!="" & "${DIALSTATUS}"!="ANSWER"]?${GXSIPCAUSE}:${HANGUPCAUSE(${HANGUPCAUSE_KEYS()},tech)})}`. Without the DIALSTATUS check, a call answered on try 2 keeps try 1's stale 603 and is counted as spam.

**Retry evidence, a correction to the 10-28/10-29 notes.**
- The 10-29 morning drop to 58% ANSWER was **not** caused by removing the retry. It was a TBI-side 603 wave at 10:12-10:20 and 10:37-11:00 across 3,349 DIDs, and it stopped on its own before the retry was restored.
- A trace of calls whose first attempt got a 603 showed every retried trunk returning 603 too.
- After the optimize fix below let failover answers reach AMD, sip8 classified 53 failover answers: 603-first gave 32 answers and **0 HUMAN**, mostly silence and FAS; 404-first gave 14 answers and 1 HUMAN; 503-first gave 7 answers and 0 HUMAN.
- Hence: no retry on 603, keep it for the rest.

**BUG: every call answered on a failover try is dropped on the customer (stock `agi-VDAD_local_optimize.agi`).**
- When the call answers, the optimize AGI looks up the real channel with `SELECT dest_channel FROM cid_channels_recent_<server> WHERE <caller id / uniqueid match> AND call_date > ...`, which has **no ORDER BY**. After a failover the table holds one row per attempt, and the first row is the dead try-1 channel.
- The AGI therefore sends `Redirect Channel: SIP/TBI_3-<dead>` to 8370. The answering channel is never redirected, and `Hangup()` drops it 2 s after answer. Vicidial logs the call as the earlier BUSY (AB/CRSPAM, 0 s) while the carrier log says ANSWER. Proof: the AGI's Redirect line in `action_send.<date>` names the dead channel.
- **Fix, one line:** append `ORDER BY call_date DESC, SUBSTRING_INDEX(dest_uniqueid,'.',1)+0 DESC, SUBSTRING_INDEX(dest_uniqueid,'.',-1)+0 DESC LIMIT 1` to that SELECT so the newest attempt wins. The table only ever holds `SIP/<trunk>-…` dest_channels per call, so "newest" is always the last attempt.
- Result on Aragon: failover answers reaching AMD went from 0/46 to 52/53 on the patched box and 279/280 fleet-wide; first-try answers were unchanged (99.7%).
- It is non-stock and `install.pl` overwrites it, so re-apply after every SVN update. Any cluster whose carrier dialplan fails over between trunks has this bug.

**Live reload safety:** put new lines only after `Dial()`, never before it. If priorities before `Dial()` shift, a call that is inside `Dial()` during `dialplan reload` resumes at the shifted priority. With an inserted line before `Dial()`, that is the `Dial()` again, which redials the lead. Compare the Dial/Gosub priority numbers of the old and new entry before applying.

**Apply / restore:**
- Back up every SIP box's extensions.conf and patch the h line in `[default]` only (exactly 1 match).
- Update `vicidial_server_carriers` with a **single-row UPDATE** from a pre-escaped SQL file. Verify the text round-trips byte-exact first.
- **Never** restore a carrier from a `mysqldump vicidial_server_carriers --where=...` file: it contains `DROP TABLE` + `CREATE TABLE` and would wipe every other carrier.
- Set `rebuild_conf_files='Y'` on the SIPs, then run an explicit `dialplan reload` once each box shows the change in extensions-vicidial.conf.

**Outage warning (Aragon 2026-10-29):** the r4035 conf generator drops `[context]` lines from carrier dialplan entries.
- A carrier entry that opens its own context, then "reopens" `[vicidial-auto-external]` at the end (the ElevenLabs relay entry did this), leaves every carrier listed after it stuck in the wrong context.
- Every outbound originate then failed with `No such extension/context 781...@default` until an `include` was added. It went unnoticed overnight because dialing had stopped.
- **After any SVN update or conf rebuild, test-dial on one SIP:** `asterisk -rx "dialplan show <prefix><number>@default"`.

The pre-existing `func_hangupcause.c: Unable to find information for channel` warnings come from the stock h line on channels without dial info. They are not caused by this change.

---

## 4. Cluster record

| cluster | AMDY map | carrier map | notes |
|---|---|---|---|
| MeetingsTech c1 (mtc1) | live 2026-10-23 15:30, 9 campaigns on 8370 | live 2026-10-23 16:04; 404 added 2026-10-28 19:24 | r4032. 3 campaigns hit the 255 truncation (see section 1). Carrier substitutes CIDs. |
| WickedGoodLeads | live 2026-10-23 17:40, 5 campaigns | live 2026-10-23 17:40 (first with 404) | custom AMDY dialplan falls back to Asterisk AMD(), so the map carries the stock AMD cause lines |
| ResponseBPO c1 | live 2026-10-27 15:38, 9 campaigns (8369 + 8370) | live 2026-10-27 15:38 | 603 → AB, 404 → ADC, 503 → NA; no 403s from this carrier |
| Aragon | live 2026-10-28 19:05, 16 campaigns (8369 + 8370) | report-only 18:22, live 18:27 | needed SVN r3981 → r4035 (schema 1741 → 1747) for amd_status_map, the carrier SIP-cause dialplan fix (section 3), and the new amd.py on all SIPs |

### Aragon SVN update notes (r3981 → r4035, 2026-10-28)

- Applied only the statements after the `db_schema_version='1741'` marker (`tail -n +<marker+1> extras/upgrade_2.14.sql`). Running the whole file with `-f` re-runs every old ALTER since 2.14, including on big tables and on tables you converted to MEMORY. The schema changes 1742-1747 touch small tables only (0.14 s).
- `install.pl --no-prompt` overwrites customized stock files. Check `cmp` against the old revision's trunk first and re-apply afterwards. On Aragon that meant the AST_VDadapt.pl FORCE INDEX patch, 6 custom transfer-button GIFs on the agent boxes, and the PHP 8 `mysqli_report(MYSQLI_REPORT_OFF)` line in both dbconnect files on PHP 8.2 web boxes. Non-SVN files (amd.py, campaign-gate.agi, watchers, custom reports) are untouched.
- Restart `AST_VDadapt.pl` after installing (it is a long-running daemon). The hopper runs from cron and picks the new file up on its next run.
