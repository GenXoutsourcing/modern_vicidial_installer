# Changelog

Version = `genx-ui/package.json` (shown in the Mission Control strip and on
the sign-in page). Tag releases as `v<version>` on this repo.

## Planned (not yet started)

- **Agent Guidance — interactive decision trees** (Yonyx-class guided call
  scripts, native): design spec in
  `genx-ui/docs/future/agent-guidance-decision-trees.md`. No code yet.

## Unreleased

- **Role installs: non-telephony boxes kept a stale heartbeat and had no
  keepalive cron**: the `ADMIN_keepalive_ALL.pl` cron line was only written
  when the box was DB-primary or telephony, so a Web/Slave/Archive-only server
  got no cron entry at all — `VARactive_keepalives` was inert there and editing
  it did nothing until the line was added by hand. Those boxes also had no
  `AST_update.pl` (keepalive flag `1`), so `server_updater.last_update` was
  maintained only by `genx-server-stats.pl` on a 4s loop and the admin Reports
  server list showed them 0-4s behind the dialers (worst case ~8s, against a
  10s RED threshold). Every role now gets the keepalive cron and flag `1`,
  Asterisk starts on every role via `rc.local` (deliberately without the
  telephony-only `AST_reset_mysql_vars`/dahdi/ip_relay steps, which would wipe
  live cluster state from a box that places no calls), `active_asterisk_server`
  is `Y` on every role, and `genx-server-stats.pl` re-touches every 1s instead
  of 4s as a fallback for boxes where Asterisk is down. `active_agent_login_server`
  stays telephony-only — the phones-alias load balancer filters on it, so only
  real dialers should be selectable as an agent's phone server.

- **Firewall: webphone WSS port 8089 stays open**: all three installers were
  removing `8089/tcp` from the public zone, while the whitelist rich rules in
  the bundled `firewall.zip` `public.xml` grant whitelisted ipsets only the
  firewalld `https` service (443/tcp). A client whitelisted via ViciWhite or
  the DynPortal could load the agent screen but every webphone failed to
  register; only the hardcoded management IPs (full accept) were unaffected.
  The scripts now `--add-port=8089/tcp` instead.
- **Manager dashboard cleanup**: the QA & Recording Review dashboard panel is
  suppressed in the production build while QA/Recordings navigation remains
  available to groups with recording access.
- **User and phone provisioning**: individual and bulk user creation can
  auto-provision a native `phones_alias` login plus one generated phone row per
  active calling/Asterisk server. New user passwords default to `123456` with
  `force_change_password='Y'`; phone/SIP secrets are generated per phone row.
- **VICIdial-style phone aliases**: agent login resolves a `phones_alias`
  login to an active member phone and load-balances by current live-agent load,
  with alias order as the tie-break.
- **Security hardening**: admin/agent sessions periodically revalidate current
  user, group, force-password, and phone state; recordings endpoints require
  `access_recordings`; campaign-script previews render in sandboxed frames; and
  server error logs avoid full query strings.
- **Overlay remediation sync**: installer now writes `GENX_UI_PUBLIC_HOST`,
  emits Apache Host/header/security gates for `/genx` and `/genxapi`, and
  deploys the hardened app/API source from the ViciBox clone remediation.
- **API secret handling**: `/genxapi/api.php` rejects `pass`/`api_key` in GET
  query strings and supports `X-GenX-API-Key` / `Authorization: Bearer`.
- **Load-test safety**: `tools/loadtest/setup.sh` now requires
  `ALLOW_GENX_LOADTEST=YES` before writing live fixtures or publishing
  `sink.php`.

## v1.0.0-rc.1 — 2026-07-13

First release candidate. Validated by a full from-scratch five-server
cluster rebuild (AlmaLinux 9.8: DB primary, replication slave, archive,
web/GenX, telephony) with zero-error installs, followed by an acceptance
pass, a 21M-call scale seed, and a per-role UI walkthrough with zero
console errors.

### Highlights since the last stable baseline

- **Role hierarchy, seeded at install**: SUPERADMIN (GenX technicians),
  ADMIN (highest client role, group-enforced floor-manager template),
  SUPERVISORS and QC (reports-only), AGENTS (agent screen only), APIUSERS
  (API service accounts). Group flag templates re-stamp on every user save.
- **Unified sign-in page**: one login for every account; agent-only groups
  get the campaign/phone step in place, admin groups go to Mission Control,
  SuperAdmins choose. Per-group `ui_access` routing enforced server-side.
- **Forced first-login password change**: accounts bootstrap as `1234` and
  must set a real password (8-30 chars) at first login in either UI; the
  stock `force_change_password` flag is shared with legacy admin.php so
  whichever UI is hit first prompts and the other never asks.
- **Client-admin API key management**: ADMIN-level users can mint/revoke
  keys on API service accounts; key auth for the GenX API (`/genxapi/`).
- **Archive-aware reporting**: every report family spans live + `_archive`
  tables transparently; nightly retention crons ship with the installer.
- **Custom Report Matrix** with saved reports and stock automated-report
  email scheduling.
- **Campaign page rework**: pill-modalized Detail page, count-tile campaign
  tools, stacked report modals, per-list toggles with status breakdowns.
- **Performance at scale**: shared lead-count cache (one 60s scan for all
  sessions), replica read routing for reports/dashboards/catalog, PK-ordered
  recordings catalog. Replica load ~0.3 under a 21M-call dataset.
- **Installer hardening from the rebuild**: keyless-table seed guards
  (user groups, pause codes), audio store on role-split clusters, release
  prune fix, 120s report proxy timeout, legacy admin.php PHP 8 fix,
  first-login wizard cleared on GenX installs.

### Known gaps (tracked for v1.0.0)

- Outbound report email needs an SMTP smarthost on the voicemail server.
- Agent console does not yet fire campaign start/dispo/no-agent URLs.
- User guide screenshots refresh pending.
