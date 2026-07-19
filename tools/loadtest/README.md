# GenX agent-side load test harness

Simulates LIVE agents against a running cluster using the **exact process human
agents use**: the genx-ui agent HTTP API at the real client's 2s poll cadence,
real WebRTC webphones (headless Chromium tier), real autodial through the stock
hopper/`AST_VDauto_dial` engine, real dispositions, and real
`start_call_url` / `dispo_call_url` / `na_call_url` firings (reconciled via a
logging sink). Zero PSTN traffic: a temporary dialplan context answers
"customer" calls locally with a realistic ANSWER/BUSY/NOANSWER mix.

## Components

| File | Runs on | Purpose |
|---|---|---|
| `setup.sh` | admin box | Seeds LOADTEST group/users/phones/campaign/leads + sink.php (db1 writes) |
| `dialplan/extensions-genx-loadtest.conf` | sip boxes | Customer sink (prefix 77) + protocol-agent auto-answer legs |
| `agent-sim.mjs` | admin box | Protocol agents (full lifecycle) + drivers paired with browser webphones |
| `webphone-agents.mjs` | admin box | Real headless-Chromium agent consoles with ViciPhone over WSS (needs `npm i playwright`) |
| `monitor.sh` | admin box | 10s metrics: agents, calls/box, hopper, DB, sysload, genx-ui health, drops |
| `sink.php` | admin box | Logs every DISPO/START/NA URL hit to `/var/log/genx-loadtest/sink.log` |
| `teardown.sh` | admin box | Removes all fixtures (keeps run logs unless `--purge-logs`) |

## Run order

1. `bash setup.sh` on the admin box (env: `LEADS`, `SINK_BASE`).
2. Install dialplan on each sip box, then `asterisk -rx "dialplan reload"`:
   - copy `dialplan/extensions-genx-loadtest.conf` to `/etc/asterisk/`
   - in `/etc/asterisk/extensions.conf`: add `include => genx-loadtest` inside
     `[default]` (after `include => vicidial-auto`) and
     `#include extensions-genx-loadtest.conf` at the end of the file.
3. Wait ~1 min for `rebuild_conf_files` to regenerate SIP peers (LT1xx webphones).
4. Start `bash monitor.sh` (screen), then `node webphone-agents.mjs` (screen),
   then `node agent-sim.mjs` with `DRIVERS=LT101-LT110 PROTOCOL=LT201-LT215`.
5. After the run: check `/tmp/genx-loadtest-sim-stats.json`,
   `/tmp/genx-loadtest-monitor.csv`, and reconcile
   `/var/log/genx-loadtest/sink.log` counts against `vicidial_log` /
   `vicidial_url_log` for the campaign.

## Teardown

1. Stop sim/browser/monitor processes.
2. `bash teardown.sh` on the admin box (add `--purge-logs` to also delete run data).
3. On each sip box: hang up leftover sim legs, remove the dialplan:
   ```
   for c in $(asterisk -rx "core show channels concise" | grep -Eo "^Local/(LT2|77)[^!]*"); do
     asterisk -rx "channel request hangup $c"; done
   sed -i '/include => genx-loadtest/d;/#include extensions-genx-loadtest.conf/d' /etc/asterisk/extensions.conf
   rm -f /etc/asterisk/extensions-genx-loadtest.conf
   asterisk -rx "dialplan reload"
   ```

## Scaling past the pilot

- More protocol agents: extend the user/phone seeding ranges in `setup.sh`
  (pattern `_LT2XX` covers LT200-LT299; widen the dialplan pattern + monitor
  for more) and pass a wider `PROTOCOL=` range.
- Push the dial pressure: raise `auto_dial_level` on LOADTEST.
- SLO gates used for "when it breaks": drop rate >3%, status-poll p95 >2s,
  DB Threads_running sustained high / slow-query growth, sip-box sysload,
  audio distortion on a Tier-A spot check.
