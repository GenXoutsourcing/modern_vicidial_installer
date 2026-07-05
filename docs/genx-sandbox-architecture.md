# GenX Sandbox Architecture

This document captures the initial sandbox plan for building a separate GenX UI and reporting layer around VICIdial while keeping VICIdial core mostly intact.

## Goals

- Build GenX as a separate modern application, not a reskinned VICIdial theme.
- Use official VICIdial APIs where possible.
- Read reporting data from a reporting slave or sandbox database with least-privilege access.
- Keep GenX-only business logic, dashboards, roles, report definitions, and settings in the GenX application.
- Avoid deep VICIdial core edits unless there is no clean API or overlay path.
- Keep the deployment repeatable with installer scripts and documented health checks.

## Sandbox Servers

The initial sandbox uses two AlmaLinux 9 servers.

| Server | FQDN | Specs | Role |
| --- | --- | --- | --- |
| VICIdial sandbox | `vicidial-sandbox.genxcontactcenter.com` | AMD 6-core, 32 GB RAM, SSD | VICIdial core sandbox, database, Asterisk/dialer, test campaigns, test agents, dummy leads |
| GenX sandbox | `genx-sandbox.genxcontactcenter.com` | AMD 6-core, 32 GB RAM, SSD | GenX app, GenX API, GenX database/cache, report jobs, Dynamic Portal / VICIdial web node if required |

If the current host is already running as `alma9.vicidial.genxcontactcenter.com`, the preferred cleanup is to update DNS/hostname/SSL to:

```text
vicidial-sandbox.genxcontactcenter.com
```

The app server should use:

```text
genx-sandbox.genxcontactcenter.com
```

## Server Role Boundaries

### VICIdial sandbox server

Runs the stock VICIdial sandbox stack:

- VICIdial application
- Asterisk/dialer services
- MariaDB sandbox database
- test campaigns
- test lists with dummy leads
- test agent and supervisor logins
- API user for GenX integration

### GenX sandbox server

Runs the new GenX platform and, if required, the Dynamic Portal web role:

- GenX UI
- GenX backend/API
- GenX application database
- Redis or equivalent cache/job queue
- report workers
- Nginx or Apache reverse proxy
- SSL certificate for `genx-sandbox.genxcontactcenter.com`
- VICIdial web/portal files required for Dynamic Portal

The GenX server should not run full dialer workload unless explicitly required. If Dynamic Portal requires VICIdial on this server, install it as a clustered VICIdial web/portal node rather than a full Asterisk/dialer node.

## Data Flow

```text
User browser
  -> https://genx-sandbox.genxcontactcenter.com
  -> GenX UI/backend
  -> GenX app database/cache
  -> VICIdial official APIs
  -> read-only VICIdial reporting database connection
  -> optional VICIdial web/portal node when Dynamic Portal is required
```

GenX should avoid writing directly to VICIdial tables unless the official API path is missing and the behavior has been reviewed.

## FQDN And SSL Plan

Use clear role-based names:

```text
vicidial-sandbox.genxcontactcenter.com
genx-sandbox.genxcontactcenter.com
```

Required DNS records:

```text
vicidial-sandbox.genxcontactcenter.com -> VICIdial sandbox server IP
genx-sandbox.genxcontactcenter.com     -> GenX sandbox server IP
```

SSL should be deployed independently on each host. The VICIdial certificate should be redeployed after the FQDN change. The GenX server should get its own certificate during the GenX installer/bootstrap process.

## Access Packet Needed

Before autonomous build work begins, collect:

- server IPs and FQDNs
- SSH access with sudo or root
- DNS control or confirmation that records have been created
- SSL method currently used
- VICIdial admin login
- VICIdial API user/password with limited permissions
- test agent login
- test supervisor login
- test campaign/list with dummy leads
- sandbox database connection details
- read-only reporting user if available
- Dynamic Portal installation notes
- current AlmaLinux 9 VICIdial installer/cluster scripts

Do not paste permanent secrets into chat. Use temporary credentials or a secure secret-sharing path, then rotate them after setup.

## Initial Build Targets

Day 1:

- verify DNS, hostnames, SSL, firewall, and service health
- confirm VICIdial web, agent, admin, API, database, and Dynamic Portal behavior
- map current cluster role assumptions

Days 2-3:

- bring `genx-sandbox.genxcontactcenter.com` online
- install GenX runtime dependencies
- add GenX service skeleton and reverse proxy
- connect GenX to sandbox VICIdial API and database read path

Week 1:

- login shell
- role-aware dashboard shell
- first live/sandbox VICIdial data views
- basic health/status page

Week 2:

- first useful agent/supervisor/reporting screens
- early reporting filters and charts
- repeatable installer baseline

## Safety Rules

- Keep stock VICIdial core files untouched unless a change is reviewed and documented.
- Prefer overlay files, API calls, and separate GenX services.
- Use read-only database credentials for reporting.
- Keep GenX database separate from VICIdial database.
- Keep app secrets out of source control.
- Document every cluster-level change.
- Test with dummy leads and sandbox campaigns before any production connection.
