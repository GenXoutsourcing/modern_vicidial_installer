# GenX Installer Requirements

The GenX installer must make the app easy to replicate on new servers while preserving the separation between GenX custom logic and VICIdial core.

## Installer Goals

- Install GenX on AlmaLinux 9 first.
- Support repeatable sandbox rebuilds.
- Keep configuration in environment files.
- Avoid editing stock VICIdial core files.
- Support a hybrid GenX + Dynamic Portal web-node mode.
- Provide clear health checks after install.
- Be safe to rerun where possible.
- Document every service and port it creates.

## Supported First Target

```text
OS: AlmaLinux 9
Server: AMD 6-core / 32 GB RAM / SSD
FQDN: genx-sandbox.genxcontactcenter.com
Mode: GenX app + optional VICIdial Dynamic Portal web role
```

Ubuntu support can be added later if GenX becomes a standalone app server deployment outside the VICIdial installer path.

## Installer Inputs

The installer should ask for or accept flags/environment variables for:

- GenX public FQDN
- GenX admin username
- GenX admin password or generated setup token
- timezone
- VICIdial base URL
- VICIdial API user
- VICIdial API password
- VICIdial reporting database host
- VICIdial reporting database port
- VICIdial reporting database name
- VICIdial read-only reporting user
- VICIdial read-only reporting password
- GenX database password
- Redis/cache password if enabled
- SSL email/contact
- install mode: `app-only` or `hybrid-portal-node`

## Service Layout

Expected services:

```text
genx-web       -> GenX UI/server
genx-api       -> GenX backend if split from web
genx-worker    -> report/background jobs
genx-db        -> local GenX database when using local DB mode
genx-cache     -> Redis/cache/job queue
httpd/nginx    -> reverse proxy and SSL endpoint
```

For the first implementation, UI and API may run as one Node service if that reduces deployment complexity.

## Reverse Proxy

The installer should configure HTTPS for:

```text
https://genx-sandbox.genxcontactcenter.com
```

Preferred public paths:

```text
/                 -> GenX UI
/api              -> GenX API
/health           -> GenX health check
/portal           -> Dynamic Portal path only if hybrid mode requires it
```

The proxy must avoid breaking existing VICIdial/Dynamic Portal paths when installed in hybrid mode.

## Configuration Files

Recommended config locations:

```text
/etc/genx/genx.env
/etc/genx/database.env
/etc/genx/vicidial.env
/etc/genx/reporting.env
```

No secrets should be committed to git.

## Health Checks

After installation, the installer should verify:

- GenX service is running
- reverse proxy is running
- SSL certificate is valid for the configured FQDN
- GenX database connection works
- cache/job queue connection works
- VICIdial API URL is reachable
- VICIdial API credentials work
- reporting database connection works with read-only credentials
- required Dynamic Portal routes respond in hybrid mode

## Rerun Safety

The installer should:

- detect existing GenX installation
- back up existing config before changing it
- avoid overwriting secrets without confirmation
- preserve existing SSL certificates when valid
- run database migrations idempotently
- print a summary of changed files
- write an install log

Recommended log path:

```text
/var/log/genx-installer.log
```

Recommended backup path:

```text
/root/genx-backups/YYYYMMDD-HHMMSS
```

## Deployment Modes

### app-only

Use when GenX is installed on a clean app server:

```text
GenX UI/API/database/cache/jobs
no VICIdial installation required
connects to VICIdial remotely
```

### hybrid-portal-node

Use when Dynamic Portal must run from the GenX server:

```text
GenX UI/API/database/cache/jobs
VICIdial web/portal components
clustered connection to VICIdial database/dialer
no active Asterisk/dialer role unless explicitly enabled
```

This is the expected sandbox mode if Dynamic Portal must be hosted on the app server.

## Future Installer Enhancements

- Docker Compose app-only mode
- offline package bundle
- backup/restore helper
- deployment verification report
- auto-generated temporary admin setup link
- unattended install mode for repeated server builds
- production hardening checklist
- Prometheus/Grafana or equivalent metrics hooks
