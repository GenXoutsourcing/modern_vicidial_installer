#!/bin/bash
set -Ee -o pipefail

trap 'echo "ERROR: Installer failed at line $LINENO while running: $BASH_COMMAND"; exit 1' ERR

# New role-aware installer track. Keep vicidial_alma9_installer.sh and
# vicidial-main-82.sh unchanged while this ViciBox-style flow is tested.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSET_DIR="$SCRIPT_DIR/assets"

echo "VICIdial role-aware installation for AlmaLinux 9/RockyLinux 9"

DEFAULT_CRON_DB_PASS="1234"
DEFAULT_CUSTOM_DB_PASS="custom1234"
# 10.10.10.15 is the placeholder IP baked into stock VICIdial's
# first_server_install.sql seed data; the confbridge INSERTs below reuse it
# and ADMIN_update_server_ip.pl then rewrites everything to this server's
# real IP. Leftover 10.10.10.15 rows after an install mean that rewrite step
# failed. Do not change unless the stock seed SQL changes.
OLD_SERVER_IP="${OLD_SERVER_IP:-10.10.10.15}"
REBOOT_AFTER_INSTALL="${REBOOT_AFTER_INSTALL:-yes}"
CERTBOT_STAGING="${CERTBOT_STAGING:-no}"
VICIDIAL_ROLE_MODE="${VICIDIAL_ROLE_MODE:-express}"
ROLE_DATABASE="${ROLE_DATABASE:-yes}"
ROLE_WEB="${ROLE_WEB:-yes}"
ROLE_TELEPHONY="${ROLE_TELEPHONY:-yes}"
ROLE_ARCHIVE="${ROLE_ARCHIVE:-no}"
ROLE_DATABASE_SLAVE="${ROLE_DATABASE_SLAVE:-no}"
VICIDIAL_DB_HOST="${VICIDIAL_DB_HOST:-127.0.0.1}"
VICIDIAL_DB_NAME="${VICIDIAL_DB_NAME:-asterisk}"
VICIDIAL_DB_PORT="${VICIDIAL_DB_PORT:-3306}"
VICIDIAL_SERVER_ID="${VICIDIAL_SERVER_ID:-}"
VICIDIAL_EXTERNAL_IP="${VICIDIAL_EXTERNAL_IP:-}"
VICIDIAL_ARCHIVE_HOST="${VICIDIAL_ARCHIVE_HOST:-X}"
VICIDIAL_ARCHIVE_USER="${VICIDIAL_ARCHIVE_USER:-cronarchive}"
VICIDIAL_ARCHIVE_PASS="${VICIDIAL_ARCHIVE_PASS:-archive1234}"
VICIDIAL_ARCHIVE_PORT="${VICIDIAL_ARCHIVE_PORT:-21}"
VICIDIAL_ARCHIVE_DIR="${VICIDIAL_ARCHIVE_DIR:-}"
VICIDIAL_ARCHIVE_URL="${VICIDIAL_ARCHIVE_URL:-http://}"
ROLE_INSTALL_WEBRTC="${ROLE_INSTALL_WEBRTC:-yes}"
ROLE_FIREWALL_ENABLED="${ROLE_FIREWALL_ENABLED:-yes}"
CLUSTER_JOIN="${CLUSTER_JOIN:-no}"
CLUSTER_DB_USER="${CLUSTER_DB_USER:-cron}"
SLAVE_DB_USER="${SLAVE_DB_USER:-slave}"
SLAVE_DB_PASS="${SLAVE_DB_PASS:-slave1234}"
MYSQL_SLAVE_SERVER_ID="${MYSQL_SLAVE_SERVER_ID:-2}"
RECORDINGS_STORAGE="${RECORDINGS_STORAGE:-local}"
RECORDINGS_FTP_LAYOUT="${RECORDINGS_FTP_LAYOUT:-dated}"
WEB_IS_SOUND_SERVER="${WEB_IS_SOUND_SERVER:-yes}"
INSTALL_GENX_UI="${INSTALL_GENX_UI:-yes}"
ARCHIVE_RETENTION_DAYS="${ARCHIVE_RETENTION_DAYS:-0}"
EXTRA_WHITELIST_IPS="${EXTRA_WHITELIST_IPS:-}"

if [ "${EUID:-$(id -u)}" -ne 0 ]; then
    echo "ERROR: Run this installer as root."
    exit 1
fi

if [ -r /etc/os-release ]; then
    . /etc/os-release
    if ! echo "${PLATFORM_ID:-}" | grep -Eq 'platform:el9|platform:almalinux9|platform:rocky9'; then
        echo "WARNING: This installer was updated for Enterprise Linux 9. Detected: ${PRETTY_NAME:-unknown}"
        read -p "Press Enter to continue anyway, or Ctrl+C to stop: "
    fi
fi

# NOTE: the steps below mutate the system BEFORE the role-summary
# confirmation prompt (locale, timezone, SELinux off; the hostname prompt
# later also applies immediately). Answering "no" at the summary does NOT
# roll these back. Warn up front so a look-around run is an informed choice.
echo "NOTE: continuing past this point sets locale/timezone, disables SELinux,"
echo "      and applies the hostname you enter — even if you cancel at the"
echo "      final confirmation. Ctrl+C now to leave the system untouched."
dnf install -y glibc-langpack-en dnf-plugins-core yum-utils
localectl set-locale en_US.UTF-8 || true
timedatectl set-timezone America/New_York || true

if command -v getenforce >/dev/null 2>&1; then
    setenforce 0 || true
fi
if [ -f /etc/selinux/config ]; then
    sed -i 's/^SELINUX=.*/SELINUX=disabled/g' /etc/selinux/config
fi

# Function to prompt user for input
prompt() {
    local varname=$1
    local prompt_text=$2
    local default_value=$3
    read -p "$prompt_text [$default_value]: " input
    export $varname="${input:-$default_value}"
}

prompt_secret() {
    local varname=$1
    local prompt_text=$2
    local default_value=$3
    local input
    # Reject ' " \ and backtick: these passwords are interpolated into SQL
    # heredocs (CREATE USER ... IDENTIFIED BY '$PASS', vicibox registry
    # INSERTs) and config files. An unescaped quote would abort the install
    # halfway with users half-created — refuse it up front instead.
    while true; do
        read -s -p "$prompt_text: " input
        echo
        input="${input:-$default_value}"
        case "$input" in
            *"'"*|*'"'*|*'\'*|*'`'*)
                echo "Password may not contain quotes, backslashes or backticks. Try again." ;;
            *)
                break ;;
        esac
    done
    export $varname="$input"
}

yes_no() {
    local prompt_text=$1
    local default_value=$2
    local input
    read -p "$prompt_text [$default_value]: " input
    input="${input:-$default_value}"
    [[ "$input" =~ ^[Yy] ]]
}

normalize_yes_no() {
    local value=$1
    if [[ "$value" =~ ^[Yy] ]]; then
        printf 'yes'
    else
        printf 'no'
    fi
}

choose_vicidial_roles() {
    local role_choice

    echo
    echo "VICIdial role selection"
    echo "1) Express/all-in-one: Database + Web + Telephony (new system)"
    echo "2) Custom roles for a NEW system: primary Database plus Web/Telephony/Archive"
    echo "3) Add this server to an EXISTING cluster: Web, Telephony, Archive, Slave Database"
    read -p "Select install mode [1]: " role_choice
    role_choice="${role_choice:-1}"

    if [ "$role_choice" = "1" ]; then
        VICIDIAL_ROLE_MODE="express"
        CLUSTER_JOIN="no"
        ROLE_DATABASE="yes"
        ROLE_WEB="yes"
        ROLE_TELEPHONY="yes"
        ROLE_ARCHIVE="no"
        ROLE_DATABASE_SLAVE="no"
    elif [ "$role_choice" = "3" ]; then
        VICIDIAL_ROLE_MODE="join"
        CLUSTER_JOIN="yes"
        ROLE_DATABASE="no"
        if yes_no "Will this server be a replication SLAVE database?" "no"; then ROLE_DATABASE_SLAVE="yes"; else ROLE_DATABASE_SLAVE="no"; fi
        if yes_no "Will this server be used as a Web server?" "no"; then ROLE_WEB="yes"; else ROLE_WEB="no"; fi
        if yes_no "Will this server be used as a Telephony server?" "no"; then ROLE_TELEPHONY="yes"; else ROLE_TELEPHONY="no"; fi
        if yes_no "Will this server be used as an Archive server?" "no"; then ROLE_ARCHIVE="yes"; else ROLE_ARCHIVE="no"; fi
        if [ "$ROLE_DATABASE_SLAVE" != "yes" ] && [ "$ROLE_WEB" != "yes" ] && [ "$ROLE_TELEPHONY" != "yes" ] && [ "$ROLE_ARCHIVE" != "yes" ]; then
            echo "ERROR: At least one role must be selected."
            exit 1
        fi
        return 0
    else
        VICIDIAL_ROLE_MODE="custom"
        CLUSTER_JOIN="no"
        ROLE_DATABASE_SLAVE="no"
        if yes_no "Will this server be used as the Database?" "no"; then ROLE_DATABASE="yes"; else ROLE_DATABASE="no"; fi
        if yes_no "Will this server be used as a Web server?" "no"; then ROLE_WEB="yes"; else ROLE_WEB="no"; fi
        if yes_no "Will this server be used as a Telephony server?" "no"; then ROLE_TELEPHONY="yes"; else ROLE_TELEPHONY="no"; fi
        if yes_no "Will this server be used as an Archive server?" "no"; then ROLE_ARCHIVE="yes"; else ROLE_ARCHIVE="no"; fi
    fi

    if [ "$ROLE_DATABASE" != "yes" ] && [ "$ROLE_WEB" != "yes" ] && [ "$ROLE_TELEPHONY" != "yes" ] && [ "$ROLE_ARCHIVE" != "yes" ]; then
        echo "ERROR: At least one role must be selected."
        exit 1
    fi
}

derive_role_settings() {
    local local_ip=$1
    local fqdn=$2

    ROLE_DATABASE=$(normalize_yes_no "$ROLE_DATABASE")
    ROLE_WEB=$(normalize_yes_no "$ROLE_WEB")
    ROLE_TELEPHONY=$(normalize_yes_no "$ROLE_TELEPHONY")
    ROLE_ARCHIVE=$(normalize_yes_no "$ROLE_ARCHIVE")
    ROLE_DATABASE_SLAVE=$(normalize_yes_no "$ROLE_DATABASE_SLAVE")

    if [ -z "$VICIDIAL_SERVER_ID" ]; then
        VICIDIAL_SERVER_ID=$(printf '%s' "${fqdn%%.*}" | tr '[:lower:]' '[:upper:]' | tr -cd 'A-Z0-9_-' | cut -c1-10)
    fi
    if [ -z "$VICIDIAL_EXTERNAL_IP" ]; then
        VICIDIAL_EXTERNAL_IP="$local_ip"
    fi
    if [ "$ROLE_DATABASE" = "yes" ] && [ "$ROLE_DATABASE_SLAVE" != "yes" ]; then
        VICIDIAL_DB_HOST="127.0.0.1"
    elif [ "$CLUSTER_JOIN" != "yes" ]; then
        prompt VICIDIAL_DB_HOST "Primary database IP/host" "$VICIDIAL_DB_HOST"
    fi

    if [ "$ROLE_ARCHIVE" = "yes" ]; then
        VICIDIAL_ARCHIVE_HOST="$local_ip"
        # No trailing slash: AST_CRON_audio_3_ftp builds location as "$VARHTTP_path/$file".
        # https so recording links are not blocked as mixed content in the https admin UI.
        VICIDIAL_ARCHIVE_URL="https://${fqdn}/archive/RECORDINGS"
        VICIDIAL_ARCHIVE_DIR="RECORDINGS"
    fi
}

print_role_summary() {
    echo
    echo "--- VICIdial Role Install Summary ---"
    echo "Mode       : $VICIDIAL_ROLE_MODE"
    if [ "$CLUSTER_JOIN" = "yes" ]; then
        echo "Cluster DB : $VICIDIAL_DB_HOST:$VICIDIAL_DB_PORT ($VICIDIAL_DB_NAME as $CLUSTER_DB_USER)"
        if [ "$ROLE_TELEPHONY" = "yes" ]; then
            echo "Recordings : $RECORDINGS_STORAGE"
            if [ "$RECORDINGS_STORAGE" = "archive" ]; then
                echo "FTP layout : $RECORDINGS_FTP_LAYOUT"
            fi
        fi
        if [ "$ROLE_DATABASE_SLAVE" = "yes" ]; then
            echo "Slave srvid: $MYSQL_SLAVE_SERVER_ID"
        fi
    fi
    echo "Server ID  : $VICIDIAL_SERVER_ID"
    echo "Local IP   : $ip_address"
    echo "External IP: $VICIDIAL_EXTERNAL_IP"
    echo "Database   : $ROLE_DATABASE"
    echo "DB Slave   : $ROLE_DATABASE_SLAVE"
    echo "Web        : $ROLE_WEB"
    echo "Telephony  : $ROLE_TELEPHONY"
    echo "Archive    : $ROLE_ARCHIVE"
    echo "Firewall   : $ROLE_FIREWALL_ENABLED"
    if [ "$ROLE_WEB" = "yes" ]; then
        echo "GenX UI    : $INSTALL_GENX_UI"
    fi
    echo
    echo "--- Database ---"
    echo "DB Host    : $VICIDIAL_DB_HOST"
    echo "DB Name    : $VICIDIAL_DB_NAME"
    echo "DB Port    : $VICIDIAL_DB_PORT"
    echo "Cron User  : cron"
    echo "Custom User: custom"
    if [ "$ROLE_ARCHIVE" = "yes" ] || [ "$VICIDIAL_ARCHIVE_HOST" != "X" ]; then
        echo
        echo "--- Archive ---"
        echo "Host       : $VICIDIAL_ARCHIVE_HOST"
        echo "User       : $VICIDIAL_ARCHIVE_USER"
        echo "Port       : $VICIDIAL_ARCHIVE_PORT"
        echo "Directory  : $VICIDIAL_ARCHIVE_DIR"
        echo "URL        : $VICIDIAL_ARCHIVE_URL"
        if [ "$ROLE_ARCHIVE" = "yes" ]; then
            if [ "$ARCHIVE_RETENTION_DAYS" -gt 0 ]; then
                echo "Retention  : $ARCHIVE_RETENTION_DAYS days"
            else
                echo "Retention  : keep forever"
            fi
        fi
    fi
    echo
}

choose_firewall_policy() {
    if [ "$ROLE_DATABASE" = "yes" ] && [ "$ROLE_WEB" != "yes" ] && [ "$ROLE_TELEPHONY" != "yes" ] && [ "$ROLE_ARCHIVE" != "yes" ]; then
        ROLE_FIREWALL_ENABLED="no"
        if yes_no "Dedicated database role detected. Enable built-in firewall anyway?" "no"; then
            ROLE_FIREWALL_ENABLED="yes"
        fi
    else
        ROLE_FIREWALL_ENABLED="yes"
        if yes_no "Disable the built-in firewall?" "no"; then
            ROLE_FIREWALL_ENABLED="no"
        fi
    fi
}

role_active_keepalives() {
    # ViciBox parity (vicibox-install.pl): DB-primary=579E (5 VDadapt,
    # 7 VDauto_dial_FILL, 9 timeclock auto-logout, E email — cluster
    # singletons), telephony=123468S (per-dialer processes), a server with
    # both roles=123456789ES, and everything else (web/archive/slave-only)=X.
    local db_primary=no
    if [ "$ROLE_DATABASE" = "yes" ] && [ "$ROLE_DATABASE_SLAVE" != "yes" ]; then
        db_primary=yes
    fi
    if [ "$db_primary" = "yes" ] && [ "$ROLE_TELEPHONY" = "yes" ]; then
        printf '123456789ES'
    elif [ "$db_primary" = "yes" ]; then
        printf '579E'
    elif [ "$ROLE_TELEPHONY" = "yes" ]; then
        printf '123468S'
    else
        printf 'X'
    fi
}

run_vicidial_install_pl() {
    local copy_sample_configs=${1:-yes}
    local db_server=$VICIDIAL_DB_HOST
    local active_keepalives
    local args

    if [ "$ROLE_DATABASE" = "yes" ] && [ "$ROLE_DATABASE_SLAVE" != "yes" ]; then
        db_server="localhost"
    fi
    active_keepalives=$(role_active_keepalives)

    args=(
        --no-prompt
        --web=/var/www/html
        --asterisk_version=18
        "--server_ip=$ip_address"
        "--DB_server=$db_server"
        "--DB_database=$VICIDIAL_DB_NAME"
        --DB_user=cron
        "--DB_pass=$CRON_DB_PASS"
        --DB_custom_user=custom
        "--DB_custom_pass=$CUSTOM_DB_PASS"
        "--DB_port=$VICIDIAL_DB_PORT"
        "--active_keepalives=$active_keepalives"
    )
    if [ "$copy_sample_configs" = "yes" ]; then
        args+=(--copy_sample_conf_files=Y)
    fi

    if [ "$VICIDIAL_ARCHIVE_HOST" != "X" ]; then
        args+=(
            "--FTP_host=$VICIDIAL_ARCHIVE_HOST"
            "--FTP_user=$VICIDIAL_ARCHIVE_USER"
            "--FTP_pass=$VICIDIAL_ARCHIVE_PASS"
            "--FTP_port=$VICIDIAL_ARCHIVE_PORT"
            "--FTP_dir=$VICIDIAL_ARCHIVE_DIR"
            "--HTTP_path=$VICIDIAL_ARCHIVE_URL"
        )
    fi

    perl install.pl "${args[@]}"
}

replace_managed_block() {
    local file=$1
    local marker=$2
    sed -i "/[#;] BEGIN ${marker}/,/[#;] END ${marker}/d" "$file" 2>/dev/null || true
    cat >> "$file"
}

validate_fqdn() {
    local name=$1
    if [[ ! "$name" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]]; then
        echo "ERROR: Invalid fully qualified domain name: $name"
        exit 1
    fi
}

validate_db_settings() {
    if [[ ! "$VICIDIAL_DB_NAME" =~ ^[A-Za-z0-9_]+$ ]]; then
        echo "ERROR: Invalid database name: $VICIDIAL_DB_NAME"
        exit 1
    fi
    if [[ ! "$VICIDIAL_DB_PORT" =~ ^[0-9]+$ ]] || [ "$VICIDIAL_DB_PORT" -lt 1 ] || [ "$VICIDIAL_DB_PORT" -gt 65535 ]; then
        echo "ERROR: Invalid database port: $VICIDIAL_DB_PORT"
        exit 1
    fi
}

validate_supported_role_set() {
    if [ "$CLUSTER_JOIN" = "yes" ]; then
        if [ "$ROLE_DATABASE" = "yes" ]; then
            echo "ERROR: Cannot add another primary Database to an existing cluster. Use the slave-database role instead."
            exit 1
        fi
        return 0
    fi
    if [ "$ROLE_DATABASE_SLAVE" = "yes" ]; then
        echo "ERROR: The slave-database role is only available when adding a server to an existing cluster (mode 3)."
        exit 1
    fi
    if [ "$ROLE_DATABASE" != "yes" ]; then
        echo "ERROR: A new system install must include the primary Database role."
        echo "To add Web/Telephony/Archive servers to an existing cluster, rerun and choose mode 3 (join existing cluster)."
        exit 1
    fi
}

cluster_mysql_available() {
    "${MYSQL[@]}" -Nse "SELECT 1;" >/dev/null 2>&1
}

connect_cluster_db() {
    # The connection check runs before the main package phase; make sure the
    # MariaDB client exists on a fresh minimal install.
    if ! command -v mysql >/dev/null 2>&1; then
        dnf install -y mariadb
    fi
    prompt VICIDIAL_DB_HOST "Existing cluster database IP/host" "$VICIDIAL_DB_HOST"
    prompt VICIDIAL_DB_PORT "Cluster database port" "$VICIDIAL_DB_PORT"
    prompt CLUSTER_DB_USER "Cluster database user" "$CLUSTER_DB_USER"
    prompt_secret CRON_DB_PASS "Cluster database password for $CLUSTER_DB_USER (Enter for default $DEFAULT_CRON_DB_PASS)" "$DEFAULT_CRON_DB_PASS"
    # Password via MYSQL_PWD (exported below), never -p on the command line —
    # a -p"pass" argument is visible in /proc/<pid>/cmdline to every local
    # user for each of the dozens of mysql calls in a join install.
    export MYSQL_PWD="$CRON_DB_PASS"
    MYSQL=(mysql -h "$VICIDIAL_DB_HOST" -P "$VICIDIAL_DB_PORT" -u "$CLUSTER_DB_USER")

    while ! cluster_mysql_available; do
        echo "ERROR: Cannot connect to MySQL at $VICIDIAL_DB_HOST:$VICIDIAL_DB_PORT as $CLUSTER_DB_USER."
        echo "Make sure this server's IP ($ip_address) is whitelisted on the cluster (ViciWhite IP list /"
        echo "firewall) and that port $VICIDIAL_DB_PORT is reachable from here, then retry."
        if ! yes_no "Retry the connection?" "yes"; then
            exit 1
        fi
        prompt VICIDIAL_DB_HOST "Existing cluster database IP/host" "$VICIDIAL_DB_HOST"
        prompt_secret CRON_DB_PASS "Cluster database password for $CLUSTER_DB_USER (Enter to keep previous)" "$CRON_DB_PASS"
        export MYSQL_PWD="$CRON_DB_PASS"
        MYSQL=(mysql -h "$VICIDIAL_DB_HOST" -P "$VICIDIAL_DB_PORT" -u "$CLUSTER_DB_USER")
    done
    echo "Cluster database connection OK."
}

fetch_cluster_credentials() {
    local row schema_ver
    prompt VICIDIAL_DB_NAME "Cluster database name" "$VICIDIAL_DB_NAME"
    validate_db_settings

    row=$("${MYSQL[@]}" "$VICIDIAL_DB_NAME" -Nse "SELECT field5, field7, field9 FROM vicibox WHERE server_type='Database' AND field3='local' ORDER BY server_id LIMIT 1;" 2>/dev/null | head -1) || true
    if [ -n "$row" ]; then
        IFS=$'\t' read -r CRON_DB_PASS CUSTOM_DB_PASS SLAVE_DB_PASS <<< "$row"
        export MYSQL_PWD="$CRON_DB_PASS"
        MYSQL=(mysql -h "$VICIDIAL_DB_HOST" -P "$VICIDIAL_DB_PORT" -u "$CLUSTER_DB_USER")
        if ! cluster_mysql_available; then
            echo "ERROR: Credentials from the cluster vicibox registry no longer connect. Fix the registry or firewall and rerun."
            exit 1
        fi
        echo "Loaded cron/custom/slave credentials from the cluster vicibox registry."
    else
        echo "WARNING: No vicibox registry row found on the cluster DB; keeping the entered cron password."
        prompt_secret CUSTOM_DB_PASS "custom DB password for this cluster (Enter for default $DEFAULT_CUSTOM_DB_PASS)" "$DEFAULT_CUSTOM_DB_PASS"
    fi

    # '|| true' so a failed query reaches the tailored error below — without
    # it, set -e kills the script inside the command substitution and the
    # user only sees the generic ERR-trap line number.
    schema_ver=$("${MYSQL[@]}" "$VICIDIAL_DB_NAME" -Nse "SELECT db_schema_version FROM system_settings LIMIT 1;" 2>/dev/null | tr -d '\r\n' || true)
    if [ -z "$schema_ver" ]; then
        echo "ERROR: Could not read system_settings from the cluster database $VICIDIAL_DB_NAME."
        exit 1
    fi
    echo "Cluster DB schema version: $schema_ver"
    echo "NOTE: this installer checks out the latest VICIdial svn trunk. If the cluster runs an older"
    echo "build, agent/admin code on this server may be newer than the cluster schema."
}

choose_recording_storage() {
    local storage_input
    if [ "$CLUSTER_JOIN" != "yes" ] || [ "$ROLE_TELEPHONY" != "yes" ]; then
        return 0
    fi
    read -p "Store call recordings locally or send them to the cluster archive server? (local/archive) [local]: " storage_input
    storage_input="${storage_input:-local}"
    if [[ "$storage_input" =~ ^[Aa] ]]; then
        RECORDINGS_STORAGE="archive"
        fetch_archive_settings
        read -p "Archive layout: dated subdirectories (YYYY/MM/DD) or one flat directory? (dated/flat) [dated]: " layout_input
        if [[ "${layout_input:-dated}" =~ ^[Ff] ]]; then
            RECORDINGS_FTP_LAYOUT="flat"
        else
            RECORDINGS_FTP_LAYOUT="dated"
        fi
    else
        RECORDINGS_STORAGE="local"
    fi
}

fetch_archive_settings() {
    local row
    row=$("${MYSQL[@]}" "$VICIDIAL_DB_NAME" -Nse "SELECT server_ip, field1, field2, field3, field4, field5 FROM vicibox WHERE server_type='Archive' ORDER BY server_id DESC LIMIT 1;" 2>/dev/null | head -1) || true
    if [ -z "$row" ]; then
        echo "ERROR: No Archive server is registered in this cluster (vicibox registry)."
        echo "Build the archive server first, then rerun this install and choose archive recordings."
        exit 1
    fi
    IFS=$'\t' read -r VICIDIAL_ARCHIVE_HOST VICIDIAL_ARCHIVE_USER VICIDIAL_ARCHIVE_PASS VICIDIAL_ARCHIVE_PORT VICIDIAL_ARCHIVE_DIR VICIDIAL_ARCHIVE_URL <<< "$row"
    echo "Using cluster archive server ${VICIDIAL_ARCHIVE_HOST} (FTP ${VICIDIAL_ARCHIVE_USER}@${VICIDIAL_ARCHIVE_HOST}:${VICIDIAL_ARCHIVE_PORT}, dir '${VICIDIAL_ARCHIVE_DIR}', url ${VICIDIAL_ARCHIVE_URL})"
}

join_register_server() {
    local server_name existing src_ip conf_src
    local ast_active ast_ver agent_login gen_conf websock

    server_name=$(printf '%s' "$VICIDIAL_SERVER_ID" | tr -cd 'A-Za-z0-9_-' | cut -c1-10)
    local auto_restart
    # Only telephony servers run Asterisk (ViciBox parity); non-tel roles get
    # auto_restart_asterisk=N so keepalive never tries to start an idle build.
    if [ "$ROLE_TELEPHONY" = "yes" ]; then
        ast_active="Y"; ast_ver="18.21.1-vici"; agent_login="Y"; gen_conf="Y"; auto_restart="Y"
        websock="wss://${DOMAINNAME}:8089/ws"
    else
        ast_active="N"; ast_ver="18.21.1-vici"; agent_login="N"; gen_conf="N"; auto_restart="N"; websock=""
    fi

    # Every cluster member gets a servers-table entry (slave DB and archive
    # included) so it appears in the admin UI and its keepalive can report
    # server stats. Only telephony servers get asterisk-active flags.
    {
        # server_id must be unique cluster-wide. Hostnames often share a first label
        # (e.g. viciboxclone.*), so on collision append the last octet of our IP.
        local dup octet
        dup=$("${MYSQL[@]}" "$VICIDIAL_DB_NAME" -Nse "SELECT COUNT(*) FROM servers WHERE server_id='${server_name}' AND server_ip<>'${ip_address}';")
        if [ "$dup" != "0" ]; then
            octet=${ip_address##*.}
            server_name="$(printf '%s' "$server_name" | cut -c1-$((10 - ${#octet})))${octet}"
            echo "server_id collision in cluster; using ${server_name} for this server."
        fi
        existing=$("${MYSQL[@]}" "$VICIDIAL_DB_NAME" -Nse "SELECT COUNT(*) FROM servers WHERE server_ip='${ip_address}';")
        if [ "$existing" = "0" ]; then
            src_ip=""
            if [ "$ROLE_TELEPHONY" = "yes" ]; then
                src_ip=$("${MYSQL[@]}" "$VICIDIAL_DB_NAME" -Nse "SELECT server_ip FROM servers WHERE active_asterisk_server='Y' ORDER BY server_id LIMIT 1;")
            fi
            if [ -z "$src_ip" ]; then
                src_ip=$("${MYSQL[@]}" "$VICIDIAL_DB_NAME" -Nse "SELECT server_ip FROM servers ORDER BY server_id LIMIT 1;")
            fi
            if [ -z "$src_ip" ]; then
                echo "ERROR: The cluster has no existing servers entry to use as a template."
                exit 1
            fi
            "${MYSQL[@]}" "$VICIDIAL_DB_NAME" <<JOINSRV
CREATE TEMPORARY TABLE _new_server AS SELECT * FROM servers WHERE server_ip='${src_ip}' LIMIT 1;
UPDATE _new_server SET
    server_id='${server_name}',
    server_ip='${ip_address}',
    server_description='${DOMAINNAME}',
    alt_server_ip='${DOMAINNAME}',
    active='Y',
    active_asterisk_server='${ast_active}',
    active_agent_login_server='${agent_login}',
    asterisk_version='${ast_ver}',
    generate_vicidial_conf='${gen_conf}',
    rebuild_conf_files='${gen_conf}',
    auto_restart_asterisk='${auto_restart}',
    vicidial_balance_active='${ast_active}',
    max_vicidial_trunks=125,
    web_socket_url='${websock}';
INSERT INTO servers SELECT * FROM _new_server;
JOINSRV
            echo "Registered server ${server_name} (${ip_address}) in the cluster (template: ${src_ip})."
        else
            echo "A servers entry for ${ip_address} already exists in the cluster; leaving it unchanged."
        fi
    }

    if [ "$ROLE_TELEPHONY" = "yes" ]; then
        conf_src=$("${MYSQL[@]}" "$VICIDIAL_DB_NAME" -Nse "SELECT server_ip FROM vicidial_confbridges WHERE server_ip<>'${ip_address}' GROUP BY server_ip ORDER BY COUNT(*) DESC LIMIT 1;")
        if [ -z "$conf_src" ]; then
            echo "ERROR: No existing server has vicidial_confbridges rows to copy conference ranges from."
            exit 1
        fi
        # Conference tables key on (conf_exten, server_ip): each server reuses the same
        # extension ranges under its own IP. INSERT IGNORE keeps reruns safe.
        "${MYSQL[@]}" "$VICIDIAL_DB_NAME" <<JOINCONF
CREATE TEMPORARY TABLE _c1 AS SELECT * FROM conferences WHERE server_ip='${conf_src}';
UPDATE _c1 SET server_ip='${ip_address}', extension='';
INSERT IGNORE INTO conferences SELECT * FROM _c1;
CREATE TEMPORARY TABLE _c2 AS SELECT * FROM vicidial_conferences WHERE server_ip='${conf_src}';
UPDATE _c2 SET server_ip='${ip_address}', extension='', leave_3way='0', leave_3way_datetime=NULL;
INSERT IGNORE INTO vicidial_conferences SELECT * FROM _c2;
CREATE TEMPORARY TABLE _c3 AS SELECT * FROM vicidial_confbridges WHERE server_ip='${conf_src}';
UPDATE _c3 SET server_ip='${ip_address}', extension='', leave_3way='0', leave_3way_datetime=NULL;
INSERT IGNORE INTO vicidial_confbridges SELECT * FROM _c3;
CREATE TEMPORARY TABLE _p AS SELECT * FROM phones WHERE is_webphone='Y' LIMIT 1;
UPDATE _p SET server_ip='${ip_address}';
INSERT IGNORE INTO phones SELECT * FROM _p;
INSERT INTO phones
    (extension, dialplan_number, voicemail_id, server_ip,
     login, pass, active, protocol, template_id,
     conf_secret, is_webphone, user_group)
SELECT
    '9176', '9176', '9176', '${ip_address}',
    '9176', default_phone_login_password, 'Y', 'SIP', 'WEBRTC',
    default_phone_registration_password, 'Y', '---ALL---'
FROM system_settings
WHERE NOT EXISTS (SELECT 1 FROM phones WHERE server_ip='${ip_address}' AND is_webphone='Y')
LIMIT 1;
INSERT IGNORE INTO server_updater SET server_ip='${ip_address}', last_update=NOW();
JOINCONF
        echo "Copied conference ranges and webphone template from ${conf_src} to ${ip_address}."
    fi

    "${MYSQL[@]}" "$VICIDIAL_DB_NAME" -e "INSERT INTO vicidial_ip_list_entries (ip_list_id, ip_address) SELECT 'ViciWhite', '${ip_address}' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM vicidial_ip_list_entries WHERE ip_list_id='ViciWhite' AND ip_address='${ip_address}');"
}

join_update_cluster_settings() {
    # In a role-split cluster the primary DB install cannot know the web or
    # telephony servers' addresses, so joining servers initialize the
    # cluster-wide sound/voicemail settings. Values that are no longer at
    # install defaults are left alone.
    if [ "$ROLE_WEB" = "yes" ]; then
        # With split web servers (separate agent web boxes) only the ADMIN web
        # server hosts the central audio store; a single/only web server is both.
        if [ "$WEB_IS_SOUND_SERVER" = "yes" ]; then
            "${MYSQL[@]}" "$VICIDIAL_DB_NAME" -e "UPDATE system_settings SET sounds_web_server='https://${DOMAINNAME}', sounds_central_control_active='1' WHERE sounds_web_server IN ('', '127.0.0.1') OR sounds_web_server IS NULL;"
            # The store's random web directory name is normally generated by the
            # express path; on a role-split cluster nothing else sets it, which
            # leaves the audio store unconfigured (found on the first fresh
            # cluster rebuild). Generate it set-if-unset; the every-minute
            # vicidial-audio-store-dir cron then creates and permissions it.
            local store_dir
            store_dir=$(tr -dc 'a-z0-9' < /dev/urandom | head -c 30)
            "${MYSQL[@]}" "$VICIDIAL_DB_NAME" -e "UPDATE system_settings SET sounds_web_directory='${store_dir}' WHERE sounds_web_directory IS NULL OR sounds_web_directory='';"
        fi
        "${MYSQL[@]}" "$VICIDIAL_DB_NAME" -e "UPDATE system_settings SET webphone_url='https://phone.viciphone.com/viciphone.php' WHERE webphone_url IS NULL OR webphone_url IN ('', 'X');"
        if [ "$INSTALL_GENX_UI" = "yes" ]; then
            # A role-split cluster's DB-only primary leaves the 6666 forced
            # first-login change unarmed (no GenX there — see the bootstrap
            # comment in apply_vicidial_database_defaults). The GenX web box
            # owns the bootstrap from here: arm the flag while the password
            # is still 1234, and clear the stock first-login wizard trigger
            # (the installer already rotated the passwords the wizard
            # exists to rotate; trigger + force both set deadlocks legacy
            # admin.php). Both statements no-op on an already-bootstrapped
            # cluster.
            "${MYSQL[@]}" "$VICIDIAL_DB_NAME" -e "UPDATE vicidial_users SET force_change_password='Y' WHERE user='6666' AND pass='1234'; UPDATE system_settings SET first_login_trigger='N' WHERE first_login_trigger='Y';"
        fi
    fi
    if [ "$ROLE_TELEPHONY" = "yes" ]; then
        "${MYSQL[@]}" "$VICIDIAL_DB_NAME" -e "UPDATE system_settings SET active_voicemail_server='${ip_address}' WHERE active_voicemail_server IS NULL OR active_voicemail_server IN ('', '127.0.0.1');"
    fi
}

setup_database_slave() {
    local MYSQL_LOCAL=(mysql -u root)
    local dump_file=/usr/src/vicidial-cluster-dump.sql
    local io_state sql_state

    echo "Configuring this server as a MariaDB replication slave of $VICIDIAL_DB_HOST"

    "${MYSQL_LOCAL[@]}" <<SLAVELOCAL
CREATE DATABASE IF NOT EXISTS $VICIDIAL_DB_NAME DEFAULT CHARACTER SET utf8 COLLATE utf8_unicode_ci;
CREATE USER IF NOT EXISTS 'cron'@'localhost' IDENTIFIED BY '$CRON_DB_PASS';
CREATE USER IF NOT EXISTS 'cron'@'%' IDENTIFIED BY '$CRON_DB_PASS';
CREATE USER IF NOT EXISTS 'custom'@'localhost' IDENTIFIED BY '$CUSTOM_DB_PASS';
CREATE USER IF NOT EXISTS 'custom'@'%' IDENTIFIED BY '$CUSTOM_DB_PASS';
ALTER USER IF EXISTS 'cron'@'localhost' IDENTIFIED BY '$CRON_DB_PASS';
ALTER USER IF EXISTS 'cron'@'%' IDENTIFIED BY '$CRON_DB_PASS';
ALTER USER IF EXISTS 'custom'@'localhost' IDENTIFIED BY '$CUSTOM_DB_PASS';
ALTER USER IF EXISTS 'custom'@'%' IDENTIFIED BY '$CUSTOM_DB_PASS';
GRANT SELECT,CREATE,ALTER,INSERT,UPDATE,DELETE,LOCK TABLES,CREATE TEMPORARY TABLES on $VICIDIAL_DB_NAME.* TO 'cron'@'%';
GRANT SELECT,CREATE,ALTER,INSERT,UPDATE,DELETE,LOCK TABLES,CREATE TEMPORARY TABLES on $VICIDIAL_DB_NAME.* TO 'cron'@'localhost';
GRANT RELOAD ON *.* TO 'cron'@'%';
GRANT RELOAD ON *.* TO 'cron'@'localhost';
GRANT SELECT,CREATE,ALTER,INSERT,UPDATE,DELETE,LOCK TABLES on $VICIDIAL_DB_NAME.* TO 'custom'@'%';
GRANT SELECT,CREATE,ALTER,INSERT,UPDATE,DELETE,LOCK TABLES on $VICIDIAL_DB_NAME.* TO 'custom'@'localhost';
FLUSH PRIVILEGES;
SLAVELOCAL

    echo "Setting replication master before import so the dump's binlog coordinates are kept..."
    "${MYSQL_LOCAL[@]}" -e "STOP SLAVE;" 2>/dev/null || true
    "${MYSQL_LOCAL[@]}" -e "CHANGE MASTER TO MASTER_HOST='$VICIDIAL_DB_HOST', MASTER_PORT=$VICIDIAL_DB_PORT, MASTER_USER='$SLAVE_DB_USER', MASTER_PASSWORD='$SLAVE_DB_PASS';"

    echo "Dumping the cluster database from the master. This locks the master's MyISAM tables while it runs."
    MYSQL_PWD="$SLAVE_DB_PASS" mysqldump -h "$VICIDIAL_DB_HOST" -P "$VICIDIAL_DB_PORT" -u "$SLAVE_DB_USER" \
        --master-data=1 --quick --add-drop-table "$VICIDIAL_DB_NAME" > "$dump_file"

    echo "Importing dump into local MariaDB..."
    "${MYSQL_LOCAL[@]}" "$VICIDIAL_DB_NAME" < "$dump_file"

    "${MYSQL_LOCAL[@]}" -e "START SLAVE;"
    sleep 5
    io_state=$("${MYSQL_LOCAL[@]}" -e "SHOW SLAVE STATUS\G" | awk -F': ' '/Slave_IO_Running:/{print $2}' | tr -d ' ')
    sql_state=$("${MYSQL_LOCAL[@]}" -e "SHOW SLAVE STATUS\G" | awk -F': ' '/Slave_SQL_Running:/{print $2}' | tr -d ' ')
    if [ "$io_state" != "Yes" ] || [ "$sql_state" != "Yes" ]; then
        echo "ERROR: Replication did not start (IO=$io_state SQL=$sql_state). Check SHOW SLAVE STATUS."
        "${MYSQL_LOCAL[@]}" -e "SHOW SLAVE STATUS\G" | grep -E "Last_.*Error|Master_Host|Master_Log" || true
        exit 1
    fi
    rm -f "$dump_file"
    echo "Replication slave is running (IO=Yes SQL=Yes)."
}

setup_archive_server() {
    dnf install -y vsftpd

    if ! id "$VICIDIAL_ARCHIVE_USER" >/dev/null 2>&1; then
        useradd -m -d /archive -s /sbin/nologin "$VICIDIAL_ARCHIVE_USER"
    fi
    grep -q '^/sbin/nologin$' /etc/shells || echo /sbin/nologin >> /etc/shells
    echo "$VICIDIAL_ARCHIVE_USER:$VICIDIAL_ARCHIVE_PASS" | chpasswd

    mkdir -p /archive/RECORDINGS/MP3 /archive/RECORDINGS/ORIG /archive/LOGS /archive/REPORTS
    chown -R "$VICIDIAL_ARCHIVE_USER":"$VICIDIAL_ARCHIVE_USER" /archive
    chmod 755 /archive
    find /archive -type d -exec chmod 755 {} \;

    [ -f /etc/vsftpd/vsftpd.conf.original ] || cp /etc/vsftpd/vsftpd.conf /etc/vsftpd/vsftpd.conf.original
    cat > /etc/vsftpd/vsftpd.conf <<VSFTPDCONF
anonymous_enable=NO
local_enable=YES
write_enable=YES
local_umask=022
dirmessage_enable=YES
xferlog_enable=YES
connect_from_port_20=YES
xferlog_std_format=YES
listen=YES
listen_ipv6=NO
pam_service_name=vsftpd
userlist_enable=YES
userlist_deny=YES
chroot_local_user=YES
allow_writeable_chroot=YES
pasv_enable=YES
pasv_min_port=10090
pasv_max_port=10190
seccomp_sandbox=NO
VSFTPDCONF
    systemctl enable vsftpd
    systemctl restart vsftpd

    replace_managed_block /etc/httpd/conf/httpd.conf GENX_VICIDIAL_ARCHIVE <<EOF
# BEGIN GENX_VICIDIAL_ARCHIVE

Alias /archive "/archive"

<Directory "/archive">
    Options Indexes MultiViews FollowSymLinks
    AllowOverride None
    Require all granted
</Directory>

# END GENX_VICIDIAL_ARCHIVE
EOF
    systemctl restart httpd
    echo "Archive server ready: FTP ${VICIDIAL_ARCHIVE_USER}@${ip_address}:${VICIDIAL_ARCHIVE_PORT} dir='${VICIDIAL_ARCHIVE_DIR}' url=${VICIDIAL_ARCHIVE_URL}"
}

install_certbot_required() {
    if command -v certbot >/dev/null 2>&1; then
        certbot --version
        return 0
    fi

    if dnf install -y --nobest certbot python3-certbot-apache mod_ssl; then
        certbot --version
        return 0
    fi

    echo "ERROR: certbot did not install from AlmaLinux 9/EPEL repositories. Resolve the repository/dependency issue before continuing."
    exit 1
}

copy_asset() {
    local asset_name=$1
    local destination=${2:-$asset_name}
    if [ ! -f "$ASSET_DIR/$asset_name" ]; then
        echo "ERROR: Missing installer asset: $ASSET_DIR/$asset_name"
        exit 1
    fi
    cp -f "$ASSET_DIR/$asset_name" "$destination"
}

fix_vicidial_web_permissions() {
    mkdir -p /var/www/html
    chown -R root:root /var/www/html
    find /var/www/html -type d -exec chmod g-s {} \;
    find /var/www/html -type d -exec chmod 0755 {} \;
    find /var/www/html -type f -exec chmod 644 {} \;
    # Stock helpers that PHP exec()s/passthru()s need their exec bit back
    # after the 644 sweep (sheet2tab.pl for lead-loader spreadsheet
    # conversion, agc/bp.pl for pass hashing, etc.).
    find /var/www/html -type f -name '*.pl' -exec chmod 755 {} \;
    # The lead loader's sheet2tab.pl writes its temp chunk file to its cwd,
    # which PHP sets to the admin web dir — stock requires this dir to be
    # apache-writable. Group-write on the one dir (files stay root 644) is
    # the narrowest relaxation; web ports are dynportal/whitelist-gated so
    # exposure is limited to whitelisted sources.
    if [ -d /var/www/html/vicidial ]; then
        chown root:apache /var/www/html/vicidial
        chmod 775 /var/www/html/vicidial
    fi
    if [ -d /var/www/html/agc ]; then
        touch /var/www/html/agc/vicidial_auth_entries.txt
        chown apache:apache /var/www/html/agc/vicidial_auth_entries.txt
        chmod 0664 /var/www/html/agc/vicidial_auth_entries.txt
    fi
    if [ -d /var/www/html/vicidial ]; then
        # admin.php's one-time housecleaning block fopen()s this marker in the
        # webroot; with the 0755 root:root docroot that write fails and PHP 8
        # fatals (500 on every admin.php hit). Seed the marker so the block —
        # and its webroot writes — never run. Pairs with webroot_writable='0'
        # in the system_settings defaults, which gates the same pattern in
        # functions.php user_authorization().
        printf '1' > /var/www/html/vicidial/old_clear
        chmod 644 /var/www/html/vicidial/old_clear
        rm -f /var/www/html/vicidial/project_auth_entries.txt
    fi
}

configure_agc_options() {
    if [ ! -f /var/www/html/agc/options-example.php ]; then
        echo "ERROR: Missing /var/www/html/agc/options-example.php"
        exit 1
    fi
    cp -f /var/www/html/agc/options-example.php /var/www/html/agc/options.php
    sed -i "s/^\(\$user_login_first[[:space:]]*=[[:space:]]*\)'0'/\1'1'/" /var/www/html/agc/options.php
    sed -i "s/^\(\$webphone_call_seconds[[:space:]]*=[[:space:]]*\)'0'/\1'1'/" /var/www/html/agc/options.php
    chown root:root /var/www/html/agc/options.php
    chmod 644 /var/www/html/agc/options.php
}

configure_audio_store_directory() {
    local audio_dir
    audio_dir=$("${MYSQL[@]}" -Nse "use $VICIDIAL_DB_NAME; select sounds_web_directory from system_settings limit 1;" | tr -d '\r\n')
    if [ -n "$audio_dir" ]; then
        mkdir -p "/var/www/html/$audio_dir"
        # Uploaders: legacy admin.php (apache) now; the genx-ui service user is
        # added by install-genx-ui.sh's audio-store-dir helper when installed.
        chown -R root:apache "/var/www/html/$audio_dir"
        chmod 2775 "/var/www/html/$audio_dir"
    fi
    chown root:root /var/www/html
    chmod g-s /var/www/html
    chmod 0755 /var/www/html
}

configure_pjsip_external_ip() {
    local server_ip=$1
    local pjsip_conf=/etc/asterisk/pjsip.conf

    if [ ! -f "$pjsip_conf" ]; then
        echo "WARNING: $pjsip_conf not found; skipping PJSIP external IP update."
        return 0
    fi

    sed -i "s/SERVER_EXTERNAL_IP/${server_ip}/g" "$pjsip_conf"
    sed -i "s/^\([[:space:]]*external_media_address[[:space:]]*=[[:space:]]*\).*/\1${server_ip}/" "$pjsip_conf"
    sed -i "s/^\([[:space:]]*external_signaling_address[[:space:]]*=[[:space:]]*\).*/\1${server_ip}/" "$pjsip_conf"
}

configure_dynportal_defaults() {
    local redirect_url="https://${DOMAINNAME}/vicidial/welcome.php"

    # GenX branding + the reskinned sign-in page ship baked into dynportal.zip
    # (assets/dynportal.zip); this is now just a post-unzip syntax sanity check.
    if [ -f /var/www/vhosts/dynportal/valid8.php ]; then
        php -l /var/www/vhosts/dynportal/valid8.php >/dev/null
    fi

    if [ -f /var/www/vhosts/dynportal/inc/defaults.inc.php ]; then
        python3 - /var/www/vhosts/dynportal/inc/defaults.inc.php "$redirect_url" <<'PY'
import sys

path, redirect_url = sys.argv[1], sys.argv[2]
with open(path, "r", encoding="utf-8") as handle:
    lines = handle.readlines()

for index, line in enumerate(lines):
    if line.startswith("$PORTAL_redirecturl="):
        lines[index] = f"$PORTAL_redirecturl='{redirect_url}'; // X = Disabled, otherwise set to a url like https://server.ip/agc/vicidial.php\n"
    elif line.startswith("$PORTAL_redirectadmin="):
        lines[index] = f"$PORTAL_redirectadmin='{redirect_url}'; // Only matters if the above is not X and the valued of the $PORTAL_adminfield in vicidial_users equals 'admin'\n"

with open(path, "w", encoding="utf-8") as handle:
    handle.writelines(lines)
PY
        php -l /var/www/vhosts/dynportal/inc/defaults.inc.php >/dev/null
    fi
}

generate_password_25() {
    local password=""
    while [ "${#password}" -lt 25 ]; do
        password="$(od -An -N32 -tx1 /dev/urandom)"
        password="${password//[[:space:]]/}"
    done
    printf '%s' "${password:0:25}"
}

secure_vicidial_default_passwords() {
    local reg_pass login_pass server_pass

    reg_pass=$("${MYSQL[@]}" -Nse "use $VICIDIAL_DB_NAME; select default_phone_registration_password from system_settings limit 1;" | tr -d '\r\n')
    login_pass=$("${MYSQL[@]}" -Nse "use $VICIDIAL_DB_NAME; select default_phone_login_password from system_settings limit 1;" | tr -d '\r\n')
    server_pass=$("${MYSQL[@]}" -Nse "use $VICIDIAL_DB_NAME; select default_server_password from system_settings limit 1;" | tr -d '\r\n')

    if [ -z "$reg_pass" ] || [ "$reg_pass" = "test" ]; then
        reg_pass=$(generate_password_25)
    fi
    if [ -z "$login_pass" ] || [ "$login_pass" = "test" ]; then
        login_pass=$(generate_password_25)
    fi
    if [ -z "$server_pass" ] || [ "$server_pass" = "test" ]; then
        server_pass=$(generate_password_25)
    fi

    "${MYSQL[@]}" "$VICIDIAL_DB_NAME" <<MYSQLPASSDEFAULTS
UPDATE system_settings
SET default_phone_registration_password='${reg_pass}',
    default_phone_login_password='${login_pass}',
    default_server_password='${server_pass}';
MYSQLPASSDEFAULTS
}

# Called THREE times on purpose — do not "deduplicate":
#  1. after schema import (before install.pl): seeds system_settings defaults
#     so install.pl runs with them; its UPDATE servers matches nothing yet.
#  2. after install.pl: install.pl created this server's servers row and
#     overwrote several settings — re-assert ours (conf_engine, alt IPs...).
#  3. after the WebRTC/cert step: vicidial-enable-webrtc.sh rewrites
#     server/web settings again; the final pass restores our values on top.
apply_vicidial_database_defaults() {
    local server_ip=$1
    local cert_domain=$2
    local server_id
    local ast_active="N" ast_ver="18.21.1-vici" auto_restart="N" agent_login="N"

    # Only telephony servers run Asterisk (ViciBox parity); non-tel roles keep
    # auto_restart_asterisk=N so keepalive never tries to start an idle build.
    if [ "$ROLE_TELEPHONY" = "yes" ]; then
        ast_active="Y"; agent_login="Y"; auto_restart="Y"
    fi

    server_id=$(printf '%s' "${cert_domain%%.*}" | tr '[:lower:]' '[:upper:]' | cut -c1-10)

    # See the 6666 bootstrap comment in the SQL below.
    local FORCE_6666_CHANGE="N"
    if [ "$INSTALL_GENX_UI" = "yes" ]; then
        FORCE_6666_CHANGE="Y"
    fi

    "${MYSQL[@]}" "$VICIDIAL_DB_NAME" <<MYSQLDEFAULTS
UPDATE system_settings SET allow_ip_lists='1', allow_chats='1', agent_hidden_sound_seconds=5, agent_logout_link='0', custom_fields_enabled='1', enable_auto_reports='1', webroot_writable='0';

UPDATE servers
SET server_id='${server_id}',
    server_description='${cert_domain}',
    asterisk_version='${ast_ver}',
    active_asterisk_server='${ast_active}',
    active_agent_login_server='${agent_login}',
    generate_vicidial_conf='${ast_active}',
    rebuild_conf_files='${ast_active}',
    vicidial_balance_active='${ast_active}',
    max_vicidial_trunks=125,
    outbound_calls_per_second=10,
    recording_web_link='ALT_IP',
    alt_server_ip='${cert_domain}',
    conf_engine='CONFBRIDGE',
    auto_restart_asterisk='${auto_restart}'
WHERE server_ip='${server_ip}'
   OR server_id='${server_id}'
   OR server_id=LOWER('${server_id}')
   OR server_id='TESTast';

INSERT INTO vicidial_ip_lists
    (ip_list_id, ip_list_name, active, user_group)
VALUES
    ('ViciWhite', 'White List for ViciBox firewall ACL', 'Y', '---ALL---')
ON DUPLICATE KEY UPDATE
    ip_list_name=VALUES(ip_list_name),
    active=VALUES(active),
    user_group=VALUES(user_group);

INSERT INTO vicidial_ip_list_entries
    (ip_list_id, ip_address)
SELECT
    'ViciWhite', '${server_ip}'
FROM DUAL
WHERE NOT EXISTS (
    SELECT 1
    FROM vicidial_ip_list_entries
    WHERE ip_list_id='ViciWhite'
      AND ip_address='${server_ip}'
);

INSERT INTO vicidial_campaigns
    (campaign_id, campaign_name, active, user_group, allow_closers,
     campaign_allow_inbound, default_xfer_group, dial_statuses, lead_order,
     list_order_mix, lead_filter_id, hopper_level, dial_method,
     auto_dial_level, adaptive_intensity, campaign_script, get_call_launch,
     campaign_description, agent_pause_codes_active, campaign_changedate)
VALUES
    ('TESTCAMP', 'Test Campaign', 'Y', '---ALL---', 'Y',
     'Y', '---NONE---', ' NEW -', 'DOWN',
     'DISABLED', 'NONE', 100, 'RATIO',
     '1', '0', '', 'NONE',
     '', 'Y', NOW())
ON DUPLICATE KEY UPDATE
    agent_pause_codes_active=VALUES(agent_pause_codes_active),
    campaign_name=VALUES(campaign_name),
    active=VALUES(active),
    user_group=VALUES(user_group),
    allow_closers=VALUES(allow_closers),
    campaign_allow_inbound=VALUES(campaign_allow_inbound),
    default_xfer_group=VALUES(default_xfer_group),
    dial_statuses=VALUES(dial_statuses),
    lead_order=VALUES(lead_order),
    list_order_mix=VALUES(list_order_mix),
    lead_filter_id=VALUES(lead_filter_id),
    hopper_level=VALUES(hopper_level),
    dial_method=VALUES(dial_method),
    auto_dial_level=VALUES(auto_dial_level),
    adaptive_intensity=VALUES(adaptive_intensity),
    campaign_script=VALUES(campaign_script),
    get_call_launch=VALUES(get_call_launch),
    campaign_description=VALUES(campaign_description),
    campaign_changedate=NOW();

-- vicidial_pause_codes has no unique key (only a campaign_id index), so
-- INSERT IGNORE cannot dedupe across the three defaults passes — guard the
-- whole seed on the campaign having no pause codes yet (found tripled on
-- the fresh cluster rebuild, same family as the user-groups dupes).
INSERT INTO vicidial_pause_codes
    (pause_code, pause_code_name, billable, campaign_id, time_limit, require_mgr_approval)
SELECT t.* FROM (
    SELECT 'BREAK' pc,'Break' pn,'NO' b,'TESTCAMP' c,0 tl,'NO' r UNION ALL
    SELECT 'LUNCH','Lunch','NO','TESTCAMP',0,'NO' UNION ALL
    SELECT 'MTG','Meeting','NO','TESTCAMP',0,'NO' UNION ALL
    SELECT 'TRAIN','Training','NO','TESTCAMP',0,'NO' UNION ALL
    SELECT 'COACH','Coaching','NO','TESTCAMP',0,'NO' UNION ALL
    SELECT 'TECH','Technical Issue','NO','TESTCAMP',0,'NO' UNION ALL
    SELECT 'RR','Restroom','NO','TESTCAMP',0,'NO'
) t
WHERE NOT EXISTS (SELECT 1 FROM vicidial_pause_codes WHERE campaign_id='TESTCAMP');

INSERT INTO vicidial_conf_templates
    (template_id, template_name, user_group, template_contents)
VALUES
    ('WEBRTC', 'WEBRTC Default Phones', '---ALL---',
'type=friend
host=dynamic
context=default
host=dynamic
trustrpid=yes
sendrpid=no
qualify=yes
qualifyfreq=600
transport=ws,wss,udp
encryption=yes
avpf=yes
icesupport=yes
rtcp_mux=yes
directmedia=no
disallow=all
allow=ulaw,opus,vp8,h264
nat=yes
directmedia=no
dtlsenable=yes
dtlsverify=no
dtlscertfile=/etc/vicidial-ssl/cert.pem
dtlsprivatekey=/etc/vicidial-ssl/privkey.pem
dtlssetup=actpass')
ON DUPLICATE KEY UPDATE
    template_name=VALUES(template_name),
    user_group=VALUES(user_group),
    template_contents=VALUES(template_contents);

INSERT INTO phones
    (extension, dialplan_number, voicemail_id, phone_ip, computer_ip, server_ip,
     login, pass, active, protocol, login_user, login_pass, template_id,
     conf_secret, is_webphone, user_group)
SELECT
    '9176', '9176', '9176', NULL, NULL, '${server_ip}',
    '9176', default_phone_login_password, 'Y', 'SIP', NULL, NULL, 'WEBRTC',
    default_phone_registration_password, 'Y', '---ALL---'
FROM system_settings
WHERE '${ast_active}' = 'Y'
LIMIT 1
ON DUPLICATE KEY UPDATE
    dialplan_number=VALUES(dialplan_number),
    voicemail_id=VALUES(voicemail_id),
    phone_ip=VALUES(phone_ip),
    computer_ip=VALUES(computer_ip),
    login=VALUES(login),
    pass=VALUES(pass),
    active=VALUES(active),
    protocol=VALUES(protocol),
    login_user=VALUES(login_user),
    login_pass=VALUES(login_pass),
    template_id=VALUES(template_id),
    conf_secret=VALUES(conf_secret),
    is_webphone=VALUES(is_webphone),
    user_group=VALUES(user_group);

UPDATE vicidial_users vu
JOIN system_settings ss
SET vu.phone_login='9176',
    vu.phone_pass=ss.default_phone_login_password,
    vu.active='Y',
    vu.user_level=9,
    vu.user_group='ADMIN',
    vu.delete_users='1',
    vu.delete_user_groups='1',
    vu.delete_lists='1',
    vu.delete_campaigns='1',
    vu.delete_ingroups='1',
    vu.delete_remote_agents='1',
    vu.load_leads='1',
    vu.campaign_detail='1',
    vu.ast_admin_access='1',
    vu.ast_delete_phones='1',
    vu.delete_scripts='1',
    vu.modify_leads='1',
    vu.change_agent_campaign='1',
    vu.delete_filters='1',
    vu.alter_agent_interface_options='1',
    vu.delete_call_times='1',
    vu.modify_call_times='1',
    vu.modify_users='1',
    vu.modify_campaigns='1',
    vu.modify_lists='1',
    vu.modify_scripts='1',
    vu.modify_filters='1',
    vu.modify_ingroups='1',
    vu.modify_usergroups='1',
    vu.modify_remoteagents='1',
    vu.modify_servers='1',
    vu.view_reports='1',
    vu.qc_enabled='1',
    vu.add_timeclock_log='1',
    vu.modify_timeclock_log='1',
    vu.delete_timeclock_log='1',
    vu.vdc_agent_api_access='1',
    vu.modify_inbound_dids='1',
    vu.delete_inbound_dids='1',
    vu.download_lists='1',
    vu.export_reports='1',
    vu.delete_from_dnc='1',
    vu.modify_shifts='1',
    vu.modify_phones='1',
    vu.modify_carriers='1',
    vu.modify_labels='1',
    vu.modify_statuses='1',
    vu.modify_voicemail='1',
    vu.modify_audiostore='1',
    vu.modify_moh='1',
    vu.modify_tts='1',
    vu.modify_contacts='1',
    vu.modify_email_accounts='1',
    vu.modify_custom_dialplans='1',
    vu.modify_languages='1',
    vu.modify_colors='1',
    vu.modify_auto_reports='1',
    vu.modify_ip_lists='1',
    vu.modify_dial_prefix='1',
    vu.modify_settings_containers='1',
    vu.custom_fields_modify='1',
    vu.pause_code_approval='1',
    vu.modify_custom_dialplans='1',
    vu.ignore_ip_list='0',
    vu.admin_hide_lead_data='0',
    vu.admin_hide_phone_data='0'
WHERE vu.user='6666';

-- Bootstrap credential policy: 6666 starts as 1234. With the GenX UI the
-- unified login owns the forced first-login change via the stock
-- force_change_password flag. WITHOUT the GenX UI the flag must stay 'N':
-- stock fresh installs also have first_login_trigger='Y', and in admin.php
-- the force-change check (ADD=999997) is overridden by the first-login
-- check (ADD=999995), so both flags 'Y' = the license page loops forever
-- and "Continue on to the Initial Setup" is unreachable. The initial-setup
-- page is the stock bootstrap anyway: it rejects reusing the old password
-- and rotates the default phone/server passwords. (Cluster nuance: a
-- DB-only primary has no web role so this leaves 'N'; the first web box's
-- legacy initial setup handles the bootstrap there.)
-- Two guarded steps because stock varies: if stock randomized the password
-- AND set the flag, reset to 1234; then set the flag per the policy above
-- while the password is still 1234. Both no-op once it has been changed.
UPDATE vicidial_users SET pass='1234', pass_hash=''
WHERE user='6666' AND force_change_password='Y';
UPDATE vicidial_users SET force_change_password='${FORCE_6666_CHANGE}'
WHERE user='6666' AND pass='1234';

-- GenX installs skip the stock first-login wizard: this installer already
-- does the wizard's work (default phone/server password rotation), and a
-- set trigger deadlocks legacy admin.php while the GenX force-change flag
-- is armed (first-login check ADD=999995 overrides force-change 999997).
-- Stock-only installs keep the wizard as their bootstrap.
UPDATE system_settings SET first_login_trigger='N' WHERE '${FORCE_6666_CHANGE}'='Y';
MYSQLDEFAULTS

    apply_genx_role_hierarchy
}

# GenX role hierarchy: SUPERADMIN (GenX technicians, full access), ADMIN
# (stock group reserved for VICIdial's system accounts VDAD/VDCL; hidden from
# the group picker for non-SuperAdmins by the GenX UI), ADMINISTRATORS
# (highest CLIENT role, a full clone of ADMIN's floor-manager template —
# client owners are created here), SUPERVISORS and QC (reports-only admin
# views), AGENTS (agent screen only), APIUSERS (external API service
# accounts). The genx_group_permissions rows drive the
# GenX UI's nav gating, flag templates, ui_access login routing, and the API
# group gate; the DDL must stay identical to the CREATE in
# genx-ui/server/index.js. Everything is INSERT IGNORE / guarded so reruns
# and upgrades never clobber a site's customized values.
apply_genx_role_hierarchy() {
    "${MYSQL[@]}" "$VICIDIAL_DB_NAME" <<'GENXROLES'
CREATE TABLE IF NOT EXISTS genx_group_permissions (
  user_group VARCHAR(20) NOT NULL,
  permission VARCHAR(40) NOT NULL,
  perm_value TEXT DEFAULT NULL,
  PRIMARY KEY (user_group, permission)
) ENGINE=MyISAM DEFAULT CHARSET=utf8 COLLATE=utf8_unicode_ci;

-- vicidial_user_groups has NO primary key (stock schema; legacy admin.php
-- does its own dup checks), so INSERT IGNORE cannot dedupe — every insert
-- needs an explicit NOT EXISTS guard (this function runs three times per
-- install on purpose).
CREATE TEMPORARY TABLE tmp_genx_ug AS SELECT * FROM vicidial_user_groups WHERE user_group='ADMIN';
UPDATE tmp_genx_ug SET user_group='SUPERADMIN', group_name='Super Administrators';
INSERT INTO vicidial_user_groups SELECT * FROM tmp_genx_ug WHERE NOT EXISTS (SELECT 1 FROM vicidial_user_groups vg WHERE vg.user_group='SUPERADMIN');
UPDATE tmp_genx_ug SET user_group='APIUSERS', group_name='API Integration Users';
INSERT INTO vicidial_user_groups SELECT * FROM tmp_genx_ug WHERE NOT EXISTS (SELECT 1 FROM vicidial_user_groups vg WHERE vg.user_group='APIUSERS');
UPDATE tmp_genx_ug SET user_group='SUPERVISORS', group_name='Supervisors';
INSERT INTO vicidial_user_groups SELECT * FROM tmp_genx_ug WHERE NOT EXISTS (SELECT 1 FROM vicidial_user_groups vg WHERE vg.user_group='SUPERVISORS');
UPDATE tmp_genx_ug SET user_group='QC', group_name='Quality Control';
INSERT INTO vicidial_user_groups SELECT * FROM tmp_genx_ug WHERE NOT EXISTS (SELECT 1 FROM vicidial_user_groups vg WHERE vg.user_group='QC');
UPDATE tmp_genx_ug SET user_group='AGENTS', group_name='Agents';
INSERT INTO vicidial_user_groups SELECT * FROM tmp_genx_ug WHERE NOT EXISTS (SELECT 1 FROM vicidial_user_groups vg WHERE vg.user_group='AGENTS');
UPDATE tmp_genx_ug SET user_group='ADMINISTRATORS', group_name='Administrators';
INSERT INTO vicidial_user_groups SELECT * FROM tmp_genx_ug WHERE NOT EXISTS (SELECT 1 FROM vicidial_user_groups vg WHERE vg.user_group='ADMINISTRATORS');
DROP TEMPORARY TABLE tmp_genx_ug;

UPDATE vicidial_users SET user_group='SUPERADMIN' WHERE user='6666' AND user_group='ADMIN';

INSERT IGNORE INTO genx_group_permissions (user_group, permission, perm_value) VALUES
('__GENX__','api_user_group','APIUSERS'),
('ADMIN','nav_sections','users,campaigns,lists,inbound,reports'),
('ADMIN','ui_access','admin'),
('SUPERVISORS','nav_sections','reports'),
('SUPERVISORS','ui_access','admin'),
('QC','nav_sections','reports'),
('QC','ui_access','admin'),
('AGENTS','nav_sections','reports'),
('AGENTS','ui_access','agent');

INSERT IGNORE INTO genx_group_permissions (user_group, permission, perm_value) VALUES
('ADMIN','flag_template','{"vdc_agent_api_access": "1", "delete_campaigns": "0", "delete_lists": "0", "delete_users": "0", "delete_user_groups": "0", "delete_ingroups": "0", "delete_remote_agents": "0", "delete_scripts": "0", "delete_filters": "0", "delete_call_times": "0", "delete_inbound_dids": "0", "delete_from_dnc": "0", "modify_servers": "0", "modify_usergroups": "0", "modify_phones": "0", "ast_delete_phones": "0", "modify_shifts": "0", "modify_carriers": "0", "modify_voicemail": "0", "modify_moh": "0", "modify_tts": "0", "modify_contacts": "0", "modify_languages": "0", "modify_email_accounts": "0", "modify_auto_reports": "0", "modify_audiostore": "0", "modify_ip_lists": "0", "modify_settings_containers": "0", "modify_custom_dialplans": "0", "alter_admin_interface_options": "0", "ast_admin_access": "0", "access_recordings": "1", "load_leads": "1", "campaign_detail": "1"}'),
('SUPERVISORS','flag_template','{"view_reports":"1","export_reports":"1","access_recordings":"1","vdc_agent_api_access":"1","campaign_detail":"0","load_leads":"0","download_lists":"0","modify_users":"0","modify_campaigns":"0","modify_lists":"0","modify_leads":"0","modify_scripts":"0","modify_filters":"0","modify_call_times":"0","modify_inbound_dids":"0","modify_remoteagents":"0","modify_ingroups":"0","modify_statuses":"0","modify_timeclock_log":"0","custom_fields_modify":"0","delete_campaigns":"0","delete_lists":"0","delete_users":"0","delete_user_groups":"0","delete_ingroups":"0","delete_remote_agents":"0","delete_scripts":"0","delete_filters":"0","delete_call_times":"0","delete_inbound_dids":"0","delete_from_dnc":"0","modify_servers":"0","modify_usergroups":"0","modify_phones":"0","ast_delete_phones":"0","modify_shifts":"0","modify_carriers":"0","modify_voicemail":"0","modify_moh":"0","modify_tts":"0","modify_contacts":"0","modify_languages":"0","modify_email_accounts":"0","modify_auto_reports":"0","modify_audiostore":"0","modify_ip_lists":"0","modify_settings_containers":"0","modify_custom_dialplans":"0","alter_admin_interface_options":"0","ast_admin_access":"0"}'),
('QC','flag_template','{"view_reports":"1","export_reports":"1","access_recordings":"1","vdc_agent_api_access":"0","campaign_detail":"0","load_leads":"0","download_lists":"0","modify_users":"0","modify_campaigns":"0","modify_lists":"0","modify_leads":"0","modify_scripts":"0","modify_filters":"0","modify_call_times":"0","modify_inbound_dids":"0","modify_remoteagents":"0","modify_ingroups":"0","modify_statuses":"0","modify_timeclock_log":"0","custom_fields_modify":"0","delete_campaigns":"0","delete_lists":"0","delete_users":"0","delete_user_groups":"0","delete_ingroups":"0","delete_remote_agents":"0","delete_scripts":"0","delete_filters":"0","delete_call_times":"0","delete_inbound_dids":"0","delete_from_dnc":"0","modify_servers":"0","modify_usergroups":"0","modify_phones":"0","ast_delete_phones":"0","modify_shifts":"0","modify_carriers":"0","modify_voicemail":"0","modify_moh":"0","modify_tts":"0","modify_contacts":"0","modify_languages":"0","modify_email_accounts":"0","modify_auto_reports":"0","modify_audiostore":"0","modify_ip_lists":"0","modify_settings_containers":"0","modify_custom_dialplans":"0","alter_admin_interface_options":"0","ast_admin_access":"0"}'),
('AGENTS','flag_template','{"view_reports":"0","export_reports":"0","access_recordings":"0","vdc_agent_api_access":"0","campaign_detail":"0","load_leads":"0","download_lists":"0","modify_users":"0","modify_campaigns":"0","modify_lists":"0","modify_leads":"0","modify_scripts":"0","modify_filters":"0","modify_call_times":"0","modify_inbound_dids":"0","modify_remoteagents":"0","modify_ingroups":"0","modify_statuses":"0","modify_timeclock_log":"0","custom_fields_modify":"0","delete_campaigns":"0","delete_lists":"0","delete_users":"0","delete_user_groups":"0","delete_ingroups":"0","delete_remote_agents":"0","delete_scripts":"0","delete_filters":"0","delete_call_times":"0","delete_inbound_dids":"0","delete_from_dnc":"0","modify_servers":"0","modify_usergroups":"0","modify_phones":"0","ast_delete_phones":"0","modify_shifts":"0","modify_carriers":"0","modify_voicemail":"0","modify_moh":"0","modify_tts":"0","modify_contacts":"0","modify_languages":"0","modify_email_accounts":"0","modify_auto_reports":"0","modify_audiostore":"0","modify_ip_lists":"0","modify_settings_containers":"0","modify_custom_dialplans":"0","alter_admin_interface_options":"0","ast_admin_access":"0"}');

-- ADMINISTRATORS is a full clone of ADMIN's GenX permissions (nav_sections,
-- ui_access, flag_template). Copied via SELECT so it always tracks ADMIN's
-- template; INSERT IGNORE keeps reruns/upgrades idempotent (PK on
-- user_group,permission). ADMIN stays reserved for VDAD/VDCL.
INSERT IGNORE INTO genx_group_permissions (user_group, permission, perm_value)
  SELECT 'ADMINISTRATORS', permission, perm_value
  FROM genx_group_permissions WHERE user_group='ADMIN';
GENXROLES
    echo "GenX role hierarchy seeded (SUPERADMIN/ADMIN/ADMINISTRATORS/SUPERVISORS/QC/AGENTS/APIUSERS)."
}

ensure_vicibox_tracking_table() {
    "${MYSQL[@]}" "$VICIDIAL_DB_NAME" <<'MYSQLVBOX'
CREATE TABLE IF NOT EXISTS vicibox (
  server_id tinyint(3) unsigned NOT NULL AUTO_INCREMENT,
  server varchar(32) NOT NULL,
  server_ip varchar(32) NOT NULL,
  server_type enum('Database','Web','Telephony','Archive') NOT NULL DEFAULT 'Telephony',
  field1 varchar(255) DEFAULT NULL,
  field2 varchar(255) DEFAULT NULL,
  field3 varchar(255) DEFAULT NULL,
  field4 varchar(255) DEFAULT NULL,
  field5 varchar(255) DEFAULT NULL,
  field6 varchar(255) DEFAULT NULL,
  field7 varchar(255) DEFAULT NULL,
  field8 varchar(255) DEFAULT NULL,
  field9 varchar(255) DEFAULT NULL,
  PRIMARY KEY (server_id),
  KEY server_ip_type (server_ip, server_type)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
ALTER TABLE vicibox
  MODIFY field1 varchar(255) DEFAULT NULL,
  MODIFY field2 varchar(255) DEFAULT NULL,
  MODIFY field3 varchar(255) DEFAULT NULL,
  MODIFY field4 varchar(255) DEFAULT NULL,
  MODIFY field5 varchar(255) DEFAULT NULL,
  MODIFY field6 varchar(255) DEFAULT NULL,
  MODIFY field7 varchar(255) DEFAULT NULL,
  MODIFY field8 varchar(255) DEFAULT NULL,
  MODIFY field9 varchar(255) DEFAULT NULL;
MYSQLVBOX
}

register_vicibox_role() {
    local role=$1
    shift
    local server_name server_ip sql row_type

    server_name=$(printf '%s' "$VICIDIAL_SERVER_ID" | tr -cd 'A-Za-z0-9_-' | cut -c1-32)
    server_ip=$ip_address
    row_type=$role
    if [ "$role" = "DatabaseSlave" ]; then
        row_type="Database"
    fi

    "${MYSQL[@]}" "$VICIDIAL_DB_NAME" -e "DELETE FROM vicibox WHERE server_ip='${server_ip}' AND server_type='${row_type}';"

    case "$role" in
        Database)
            sql="INSERT INTO vicibox (server, server_ip, server_type, field1, field2, field3, field4, field5, field6, field7, field8, field9) VALUES ('${server_name}', '${server_ip}', 'Database', '0', '${VICIDIAL_DB_NAME}', 'local', 'cron', '${CRON_DB_PASS}', 'custom', '${CUSTOM_DB_PASS}', 'slave', '${SLAVE_DB_PASS}');"
            ;;
        DatabaseSlave)
            sql="INSERT INTO vicibox (server, server_ip, server_type, field1, field2, field3, field4, field5, field6, field7, field8, field9) VALUES ('${server_name}', '${server_ip}', 'Database', '${MYSQL_SLAVE_SERVER_ID}', '${VICIDIAL_DB_NAME}', 'slave', 'cron', '${CRON_DB_PASS}', 'custom', '${CUSTOM_DB_PASS}', 'slave', '${SLAVE_DB_PASS}');"
            ;;
        Web)
            sql="INSERT INTO vicibox (server, server_ip, server_type, field1, field2) VALUES ('${server_name}', '${server_ip}', 'Web', '${VICIDIAL_EXTERNAL_IP}', '');"
            ;;
        Telephony)
            sql="INSERT INTO vicibox (server, server_ip, server_type, field1) VALUES ('${server_name}', '${server_ip}', 'Telephony', '${VICIDIAL_EXTERNAL_IP}');"
            ;;
        Archive)
            sql="INSERT INTO vicibox (server, server_ip, server_type, field1, field2, field3, field4, field5) VALUES ('${server_name}', '${VICIDIAL_ARCHIVE_HOST}', 'Archive', '${VICIDIAL_ARCHIVE_USER}', '${VICIDIAL_ARCHIVE_PASS}', '${VICIDIAL_ARCHIVE_PORT}', '${VICIDIAL_ARCHIVE_DIR}', '${VICIDIAL_ARCHIVE_URL}');"
            ;;
        *)
            echo "ERROR: Unknown ViciBox role: $role"
            exit 1
            ;;
    esac

    "${MYSQL[@]}" "$VICIDIAL_DB_NAME" -e "$sql"
}

register_selected_vicibox_roles() {
    ensure_vicibox_tracking_table
    if [ "$ROLE_DATABASE" = "yes" ] && [ "$ROLE_DATABASE_SLAVE" != "yes" ]; then
        register_vicibox_role Database
    fi
    if [ "$ROLE_DATABASE_SLAVE" = "yes" ]; then
        register_vicibox_role DatabaseSlave
    fi
    if [ "$ROLE_WEB" = "yes" ]; then
        register_vicibox_role Web
    fi
    if [ "$ROLE_TELEPHONY" = "yes" ]; then
        register_vicibox_role Telephony
    fi
    if [ "$ROLE_ARCHIVE" = "yes" ]; then
        register_vicibox_role Archive
    fi
}

install_audio_store_directory_helper() {
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
    # Writers: legacy admin.php uploads (apache) and, where installed, the
    # genx-ui service user. Setgid + group-write instead of world-writable.
    if id genx-ui >/dev/null 2>&1; then store_owner=genx-ui; else store_owner=root; fi
    chown -R "$store_owner":apache "/var/www/html/$audio_dir"
    chmod 2775 "/var/www/html/$audio_dir"
    find "/var/www/html/$audio_dir" -type f -exec chmod 0664 {} + 2>/dev/null
fi
AUDIOSTOREDIR
    chmod 755 /usr/local/bin/vicidial-audio-store-dir
}

verify_required_perl_modules() {
    local missing=0
    local module
    for module in DBI DBD::mysql Net::Server Time::HiRes Mail::Sendmail MIME::QuotedPrint Tk Tk::TableMatrix String::CRC; do
        if ! perl -M"$module" -e 1 >/dev/null 2>&1; then
            echo "ERROR: Missing required Perl module: $module"
            missing=1
        fi
    done
    if [ "$missing" -ne 0 ]; then
        echo "ERROR: Required Perl modules are missing. Review /root/.perl-cpm/build.log before continuing."
        exit 1
    fi
}

echo "Getting Machine info - No hostname? Enter the IP Address"
echo "**************************************************************************"
prompt hostname "Enter the hostname:" "$hostname"
validate_fqdn "$hostname"
hostnamectl set-hostname "$hostname"
# Retrieve the Hostname
hostname=$(hostname | awk '{print $1}')
printf 'Hostname\t: %s\n' "$hostname"
# Retrieve the IP address
ip_address=$(hostname -I | awk '{print $1}')
printf 'IP Address\t: %s\n' "$ip_address"
echo "**************************************************************************"

choose_vicidial_roles

if [ "$CLUSTER_JOIN" = "yes" ]; then
    # Joining servers never need the local MySQL root password: a fresh local
    # MariaDB (slave role) has passwordless root, and all cluster access uses cron.
    MYSQL_ROOT_PASS=""
    connect_cluster_db
    fetch_cluster_credentials
    choose_recording_storage
    if [ "$ROLE_WEB" = "yes" ]; then
        # Only relevant when a cluster runs split admin/agent web servers; for a
        # single web server the answer is yes (it hosts the central audio store).
        if yes_no "Is this the ADMIN web server hosting the central audio store? (yes unless you run split agent web servers)" "yes"; then
            WEB_IS_SOUND_SERVER="yes"
        else
            WEB_IS_SOUND_SERVER="no"
        fi
    fi
    if [ "$ROLE_DATABASE_SLAVE" = "yes" ]; then
        prompt MYSQL_SLAVE_SERVER_ID "Unique MySQL replication server-id for this slave (master is 1)" "$MYSQL_SLAVE_SERVER_ID"
        if [[ ! "$MYSQL_SLAVE_SERVER_ID" =~ ^[0-9]+$ ]] || [ "$MYSQL_SLAVE_SERVER_ID" -lt 2 ]; then
            echo "ERROR: Slave server-id must be a number greater than 1."
            exit 1
        fi
    fi
else
    prompt_secret MYSQL_ROOT_PASS "MySQL root password, press Enter if root has no password" "${MYSQL_ROOT_PASS:-}"

    if [ -z "${CRON_DB_PASS:-}" ] && [ -z "${CUSTOM_DB_PASS:-}" ]; then
        read -p "Use default VICIdial DB passwords? cron/1234 and custom/custom1234 [yes]: " USE_DEFAULT_DB_PASS
        USE_DEFAULT_DB_PASS="${USE_DEFAULT_DB_PASS:-yes}"

        if [[ "$USE_DEFAULT_DB_PASS" =~ ^[Yy] ]]; then
            CRON_DB_PASS="$DEFAULT_CRON_DB_PASS"
            CUSTOM_DB_PASS="$DEFAULT_CUSTOM_DB_PASS"
        else
            prompt_secret CRON_DB_PASS "Enter cron DB password" "$DEFAULT_CRON_DB_PASS"
            prompt_secret CUSTOM_DB_PASS "Enter custom DB password" "$DEFAULT_CUSTOM_DB_PASS"
        fi
    fi
fi

CRON_DB_PASS="${CRON_DB_PASS:-$DEFAULT_CRON_DB_PASS}"
CUSTOM_DB_PASS="${CUSTOM_DB_PASS:-$DEFAULT_CUSTOM_DB_PASS}"

if [ "$CLUSTER_JOIN" != "yes" ]; then
    # Whitelist planned cluster/management IPs now so servers added later can
    # reach this database before any web UI exists to manage the IP list.
    prompt EXTRA_WHITELIST_IPS "Additional IPs to whitelist in ViciWhite (future cluster servers/management, space or comma separated, Enter for none)" "$EXTRA_WHITELIST_IPS"
fi

if [ "$ROLE_ARCHIVE" = "yes" ]; then
    prompt_secret VICIDIAL_ARCHIVE_PASS "FTP password for archive user $VICIDIAL_ARCHIVE_USER (Enter for default $VICIDIAL_ARCHIVE_PASS)" "$VICIDIAL_ARCHIVE_PASS"
    prompt ARCHIVE_RETENTION_DAYS "Days to keep recordings on this archive server (0 = keep forever)" "$ARCHIVE_RETENTION_DAYS"
    if [[ ! "$ARCHIVE_RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
        echo "ERROR: Archive retention days must be a number (0 = keep forever)."
        exit 1
    fi
fi

prompt DOMAINNAME "Domain name for SSL/WebRTC" "${DOMAINNAME:-$hostname}"
validate_fqdn "$DOMAINNAME"
derive_role_settings "$ip_address" "$DOMAINNAME"
validate_db_settings
validate_supported_role_set

# Web/Telephony need certs for WebRTC and recording links; Archive needs one so
# its recording URLs are https (mixed-content-safe in the admin UI).
if [ "$ROLE_WEB" != "yes" ] && [ "$ROLE_TELEPHONY" != "yes" ] && [ "$ROLE_ARCHIVE" != "yes" ]; then
    ROLE_INSTALL_WEBRTC="no"
fi

if [ "$ROLE_WEB" = "yes" ]; then
    if yes_no "Install the GenX modern UI (admin + agent) on this web server?" "yes"; then
        INSTALL_GENX_UI="yes"
    else
        INSTALL_GENX_UI="no"
    fi
else
    INSTALL_GENX_UI="no"
fi

choose_firewall_policy

print_role_summary
if ! yes_no "Continue with this role-aware install?" "no"; then
    echo "Install cancelled."
    exit 0
fi

read -p "Reboot automatically after install? [${REBOOT_AFTER_INSTALL}]: " REBOOT_INPUT
REBOOT_AFTER_INSTALL="${REBOOT_INPUT:-$REBOOT_AFTER_INSTALL}"

export LC_ALL=C
export DOMAINNAME MYSQL_ROOT_PASS


dnf groupinstall "Development Tools" -y

dnf -y install yum-utils dnf-plugins-core epel-release
if ! rpm -q epel-release >/dev/null 2>&1; then
    dnf install -y https://dl.fedoraproject.org/pub/epel/epel-release-latest-9.noarch.rpm
fi

# Remi is used for PHP 8.2 packages. If Remi has not published an EL9 RPM for your
# mirror yet, this stops early instead of silently installing the wrong PHP stream.
if ! rpm -q remi-release >/dev/null 2>&1; then
    dnf install -y https://rpms.remirepo.net/enterprise/remi-release-9.rpm
fi

dnf config-manager --set-enabled crb || true

# PHP 8.2 from Remi when DNF module streams are available; otherwise use enabled repos.
if dnf -q module list php 2>/dev/null | grep -q 'remi-8.2'; then
    dnf module reset php -y
    dnf module enable php:remi-8.2 -y
else
    echo "WARNING: php:remi-8.2 module stream was not listed. Continuing with enabled EL9/Remi PHP packages."
fi

# MariaDB 10.5 appstream module when available; otherwise use Alma/Rocky 9 defaults.
if dnf -q module list mariadb 2>/dev/null | grep -q '10.5'; then
    dnf module reset mariadb -y
    dnf module enable mariadb:10.5 -y
else
    echo "INFO: MariaDB 10.5 module stream was not listed; using AlmaLinux 9 default MariaDB packages."
fi

dnf -y install dnf-plugins-core

dnf install -y \
    php php-cli php-common php-devel php-gd php-curl php-mysqlnd php-ldap \
    php-zip php-fileinfo php-opcache php-mbstring php-imap php-odbc php-pear \
    php-xml php-xmlrpc php-soap php-intl php-process \
    screen subversion wget unzip make patch gcc gcc-c++ gd-devel readline-devel \
    curl curl-devel perl-libwww-perl ImageMagick
dnf install -y php-pecl-mcrypt || true

dnf install -y newt-devel libxml2-devel sqlite-devel libuuid-devel sox sendmail lame-devel htop iftop perl-File-Which
dnf install -y php-opcache mariadb-devel
dnf install -y libss7 'libss7*' 'libopen*' || true
dnf install -y initscripts pv python3-pip
python3 -c 'import mysql.connector' 2>/dev/null || python3 -m pip install mysql-connector-python
dnf copr enable irontec/sngrep -y
dnf install sngrep bind-utils -y

dnf install -y kernel-devel-$(uname -r) kernel-headers-$(uname -r) || dnf install -y kernel-devel kernel-headers

dnf --enablerepo=crb install libsrtp-devel -y
dnf install -y vsftpd lftp || dnf install -y vsftpd

# DELIBERATE: root password SSH login stays enabled — GenX ops relies on it
# together with the VB-firewall/ViciWhite dynamic IP whitelist (SSH is only
# reachable from whitelisted IPs; see the firewall block near the end of this
# script). If the whitelist model ever changes, revisit this line first.
sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config

dnf install -y httpd mod_ssl nano chkconfig atop mytop
dnf install -y libedit-devel uuid* libxml2* speex-devel speex* postfix dovecot s-nail inxi
dnf install -y roundcubemail || true
dnf install -y chrony
systemctl enable chronyd
systemctl start chronyd || true
if [ "$ROLE_DATABASE" = "yes" ] || [ "$ROLE_DATABASE_SLAVE" = "yes" ]; then
    dnf install -y mariadb-server mariadb
else
    dnf install -y mariadb
fi

replace_managed_block /etc/php.ini GENX_VICIDIAL_PHP <<EOF
; BEGIN GENX_VICIDIAL_PHP

error_reporting  =  E_ALL & ~E_NOTICE
memory_limit = 448M
short_open_tag = On
max_execution_time = 3330
max_input_time = 3360
post_max_size = 448M
upload_max_filesize = 442M
default_socket_timeout = 3360
date.timezone = America/New_York
max_input_vars = 50000
; END GENX_VICIDIAL_PHP
EOF


systemctl restart httpd

systemctl start sendmail
systemctl enable sendmail

if [ "$ROLE_DATABASE" = "yes" ] || [ "$ROLE_DATABASE_SLAVE" = "yes" ]; then

systemctl enable mariadb

MYSQL_SERVER_ID_VALUE=1
if [ "$ROLE_DATABASE_SLAVE" = "yes" ]; then
    MYSQL_SERVER_ID_VALUE=$MYSQL_SLAVE_SERVER_ID
fi

[ -f /etc/my.cnf.original ] || cp /etc/my.cnf /etc/my.cnf.original
echo "" > /etc/my.cnf

# Size the MyISAM key buffer from actual RAM: ~50% on a dedicated DB box,
# ~25% when the DB shares the server with web/telephony (express/combo).
TOTAL_RAM_MB=$(awk '/MemTotal/ {printf "%d", $2/1024}' /proc/meminfo)
if [ "$ROLE_WEB" = "yes" ] || [ "$ROLE_TELEPHONY" = "yes" ]; then
    KEY_BUFFER_MB=$((TOTAL_RAM_MB / 4))
else
    KEY_BUFFER_MB=$((TOTAL_RAM_MB / 2))
fi
[ "$KEY_BUFFER_MB" -lt 256 ] && KEY_BUFFER_MB=256

cat <<MYSQLCONF>> /etc/my.cnf
[mysql.server]
user = mysql
#basedir = /var/lib

[client]
port = 3306
socket = /var/lib/mysql/mysql.sock

[mysqld]
#bind-address = 127.0.0.1 # Uncomment for local/socket access only, will brick network access
#port = 3306 # Do not uncomment unless you know what you are doing, can brick your database connectivity
socket = /var/lib/mysql/mysql.sock # Same note as above

# Stuff to tune for your hardware
max_connections=2000 # If you have a dedicated database, change this to 2000
key_buffer_size = ${KEY_BUFFER_MB}M # auto-sized from ${TOTAL_RAM_MB}MB RAM: 50% dedicated DB, 25% when sharing with web/telephony

# In general most of the below settings don't need tuning
log-error = /var/log/mysqld/mysqld.log
long_query_time = 3
slow_query_log = 1
slow_query_log_file = /var/log/mysqld/slow-queries.log
log-slow-verbosity=query_plan,explain
#secure_file_priv = /var/lib/mysql-files # Only allow LOAD DATA INFILE from this directory as a security feature
log_bin = /var/lib/mysql/mysql-bin
binlog_format=mixed
binlog_direct_non_transactional_updates=1
relay_log=/var/lib/mysql/mysql-relay-bin
datadir = /var/lib/mysql
server-id = ${MYSQL_SERVER_ID_VALUE} # Master should be 1, and all slaves should have a unique ID number
slave-skip-errors = 1032,1690,1062
slave_parallel_threads=20
slave-parallel-mode=optimistic
slave_parallel_max_queued=2M
skip-external-locking
skip-name-resolve
connect_timeout=60
max_allowed_packet = 16M
table_open_cache = 4096
table_definition_cache=16384
sort_buffer_size = 4M
net_buffer_length = 8K
read_buffer_size = 4M
read_rnd_buffer_size = 16M
myisam_sort_buffer_size = 128M
query-cache-size = 0
expire_logs_days = 3
concurrent_insert = 2
myisam_repair_threads = 4
myisam_recover_option=DEFAULT
tmpdir = /tmp/
thread_cache_size = 100
join_buffer_size = 1M
myisam_use_mmap=1
open_files_limit=24576
max_heap_table_size=512M
tmp_table_size = 32M
key_cache_segments=64
sql_mode=NO_ENGINE_SUBSTITUTION
log_warnings=1 # Silence the noise!!!

#old_passwords = 0
#ft_min_word_len = 3
#query-cache-type = 1
#table_cache = 1024
#max_tmp_tables = 64
#thread_concurrency = 8
#no-auto-rehash
default-storage-engine=MyISAM

# If using replication, uncomment log-bin below
#log-bin = mysql-bin

### By default only replicate the 'asterisk' database for ViciDial, comment out to replicate everything
### Make sure you do a full database dump if not just replicating asterisk database
#replicate_do_db=asterisk

### Comment out the tables below here if you really need them replicated to the slave, these are PERFORMANCE HOGS!
### Most of these tables are MEMORY tables which aren't persistent or used solely as tables for tracking the progress
### of things temporarily before doing real things like log inserts or lead updates
#replicate-ignore-table=asterisk.vicidial_live_agents
#replicate-ignore-table=asterisk.live_sip_channels
#replicate-ignore-table=asterisk.live_channels
#replicate-ignore-table=asterisk.vicidial_auto_calls
#replicate-ignore-table=asterisk.server_updater
#replicate-ignore-table=asterisk.web_client_sessions
#replicate-ignore-table=asterisk.vicidial_hopper
#replicate-ignore-table=asterisk.vicidial_campaign_server_status
#replicate-ignore-table=asterisk.parked_channels
#replicate-ignore-table=asterisk.vicidial_manager
#replicate-ignore-table=asterisk.cid_channels_recent
#replicate-wild-ignore-table=asterisk.cid_channels_recent_%


### Yes, we need this for system tables, so no need to tune anything here for ViciDial settings, these are just for the mysql tables and internal stuff
innodb_buffer_pool_size = 128M
innodb_file_per_table = ON
innodb_flush_method=O_DIRECT
innodb_flush_log_at_trx_commit=2
innodb_log_buffer_size=8M

[mysqldump]
quick
max_allowed_packet = 16M

[mysql]
no-auto-rehash

[isamchk]
key_buffer = 256M
sort_buffer_size = 256M
read_buffer = 2M
write_buffer = 2M

[myisamchk]
key_buffer = 256M
sort_buffer_size = 256M
read_buffer = 2M
write_buffer = 2M

[mysqlhotcopy]
interactive-timeout

[mysqld_safe]
#log-error = /var/log/mysqld/mysqld.log
#pid-file = /var/run/mysqld/mysqld.pid
MYSQLCONF

mkdir -p /var/log/mysqld
touch /var/log/mysqld/slow-queries.log
chown -R mysql:mysql /var/log/mysqld
systemctl restart mariadb

systemctl enable mariadb.service
systemctl restart mariadb.service

fi

systemctl enable httpd.service
systemctl restart httpd.service

#Install Perl Modules

echo "Install Perl"

dnf install -y perl-CPAN perl-YAML perl-CPAN-DistnameInfo perl-libwww-perl perl-DBI perl-DBD-MySQL perl-GD perl-Env perl-Term-ReadLine-Gnu perl-SelfLoader perl-open.noarch perl-Tk perl-Tk-TableMatrix

#CPM install
cd "$SCRIPT_DIR"
if [ ! -f "$SCRIPT_DIR/cpanfile" ]; then
    echo "ERROR: Missing $SCRIPT_DIR/cpanfile. Cannot install required Perl modules."
    exit 1
fi
copy_asset cpm /usr/local/bin/cpm
chmod +x /usr/local/bin/cpm
/usr/local/bin/cpm install -g
verify_required_perl_modules

# Asterisk is built on EVERY role (ViciBox parity): non-telephony servers run an
# idle Asterisk so AST_update reports load/liveness to the admin Reports page.
# DAHDI, sounds, and dialing config remain telephony-only.

#Install Asterisk Perl
cd /usr/src
rm -rf asterisk-perl-0.08
copy_asset asterisk-perl-0.08.tar.gz
tar xzf asterisk-perl-0.08.tar.gz
cd asterisk-perl-0.08
perl Makefile.PL
make all
make install 
perl -MAsterisk::AGI -e 1 || { echo "ERROR: Missing required Perl module: Asterisk::AGI"; exit 1; }

dnf install -y elfutils-libelf-devel libedit-devel


#Install Lame
cd /usr/src
rm -rf lame-3.99.5
copy_asset lame-3.99.5.tar.gz
tar -zxf lame-3.99.5.tar.gz
cd lame-3.99.5
./configure
make
make install

echo "Install DAHDI"

if [ "$ROLE_TELEPHONY" = "yes" ]; then

ln -sf /usr/lib/modules/$(uname -r)/vmlinux.xz /boot/

mkdir -p /etc/include
cd /etc/include || exit 1
copy_asset newt.h

cd /usr/src/ || exit 1
rm -rf dahdi-linux-complete-3.4.0+3.4.0
mkdir dahdi-linux-complete-3.4.0+3.4.0
cd dahdi-linux-complete-3.4.0+3.4.0 || exit 1

copy_asset dahdi-9.5-fix.zip
unzip -o dahdi-9.5-fix.zip

dnf install -y newt newt-devel slang-devel ncurses-devel

# Alma/Rocky 9.6+ DAHDI 3.4 kernel compatibility patches.

# DEFINE_SEMAPHORE API change
grep -rl 'DEFINE_SEMAPHORE(' linux/ | \
xargs -r sed -i 's/DEFINE_SEMAPHORE(\([a-zA-Z0-9_]\+\))/DEFINE_SEMAPHORE(\1, 1)/g'

# from_timer API change
grep -rl 'from_timer' linux/drivers/dahdi | \
xargs -r sed -i 's/from_timer(\([^,]*\), \([^,]*\), \([^)]*\))/timer_container_of(\1, \2, \3)/g'

# device uevent const changes
sed -i 's|static int astribank_uevent(struct device \*dev, struct kobj_uevent_env \*kenv)|static int astribank_uevent(const struct device *dev, struct kobj_uevent_env *kenv)|' \
linux/drivers/dahdi/xpp/xbus-sysfs.c

sed -i 's|static int span_uevent(struct device \*dev, struct kobj_uevent_env \*kenv)|static int span_uevent(const struct device *dev, struct kobj_uevent_env *kenv)|' \
linux/drivers/dahdi/dahdi-sysfs.c

sed -i 's|static int device_uevent(struct device \*dev, struct kobj_uevent_env \*kenv)|static int device_uevent(const struct device *dev, struct kobj_uevent_env *kenv)|' \
linux/drivers/dahdi/dahdi-sysfs.c

# bus_type .match const driver changes
grep -rl "static int .*_match(struct device \*dev, struct device_driver \*driver)" linux/drivers/dahdi | \
xargs -r sed -i 's|\(static int [a-zA-Z0-9_]*_match(struct device \*dev, \)struct device_driver \*driver)|\1const struct device_driver *driver)|g'

# class_create API change
sed -i 's/class_create(THIS_MODULE, "dahdi")/class_create("dahdi")/' \
linux/drivers/dahdi/dahdi-sysfs-chan.c

# Build DAHDI kernel modules + tools
make clean
make all || { echo "ERROR: DAHDI build failed"; exit 1; }
make install || { echo "ERROR: DAHDI install failed"; exit 1; }
make install-config || { echo "ERROR: DAHDI install-config failed"; exit 1; }
ldconfig

dnf install -y dahdi-tools-libs || true

# Rebuild/install tools explicitly
cd tools || exit 1
make clean
make
make install
make install-config
ldconfig

mkdir -p /etc/dahdi
touch /etc/dahdi/assigned-spans.conf

if [ -f /etc/dahdi/system.conf.sample ]; then
    cp -f /etc/dahdi/system.conf.sample /etc/dahdi/system.conf
fi

modprobe dahdi || { echo "ERROR: DAHDI kernel module did not load"; exit 1; }

# dahdi_dummy may not exist on DAHDI 3.x / newer kernels
modprobe dahdi_dummy || true

/usr/sbin/dahdi_cfg -vvvvvvvvvvvvv || true

systemctl enable dahdi
systemctl restart dahdi || service dahdi start
systemctl status dahdi --no-pager || service dahdi status

else
    echo "Skipping DAHDI build (no telephony role); Asterisk will use timerfd timing."
fi # ROLE_TELEPHONY dahdi

#Install Asterisk
rm -rf /usr/src/asterisk /usr/src/libsrtp-2.1.0
mkdir -p /usr/src/asterisk
cd /usr/src/asterisk
copy_asset asterisk-18.21.0-vici.tar.gz
tar -xvzf asterisk-18.21.0-vici.tar.gz

cd /usr/src
copy_asset libsrtp-2.1.0.tar.gz
tar xfv libsrtp-2.1.0.tar.gz
cd libsrtp-2.1.0
./configure --prefix=/usr --enable-openssl
make shared_library && make install
ldconfig

cd /usr/src/asterisk/asterisk-18.21.0-vici/

dnf install libuuid-devel libxml2-devel -y

: ${JOBS:=$(( $(nproc) + $(nproc) / 2 ))}
copy_asset jansson-2.14.tar.bz2 /tmp/jansson-2.14.tar.bz2
copy_asset pjproject-2.13.1.tar.bz2 /tmp/pjproject-2.13.1.tar.bz2
./configure --libdir=/usr/lib64 --with-gsm=internal --enable-opus --enable-srtp --with-ssl --enable-asteriskssl --with-pjproject-bundled --with-jansson-bundled

make menuselect/menuselect menuselect-tree menuselect.makeopts
#enable app_meetme (requires DAHDI, telephony servers only)
if [ "$ROLE_TELEPHONY" = "yes" ]; then
    menuselect/menuselect --enable app_meetme menuselect.makeopts
fi
#enable res_http_websocket
menuselect/menuselect --enable res_http_websocket menuselect.makeopts
#enable res_srtp
menuselect/menuselect --enable res_srtp menuselect.makeopts
mkdir -p /var/lib/asterisk/phoneprov
make samples
sed -i 's|noload = chan_sip.so|;noload = chan_sip.so|g' /etc/asterisk/modules.conf
make -j ${JOBS} all
make install

#Install astguiclient
echo "Installing astguiclient"
rm -rf /usr/src/astguiclient
mkdir -p /usr/src/astguiclient
cd /usr/src/astguiclient

# ViciBox-style version matching: joining servers check out the same SVN
# revision the cluster was built with (system_settings.svn_version, recorded
# by the primary install) instead of whatever trunk HEAD happens to be.
SVN_REV_ARGS=()
if [ "$CLUSTER_JOIN" = "yes" ]; then
    CLUSTER_SVN_REV=$("${MYSQL[@]}" "$VICIDIAL_DB_NAME" -Nse "SELECT svn_version FROM system_settings LIMIT 1;" 2>/dev/null | tr -cd '0-9')
    if [ -n "$CLUSTER_SVN_REV" ]; then
        echo "Cluster was built from SVN r${CLUSTER_SVN_REV}; checking out the matching revision."
        SVN_REV_ARGS=(-r "$CLUSTER_SVN_REV")
    else
        echo "WARNING: The cluster has no svn_version recorded in system_settings; using latest trunk."
        echo "If the cluster runs an older build, set system_settings.svn_version on the primary and rerun."
    fi
fi
svn checkout "${SVN_REV_ARGS[@]}" svn://svn.eflo.net/agc_2-X/trunk
cd /usr/src/astguiclient/trunk

#Add mysql users and Databases - rerun safe
# This block is safe if the installer is run again on a server where the asterisk DB already exists.
if [ "$CLUSTER_JOIN" != "yes" ]; then

# NOTE: MYSQL is the mode-dependent admin connection used by every later DB
# step (configure_audio_store_directory, secure_vicidial_default_passwords,
# register_selected_vicibox_roles, ...): root@localhost on a fresh/primary
# install (set here), cron@cluster-master in join mode (set in
# validate_db_settings). Password always travels via MYSQL_PWD, never -p,
# so it can't be read from the process list.
if [ -z "$MYSQL_ROOT_PASS" ]; then
    unset MYSQL_PWD
    MYSQL=(mysql -u root)
else
    export MYSQL_PWD="$MYSQL_ROOT_PASS"
    MYSQL=(mysql -u root)
fi

"${MYSQL[@]}" << MYSQLCREOF
CREATE DATABASE IF NOT EXISTS $VICIDIAL_DB_NAME DEFAULT CHARACTER SET utf8 COLLATE utf8_unicode_ci;
CREATE USER IF NOT EXISTS 'cron'@'localhost' IDENTIFIED BY '$CRON_DB_PASS';
CREATE USER IF NOT EXISTS 'cron'@'%' IDENTIFIED BY '$CRON_DB_PASS';
CREATE USER IF NOT EXISTS 'custom'@'localhost' IDENTIFIED BY '$CUSTOM_DB_PASS';
CREATE USER IF NOT EXISTS 'custom'@'%' IDENTIFIED BY '$CUSTOM_DB_PASS';
CREATE USER IF NOT EXISTS '$SLAVE_DB_USER'@'%' IDENTIFIED BY '$SLAVE_DB_PASS';
ALTER USER IF EXISTS 'cron'@'localhost' IDENTIFIED BY '$CRON_DB_PASS';
ALTER USER IF EXISTS 'cron'@'%' IDENTIFIED BY '$CRON_DB_PASS';
ALTER USER IF EXISTS 'custom'@'localhost' IDENTIFIED BY '$CUSTOM_DB_PASS';
ALTER USER IF EXISTS 'custom'@'%' IDENTIFIED BY '$CUSTOM_DB_PASS';
ALTER USER IF EXISTS '$SLAVE_DB_USER'@'%' IDENTIFIED BY '$SLAVE_DB_PASS';
GRANT SELECT,CREATE,ALTER,INSERT,UPDATE,DELETE,LOCK TABLES,CREATE TEMPORARY TABLES on $VICIDIAL_DB_NAME.* TO 'cron'@'%';
GRANT SELECT,CREATE,ALTER,INSERT,UPDATE,DELETE,LOCK TABLES,CREATE TEMPORARY TABLES on $VICIDIAL_DB_NAME.* TO 'cron'@'localhost';
GRANT RELOAD ON *.* TO 'cron'@'%';
GRANT RELOAD ON *.* TO 'cron'@'localhost';
GRANT SELECT,CREATE,ALTER,INSERT,UPDATE,DELETE,LOCK TABLES on $VICIDIAL_DB_NAME.* TO 'custom'@'%';
GRANT SELECT,CREATE,ALTER,INSERT,UPDATE,DELETE,LOCK TABLES on $VICIDIAL_DB_NAME.* TO 'custom'@'localhost';
GRANT RELOAD ON *.* TO 'custom'@'%';
GRANT RELOAD ON *.* TO 'custom'@'localhost';
GRANT SELECT,LOCK TABLES ON $VICIDIAL_DB_NAME.* TO '$SLAVE_DB_USER'@'%';
GRANT RELOAD, REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO '$SLAVE_DB_USER'@'%';
FLUSH PRIVILEGES;
SET GLOBAL connect_timeout=60;
MYSQLCREOF

# Import schema only if this is a fresh asterisk database. Reimporting on reruns causes duplicate table/key errors.
# Connectivity is verified FIRST: a failed mysql command produces empty output,
# which the count check below would silently misread as "existing DB" and skip
# the import on a completely empty server — the install then dies much later
# in the password/defaults steps with a misleading error.
if ! table_count=$("${MYSQL[@]}" -Nse "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$VICIDIAL_DB_NAME' AND table_name='system_settings';"); then
    echo "ERROR: Cannot query MariaDB as the configured admin user."
    echo "       Check that mariadb is running and MYSQL_ROOT_PASS is correct."
    exit 1
fi
if [ "$table_count" = "0" ]; then
    echo "Fresh asterisk DB detected. Importing VICIdial schema..."
    "${MYSQL[@]}" "$VICIDIAL_DB_NAME" < /usr/src/astguiclient/trunk/extras/MySQL_AST_CREATE_tables.sql
    "${MYSQL[@]}" "$VICIDIAL_DB_NAME" < /usr/src/astguiclient/trunk/extras/first_server_install.sql
else
    echo "Existing asterisk DB detected. Skipping VICIdial schema import for rerun safety."
fi

"${MYSQL[@]}" -e "USE $VICIDIAL_DB_NAME; UPDATE servers SET asterisk_version='18.21.1-vici';" || true

# Record the SVN revision this cluster was built from so added servers can match it.
LOCAL_SVN_REV=$(svn info --show-item revision /usr/src/astguiclient/trunk 2>/dev/null | tr -cd '0-9')
if [ -n "$LOCAL_SVN_REV" ]; then
    "${MYSQL[@]}" -e "USE $VICIDIAL_DB_NAME; UPDATE system_settings SET svn_version='$LOCAL_SVN_REV';" || true
fi

secure_vicidial_default_passwords
apply_vicidial_database_defaults "$ip_address" "$DOMAINNAME"

elif [ "$ROLE_DATABASE_SLAVE" = "yes" ]; then
    setup_database_slave
fi

#Get astguiclient.conf file
ASTGUI_DB_SERVER=$VICIDIAL_DB_HOST
if [ "$ROLE_DATABASE" = "yes" ] && [ "$ROLE_DATABASE_SLAVE" != "yes" ]; then
    ASTGUI_DB_SERVER=localhost
fi
cat <<ASTGUI> /etc/astguiclient.conf
# astguiclient.conf - configuration elements for the astguiclient package
# this is the astguiclient configuration file
# all comments will be lost if you run install.pl again

# Paths used by astGUIclient
PATHhome => /usr/share/astguiclient
PATHlogs => /var/log/astguiclient
PATHagi => /var/lib/asterisk/agi-bin
PATHweb => /var/www/html
PATHsounds => /var/lib/asterisk/sounds
PATHmonitor => /var/spool/asterisk/monitor
PATHDONEmonitor => /var/spool/asterisk/monitorDONE

# The IP address of this machine
VARserver_ip => SERVERIP

# Database connection information
VARDB_server => $ASTGUI_DB_SERVER
VARDB_database => $VICIDIAL_DB_NAME
VARDB_user => cron
VARDB_pass => $CRON_DB_PASS
VARDB_custom_user => custom
VARDB_custom_pass => $CUSTOM_DB_PASS
VARDB_port => $VICIDIAL_DB_PORT

# Alpha-Numeric list of the astGUIclient processes to be kept running
# (value should be listing of characters with no spaces: 123456)
#  X - NO KEEPALIVE PROCESSES (use only if you want none to be keepalive)
#  1 - AST_update
#  2 - AST_send_listen
#  3 - AST_VDauto_dial
#  4 - AST_VDremote_agents
#  5 - AST_VDadapt (If multi-server system, this must only be on one server)
#  6 - FastAGI_log
#  7 - AST_VDauto_dial_FILL (only for multi-server, this must only be on one server)
#  8 - ip_relay (used for blind agent monitoring)
#  9 - Timeclock auto logout
#  E - Email processor, (If multi-server system, this must only be on one server)
#  S - SIP Logger (Patched Asterisk 13 required)
VARactive_keepalives => $(role_active_keepalives)

# Asterisk version VICIDIAL is installed for
VARasterisk_version => 18.X

# FTP recording archive connection information
VARFTP_host => 10.0.0.4
VARFTP_user => cron
VARFTP_pass => test
VARFTP_port => 21
VARFTP_dir => RECORDINGS
VARHTTP_path => http://10.0.0.4

# REPORT server connection information
VARREPORT_host => 10.0.0.4
VARREPORT_user => cron
VARREPORT_pass => test
VARREPORT_port => 21
VARREPORT_dir => REPORTS

# Settings for FastAGI logging server
VARfastagi_log_min_servers => 3
VARfastagi_log_max_servers => 16
VARfastagi_log_min_spare_servers => 2
VARfastagi_log_max_spare_servers => 8
VARfastagi_log_max_requests => 1000
VARfastagi_log_checkfordead => 30
VARfastagi_log_checkforwait => 60

# Expected DB Schema version for this install (install.pl rewrites this with the checked-out value)
ExpectedDBSchema => 1720
ASTGUI

echo "Replace IP address in Default"
#echo "%%%%%%%%%Please Enter This Server IP ADD%%%%%%%%%%%%"
#read serveripadd
sed -i s/SERVERIP/"$ip_address"/g /etc/astguiclient.conf

echo "Install VICIDIAL"
run_vicidial_install_pl yes
if [ "$CLUSTER_JOIN" != "yes" ]; then
    apply_vicidial_database_defaults "$ip_address" "$DOMAINNAME"
fi
fix_vicidial_web_permissions
configure_agc_options

#Secure Manager
[ -f /etc/asterisk/manager.conf ] && sed -i s/0.0.0.0/127.0.0.1/g /etc/asterisk/manager.conf

if [ "$ROLE_TELEPHONY" = "yes" ]; then
# Force DAHDI timing on telephony servers only; other roles rely on res_timing_timerfd.
# NOTE: the previous 'sed $ a\ ...' one-liner collapsed all three noload
# directives into ONE malformed line (backslash-space is an escaped space to
# sed, not a newline), so the timing modules were never actually noloaded —
# and it re-appended on every rerun. printf + a grep guard is idempotent.
if ! grep -q '^noload => res_timing_timerfd.so' /etc/asterisk/modules.conf; then
  printf '%s\n' \
    'noload => res_timing_timerfd.so' \
    'noload => res_timing_kqueue.so' \
    'noload => res_timing_pthread.so' >> /etc/asterisk/modules.conf
fi
fi # ROLE_TELEPHONY timing config

if [ "$CLUSTER_JOIN" != "yes" ]; then
#Add confbridge conferences to asterisk DB
"${MYSQL[@]}" -e "use $VICIDIAL_DB_NAME; INSERT IGNORE INTO vicidial_confbridges VALUES (9600000,'$OLD_SERVER_IP','','0',NULL),(9600001,'$OLD_SERVER_IP','','0',NULL),(9600002,'$OLD_SERVER_IP','','0',NULL),(9600003,'$OLD_SERVER_IP','','0',NULL),(9600004,'$OLD_SERVER_IP','','0',NULL),(9600005,'$OLD_SERVER_IP','','0',NULL),(9600006,'$OLD_SERVER_IP','','0',NULL),(9600007,'$OLD_SERVER_IP','','0',NULL),(9600008,'$OLD_SERVER_IP','','0',NULL),(9600009,'$OLD_SERVER_IP','','0',NULL),(9600010,'$OLD_SERVER_IP','','0',NULL),(9600011,'$OLD_SERVER_IP','','0',NULL),(9600012,'$OLD_SERVER_IP','','0',NULL),(9600013,'$OLD_SERVER_IP','','0',NULL),(9600014,'$OLD_SERVER_IP','','0',NULL),(9600015,'$OLD_SERVER_IP','','0',NULL),(9600016,'$OLD_SERVER_IP','','0',NULL),(9600017,'$OLD_SERVER_IP','','0',NULL),(9600018,'$OLD_SERVER_IP','','0',NULL),(9600019,'$OLD_SERVER_IP','','0',NULL),(9600020,'$OLD_SERVER_IP','','0',NULL),(9600021,'$OLD_SERVER_IP','','0',NULL),(9600022,'$OLD_SERVER_IP','','0',NULL),(9600023,'$OLD_SERVER_IP','','0',NULL),(9600024,'$OLD_SERVER_IP','','0',NULL),(9600025,'$OLD_SERVER_IP','','0',NULL),(9600026,'$OLD_SERVER_IP','','0',NULL),(9600027,'$OLD_SERVER_IP','','0',NULL),(9600028,'$OLD_SERVER_IP','','0',NULL),(9600029,'$OLD_SERVER_IP','','0',NULL),(9600030,'$OLD_SERVER_IP','','0',NULL),(9600031,'$OLD_SERVER_IP','','0',NULL),(9600032,'$OLD_SERVER_IP','','0',NULL),(9600033,'$OLD_SERVER_IP','','0',NULL),(9600034,'$OLD_SERVER_IP','','0',NULL),(9600035,'$OLD_SERVER_IP','','0',NULL),(9600036,'$OLD_SERVER_IP','','0',NULL),(9600037,'$OLD_SERVER_IP','','0',NULL),(9600038,'$OLD_SERVER_IP','','0',NULL),(9600039,'$OLD_SERVER_IP','','0',NULL),(9600040,'$OLD_SERVER_IP','','0',NULL),(9600041,'$OLD_SERVER_IP','','0',NULL),(9600042,'$OLD_SERVER_IP','','0',NULL),(9600043,'$OLD_SERVER_IP','','0',NULL),(9600044,'$OLD_SERVER_IP','','0',NULL),(9600045,'$OLD_SERVER_IP','','0',NULL),(9600046,'$OLD_SERVER_IP','','0',NULL),(9600047,'$OLD_SERVER_IP','','0',NULL),(9600048,'$OLD_SERVER_IP','','0',NULL),(9600049,'$OLD_SERVER_IP','','0',NULL),(9600050,'$OLD_SERVER_IP','','0',NULL),(9600051,'$OLD_SERVER_IP','','0',NULL),(9600052,'$OLD_SERVER_IP','','0',NULL),(9600054,'$OLD_SERVER_IP','','0',NULL),(9600055,'$OLD_SERVER_IP','','0',NULL),(9600056,'$OLD_SERVER_IP','','0',NULL),(9600057,'$OLD_SERVER_IP','','0',NULL),(9600058,'$OLD_SERVER_IP','','0',NULL),(9600059,'$OLD_SERVER_IP','','0',NULL),(9600060,'$OLD_SERVER_IP','','0',NULL),(9600061,'$OLD_SERVER_IP','','0',NULL),
(9600062,'$OLD_SERVER_IP','','0',NULL),(9600063,'$OLD_SERVER_IP','','0',NULL),(9600064,'$OLD_SERVER_IP','','0',NULL),(9600065,'$OLD_SERVER_IP','','0',NULL),(9600066,'$OLD_SERVER_IP','','0',NULL),(9600067,'$OLD_SERVER_IP','','0',NULL),(9600068,'$OLD_SERVER_IP','','0',NULL),(9600069,'$OLD_SERVER_IP','','0',NULL),(9600070,'$OLD_SERVER_IP','','0',NULL),(9600071,'$OLD_SERVER_IP','','0',NULL),(9600072,'$OLD_SERVER_IP','','0',NULL),(9600073,'$OLD_SERVER_IP','','0',NULL),(9600074,'$OLD_SERVER_IP','','0',NULL),(9600075,'$OLD_SERVER_IP','','0',NULL),(9600076,'$OLD_SERVER_IP','','0',NULL),(9600077,'$OLD_SERVER_IP','','0',NULL),(9600078,'$OLD_SERVER_IP','','0',NULL),(9600079,'$OLD_SERVER_IP','','0',NULL),(9600080,'$OLD_SERVER_IP','','0',NULL),(9600081,'$OLD_SERVER_IP','','0',NULL),(9600082,'$OLD_SERVER_IP','','0',NULL),(9600083,'$OLD_SERVER_IP','','0',NULL),(9600084,'$OLD_SERVER_IP','','0',NULL),(9600085,'$OLD_SERVER_IP','','0',NULL),(9600086,'$OLD_SERVER_IP','','0',NULL),(9600087,'$OLD_SERVER_IP','','0',NULL),(9600088,'$OLD_SERVER_IP','','0',NULL),(9600089,'$OLD_SERVER_IP','','0',NULL),(9600090,'$OLD_SERVER_IP','','0',NULL),(9600091,'$OLD_SERVER_IP','','0',NULL),(9600092,'$OLD_SERVER_IP','','0',NULL),(9600093,'$OLD_SERVER_IP','','0',NULL),(9600094,'$OLD_SERVER_IP','','0',NULL),(9600095,'$OLD_SERVER_IP','','0',NULL),(9600096,'$OLD_SERVER_IP','','0',NULL),(9600097,'$OLD_SERVER_IP','','0',NULL),(9600098,'$OLD_SERVER_IP','','0',NULL),(9600099,'$OLD_SERVER_IP','','0',NULL),(9600100,'$OLD_SERVER_IP','','0',NULL),(9600101,'$OLD_SERVER_IP','','0',NULL),(9600102,'$OLD_SERVER_IP','','0',NULL),(9600103,'$OLD_SERVER_IP','','0',NULL),(9600104,'$OLD_SERVER_IP','','0',NULL),(9600105,'$OLD_SERVER_IP','','0',NULL),(9600106,'$OLD_SERVER_IP','','0',NULL),(9600107,'$OLD_SERVER_IP','','0',NULL),(9600108,'$OLD_SERVER_IP','','0',NULL),(9600109,'$OLD_SERVER_IP','','0',NULL),(9600110,'$OLD_SERVER_IP','','0',NULL),(9600111,'$OLD_SERVER_IP','','0',NULL),(9600112,'$OLD_SERVER_IP','','0',NULL),(9600113,'$OLD_SERVER_IP','','0',NULL),(9600114,'$OLD_SERVER_IP','','0',NULL),(9600115,'$OLD_SERVER_IP','','0',NULL),(9600116,'$OLD_SERVER_IP','','0',NULL),(9600117,'$OLD_SERVER_IP','','0',NULL),(9600118,'$OLD_SERVER_IP','','0',NULL),(9600119,'$OLD_SERVER_IP','','0',NULL),(9600120,'$OLD_SERVER_IP','','0',NULL),(9600121,'$OLD_SERVER_IP','','0',NULL),(9600122,'$OLD_SERVER_IP','','0',NULL),(9600123,'$OLD_SERVER_IP','','0',NULL),(9600124,'$OLD_SERVER_IP','','0',NULL),(9600125,'$OLD_SERVER_IP','','0',NULL),(9600126,'$OLD_SERVER_IP','','0',NULL),(9600127,'$OLD_SERVER_IP','','0',NULL),(9600128,'$OLD_SERVER_IP','','0',NULL),(9600129,'$OLD_SERVER_IP','','0',NULL),(9600130,'$OLD_SERVER_IP','','0',NULL),(9600131,'$OLD_SERVER_IP','','0',NULL),(9600132,'$OLD_SERVER_IP','','0',NULL),(9600133,'$OLD_SERVER_IP','','0',NULL),(9600134,'$OLD_SERVER_IP','','0',NULL),(9600135,'$OLD_SERVER_IP','','0',NULL),(9600136,'$OLD_SERVER_IP','','0',NULL),(9600137,'$OLD_SERVER_IP','','0',NULL),(9600138,'$OLD_SERVER_IP','','0',NULL),(9600139,'$OLD_SERVER_IP','','0',NULL),(9600140,'$OLD_SERVER_IP','','0',NULL),(9600141,'$OLD_SERVER_IP','','0',NULL),(9600142,'$OLD_SERVER_IP','','0',NULL),(9600143,'$OLD_SERVER_IP','','0',NULL),(9600144,'$OLD_SERVER_IP','','0',NULL),(9600145,'$OLD_SERVER_IP','','0',NULL),(9600146,'$OLD_SERVER_IP','','0',NULL),(9600147,'$OLD_SERVER_IP','','0',NULL),(9600148,'$OLD_SERVER_IP','','0',NULL),(9600149,'$OLD_SERVER_IP','','0',NULL),(9600150,'$OLD_SERVER_IP','','0',NULL),(9600151,'$OLD_SERVER_IP','','0',NULL),(9600152,'$OLD_SERVER_IP','','0',NULL),(9600153,'$OLD_SERVER_IP','','0',NULL),(9600154,'$OLD_SERVER_IP','','0',NULL),(9600155,'$OLD_SERVER_IP','','0',NULL),(9600156,'$OLD_SERVER_IP','','0',NULL),(9600157,'$OLD_SERVER_IP','','0',NULL),(9600158,'$OLD_SERVER_IP','','0',NULL),(9600159,'$OLD_SERVER_IP','','0',NULL),(9600160,'$OLD_SERVER_IP','','0',NULL),(9600161,'$OLD_SERVER_IP','','0',NULL),(9600162,'$OLD_SERVER_IP','','0',NULL),(9600163,'$OLD_SERVER_IP','','0',NULL),(9600164,'$OLD_SERVER_IP','','0',NULL),(9600165,'$OLD_SERVER_IP','','0',NULL),(9600166,'$OLD_SERVER_IP','','0',NULL),(9600167,'$OLD_SERVER_IP','','0',NULL),(9600168,'$OLD_SERVER_IP','','0',NULL),(9600169,'$OLD_SERVER_IP','','0',NULL),(9600170,'$OLD_SERVER_IP','','0',NULL),(9600171,'$OLD_SERVER_IP','','0',NULL),(9600172,'$OLD_SERVER_IP','','0',NULL),(9600173,'$OLD_SERVER_IP','','0',NULL),(9600174,'$OLD_SERVER_IP','','0',NULL),(9600175,'$OLD_SERVER_IP','','0',NULL),(9600176,'$OLD_SERVER_IP','','0',NULL),(9600177,'$OLD_SERVER_IP','','0',NULL),(9600178,'$OLD_SERVER_IP','','0',NULL),(9600179,'$OLD_SERVER_IP','','0',NULL),(9600180,'$OLD_SERVER_IP','','0',NULL),(9600181,'$OLD_SERVER_IP','','0',NULL),(9600182,'$OLD_SERVER_IP','','0',NULL),(9600183,'$OLD_SERVER_IP','','0',NULL),(9600184,'$OLD_SERVER_IP','','0',NULL),(9600185,'$OLD_SERVER_IP','','0',NULL),(9600186,'$OLD_SERVER_IP','','0',NULL),(9600187,'$OLD_SERVER_IP','','0',NULL),(9600188,'$OLD_SERVER_IP','','0',NULL),(9600189,'$OLD_SERVER_IP','','0',NULL),(9600190,'$OLD_SERVER_IP','','0',NULL),(9600191,'$OLD_SERVER_IP','','0',NULL),(9600192,'$OLD_SERVER_IP','','0',NULL),(9600193,'$OLD_SERVER_IP','','0',NULL),(9600194,'$OLD_SERVER_IP','','0',NULL),(9600195,'$OLD_SERVER_IP','','0',NULL),(9600196,'$OLD_SERVER_IP','','0',NULL),(9600197,'$OLD_SERVER_IP','','0',NULL),(9600198,'$OLD_SERVER_IP','','0',NULL),(9600199,'$OLD_SERVER_IP','','0',NULL),(9600200,'$OLD_SERVER_IP','','0',NULL),(9600201,'$OLD_SERVER_IP','','0',NULL),(9600202,'$OLD_SERVER_IP','','0',NULL),(9600203,'$OLD_SERVER_IP','','0',NULL),(9600204,'$OLD_SERVER_IP','','0',NULL),(9600205,'$OLD_SERVER_IP','','0',NULL),(9600206,'$OLD_SERVER_IP','','0',NULL),(9600207,'$OLD_SERVER_IP','','0',NULL),(9600208,'$OLD_SERVER_IP','','0',NULL),(9600209,'$OLD_SERVER_IP','','0',NULL),(9600210,'$OLD_SERVER_IP','','0',NULL),(9600211,'$OLD_SERVER_IP','','0',NULL),(9600212,'$OLD_SERVER_IP','','0',NULL),(9600213,'$OLD_SERVER_IP','','0',NULL),(9600214,'$OLD_SERVER_IP','','0',NULL),(9600215,'$OLD_SERVER_IP','','0',NULL),(9600216,'$OLD_SERVER_IP','','0',NULL),(9600217,'$OLD_SERVER_IP','','0',NULL),(9600218,'$OLD_SERVER_IP','','0',NULL),(9600219,'$OLD_SERVER_IP','','0',NULL),(9600220,'$OLD_SERVER_IP','','0',NULL),(9600221,'$OLD_SERVER_IP','','0',NULL),(9600222,'$OLD_SERVER_IP','','0',NULL),(9600223,'$OLD_SERVER_IP','','0',NULL),(9600224,'$OLD_SERVER_IP','','0',NULL),(9600225,'$OLD_SERVER_IP','','0',NULL),(9600226,'$OLD_SERVER_IP','','0',NULL),(9600227,'$OLD_SERVER_IP','','0',NULL),(9600228,'$OLD_SERVER_IP','','0',NULL),(9600229,'$OLD_SERVER_IP','','0',NULL),(9600230,'$OLD_SERVER_IP','','0',NULL),(9600231,'$OLD_SERVER_IP','','0',NULL),(9600232,'$OLD_SERVER_IP','','0',NULL),(9600233,'$OLD_SERVER_IP','','0',NULL),(9600234,'$OLD_SERVER_IP','','0',NULL),(9600235,'$OLD_SERVER_IP','','0',NULL),(9600236,'$OLD_SERVER_IP','','0',NULL),(9600237,'$OLD_SERVER_IP','','0',NULL),(9600238,'$OLD_SERVER_IP','','0',NULL),(9600239,'$OLD_SERVER_IP','','0',NULL),(9600240,'$OLD_SERVER_IP','','0',NULL),(9600241,'$OLD_SERVER_IP','','0',NULL),(9600242,'$OLD_SERVER_IP','','0',NULL),(9600243,'$OLD_SERVER_IP','','0',NULL),(9600244,'$OLD_SERVER_IP','','0',NULL),(9600245,'$OLD_SERVER_IP','','0',NULL),(9600246,'$OLD_SERVER_IP','','0',NULL),(9600247,'$OLD_SERVER_IP','','0',NULL),(9600248,'$OLD_SERVER_IP','','0',NULL),(9600249,'$OLD_SERVER_IP','','0',NULL),(9600250,'$OLD_SERVER_IP','','0',NULL),(9600251,'$OLD_SERVER_IP','','0',NULL),(9600252,'$OLD_SERVER_IP','','0',NULL),(9600253,'$OLD_SERVER_IP','','0',NULL),(9600254,'$OLD_SERVER_IP','','0',NULL),(9600255,'$OLD_SERVER_IP','','0',NULL),(9600256,'$OLD_SERVER_IP','','0',NULL),(9600257,'$OLD_SERVER_IP','','0',NULL),(9600258,'$OLD_SERVER_IP','','0',NULL),(9600259,'$OLD_SERVER_IP','','0',NULL),(9600260,'$OLD_SERVER_IP','','0',NULL),(9600261,'$OLD_SERVER_IP','','0',NULL),(9600262,'$OLD_SERVER_IP','','0',NULL),(9600263,'$OLD_SERVER_IP','','0',NULL),(9600264,'$OLD_SERVER_IP','','0',NULL),(9600265,'$OLD_SERVER_IP','','0',NULL),(9600266,'$OLD_SERVER_IP','','0',NULL),(9600267,'$OLD_SERVER_IP','','0',NULL),(9600268,'$OLD_SERVER_IP','','0',NULL),(9600269,'$OLD_SERVER_IP','','0',NULL),(9600270,'$OLD_SERVER_IP','','0',NULL),(9600271,'$OLD_SERVER_IP','','0',NULL),(9600272,'$OLD_SERVER_IP','','0',NULL),(9600273,'$OLD_SERVER_IP','','0',NULL),(9600274,'$OLD_SERVER_IP','','0',NULL),(9600275,'$OLD_SERVER_IP','','0',NULL),(9600276,'$OLD_SERVER_IP','','0',NULL),(9600277,'$OLD_SERVER_IP','','0',NULL),(9600278,'$OLD_SERVER_IP','','0',NULL),(9600279,'$OLD_SERVER_IP','','0',NULL),(9600280,'$OLD_SERVER_IP','','0',NULL),(9600281,'$OLD_SERVER_IP','','0',NULL),(9600282,'$OLD_SERVER_IP','','0',NULL),(9600283,'$OLD_SERVER_IP','','0',NULL),(9600284,'$OLD_SERVER_IP','','0',NULL),(9600285,'$OLD_SERVER_IP','','0',NULL),(9600286,'$OLD_SERVER_IP','','0',NULL),(9600287,'$OLD_SERVER_IP','','0',NULL),(9600288,'$OLD_SERVER_IP','','0',NULL),(9600289,'$OLD_SERVER_IP','','0',NULL),(9600290,'$OLD_SERVER_IP','','0',NULL),(9600291,'$OLD_SERVER_IP','','0',NULL),(9600292,'$OLD_SERVER_IP','','0',NULL),(9600293,'$OLD_SERVER_IP','','0',NULL),(9600294,'$OLD_SERVER_IP','','0',NULL),(9600295,'$OLD_SERVER_IP','','0',NULL),(9600296,'$OLD_SERVER_IP','','0',NULL),(9600297,'$OLD_SERVER_IP','','0',NULL),(9600298,'$OLD_SERVER_IP','','0',NULL),(9600299,'$OLD_SERVER_IP','','0',NULL);"



echo "Populate AREA CODES"
/usr/share/astguiclient/ADMIN_area_code_populate.pl
echo "Replacing default VICIdial IP $OLD_SERVER_IP with current server IP $ip_address"

/usr/share/astguiclient/ADMIN_update_server_ip.pl --old-server_ip=$OLD_SERVER_IP --server_ip=$ip_address --auto


run_vicidial_install_pl no

else
    join_register_server
    join_update_cluster_settings
fi

configure_pjsip_external_ip "$ip_address"

# Point the REPORT/backup FTP target at the cluster archive when one is configured,
# so ADMIN_backup.pl --ftp and report exports land on the archive server.
if [ "$VICIDIAL_ARCHIVE_HOST" != "X" ]; then
    sed -i \
        -e "s|^VARREPORT_host => .*|VARREPORT_host => $VICIDIAL_ARCHIVE_HOST|" \
        -e "s|^VARREPORT_user => .*|VARREPORT_user => $VICIDIAL_ARCHIVE_USER|" \
        -e "s|^VARREPORT_pass => .*|VARREPORT_pass => $VICIDIAL_ARCHIVE_PASS|" \
        -e "s|^VARREPORT_port => .*|VARREPORT_port => $VICIDIAL_ARCHIVE_PORT|" \
        -e "s|^VARREPORT_dir => .*|VARREPORT_dir => REPORTS|" \
        /etc/astguiclient.conf
fi

install_audio_store_directory_helper

# Stats reporter for non-Asterisk roles: AST_update.pl (keepalive flag 1, telephony
# only) is the only stock writer of servers.sysload/cpu_idle_percent/disk_usage and
# the server_updater heartbeat, so DB/web/archive/slave boxes would show RED with
# frozen load/disk in the legacy Reports page and the GenX UI without this.
install -m 755 "$SCRIPT_DIR/tools/genx-server-stats.pl" /usr/local/bin/genx-server-stats.pl

#Install Crontab (assembled per selected roles, ViciBox parity: keepalive only
#runs on DB-primary and Telephony servers; web/archive/slave get keepalives=X)
ROLE_DB_PRIMARY="no"
if [ "$ROLE_DATABASE" = "yes" ] && [ "$ROLE_DATABASE_SLAVE" != "yes" ]; then
    ROLE_DB_PRIMARY="yes"
fi

cat <<CRONTAB > /root/crontab-file

## adjust time on the server with ntp (chrony is enabled by this installer instead)
#30 * * * * /usr/sbin/ntpdate -u pool.ntp.org 2>/dev/null 1>&2

### remove old vicidial logs and asterisk logs more than 2 days old
28 0 * * * /usr/bin/find /var/log/astguiclient -maxdepth 1 -type f -mtime +2 -print | xargs rm -f
29 0 * * * /usr/bin/find /var/log/asterisk -maxdepth 3 -type f -mtime +2 -print | xargs rm -f
30 0 * * * /usr/bin/find / -maxdepth 1 -name "screenlog.0*" -mtime +4 -print | xargs rm -f
CRONTAB

if [ "$ROLE_DB_PRIMARY" = "yes" ] || [ "$ROLE_TELEPHONY" = "yes" ]; then
# The 3way conference checker (--cu3way) is only useful where Asterisk runs.
KEEPALIVE_FLAGS=""
if [ "$ROLE_TELEPHONY" = "yes" ]; then
    KEEPALIVE_FLAGS=" --cu3way"
fi
cat <<CRONTAB >> /root/crontab-file

### keepalive script for astguiclient processes
* * * * * /usr/share/astguiclient/ADMIN_keepalive_ALL.pl${KEEPALIVE_FLAGS}
CRONTAB
fi

if [ "$ROLE_TELEPHONY" != "yes" ]; then
cat <<CRONTAB >> /root/crontab-file

### GenX server stats reporter (telephony servers get this via AST_update.pl)
* * * * * /usr/local/bin/genx-server-stats.pl >/dev/null 2>&1
CRONTAB
fi

if [ "$ROLE_WEB" = "yes" ]; then
# Web role hosts the central audio store; telephony servers sync sounds down
# via ADMIN_keepalive_ALL.pl (sounds_central_control_active), not cron.
cat <<CRONTAB >> /root/crontab-file

### VICIDIAL audio-store web directory helper
* * * * * /usr/local/bin/vicidial-audio-store-dir >/dev/null 2>&1

###Audio Sync quarter-hourly
1,16,31,46 * * * * /usr/share/astguiclient/ADMIN_audio_store_sync.pl --upload --quiet
CRONTAB
fi

if [ "$ROLE_INSTALL_WEBRTC" = "yes" ]; then
cat <<CRONTAB >> /root/crontab-file

###certbot renew
@weekly $SCRIPT_DIR/certbot.sh
CRONTAB
fi

if [ "$ROLE_TELEPHONY" = "yes" ]; then
# The FTP-to-archive crons are enabled only when this server ships recordings to a cluster archive.
FTP_CRON_PREFIX="#"
if [ "$RECORDINGS_STORAGE" = "archive" ]; then
    FTP_CRON_PREFIX=""
fi
# Flat layout adds --nodatedir; dated layout (default) files into YYYY/MM/DD subdirectories.
FTP_DATEDIR_FLAG=""
if [ "$RECORDINGS_FTP_LAYOUT" = "flat" ]; then
    FTP_DATEDIR_FLAG=" --nodatedir"
fi
cat <<CRONTAB >> /root/crontab-file

### recording mixing/compressing/ftping scripts
#0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48,51,54,57 * * * * /usr/share/astguiclient/AST_CRON_audio_1_move_mix.pl
0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48,51,54,57 * * * * /usr/share/astguiclient/AST_CRON_audio_1_move_mix.pl --MIX
0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48,51,54,57 * * * * /usr/share/astguiclient/AST_CRON_audio_1_move_VDonly.pl
1,4,7,10,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58 * * * * /usr/share/astguiclient/AST_CRON_audio_2_compress.pl --MP3 --HTTPS
${FTP_CRON_PREFIX}2,5,8,11,14,17,20,23,26,29,32,35,38,41,44,47,50,53,56,59 * * * * /usr/share/astguiclient/AST_CRON_audio_3_ftp.pl --MP3${FTP_DATEDIR_FLAG} --ftp-validate

### kill Hangup script for Asterisk updaters
* * * * * /usr/share/astguiclient/AST_manager_kill_hung_congested.pl

### updater for voicemail
* * * * * /usr/share/astguiclient/AST_vm_update.pl

### updater for conference validator
* * * * * /usr/share/astguiclient/AST_conf_update.pl --no-vc-3way-check

### reset several temporary-info tables in the database
2 1 * * * /usr/share/astguiclient/AST_reset_mysql_vars.pl

### remove old recordings
#24 0 * * * /usr/bin/find /var/spool/asterisk/monitorDONE -maxdepth 2 -type f -mtime +7 -print | xargs rm -f
#26 1 * * * /usr/bin/find /var/spool/asterisk/monitorDONE/MP3 -maxdepth 2 -type f -mtime +65 -print | xargs rm -f
${FTP_CRON_PREFIX}25 1 * * * /usr/bin/find /var/spool/asterisk/monitorDONE/FTP -maxdepth 2 -type f -mtime +30 -print | xargs rm -f
24 1 * * * /usr/bin/find /var/spool/asterisk/monitorDONE/ORIG -maxdepth 2 -type f -mtime +1 -print | xargs rm -f

### Daily Reboot
#30 6 * * * /sbin/reboot
CRONTAB
fi

if [ "$ROLE_DB_PRIMARY" = "yes" ]; then
# Cluster-singleton database/reporting jobs: run only on the primary-DB server
# (ViciBox dbcron parity — never on slaves, web, telephony or archive boxes).
cat <<CRONTAB >> /root/crontab-file

### Daily Backups ###
0 2 * * * /usr/share/astguiclient/ADMIN_backup.pl

### flush queue DB table every hour for entries older than 1 hour
11 * * * * /usr/share/astguiclient/AST_flush_DBqueue.pl -q

### fix the vicidial_agent_log once every hour and the full day run at night
33 * * * * /usr/share/astguiclient/AST_cleanup_agent_log.pl
50 0 * * * /usr/share/astguiclient/AST_cleanup_agent_log.pl --last-24hours

## uncomment below if using QueueMetrics
#*/5 * * * * /usr/share/astguiclient/AST_cleanup_agent_log.pl --only-qm-live-call-check

## uncomment below if using Vtiger
#1 1 * * * /usr/share/astguiclient/Vtiger_optimize_all_tables.pl --quiet

### updater for VICIDIAL hopper
* * * * * /usr/share/astguiclient/AST_VDhopper.pl -q

### adjust the GMT offset for the leads in the vicidial_list table
1 1,7 * * * /usr/share/astguiclient/ADMIN_adjust_GMTnow_on_leads.pl --debug

### optimize the database tables within the asterisk database
3 1 * * * /usr/share/astguiclient/AST_DB_optimize.pl

### VICIDIAL agent time log weekly and daily summary report generation
2 0 * * 0 /usr/share/astguiclient/AST_agent_week.pl
22 0 * * * /usr/share/astguiclient/AST_agent_day.pl

### VICIDIAL campaign export scripts (OPTIONAL)
#32 0 * * * /usr/share/astguiclient/AST_VDsales_export.pl
#42 0 * * * /usr/share/astguiclient/AST_sourceID_summary_export.pl

### log archiving (GenX scheme): nightly 24h archive of dial-side tables,
### nightly 60-day archive of the rest, weekly 24-month trim+optimize of the
### _archive tables. GenX reports are archive-aware (rangeSource unions), so
### the short live windows do not blank any report. Do NOT add --vlog-daily:
### it breaks legacy default views and GenX reporting on primary+slave.
30 0 * * * /usr/share/astguiclient/ADMIN_archive_log_tables.pl --daily --carrier-daily --quiet
0 1 * * * /usr/share/astguiclient/ADMIN_archive_log_tables.pl --days=60 --quiet
30 3 * * 0 /usr/share/astguiclient/ADMIN_archive_log_tables.pl --only-trim-archive-level-three --months=24 --quiet

### cleanup of the scheduled callback records
25 0 * * * /usr/share/astguiclient/AST_DB_dead_cb_purge.pl --purge-non-cb -q

### GMT adjust script - uncomment to enable
#45 0 * * * /usr/share/astguiclient/ADMIN_adjust_GMTnow_on_leads.pl --list-settings

### Dialer Inventory Report
1 7 * * * /usr/share/astguiclient/AST_dialer_inventory_snapshot.pl -q --override-24hours

### inbound email parser
* * * * * /usr/share/astguiclient/AST_inbound_email_parser.pl

### url log delete
30 23 * * * /usr/share/astguiclient/ADMIN_archive_log_tables.pl --url-log-only --url-log-days=30

######TILTIX GARBAGE FILES DELETE
#00 22 * * * root cd /tmp/ && find . -name '*TILTXtmp*' -type f -delete
CRONTAB
fi

if [ "$ROLE_ARCHIVE" = "yes" ]; then
if [ "$ARCHIVE_RETENTION_DAYS" -gt 0 ]; then
cat <<CRONTAB >> /root/crontab-file

### archive retention: delete recordings older than $ARCHIVE_RETENTION_DAYS days
20 2 * * * /usr/bin/find /archive/RECORDINGS -type f -mtime +$ARCHIVE_RETENTION_DAYS -print | xargs -r rm -f
CRONTAB
else
cat <<CRONTAB >> /root/crontab-file

### archive retention - disabled (keep forever); uncomment and set days to enable cleanup
#20 2 * * * /usr/bin/find /archive/RECORDINGS -type f -mtime +365 -print | xargs -r rm -f
CRONTAB
fi
fi

# VB-firewall dynamic-whitelist crons only make sense when the built-in
# firewall is enabled; on a firewall-disabled role they would hammer a dead
# firewalld six times a minute forever and fill root's mail with errors.
if [ "$ROLE_FIREWALL_ENABLED" = "yes" ]; then
cat <<CRONTAB >> /root/crontab-file

### Dynportal
@reboot /usr/bin/VB-firewall --whitelist=ViciWhite --dynamic --quiet
* * * * * /usr/bin/VB-firewall --whitelist=ViciWhite --dynamic --quiet
* * * * * sleep 10; /usr/bin/VB-firewall --white --dynamic --quiet
* * * * * sleep 20; /usr/bin/VB-firewall --white --dynamic --quiet
* * * * * sleep 30; /usr/bin/VB-firewall --white --dynamic --quiet
* * * * * sleep 40; /usr/bin/VB-firewall --white --dynamic --quiet
* * * * * sleep 50; /usr/bin/VB-firewall --white --dynamic --quiet

CRONTAB
fi

crontab /root/crontab-file
crontab -l

#Install rc.local (assembled per selected roles)

cat > /etc/rc.d/rc.local <<EOF
#!/bin/bash


# Disable console blanking and powersaving

/usr/bin/setterm -blank

/usr/bin/setterm -powersave off

/usr/bin/setterm -powerdown

EOF

if [ "$ROLE_DATABASE" = "yes" ] || [ "$ROLE_DATABASE_SLAVE" = "yes" ]; then
cat >> /etc/rc.d/rc.local <<EOF

### start up the MySQL server

systemctl start mariadb.service

EOF
fi

cat >> /etc/rc.d/rc.local <<EOF

### start up the apache web server

systemctl start httpd.service

EOF

if [ "$ROLE_TELEPHONY" = "yes" ]; then
# ViciBox parity: only telephony servers run Asterisk, roll its logs, and
# reset their live DB records at boot. A non-telephony box running
# AST_reset_mysql_vars at boot would wipe live cluster state.
cat >> /etc/rc.d/rc.local <<EOF

### roll the Asterisk logs upon reboot

/usr/share/astguiclient/ADMIN_restart_roll_logs.pl


### clear the server-related records from the database

/usr/share/astguiclient/AST_reset_mysql_vars.pl


# OPTIONAL enable ip_relay(for same-machine trunking and blind monitoring)

/usr/share/astguiclient/ip_relay/relay_control start 2>/dev/null 1>&2


### load dahdi drivers

modprobe dahdi
modprobe dahdi_dummy || true

/usr/sbin/dahdi_cfg -vvvvvvvvvvvvv


### sleep for 20 seconds before launching Asterisk

sleep 20


### start up asterisk (telephony role only)

/usr/share/astguiclient/start_asterisk_boot.pl

EOF
fi

cat >> /etc/rc.d/rc.local <<EOF

exit 0

EOF

chmod +x /etc/rc.d/rc.local
systemctl enable rc-local
systemctl start rc-local


##Install Dynportal
dnf install -y firewalld
cd /home
copy_asset dynportal.zip
copy_asset firewall.zip
copy_asset aggregate
copy_asset VB-firewall

mkdir -p /var/www/vhosts/dynportal
cp -f /home/dynportal.zip /var/www/vhosts/dynportal/
cp -f /home/firewall.zip /etc/firewalld/
cd /var/www/vhosts/dynportal/
unzip -o dynportal.zip
chmod -R 755 *
chown -R apache:apache *
configure_dynportal_defaults
cd etc/httpd/conf.d/
cp -f viciportal.conf /etc/httpd/conf.d/
cd /etc/firewalld/
unzip -o firewall.zip
cd zones/
rm -rf public.xml trusted.xml
cd /etc/firewalld/
mv -bf public.xml trusted.xml /etc/firewalld/zones/
cp -f /home/aggregate /usr/bin/
chmod +x /usr/bin/aggregate
cp -f /home/VB-firewall /usr/bin/
chmod +x /usr/bin/VB-firewall

firewall-offline-cmd --add-port=446/tcp --zone=public

# If firewalld is already running it still has the distro-default zones loaded,
# and the next firewall-cmd --permanent would write that stale config back over
# the shipped zone/ipset files above. Restart so the daemon reads them first.
if systemctl is-active firewalld >/dev/null 2>&1; then
    systemctl restart firewalld
fi

if [ "$ROLE_TELEPHONY" = "yes" ]; then

##Fix ip_relay
cd /usr/src/astguiclient/trunk/extras/ip_relay/
rm -rf ip_relay_1.1
unzip -o ip_relay_1.1.112705.zip
grep -q '#include <unistd.h>' ip_relay_1.1/src/lib_ip_relay.c || sed -i '/#include <stdio.h>/a #include <unistd.h>' ip_relay_1.1/src/lib_ip_relay.c
grep -q '#include <stdlib.h>' ip_relay_1.1/src/ip_relay.c || sed -i '/#include <stdio.h>/a #include <stdlib.h>' ip_relay_1.1/src/ip_relay.c
cd ip_relay_1.1/src/unix/
make || { echo "ERROR: ip_relay build failed"; exit 1; }
install -m 755 ip_relay /usr/share/astguiclient/ip_relay/ip_relay_linux_x86_64
ln -sf /usr/share/astguiclient/ip_relay/ip_relay_linux_x86_64 /usr/share/astguiclient/ip_relay/ip_relay
ln -sf /usr/share/astguiclient/ip_relay/ip_relay_linux_x86_64 /usr/bin/ip_relay
ln -sf /usr/share/astguiclient/ip_relay/ip_relay_linux_x86_64 /usr/local/bin/ip_relay
ip_relay -h >/dev/null 2>&1 || true

cd /usr/lib64/asterisk/modules
copy_asset codec_g729-ast160-gcc4-glibc-x86_64-core2-sse4.so
cp -f codec_g729-ast160-gcc4-glibc-x86_64-core2-sse4.so codec_g729.so
chmod 777 codec_g729.so

fi # ROLE_TELEPHONY ip_relay/g729

replace_managed_block /etc/httpd/conf/httpd.conf GENX_VICIDIAL_RECORDINGS <<EOF
# BEGIN GENX_VICIDIAL_RECORDINGS

CustomLog /dev/null common

Alias /RECORDINGS/MP3 "/var/spool/asterisk/monitorDONE/MP3/"

<Directory "/var/spool/asterisk/monitorDONE/MP3/">
    Options Indexes MultiViews
    AllowOverride None
    Require all granted
</Directory>
Timeout 600

# END GENX_VICIDIAL_RECORDINGS
EOF

replace_managed_block /etc/systemd/system.conf GENX_VICIDIAL_SYSTEMD_LIMITS <<EOF
# BEGIN GENX_VICIDIAL_SYSTEMD_LIMITS
DefaultLimitNOFILE=65536
# END GENX_VICIDIAL_SYSTEMD_LIMITS
EOF

##Install Sounds

if [ "$ROLE_TELEPHONY" = "yes" ]; then

cd /usr/src
copy_asset asterisk-core-sounds-en-ulaw-current.tar.gz
copy_asset asterisk-core-sounds-en-wav-current.tar.gz
copy_asset asterisk-core-sounds-en-gsm-current.tar.gz
copy_asset asterisk-extra-sounds-en-ulaw-current.tar.gz
copy_asset asterisk-extra-sounds-en-wav-current.tar.gz
copy_asset asterisk-extra-sounds-en-gsm-current.tar.gz
copy_asset asterisk-moh-opsound-gsm-current.tar.gz
copy_asset asterisk-moh-opsound-ulaw-current.tar.gz
copy_asset asterisk-moh-opsound-wav-current.tar.gz

#Place the audio files in their proper places:
cd /var/lib/asterisk/sounds
tar -zxf /usr/src/asterisk-core-sounds-en-gsm-current.tar.gz
tar -zxf /usr/src/asterisk-core-sounds-en-ulaw-current.tar.gz
tar -zxf /usr/src/asterisk-core-sounds-en-wav-current.tar.gz
tar -zxf /usr/src/asterisk-extra-sounds-en-gsm-current.tar.gz
tar -zxf /usr/src/asterisk-extra-sounds-en-ulaw-current.tar.gz
tar -zxf /usr/src/asterisk-extra-sounds-en-wav-current.tar.gz

mkdir -p /var/lib/asterisk/mohmp3
mkdir -p /var/lib/asterisk/quiet-mp3
ln -sfn /var/lib/asterisk/mohmp3 /var/lib/asterisk/default

cd /var/lib/asterisk/mohmp3
tar -zxf /usr/src/asterisk-moh-opsound-gsm-current.tar.gz
tar -zxf /usr/src/asterisk-moh-opsound-ulaw-current.tar.gz
tar -zxf /usr/src/asterisk-moh-opsound-wav-current.tar.gz
rm -f CHANGES*
rm -f LICENSE*
rm -f CREDITS*

cd /var/lib/asterisk/moh
rm -f CHANGES*
rm -f LICENSE*
rm -f CREDITS*

cd /var/lib/asterisk/sounds
rm -f CHANGES*
rm -f LICENSE*
rm -f CREDITS*

cd /var/lib/asterisk/quiet-mp3
sox ../mohmp3/macroform-cold_day.wav macroform-cold_day.wav vol 0.25
sox ../mohmp3/macroform-cold_day.gsm macroform-cold_day.gsm vol 0.25
sox -t ul -r 8000 -c 1 ../mohmp3/macroform-cold_day.ulaw -t ul macroform-cold_day.ulaw vol 0.25
sox ../mohmp3/macroform-robot_dity.wav macroform-robot_dity.wav vol 0.25
sox ../mohmp3/macroform-robot_dity.gsm macroform-robot_dity.gsm vol 0.25
sox -t ul -r 8000 -c 1 ../mohmp3/macroform-robot_dity.ulaw -t ul macroform-robot_dity.ulaw vol 0.25
sox ../mohmp3/macroform-the_simplicity.wav macroform-the_simplicity.wav vol 0.25
sox ../mohmp3/macroform-the_simplicity.gsm macroform-the_simplicity.gsm vol 0.25
sox -t ul -r 8000 -c 1 ../mohmp3/macroform-the_simplicity.ulaw -t ul macroform-the_simplicity.ulaw vol 0.25
sox ../mohmp3/reno_project-system.wav reno_project-system.wav vol 0.25
sox ../mohmp3/reno_project-system.gsm reno_project-system.gsm vol 0.25
sox -t ul -r 8000 -c 1 ../mohmp3/reno_project-system.ulaw -t ul reno_project-system.ulaw vol 0.25
sox ../mohmp3/manolo_camp-morning_coffee.wav manolo_camp-morning_coffee.wav vol 0.25
sox ../mohmp3/manolo_camp-morning_coffee.gsm manolo_camp-morning_coffee.gsm vol 0.25
sox -t ul -r 8000 -c 1 ../mohmp3/manolo_camp-morning_coffee.ulaw -t ul manolo_camp-morning_coffee.ulaw vol 0.25

fi # ROLE_TELEPHONY sounds


## Remove debug kernel
dnf remove kernel-debug* -y

#add rc-local as a service - thx to ras
cat > /etc/systemd/system/rc-local.service <<EOF
[Unit]
Description=/etc/rc.local Compatibility

[Service]
Type=oneshot
ExecStart=/etc/rc.local
TimeoutSec=0
StandardInput=tty
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

##confbridge fix
if [ "$ROLE_TELEPHONY" = "yes" ]; then
cd "$SCRIPT_DIR"
cp -f "$SCRIPT_DIR/extensions.conf" /etc/asterisk/extensions.conf
cp -f "$SCRIPT_DIR/confbridge-vicidial.conf" /etc/asterisk/

sed -i '/^#include confbridge-vicidial.conf$/d' /etc/asterisk/confbridge.conf 2>/dev/null || true
replace_managed_block /etc/asterisk/confbridge.conf GENX_VICIDIAL_CONFBRIDGE <<EOF
; BEGIN GENX_VICIDIAL_CONFBRIDGE

#include confbridge-vicidial.conf
; END GENX_VICIDIAL_CONFBRIDGE
EOF
fi # ROLE_TELEPHONY confbridge

systemctl daemon-reload
systemctl enable rc-local.service
systemctl start rc-local.service

cat <<WELCOME > /var/www/html/index.html
<META HTTP-EQUIV=REFRESH CONTENT="1; URL=/vicidial/welcome.php">
Please Hold while I redirect you!
WELCOME
fix_vicidial_web_permissions

chkconfig --list asterisk >/dev/null 2>&1 && chkconfig asterisk off || true

## add confcron user
if [ "$ROLE_TELEPHONY" = "yes" ]; then
sed -i '/^\[confcron\]$/,/^eventfilter=Event: Confbridge$/d' /etc/asterisk/manager.conf 2>/dev/null || true
replace_managed_block /etc/asterisk/manager.conf GENX_VICIDIAL_CONFCRON <<EOF
; BEGIN GENX_VICIDIAL_CONFCRON

[confcron]
secret = $CRON_DB_PASS
read = command,reporting
write = command,reporting

eventfilter=Event: Meetme
eventfilter=Event: Confbridge
; END GENX_VICIDIAL_CONFCRON
EOF
fi # ROLE_TELEPHONY confcron

if [ "$ROLE_INSTALL_WEBRTC" = "yes" ]; then
    install_certbot_required
    if systemctl list-unit-files certbot-renew.timer >/dev/null 2>&1; then
        systemctl enable certbot-renew.timer
        systemctl start certbot-renew.timer
    else
        echo "certbot-renew.timer not found; weekly certbot.sh cron entry will handle renewals if certbot is installed."
    fi
    cd "$SCRIPT_DIR"
    systemctl enable firewalld
    systemctl start firewalld
    DOMAINNAME="$DOMAINNAME" MYSQL_ROOT_PASS="$MYSQL_ROOT_PASS" CERTBOT_STAGING="$CERTBOT_STAGING" \
        CLUSTER_JOIN="$CLUSTER_JOIN" VICIDIAL_DB_HOST="$VICIDIAL_DB_HOST" VICIDIAL_DB_PORT="$VICIDIAL_DB_PORT" \
        VICIDIAL_DB_NAME="$VICIDIAL_DB_NAME" CLUSTER_DB_USER="$CLUSTER_DB_USER" CRON_DB_PASS="$CRON_DB_PASS" \
        SERVER_SCOPE_IP="$ip_address" ROLE_TELEPHONY="$ROLE_TELEPHONY" bash ./vicidial-enable-webrtc.sh || exit 1
    configure_dynportal_defaults
else
    echo "Skipping WebRTC/certificate setup because no Web, Telephony, or Archive role is selected."
fi
if [ "$CLUSTER_JOIN" != "yes" ]; then
    apply_vicidial_database_defaults "$ip_address" "$DOMAINNAME"
    for wip in $(printf '%s' "$EXTRA_WHITELIST_IPS" | tr ',' ' '); do
        if [[ "$wip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
            "${MYSQL[@]}" "$VICIDIAL_DB_NAME" -e "INSERT INTO vicidial_ip_list_entries (ip_list_id, ip_address) SELECT 'ViciWhite', '${wip}' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM vicidial_ip_list_entries WHERE ip_list_id='ViciWhite' AND ip_address='${wip}');"
            echo "Whitelisted ${wip} in ViciWhite."
        elif [ -n "$wip" ]; then
            echo "WARNING: Skipping invalid whitelist entry: $wip"
        fi
    done
fi
if [ "$ROLE_ARCHIVE" = "yes" ]; then
    setup_archive_server
fi

# GenX modern UI (admin + agent): the React app served behind Apache at /genx/.
# The legacy PHP overlay (install-genx-overlay.sh) is intentionally NOT installed.
if [ "$ROLE_WEB" = "yes" ] && [ "$INSTALL_GENX_UI" = "yes" ]; then
    echo "Installing GenX modern UI (admin + agent)..."
    bash "$SCRIPT_DIR/install-genx-ui.sh"
fi

register_selected_vicibox_roles

if [ "$ROLE_FIREWALL_ENABLED" = "yes" ]; then
    # LOCKED-DOWN POSTURE — read before debugging "the web UI is unreachable":
    # http/https/ssh/cockpit are REMOVED from the public zone on purpose.
    # All admin/agent access flows through the VB-firewall dynamic whitelist
    # (ViciWhite crons above + dynportal on 446): users hit the dynportal,
    # authenticate, and their IP gets opened. The static accept IPs below are
    # GenX management/office/VPN addresses so ops can always reach the box
    # even if VB-firewall or the dynportal breaks — that is the recovery
    # path. Review/replace these for customer installs.
    systemctl enable firewalld
    systemctl start firewalld
    firewall-cmd --add-service=http --permanent --zone=trusted
    firewall-cmd --permanent --add-rich-rule="rule family='ipv4' source address='74.208.178.234' accept"
    firewall-cmd --permanent --add-rich-rule="rule family='ipv4' source address='12.170.243.178' accept"
    firewall-cmd --permanent --add-rich-rule="rule family='ipv4' source address='74.208.129.213' accept"
    firewall-cmd --permanent --add-rich-rule="rule family='ipv4' source address='45.3.191.82' accept"
    firewall-cmd --permanent --add-rich-rule="rule family='ipv4' source address='167.99.6.117' accept"
    firewall-cmd --permanent --remove-port=8089/tcp
    firewall-cmd --permanent --remove-port=8089/udp
    firewall-cmd --permanent --remove-service=http
    firewall-cmd --permanent --remove-service=https
    firewall-cmd --permanent --add-port=10000-20000/udp
    firewall-cmd --permanent --remove-service=ssh
    firewall-cmd --permanent --remove-service=cockpit
    firewall-cmd --permanent --remove-service=dhcpv6-client
    firewall-cmd --reload
else
    systemctl stop firewalld || true
    systemctl disable firewalld || true
fi

# Wide-open spool permissions mirror the stock VICIdial/ViciBox install:
# recording mixing crons, Asterisk (as its own user) and Apache all write
# under /var/spool/asterisk, and stock scripts assume 777 here. Known
# trade-off: recordings are readable by any local account — tightening this
# requires re-testing AST_CRON_audio_1_move/2_mix on every role.
chmod -R 777 /var/spool/asterisk/
chown -R apache:apache /var/spool/asterisk/

## mv "$SCRIPT_DIR/viciportal-ssl.conf" /home/viciportal-ssl.conf
## sed -i s/DOMAINNAME/"$DOMAINNAME"/g /var/www/vhosts/dynportal/inc/defaults.inc.php
## sed -i s/DOMAINNAME/"$DOMAINNAME"/g /home/viciportal-ssl.conf

# Cluster-wide settings: only the primary-DB install may set these. A joining
# server must never repoint voicemail/sounds for the whole cluster to itself.
if [ "$CLUSTER_JOIN" != "yes" ] && { [ "$ROLE_TELEPHONY" = "yes" ] || [ "$ROLE_WEB" = "yes" ]; }; then
    # sounds_web_server must use the SSL domain, matching the join path above:
    # telephony servers fetch central sounds over https, and the Let's Encrypt
    # cert is issued for $DOMAINNAME — pointing this at the (often internal)
    # $hostname breaks TLS validation for the whole cluster's sound sync.
    "${MYSQL[@]}" -e "use $VICIDIAL_DB_NAME; update system_settings set webphone_url='https://phone.viciphone.com/viciphone.php', sounds_web_server='https://${DOMAINNAME:-$hostname}', sounds_central_control_active='1';"
fi
# Voicemail must live on a box that runs Asterisk: a non-telephony primary
# (DB+Web combo) leaves it unset so the first telephony join claims it.
if [ "$CLUSTER_JOIN" != "yes" ] && [ "$ROLE_TELEPHONY" = "yes" ]; then
    "${MYSQL[@]}" -e "use $VICIDIAL_DB_NAME; update system_settings set active_voicemail_server='$ip_address';"
fi
if [ "$ROLE_TELEPHONY" = "yes" ] || [ "$ROLE_WEB" = "yes" ]; then
    configure_audio_store_directory
fi

if [[ "$REBOOT_AFTER_INSTALL" =~ ^[Yy] ]]; then
    echo "Restarting AlmaLinux"
    reboot
else
    echo "Install complete. Reboot skipped because REBOOT_AFTER_INSTALL=$REBOOT_AFTER_INSTALL"
fi
