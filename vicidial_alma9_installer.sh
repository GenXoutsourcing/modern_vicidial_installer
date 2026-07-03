#!/bin/bash
set -Ee -o pipefail

trap 'echo "ERROR: Installer failed at line $LINENO while running: $BASH_COMMAND"; exit 1' ERR

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSET_DIR="$SCRIPT_DIR/assets"

echo "Vicidial installation AlmaLinux 9/RockyLinux 9 with WebPhone and Dynamic portal"

DEFAULT_CRON_DB_PASS="1234"
DEFAULT_CUSTOM_DB_PASS="custom1234"
OLD_SERVER_IP="${OLD_SERVER_IP:-10.10.10.15}"
REBOOT_AFTER_INSTALL="${REBOOT_AFTER_INSTALL:-yes}"
CERTBOT_STAGING="${CERTBOT_STAGING:-no}"

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
    read -s -p "$prompt_text: " input
    echo
    export $varname="${input:-$default_value}"
}

replace_managed_block() {
    local file=$1
    local marker=$2
    sed -i "/# BEGIN ${marker}/,/# END ${marker}/d" "$file" 2>/dev/null || true
    cat >> "$file"
}

validate_fqdn() {
    local name=$1
    if [[ ! "$name" =~ ^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$ ]]; then
        echo "ERROR: Invalid fully qualified domain name: $name"
        exit 1
    fi
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
    find /var/www/html -type d -exec chmod 0777 {} \;
    find /var/www/html -type f -exec chmod 644 {} \;
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
    audio_dir=$("${MYSQL[@]}" -Nse "use asterisk; select sounds_web_directory from system_settings limit 1;" | tr -d '\r\n')
    if [ -n "$audio_dir" ]; then
        mkdir -p "/var/www/html/$audio_dir"
        chown -R root:root "/var/www/html/$audio_dir"
        chmod g-s "/var/www/html/$audio_dir"
        chmod 0777 "/var/www/html/$audio_dir"
    fi
    chown root:root /var/www/html
    chmod g-s /var/www/html
    chmod 0777 /var/www/html
}

configure_dynportal_defaults() {
    local redirect_url="https://${DOMAINNAME}/vicidial/welcome.php"

    if [ -f /var/www/vhosts/dynportal/valid8.php ]; then
        sed -i 's/CyburDial - All rights reserved\./Genx ContactCenter - All rights reserved./g' /var/www/vhosts/dynportal/valid8.php
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
        password=$(LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom | head -c 25)
    done
    printf '%s' "$password"
}

secure_vicidial_default_passwords() {
    local reg_pass login_pass server_pass

    reg_pass=$("${MYSQL[@]}" -Nse "use asterisk; select default_phone_registration_password from system_settings limit 1;" | tr -d '\r\n')
    login_pass=$("${MYSQL[@]}" -Nse "use asterisk; select default_phone_login_password from system_settings limit 1;" | tr -d '\r\n')
    server_pass=$("${MYSQL[@]}" -Nse "use asterisk; select default_server_password from system_settings limit 1;" | tr -d '\r\n')

    if [ -z "$reg_pass" ] || [ "$reg_pass" = "test" ]; then
        reg_pass=$(generate_password_25)
    fi
    if [ -z "$login_pass" ] || [ "$login_pass" = "test" ]; then
        login_pass=$(generate_password_25)
    fi
    if [ -z "$server_pass" ] || [ "$server_pass" = "test" ]; then
        server_pass=$(generate_password_25)
    fi

    "${MYSQL[@]}" asterisk <<MYSQLPASSDEFAULTS
UPDATE system_settings
SET default_phone_registration_password='${reg_pass}',
    default_phone_login_password='${login_pass}',
    default_server_password='${server_pass}';
MYSQLPASSDEFAULTS
}

apply_vicidial_database_defaults() {
    local server_ip=$1
    local cert_domain=$2
    local server_id

    server_id=$(printf '%s' "${cert_domain%%.*}" | tr '[:lower:]' '[:upper:]' | cut -c1-10)

    "${MYSQL[@]}" asterisk <<MYSQLDEFAULTS
UPDATE system_settings SET allow_ip_lists='1';

UPDATE servers
SET server_id='${server_id}',
    server_description='${cert_domain}',
    asterisk_version='18.21.1-vici',
    max_vicidial_trunks=120,
    outbound_calls_per_second=10,
    recording_web_link='ALT_IP',
    alt_server_ip='${cert_domain}',
    conf_engine='CONFBRIDGE',
    auto_restart_asterisk='Y'
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
     campaign_description, campaign_changedate)
VALUES
    ('TESTCAMP', 'Test Campaign', 'Y', '---ALL---', 'Y',
     'Y', '---NONE---', ' NEW -', 'DOWN',
     'DISABLED', 'NONE', 100, 'RATIO',
     '1', '0', '', 'NONE',
     '', NOW())
ON DUPLICATE KEY UPDATE
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
dtlscertfile=/etc/letsencrypt/live/${cert_domain}/cert.pem
dtlsprivatekey=/etc/letsencrypt/live/${cert_domain}/privkey.pem
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
    vu.ignore_ip_list='0',
    vu.admin_hide_lead_data='0',
    vu.admin_hide_phone_data='0'
WHERE vu.user='6666';
MYSQLDEFAULTS
}

install_audio_store_directory_helper() {
    cat > /usr/local/bin/vicidial-audio-store-dir <<'AUDIOSTOREDIR'
#!/bin/bash
audio_dir=$(mysql -u root -Nse 'use asterisk; select sounds_web_directory from system_settings limit 1;' 2>/dev/null | tr -d '\r\n')
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
echo "Hostname\t: $hostname"
# Retrieve the IP address
ip_address=$(hostname -I | awk '{print $1}')
echo "IP Address\t: $ip_address"
echo "**************************************************************************"

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

CRON_DB_PASS="${CRON_DB_PASS:-$DEFAULT_CRON_DB_PASS}"
CUSTOM_DB_PASS="${CUSTOM_DB_PASS:-$DEFAULT_CUSTOM_DB_PASS}"

prompt DOMAINNAME "Domain name for SSL/WebRTC" "${DOMAINNAME:-$hostname}"
validate_fqdn "$DOMAINNAME"

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

sleep 3
dnf install -y newt-devel libxml2-devel sqlite-devel libuuid-devel sox sendmail lame-devel htop iftop perl-File-Which
sleep 2
dnf install -y php-opcache mariadb-devel
dnf install -y libss7 'libss7*' 'libopen*' || true
sleep 1
dnf install -y initscripts pv python3-pip 
python3 -c 'import mysql.connector' 2>/dev/null || python3 -m pip install mysql-connector-python
dnf copr enable irontec/sngrep -y
dnf install sngrep bind-utils -y

dnf install -y kernel-devel-$(uname -r) kernel-headers-$(uname -r) || dnf install -y kernel-devel kernel-headers

dnf --enablerepo=crb install libsrtp-devel -y
dnf config-manager --set-enabled crb
dnf install -y libsrtp-devel vsftpd lftp || dnf install -y libsrtp-devel vsftpd

### Install cockpit
#dnf -y install cockpit cockpit-storaged cockpit-navigator
#sed -i s/root/"#root"/g /etc/cockpit/disallowed-users
#systemctl enable cockpit.socket

sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin yes/' /etc/ssh/sshd_config

dnf install -y sqlite-devel httpd mod_ssl nano chkconfig htop atop mytop iftop
dnf install -y libedit-devel uuid* libxml2* speex-devel speex* postfix dovecot s-nail inxi
dnf install -y roundcubemail || true
dnf install -y mariadb-server mariadb

replace_managed_block /etc/php.ini GENX_VICIDIAL_PHP <<EOF
# BEGIN GENX_VICIDIAL_PHP

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
# END GENX_VICIDIAL_PHP
EOF


systemctl restart httpd



dnf -y install dnf-plugins-core
dnf config-manager --set-enabled crb || true

dnf install sendmail -y
systemctl start sendmail
systemctl enable sendmail

systemctl enable mariadb

[ -f /etc/my.cnf.original ] || cp /etc/my.cnf /etc/my.cnf.original
echo "" > /etc/my.cnf


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
key_buffer_size = 12G # Increase to be approximately 60% of system RAM when you have more then 8GB in the system

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
server-id = 1 # Master should be 1, and all slaves should have a unique ID number
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
innodb_file_format = Barracuda # Deprecated in future releases as this is the only supported format, eventually
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

systemctl enable httpd.service
systemctl enable mariadb.service
systemctl restart httpd.service
systemctl restart mariadb.service

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

dnf install libsrtp-devel -y
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


#Install Jansson
cd /usr/src/
rm -rf jansson-2.13
copy_asset jansson-2.13.tar.gz
tar xvzf jansson-2.13.tar.gz
cd jansson-2.13
./configure
make clean
make
make install 
ldconfig

echo "Install DAHDI"

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

#Install Asterisk and LibPRI
rm -rf /usr/src/asterisk /usr/src/libsrtp-2.1.0
mkdir -p /usr/src/asterisk
cd /usr/src/asterisk
copy_asset libpri-1.6.1.tar.gz
copy_asset asterisk-18.21.0-vici.tar.gz
tar -xvzf asterisk-18.21.0-vici.tar.gz
tar -xvzf libpri-*

cd /usr/src
copy_asset libsrtp-2.1.0.tar.gz
tar xfv libsrtp-2.1.0.tar.gz
cd libsrtp-2.1.0
./configure --prefix=/usr --enable-openssl
make shared_library && sudo make install
ldconfig

# cd /usr/src/asterisk/asterisk-18.18.1/
cd /usr/src/asterisk/asterisk-18.21.0-vici/

dnf install libuuid-devel libxml2-devel -y

: ${JOBS:=$(( $(nproc) + $(nproc) / 2 ))}
copy_asset jansson-2.14.tar.bz2 /tmp/jansson-2.14.tar.bz2
copy_asset pjproject-2.13.1.tar.bz2 /tmp/pjproject-2.13.1.tar.bz2
./configure --libdir=/usr/lib64 --with-gsm=internal --enable-opus --enable-srtp --with-ssl --enable-asteriskssl --with-pjproject-bundled --with-jansson-bundled

make menuselect/menuselect menuselect-tree menuselect.makeopts
#enable app_meetme
menuselect/menuselect --enable app_meetme menuselect.makeopts
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
svn checkout svn://svn.eflo.net/agc_2-X/trunk
cd /usr/src/astguiclient/trunk

#Add mysql users and Databases - rerun safe
# This block is safe if the installer is run again on a server where the asterisk DB already exists.
if [ -z "$MYSQL_ROOT_PASS" ]; then
    MYSQL=(mysql -u root)
else
    MYSQL=(mysql -u root -p"$MYSQL_ROOT_PASS")
fi

"${MYSQL[@]}" << MYSQLCREOF
CREATE DATABASE IF NOT EXISTS asterisk DEFAULT CHARACTER SET utf8 COLLATE utf8_unicode_ci;
CREATE USER IF NOT EXISTS 'cron'@'localhost' IDENTIFIED BY '$CRON_DB_PASS';
CREATE USER IF NOT EXISTS 'cron'@'%' IDENTIFIED BY '$CRON_DB_PASS';
CREATE USER IF NOT EXISTS 'custom'@'localhost' IDENTIFIED BY '$CUSTOM_DB_PASS';
CREATE USER IF NOT EXISTS 'custom'@'%' IDENTIFIED BY '$CUSTOM_DB_PASS';
ALTER USER IF EXISTS 'cron'@'localhost' IDENTIFIED BY '$CRON_DB_PASS';
ALTER USER IF EXISTS 'cron'@'%' IDENTIFIED BY '$CRON_DB_PASS';
ALTER USER IF EXISTS 'custom'@'localhost' IDENTIFIED BY '$CUSTOM_DB_PASS';
ALTER USER IF EXISTS 'custom'@'%' IDENTIFIED BY '$CUSTOM_DB_PASS';
GRANT SELECT,CREATE,ALTER,INSERT,UPDATE,DELETE,LOCK TABLES on asterisk.* TO 'cron'@'%';
GRANT SELECT,CREATE,ALTER,INSERT,UPDATE,DELETE,LOCK TABLES on asterisk.* TO 'cron'@'localhost';
GRANT RELOAD ON *.* TO 'cron'@'%';
GRANT RELOAD ON *.* TO 'cron'@'localhost';
GRANT SELECT,CREATE,ALTER,INSERT,UPDATE,DELETE,LOCK TABLES on asterisk.* TO 'custom'@'%';
GRANT SELECT,CREATE,ALTER,INSERT,UPDATE,DELETE,LOCK TABLES on asterisk.* TO 'custom'@'localhost';
GRANT RELOAD ON *.* TO 'custom'@'%';
GRANT RELOAD ON *.* TO 'custom'@'localhost';
FLUSH PRIVILEGES;
SET GLOBAL connect_timeout=60;
MYSQLCREOF

# Import schema only if this is a fresh asterisk database. Reimporting on reruns causes duplicate table/key errors.
if "${MYSQL[@]}" -Nse "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='asterisk' AND table_name='system_settings';" | grep -q '^0$'; then
    echo "Fresh asterisk DB detected. Importing VICIdial schema..."
    "${MYSQL[@]}" asterisk < /usr/src/astguiclient/trunk/extras/MySQL_AST_CREATE_tables.sql
    "${MYSQL[@]}" asterisk < /usr/src/astguiclient/trunk/extras/first_server_install.sql
else
    echo "Existing asterisk DB detected. Skipping VICIdial schema import for rerun safety."
fi

"${MYSQL[@]}" -e "USE asterisk; UPDATE servers SET asterisk_version='18.21.1-vici';" || true
secure_vicidial_default_passwords
apply_vicidial_database_defaults "$ip_address" "$DOMAINNAME"

#Get astguiclient.conf file
cat <<ASTGUI>> /etc/astguiclient.conf
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
VARDB_server => localhost
VARDB_database => asterisk
VARDB_user => cron
VARDB_pass => $CRON_DB_PASS
VARDB_custom_user => custom
VARDB_custom_pass => $CUSTOM_DB_PASS
VARDB_port => 3306

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
VARactive_keepalives => 123456789ECS

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

# Expected DB Schema version for this install
ExpectedDBSchema => 1720
ASTGUI

echo "Replace IP address in Default"
#echo "%%%%%%%%%Please Enter This Server IP ADD%%%%%%%%%%%%"
#read serveripadd
sed -i s/SERVERIP/"$ip_address"/g /etc/astguiclient.conf

echo "Install VICIDIAL"
perl install.pl --no-prompt --copy_sample_conf_files=Y
apply_vicidial_database_defaults "$ip_address" "$DOMAINNAME"
fix_vicidial_web_permissions
configure_agc_options

#Secure Manager 
sed -i s/0.0.0.0/127.0.0.1/g /etc/asterisk/manager.conf

sed -i '$ a\ noload => res_timing_timerfd.so\ noload => res_timing_kqueue.so\ noload => res_timing_pthread.so' /etc/asterisk/modules.conf

#Add confbridge conferences to asterisk DB
"${MYSQL[@]}" -e "use asterisk; INSERT IGNORE INTO vicidial_confbridges VALUES (9600000,'$OLD_SERVER_IP','','0',NULL),(9600001,'$OLD_SERVER_IP','','0',NULL),(9600002,'$OLD_SERVER_IP','','0',NULL),(9600003,'$OLD_SERVER_IP','','0',NULL),(9600004,'$OLD_SERVER_IP','','0',NULL),(9600005,'$OLD_SERVER_IP','','0',NULL),(9600006,'$OLD_SERVER_IP','','0',NULL),(9600007,'$OLD_SERVER_IP','','0',NULL),(9600008,'$OLD_SERVER_IP','','0',NULL),(9600009,'$OLD_SERVER_IP','','0',NULL),(9600010,'$OLD_SERVER_IP','','0',NULL),(9600011,'$OLD_SERVER_IP','','0',NULL),(9600012,'$OLD_SERVER_IP','','0',NULL),(9600013,'$OLD_SERVER_IP','','0',NULL),(9600014,'$OLD_SERVER_IP','','0',NULL),(9600015,'$OLD_SERVER_IP','','0',NULL),(9600016,'$OLD_SERVER_IP','','0',NULL),(9600017,'$OLD_SERVER_IP','','0',NULL),(9600018,'$OLD_SERVER_IP','','0',NULL),(9600019,'$OLD_SERVER_IP','','0',NULL),(9600020,'$OLD_SERVER_IP','','0',NULL),(9600021,'$OLD_SERVER_IP','','0',NULL),(9600022,'$OLD_SERVER_IP','','0',NULL),(9600023,'$OLD_SERVER_IP','','0',NULL),(9600024,'$OLD_SERVER_IP','','0',NULL),(9600025,'$OLD_SERVER_IP','','0',NULL),(9600026,'$OLD_SERVER_IP','','0',NULL),(9600027,'$OLD_SERVER_IP','','0',NULL),(9600028,'$OLD_SERVER_IP','','0',NULL),(9600029,'$OLD_SERVER_IP','','0',NULL),(9600030,'$OLD_SERVER_IP','','0',NULL),(9600031,'$OLD_SERVER_IP','','0',NULL),(9600032,'$OLD_SERVER_IP','','0',NULL),(9600033,'$OLD_SERVER_IP','','0',NULL),(9600034,'$OLD_SERVER_IP','','0',NULL),(9600035,'$OLD_SERVER_IP','','0',NULL),(9600036,'$OLD_SERVER_IP','','0',NULL),(9600037,'$OLD_SERVER_IP','','0',NULL),(9600038,'$OLD_SERVER_IP','','0',NULL),(9600039,'$OLD_SERVER_IP','','0',NULL),(9600040,'$OLD_SERVER_IP','','0',NULL),(9600041,'$OLD_SERVER_IP','','0',NULL),(9600042,'$OLD_SERVER_IP','','0',NULL),(9600043,'$OLD_SERVER_IP','','0',NULL),(9600044,'$OLD_SERVER_IP','','0',NULL),(9600045,'$OLD_SERVER_IP','','0',NULL),(9600046,'$OLD_SERVER_IP','','0',NULL),(9600047,'$OLD_SERVER_IP','','0',NULL),(9600048,'$OLD_SERVER_IP','','0',NULL),(9600049,'$OLD_SERVER_IP','','0',NULL),(9600050,'$OLD_SERVER_IP','','0',NULL),(9600051,'$OLD_SERVER_IP','','0',NULL),(9600052,'$OLD_SERVER_IP','','0',NULL),(9600054,'$OLD_SERVER_IP','','0',NULL),(9600055,'$OLD_SERVER_IP','','0',NULL),(9600056,'$OLD_SERVER_IP','','0',NULL),(9600057,'$OLD_SERVER_IP','','0',NULL),(9600058,'$OLD_SERVER_IP','','0',NULL),(9600059,'$OLD_SERVER_IP','','0',NULL),(9600060,'$OLD_SERVER_IP','','0',NULL),(9600061,'$OLD_SERVER_IP','','0',NULL),
(9600062,'$OLD_SERVER_IP','','0',NULL),(9600063,'$OLD_SERVER_IP','','0',NULL),(9600064,'$OLD_SERVER_IP','','0',NULL),(9600065,'$OLD_SERVER_IP','','0',NULL),(9600066,'$OLD_SERVER_IP','','0',NULL),(9600067,'$OLD_SERVER_IP','','0',NULL),(9600068,'$OLD_SERVER_IP','','0',NULL),(9600069,'$OLD_SERVER_IP','','0',NULL),(9600070,'$OLD_SERVER_IP','','0',NULL),(9600071,'$OLD_SERVER_IP','','0',NULL),(9600072,'$OLD_SERVER_IP','','0',NULL),(9600073,'$OLD_SERVER_IP','','0',NULL),(9600074,'$OLD_SERVER_IP','','0',NULL),(9600075,'$OLD_SERVER_IP','','0',NULL),(9600076,'$OLD_SERVER_IP','','0',NULL),(9600077,'$OLD_SERVER_IP','','0',NULL),(9600078,'$OLD_SERVER_IP','','0',NULL),(9600079,'$OLD_SERVER_IP','','0',NULL),(9600080,'$OLD_SERVER_IP','','0',NULL),(9600081,'$OLD_SERVER_IP','','0',NULL),(9600082,'$OLD_SERVER_IP','','0',NULL),(9600083,'$OLD_SERVER_IP','','0',NULL),(9600084,'$OLD_SERVER_IP','','0',NULL),(9600085,'$OLD_SERVER_IP','','0',NULL),(9600086,'$OLD_SERVER_IP','','0',NULL),(9600087,'$OLD_SERVER_IP','','0',NULL),(9600088,'$OLD_SERVER_IP','','0',NULL),(9600089,'$OLD_SERVER_IP','','0',NULL),(9600090,'$OLD_SERVER_IP','','0',NULL),(9600091,'$OLD_SERVER_IP','','0',NULL),(9600092,'$OLD_SERVER_IP','','0',NULL),(9600093,'$OLD_SERVER_IP','','0',NULL),(9600094,'$OLD_SERVER_IP','','0',NULL),(9600095,'$OLD_SERVER_IP','','0',NULL),(9600096,'$OLD_SERVER_IP','','0',NULL),(9600097,'$OLD_SERVER_IP','','0',NULL),(9600098,'$OLD_SERVER_IP','','0',NULL),(9600099,'$OLD_SERVER_IP','','0',NULL),(9600100,'$OLD_SERVER_IP','','0',NULL),(9600101,'$OLD_SERVER_IP','','0',NULL),(9600102,'$OLD_SERVER_IP','','0',NULL),(9600103,'$OLD_SERVER_IP','','0',NULL),(9600104,'$OLD_SERVER_IP','','0',NULL),(9600105,'$OLD_SERVER_IP','','0',NULL),(9600106,'$OLD_SERVER_IP','','0',NULL),(9600107,'$OLD_SERVER_IP','','0',NULL),(9600108,'$OLD_SERVER_IP','','0',NULL),(9600109,'$OLD_SERVER_IP','','0',NULL),(9600110,'$OLD_SERVER_IP','','0',NULL),(9600111,'$OLD_SERVER_IP','','0',NULL),(9600112,'$OLD_SERVER_IP','','0',NULL),(9600113,'$OLD_SERVER_IP','','0',NULL),(9600114,'$OLD_SERVER_IP','','0',NULL),(9600115,'$OLD_SERVER_IP','','0',NULL),(9600116,'$OLD_SERVER_IP','','0',NULL),(9600117,'$OLD_SERVER_IP','','0',NULL),(9600118,'$OLD_SERVER_IP','','0',NULL),(9600119,'$OLD_SERVER_IP','','0',NULL),(9600120,'$OLD_SERVER_IP','','0',NULL),(9600121,'$OLD_SERVER_IP','','0',NULL),(9600122,'$OLD_SERVER_IP','','0',NULL),(9600123,'$OLD_SERVER_IP','','0',NULL),(9600124,'$OLD_SERVER_IP','','0',NULL),(9600125,'$OLD_SERVER_IP','','0',NULL),(9600126,'$OLD_SERVER_IP','','0',NULL),(9600127,'$OLD_SERVER_IP','','0',NULL),(9600128,'$OLD_SERVER_IP','','0',NULL),(9600129,'$OLD_SERVER_IP','','0',NULL),(9600130,'$OLD_SERVER_IP','','0',NULL),(9600131,'$OLD_SERVER_IP','','0',NULL),(9600132,'$OLD_SERVER_IP','','0',NULL),(9600133,'$OLD_SERVER_IP','','0',NULL),(9600134,'$OLD_SERVER_IP','','0',NULL),(9600135,'$OLD_SERVER_IP','','0',NULL),(9600136,'$OLD_SERVER_IP','','0',NULL),(9600137,'$OLD_SERVER_IP','','0',NULL),(9600138,'$OLD_SERVER_IP','','0',NULL),(9600139,'$OLD_SERVER_IP','','0',NULL),(9600140,'$OLD_SERVER_IP','','0',NULL),(9600141,'$OLD_SERVER_IP','','0',NULL),(9600142,'$OLD_SERVER_IP','','0',NULL),(9600143,'$OLD_SERVER_IP','','0',NULL),(9600144,'$OLD_SERVER_IP','','0',NULL),(9600145,'$OLD_SERVER_IP','','0',NULL),(9600146,'$OLD_SERVER_IP','','0',NULL),(9600147,'$OLD_SERVER_IP','','0',NULL),(9600148,'$OLD_SERVER_IP','','0',NULL),(9600149,'$OLD_SERVER_IP','','0',NULL),(9600150,'$OLD_SERVER_IP','','0',NULL),(9600151,'$OLD_SERVER_IP','','0',NULL),(9600152,'$OLD_SERVER_IP','','0',NULL),(9600153,'$OLD_SERVER_IP','','0',NULL),(9600154,'$OLD_SERVER_IP','','0',NULL),(9600155,'$OLD_SERVER_IP','','0',NULL),(9600156,'$OLD_SERVER_IP','','0',NULL),(9600157,'$OLD_SERVER_IP','','0',NULL),(9600158,'$OLD_SERVER_IP','','0',NULL),(9600159,'$OLD_SERVER_IP','','0',NULL),(9600160,'$OLD_SERVER_IP','','0',NULL),(9600161,'$OLD_SERVER_IP','','0',NULL),(9600162,'$OLD_SERVER_IP','','0',NULL),(9600163,'$OLD_SERVER_IP','','0',NULL),(9600164,'$OLD_SERVER_IP','','0',NULL),(9600165,'$OLD_SERVER_IP','','0',NULL),(9600166,'$OLD_SERVER_IP','','0',NULL),(9600167,'$OLD_SERVER_IP','','0',NULL),(9600168,'$OLD_SERVER_IP','','0',NULL),(9600169,'$OLD_SERVER_IP','','0',NULL),(9600170,'$OLD_SERVER_IP','','0',NULL),(9600171,'$OLD_SERVER_IP','','0',NULL),(9600172,'$OLD_SERVER_IP','','0',NULL),(9600173,'$OLD_SERVER_IP','','0',NULL),(9600174,'$OLD_SERVER_IP','','0',NULL),(9600175,'$OLD_SERVER_IP','','0',NULL),(9600176,'$OLD_SERVER_IP','','0',NULL),(9600177,'$OLD_SERVER_IP','','0',NULL),(9600178,'$OLD_SERVER_IP','','0',NULL),(9600179,'$OLD_SERVER_IP','','0',NULL),(9600180,'$OLD_SERVER_IP','','0',NULL),(9600181,'$OLD_SERVER_IP','','0',NULL),(9600182,'$OLD_SERVER_IP','','0',NULL),(9600183,'$OLD_SERVER_IP','','0',NULL),(9600184,'$OLD_SERVER_IP','','0',NULL),(9600185,'$OLD_SERVER_IP','','0',NULL),(9600186,'$OLD_SERVER_IP','','0',NULL),(9600187,'$OLD_SERVER_IP','','0',NULL),(9600188,'$OLD_SERVER_IP','','0',NULL),(9600189,'$OLD_SERVER_IP','','0',NULL),(9600190,'$OLD_SERVER_IP','','0',NULL),(9600191,'$OLD_SERVER_IP','','0',NULL),(9600192,'$OLD_SERVER_IP','','0',NULL),(9600193,'$OLD_SERVER_IP','','0',NULL),(9600194,'$OLD_SERVER_IP','','0',NULL),(9600195,'$OLD_SERVER_IP','','0',NULL),(9600196,'$OLD_SERVER_IP','','0',NULL),(9600197,'$OLD_SERVER_IP','','0',NULL),(9600198,'$OLD_SERVER_IP','','0',NULL),(9600199,'$OLD_SERVER_IP','','0',NULL),(9600200,'$OLD_SERVER_IP','','0',NULL),(9600201,'$OLD_SERVER_IP','','0',NULL),(9600202,'$OLD_SERVER_IP','','0',NULL),(9600203,'$OLD_SERVER_IP','','0',NULL),(9600204,'$OLD_SERVER_IP','','0',NULL),(9600205,'$OLD_SERVER_IP','','0',NULL),(9600206,'$OLD_SERVER_IP','','0',NULL),(9600207,'$OLD_SERVER_IP','','0',NULL),(9600208,'$OLD_SERVER_IP','','0',NULL),(9600209,'$OLD_SERVER_IP','','0',NULL),(9600210,'$OLD_SERVER_IP','','0',NULL),(9600211,'$OLD_SERVER_IP','','0',NULL),(9600212,'$OLD_SERVER_IP','','0',NULL),(9600213,'$OLD_SERVER_IP','','0',NULL),(9600214,'$OLD_SERVER_IP','','0',NULL),(9600215,'$OLD_SERVER_IP','','0',NULL),(9600216,'$OLD_SERVER_IP','','0',NULL),(9600217,'$OLD_SERVER_IP','','0',NULL),(9600218,'$OLD_SERVER_IP','','0',NULL),(9600219,'$OLD_SERVER_IP','','0',NULL),(9600220,'$OLD_SERVER_IP','','0',NULL),(9600221,'$OLD_SERVER_IP','','0',NULL),(9600222,'$OLD_SERVER_IP','','0',NULL),(9600223,'$OLD_SERVER_IP','','0',NULL),(9600224,'$OLD_SERVER_IP','','0',NULL),(9600225,'$OLD_SERVER_IP','','0',NULL),(9600226,'$OLD_SERVER_IP','','0',NULL),(9600227,'$OLD_SERVER_IP','','0',NULL),(9600228,'$OLD_SERVER_IP','','0',NULL),(9600229,'$OLD_SERVER_IP','','0',NULL),(9600230,'$OLD_SERVER_IP','','0',NULL),(9600231,'$OLD_SERVER_IP','','0',NULL),(9600232,'$OLD_SERVER_IP','','0',NULL),(9600233,'$OLD_SERVER_IP','','0',NULL),(9600234,'$OLD_SERVER_IP','','0',NULL),(9600235,'$OLD_SERVER_IP','','0',NULL),(9600236,'$OLD_SERVER_IP','','0',NULL),(9600237,'$OLD_SERVER_IP','','0',NULL),(9600238,'$OLD_SERVER_IP','','0',NULL),(9600239,'$OLD_SERVER_IP','','0',NULL),(9600240,'$OLD_SERVER_IP','','0',NULL),(9600241,'$OLD_SERVER_IP','','0',NULL),(9600242,'$OLD_SERVER_IP','','0',NULL),(9600243,'$OLD_SERVER_IP','','0',NULL),(9600244,'$OLD_SERVER_IP','','0',NULL),(9600245,'$OLD_SERVER_IP','','0',NULL),(9600246,'$OLD_SERVER_IP','','0',NULL),(9600247,'$OLD_SERVER_IP','','0',NULL),(9600248,'$OLD_SERVER_IP','','0',NULL),(9600249,'$OLD_SERVER_IP','','0',NULL),(9600250,'$OLD_SERVER_IP','','0',NULL),(9600251,'$OLD_SERVER_IP','','0',NULL),(9600252,'$OLD_SERVER_IP','','0',NULL),(9600253,'$OLD_SERVER_IP','','0',NULL),(9600254,'$OLD_SERVER_IP','','0',NULL),(9600255,'$OLD_SERVER_IP','','0',NULL),(9600256,'$OLD_SERVER_IP','','0',NULL),(9600257,'$OLD_SERVER_IP','','0',NULL),(9600258,'$OLD_SERVER_IP','','0',NULL),(9600259,'$OLD_SERVER_IP','','0',NULL),(9600260,'$OLD_SERVER_IP','','0',NULL),(9600261,'$OLD_SERVER_IP','','0',NULL),(9600262,'$OLD_SERVER_IP','','0',NULL),(9600263,'$OLD_SERVER_IP','','0',NULL),(9600264,'$OLD_SERVER_IP','','0',NULL),(9600265,'$OLD_SERVER_IP','','0',NULL),(9600266,'$OLD_SERVER_IP','','0',NULL),(9600267,'$OLD_SERVER_IP','','0',NULL),(9600268,'$OLD_SERVER_IP','','0',NULL),(9600269,'$OLD_SERVER_IP','','0',NULL),(9600270,'$OLD_SERVER_IP','','0',NULL),(9600271,'$OLD_SERVER_IP','','0',NULL),(9600272,'$OLD_SERVER_IP','','0',NULL),(9600273,'$OLD_SERVER_IP','','0',NULL),(9600274,'$OLD_SERVER_IP','','0',NULL),(9600275,'$OLD_SERVER_IP','','0',NULL),(9600276,'$OLD_SERVER_IP','','0',NULL),(9600277,'$OLD_SERVER_IP','','0',NULL),(9600278,'$OLD_SERVER_IP','','0',NULL),(9600279,'$OLD_SERVER_IP','','0',NULL),(9600280,'$OLD_SERVER_IP','','0',NULL),(9600281,'$OLD_SERVER_IP','','0',NULL),(9600282,'$OLD_SERVER_IP','','0',NULL),(9600283,'$OLD_SERVER_IP','','0',NULL),(9600284,'$OLD_SERVER_IP','','0',NULL),(9600285,'$OLD_SERVER_IP','','0',NULL),(9600286,'$OLD_SERVER_IP','','0',NULL),(9600287,'$OLD_SERVER_IP','','0',NULL),(9600288,'$OLD_SERVER_IP','','0',NULL),(9600289,'$OLD_SERVER_IP','','0',NULL),(9600290,'$OLD_SERVER_IP','','0',NULL),(9600291,'$OLD_SERVER_IP','','0',NULL),(9600292,'$OLD_SERVER_IP','','0',NULL),(9600293,'$OLD_SERVER_IP','','0',NULL),(9600294,'$OLD_SERVER_IP','','0',NULL),(9600295,'$OLD_SERVER_IP','','0',NULL),(9600296,'$OLD_SERVER_IP','','0',NULL),(9600297,'$OLD_SERVER_IP','','0',NULL),(9600298,'$OLD_SERVER_IP','','0',NULL),(9600299,'$OLD_SERVER_IP','','0',NULL);"



echo "Populate AREA CODES"
/usr/share/astguiclient/ADMIN_area_code_populate.pl
echo "Replacing default VICIdial IP $OLD_SERVER_IP with current server IP $ip_address"

/usr/share/astguiclient/ADMIN_update_server_ip.pl --old-server_ip=$OLD_SERVER_IP --server_ip=$ip_address --auto


perl install.pl --no-prompt

install_audio_store_directory_helper

#Install Crontab
cat <<CRONTAB>> /root/crontab-file

### VICIDIAL audio-store web directory helper
* * * * * /usr/local/bin/vicidial-audio-store-dir >/dev/null 2>&1

###Audio Sync hourly
* 1 * * * /usr/share/astguiclient/ADMIN_audio_store_sync.pl --upload --quiet

### Daily Backups ###
0 2 * * * /usr/share/astguiclient/ADMIN_backup.pl

###certbot renew
@weekly $SCRIPT_DIR/certbot.sh

### recording mixing/compressing/ftping scripts
#0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48,51,54,57 * * * * /usr/share/astguiclient/AST_CRON_audio_1_move_mix.pl
0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48,51,54,57 * * * * /usr/share/astguiclient/AST_CRON_audio_1_move_mix.pl --MIX
0,3,6,9,12,15,18,21,24,27,30,33,36,39,42,45,48,51,54,57 * * * * /usr/share/astguiclient/AST_CRON_audio_1_move_VDonly.pl
1,4,7,10,13,16,19,22,25,28,31,34,37,40,43,46,49,52,55,58 * * * * /usr/share/astguiclient/AST_CRON_audio_2_compress.pl --MP3 --HTTPS
#2,5,8,11,14,17,20,23,26,29,32,35,38,41,44,47,50,53,56,59 * * * * /usr/share/astguiclient/AST_CRON_audio_3_ftp.pl --MP3 --nodatedir --ftp-validate

### keepalive script for astguiclient processes
* * * * * /usr/share/astguiclient/ADMIN_keepalive_ALL.pl --cu3way

### kill Hangup script for Asterisk updaters
* * * * * /usr/share/astguiclient/AST_manager_kill_hung_congested.pl

### updater for voicemail
* * * * * /usr/share/astguiclient/AST_vm_update.pl

### updater for conference validator
* * * * * /usr/share/astguiclient/AST_conf_update.pl --no-vc-3way-check

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

### reset several temporary-info tables in the database
2 1 * * * /usr/share/astguiclient/AST_reset_mysql_vars.pl

### optimize the database tables within the asterisk database
3 1 * * * /usr/share/astguiclient/AST_DB_optimize.pl

## adjust time on the server with ntp
#30 * * * * /usr/sbin/ntpdate -u pool.ntp.org 2>/dev/null 1>&amp;2

### VICIDIAL agent time log weekly and daily summary report generation
2 0 * * 0 /usr/share/astguiclient/AST_agent_week.pl
22 0 * * * /usr/share/astguiclient/AST_agent_day.pl

### VICIDIAL campaign export scripts (OPTIONAL)
#32 0 * * * /usr/share/astguiclient/AST_VDsales_export.pl
#42 0 * * * /usr/share/astguiclient/AST_sourceID_summary_export.pl

### remove old recordings
#24 0 * * * /usr/bin/find /var/spool/asterisk/monitorDONE -maxdepth 2 -type f -mtime +7 -print | xargs rm -f
#26 1 * * * /usr/bin/find /var/spool/asterisk/monitorDONE/MP3 -maxdepth 2 -type f -mtime +65 -print | xargs rm -f
#25 1 * * * /usr/bin/find /var/spool/asterisk/monitorDONE/FTP -maxdepth 2 -type f -mtime +1 -print | xargs rm -f
24 1 * * * /usr/bin/find /var/spool/asterisk/monitorDONE/ORIG -maxdepth 2 -type f -mtime +1 -print | xargs rm -f


### roll logs monthly on high-volume dialing systems
30 1 1 * * /usr/share/astguiclient/ADMIN_archive_log_tables.pl --DAYS=45

### remove old vicidial logs and asterisk logs more than 2 days old
28 0 * * * /usr/bin/find /var/log/astguiclient -maxdepth 1 -type f -mtime +2 -print | xargs rm -f
29 0 * * * /usr/bin/find /var/log/asterisk -maxdepth 3 -type f -mtime +2 -print | xargs rm -f
30 0 * * * /usr/bin/find / -maxdepth 1 -name "screenlog.0*" -mtime +4 -print | xargs rm -f

### cleanup of the scheduled callback records
25 0 * * * /usr/share/astguiclient/AST_DB_dead_cb_purge.pl --purge-non-cb -q

### GMT adjust script - uncomment to enable
#45 0 * * * /usr/share/astguiclient/ADMIN_adjust_GMTnow_on_leads.pl --list-settings

### Dialer Inventory Report
1 7 * * * /usr/share/astguiclient/AST_dialer_inventory_snapshot.pl -q --override-24hours

### inbound email parser
* * * * * /usr/share/astguiclient/AST_inbound_email_parser.pl

### Daily Reboot
#30 6 * * * /sbin/reboot

######TILTIX GARBAGE FILES DELETE
#00 22 * * * root cd /tmp/ && find . -name '*TILTXtmp*' -type f -delete

### Dynportal
@reboot /usr/bin/VB-firewall --whitelist=ViciWhite --dynamic --quiet
* * * * * /usr/bin/VB-firewall --whitelist=ViciWhite --dynamic --quiet
* * * * * sleep 10; /usr/bin/VB-firewall --white --dynamic --quiet
* * * * * sleep 20; /usr/bin/VB-firewall --white --dynamic --quiet
* * * * * sleep 30; /usr/bin/VB-firewall --white --dynamic --quiet
* * * * * sleep 40; /usr/bin/VB-firewall --white --dynamic --quiet
* * * * * sleep 50; /usr/bin/VB-firewall --white --dynamic --quiet

### url log delete
30 23 * * * /usr/share/astguiclient/ADMIN_archive_log_tables.pl --url-log-only --url-log-days=30

CRONTAB

crontab /root/crontab-file
crontab -l

#Install rc.local

cat > /etc/rc.d/rc.local <<EOF
#!/bin/bash


# OPTIONAL enable ip_relay(for same-machine trunking and blind monitoring)

/usr/share/astguiclient/ip_relay/relay_control start 2>/dev/null 1>&2


# Disable console blanking and powersaving

/usr/bin/setterm -blank

/usr/bin/setterm -powersave off

/usr/bin/setterm -powerdown


### start up the MySQL server

systemctl start mariadb.service


### start up the apache web server

systemctl start httpd.service


### roll the Asterisk logs upon reboot

/usr/share/astguiclient/ADMIN_restart_roll_logs.pl


### clear the server-related records from the database

/usr/share/astguiclient/AST_reset_mysql_vars.pl


### load dahdi drivers

modprobe dahdi
modprobe dahdi_dummy || true

/usr/sbin/dahdi_cfg -vvvvvvvvvvvvv


### sleep for 20 seconds before launching Asterisk

sleep 20


### start up asterisk

/usr/share/astguiclient/start_asterisk_boot.pl

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


## mv -f /root/defaults.inc.php /var/www/vhosts/dynportal/inc/defaults.inc.php
## mv -f /home/viciportal-ssl.conf /etc/httpd/conf.d/viciportal-ssl.conf

firewall-offline-cmd --add-port=446/tcp --zone=public

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

dnf -y install sox

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

##fstab entry
#tee -a /etc/fstab <<EOF
#none /var/spool/asterisk/monitor tmpfs nodev,nosuid,noexec,nodiratime,size=2G 0 0
#EOF

## FTP fix
##tee -a /etc/ssh/sshd_config << EOF
#Subsystem      sftp    /usr/libexec/openssh/sftp-server
##Subsystem sftp internal-sftp
##EOF

##confbridge fix
cd "$SCRIPT_DIR"
yes | cp -rf "$SCRIPT_DIR/extensions.conf" /etc/asterisk/extensions.conf
cp -f "$SCRIPT_DIR/confbridge-vicidial.conf" /etc/asterisk/

sed -i '/^#include confbridge-vicidial.conf$/d' /etc/asterisk/confbridge.conf 2>/dev/null || true
replace_managed_block /etc/asterisk/confbridge.conf GENX_VICIDIAL_CONFBRIDGE <<EOF
# BEGIN GENX_VICIDIAL_CONFBRIDGE

#include confbridge-vicidial.conf
# END GENX_VICIDIAL_CONFBRIDGE
EOF

systemctl daemon-reload
systemctl enable rc-local.service
systemctl start rc-local.service

cat <<WELCOME > /var/www/html/index.html
<META HTTP-EQUIV=REFRESH CONTENT="1; URL=/vicidial/welcome.php">
Please Hold while I redirect you!
WELCOME
fix_vicidial_web_permissions

#cd "$SCRIPT_DIR"
#chmod +x confbridges.sh
#./confbridges.sh


chkconfig --list asterisk >/dev/null 2>&1 && chkconfig asterisk off || true

## add confcron user
sed -i '/^\[confcron\]$/,/^eventfilter=Event: Confbridge$/d' /etc/asterisk/manager.conf 2>/dev/null || true
replace_managed_block /etc/asterisk/manager.conf GENX_VICIDIAL_CONFCRON <<EOF
# BEGIN GENX_VICIDIAL_CONFCRON

[confcron]
secret = $CRON_DB_PASS
read = command,reporting
write = command,reporting

eventfilter=Event: Meetme
eventfilter=Event: Confbridge
# END GENX_VICIDIAL_CONFCRON
EOF

install_certbot_required
if systemctl list-unit-files certbot-renew.timer >/dev/null 2>&1; then
    systemctl enable certbot-renew.timer
    systemctl start certbot-renew.timer
else
    echo "certbot-renew.timer not found; weekly certbot.sh cron entry will handle renewals if certbot is installed."
fi
cd "$SCRIPT_DIR"
chmod +x vicidial-enable-webrtc.sh
systemctl enable firewalld
systemctl start firewalld
DOMAINNAME="$DOMAINNAME" MYSQL_ROOT_PASS="$MYSQL_ROOT_PASS" CERTBOT_STAGING="$CERTBOT_STAGING" ./vicidial-enable-webrtc.sh || exit 1
configure_dynportal_defaults
apply_vicidial_database_defaults "$ip_address" "$DOMAINNAME"

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

chmod +x "$SCRIPT_DIR/certbot.sh"

chmod -R 777 /var/spool/asterisk/
chown -R apache:apache /var/spool/asterisk/

## mv "$SCRIPT_DIR/viciportal-ssl.conf" /home/viciportal-ssl.conf
## sed -i s/DOMAINNAME/"$DOMAINNAME"/g /var/www/vhosts/dynportal/inc/defaults.inc.php
## sed -i s/DOMAINNAME/"$DOMAINNAME"/g /home/viciportal-ssl.conf

"${MYSQL[@]}" -e "use asterisk; update system_settings set active_voicemail_server='$ip_address', webphone_url='https://phone.viciphone.com/viciphone.php', sounds_web_server='https://$hostname';"
configure_audio_store_directory

if [[ "$REBOOT_AFTER_INSTALL" =~ ^[Yy] ]]; then
    echo "Restarting AlmaLinux"
    reboot
else
    echo "Install complete. Reboot skipped because REBOOT_AFTER_INSTALL=$REBOOT_AFTER_INSTALL"
fi
