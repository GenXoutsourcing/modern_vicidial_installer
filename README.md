# Modern VICIDIAL Installer

VICIDIAL installer for AlmaLinux/Rocky Linux with PHP 8.2, Asterisk 18, WebPhone, Dynamic Portal, SSL support, and the required conference/WebRTC configuration files.

## Copy & Paste the part below first

Run this first on a fresh server. The updates and reboot are important before starting the installer.

```bash
dnf install -y glibc-langpack-en

localectl set-locale en_US.UTF-8

timedatectl set-timezone America/New_York

yum check-update
yum update -y
yum -y install epel-release
yum update -y
yum install git -y

sed -i 's/SELINUX=enforcing/SELINUX=disabled/g' /etc/selinux/config

cd /usr/src/
git clone https://github.com/GenXoutsourcing/modern_vicidial_installer

reboot
```

## Run the installer after reboot

Log back into the server as root, then run:

```bash
cd /usr/src/modern_vicidial_installer
chmod +x vicidial-main-82.sh
./vicidial-main-82.sh
```

## Included files

This repo contains the main installer and the files it expects to find in the same directory:

- `vicidial-main-82.sh` - main AlmaLinux/Rocky Linux installer
- `extensions.conf` - Asterisk dialplan configuration copied during install
- `confbridge-vicidial.conf` - VICIDIAL conference bridge configuration
- `vicidial-enable-webrtc.sh` - WebRTC/WebPhone setup helper
- `certbot.sh` - SSL certificate renewal helper used by cron

## SSL and firewall notes

If you do not install the SSL certificate during the initial install, you may need to temporarily turn the firewall off before trying again after a reboot. Turn it back on after the certificate is working.

By default, port `443` may be left open publicly so you can log in and change the default password. After setup is complete, review the firewall rules and remove public access you do not need.

If you use a public domain, make sure the domain points to the server before running the SSL/WebPhone portion of the installer.

## Target system

This installer is intended for a fresh AlmaLinux/Rocky Linux server. It installs and configures VICIDIAL components, PHP 8.2 packages, MariaDB, Asterisk 18, DAHDI/libpri pieces, Dynamic Portal files, WebRTC support, and related services.

Use a clean server whenever possible. Running this over an existing production VICIDIAL system can overwrite configuration files.
