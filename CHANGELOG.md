# Changelog

Version = `genx-ui/package.json` (shown in the Mission Control strip and on
the sign-in page). Tag releases as `v<version>` on this repo.

## Planned (not yet started)

- **Agent Guidance — interactive decision trees** (Yonyx-class guided call
  scripts, native): design spec in
  `genx-ui/docs/future/agent-guidance-decision-trees.md`. No code yet.

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
