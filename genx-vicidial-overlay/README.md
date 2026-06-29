# GENX VICIdial Modern UI Overlay

This folder contains the GENX modern UI overlay for VICIdial agent, admin, report, and hosted VICIphone screens.

The overlay is designed to leave stock VICIdial PHP files untouched. It is enabled through `.user.ini` files that point PHP to the overlay bootstrap files with `auto_prepend_file`.

## What gets installed

- `agc/ui/` → `/var/www/html/agc/ui/`
  - Agent login, agent screen, logout, manual dial, call log, agents view, VICIphone panel, and action board styling.
- `vicidial/ui/` → `/var/www/html/vicidial/ui/`
  - Admin, dashboard, listing, form, and report overlay files.
- `viciphone/` → `/var/www/html/agc/viciphone/`
  - Hosted VICIphone assets, including the GENX mute message hook used by the agent action board.

## Install

From the root of the `modern_vicidial_installer` repo:

```bash
chmod +x install-genx-overlay.sh
./install-genx-overlay.sh
```

Or run this folder's installer directly:

```bash
chmod +x genx-vicidial-overlay/install.sh
./genx-vicidial-overlay/install.sh
```

If your web root is not `/var/www/html`, pass it like this:

```bash
WEB_ROOT=/path/to/html ./install-genx-overlay.sh
```

## Safety behavior

The installer:

- does not edit stock VICIdial PHP files;
- backs up existing `.user.ini` files before changing them;
- preserves non-overlay `.user.ini` settings;
- installs all overlay files as separate files under `/agc/ui`, `/vicidial/ui`, and `/agc/viciphone`;
- runs PHP syntax checks when the PHP CLI is available.

Backups are written to:

```bash
/root/genx-vicidial-overlay-backups/YYYYMMDD-HHMMSS
```

## After install

If PHP is caching `.user.ini`, reload Apache/PHP-FPM before testing:

```bash
systemctl reload httpd 2>/dev/null || systemctl reload apache2 2>/dev/null || true
```

Then test the agent workflow:

1. Open the agent screen.
2. Log out from the agent UI.
3. Click log in again.
4. Hard refresh the browser.
5. Select the campaign.
6. Click submit.

That exact logout → hard refresh → login flow is important when checking overlay changes.
