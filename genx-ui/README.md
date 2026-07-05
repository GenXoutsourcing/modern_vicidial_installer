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
