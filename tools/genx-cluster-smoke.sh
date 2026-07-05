#!/usr/bin/env bash
set +e

conf="/etc/astguiclient.conf"

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
  ' "$conf" 2>/dev/null
}

host="$(hostname -f 2>/dev/null || hostname)"
db_server="$(get_conf VARDB_server)"
db_database="$(get_conf VARDB_database)"
db_user="$(get_conf VARDB_user)"
db_pass="$(get_conf VARDB_pass)"
db_port="$(get_conf VARDB_port)"
[ -n "$db_port" ] || db_port="3306"

echo "--- host ---"
echo "hostname=$host"
hostname -I 2>/dev/null | awk '{print "ips="$0}'
uptime

echo "--- vicidial db config ---"
echo "VARDB_server=${db_server:-missing}"
echo "VARDB_database=${db_database:-missing}"
echo "VARDB_user=${db_user:-missing}"
echo "VARDB_port=$db_port"

echo "--- services ---"
for svc in mariadb httpd crond rc-local; do
  printf '%s=' "$svc"
  systemctl is-active "$svc" 2>/dev/null
done

echo "--- asterisk ---"
if pgrep -x asterisk >/dev/null 2>&1; then
  echo "process=running"
  asterisk -rx 'core show version' 2>&1 | head -n 1
else
  echo "process=not-running"
fi

echo "--- web local ---"
curl -skI --max-time 8 http://127.0.0.1/ | sed -n '1,4p'
curl -skI --max-time 8 https://127.0.0.1/ | sed -n '1,4p'

echo "--- db via astguiclient ---"
if [ -z "$db_server" ] || [ -z "$db_database" ] || [ -z "$db_user" ] || [ -z "$db_pass" ]; then
  echo "db_check=skipped_missing_config"
  exit 0
fi

tmp_defaults="$(mktemp)"
trap 'rm -f "$tmp_defaults"' EXIT
chmod 600 "$tmp_defaults"
cat > "$tmp_defaults" <<EOF
[client]
host=$db_server
port=$db_port
user=$db_user
password=$db_pass
database=$db_database
connect-timeout=8
EOF

mysql --defaults-extra-file="$tmp_defaults" -NBe "SELECT CONCAT('db_identity=', @@hostname, '|', @@version, '|', DATABASE());" 2>&1
mysql --defaults-extra-file="$tmp_defaults" -NBe "SELECT CONCAT('vicidial_users=', COUNT(*)) FROM vicidial_users;" 2>&1
mysql --defaults-extra-file="$tmp_defaults" -NBe "SHOW TABLES LIKE 'vicidial_%';" 2>&1 | wc -l | awk '{print "vicidial_table_matches="$1}'
