# GenX API — Integration Reference

The GenX API is the supported programmatic interface to the dialer. It replaces
the legacy VICIdial API files (`/agc/api.php`, `/vicidial/non_agent_api.php`,
`/vicidial/qc_api.php`), which are blocked at the web server and return `403`.

- **Endpoint:** `https://<your-host>/genxapi/api.php`
- **Methods:** `GET` or `POST` (parameters read from either)
- **Response:** `text/plain`. Success responses start with `SUCCESS: <function>`
  followed by pipe-delimited (`|`) data lines. Errors are a single line
  `ERROR: <reason>` with a non-2xx HTTP status.
- **Every call is logged** to `vicidial_api_log` (`api_script = 'genxapi'`).

---

## Authentication

Every request must authenticate as a user who is **active** and a member of the
**API user group** (default group name `APIUSERS`). Users outside that group —
including SuperAdmins — cannot use the API.

Two modes, pick one:

| Mode | Parameters | Notes |
|------|-----------|-------|
| **API key** (preferred) | `api_key=<key>` | No password on the wire; revocable per key. Generate in the GenX admin UI: open the API-group user → **API Keys** → Generate. The raw key is shown once. |
| **User + password** | `user=<user>&pass=<pass>` | The VICIdial user login and password. |

An account may also be restricted to specific functions via its
`api_allowed_functions` (default `ALL_FUNCTIONS`).

### Common parameters

| Param | Required | Description |
|-------|----------|-------------|
| `function` | yes | The operation to run (see below). |
| `api_key` *or* `user`+`pass` | yes | Authentication (above). |
| `source` | no | Free-text tag recorded in the API log (e.g. your app name). |

### HTTP status codes

| Code | Meaning |
|------|---------|
| `200` | Success (`SUCCESS: …`). |
| `400` | Missing/invalid parameters, or an unimplemented function. |
| `403` | Authentication failed, or user not in the API group. |
| `404` | Target record not found. |
| `409` | Conflict — duplicate lead, or an ambiguous lookup. |
| `500` / `503` | Write failure / database unavailable. |

---

## Functions

### version
Returns the API version. Useful as a connectivity/auth check.

```
GET /genxapi/api.php?api_key=KEY&function=version
```
```
SUCCESS: version
genx_api_version|1.0.0
```

### agent_status
Live agents with campaign, status and today's call count.

```
GET ...&function=agent_status
```
```
SUCCESS: agent_status
count|2
user|campaign|status|calls_today|server_ip
6000|TESTCAMP|PAUSED|14|10.0.0.5
```

### campaigns_list
All campaigns (active first).

```
...&function=campaigns_list
→ count|N  then  campaign_id|campaign_name|active|dial_method
```

### lists_list
All lists.

```
...&function=lists_list
→ count|N  then  list_id|list_name|campaign_id|active
```

### lead_status_count
Lead counts by status. Optional `list_id` scopes to one list; omitted =
system-wide.

```
...&function=lead_status_count&list_id=999
→ count|N  then  status|leads
```

### add_lead
Insert a new lead. `gmt_offset_now` is computed automatically using the
dialer's own timezone resolver (area code / state / postal, DST-aware), so
loaded leads honor the same calling-window rules as the native loader.

**Required:** `phone_number`, `list_id` (must exist).

**Optional:** `phone_code` (default `1`), `vendor_lead_code`, `source_id`,
`title`, `first_name`, `middle_initial`, `last_name`, `address1`, `address2`,
`address3`, `city`, `state`, `province`, `postal_code`, `country_code`,
`gender`, `date_of_birth` (`YYYY-MM-DD`), `alt_phone`, `email`,
`security_phrase`, `comments`, `rank`, `owner`, `entry_list_id`.

**GMT override:** pass `gmt_offset_now=<number>` to set it explicitly, or
`tz_method=` one of `AREACODE` (default), `POSTAL`, `NANPA`, `TZCODE` to change
how it's resolved.

**Duplicate check** (`duplicate_check=`, default none):
- `DUPLIST` — reject if the number already exists in the same list
- `DUPCAMP` — reject if it exists in any list of that list's campaign
- `DUPSYS` — reject if it exists anywhere in the system

```
POST /genxapi/api.php
  api_key=KEY&function=add_lead&list_id=999&phone_number=2125551234
  &first_name=Jane&last_name=Doe&state=NY&duplicate_check=DUPSYS
```
```
SUCCESS: add_lead
lead_id|1024
phone_number|2125551234
list_id|999
gmt_offset_now|-4
status|NEW
```
On a duplicate: `409` `ERROR: duplicate phone_number (DUPSYS) lead_id 812`.

### update_lead
Update fields on an existing lead. When the phone number, state or postal code
changes, `gmt_offset_now` is automatically re-resolved (unless you pass an
explicit `gmt_offset_now`).

**Locate the lead (one of):**
- `lead_id=<id>` — direct, preferred.
- `phone_number_lookup=<number>` — with optional `list_id_lookup` to
  disambiguate when the number is in several lists. If more than one lead
  matches, the call returns `409` rather than guessing.

**Updatable fields (only those you send are changed):** `phone_code`,
`phone_number`, `title`, `first_name`, `middle_initial`, `last_name`,
`address1`, `address2`, `address3`, `city`, `state`, `province`, `postal_code`,
`country_code`, `gender`, `alt_phone`, `email`, `security_phrase`, `comments`,
`vendor_lead_code`, `source_id`, `rank`, `owner`, `status`, `list_id` (validated).

```
POST ...&function=update_lead&lead_id=1024&status=CALLBK&phone_number=3035551234
```
```
SUCCESS: update_lead
lead_id|1024
fields_updated|status,phone_number
gmt_offset_now|-6
```

### lead_info
Return full lead record(s), by `lead_id` or `phone_number` (up to 20 rows for a
phone match).

```
...&function=lead_info&phone_number=3035551234
```
```
SUCCESS: lead_info
count|1
lead_id|list_id|status|phone_code|phone_number|gmt_offset_now|title|first_name|middle_initial|last_name|address1|city|state|postal_code|vendor_lead_code|source_id|called_count|last_local_call_time|entry_date|owner|user
1024|999|CALLBK|1|3035551234|-6.00||Jane||Doe||Denver|CO||||0||2026-07-10 20:44:46||apiuser
```

### dnc_add
Add a number to Do-Not-Call. Omit `campaign_id` for system-wide DNC; include it
for campaign-scoped DNC. Idempotent — `added|N` if it was already listed.

```
...&function=dnc_add&phone_number=3035551234            (system-wide)
...&function=dnc_add&phone_number=3035551234&campaign_id=TESTCAMP  (campaign)
```
```
SUCCESS: dnc_add
phone_number|3035551234
scope|SYSTEM
added|Y
```

### dnc_check
Check DNC membership. Reports system DNC and, when `campaign_id` is given,
campaign DNC.

```
...&function=dnc_check&phone_number=3035551234&campaign_id=TESTCAMP
```
```
SUCCESS: dnc_check
phone_number|3035551234
in_dnc|Y
system_dnc|N
campaign_dnc|Y
```

---

## Notes

- **Parameter names** match the legacy VICIdial lead fields, so client code that
  targeted the old Non-Agent API maps across with a URL/auth change.
- The legacy `--A--field--B--` merge-token syntax is for agent scripts and web
  forms, **not** API parameters — send plain values (`phone_number=2125551234`).
- Functions are added on demand. If you need one that returns
  `ERROR: function not implemented in GenX API v1`, request it.
