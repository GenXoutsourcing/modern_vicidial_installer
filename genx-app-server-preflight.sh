#!/usr/bin/env bash
set -Eeuo pipefail

section() {
  printf '\n== %s ==\n' "$1"
}

run() {
  printf '\n$ %s\n' "$*"
  "$@" || true
}

as_root() {
  if [ "${EUID:-$(id -u)}" -eq 0 ]; then
    "$@"
  elif command -v sudo >/dev/null 2>&1; then
    sudo -n "$@"
  else
    return 1
  fi
}

section "Host"
run hostname -f
run date -Is
run cat /etc/os-release
run uname -r
run nproc

section "Resources"
run free -h
run df -hT / /boot /boot/efi

section "Security State"
run getenforce
run as_root firewall-cmd --state
run as_root firewall-cmd --get-active-zones
run as_root firewall-cmd --list-all

section "Core Services"
for service in mariadb httpd asterisk rc-local firewalld crond redis genx-web genx-api genx-worker; do
  printf '%-16s ' "$service"
  systemctl is-active "$service" 2>/dev/null || true
done

section "Runtime Versions"
for cmd in php mysql httpd node npm git redis-server; do
  if command -v "$cmd" >/dev/null 2>&1; then
    printf '\n$ %s --version\n' "$cmd"
    "$cmd" --version 2>&1 | head -n 3 || true
  fi
done
if command -v asterisk >/dev/null 2>&1; then
  run asterisk -V
fi

section "Listening TCP Ports"
run as_root ss -lntp

section "Apache Vhosts"
if command -v httpd >/dev/null 2>&1; then
  run as_root httpd -S
fi

section "Expected Web Paths"
for path in /var/www/html /var/www/html/agc /var/www/html/vicidial /var/www/vhosts/dynportal; do
  run ls -ld "$path"
done

section "VICIdial Config Shape"
if [ -f /etc/astguiclient.conf ]; then
  as_root grep -E '^(VARserver_ip|VARDB_server|VARDB_database|VARDB_user|VARwebserver|VARactive_keepalives|VARasterisk_version|VARREPORT_)' /etc/astguiclient.conf \
    | sed -E 's/(pass[[:space:]]*=>[[:space:]]*).*/\1[REDACTED]/I' || true
else
  echo "/etc/astguiclient.conf not found"
fi

section "VICIdial API Files"
if [ -d /var/www/html ]; then
  as_root find /var/www/html -maxdepth 4 -type f -name '*api*.php' -print | sort || true
fi

section "GenX Config Paths"
for path in /etc/genx /opt/genx /var/log/genx-installer.log; do
  run ls -ld "$path"
done

section "Done"
echo "Preflight complete. Redact secrets before sharing output."
