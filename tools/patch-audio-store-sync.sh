#!/bin/bash
# Stock VICIdial ships www/vicidial/classAudioFile.php with a space before
# "<?php" and a blank line after its closing "?>", so every response from
# audio_store.php (which includes it) starts with a stray " \r\n" line. The
# stock ADMIN_audio_store_sync.pl parses that first LIST line as a file with an
# empty name, runs wget with --output-document=/var/lib/asterisk/sounds/
# ("Is a directory" on stderr = one cron mail per run) and counts it as a new
# download, which forces a music-on-hold rebuild and a res_musiconhold reload
# on every run (every 15 minutes with the installer's cron line).
#
# This patches both ends and is idempotent, so it can be re-run after any
# install.pl upgrade re-copies the stock files. Found on ahbgvici 2026-11-05:
# 551 cron mails and 335 MOH reloads in six days.
set -Eeuo pipefail

WEB_FILE=${WEB_FILE:-/var/www/html/vicidial/classAudioFile.php}
SYNC_SCRIPT=${SYNC_SCRIPT:-/usr/share/astguiclient/ADMIN_audio_store_sync.pl}
MARK='GENX guard: skip blank LIST lines'

log() { echo "patch-audio-store-sync: $*"; }
fail() { echo "patch-audio-store-sync: ERROR: $*" >&2; exit 1; }

keep_original() {
    # One pristine copy per file; never overwritten by later runs.
    [ -f "$1.orig-genx" ] || cp -p "$1" "$1.orig-genx"
}

patch_web_file() {
    [ -f "$WEB_FILE" ] || { log "skip: $WEB_FILE not present"; return 0; }
    if ! perl -0ne 'exit(( /\A\s+<\?php/ || /\?>\r?\n(?:\r?\n)+\z/ ) ? 0 : 1)' "$WEB_FILE"; then
        log "ok: $WEB_FILE already clean"
        return 0
    fi
    keep_original "$WEB_FILE"
    cp -p "$WEB_FILE" "$WEB_FILE.pre-genx"
    perl -0pi -e 's/\A\s+(?=<\?php)//; s/\?>(\r?\n)(?:\r?\n)+\z/?>$1/' "$WEB_FILE"
    if command -v php >/dev/null 2>&1 && ! php -l "$WEB_FILE" >/dev/null 2>&1; then
        mv -f "$WEB_FILE.pre-genx" "$WEB_FILE"
        fail "$WEB_FILE failed php -l after patch; restored"
    fi
    rm -f "$WEB_FILE.pre-genx"
    log "patched: $WEB_FILE (stray whitespace around the PHP tags removed)"
}

patch_sync_script() {
    [ -f "$SYNC_SCRIPT" ] || { log "skip: $SYNC_SCRIPT not present"; return 0; }
    if grep -qF "$MARK" "$SYNC_SCRIPT"; then
        log "ok: $SYNC_SCRIPT already guarded"
        return 0
    fi
    keep_original "$SYNC_SCRIPT"
    cp -p "$SYNC_SCRIPT" "$SYNC_SCRIPT.pre-genx"
    MARK="$MARK" perl -i -pe '
        if (!$done && /^\s*\$fileepoch\s*=\s*\$file_data\[4\];/) {
            $_ .= "\tif (length(\$filename) < 1) {\$i++; next;}   # $ENV{MARK} (stock classAudioFile.php leading whitespace); a blank entry forced a MOH rebuild every run\n";
            $done = 1;
        }
        END { exit 1 unless $done }
    ' "$SYNC_SCRIPT" || { mv -f "$SYNC_SCRIPT.pre-genx" "$SYNC_SCRIPT"; fail "anchor line not found in $SYNC_SCRIPT; restored"; }
    if ! perl -c "$SYNC_SCRIPT" >/dev/null 2>&1; then
        mv -f "$SYNC_SCRIPT.pre-genx" "$SYNC_SCRIPT"
        fail "$SYNC_SCRIPT failed perl -c after patch; restored"
    fi
    rm -f "$SYNC_SCRIPT.pre-genx"
    log "patched: $SYNC_SCRIPT (blank LIST entries skipped)"
}

if [[ ${BASH_SOURCE[0]} == "$0" ]]; then
    patch_web_file
    patch_sync_script
fi
