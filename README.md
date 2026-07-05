# Modern VICIDIAL Installer

VICIDIAL installer for AlmaLinux/Rocky Linux with PHP 8.2, Asterisk 18, WebPhone, Dynamic Portal, SSL support, and the required conference/WebRTC configuration files.

## Copy & Paste the part below first

Run this first on a fresh server. The updates and reboot are important before starting the installer.

```bash
dnf install -y glibc-langpack-en dnf-plugins-core yum-utils

localectl set-locale en_US.UTF-8

timedatectl set-timezone America/New_York

dnf update -y
dnf install -y epel-release git
dnf config-manager --set-enabled crb || true

sed -i 's/^SELINUX=.*/SELINUX=disabled/g' /etc/selinux/config

cd /usr/src
if [ -d modern_vicidial_installer ]; then
    cd modern_vicidial_installer
    git pull --ff-only
else
    git clone https://github.com/GenXoutsourcing/modern_vicidial_installer
fi

reboot
```

## Run the installer after reboot

Log back into the server as root, then run:

```bash
cd /usr/src/modern_vicidial_installer
chmod +x vicidial-main-82.sh
./vicidial-main-82.sh
```

## AlmaLinux 9 installer

For the updated AlmaLinux 9 installer with the newer local assets, SSL/WebRTC fixes, rerun safety, AGC options, and audio-store directory setup, run:

```bash
cd /usr/src/modern_vicidial_installer
chmod +x vicidial_alma9_installer.sh
./vicidial_alma9_installer.sh
```

## Optional: install the GENX modern UI overlay

After VICIDIAL is installed and the web directories exist, install the modern UI overlay with:

```bash
cd /usr/src/modern_vicidial_installer
chmod +x install-genx-overlay.sh
./install-genx-overlay.sh
```

The overlay installer does **not** change stock VICIDIAL PHP files. It installs separate overlay files under `/var/www/html/agc/ui`, `/var/www/html/vicidial/ui`, and `/var/www/html/agc/viciphone`, then enables them with `.user.ini` `auto_prepend_file` entries.

## Included files

This repo contains the main installer and the files it expects to find in the same directory:

- `vicidial-main-82.sh` - main AlmaLinux/Rocky Linux installer
- `vicidial_alma9_installer.sh` - updated AlmaLinux/Rocky Linux 9 installer
- `extensions.conf` - Asterisk dialplan configuration copied during install
- `confbridge-vicidial.conf` - VICIDIAL conference bridge configuration
- `cpanfile` - required Perl module list used by `cpm install -g`
- `vicidial-enable-webrtc.sh` - WebRTC/WebPhone setup helper
- `viciportal-ssl.conf` - Dynamic Portal SSL vhost template used by the WebRTC helper
- `certbot.sh` - SSL certificate renewal helper used by cron
- `install-genx-overlay.sh` - optional GENX modern UI overlay installer wrapper
- `genx-vicidial-overlay/` - agent/admin/report overlay files and hosted VICIphone assets

## GENX VICIDIAL overlay

The `genx-vicidial-overlay/` folder contains the modern UI overlay files from the GENX VICIDIAL skin work. See `genx-vicidial-overlay/README.md` and `genx-vicidial-overlay/OVERLAY_README.md` for included files, deployment notes, and the required agent testing flow.

## GENX sandbox and app planning

Planning docs for the new standalone GenX UI and reporting platform are in `docs/`:

- `docs/genx-sandbox-architecture.md` - two-server sandbox layout, FQDNs, roles, access packet, and safety rules
- `docs/genx-application-roadmap.md` - React/Node application direction, feature phases, reporting goals, and integration rules
- `docs/genx-installer-requirements.md` - repeatable AlmaLinux 9 installer requirements for app-only and hybrid Dynamic Portal deployments

## SSL and firewall notes

If you do not install the SSL certificate during the initial install, you may need to temporarily turn the firewall off before trying again after a reboot. Turn it back on after the certificate is working.

By default, port `443` may be left open publicly so you can log in and change the default password. After setup is complete, review the firewall rules and remove public access you do not need.

If you use a public domain, make sure the domain points to the server before running the SSL/WebPhone portion of the installer.

## Target system

This installer is intended for a fresh AlmaLinux/Rocky Linux server. It installs and configures VICIDIAL components, PHP 8.2 packages, MariaDB, Asterisk 18, DAHDI/libpri pieces, Dynamic Portal files, WebRTC support, and related services.

Use a clean server whenever possible. Running this over an existing production VICIDIAL system can overwrite configuration files.
