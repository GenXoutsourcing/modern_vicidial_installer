#!/bin/bash

set -e

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

certbot renew

restore_certbot_window
trap - EXIT
systemctl reload httpd
/usr/sbin/asterisk -rx "reload"
