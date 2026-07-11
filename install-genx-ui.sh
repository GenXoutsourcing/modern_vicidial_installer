#!/usr/bin/env bash
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
  if [ ! -x /usr/local/bin/vicidial-audio-store-dir ]; then
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
chmod 0777 /var/www/html
if [ -n "$audio_dir" ]; then
    mkdir -p "/var/www/html/$audio_dir"
    chown -R root:root "/var/www/html/$audio_dir"
    chmod g-s "/var/www/html/$audio_dir"
    chmod 0777 "/var/www/html/$audio_dir"
fi
AUDIOSTOREDIR
    chmod 755 /usr/local/bin/vicidial-audio-store-dir
  fi

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
if [ -f "$ENV_FILE" ]; then
  existing_min_level="$(grep -E '^GENX_UI_MIN_USER_LEVEL=' "$ENV_FILE" | sed -E 's/^GENX_UI_MIN_USER_LEVEL=//; s/^"//; s/"$//' || true)"
  [ -n "$existing_min_level" ] && min_user_level="$existing_min_level"
fi

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_ROOT" --shell /sbin/nologin "$APP_USER"
fi

release="$APP_ROOT/releases/$(date +%Y%m%d%H%M%S)"
mkdir -p "$release"
tar --exclude node_modules --exclude dist -C "$APP_SRC" -cf - . | tar -C "$release" -xf -

cd "$release"
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

cat > "$APACHE_FILE" <<EOF
# Managed by modern_vicidial_installer/install-genx-ui.sh
ProxyPreserveHost On
ProxyPass /genxapi/ !
ProxyPass /genxguide/ !
ProxyPass /genx/ http://127.0.0.1:$PORT/ retry=0 timeout=30
ProxyPassReverse /genx/ http://127.0.0.1:$PORT/
RedirectMatch 302 ^/genx$ /genx/
EOF

# Block the legacy VICIdial API entry points (Non-Agent, Agent and QC APIs).
# The GenX API at /genxapi/api.php replaces them; blocking at the web server
# survives VICIdial upgrades (unlike deleting the files). Served from the PHP
# docroot, so it is excluded from the /genx proxy above.
cat > /etc/httpd/conf.d/genx-block-legacy-api.conf <<'BLOCKEOF'
# Managed by modern_vicidial_installer/install-genx-ui.sh
<LocationMatch "^/(agc/api|vicidial/non_agent_api|vicidial/qc_api)\.php$">
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
    install -m 0644 "$SCRIPT_DIR/genx-ui/guide/index.html" /var/www/html/genxguide/index.html
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

sleep 2
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null

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
