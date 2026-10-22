#!/bin/bash
# Installer gate for CVE-2026-109618 and CVE-2026-109619 (PHP2Shell).
# This installer deliberately stays on the tested PHP 8.2 branch.
set -euo pipefail

fail() { echo "ERROR: $*" >&2; exit 1; }

case "${1:-}" in
    --upgrade)
        # Refresh metadata and update already installed extensions together.
        dnf --refresh upgrade -y 'php*' || fail "PHP update failed; installation stopped."
        ;;
    --check) ;;
    *) fail "Usage: $0 --upgrade|--check" ;;
esac

reference=''
for package in php-common php-cli php-fpm php-opcache; do
    version=$(rpm -q --qf '%{VERSION}' "$package") || fail "Missing required package: $package"
    [[ "$version" =~ ^8\.2\.([0-9]+)$ ]] || fail "$package $version is outside the supported PHP 8.2 branch."
    (( 10#${BASH_REMATCH[1]} >= 35 )) || fail "$package $version is vulnerable to PHP2Shell; PHP 8.2.35 or newer 8.2 is required. Check repository availability."
    if [ -n "$reference" ] && [ "$version" != "$reference" ]; then
        fail "Mixed PHP package versions: $package is $version, expected $reference."
    fi
    reference=$version
done

cli_version=$(php -n -r 'echo PHP_VERSION;') || fail "PHP CLI could not run."
[ "$cli_version" = "$reference" ] || fail "PHP CLI runtime $cli_version does not match patched packages $reference."
fpm_banner=$(php-fpm -n -v) || fail "PHP-FPM could not run."
fpm_version=$(printf '%s\n' "$fpm_banner" | awk 'NR == 1 {print $2}')
[ "$fpm_version" = "$reference" ] || fail "PHP-FPM runtime $fpm_version does not match patched packages $reference."
echo "PHP security gate passed: CLI/FPM and core packages are PHP $reference (minimum 8.2.35)."
