# GenX Application Roadmap

GenX is planned as a separate application that uses VICIdial as the dialer engine underneath. The product goal is a modern call center interface that does not look or feel like stock VICIdial.

## Product Direction

GenX should feel like a new platform:

- modern agent workspace
- supervisor command center
- campaign and list visibility
- rich reporting and exports
- role-based navigation
- fast search/filter workflows
- clean visual design
- business logic owned by GenX, not patched into VICIdial core

The existing VICIdial installer and overlay remain useful, especially for Dynamic Portal and controlled web-node behavior, but the long-term UI should be a separate GenX app.

## Preferred Technical Stack

Initial GenX stack:

```text
React + TypeScript
Next.js or Vite for the UI
Node.js + TypeScript backend
Fastify or equivalent API server
GenX application database
Redis/cache/job queue
Read-only VICIdial reporting DB connection
Official VICIdial APIs where possible
Nginx/Apache reverse proxy
AlmaLinux 9 first-class installer support
```

For the sandbox, AlmaLinux 9 should be the first supported OS because the existing VICIdial install path already targets Alma 9.

## Deployment Shape

Two supported deployment shapes should be designed from the beginning.

### Sandbox hybrid mode

Used for the current sandbox:

```text
genx-sandbox.genxcontactcenter.com
  GenX UI/API
  GenX DB/cache/jobs
  VICIdial Dynamic Portal web role if required
  no full dialer workload unless explicitly needed
```

### Clean app-server mode

Used later when Dynamic Portal is not hosted on the GenX server:

```text
GenX app server
  GenX UI/API
  GenX DB/cache/jobs
  connects to VICIdial API
  connects to reporting slave
  no VICIdial install required
```

## MVP Feature Set

The first useful GenX release should include:

- GenX login
- role-aware home layout
- campaign overview
- agent status overview
- basic lead/call activity views
- live or near-live dashboard metrics
- report filters by date, campaign, list, agent, status, and source
- CSV/XLSX export path
- health page showing API and database connectivity
- environment/config diagnostics for installer validation

## Agent Workspace

Agent UI should focus on:

- current lead context
- disposition controls
- call status
- callback and notes workflow
- call history
- script area
- manual dial path where permitted
- webphone/Dynamic Portal integration as needed

The first version can use VICIdial APIs and existing portal behavior. Deeper call controls should be added only after the clean API path is verified.

## Supervisor Workspace

Supervisor UI should focus on:

- campaign health
- live agent states
- active calls
- queue/list pressure
- conversion and contact rates
- pause/disposition breakdown
- agent drill-down
- exportable activity reports

## Reporting

Reporting should be built as a GenX feature, not a wrapper around stock VICIdial report pages.

Initial reporting:

- call summary
- agent performance
- campaign performance
- disposition breakdown
- lead source/vendor performance
- hourly activity
- callback activity
- export to CSV/XLSX

Later reporting:

- scheduled reports
- PDF exports
- client-facing dashboards
- saved report definitions
- custom fields and business-specific KPIs
- report snapshots/cached aggregates
- drill-down from chart to call/lead detail

## Timeline Expectations

With autonomous access to the sandbox servers and Chrome testing:

| Phase | Target |
| --- | --- |
| Sandbox foundation | 3-5 days |
| First GenX working UI | 7-14 days |
| Usable MVP | 3-5 weeks |
| Polished beta | 6-10 weeks |
| Full replacement platform | 3-6 months |

The fastest useful milestone is a login plus dashboard shell connected to real sandbox VICIdial data within the first 7-10 days.

## Design Rules

- Do not mimic stock VICIdial layouts.
- Avoid the appearance of a simple skin.
- Use dense but clean operational screens.
- Prioritize scanability for supervisors and speed for agents.
- Keep reports visually polished but practical.
- Use clear role-specific navigation.
- Keep all custom business logic in GenX.

## Integration Rules

- Prefer official VICIdial APIs.
- Use read-only reporting DB access for analytics.
- Keep write operations behind reviewed service methods.
- Avoid direct VICIdial table writes unless the API path is missing.
- Log GenX-originated actions.
- Keep credentials in environment/config, not source control.
- Keep installer and health checks current with every new dependency.
