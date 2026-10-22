#!/bin/bash
# Isolated command stubs: no package installation or service changes.
set -euo pipefail
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
rpm() {
    [ "${MISSING:-}" != "${4:-}" ] || return 1
    if [ "${MIXED:-}" = "${4:-}" ]; then printf '8.2.36'; else printf '%s' "$VERSION"; fi
}
php() { printf '%s' "${CLI_VERSION:-$VERSION}"; }
php-fpm() { printf 'PHP %s (fpm-fcgi)\n' "${FPM_VERSION:-$VERSION}"; }
dnf() {
    [ "$*" = '--refresh upgrade -y php*' ] || return 99
    [ "${DNF_FAIL:-0}" = 0 ]
}
export -f rpm php php-fpm dnf

check() {
    local expected=$1 label=$2 actual=0
    shift 2
    env "$@" bash "$SCRIPT_DIR/ensure-patched-php.sh" --check >/dev/null 2>&1 || actual=$?
    if { [ "$expected" = pass ] && [ "$actual" -ne 0 ]; } ||
       { [ "$expected" = fail ] && [ "$actual" -eq 0 ]; }; then
        echo "FAIL: $label"; exit 1
    fi
    echo "PASS: $label"
}
check fail 'vulnerable 8.2.34' VERSION=8.2.34
check pass 'fixed minimum 8.2.35' VERSION=8.2.35
check pass 'later patch 8.2.36' VERSION=8.2.36
check fail 'unsupported branch' VERSION=8.3.36
check fail 'malformed version' VERSION=unknown
check fail 'missing FPM package' VERSION=8.2.35 MISSING=php-fpm
check fail 'mixed core packages' VERSION=8.2.35 MIXED=php-opcache
check fail 'stale CLI binary' VERSION=8.2.35 CLI_VERSION=8.2.34
check fail 'stale FPM binary' VERSION=8.2.35 FPM_VERSION=8.2.34
VERSION=8.2.35 bash "$SCRIPT_DIR/ensure-patched-php.sh" --upgrade >/dev/null
echo 'PASS: refresh/upgrade transaction'
if VERSION=8.2.35 DNF_FAIL=1 bash "$SCRIPT_DIR/ensure-patched-php.sh" --upgrade >/dev/null 2>&1; then
    echo 'FAIL: failed transaction accepted'; exit 1
fi
echo 'PASS: failed transaction stops gate'
for installer in vicidial_alma9_role_installer.sh vicidial_alma9_installer.sh vicidial-main-82.sh; do
    file="$SCRIPT_DIR/../$installer"
    grep -Fq 'php php-fpm php-cli' "$file"
    grep -Fq 'bash "$SCRIPT_DIR/tools/ensure-patched-php.sh" --upgrade || exit 1' "$file"
    grep -Fq 'bash "$SCRIPT_DIR/tools/ensure-patched-php.sh" --check || exit 1' "$file"
    bash -n "$file"
done
echo 'PASS: all three installer entry points wired and syntax valid'
