<?php
// GenX API reference, served from the dialer itself so the endpoint
// hostname always matches the system it is running on.
$host = htmlspecialchars($_SERVER['HTTP_HOST'] ?? 'your-host', ENT_QUOTES);
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GenX API - Integration Reference</title>
</head>
<body>
<style>
  :root {
    --bg: #f5f8f9;
    --surface: #ffffff;
    --surface-2: #eaf0f2;
    --code-bg: #0f1b21;
    --code-ink: #d7e3e8;
    --ink: #142029;
    --muted: #5b6d78;
    --border: #d7e1e6;
    --accent: #0b7d93;
    --accent-2: #0a6070;
    --accent-soft: #dcf1f4;
    --get: #1a7f52;
    --get-soft: #dcefe4;
    --post: #a85700;
    --post-soft: #f8ead7;
    --s2: #1a7f52;
    --s4: #9c6100;
    --s5: #b3261e;
    --radius: 10px;
    --maxw: 62ch;
    color-scheme: light;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0c1317;
      --surface: #111c22;
      --surface-2: #16242c;
      --code-bg: #0a1216;
      --code-ink: #cddbe1;
      --ink: #e5edf1;
      --muted: #90a2ac;
      --border: #24363f;
      --accent: #38cfe4;
      --accent-2: #6fdcec;
      --accent-soft: #0f2f37;
      --get: #4cc98a;
      --get-soft: #123227;
      --post: #e0973f;
      --post-soft: #33240f;
      --s2: #4cc98a;
      --s4: #e0aa4a;
      --s5: #ef6a5f;
      color-scheme: dark;
    }
  }
  :root[data-theme="light"] {
    --bg: #f5f8f9; --surface: #ffffff; --surface-2: #eaf0f2; --code-bg: #0f1b21; --code-ink: #d7e3e8;
    --ink: #142029; --muted: #5b6d78; --border: #d7e1e6; --accent: #0b7d93; --accent-2: #0a6070;
    --accent-soft: #dcf1f4; --get: #1a7f52; --get-soft: #dcefe4; --post: #a85700; --post-soft: #f8ead7;
    --s2: #1a7f52; --s4: #9c6100; --s5: #b3261e; color-scheme: light;
  }
  :root[data-theme="dark"] {
    --bg: #0c1317; --surface: #111c22; --surface-2: #16242c; --code-bg: #0a1216; --code-ink: #cddbe1;
    --ink: #e5edf1; --muted: #90a2ac; --border: #24363f; --accent: #38cfe4; --accent-2: #6fdcec;
    --accent-soft: #0f2f37; --get: #4cc98a; --get-soft: #123227; --post: #e0973f; --post-soft: #33240f;
    --s2: #4cc98a; --s4: #e0aa4a; --s5: #ef6a5f; color-scheme: dark;
  }

  * { box-sizing: border-box; }
  body { margin: 0; }
  .doc {
    background: var(--bg);
    color: var(--ink);
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    line-height: 1.6;
    font-size: 16px;
    -webkit-font-smoothing: antialiased;
  }
  code, pre, .mono { font-family: ui-monospace, "SFMono-Regular", "SF Mono", Menlo, Consolas, "Liberation Mono", monospace; }

  .shell { display: grid; grid-template-columns: 260px minmax(0, 1fr); gap: 0; max-width: 1180px; margin: 0 auto; }

  /* Sidebar */
  .side { border-right: 1px solid var(--border); padding: 32px 22px; position: sticky; top: 0; align-self: start; height: 100vh; overflow-y: auto; }
  .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 4px; }
  .brand-mark { width: 34px; height: 34px; border-radius: 8px; background: var(--accent); color: #fff; display: grid; place-items: center; font-weight: 800; font-size: 15px; letter-spacing: -0.5px; }
  .brand-name { font-weight: 750; letter-spacing: -0.2px; }
  .brand-sub { color: var(--muted); font-size: 12.5px; margin: 0 0 24px; }
  .navgroup { text-transform: uppercase; font-size: 11px; letter-spacing: 0.9px; color: var(--muted); font-weight: 700; margin: 20px 0 8px; }
  .side nav a { display: block; color: var(--ink); text-decoration: none; padding: 5px 10px; border-radius: 7px; font-size: 14px; }
  .side nav a:hover { background: var(--surface-2); }
  .side nav a .m { font-size: 10px; font-weight: 700; color: var(--muted); margin-left: 6px; }
  .side nav a:focus-visible, .content a:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

  /* Content */
  .content { padding: 40px 48px 96px; min-width: 0; }
  .eyebrow { text-transform: uppercase; letter-spacing: 1.4px; font-size: 12px; font-weight: 700; color: var(--accent-2); margin: 0 0 10px; }
  h1 { font-size: 34px; line-height: 1.15; letter-spacing: -0.9px; margin: 0 0 12px; text-wrap: balance; font-weight: 800; }
  h2 { font-size: 22px; letter-spacing: -0.4px; margin: 0; font-weight: 750; scroll-margin-top: 20px; }
  h3 { font-size: 15px; text-transform: uppercase; letter-spacing: 0.6px; color: var(--muted); margin: 22px 0 8px; font-weight: 700; }
  p { max-width: var(--maxw); }
  .lead { font-size: 18px; color: var(--muted); max-width: var(--maxw); margin: 0 0 22px; }

  .callout { background: var(--accent-soft); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; margin: 22px 0; max-width: var(--maxw); }
  .callout .mono { font-size: 14px; word-break: break-all; }
  .callout .lbl { display: block; text-transform: uppercase; font-size: 11px; letter-spacing: 1px; color: var(--muted); font-weight: 700; margin-bottom: 5px; }

  section.fn { border-top: 1px solid var(--border); padding-top: 30px; margin-top: 38px; }
  .fn-head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 6px; }
  .chip { font-size: 11px; font-weight: 800; letter-spacing: 0.5px; padding: 3px 9px; border-radius: 999px; text-transform: uppercase; }
  .chip.get { color: var(--get); background: var(--get-soft); }
  .chip.post { color: var(--post); background: var(--post-soft); }

  .grid { display: grid; grid-template-columns: 1fr; gap: 18px; }
  @media (min-width: 1000px) { .grid.split { grid-template-columns: minmax(0,1fr) minmax(0,1fr); align-items: start; } }

  .tablewrap { overflow-x: auto; border: 1px solid var(--border); border-radius: var(--radius); margin: 12px 0; }
  table { border-collapse: collapse; width: 100%; font-size: 14px; }
  th, td { text-align: left; padding: 9px 14px; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { background: var(--surface-2); font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--muted); }
  tr:last-child td { border-bottom: none; }
  td .mono, th .mono { font-size: 13px; }
  td.req { color: var(--accent-2); font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; }
  .num { font-variant-numeric: tabular-nums; }

  pre { background: var(--code-bg); color: var(--code-ink); border-radius: var(--radius); padding: 16px 18px; overflow-x: auto; font-size: 13.5px; line-height: 1.55; margin: 0; }
  pre .k { color: #7fd0e0; }
  pre .s { color: #9fd69c; }
  pre .c { color: #6b8391; }
  .codelabel { font-size: 11px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--muted); font-weight: 700; margin: 0 0 6px; }
  p code, li code, td code { background: var(--surface-2); padding: 1px 6px; border-radius: 5px; font-size: 13.5px; }

  ul.tight { max-width: var(--maxw); padding-left: 20px; }
  ul.tight li { margin: 4px 0; }

  .footer { border-top: 1px solid var(--border); margin-top: 48px; padding-top: 20px; color: var(--muted); font-size: 14px; max-width: var(--maxw); }

  @media (max-width: 860px) {
    .shell { grid-template-columns: 1fr; }
    .side { position: static; height: auto; border-right: none; border-bottom: 1px solid var(--border); }
    .content { padding: 28px 22px 72px; }
    h1 { font-size: 28px; }
  }
</style>

<div class="doc">
  <div class="shell">
    <aside class="side">
      <div class="brand">
        <div class="brand-mark">GX</div>
        <div class="brand-name">GenX API</div>
      </div>
      <p class="brand-sub">Integration reference · v1</p>
      <nav aria-label="Contents">
        <a href="#auth">Authentication</a>
        <a href="#status">Status codes</a>
        <p class="navgroup">Read</p>
        <a href="#version">version <span class="m">GET</span></a>
        <a href="#agent_status">agent_status <span class="m">GET</span></a>
        <a href="#campaigns_list">campaigns_list <span class="m">GET</span></a>
        <a href="#lists_list">lists_list <span class="m">GET</span></a>
        <a href="#lead_status_count">lead_status_count <span class="m">GET</span></a>
        <a href="#lead_info">lead_info <span class="m">GET</span></a>
        <p class="navgroup">Write</p>
        <a href="#add_lead">add_lead <span class="m">POST</span></a>
        <a href="#update_lead">update_lead <span class="m">POST</span></a>
        <a href="#dnc_add">dnc_add <span class="m">POST</span></a>
        <a href="#dnc_check">dnc_check <span class="m">GET</span></a>
      </nav>
    </aside>

    <main class="content">
      <p class="eyebrow">Dialer Platform</p>
      <h1>GenX API</h1>
      <p class="lead">The supported programmatic interface to the dialer — load and manage leads, honor Do-Not-Call, and read live status. It replaces the legacy VICIdial API files, which are blocked.</p>

      <div class="callout">
        <span class="lbl">Base endpoint</span>
        <span class="mono">https://<?php echo $host; ?>/genxapi/api.php</span>
      </div>

      <p>Send write requests by <code>POST</code>. Read requests may use <code>GET</code> only when the API key is sent in an HTTP header; do not put <code>api_key</code> or <code>pass</code> in the URL. Every response is <code>text/plain</code>: success replies begin with <code>SUCCESS: &lt;function&gt;</code> followed by pipe-delimited (<code>|</code>) data lines; failures return a single <code>ERROR: &lt;reason&gt;</code> line with a non-2xx status. Every call is recorded in the API log.</p>

      <section class="fn" id="auth">
        <h2>Authentication</h2>
        <p>Each request authenticates as a user who is <strong>active</strong> and a member of the <strong>API user group</strong> (default <code>APIUSERS</code>). Users outside that group — including SuperAdmins — cannot use the API. Choose one mode:</p>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Mode</th><th>Parameters</th><th>Notes</th></tr></thead>
            <tbody>
              <tr><td><strong>API key</strong><br><span style="color:var(--muted);font-size:12px">preferred</span></td><td><span class="mono">X-GenX-API-Key: &lt;key&gt;</span><br><span class="mono">Authorization: Bearer &lt;key&gt;</span><br><span class="mono">api_key=&lt;key&gt;</span> in POST body</td><td>No password on the wire; revocable per key. Generated in the GenX admin UI: open the API-group user → <strong>API Keys</strong> → Generate. The raw key is shown once.</td></tr>
              <tr><td><strong>User + password</strong></td><td><span class="mono">user=&lt;user&gt;</span><br><span class="mono">pass=&lt;pass&gt;</span> in POST body</td><td>The dialer user login and password. Passwords are rejected in GET query strings.</td></tr>
            </tbody>
          </table>
        </div>
        <h3>Common parameters</h3>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Param</th><th>Required</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><span class="mono">function</span></td><td class="req">yes</td><td>The operation to run.</td></tr>
              <tr><td><span class="mono">X-GenX-API-Key</span>, <span class="mono">Authorization</span>, <span class="mono">api_key</span>, or <span class="mono">user</span>+<span class="mono">pass</span></td><td class="req">yes</td><td>Authentication. Secrets must be sent by header or POST body, not GET query string.</td></tr>
              <tr><td><span class="mono">source</span></td><td>no</td><td>Free-text tag recorded in the API log (e.g. your app name).</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="fn" id="status">
        <h2>Status codes</h2>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Code</th><th>Meaning</th></tr></thead>
            <tbody>
              <tr><td class="mono num" style="color:var(--s2);font-weight:700">200</td><td>Success (<code>SUCCESS: …</code>).</td></tr>
              <tr><td class="mono num" style="color:var(--s4);font-weight:700">400</td><td>Missing or invalid parameters, or an unimplemented function.</td></tr>
              <tr><td class="mono num" style="color:var(--s4);font-weight:700">403</td><td>Authentication failed, or user not in the API group.</td></tr>
              <tr><td class="mono num" style="color:var(--s4);font-weight:700">404</td><td>Target record not found.</td></tr>
              <tr><td class="mono num" style="color:var(--s4);font-weight:700">409</td><td>Conflict — duplicate lead, or an ambiguous lookup.</td></tr>
              <tr><td class="mono num" style="color:var(--s5);font-weight:700">500 / 503</td><td>Write failure / database unavailable.</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section class="fn" id="version">
        <div class="fn-head"><span class="chip get">GET</span><h2>version</h2></div>
        <p>Returns the API version. Useful as a connectivity and auth check.</p>
        <div class="grid split">
          <div><p class="codelabel">Request</p><pre><span class="c"># GET with header</span>
X-GenX-API-Key: <span class="s">KEY</span>
/genxapi/api.php?<span class="k">function</span>=<span class="s">version</span></pre></div>
          <div><p class="codelabel">Response</p><pre>SUCCESS: version
genx_api_version|1.0.0</pre></div>
        </div>
      </section>

      <section class="fn" id="agent_status">
        <div class="fn-head"><span class="chip get">GET</span><h2>agent_status</h2></div>
        <p>Live agents with campaign, status and today's call count.</p>
        <div class="grid split">
          <div><p class="codelabel">Request</p><pre>...&<span class="k">function</span>=<span class="s">agent_status</span></pre></div>
          <div><p class="codelabel">Response</p><pre>SUCCESS: agent_status
count|2
user|campaign|status|calls_today|server_ip
6000|TESTCAMP|PAUSED|14|10.0.0.5</pre></div>
        </div>
      </section>

      <section class="fn" id="campaigns_list">
        <div class="fn-head"><span class="chip get">GET</span><h2>campaigns_list</h2></div>
        <p>All campaigns, active first.</p>
        <pre>...&<span class="k">function</span>=<span class="s">campaigns_list</span>
<span class="c">→ count|N   then   campaign_id|campaign_name|active|dial_method</span></pre>
      </section>

      <section class="fn" id="lists_list">
        <div class="fn-head"><span class="chip get">GET</span><h2>lists_list</h2></div>
        <p>All lists.</p>
        <pre>...&<span class="k">function</span>=<span class="s">lists_list</span>
<span class="c">→ count|N   then   list_id|list_name|campaign_id|active</span></pre>
      </section>

      <section class="fn" id="lead_status_count">
        <div class="fn-head"><span class="chip get">GET</span><h2>lead_status_count</h2></div>
        <p>Lead counts by status. Optional <code>list_id</code> scopes to one list; omitted returns system-wide.</p>
        <pre>...&<span class="k">function</span>=<span class="s">lead_status_count</span>&<span class="k">list_id</span>=<span class="s">999</span>
<span class="c">→ count|N   then   status|leads</span></pre>
      </section>

      <section class="fn" id="lead_info">
        <div class="fn-head"><span class="chip get">GET</span><h2>lead_info</h2></div>
        <p>Full lead record(s), by <code>lead_id</code> or <code>phone_number</code> (up to 20 rows for a phone match).</p>
        <div><p class="codelabel">Response</p><pre>SUCCESS: lead_info
count|1
lead_id|list_id|status|phone_code|phone_number|gmt_offset_now|title|first_name|
middle_initial|last_name|address1|city|state|postal_code|vendor_lead_code|
source_id|called_count|last_local_call_time|entry_date|owner|user
1024|999|CALLBK|1|3035551234|-6.00||Jane||Doe||Denver|CO|| … |apiuser</pre></div>
      </section>

      <section class="fn" id="add_lead">
        <div class="fn-head"><span class="chip post">POST</span><h2>add_lead</h2></div>
        <p>Insert a new lead. <code>gmt_offset_now</code> is computed with the dialer's own timezone resolver (area code / state / postal, DST-aware), so leads loaded through the API honor the same calling-window rules as the native loader.</p>
        <div class="tablewrap">
          <table>
            <thead><tr><th>Param</th><th>Req</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td><span class="mono">phone_number</span></td><td class="req">yes</td><td>Digits.</td></tr>
              <tr><td><span class="mono">list_id</span></td><td class="req">yes</td><td>Must exist.</td></tr>
              <tr><td><span class="mono">phone_code</span></td><td>no</td><td>Country code, default <code>1</code>.</td></tr>
              <tr><td colspan="2"><span class="mono">first_name, last_name, title, middle_initial</span></td><td>Name fields.</td></tr>
              <tr><td colspan="2"><span class="mono">address1–3, city, state, province, postal_code, country_code</span></td><td>Address fields.</td></tr>
              <tr><td colspan="2"><span class="mono">gender, date_of_birth, alt_phone, email, security_phrase, comments</span></td><td>DOB as <code>YYYY-MM-DD</code>.</td></tr>
              <tr><td colspan="2"><span class="mono">vendor_lead_code, source_id, rank, owner, entry_list_id</span></td><td>Tracking fields.</td></tr>
              <tr><td><span class="mono">duplicate_check</span></td><td>no</td><td><code>DUPLIST</code> (same list), <code>DUPCAMP</code> (same campaign), <code>DUPSYS</code> (whole system). Default: no check.</td></tr>
              <tr><td><span class="mono">gmt_offset_now</span></td><td>no</td><td>Override the auto-resolved offset.</td></tr>
              <tr><td><span class="mono">tz_method</span></td><td>no</td><td><code>AREACODE</code> (default), <code>POSTAL</code>, <code>NANPA</code>, <code>TZCODE</code>.</td></tr>
            </tbody>
          </table>
        </div>
        <div class="grid split">
          <div><p class="codelabel">Request</p><pre><span class="c"># POST</span>
<span class="k">api_key</span>=<span class="s">KEY</span>
<span class="k">function</span>=<span class="s">add_lead</span>
<span class="k">list_id</span>=<span class="s">999</span>
<span class="k">phone_number</span>=<span class="s">2125551234</span>
<span class="k">first_name</span>=<span class="s">Jane</span>
<span class="k">last_name</span>=<span class="s">Doe</span>
<span class="k">state</span>=<span class="s">NY</span>
<span class="k">duplicate_check</span>=<span class="s">DUPSYS</span></pre></div>
          <div><p class="codelabel">Response</p><pre>SUCCESS: add_lead
lead_id|1024
phone_number|2125551234
list_id|999
gmt_offset_now|-4
status|NEW</pre>
          <p style="font-size:13.5px;color:var(--muted);margin-top:10px">On a duplicate: <code>409</code> — <span class="mono">ERROR: duplicate phone_number (DUPSYS) lead_id 812</span></p></div>
        </div>
      </section>

      <section class="fn" id="update_lead">
        <div class="fn-head"><span class="chip post">POST</span><h2>update_lead</h2></div>
        <p>Update fields on an existing lead. When the phone number, state or postal code changes, <code>gmt_offset_now</code> is automatically re-resolved — unless you pass an explicit <code>gmt_offset_now</code>.</p>
        <h3>Locate the lead — one of</h3>
        <ul class="tight">
          <li><code>lead_id=&lt;id&gt;</code> — direct, preferred.</li>
          <li><code>phone_number_lookup=&lt;number&gt;</code> — with optional <code>list_id_lookup</code> to disambiguate when the number is in several lists. More than one match returns <code>409</code> rather than guessing.</li>
        </ul>
        <h3>Updatable fields — only those you send change</h3>
        <p><span class="mono" style="font-size:13px">phone_code, phone_number, title, first_name, middle_initial, last_name, address1–3, city, state, province, postal_code, country_code, gender, alt_phone, email, security_phrase, comments, vendor_lead_code, source_id, rank, owner, status, list_id</span></p>
        <div class="grid split">
          <div><p class="codelabel">Request</p><pre>...&<span class="k">function</span>=<span class="s">update_lead</span>
&<span class="k">lead_id</span>=<span class="s">1024</span>
&<span class="k">status</span>=<span class="s">CALLBK</span>
&<span class="k">phone_number</span>=<span class="s">3035551234</span></pre></div>
          <div><p class="codelabel">Response</p><pre>SUCCESS: update_lead
lead_id|1024
fields_updated|status,phone_number
gmt_offset_now|-6</pre></div>
        </div>
      </section>

      <section class="fn" id="dnc_add">
        <div class="fn-head"><span class="chip post">POST</span><h2>dnc_add</h2></div>
        <p>Add a number to Do-Not-Call. Omit <code>campaign_id</code> for system-wide DNC; include it for campaign-scoped DNC. Idempotent — <code>added|N</code> if it was already listed.</p>
        <div class="grid split">
          <div><p class="codelabel">Request</p><pre><span class="c"># system-wide</span>
...&<span class="k">function</span>=<span class="s">dnc_add</span>&<span class="k">phone_number</span>=<span class="s">3035551234</span>

<span class="c"># campaign-scoped</span>
...&<span class="k">function</span>=<span class="s">dnc_add</span>&<span class="k">phone_number</span>=<span class="s">3035551234</span>
&<span class="k">campaign_id</span>=<span class="s">TESTCAMP</span></pre></div>
          <div><p class="codelabel">Response</p><pre>SUCCESS: dnc_add
phone_number|3035551234
scope|SYSTEM
added|Y</pre></div>
        </div>
      </section>

      <section class="fn" id="dnc_check">
        <div class="fn-head"><span class="chip get">GET</span><h2>dnc_check</h2></div>
        <p>Check DNC membership. Reports system DNC and, when <code>campaign_id</code> is given, campaign DNC.</p>
        <div class="grid split">
          <div><p class="codelabel">Request</p><pre>...&<span class="k">function</span>=<span class="s">dnc_check</span>
&<span class="k">phone_number</span>=<span class="s">3035551234</span>
&<span class="k">campaign_id</span>=<span class="s">TESTCAMP</span></pre></div>
          <div><p class="codelabel">Response</p><pre>SUCCESS: dnc_check
phone_number|3035551234
in_dnc|Y
system_dnc|N
campaign_dnc|Y</pre></div>
        </div>
      </section>

      <div class="footer">
        <p><strong>Notes.</strong> Parameter names match the legacy dialer lead fields, so client code that targeted the old Non-Agent API maps across with a URL and auth change. The <span class="mono">--A--field--B--</span> merge-token syntax is for agent scripts and web forms, not API parameters — send plain values. Functions are added on demand; if you need one that returns <span class="mono">function not implemented in GenX API v1</span>, request it.</p>
      </div>
    </main>
  </div>
</div>
</body>
</html>
