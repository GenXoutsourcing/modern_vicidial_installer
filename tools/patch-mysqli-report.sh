#!/bin/bash
# PHP 8.1+ defaults mysqli to MYSQLI_REPORT_ERROR|MYSQLI_REPORT_STRICT, so any
# SQL error inside stock VICIdial PHP (which never try/catches) becomes an
# uncaught mysqli_sql_exception and a 500. Stock code relies on the PHP 7
# behaviour where e.g. a duplicate-key INSERT simply returns false and is
# ignored. Seen on ahbgvici 2026-11-05: agent-screen fatals from a duplicate
# key on vicidial_agent_visibility_log (agc/functions.php mysql_to_mysqli()).
#
# Insert mysqli_report(MYSQLI_REPORT_OFF); immediately before the
# mysqli_connect() call in both stock dbconnect files. Idempotent; re-run
# after any install.pl upgrade re-copies the web files.
set -Eeuo pipefail

WEB_ROOT=${WEB_ROOT:-/var/www/html}
MARK='GENX: PHP 7 mysqli error semantics'

log() { echo "patch-mysqli-report: $*"; }
fail() { echo "patch-mysqli-report: ERROR: $*" >&2; exit 1; }

patch_file() {
    local f=$1
    [ -f "$f" ] || { log "skip: $f not present"; return 0; }
    if grep -qF "$MARK" "$f" || grep -qE '^\s*mysqli_report\s*\(' "$f"; then
        log "ok: $f already sets mysqli_report"
        return 0
    fi
    [ -f "$f.orig-genx" ] || cp -p "$f" "$f.orig-genx"
    cp -p "$f" "$f.pre-genx"
    MARK="$MARK" perl -i -pe '
        if (!$done && /^\s*\$link\s*=\s*mysqli_connect\s*\(/) {
            my $eol = /\r\n\z/ ? "\r\n" : "\n";
            $_ = "mysqli_report(MYSQLI_REPORT_OFF);   # $ENV{MARK}: stock code expects SQL errors to return false, not throw$eol" . $_;
            $done = 1;
        }
        END { exit 1 unless $done }
    ' "$f" || { mv -f "$f.pre-genx" "$f"; fail "mysqli_connect line not found in $f; restored"; }
    if ! php -l "$f" >/dev/null 2>&1; then
        mv -f "$f.pre-genx" "$f"
        fail "$f failed php -l after patch; restored"
    fi
    rm -f "$f.pre-genx"
    log "patched: $f"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
    command -v php >/dev/null 2>&1 || fail "php CLI not found"
    patch_file "$WEB_ROOT/agc/dbconnect_mysqli.php"
    patch_file "$WEB_ROOT/vicidial/dbconnect_mysqli.php"
fi
