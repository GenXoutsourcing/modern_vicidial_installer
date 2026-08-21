#!/usr/bin/env bash
# install-genx-ui.sh — build + deploy the GenX UI onto a VICIdial web server.
# Idempotent: safe to re-run for every deploy (the standard flow is
# `git pull --ff-only && ./install-genx-ui.sh`). What it does:
#   1. copies genx-ui/ into a timestamped /opt/genx-ui/releases/<ts> dir,
#      npm ci + vite build there, then re-points the 'current' symlink
#      (old releases pruned to the newest 3);
#   2. writes /etc/genx-ui.env (DB creds read from /etc/astguiclient.conf,
#      GENX_UI_PUBLIC_HOST for Host validation, and GENX_UI_DB_SLAVE_HOST
#      auto-synced by the genx-ui-slave-sync cron);
#   3. installs the systemd unit + Apache /genx/ proxy/security conf and restarts;
#   4. health-checks /api/health (with retries — this script runs under
#      set -e inside the role installer) and prints a settings preflight.
# Debugging a failed deploy: journalctl -u genx-ui -n 50.
set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_SRC="$SCRIPT_DIR/genx-ui"
APP_ROOT="/opt/genx-ui"
APP_USER="genx-ui"
ENV_FILE="/etc/genx-ui.env"
SERVICE_FILE="/etc/systemd/system/genx-ui.service"
APACHE_FILE="/etc/httpd/conf.d/genx-ui.conf"
BASE_PATH="/genx/"
PORT="3200"
DEFAULT_MIN_USER_LEVEL="7"

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Run as root."
  exit 1
fi

if [ ! -d "$APP_SRC" ]; then
  echo "ERROR: Missing $APP_SRC"
  exit 1
fi

get_conf() {
  local key="$1"
  awk -v key="$key" '
    $1 == key && $2 == "=>" {
      $1=""; $2="";
      sub(/^[[:space:]]+/, "");
      sub(/[[:space:];]+$/, "");
      print;
      exit;
    }
  ' /etc/astguiclient.conf 2>/dev/null
}

quote_env() {
  local value="$1"
  value="${value//\\/\\\\}"
  value="${value//\"/\\\"}"
  printf '"%s"' "$value"
}

unquote_env_value() {
  sed -E 's/^[^=]+=//; s/^"//; s/"$//'
}

regex_escape() {
  sed -E 's/[][(){}.^$*+?|\\]/\\&/g'
}

detect_public_host() {
  local host
  host="$(hostname -f 2>/dev/null || hostname 2>/dev/null || true)"
  case "$host" in
    ""|"localhost"|"localhost.localdomain") host="" ;;
  esac
  printf '%s' "$host"
}

detect_primary_ip() {
  local ip_addr
  ip_addr="$(ip -4 route get 1.1.1.1 2>/dev/null | awk '/src/ {for (i=1; i<=NF; i++) if ($i=="src") {print $(i+1); exit}}' || true)"
  if [ -z "$ip_addr" ]; then
    ip_addr="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi
  printf '%s' "$ip_addr"
}

ensure_node() {
  if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
    dnf install -y nodejs npm
  fi

  local major
  major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"

  if [ "$major" -lt 18 ]; then
    dnf module reset -y nodejs || true
    dnf module enable -y nodejs:20 || dnf module enable -y nodejs:18
    dnf install -y nodejs npm
    major="$(node -p "Number(process.versions.node.split('.')[0])" 2>/dev/null || echo 0)"
  fi

  if [ "$major" -lt 18 ]; then
    echo "ERROR: GenX UI requires Node.js 18 or newer."
    exit 1
  fi
}

ensure_node

# Prerequisites normally laid down by the base installer — added here too so
# this script is self-sufficient on an EXISTING VICIdial server.
ensure_audio_store_prereqs() {
  # Always (re)write the helper so permission-policy fixes reach existing boxes
  # on redeploy (the old install-if-missing guard left stale copies behind).
  cat > /usr/local/bin/vicidial-audio-store-dir <<'AUDIOSTOREDIR'
#!/bin/bash
# Creates/permissions the VICIdial central sound store directory named in
# system_settings.sounds_web_directory. DB settings come from
# /etc/astguiclient.conf so this also works on split web/DB topologies where
# the authoritative database is not the local mysql.
conf() { awk -v key="$1" '$1 == key && $2 == "=>" { $1=""; $2=""; sub(/^[[:space:]]+/, ""); sub(/[[:space:];]+$/, ""); print; exit }' /etc/astguiclient.conf 2>/dev/null; }
DB_HOST=$(conf VARDB_server);   [ -n "$DB_HOST" ] || DB_HOST=localhost
DB_NAME=$(conf VARDB_database); [ -n "$DB_NAME" ] || DB_NAME=asterisk
DB_USER=$(conf VARDB_user);     [ -n "$DB_USER" ] || DB_USER=cron
DB_PASS=$(conf VARDB_pass)
DB_PORT=$(conf VARDB_port);     [ -n "$DB_PORT" ] || DB_PORT=3306
audio_dir=$(MYSQL_PWD="$DB_PASS" mysql -h "$DB_HOST" -P "$DB_PORT" -u "$DB_USER" -Nse "select sounds_web_directory from $DB_NAME.system_settings limit 1;" 2>/dev/null | tr -d '\r\n')
case "$audio_dir" in *[!a-zA-Z0-9_-]*) audio_dir='' ;; esac
chown root:root /var/www/html
chmod g-s /var/www/html
chmod 0755 /var/www/html
if [ -n "$audio_dir" ]; then
    mkdir -p "/var/www/html/$audio_dir"
    # Writers: the genx-ui service (audio-store uploads, runs as genx-ui) and
    # legacy admin.php uploads (apache). Owner genx-ui + group apache with
    # setgid/group-write covers both without a world-writable docroot.
    if id genx-ui >/dev/null 2>&1; then store_owner=genx-ui; else store_owner=root; fi
    chown -R "$store_owner":apache "/var/www/html/$audio_dir"
    chmod 2775 "/var/www/html/$audio_dir"
    find "/var/www/html/$audio_dir" -type f -exec chmod 0664 {} + 2>/dev/null
fi
AUDIOSTOREDIR
  chmod 755 /usr/local/bin/vicidial-audio-store-dir

  if ! crontab -l 2>/dev/null | grep -q 'vicidial-audio-store-dir'; then
    { crontab -l 2>/dev/null
      echo ''
      echo '### VICIDIAL audio-store web directory helper'
      echo '* * * * * /usr/local/bin/vicidial-audio-store-dir >/dev/null 2>&1'
    } | crontab -
  fi

  # Audio store sync cron: fix the broken "hourly" spelling if present, add if missing.
  if crontab -l 2>/dev/null | grep -q '^\* 1 \* \* \* /usr/share/astguiclient/ADMIN_audio_store_sync.pl'; then
    crontab -l | sed 's|^\* 1 \* \* \* /usr/share/astguiclient/ADMIN_audio_store_sync.pl|1,16,31,46 * * * * /usr/share/astguiclient/ADMIN_audio_store_sync.pl|' | crontab -
  elif ! crontab -l 2>/dev/null | grep -q 'ADMIN_audio_store_sync.pl'; then
    if [ -f /usr/share/astguiclient/ADMIN_audio_store_sync.pl ]; then
      { crontab -l 2>/dev/null
        echo ''
        echo '###Audio Sync quarter-hourly'
        echo '1,16,31,46 * * * * /usr/share/astguiclient/ADMIN_audio_store_sync.pl --upload --quiet'
      } | crontab -
    fi
  fi
}

ensure_audio_store_prereqs

db_host="$(get_conf VARDB_server)"
db_name="$(get_conf VARDB_database)"
db_user="$(get_conf VARDB_user)"
db_pass="$(get_conf VARDB_pass)"
db_port="$(get_conf VARDB_port)"

[ -n "$db_host" ] || db_host="127.0.0.1"
[ -n "$db_name" ] || db_name="asterisk"
[ -n "$db_user" ] || db_user="cron"
[ -n "$db_port" ] || db_port="3306"

# Auto-discover a replication slave from the cluster's vicibox registry so the
# Reports section can be routed off the primary database. Falls back to no
# slave (reports hit the primary, same as before) if none is registered or it
# is not reachable with the same cron credentials.
db_slave_host=""
if command -v mysql >/dev/null 2>&1; then
  db_slave_host="$(MYSQL_PWD="$db_pass" mysql -h "$db_host" -P "$db_port" -u "$db_user" -N -B \
    -e "SELECT server_ip FROM vicibox WHERE server_type='Database' AND field3='slave' ORDER BY server_id LIMIT 1;" \
    "$db_name" 2>/dev/null || true)"
  if [ -n "$db_slave_host" ] && ! MYSQL_PWD="$db_pass" mysql -h "$db_slave_host" -P "$db_port" -u "$db_user" -N -B -e "SELECT 1;" >/dev/null 2>&1; then
    echo "WARNING: Slave DB $db_slave_host is registered in vicibox but not reachable from here; Reports will use the primary DB."
    db_slave_host=""
  fi
fi

min_user_level="$DEFAULT_MIN_USER_LEVEL"
# AI authoring assist stays dark until a key is set. Preserve a manually-set
# key/model across deploys (the env file is fully rewritten below); empty by
# default so the feature is off and the var is documented for discovery.
ai_assist_key=""
ai_assist_model="claude-opus-4-8"
# DB pool sizing: the code default (6) starves under a real agent floor — one
# lock-stalled query family exhausts the pool and every request (dashboards,
# even /api/health) queues behind it. 100-agent load test froze exactly this
# way. 50/20 is sized for ~100 concurrent agents; preserve manual overrides.
db_pool="50"
db_slave_pool="20"
public_host="$(detect_public_host)"
if [ -f "$ENV_FILE" ]; then
  existing_min_level="$(grep -E '^GENX_UI_MIN_USER_LEVEL=' "$ENV_FILE" | unquote_env_value || true)"
  [ -n "$existing_min_level" ] && min_user_level="$existing_min_level"
  existing_ai_key="$(grep -E '^GENX_UI_AI_ASSIST_KEY=' "$ENV_FILE" | unquote_env_value || true)"
  [ -n "$existing_ai_key" ] && ai_assist_key="$existing_ai_key"
  existing_ai_model="$(grep -E '^GENX_UI_AI_ASSIST_MODEL=' "$ENV_FILE" | unquote_env_value || true)"
  [ -n "$existing_ai_model" ] && ai_assist_model="$existing_ai_model"
  existing_db_pool="$(grep -E '^GENX_UI_DB_POOL=' "$ENV_FILE" | unquote_env_value || true)"
  [ -n "$existing_db_pool" ] && db_pool="$existing_db_pool"
  existing_db_slave_pool="$(grep -E '^GENX_UI_DB_SLAVE_POOL=' "$ENV_FILE" | unquote_env_value || true)"
  [ -n "$existing_db_slave_pool" ] && db_slave_pool="$existing_db_slave_pool"
  existing_public_host="$(grep -E '^GENX_UI_PUBLIC_HOST=' "$ENV_FILE" | unquote_env_value || true)"
  [ -n "$existing_public_host" ] && public_host="$existing_public_host"
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_ROOT" --shell /sbin/nologin "$APP_USER"
fi

release="$APP_ROOT/releases/$(date +%Y%m%d%H%M%S)"
mkdir -p "$release"
tar --exclude node_modules --exclude dist -C "$APP_SRC" -cf - . | tar -C "$release" -xf -

# Prune superseded releases, keeping the 3 newest (the 'current' symlink is
# re-pointed below). Each release carries a full node_modules, so without this
# the disk fills and the recursive chown below gets slower every deploy.
# Sort by NAME, not mtime: tar preserves the source dir's mtime on the fresh
# release, which can sort it OLDEST and make this prune delete the release
# that was just created (hit on the fresh cluster rebuild — the repo clone's
# mtime predated the existing releases). Names are timestamps, so a reverse
# name sort is newest-first.
ls -1d "$APP_ROOT"/releases/*/ 2>/dev/null | sort -r | tail -n +4 | while read -r old_release; do
  rm -rf "$old_release"
done

cd "$release"
# KNOWN TRADE-OFF: npm ci/build run as root (the script requires root for
# systemd/Apache anyway), which executes dependency lifecycle scripts with
# root privileges. The lockfile pins the tree; if this ever moves to
# unpinned installs, build as the genx-ui user or add --ignore-scripts.
if [ -f package-lock.json ]; then
  npm ci
else
  npm install
fi
GENX_UI_BASE_PATH="$BASE_PATH" npm run build
npm prune --omit=dev

ln -sfn "$release" "$APP_ROOT/current"
chown -R "$APP_USER:$APP_USER" "$APP_ROOT"

# Audio store: genx-ui uses VICIdial's own central sound store — the
# system_settings.sounds_web_directory folder under the web root. Creation and
# permissions are handled by the vicidial-audio-store-dir root cron installed
# with the base system, so nothing to do here.

umask 077
cat > "$ENV_FILE" <<EOF
GENX_UI_PORT=$PORT
GENX_UI_BASE_PATH=$(quote_env "$BASE_PATH")
GENX_UI_MIN_USER_LEVEL=$min_user_level
GENX_UI_DB_HOST=$(quote_env "$db_host")
GENX_UI_DB_PORT=$db_port
GENX_UI_DB_NAME=$(quote_env "$db_name")
GENX_UI_DB_USER=$(quote_env "$db_user")
GENX_UI_DB_PASS=$(quote_env "$db_pass")
GENX_UI_DB_SLAVE_HOST=$(quote_env "$db_slave_host")
GENX_UI_DB_POOL=$db_pool
GENX_UI_DB_SLAVE_POOL=$db_slave_pool
GENX_UI_AI_ASSIST_KEY=$(quote_env "$ai_assist_key")
GENX_UI_AI_ASSIST_MODEL=$(quote_env "$ai_assist_model")
GENX_UI_PUBLIC_HOST=$(quote_env "$public_host")
EOF

cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=GenX VICIdial UI
After=network-online.target mariadb.service httpd.service
Wants=network-online.target

[Service]
Type=simple
User=$APP_USER
Group=$APP_USER
WorkingDirectory=$APP_ROOT/current
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
EOF

primary_ip="$(detect_primary_ip)"
allowed_host_regex="^(localhost|127\\.0\\.0\\.1"
rewrite_host_regex="^(localhost|127\\.0\\.0\\.1"
if [ -n "$public_host" ]; then
  escaped_public_host="$(printf '%s' "$public_host" | regex_escape)"
  allowed_host_regex="${allowed_host_regex}|${escaped_public_host}"
  rewrite_host_regex="${rewrite_host_regex}|${escaped_public_host}"
fi
if [ -n "$primary_ip" ]; then
  escaped_primary_ip="$(printf '%s' "$primary_ip" | regex_escape)"
  allowed_host_regex="${allowed_host_regex}|${escaped_primary_ip}"
  rewrite_host_regex="${rewrite_host_regex}|${escaped_primary_ip}"
fi
allowed_host_regex="${allowed_host_regex})(:[0-9]+)?$"
rewrite_host_regex="${rewrite_host_regex})(:[0-9]+)?$"

cat > "$APACHE_FILE" <<EOF
# Managed by modern_vicidial_installer/install-genx-ui.sh
ProxyPreserveHost On
ProxyAddHeaders On

SetEnvIfNoCase Host "$allowed_host_regex" genx_allowed_host=1

<LocationMatch "^/(genx|genxapi)(/|$)">
    Require env genx_allowed_host
</LocationMatch>

RewriteEngine On
RewriteCond %{HTTP_HOST} !${rewrite_host_regex} [NC]
RewriteRule ^/(genx|genxapi)(/|$) - [R=421,L]

RequestHeader set X-Forwarded-Proto "https" "expr=%{HTTPS} == 'on'"
RequestHeader set X-Forwarded-Proto "http" "expr=%{HTTPS} != 'on'"

<LocationMatch "^/genxapi(/|$)">
    Header always set X-Content-Type-Options "nosniff"
    Header always set X-Frame-Options "SAMEORIGIN"
    Header always set Referrer-Policy "strict-origin-when-cross-origin"
    Header always set Content-Security-Policy "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'"
</LocationMatch>

ProxyPass /genxapi/ !
ProxyPass /genxguide/ !
# timeout raised from 30: multi-month archive-spanning report queries on
# 20M+ row datasets legitimately run past 30s cold (found at-scale on the
# fresh cluster rebuild — the proxy 502'd a report db2 was still serving).
ProxyPass /genx/ http://127.0.0.1:$PORT/ retry=0 timeout=120
ProxyPassReverse /genx/ http://127.0.0.1:$PORT/
RedirectMatch 302 ^/genx$ /genx/
EOF

# Block the legacy VICIdial API entry points (Non-Agent, Agent and QC APIs).
# The GenX API at /genxapi/api.php replaces them; blocking at the web server
# survives VICIdial upgrades (unlike deleting the files). Served from the PHP
# docroot, so it is excluded from the /genx proxy above.
cat > /etc/httpd/conf.d/genx-block-legacy-api.conf <<'BLOCKEOF'
# Managed by modern_vicidial_installer/install-genx-ui.sh
# Match trailing PATH_INFO too (/agc/api.php/x) - anchoring on \.php$ alone
# let cgi.fix_pathinfo execute the script via a suffix and dodge the block.
<LocationMatch "^/(agc/api|vicidial/non_agent_api|vicidial/qc_api)\.php(/|$)">
    Require all denied
</LocationMatch>
<Directory "/var/www/html/genxapi">
    DirectoryIndex index.php
    Options -Indexes
</Directory>
<Directory "/var/www/html/genxguide">
    DirectoryIndex index.html
    Options -Indexes
</Directory>
BLOCKEOF

# Install the GenX API replacement + its self-hosted reference docs
# (index.php resolves the endpoint hostname from the request).
if [ -f "$SCRIPT_DIR/genx-ui/genxapi/api.php" ]; then
    install -d -m 0755 /var/www/html/genxapi
    install -m 0644 "$SCRIPT_DIR/genx-ui/genxapi/api.php" /var/www/html/genxapi/api.php
    install -m 0644 "$SCRIPT_DIR/genx-ui/genxapi/index.php" /var/www/html/genxapi/index.php
fi

# Install the self-hosted Admin UI user guide (static HTML + screenshots),
# linked from the Mission Control strip next to API Docs.
if [ -f "$SCRIPT_DIR/genx-ui/guide/index.html" ]; then
    install -d -m 0755 /var/www/html/genxguide /var/www/html/genxguide/img
    # All guide pages, not just index (superadmin.html joined later).
    install -m 0644 "$SCRIPT_DIR"/genx-ui/guide/*.html /var/www/html/genxguide/
    install -m 0644 "$SCRIPT_DIR"/genx-ui/guide/img/*.jpg /var/www/html/genxguide/img/
fi

# A slave DB that joins the cluster AFTER this web install would never be
# picked up (discovery only ran at install time). This cron re-runs the same
# vicibox discovery every 5 minutes and repoints GENX_UI_DB_SLAVE_HOST when a
# reachable slave appears or changes. Update-only: it never clears the value,
# so a briefly unreachable slave cannot flap reports back and forth.
cat > /usr/local/bin/genx-ui-slave-sync.sh <<'SLAVESYNC'
#!/bin/bash
ENV_FILE=/etc/genx-ui.env
[ -f "$ENV_FILE" ] || exit 0
val() { grep -E "^$1=" "$ENV_FILE" | head -1 | sed -E "s/^$1=//; s/^\"//; s/\"\$//"; }
H=$(val GENX_UI_DB_HOST); P=$(val GENX_UI_DB_PORT); U=$(val GENX_UI_DB_USER)
PW=$(val GENX_UI_DB_PASS); N=$(val GENX_UI_DB_NAME); CUR=$(val GENX_UI_DB_SLAVE_HOST)
[ -n "$H" ] || exit 0
SLAVE=$(MYSQL_PWD="$PW" mysql -h "$H" -P "${P:-3306}" -u "${U:-cron}" -N -B \
  -e "SELECT server_ip FROM vicibox WHERE server_type='Database' AND field3='slave' ORDER BY server_id LIMIT 1;" \
  "${N:-asterisk}" 2>/dev/null || true)
[ -n "$SLAVE" ] || exit 0
[ "$SLAVE" = "$CUR" ] && exit 0
MYSQL_PWD="$PW" mysql -h "$SLAVE" -P "${P:-3306}" -u "${U:-cron}" -N -B -e "SELECT 1;" >/dev/null 2>&1 || exit 0
if grep -qE '^GENX_UI_DB_SLAVE_HOST=' "$ENV_FILE"; then
    sed -i "s|^GENX_UI_DB_SLAVE_HOST=.*|GENX_UI_DB_SLAVE_HOST=\"$SLAVE\"|" "$ENV_FILE"
else
    echo "GENX_UI_DB_SLAVE_HOST=\"$SLAVE\"" >> "$ENV_FILE"
fi
systemctl restart genx-ui
logger -t genx-ui-slave-sync "Reports slave DB set to $SLAVE (was '$CUR'), genx-ui restarted"
SLAVESYNC
chmod +x /usr/local/bin/genx-ui-slave-sync.sh
echo "*/5 * * * * root /usr/local/bin/genx-ui-slave-sync.sh" > /etc/cron.d/genx-ui-slave-sync

httpd -t
systemctl daemon-reload
systemctl enable --now genx-ui
systemctl restart genx-ui
systemctl reload httpd

# Health check with retries: first boot can take more than a couple of
# seconds (cold npm cache, genx_ui_sessions table creation, slow DB). This
# script runs under set -e and is invoked from the role installer, so a
# single premature curl failure here used to abort the ENTIRE cluster install
# even though the service came up seconds later.
health_ok=""
for _try in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    health_ok="yes"
    break
  fi
  sleep 3
done
if [ -z "$health_ok" ]; then
  echo "ERROR: genx-ui did not answer /api/health on port $PORT after 30s." >&2
  echo "       Check: journalctl -u genx-ui -n 50" >&2
  exit 1
fi

# Read-only report of the VICIdial settings genx-ui depends on — tells the
# installer exactly what still needs configuring on a vanilla system.
preflight_report() {
  command -v mysql >/dev/null 2>&1 || { echo "(mysql client not found - skipping settings preflight)"; return; }
  q() { MYSQL_PWD="$db_pass" mysql -h "$db_host" -P "$db_port" -u "$db_user" -N -B -e "$1" "$db_name" 2>/dev/null; }
  ok()   { printf '  [ OK ] %s\n' "$1"; }
  warn() { printf '  [WARN] %s\n' "$1"; }

  echo ""
  echo "VICIdial settings preflight for GenX UI:"

  if [ -n "$db_slave_host" ]; then ok "Reports section routed to replica $db_slave_host (primary DB load reduced)"
  else warn "Reports section is querying the primary DB directly - no reachable slave found in vicibox"; fi

  local v d s c c2
  v="$(q 'SELECT webphone_url FROM system_settings')"
  if [ "${#v}" -ge 6 ]; then ok "webphone_url set: $v"
  else warn "system_settings.webphone_url empty - webphone agents get no phone (Admin > System Settings)"; fi

  v="$(q 'SELECT allow_chats FROM system_settings')"
  if [ "$v" = "1" ]; then ok "allow_chats=1 (agent Team Chat enabled)"
  else warn "allow_chats=0 - agent Team Chat disabled (Admin > System Settings)"; fi

  v="$(q 'SELECT sounds_central_control_active FROM system_settings')"
  d="$(q 'SELECT LENGTH(sounds_web_directory) FROM system_settings')"
  s="$(q 'SELECT sounds_web_server FROM system_settings')"
  if [ "$v" = "1" ] && [ "${d:-0}" -ge 30 ]; then ok "central audio store active ($s)"
  else warn "central audio store incomplete (active=${v:-0}, dir len=${d:-0}) - set Central Sound Control Active=1, point Sounds Web Server at THIS web server, then use Audio Store > Initialize"; fi

  v="$(q 'SELECT custom_fields_enabled FROM system_settings')"
  if [ "$v" = "1" ]; then ok "custom_fields_enabled=1 (agent FORM tab)"
  else warn "custom_fields_enabled=0 - per-list custom fields / agent FORM tab disabled"; fi

  while IFS="$(printf '\t')" read -r ip engine; do
    [ -n "$ip" ] || continue
    if [ "$engine" = "CONFBRIDGE" ]; then
      c="$(q "SELECT COUNT(*) FROM vicidial_confbridges WHERE server_ip='$ip'")"
      if [ "${c:-0}" -gt 0 ]; then ok "server $ip: CONFBRIDGE, $c rooms"
      else warn "server $ip: conf_engine=CONFBRIDGE but no vicidial_confbridges rooms - agents cannot log in"; fi
    else
      c="$(q "SELECT COUNT(*) FROM vicidial_conferences WHERE server_ip='$ip'")"
      if [ "${c:-0}" -gt 0 ]; then ok "server $ip: MEETME, $c conferences"
      else warn "server $ip: no vicidial_conferences rooms - agents cannot log in"; fi
    fi
  done <<SERVERS
$(q "SELECT server_ip, conf_engine FROM servers WHERE active_asterisk_server='Y'")
SERVERS

  c="$(q "SELECT COUNT(*) FROM phones WHERE is_webphone IN ('Y','Y_API_LAUNCH') AND active='Y'")"
  if [ "${c:-0}" -gt 0 ]; then ok "$c active webphone(s)"
  else warn "no webphone-enabled phones (phones.is_webphone=Y) - agents need hard phones or webphones"; fi

  c="$(q "SELECT COUNT(*) FROM vicidial_statuses WHERE sale='Y'")"
  c2="$(q "SELECT COUNT(*) FROM vicidial_campaign_statuses WHERE sale='Y'")"
  if [ $(( ${c:-0} + ${c2:-0} )) -gt 0 ]; then ok "sale-flagged statuses: $c system, $c2 campaign (Sales Today tile)"
  else warn "no statuses flagged sale='Y' - Sales Today tile will always read 0"; fi

  c="$(q "SELECT COUNT(*) FROM vicidial_users WHERE user_level >= $min_user_level AND active='Y'")"
  if [ "${c:-0}" -gt 0 ]; then ok "$c active user(s) at level >= $min_user_level for the Admin UI"
  else warn "no active users at level >= $min_user_level - nobody can open the Admin UI"; fi

  c="$(q "SHOW TABLES LIKE 'genx_ui_sessions'" | wc -l)"
  if [ "${c:-0}" -gt 0 ]; then ok "genx_ui_sessions table present (logins survive restarts/deploys)"
  else warn "genx_ui_sessions missing - auto-created at first start if '$db_user' can CREATE TABLE, otherwise sessions are memory-only"; fi

  c="$(q "SELECT COUNT(*) FROM vicidial_pause_codes")"
  if [ "${c:-0}" -gt 0 ]; then ok "$c pause code(s) defined"
  else warn "no pause codes defined - agents can only 'Pause without a reason'"; fi

  echo ""
}
preflight_report

echo "GenX UI installed."
echo "URL path: $BASE_PATH"
echo "VICIdial auth required. Minimum user level: $min_user_level"
echo "Settings stored in $ENV_FILE"
