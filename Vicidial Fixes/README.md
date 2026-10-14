# Vicidial Fixes

Field fixes and findings from live VICIdial clusters, written up for reuse. These are NOT applied by the installer script by design (Steve's decision, 2026-10-13); apply them per cluster by hand when the symptom matches.

| file | what it covers |
|---|---|
| meetingstech-c1-fixes-2026-10-13.md | Consolidated causes, fixes, measured results, rollbacks and rejected ideas from the 41-box MeetingsTech c1 cluster (MyISAM lock contention, PHP 8 mysqli exceptions, ephemeral port exhaustion, phantom balance dialing, MEMORY tables for live_agents/manager, dialing pipeline diagnosis) |
| meetingstech-c1-change-log-2026-10-12-13.md | Timestamped change log with backup paths and rollback commands for every change made |
| meetingstech-memory-recipe-10box-verification-2026-10-13.md | Verification of the live_agents/manager MEMORY recipe on the 10-box against a reviewer checklist: docs-correct column sizes (8000/8000/1000), replica restart divergence + resync, primary restart, flush-script analysis, MyISAM vs MEMORY load phases, inbound rank/longest-wait routing, rollback proof, c1 deploy preconditions |

Quick index of the fixes that apply to any PHP 8 VICIdial build from this installer:
1. `mysqli_report(MYSQLI_REPORT_OFF);` as line 2 of `agc/dbconnect_mysqli.php` and `vicidial/dbconnect_mysqli.php` (PHP 8.1+ throws on VICIdial's by-design duplicate inserts).
2. `chgrp apache /var/www/html/agc && chmod 775 /var/www/html/agc` (VICIdial writes its own log files there; PHP 8 fatals on fwrite to a failed handle).
3. Web servers: `net.ipv4.ip_local_port_range = 15000 65000`, `net.ipv4.tcp_tw_reuse = 1` (per-request MySQL connections exhaust ephemeral ports above ~150 agents per server).
4. `servers` table: max_vicidial_trunks=0 and vicidial_balance_active=N on every box that is not an Asterisk dialer.
5. At 200+ agents: vicidial_live_agents and vicidial_manager to MEMORY per VICIdial Group's docs/LOAD_BALANCING.txt, with AST_flush_DBqueue every 4 minutes (`--seconds=240 --session-flush`).
