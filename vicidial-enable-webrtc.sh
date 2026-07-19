#!/bin/bash

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ASSET_DIR="$SCRIPT_DIR/assets"

copy_asset() {
	local asset_name=$1
	local destination=${2:-$asset_name}
	if [ ! -f "$ASSET_DIR/$asset_name" ]; then
		echo "ERROR: Missing installer asset: $ASSET_DIR/$asset_name"
		exit 1
	fi
	cp -f "$ASSET_DIR/$asset_name" "$destination"
}

install_certbot_required() {
	if command -v certbot >/dev/null 2>&1; then
		certbot --version
		return 0
	fi

	if [ -f /etc/redhat-release ]; then
		if dnf -y --nobest install certbot python3-certbot-apache mod_ssl; then
			certbot --version
			return 0
		fi

		echo "DNF certbot install failed. Trying isolated Python venv fallback."
		dnf install -y python3 python3-pip python3-devel augeas-libs augeas-devel gcc openssl-devel libffi-devel mod_ssl
		if [ ! -d "$ASSET_DIR/python-wheels" ]; then
			echo "ERROR: Missing Certbot wheelhouse: $ASSET_DIR/python-wheels"
			exit 1
		fi
		python3 -m venv /opt/certbot
		/opt/certbot/bin/pip install --no-index --find-links "$ASSET_DIR/python-wheels" --upgrade pip wheel setuptools packaging
		/opt/certbot/bin/pip install --no-index --find-links "$ASSET_DIR/python-wheels" certbot==5.6.0 certbot-apache==5.6.0
		ln -sf /opt/certbot/bin/certbot /usr/local/bin/certbot
	fi

	if ! command -v certbot >/dev/null 2>&1; then
		echo "ERROR: certbot did not install. Resolve the repository/dependency issue before continuing."
		exit 1
	fi

	certbot --version
}

if [ -f /etc/redhat-release ]; then
	install_certbot_required
fi
if [ -f /etc/lsb-release ]; then
	sudo add-apt-repository ppa:certbot/certbot
	sudo apt install python-certbot-apache
fi

if [ -z "${DOMAINNAME:-}" ]; then
	echo "Enter the DOMAIN NAME HERE. ***********IF YOU DONT HAVE ONE PLEASE DONT CONTINUE: "
	read DOMAINNAME
fi
if [ -z "$DOMAINNAME" ]; then
	echo "No domain entered. Exiting WebRTC/SSL setup."
	exit 1
fi

if ! command -v certbot >/dev/null 2>&1; then
	echo "ERROR: certbot is not installed. Resolve the repository/dependency issue before continuing."
	exit 1
fi

VICIDIAL_DB_NAME="${VICIDIAL_DB_NAME:-asterisk}"
CLUSTER_JOIN="${CLUSTER_JOIN:-no}"
if [ "$CLUSTER_JOIN" = "yes" ]; then
	# Joining an existing cluster: talk to the remote cluster DB as cron.
	MYSQL=(mysql -h "${VICIDIAL_DB_HOST:-127.0.0.1}" -P "${VICIDIAL_DB_PORT:-3306}" -u "${CLUSTER_DB_USER:-cron}" -p"${CRON_DB_PASS:-1234}")
elif [ -z "${MYSQL_ROOT_PASS:-}" ]; then
	MYSQL=(mysql -u root)
else
	MYSQL=(mysql -u root -p"$MYSQL_ROOT_PASS")
fi

# When SERVER_SCOPE_IP is set, only this server's row is updated instead of every server in the cluster.
SERVER_SCOPE=""
if [ -n "${SERVER_SCOPE_IP:-}" ]; then
	SERVER_SCOPE=" where server_ip='${SERVER_SCOPE_IP}'"
fi

copy_asset DOMAINNAME.conf "/etc/httpd/conf.d/$DOMAINNAME.conf"
sed -i s/DOMAINNAME/"$DOMAINNAME"/g /etc/httpd/conf.d/$DOMAINNAME.conf

CERTBOT_STAGING="${CERTBOT_STAGING:-no}"
CERTBOT_ARGS=(--apache -d "$DOMAINNAME" --non-interactive --agree-tos --register-unsafely-without-email)
if [[ "$CERTBOT_STAGING" =~ ^[Yy] ]]; then
	CERTBOT_ARGS+=(--staging)
	echo "Using Let's Encrypt staging environment for this certificate request."
fi

echo "Requesting Let's Encrypt certificate for $DOMAINNAME with no-email registration"
FIREWALLD_WAS_ACTIVE=no
VICIPORTAL_SSL_CONF=/etc/httpd/conf.d/viciportal-ssl.conf
VICIPORTAL_SSL_DISABLED=/etc/httpd/conf.d/viciportal-ssl.conf.certbot-disabled

restore_certbot_window() {
	if [ -f "$VICIPORTAL_SSL_DISABLED" ]; then
		mv -f "$VICIPORTAL_SSL_DISABLED" "$VICIPORTAL_SSL_CONF"
	fi
	if [ "$FIREWALLD_WAS_ACTIVE" = "yes" ]; then
		systemctl start firewalld || true
	fi
}

trap restore_certbot_window EXIT

if systemctl is-active --quiet firewalld; then
	FIREWALLD_WAS_ACTIVE=yes
	systemctl stop firewalld
fi

if [ -f "$VICIPORTAL_SSL_CONF" ]; then
	mv -f "$VICIPORTAL_SSL_CONF" "$VICIPORTAL_SSL_DISABLED"
fi

if ! certbot "${CERTBOT_ARGS[@]}"; then
	rm -f "/etc/httpd/conf.d/$DOMAINNAME.conf"
	echo "ERROR: Let's Encrypt certificate request failed for $DOMAINNAME."
	exit 1
fi

restore_certbot_window
trap - EXIT

if [ ! -s "/etc/letsencrypt/live/$DOMAINNAME/fullchain.pem" ] || [ ! -s "/etc/letsencrypt/live/$DOMAINNAME/privkey.pem" ]; then
	echo "ERROR: Let's Encrypt certificate files are missing for $DOMAINNAME."
	exit 1
fi

# Standardized cert path: /etc/vicidial-ssl points at this server's own cert, so
# shared cluster templates (WEBRTC, SIP_generic) reference the same path on every server.
mkdir -p /etc/vicidial-ssl
ln -sfn "/etc/letsencrypt/live/$DOMAINNAME/cert.pem" /etc/vicidial-ssl/cert.pem
ln -sfn "/etc/letsencrypt/live/$DOMAINNAME/privkey.pem" /etc/vicidial-ssl/privkey.pem
ln -sfn "/etc/letsencrypt/live/$DOMAINNAME/fullchain.pem" /etc/vicidial-ssl/fullchain.pem
ln -sfn "/etc/letsencrypt/live/$DOMAINNAME/chain.pem" /etc/vicidial-ssl/chain.pem

if [ "${ROLE_TELEPHONY:-yes}" = "yes" ] && [ -d /etc/asterisk ]; then
	echo "Change http.conf in Asterisk"
	copy_asset asterisk-http.conf /etc/asterisk/http.conf
	sed -i s/DOMAINNAME/"$DOMAINNAME"/g /etc/asterisk/http.conf

	echo "Change sip.conf in Asterisk"
	copy_asset asterisk-sip.conf /etc/asterisk/sip.conf
	sed -i s/DOMAINNAME/"$DOMAINNAME"/g /etc/asterisk/sip.conf

	echo "Reloading Asterisk"
	rasterisk -x reload
else
	echo "Skipping Asterisk http/sip WebRTC config (no telephony role on this server)."
fi

if [ "${ROLE_TELEPHONY:-yes}" = "yes" ]; then
	echo "Add DOMAINAME servers web_socket_url"
	"${MYSQL[@]}" -e "use $VICIDIAL_DB_NAME; update servers set web_socket_url='wss://$DOMAINNAME:8089/ws'$SERVER_SCOPE;"
fi

if [ "$CLUSTER_JOIN" = "yes" ]; then
	echo "Cluster join: skipping cluster-wide webphone_url/SIP_generic/phones updates (managed by the primary install)."
fi

if [ "$CLUSTER_JOIN" != "yes" ]; then

echo "Add DOMAINAME system_settings webphone_url"
"${MYSQL[@]}" -e "use $VICIDIAL_DB_NAME; update system_settings set webphone_url='https://phone.viciphone.com/viciphone.php';"

echo "update the SIP_generic"
"${MYSQL[@]}" -e "use $VICIDIAL_DB_NAME; update vicidial_conf_templates set template_contents='type=friend
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
allow=opus,ulaw,vp8,h264
nat=force_rport,comedia
directmedia=no
dtlsenable=yes
dtlsverify=no
dtlscertfile=/etc/vicidial-ssl/cert.pem
dtlsprivatekey=/etc/vicidial-ssl/privkey.pem
dtlssetup=actpass' where template_id='SIP_generic';"

echo "update the Phone tables to set is_webphone to Y deffault"
"${MYSQL[@]}" -e "use $VICIDIAL_DB_NAME; ALTER TABLE phones MODIFY COLUMN is_webphone ENUM('Y','N','Y_API_LAUNCH') default 'Y';"

fi # CLUSTER_JOIN cluster-wide updates

if [ ! -f "$SCRIPT_DIR/viciportal-ssl.conf" ]; then
	echo "ERROR: Missing $SCRIPT_DIR/viciportal-ssl.conf"
	exit 1
fi
cp -f "$SCRIPT_DIR/viciportal-ssl.conf" /home/viciportal-ssl.conf
sed -i s/DOMAINNAME/"$DOMAINNAME"/g /var/www/vhosts/dynportal/inc/defaults.inc.php
sed -i s/DOMAINNAME/"$DOMAINNAME"/g /home/viciportal-ssl.conf
mv -f /home/viciportal-ssl.conf /etc/httpd/conf.d/viciportal-ssl.conf


#Update the 6666 user permissions
#echo "VICIDIAL 6666 PASSWORD"
#read 6666pass
#mysql -e "use asterisk; UPDATE `vicidial_users` VALUES (1,'6666','$6666pass','Admin',9,'ADMIN','','','1','1','1','1','1','1','1','1','1','1','1','1','0','1','1','','1','0','0','1','1','1','1','0','1','1','1','1','1','1','1','1','1','1','1','1','DISABLED','NOT_ACTIVE','0',1,'0','0','0','1','1','1','NOT_ACTIVE','0','1','1','Y','0','1','DISABLED','1','0','1','1','','','','0','0','','','','','','','DISABLED','1','1','0','0','N','NOT_ACTIVE','1','1','1','1','1','1','1','1','1','NOT_ACTIVE','1','1','0','0','0','0',0,'2021-10-16 10:21:11','112.205.228.217','','1',0,'1',-1,'0','default English','0','0','0',' ALL_FUNCTIONS ','NONE','0','0','0','0','1','',-1,'0','0','0','0',-1,'0','1',0,0,'DISABLED','DISABLED','NOT_ACTIVE','','0','','',-1,'','','NOT_ACTIVE','DISABLED'),(2,'VDAD','donotedit','Outbound Auto Dial',1,'ADMIN',NULL,NULL,'0','0','0','0','0','0','0','0','0','0','0','0','0','0','1',NULL,'1','0','0','1','1','0','0','0','0','0','0','0','0','0','0','0','0','0','0','0','DISABLED','NOT_ACTIVE','0',1,'0','0','0','0','0','0','NOT_ACTIVE','0','0','0','N','0','0','DISABLED','0','0','0','0','','','','0','1','','','','','',NULL,'DISABLED','0','1','0','0','N','NOT_ACTIVE','0','0','0','0','0','0','0','0','0','NOT_ACTIVE','0','1','0','0','0','0',0,'2001-01-01 00:00:01','','','1',0,'0',-1,'0','default English','0','0','0',' ALL_FUNCTIONS ','NONE','0','0','0','0','0','',-1,'0','0','0','0',-1,'0','0',0,0,'DISABLED','DISABLED','NOT_ACTIVE',NULL,'0',NULL,NULL,-1,'','','NOT_ACTIVE','DISABLED'),(3,'VDCL','donotedit','Inbound No Agent',1,'ADMIN',NULL,NULL,'0','0','0','0','0','0','0','0','0','0','0','0','0','0','1',NULL,'1','0','0','1','1','0','0','0','0','0','0','0','0','0','0','0','0','0','0','0','DISABLED','NOT_ACTIVE','0',1,'0','0','0','0','0','0','NOT_ACTIVE','0','0','0','N','0','0','DISABLED','0','0','0','0','','','','0','1','','','','','',NULL,'DISABLED','0','1','0','0','N','NOT_ACTIVE','0','0','0','0','0','0','0','0','0','NOT_ACTIVE','0','1','0','0','0','0',0,'2001-01-01 00:00:01','','','1',0,'0',-1,'0','default English','0','0','0',' ALL_FUNCTIONS ','NONE','0','0','0','0','0','',-1,'0','0','0','0',-1,'0','0',0,0,'DISABLED','DISABLED','NOT_ACTIVE',NULL,'0',NULL,NULL,-1,'','','NOT_ACTIVE','DISABLED');"
