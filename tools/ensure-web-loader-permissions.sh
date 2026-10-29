#!/bin/bash
# CPAN can inherit umask 077, leaving Apache unable to traverse its libraries.
# Keep module contents/file modes unchanged; repair only root-owned 0700 dirs.
set -Eeuo pipefail

repair_library_directories() {
    local root=$1
    [ -d "$root" ] || return 0
    find -P "$root" -type d -user root -perm 0700 -exec chmod 0755 -- {} +
}

main() {
    [ "$(id -u)" -eq 0 ] || { echo 'ERROR: Run as root.' >&2; return 1; }
    local root converter fixture
    for root in /usr/local/lib64/perl5 /usr/local/share/perl5; do
        repair_library_directories "$root"
    done
    converter=/var/www/html/vicidial/sheet2tab.pl
    [ -f "$converter" ] && [ ! -L "$converter" ] || {
        echo "ERROR: Missing native converter: $converter" >&2; return 1;
    }
    chmod 0755 "$converter"
    runuser -u apache -- perl -MSpreadsheet::Read -MSpreadsheet::XLSX -MText::CSV_XS -e 1
    runuser -u apache -- perl -c "$converter"

    # Verify the actual command used by PHP, including its executable bit.
    # Only synthetic data; no loader request or database connection.
    fixture=$(mktemp -d /tmp/vici-loader-check.XXXXXXXX)
    trap 'rm -rf -- "$fixture"' EXIT
    chown apache:apache "$fixture"
    chmod 0700 "$fixture"
    printf 'phone_number,first_name\n2025550123,Synthetic\n' > "$fixture/input.csv"
    chown apache:apache "$fixture/input.csv"
    runuser -u apache -- bash -c 'cd "$1" && exec "$2" input.csv output.txt' _ "$fixture" "$converter" >/dev/null
    grep -q $'phone_number\tfirst_name' "$fixture/output.txt"
    grep -q $'2025550123\tSynthetic' "$fixture/output.txt"
    rm -rf -- "$fixture"
    trap - EXIT
    echo 'Apache native lead-loader conversion PASS (no leads imported)'
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
    main "$@"
fi
