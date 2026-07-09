#!/opt/genx-transcribe/venv/bin/python
"""GenX transcription worker.

Polls recording_log for archived recordings on this server and an inbox
directory for ad-hoc audio files, transcribes them with faster-whisper on
CPU, and stores results in the genx_transcripts table.

Stereo files follow the VICIdial STEREO_CALL_RECORDINGS convention:
customer on the Right channel, agent (and third parties) on the Left.
"""

import json
import os
import re
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from urllib.parse import urlparse

import pymysql

ASTGUI_CONF = "/etc/astguiclient.conf"
MODEL_NAME = os.environ.get("GENX_WHISPER_MODEL", "small")
COMPUTE_TYPE = os.environ.get("GENX_WHISPER_COMPUTE", "int8")
CPU_THREADS = int(os.environ.get("GENX_WHISPER_THREADS", "10"))
INBOX_DIR = os.environ.get("GENX_TRANSCRIBE_INBOX", "/archive/transcribe-inbox")
ARCHIVE_PREFIX = os.environ.get("GENX_ARCHIVE_PREFIX", "/archive")
POLL_SECONDS = int(os.environ.get("GENX_TRANSCRIBE_POLL", "15"))
LANGUAGE = os.environ.get("GENX_WHISPER_LANGUAGE", "") or None
AUDIO_EXT = (".mp3", ".wav", ".ogg", ".gsm", ".flac", ".m4a")

TABLE_SQL = """
CREATE TABLE IF NOT EXISTS genx_transcripts (
  transcript_id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  recording_id INT UNSIGNED DEFAULT NULL,
  filename VARCHAR(255) NOT NULL,
  source ENUM('RECORDING_LOG','INBOX') DEFAULT 'RECORDING_LOG',
  lead_id INT UNSIGNED DEFAULT NULL,
  user VARCHAR(20) DEFAULT NULL,
  length_in_sec INT UNSIGNED DEFAULT 0,
  language VARCHAR(8) DEFAULT '',
  model VARCHAR(40) DEFAULT '',
  channels TINYINT DEFAULT 1,
  transcript MEDIUMTEXT,
  segments MEDIUMTEXT,
  process_seconds DECIMAL(8,2) DEFAULT 0,
  status ENUM('QUEUED','PROCESSING','DONE','ERROR') DEFAULT 'QUEUED',
  error VARCHAR(255) DEFAULT '',
  created_at DATETIME,
  completed_at DATETIME,
  UNIQUE KEY uq_filename (filename),
  KEY idx_recording (recording_id),
  KEY idx_status (status),
  FULLTEXT KEY ft_transcript (transcript)
) ENGINE=MyISAM
"""


def log(msg):
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def db_config():
    conf = {}
    with open(ASTGUI_CONF, encoding="utf-8") as fh:
        for line in fh:
            m = re.match(r"\s*VARDB_(\w+)\s*=>\s*(\S+)", line)
            if m:
                conf[m.group(1)] = m.group(2)
    return {
        "host": conf.get("server", "localhost"),
        "user": conf.get("user", "cron"),
        "password": conf.get("pass", ""),
        "database": conf.get("database", "asterisk"),
        "port": int(conf.get("port", "3306")),
        "charset": "utf8mb4",
        "autocommit": True,
    }


def connect():
    return pymysql.connect(**db_config())


def location_to_local(location):
    path = urlparse(location).path
    if not path.startswith("/archive/"):
        return None
    local = path if path.startswith(ARCHIVE_PREFIX) else ARCHIVE_PREFIX + path[len("/archive"):]
    return local if os.path.isfile(local) else None


def enqueue_recording_log(conn):
    with conn.cursor() as cur:
        cur.execute(
            """SELECT r.recording_id, r.filename, r.location, r.length_in_sec,
                      r.user, r.lead_id
               FROM recording_log r
               LEFT JOIN genx_transcripts t ON t.recording_id = r.recording_id
               WHERE t.transcript_id IS NULL
                 AND r.location LIKE 'http%%'
               ORDER BY r.recording_id DESC LIMIT 200"""
        )
        for rec_id, _fname, location, length, user, lead_id in cur.fetchall():
            local = location_to_local(location or "")
            if not local:
                continue
            with conn.cursor() as ins:
                ins.execute(
                    """INSERT IGNORE INTO genx_transcripts
                       (recording_id, filename, source, lead_id, user,
                        length_in_sec, status, created_at)
                       VALUES (%s, %s, 'RECORDING_LOG', %s, %s, %s, 'QUEUED', NOW())""",
                    (rec_id, os.path.basename(local), lead_id, user, length or 0),
                )


def enqueue_inbox(conn):
    if not os.path.isdir(INBOX_DIR):
        return
    for name in sorted(os.listdir(INBOX_DIR)):
        if not name.lower().endswith(AUDIO_EXT):
            continue
        with conn.cursor() as cur:
            cur.execute(
                """INSERT IGNORE INTO genx_transcripts
                   (filename, source, status, created_at)
                   VALUES (%s, 'INBOX', 'QUEUED', NOW())""",
                (name,),
            )


def find_audio_file(row):
    if row["source"] == "INBOX":
        path = os.path.join(INBOX_DIR, row["filename"])
        return path if os.path.isfile(path) else None
    base = row["filename"]
    for root, _dirs, files in os.walk(os.path.join(ARCHIVE_PREFIX, "RECORDINGS")):
        if base in files:
            return os.path.join(root, base)
    return None


def audio_channels(path):
    try:
        out = subprocess.run(
            ["soxi", "-c", path], capture_output=True, text=True, timeout=30
        )
        return int(out.stdout.strip() or "1")
    except Exception:
        return 1


def split_stereo(path, tmpdir):
    left = os.path.join(tmpdir, "left.wav")
    right = os.path.join(tmpdir, "right.wav")
    subprocess.run(["sox", path, left, "remix", "1"], check=True, timeout=120)
    subprocess.run(["sox", path, right, "remix", "2"], check=True, timeout=120)
    return left, right


def transcribe_file(model, path, speaker):
    segments, info = model.transcribe(
        path, language=LANGUAGE, vad_filter=True, beam_size=5
    )
    out = []
    for seg in segments:
        text = seg.text.strip()
        if text:
            out.append(
                {
                    "start": round(seg.start, 2),
                    "end": round(seg.end, 2),
                    "speaker": speaker,
                    "text": text,
                }
            )
    return out, info.language


def process_row(model, conn, row):
    started = time.time()
    path = find_audio_file(row)
    if not path:
        return "ERROR", "audio file not found", [], "", 1
    channels = audio_channels(path)
    segments = []
    language = ""
    if channels >= 2:
        with tempfile.TemporaryDirectory() as tmpdir:
            left, right = split_stereo(path, tmpdir)
            agent_segs, language = transcribe_file(model, left, "AGENT")
            cust_segs, lang2 = transcribe_file(model, right, "CUSTOMER")
            language = language or lang2
            segments = sorted(agent_segs + cust_segs, key=lambda s: s["start"])
    else:
        segments, language = transcribe_file(model, path, "")
    elapsed = time.time() - started
    return "DONE", "", segments, language, channels if channels else 1, elapsed


def main():
    log(f"loading whisper model '{MODEL_NAME}' ({COMPUTE_TYPE}, {CPU_THREADS} threads)")
    from faster_whisper import WhisperModel

    model = WhisperModel(
        MODEL_NAME, device="cpu", compute_type=COMPUTE_TYPE, cpu_threads=CPU_THREADS
    )
    log("model ready")
    os.makedirs(INBOX_DIR, exist_ok=True)

    conn = connect()
    with conn.cursor() as cur:
        cur.execute(TABLE_SQL)
        # Requeue anything stranded mid-file by a restart.
        cur.execute("UPDATE genx_transcripts SET status='QUEUED' WHERE status='PROCESSING'")

    while True:
        try:
            conn.ping(reconnect=True)
            enqueue_recording_log(conn)
            enqueue_inbox(conn)
            with conn.cursor(pymysql.cursors.DictCursor) as cur:
                cur.execute(
                    "SELECT * FROM genx_transcripts WHERE status='QUEUED' "
                    "ORDER BY transcript_id ASC LIMIT 1"
                )
                row = cur.fetchone()
            if not row:
                time.sleep(POLL_SECONDS)
                continue
            with conn.cursor() as cur:
                cur.execute(
                    "UPDATE genx_transcripts SET status='PROCESSING' "
                    "WHERE transcript_id=%s AND status='QUEUED'",
                    (row["transcript_id"],),
                )
                if cur.rowcount < 1:
                    continue
            log(f"transcribing #{row['transcript_id']} {row['filename']}")
            try:
                result = process_row(model, conn, row)
                if result[0] == "ERROR":
                    status, error = result[0], result[1]
                    segments, language, channels, elapsed = [], "", 1, 0
                else:
                    status, error, segments, language, channels, elapsed = result
            except Exception as exc:  # per-file failure must not kill the worker
                status, error = "ERROR", str(exc)[:250]
                segments, language, channels, elapsed = [], "", 1, 0
            transcript = "\n".join(
                (f"[{s['speaker']}] {s['text']}" if s["speaker"] else s["text"])
                for s in segments
            )
            with conn.cursor() as cur:
                cur.execute(
                    """UPDATE genx_transcripts
                       SET status=%s, error=%s, transcript=%s, segments=%s,
                           language=%s, model=%s, channels=%s,
                           process_seconds=%s, completed_at=NOW()
                       WHERE transcript_id=%s""",
                    (
                        status,
                        error,
                        transcript,
                        json.dumps(segments),
                        language or "",
                        MODEL_NAME,
                        channels,
                        round(elapsed, 2),
                        row["transcript_id"],
                    ),
                )
            log(
                f"#{row['transcript_id']} {status}"
                + (f" in {elapsed:.1f}s, {len(segments)} segments" if status == "DONE" else f": {error}")
            )
        except pymysql.MySQLError as exc:
            log(f"db error: {exc}; reconnecting in 30s")
            time.sleep(30)
            try:
                conn = connect()
            except Exception:
                pass
        except Exception as exc:
            log(f"worker error: {exc}")
            time.sleep(30)


if __name__ == "__main__":
    main()
