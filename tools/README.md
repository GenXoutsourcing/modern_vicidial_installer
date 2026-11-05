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

## Audio Store Sync Patch

```bash
sudo ./tools/patch-audio-store-sync.sh
```

Idempotent. Removes the stray whitespace around the PHP tags in stock
`/var/www/html/vicidial/classAudioFile.php` (it leaks a blank first line into
every `audio_store.php` response) and adds a guard to
`/usr/share/astguiclient/ADMIN_audio_store_sync.pl` so a blank LIST entry is
skipped instead of being "downloaded" onto the sounds directory, which mailed
root and forced a music-on-hold rebuild plus `res_musiconhold` reload on every
run. Both installers run it after `install.pl`; re-run it after a VICIdial
upgrade re-copies the stock files. Pristine copies are kept as `*.orig-genx`.

## PHP 8 mysqli Report Patch

```bash
sudo ./tools/patch-mysqli-report.sh
```

Idempotent. Inserts `mysqli_report(MYSQLI_REPORT_OFF);` before the connect in
`/var/www/html/agc/dbconnect_mysqli.php` and
`/var/www/html/vicidial/dbconnect_mysqli.php`, restoring the PHP 7 behaviour
stock VICIdial expects (SQL errors return false instead of throwing an
uncaught exception that 500s the agent screen). Both installers run it after
`install.pl`; re-run it after a VICIdial upgrade. Originals kept as `*.orig-genx`.
