# GenX App Server Cluster Checklist

Use this checklist when `genx-sandbox.genxcontactcenter.com` is ready and clustered to `vicidial-sandbox.genxcontactcenter.com`.

## Target

```text
App server FQDN: genx-sandbox.genxcontactcenter.com
VICIdial FQDN:   vicidial-sandbox.genxcontactcenter.com
VICIdial IP:     70.35.202.95
Mode:            GenX app + VICIdial Dynamic Portal/web node
```

The app server should not run active dialer workload unless that is explicitly needed.

## Immediate Access

Install the temporary Codex SSH public key on the app server using the same `codex` user pattern used on `vicidial-sandbox`.

After access is installed, verify:

```bash
ssh codex@genx-sandbox.genxcontactcenter.com whoami
ssh codex@genx-sandbox.genxcontactcenter.com hostname -f
ssh codex@genx-sandbox.genxcontactcenter.com sudo -n true
```

## Preflight

Run the repo preflight script on the app server:

```bash
cd /usr/src/modern_vicidial_installer
chmod +x genx-app-server-preflight.sh
./genx-app-server-preflight.sh
```

Save the output in the project notes after redacting any credentials.

## DNS And SSL

Confirm:

```text
genx-sandbox.genxcontactcenter.com -> app server public IP
```

Confirm HTTPS certificate coverage for:

```text
genx-sandbox.genxcontactcenter.com
```

If Dynamic Portal remains on a separate port, confirm the expected external URL and port before changing firewall rules.

## VICIdial Firewall Allow Path

After the app server public IP is known, allow it on `vicidial-sandbox`.

Sandbox-friendly broad allow rule:

```bash
firewall-cmd --permanent --zone=public --add-rich-rule='rule family="ipv4" source address="<GENX_APP_PUBLIC_IP>" accept'
firewall-cmd --reload
firewall-cmd --list-all
```

Later, tighten this to only the required ports after the integration paths are confirmed.

Expected VICIdial-side services needed by GenX:

```text
443/tcp   VICIdial API and web calls
446/tcp   Dynamic Portal HTTPS, if GenX or portal node uses it
3306/tcp  read-only reporting database connection
```

## Reporting Database User

Create a read-only database user scoped to the app server IP.

Example shape:

```sql
CREATE USER 'genx_ro'@'<GENX_APP_PUBLIC_IP>' IDENTIFIED BY '<strong-password>';
GRANT SELECT, SHOW VIEW ON asterisk.* TO 'genx_ro'@'<GENX_APP_PUBLIC_IP>';
FLUSH PRIVILEGES;
```

Do not commit the generated password.

## VICIdial API User

Create a limited VICIdial API user for GenX. Record only:

```text
username
allowed role/permissions
base URL
```

Store the password in the app server environment config, not in git.

## App Server VICIdial Web Node Checks

If the app server has VICIdial web/portal components installed, verify:

```text
/var/www/html/agc
/var/www/html/vicidial
/var/www/vhosts/dynportal
/etc/astguiclient.conf
/etc/httpd/conf.d/*.conf
```

Confirm `/etc/astguiclient.conf` points to the correct VICIdial database host and does not contain stale localhost-only settings for clustered mode.

## GenX Runtime Checks

Before installing GenX, confirm:

```text
Node.js runtime plan
database plan for GenX app data
cache/job queue plan
reverse proxy plan
SSL plan
systemd service naming
log paths
backup paths
```

Initial expected service names:

```text
genx-web
genx-api
genx-worker
genx-cache
```

The first implementation may combine `genx-web` and `genx-api` into one Node service.

## Handoff Data Needed

Before the GenX installer can be finalized, collect:

- app server public IP
- app server FQDN
- whether Dynamic Portal is running on `genx-sandbox`
- app server Apache vhost layout
- app server VICIdial cluster configuration
- read-only reporting DB credential path
- limited API credential path
- test campaign
- test agent login
- test supervisor/admin login
