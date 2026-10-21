#!/bin/bash
# stage + apply the web capacity change (same as agent1 20261021-165434) on this host
set -e
H=$(hostname -s)
TS=$(date +%Y%m%d-%H%M%S); D=/root/premig/webcap-$TS; mkdir -p $D
grep -q "^pm.max_children = 150$" /etc/php-fpm.d/www.conf || { echo "ABORT: max_children not 150 on $H"; exit 1; }
grep -q "^pm.max_spare_servers = 60$" /etc/php-fpm.d/www.conf || { echo "ABORT: max_spare not 60 on $H"; exit 1; }
[ ! -e /etc/httpd/conf.d/zz-genx-mpm.conf ] || { echo "ABORT: mpm file exists on $H"; exit 1; }
cp -p /etc/php-fpm.d/www.conf $D/www.conf-BEFORE
cp -p /etc/httpd/conf.modules.d/00-mpm.conf $D/00-mpm.conf-BEFORE
sed -e "s/^pm.max_children = 150/pm.max_children = 250/" -e "s/^pm.max_spare_servers = 60/pm.max_spare_servers = 80/" /etc/php-fpm.d/www.conf > $D/www.conf-STAGED
cat > $D/zz-genx-mpm.conf-STAGED <<EOC
# GENX $TS: web-tier headroom for 100 agents/host. event MPM defaults were ServerLimit 16 x ThreadsPerChild 25 = 400.
# ThreadsPerChild kept <= ThreadLimit (64) and ServerLimit untouched so a graceful reload applies it, no full restart.
<IfModule mpm_event_module>
    ThreadsPerChild      64
    MaxRequestWorkers    1024
</IfModule>
EOC
sed "s#include=/etc/php-fpm.d/\*.conf#include=$D/www.conf-STAGED#" /etc/php-fpm.conf > $D/php-fpm.conf-TEST
php-fpm -t -y $D/php-fpm.conf-TEST 2>&1 | grep -q "test is successful" || { echo "ABORT: fpm staged test failed"; exit 1; }
cp $D/zz-genx-mpm.conf-STAGED /etc/httpd/conf.d/zz-genx-mpm.conf.staged-test
sed "s#^IncludeOptional conf.d/\*.conf#IncludeOptional conf.d/*.conf\nInclude conf.d/zz-genx-mpm.conf.staged-test#" /etc/httpd/conf/httpd.conf > $D/httpd.conf-TEST
httpd -t -f $D/httpd.conf-TEST 2>&1 | grep -q "Syntax OK" || { rm -f /etc/httpd/conf.d/zz-genx-mpm.conf.staged-test; echo "ABORT: httpd staged test failed"; exit 1; }
rm -f /etc/httpd/conf.d/zz-genx-mpm.conf.staged-test
cat > $D/ROLLBACK-webcap.sh <<EOC
#!/bin/bash
set -e
cp -p $D/www.conf-BEFORE /etc/php-fpm.d/www.conf
rm -f /etc/httpd/conf.d/zz-genx-mpm.conf
php-fpm -t 2>&1 | tail -1; httpd -t 2>&1 | tail -1
systemctl reload php-fpm; systemctl reload httpd
echo "ROLLED BACK \$(date)"
EOC
chmod +x $D/ROLLBACK-webcap.sh
echo "$H staged in $D; applying $(date +%H:%M:%S)"
cp $D/www.conf-STAGED /etc/php-fpm.d/www.conf
cp $D/zz-genx-mpm.conf-STAGED /etc/httpd/conf.d/zz-genx-mpm.conf
php-fpm -t 2>&1 | grep -q successful; httpd -t 2>&1 | grep -q "Syntax OK"
systemctl reload php-fpm; systemctl reload httpd
sleep 4
echo "$H APPLIED $(date +%H:%M:%S) max_children=$(grep ^pm.max_children /etc/php-fpm.d/www.conf | awk -F= '{print $2}') fpm=$(pgrep -fc 'php-fpm: pool') httpd_thr=$(ps -eLf | grep -c '[h]ttpd') svc=$(systemctl is-active httpd php-fpm | tr '\n' '/') local_https=$(curl -sk -o /dev/null -w '%{http_code}/%{time_total}s' https://127.0.0.1/agc/vicidial.php)"
