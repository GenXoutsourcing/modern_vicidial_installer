# VICIDIAL INSTALLATION SCRIPTS (Default is Eastern Time Zone US)

## Copy & Paste the part blow:

```
dnf install -y glibc-langpack-en

localectl set-locale en_US.UTF-8

timedatectl set-timezone America/New_York

yum check-update
yum update -y
yum -y install epel-release
yum update -y
yum install git -y

sed -i 's/SELINUX=enforcing/SELINUX=disabled/g' /etc/selinux/config    

cd /usr/src/
git clone https://github.com/GenXoutsourcing/new_vicidial

reboot

````
  

This first installer is the one I keep most up to date and use personally for all my clients. it is the one I recommend that you use.
If you do not install the SSL cert during the initiial install, you have to turn the firewall off before trying to do it after a reboot. Dont forget to turn it back on. Also, by default the firewall will leave port 443 open to the public, so you can login and change the default password. Make sure you remove it from the public zone once your setup is done. 

```
cd /usr/src/new_vicidial
chmod +x main-installer.sh
./main-installer.sh

cd /usr/src/new_vicidial
chmod +x alma10-php8-main.sh
./alma10-php8-main.sh
```

# Above installer for addon servers

```
cd /usr/src/new_vicidial
chmod +x main-addon-installer.sh
./main-addon-installer.sh
```


# Above installer but with PHP8 instead of PHP7 (Beta Release)

```
cd /usr/src/vicidial-install-scripts
chmod +x main-installer-php8.sh
./main-installer-php8.sh
```

# NEW Installer for add on dialers on Alma or Rocky 9

```
cd /usr/src/vicidial-install-scripts
chmod +x addon-dialer-alma9.sh
./addon-dialer-alma9.sh
```

### Alma/Rocky 9 Installer with Dynamic portal and CyburPhone with SSL cert with Asterisk 18

```
cd /usr/src/vicidial-install-scripts
chmod +x alma-rocky9-ast18.sh
./alma-rocky9-ast18.sh
```

Make sure you update your SSL cert location in /etc/httpd/conf.d/viciportal-ssl.conf


### Alma 8 Add on telephony server for a cluster

```
cd /usr/src/vicidial-install-scripts
chmod +x Vici-alma-dialer-install.sh
./Vici-alma-dialer-install.sh
```

### Execute Centos7 Vicidial Install
```
cd /usr/src/vicidial-install-scripts
chmod +x vicidial-install-c7.sh
./vicidial-install-c7.sh
```

### Execute Alma/Rocky 8 Linux Vicidial Install - Ast 16
```
cd /usr/src/vicidial-install-scripts
chmod +x alma-rocky-centos8-ast16.sh
./alma-rocky-centos8-ast16.sh
```

### Execute Alma/Rocky 8 Linux Vicidial Install - Ast 18

```
cd /usr/src/vicidial-install-scripts
chmod +x alma-rocky-centos-8-ast18.sh
./alma-rocky-centos-8-ast18.sh
```

## USEFUL TOOLS ##

## Cluster Database with 7 servers ready with 150 users and phones

```
cd /usr/src/vicidial-install-scripts
chmod +x cluster-db.sh
./cluster-db.sh
```

# These 2 steps below can be used to cluster servers after they have been installed with one of the above installers. Example: main-installer.sh

## Step 1: Add dialers into database POST install - This is to be used to add dialer servers into a cluster with conferences and confbridges

```
cd /usr/src/vicidial-install-scripts
chmod +x add-dialer-to-DB.sh
./add-dialer-to-DB.sh
```

## Step 2: Link Dialers to the database - run this on each dialer

```
cd /usr/src/vicidial-install-scripts
chmod +x run-on-dialer-servers-cluster.sh
./run-on-dialer-servers-cluster.s
```

## Repeat steps 1 and 2 in order as you do each server

## Install Webphone and SSL cert for VICIDIAL
## DO THIS IF YOU HAVE PUBLIC DOMAIN WITH PUBLIC IP ONLY

```
cd /usr/src/vicidial-install-scripts
chmod +x vicidial-enable-webrtc.sh
./vicidial-enable-webrtc.sh
```
