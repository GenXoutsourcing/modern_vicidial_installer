# Agent Guidance — Interactive Decision Trees (FUTURE RELEASE)

**Status: design spec only. Nothing in this document is implemented or wired
into genx-ui. Do not build from this without an explicit go-ahead.**

Planned for a post-v1.0 release. Written 2026-07-15 after a competitive review
of Yonyx (corp.yonyx.com).

## What this is

Guided, branching call scripts for agents — a replacement for Vicidial's
static SCRIPT tab. An author builds a decision tree per campaign; during a
call the agent panel shows one *guidance step* at a time (script text with
lead-data merge fields), the agent clicks the *customer response*, and the
tree advances. Every step is logged, and exit nodes map to dispositions.

Equivalent functionality to Yonyx / Zingtree-class "interactive decision
tree" products, built natively so it can do what an external SaaS iframe
cannot: auto-launch per campaign/ingroup, branch on live call data, suggest
or force the disposition, and join traversal logs to recordings and
`vicidial_log` for QA scoring.

## Competitive summary (Yonyx, reviewed 2026-07-15)

- Trees of *guidance step* and *user response* nodes; subtrees callable from
  a parent node that return to the caller (shared rebuttal libraries).
- Node content: script text with CRM merge fields, images/video, data-capture
  forms (text, dropdown, checkbox, date) written back to the CRM.
- Delivery: iframe embed + JS API inside the CRM, or headless REST API
  serving one guidance step at a time as JSON.
- Analytics: every agent journey logged as an "incident" — full timestamped
  step path, CSV export, cumulative path analytics (common paths, drop-off
  nodes).
- AI authoring assist (generate/rephrase/condense/translate script text).
- Pricing ~$11–25/user/month; API access gated to their enterprise tier.
- NOTE: Yonyx holds patents around workflow-report generation from tree
  traversals. We build our own functionality and UI — no cloning of their
  interface, terminology, or marketing language.

## Schema (new tables, no core Vicidial changes)

```sql
genx_guide            -- guide_id, name, description, active, published_version,
                      -- campaign_id / ingroup binding (nullable), created_by, timestamps
genx_guide_version    -- version_id, guide_id, version_no, published_at, published_by
                      -- (snapshot-on-publish: agents always traverse a frozen version)
genx_guide_node       -- node_id, version_id, type ENUM('step','response'),
                      -- title, script_html (supports --A--field--B-- merge syntax,
                      -- same as Vicidial script tabs), form_json NULL (phase 2),
                      -- disposition NULL (set on exit nodes), subguide_id NULL
                      -- (edge into another guide's root; returns to caller)
genx_guide_edge       -- edge_id, version_id, parent_node_id, child_node_id, sort_order
genx_guide_traversal  -- traversal_id, session_key, uniqueid, lead_id, campaign_id,
                      -- user, version_id, node_id, entered_at
                      -- append-only, one row per step; PARTITION by date range
                      -- from day one (same treatment as the big log tables)
```

Design decisions locked now because they are painful to retrofit:

1. **Snapshot-on-publish versioning.** Editing a live guide creates a draft;
   publishing freezes a new `genx_guide_version` row set. Traversal rows
   reference the frozen version, so path analytics never point at mutated
   nodes.
2. **Reusable subtrees.** `genx_guide_node.subguide_id` lets a response node
   call another guide (shared rebuttal/payment/compliance flows) and return
   to the calling node when the subtree exits. Column exists from v1 even if
   the UI for it ships later.
3. **Back navigation is logged, not erased.** Agent "back" writes a traversal
   row for the revisited node; history is never deleted. Backtracking is a QA
   signal.

## Runtime API (agent-UI lane, `/api/agent/guide/*`)

Stateless beyond the traversal log — "current node" is the latest traversal
row for the session, so screen refreshes and transfers recover for free.

- `POST /api/agent/guide/start` — body: uniqueid, lead_id, campaign_id.
  Resolves campaign → active published guide, creates session_key, returns
  root step with lead fields merged + response options.
- `POST /api/agent/guide/respond` — body: session_key, response_node_id.
  Logs traversal row, returns next step (or exit payload with suggested
  disposition). Handles subguide entry/return.
- `POST /api/agent/guide/back` — logs revisit row, returns prior step.
- `POST /api/agent/guide/end` — closes session, returns exit summary +
  suggested disposition.

Merge fields resolve server-side from `vicidial_list` (+ custom list fields),
masked per `admin_hide_lead_data` / `admin_hide_phone_data` like every other
lead-data surface in genx-ui.

## Agent panel (agent-UI lane)

Panel/tab in the agent screen: current step HTML, response buttons below,
breadcrumb of steps taken with back navigation. Auto-launch on call connect
via campaign binding; auto-fire `end` on disposition. Exit-node disposition
pre-selects (configurable per guide: suggest vs force) the disposition screen.

## Authoring UI (admin-UI lane)

v1 is a plain indented outline editor — tree list, steps with responses
nested under them, click-to-edit script text, drag to reorder, draft/publish
workflow. No drag-and-drop canvas; a visual map view is a later luxury.
Gated by a new permission flag following the full wiring pattern (DB column →
login SELECT → `publicUser()` → consumed by `requireModify()`/`userCan()`).

## Analytics (after real traffic exists)

Join `genx_guide_traversal` to `vicidial_log` on uniqueid:

- paths per disposition, drop-off nodes, time per step
- agent adherence (guide opened at all; steps skipped)
- per-node conversion (which rebuttal branches actually save calls)
- click-through from a traversal to the call's recording for QA review

Feeds the QA/compliance roadmap item (competitive gap vs Convoso/Five9).

## Phasing

- **Phase 1 (MVP):** schema, runtime API, agent panel, outline authoring,
  merge fields, disposition mapping, traversal logging.
- **Phase 2:** data-capture forms with write-back to lead/custom fields,
  subtree authoring UI, analytics views.
- **Phase 3:** visual map editor, AI authoring assist (draft a rebuttal tree
  from an existing campaign script), branch-on-call-data conditions (state,
  list, dial status).

**First milestone when work starts:** hand-seed a 10-node guide in SQL for
one campaign on viciboxclone (opening → 2 rebuttals → close/decline exits
with mapped dispositions) and run it end-to-end with a test agent
(8811–8813) before building any authoring UI.
