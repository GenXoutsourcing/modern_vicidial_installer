# VICIdial Sandbox Current State

Read-only inventory collected on 2026-07-05 after the FQDN change to:

```text
vicidial-sandbox.genxcontactcenter.com
```

No server changes were made during this inventory.

## Server Summary

| Item | Value |
| --- | --- |
| Public FQDN | `vicidial-sandbox.genxcontactcenter.com` |
| Public IP | `70.35.202.95` |
| OS | AlmaLinux 9.8 |
| Kernel | `5.14.0-687.20.1.el9_8.x86_64` |
| CPU threads seen by OS | 12 |
| Memory | 31 GiB total, about 27 GiB available during check |
| Root filesystem | 434 GB total, about 404 GB available |
| SELinux | disabled |

## Core Services

| Service | State |
| --- | --- |
| `mariadb` | active |
| `httpd` | active |
| `rc-local` | active and enabled |
| `firewalld` | active |
| `crond` | active |

Asterisk is running, but not through a systemd `asterisk.service` unit. It is started by the server boot script through `rc.local`.

```text
Asterisk 18.21.0-vici
```

## Public Endpoint Checks

| Endpoint | Result |
| --- | --- |
| `https://vicidial-sandbox.genxcontactcenter.com` | `200 OK` |
| `https://vicidial-sandbox.genxcontactcenter.com/agc/vicidial.php` | `200 OK` |
| `https://vicidial-sandbox.genxcontactcenter.com/vicidial/admin.php` | `401 Unauthorized`, expected Basic Auth protection |
| `https://vicidial-sandbox.genxcontactcenter.com:446` | `200 OK` |

## Apache Virtual Hosts

Apache is serving:

```text
*:80   vicidial-sandbox.genxcontactcenter.com
*:443  vicidial-sandbox.genxcontactcenter.com
*:446  vicidial-sandbox.genxcontactcenter.com
*:81   dialer.one
```

Main VICIdial document root:

```text
/var/www/html
```

Dynamic Portal document root:

```text
/var/www/vhosts/dynportal
```

The main HTTPS vhost uses the Let's Encrypt certificate for:

```text
vicidial-sandbox.genxcontactcenter.com
```

## Web/API Paths Present

Observed VICIdial API files:

```text
/var/www/html/agc/api.php
/var/www/html/vicidial/non_agent_api.php
/var/www/html/vicidial/qc/qc_api.php
/var/www/html/vicidial/qc_api.php
```

These are the first API integration points to verify for GenX before considering any direct database writes.

## Database Notes

MariaDB is alive and listening on TCP port `3306`.

Observed MariaDB version:

```text
10.5.29-MariaDB
```

Observed non-secret VICIdial DB config shape:

```text
VARDB_server   => localhost
VARDB_database => asterisk
VARDB_user     => cron
```

The config file also contains credential values. Do not copy raw `/etc/astguiclient.conf` output into tickets, docs, or commits without redaction.

## Firewall And Listening Ports

`firewalld` is active. Public zone currently includes:

```text
446/tcp
10000-20000/udp
```

There are also rich rules and ipsets for existing trusted/blocked networks.

Observed listening TCP ports included:

```text
22     sshd
80     httpd
81     httpd
443    httpd
446    httpd
2000   asterisk
3306   mariadbd
4577   FastAGI_log.pl
5038   Asterisk AMI on 127.0.0.1 only
8088   Asterisk HTTP
8089   Asterisk HTTPS/WebSocket
```

## App Server Implications

When `genx-sandbox.genxcontactcenter.com` is ready, the VICIdial sandbox will need:

- the app server public IP added to the firewall allow path;
- a read-only reporting database user scoped to the app server IP;
- a limited VICIdial API user for GenX;
- confirmation of which Dynamic Portal paths must be served from the app server;
- a decision on whether the app server is only a VICIdial web/portal node or also needs any Asterisk role.

Do not expose broad database access to the app server unless the sandbox task explicitly requires it.
