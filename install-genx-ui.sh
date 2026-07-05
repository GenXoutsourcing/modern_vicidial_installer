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

generate_token() {
  local token=""
  while [ "${#token}" -lt 32 ]; do
    token="$(od -An -N32 -tx1 /dev/urandom)"
    token="${token//[[:space:]]/}"
  done
  printf '%s' "${token:0:32}"
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

db_host="$(get_conf VARDB_server)"
db_name="$(get_conf VARDB_database)"
db_user="$(get_conf VARDB_user)"
db_pass="$(get_conf VARDB_pass)"
db_port="$(get_conf VARDB_port)"

[ -n "$db_host" ] || db_host="127.0.0.1"
[ -n "$db_name" ] || db_name="asterisk"
[ -n "$db_user" ] || db_user="cron"
[ -n "$db_port" ] || db_port="3306"

existing_token=""
if [ -f "$ENV_FILE" ]; then
  existing_token="$(grep -E '^GENX_UI_ACCESS_CODE=' "$ENV_FILE" | sed -E 's/^GENX_UI_ACCESS_CODE=//; s/^"//; s/"$//' || true)"
fi
access_code="${existing_token:-$(generate_token)}"

if ! id "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_ROOT" --shell /sbin/nologin "$APP_USER"
fi

release="$APP_ROOT/releases/$(date +%Y%m%d%H%M%S)"
mkdir -p "$release"
tar --exclude node_modules --exclude dist -C "$APP_SRC" -cf - . | tar -C "$release" -xf -

cd "$release"
npm install
GENX_UI_BASE_PATH="$BASE_PATH" npm run build

ln -sfn "$release" "$APP_ROOT/current"
chown -R "$APP_USER:$APP_USER" "$APP_ROOT"

umask 077
cat > "$ENV_FILE" <<EOF
GENX_UI_PORT=$PORT
GENX_UI_BASE_PATH=$(quote_env "$BASE_PATH")
GENX_UI_ACCESS_CODE=$(quote_env "$access_code")
GENX_UI_DB_HOST=$(quote_env "$db_host")
GENX_UI_DB_PORT=$db_port
GENX_UI_DB_NAME=$(quote_env "$db_name")
GENX_UI_DB_USER=$(quote_env "$db_user")
GENX_UI_DB_PASS=$(quote_env "$db_pass")
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
ProxyPass /genx/ http://127.0.0.1:$PORT/ retry=0 timeout=30
ProxyPassReverse /genx/ http://127.0.0.1:$PORT/
RedirectMatch 302 ^/genx$ /genx/
EOF

httpd -t
systemctl daemon-reload
systemctl enable --now genx-ui
systemctl restart genx-ui
systemctl reload httpd

sleep 2
curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null

echo "GenX UI installed."
echo "URL path: $BASE_PATH"
echo "Access code stored in $ENV_FILE"
