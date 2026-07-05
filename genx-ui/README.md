# GenX VICIdial UI

Standalone GenX operations UI for VICIdial. It runs as its own Node/React app and reads from the configured VICIdial database without modifying VICIdial core screens.

## Local Service

The installer deploys the app to `/opt/genx-ui/current`, runs it on `127.0.0.1:3200`, and exposes it through Apache at `/genx/`.

```bash
sudo ./install-genx-ui.sh
```

The database connection settings and minimum VICIdial user level are stored in `/etc/genx-ui.env`.

Human login requires an active VICIdial user with a valid password and `user_level` at or above `GENX_UI_MIN_USER_LEVEL`, which defaults to `7`.

## First Dashboard

The first screen includes:

- VICIdial database health
- live agents and paused agents
- calls today and current calls
- active campaigns and lead pool counts
- hourly call flow
- campaign and live agent tables
