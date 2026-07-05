# GenX VICIdial UI

Standalone GenX operations UI for VICIdial. It runs as its own Node/React app and reads from the configured VICIdial database without modifying VICIdial core screens.

## Local Service

The installer deploys the app to `/opt/genx-ui/current`, runs it on `127.0.0.1:3200`, and exposes it through Apache at `/genx/`.

```bash
sudo ./install-genx-ui.sh
```

The access code and database connection settings are stored in `/etc/genx-ui.env`.

## First Dashboard

The first screen includes:

- VICIdial database health
- live agents and paused agents
- calls today and current calls
- active campaigns and lead pool counts
- hourly call flow
- campaign and live agent tables
