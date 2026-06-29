#!/bin/bash

mv /etc/httpd/conf.d/viciportal-ssl.conf /etc/httpd/conf.d/viciportal-ssl.conf.
systemctl stop firewalld
certbot renew
systemctl restart firewalld
mv /etc/httpd/conf.d/viciportal-ssl.conf. /etc/httpd/conf.d/viciportal-ssl.conf
domain=$(basename /etc/letsencrypt/renewal/*.conf | sed 's/\.conf$//')
systemctl reload httpd
/usr/sbin/asterisk -rx "reload"
