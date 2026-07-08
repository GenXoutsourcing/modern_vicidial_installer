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
