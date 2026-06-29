# GENX VICIdial overlay notes

This workspace contains overlay-only files for the GENX VICIdial skin. The stock
VICIdial PHP files should remain untouched.

## Agent UI overlay

Active local files:

- `work/agent_ui/bootstrap-lite.php`
  - Deployed to `/var/www/html/agc/ui/bootstrap.php`.
  - Loaded by `/agc/.user.ini` as an `auto_prepend_file`.
  - Injects `agent-lite.css` and compact page-state JavaScript into
    `/agc/vicidial.php`.
  - Owns the overlay buttons for MUTE, WEBPHONE VIEW/HIDE and AGENTS VIEW.
  - Reuses stock VICIdial handlers for Manual Dial, Fast Dial and View Call Log.

- `work/agent_ui/assets/css/agent-lite.css`
  - Main AGC visual skin.
  - The bottom of this file contains the most important final override blocks.
  - When changing the agent UI, add new overrides at the end unless you are
    intentionally removing old experimental rules.

- `work/viciphone/`
  - Hosted copy of VICIphone assets.
  - `js/vici_phone.js` includes the GENX postMessage hook used by the overlay
    MUTE button.

Legacy/prototype files:

- `work/agent_ui/bootstrap.php`
- `work/agent_ui/assets/css/agent.css`
- `work/agent_ui/assets/css/agent-static.css`
- `work/agent_ui/assets/js/agent.js`

These are earlier prototype files and are not the active deployed agent overlay.

## Admin/report overlay

Active local files:

- `work/remote_ui/bootstrap.php`
  - Admin/report overlay bootstrap.
  - Defaults realtime report document loads to `report_display_type=HTML`.
  - Starts output buffering and passes pages to `ViciUI\Transformer`.

- `work/remote_ui/Transformer.php`
  - Main router/detector for stock VICIdial admin/report pages.
  - Important guardrail: background realtime refreshes must stay raw to avoid
    nesting a second full UI shell inside the report content.

- `work/remote_ui/Layout.php`
  - Shared sidebar/topbar/content shell.

- `work/remote_ui/Navigation.php`
  - Data-driven admin navigation.
  - Uses ASCII-safe icon labels to avoid encoding corruption.

- `work/remote_ui/ReportPage.php`
  - Wraps stock report bodies without reserializing report DOM.
  - This preserves realtime report refresh behavior.

- `work/remote_ui/theme.css`
  - Admin/report visual theme.

- `work/remote_ui/ui.js`
  - Sidebar behavior and realtime-report cleanup.

## Deploy helper

- `work/deploy_agent_overlay.js`
  - Copies only the active agent overlay files to the server.
  - Verifies PHP syntax and prints the active CSS cache-buster.

## Required agent test flow

After any agent overlay deploy:

1. Click Logout from the agent screen.
2. On the logout screen, click `CLICK HERE TO LOG IN AGAIN`.
3. Hard refresh the login screen.
4. Select campaign `TESTCAMP`.
5. Click Submit.
6. Verify the live agent screen and logout transition.

This flow is important because the agent page can keep stale injected assets
until the login page is hard-refreshed.
