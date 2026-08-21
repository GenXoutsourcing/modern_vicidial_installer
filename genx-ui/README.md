# GenX VICIdial UI

Standalone GenX operations UI for VICIdial. It runs as its own Node/React app and uses the configured VICIdial database without modifying VICIdial core screens.

## Local Service

The installer deploys the app to `/opt/genx-ui/current`, runs it on `127.0.0.1:3200`, and exposes it through Apache at `/genx/`.

```bash
sudo ./install-genx-ui.sh
```

The database connection settings and minimum VICIdial user level are stored in `/etc/genx-ui.env`.

Human login requires an active VICIdial user with a valid password and `user_level` at or above `GENX_UI_MIN_USER_LEVEL`, which defaults to `7`.

## Current UI

The current GenX shell includes:

- VICIdial database health
- live agents and paused agents
- calls today and current calls
- active campaigns and lead pool counts
- hourly call flow
- campaign and live agent tables
- native add/edit forms for campaigns, users, lists, and inbound groups
- a Reports page with reviewed VICIdial report entrypoints
- a VICIdial page map for admin areas that still need native GenX screens

Write actions require the matching VICIdial permission flag, such as `modify_campaigns`, `modify_users`, `modify_lists`, or `modify_ingroups`; level 9 users are allowed across these first native admin forms.

## Agent Screen (`/genx/agent`)

Full agent console (login, webphone, dialing, dispositions, transfers, chat) that mirrors legacy `/agc` behavior against the same VICIdial tables. Portability notes for new servers:

- **Conference engine** is read per dialer server from `servers.conf_engine` (`CONFBRIDGE` uses `vicidial_confbridges` with the `2` agent-join prefix; anything else falls back to meetme `vicidial_conferences`).
- **Webphone** URL/key come from `system_settings.webphone_url` / user-group overrides, same as legacy `vicidial.php`.
- **Team Chat** requires `system_settings.allow_chats = 1`; when disabled the card explains it and all chat endpoints refuse. Chat interoperates with the legacy manager chat panel (`vicidial_manager_chats` / `vicidial_manager_chat_log`).
- **Sales Today** counts dispositions whose status has `sale = 'Y'` in `vicidial_statuses` or `vicidial_campaign_statuses`.
- **Pause-code countdowns** use `vicidial_pause_codes.time_limit` (seconds, advisory).
- **Auto-launch on connect** honors `vicidial_campaigns.get_call_launch` (`SCRIPT*`, `FORM`, `WEBFORM*`, and `PREVIEW_*` variants). Agents pick up campaign setting changes on their next login/reload.
- **Sessions** persist in a `genx_ui_sessions` table auto-created at service start (falls back to in-memory sessions if the DB user cannot create tables).
- **Audio store** is VICIdial's central sound store: the `system_settings.sounds_web_directory` folder under the web root (`GENX_UI_WEB_ROOT`, default `/var/www/html`). If the store was never created, the Audio Store panel offers "Initialize Audio Store", which generates the random directory name exactly like legacy `audio_store.php`; the base installer's `vicidial-audio-store-dir` root cron guarantees the directory exists with usable permissions. Set `sounds_central_control_active = 1` for uploads to sync to dialer servers (`ADMIN_audio_store_sync.pl`). `GENX_UI_AUDIO_DIR` remains as an explicit override for non-standard layouts. `sox` is optional — without it uploads still work, only format analysis is skipped.

## Installing on an Existing VICIdial Server

`install-genx-ui.sh` is self-sufficient on an already-running VICIdial web server (RHEL-family OS with `dnf`; the Apache drop-in targets `/etc/httpd/conf.d`). It installs Node 18+, deploys the app, writes the systemd service and Apache proxy/security gate, installs the audio-store directory helper + sync crons if missing, and ends with a **settings preflight report** listing anything below that still needs attention.

Run it on the web server that hosts the VICIdial admin pages:

```bash
sudo ./install-genx-ui.sh
```

The installer preserves an existing `GENX_UI_PUBLIC_HOST` in `/etc/genx-ui.env`;
otherwise it derives one from `hostname -f`. Apache and the Node backend use
that value to reject unknown Host headers for `/genx` and `/genxapi`.

### VICIdial settings checklist (vanilla system)

System Settings (`Admin > System Settings`):

| Setting | Needed for | Value |
|---|---|---|
| `webphone_url` (+ `webphone_systemkey` if used) | Agent webphone iframe | Your ViciPhone URL, e.g. `https://phone.viciphone.com/viciphone.php` |
| `allow_chats` | Agent Team Chat + manager chat panel | `1` |
| `sounds_central_control_active` | Audio store sync to dialers | `1` |
| `sounds_web_server` | Audio store downloads | `https://<this web server>` (the host that physically holds the store) |
| `sounds_web_directory` | Audio store location | Auto-generated — use Audio Store > "Initialize Audio Store" (or the legacy Audio Store page) |
| `custom_fields_enabled` | Per-list custom fields / agent FORM tab | `1` |

Per asterisk server (`Admin > Servers`): `conf_engine` must match the dialplan (`CONFBRIDGE` needs `vicidial_confbridges` rooms; meetme needs `vicidial_conferences` rooms — vanilla installs ship meetme rooms), and `web_socket_url` / `external_server_ip` for webphones behind NAT.

Phones: `is_webphone = Y` for webphone agents (conf secret is used as the SIP password), or working hard phones; standard extensions (park `8301`, DTMF `8500998`, voicemail dump) are stock dialplan.

Users: agents need `phone_login`/`phone_pass` set on the user record (the agent login page only asks user/pass/campaign); admin users need `user_level >= GENX_UI_MIN_USER_LEVEL` (default 7) plus the normal VICIdial permission flags per feature (`modify_*`, `delete_*`, `custom_fields_modify`, `modify_audiostore`, `modify_timeclock_log`, `vdc_agent_api_access` for Listen/Barge and supervisor pause, `agent_call_log_view` on the user group for the agent Call Log panel).

Campaigns: normal VICIdial campaign setup applies unchanged — dial method (the agent screen adapts RATIO/ADAPT vs MANUAL automatically), allowed user groups, carrier/dial prefix for outbound, scripts/web forms, pause codes (`time_limit` in seconds drives the agent countdown), campaign statuses + hotkeys, `get_call_launch` for auto-opening script/form on connect.

Statuses: flag your sale statuses `sale = 'Y'` (system or per-campaign) so the agent "Sales Today" tile counts them.

Database user: the `cron` DB user from `/etc/astguiclient.conf` should be able to `CREATE TABLE` (session persistence table, custom-field DDL). Without it the UI still runs, but logins reset on service restart and list custom-field editing fails.
