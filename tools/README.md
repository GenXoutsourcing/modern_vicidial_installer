# GenX Installer Tools

These helpers are read-only checks for validating sandbox and app-server installs.

## Cluster Smoke Check

Run this after installing or clustering a VICidial/App server:

```bash
sudo ./tools/genx-cluster-smoke.sh
```

It verifies:

- Local hostname and IPs
- VICIdial DB target from `/etc/astguiclient.conf`
- MariaDB, Apache, cron, and rc-local service state
- Asterisk process and CLI response
- Local HTTP/HTTPS response
- VICIdial DB connectivity without printing the database password

For an app server, `VARDB_server` should resolve to the intended main VICIdial database host.
