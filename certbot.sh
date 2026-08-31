#!/bin/bash

set -e

ACME_PORT_OPENED=no
VICIPORTAL_SSL_CONF=/etc/httpd/conf.d/viciportal-ssl.conf
VICIPORTAL_SSL_DISABLED=/etc/httpd/conf.d/viciportal-ssl.conf.certbot-disabled

restore_certbot_window() {
    if [ -f "$VICIPORTAL_SSL_DISABLED" ]; then
        mv -f "$VICIPORTAL_SSL_DISABLED" "$VICIPORTAL_SSL_CONF"
    fi
    if [ "$ACME_PORT_OPENED" = "yes" ]; then
        firewall-cmd --remove-port=80/tcp >/dev/null 2>&1 || true
    fi
}

trap restore_certbot_window EXIT

# Let the ACME HTTP-01 challenge reach Apache on :80 for the few seconds the
# validation takes, instead of stopping firewalld and leaving the box with NO
# firewall at all for the whole renewal (the old behavior).
#
# RUNTIME ONLY - deliberately no --permanent, so a reboot, a firewalld reload,
# or a crash before the trap runs all fail CLOSED. VB-firewall --dynamic only
# add/removes ipset entries and never reloads firewalld, so this runtime rule
# survives its every-minute runs.
#
# If :80 is already open by policy, leave it alone and do not close it after.
if systemctl is-active --quiet firewalld; then
    if ! firewall-cmd --query-port=80/tcp >/dev/null 2>&1; then
        if firewall-cmd --add-port=80/tcp >/dev/null 2>&1; then
            ACME_PORT_OPENED=yes
        fi
    fi
fi

if [ -f "$VICIPORTAL_SSL_CONF" ]; then
    mv -f "$VICIPORTAL_SSL_CONF" "$VICIPORTAL_SSL_DISABLED"
fi

certbot renew

restore_certbot_window
trap - EXIT
systemctl reload httpd || true
/usr/sbin/asterisk -rx "reload" || true
