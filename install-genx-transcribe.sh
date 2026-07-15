#!/bin/bash
# install-genx-transcribe.sh
# Installs the GenX recording-transcription worker (faster-whisper, CPU) on the
# server that holds the archived MP3 recordings. Idempotent: safe to re-run to
# pick up a new worker version or dependency bump.
#
# Recordings flow sip1 -> (compress MP3) -> ftp -> archive; recording_log.location
# is rewritten to the archive URL once the move completes. This worker runs on the
# archive (or, later, a dedicated transcription box), polls recording_log for
# finalized rows, transcribes on CPU, and stores results in genx_transcripts.
#
# Run from the repo checkout, e.g.:
#   cd /usr/src/modern_vicidial_installer && bash install-genx-transcribe.sh
set -euo pipefail

SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/genx-transcribe"
APP_DIR="/opt/genx-transcribe"
VENV="$APP_DIR/venv"
ENV_FILE="/etc/genx-transcribe.env"
SERVICE="/etc/systemd/system/genx-transcribe.service"

echo "== GenX transcription installer =="

# --- python venv + deps ---------------------------------------------------
if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required" >&2; exit 1
fi
mkdir -p "$APP_DIR"
if [ ! -d "$VENV" ]; then
  echo "-- creating venv at $VENV"
  python3 -m venv "$VENV"
fi
echo "-- installing/upgrading python deps (faster-whisper, pymysql)"
"$VENV/bin/pip" install --quiet --upgrade pip
"$VENV/bin/pip" install --quiet --upgrade pymysql faster-whisper

# --- worker + unit --------------------------------------------------------
echo "-- installing worker script"
install -m 0755 "$SRC_DIR/genx_transcribe.py" "$APP_DIR/genx_transcribe.py"

echo "-- installing systemd unit"
install -m 0644 "$SRC_DIR/genx-transcribe.service" "$SERVICE"

# --- default env (only written if missing; never clobbers local tuning) ---
if [ ! -f "$ENV_FILE" ]; then
  echo "-- writing default $ENV_FILE"
  cat > "$ENV_FILE" <<'EOF'
# GenX transcription worker settings. DB creds fall back to /etc/astguiclient.conf.
# English call-center default: small.en balances accuracy vs CPU cost.
GENX_WHISPER_MODEL=small.en
GENX_WHISPER_LANGUAGE=en
GENX_WHISPER_COMPUTE=int8
GENX_WHISPER_THREADS=6
GENX_TRANSCRIBE_POLL=15
# Ad-hoc audio dropped here is transcribed too (source=INBOX).
GENX_TRANSCRIBE_INBOX=/archive/transcribe-inbox
# Root that recording_log.location paths resolve under.
GENX_ARCHIVE_PREFIX=/archive
EOF
else
  echo "-- keeping existing $ENV_FILE"
fi

# --- enable + (re)start ---------------------------------------------------
mkdir -p /archive/transcribe-inbox 2>/dev/null || true
systemctl daemon-reload
systemctl enable genx-transcribe.service >/dev/null 2>&1 || true
systemctl restart genx-transcribe.service

echo
echo "GenX transcription worker installed and started."
echo "  Model:    $(grep GENX_WHISPER_MODEL $ENV_FILE | cut -d= -f2)"
echo "  Service:  systemctl status genx-transcribe"
echo "  Logs:     journalctl -u genx-transcribe -f"
echo "  Table:    genx_transcripts (auto-created on first run)"
