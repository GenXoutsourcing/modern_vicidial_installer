#!/usr/bin/env bash
#
# GENX VICIdial modern UI overlay installer.
#
# This installer intentionally does not edit stock VICIdial PHP files. It copies
# overlay files into /var/www/html/agc and /var/www/html/vicidial, then enables
# them with PHP auto_prepend_file entries in each directory's .user.ini file.
# Existing .user.ini files are backed up and non-overlay settings are preserved.

set -euo pipefail

WEB_ROOT="${WEB_ROOT:-/var/www/html}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/genx-vicidial-overlay-backups/$(date +%Y%m%d-%H%M%S)}"
PACKAGE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

AGC_ROOT="${WEB_ROOT}/agc"
VICIDIAL_ROOT="${WEB_ROOT}/vicidial"

say() {
  printf '\n[GENX overlay] %s\n' "$*"
}

fail() {
  printf '\n[GENX overlay] ERROR: %s\n' "$*" >&2
  exit 1
}

require_root() {
  if [[ "${EUID}" -ne 0 ]]; then
    fail "Run this installer as root."
  fi
}

require_directory() {
  local path="$1"
  local label="$2"

  if [[ ! -d "$path" ]]; then
    fail "${label} was not found at ${path}. Set WEB_ROOT=/path/to/html if your web root is different."
  fi
}

copy_tree() {
  local source="$1"
  local target="$2"
  local label="$3"

  [[ -d "$source" ]] || fail "Missing package directory: ${source}"

  say "Installing ${label} to ${target}"
  mkdir -p "$target"
  cp -a "${source}/." "${target}/"
}

backup_file_if_present() {
  local file="$1"
  local backup_name="$2"

  if [[ -f "$file" ]]; then
    mkdir -p "$BACKUP_ROOT"
    cp -a "$file" "${BACKUP_ROOT}/${backup_name}"
  fi
}

write_user_ini() {
  local directory="$1"
  local prepend_file="$2"
  local label="$3"
  local ini_file="${directory}/.user.ini"
  local temp_file="${ini_file}.genx-overlay.tmp"

  [[ -f "$prepend_file" ]] || fail "Overlay bootstrap not found: ${prepend_file}"

  say "Enabling ${label} overlay through ${ini_file}"
  backup_file_if_present "$ini_file" "${label}.user.ini"

  if [[ -f "$ini_file" ]]; then
    grep -v -E '^[[:space:]]*auto_prepend_file[[:space:]]*=' "$ini_file" > "$temp_file" || true
  else
    : > "$temp_file"
  fi

  printf 'auto_prepend_file=%s\n' "$prepend_file" >> "$temp_file"
  mv "$temp_file" "$ini_file"
}

lint_php_file() {
  local file="$1"

  if command -v php >/dev/null 2>&1; then
    php -l "$file" >/dev/null
  fi
}

lint_overlay_php() {
  if ! command -v php >/dev/null 2>&1; then
    say "PHP CLI was not found; skipping local PHP syntax checks."
    return
  fi

  say "Checking PHP syntax for overlay files"
  while IFS= read -r -d '' file; do
    lint_php_file "$file"
  done < <(find "${AGC_ROOT}/ui" "${VICIDIAL_ROOT}/ui" -type f -name '*.php' -print0)
}

set_permissions() {
  say "Setting web-readable permissions"
  find "${AGC_ROOT}/ui" "${VICIDIAL_ROOT}/ui" "${AGC_ROOT}/viciphone" -type d -exec chmod 755 {} \;
  find "${AGC_ROOT}/ui" "${VICIDIAL_ROOT}/ui" "${AGC_ROOT}/viciphone" -type f -exec chmod 644 {} \;
}

main() {
  require_root
  require_directory "$AGC_ROOT" "VICIdial agent web directory"
  require_directory "$VICIDIAL_ROOT" "VICIdial admin web directory"

  say "Backup directory: ${BACKUP_ROOT}"

  copy_tree "${PACKAGE_ROOT}/agc/ui" "${AGC_ROOT}/ui" "agent UI overlay"
  copy_tree "${PACKAGE_ROOT}/vicidial/ui" "${VICIDIAL_ROOT}/ui" "admin/report UI overlay"
  copy_tree "${PACKAGE_ROOT}/viciphone" "${AGC_ROOT}/viciphone" "hosted VICIphone"

  write_user_ini "$AGC_ROOT" "${AGC_ROOT}/ui/bootstrap.php" "agc"
  write_user_ini "$VICIDIAL_ROOT" "${VICIDIAL_ROOT}/ui/bootstrap.php" "vicidial"

  set_permissions
  lint_overlay_php

  say "Install complete."
  say "If PHP uses cached .user.ini values, reload Apache/PHP-FPM before testing."
  say "No stock VICIdial PHP files were modified."
}

main "$@"
