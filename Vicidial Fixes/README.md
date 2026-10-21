# Vicidial Fixes

Field fixes and findings from live VICIdial clusters, written up for reuse. These are NOT applied by the installer script by design (Steve's decision, 2026-10-13); apply them per cluster by hand when the symptom matches.

| file | what it covers |
|---|---|
| meetingstech-c1-fixes-2026-10-13.md | Consolidated causes, fixes, measured results, rollbacks and rejected ideas from the 41-box MeetingsTech c1 cluster, 2026-10-12 to 10-15: VDadapt vicidial_log index, MySQL tuning, phantom balance dialing, PHP 8 mysqli exceptions and agc permissions, ephemeral port exhaustion, MEMORY tables for live_agents/manager (+ BTREE indexes on manager), vicidial_agent_log and vicidial_log_extended indexes, web-tier handshake loss and persistent-connection test, replica lag, sip16 DHCP boot failure, recording pipeline verification, archive retention, post-upgrade checklist |
| meetingstech-c1-change-log-2026-10-12-13.md | Timestamped change log with backup paths and rollback commands for every change made (10-12 through 10-15) |
| meetingstech-memory-recipe-10box-verification-2026-10-13.md | MEMORY recipe: 22-item pass/fail table from the 10-box (functional tests incl. manual dial, transfers, park, 3-way, prompts, concurrent routing; coordinated replica resync; flush cutoffs and readers; delay A/B; keepalive delay-flag bug), heap sizing and flushmon monitoring, and the c1 deployment record of 2026-10-13 21:25 with rollback and trial triggers |
| scripts/resync-orch.sh | Coordinated MEMORY-table replica resync (GTID or file/pos) |
| scripts/flushmon.sh | Per-minute flush/capacity monitor for the MEMORY tables (cron on the primary) |
| scripts/c1watch.sh | 10-minute shift watch run from the operator's desktop: db1 lock/metadata waits, MEMORY capacity, flush, replicas, agent-host 500s/PHP-FPM/TIME_WAIT, sip transmit errors, db3 dial/drop stats; prints a BREACHES list (ssh aliases mtc1-* assumed) |
| scripts/agent_log_guard.pl | Patch generator for agc/vdc_db_query.php: closes the READY-before-insert race that loses agent_log rows (argument guard), plus a 10-box-only test hook (argument hook); see fixes file section 17 |

Quick index of the fixes that apply to any PHP 8 VICIdial build from this installer:
1. `mysqli_report(MYSQLI_REPORT_OFF);` as line 2 of `agc/dbconnect_mysqli.php` and `vicidial/dbconnect_mysqli.php` (PHP 8.1+ throws on VICIdial's by-design duplicate inserts).
2. `chgrp apache /var/www/html/agc && chmod 775 /var/www/html/agc` (VICIdial writes its own log files there; PHP 8 fatals on fwrite to a failed handle).
3. Web servers: `net.ipv4.ip_local_port_range = 15000 65000`, `net.ipv4.tcp_tw_reuse = 1` (per-request MySQL connections exhaust ephemeral ports above ~150 agents per server). At 2,000 connects/s or on lossy paths, persistent mysqli connections (`p:` host prefix in both dbconnect files) remove the handshakes entirely; tested on the 10-box 2026-10-15, see section 8 of the fixes file.
4. `servers` table: max_vicidial_trunks=0 and vicidial_balance_active=N on every box that is not an Asterisk dialer.
5. At 200+ agents: vicidial_live_agents and vicidial_manager to MEMORY per VICIdial Group's docs/LOAD_BALANCING.txt, with AST_flush_DBqueue every 2 minutes (`--seconds=120 --session-flush`; was every 4 min until 2026-10-21, changed when runs reached 12-20 s at 250+ agents), and the three vicidial_manager secondary indexes `USING BTREE`.
6. Indexes that stop VDadapt and the dialer daemons from table-scanning under MyISAM locks: `vicidial_log (campaign_id,call_date,status,user)` + AST_VDadapt.pl line 83 FORCE INDEX on it; `vicidial_agent_log (campaign_id,event_time)`; `vicidial_log_extended (dispo_url_processed,call_date,lead_id)`.
7. Lost agent_log rows under auto-dial (call present in vicidial_log/closer_log, agent_log row carries the next call): stock VDADready marks the agent READY before it inserts the next agent_log row. scripts/agent_log_guard.pl guard patches the two VDADcheckINCOMING stamp sites to wait (max 2 s) for the new row id. Proven on the 10-box 2026-10-17 (42% lost -> 0 under a forced race). Install with a fresh mtime or opcache keeps the old file.
