#!/usr/bin/env node
// ============================================================================
// CRM tier: simulates external CRM/API traffic against the GenX API
// (genxapi/api.php — PHP, so this load lands on php-fpm + mysqli exactly like
// a production integration). Weighted function mix at RATE req/sec:
//   lead_info 40% / dnc_check 20% / add_lead 20% / update_lead 10% /
//   campaigns_list+lead_status_count 10%
// add_lead inserts NEW leads into the LOADTEST list (8127xxxxxx numbers), so
// the dialer's lead pool grows live — same as a client posting web leads
// during dialing.
//
// Usage: RATE=3 node crm-sim.mjs   (apitest01 service account)
// ============================================================================

const API = process.env.API || 'https://admin.viciboxclone.genxcontactcenter.com/genxapi/api.php';
const USER = process.env.API_USER || 'apitest01';
const PASS = process.env.API_PASS || 'GenxApiTest123';
const RATE = Number(process.env.RATE || 3); // requests per second
const LIST_ID = process.env.LIST_ID || '601';

const stats = { total: 0, errors: 0, byFn: {}, lat: [] };
let addSeq = Math.floor(Math.random() * 1000) * 100; // spread add_lead numbers across runs
const rand = (a) => a[Math.floor(Math.random() * a.length)];
const pct = (p) => {
  if (!stats.lat.length) return 0;
  const s = [...stats.lat].sort((x, y) => x - y);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};

async function call(fn, extra = {}) {
  const params = new URLSearchParams({ user: USER, pass: PASS, function: fn, source: 'loadtest-crm', ...extra });
  const t0 = Date.now();
  try {
    const res = await fetch(`${API}?${params}`);
    const text = await res.text();
    stats.lat.push(Date.now() - t0);
    if (stats.lat.length > 4000) stats.lat.splice(0, 1000);
    stats.total += 1;
    stats.byFn[fn] = (stats.byFn[fn] || 0) + 1;
    // HTTP-level failure (5xx, gateway timeout, empty body) is the failure the CRM
    // tier exists to surface — count it regardless of what the body says.
    if (!res.ok) { stats.errors += 1; return; }
    // App-level error in the body. "ERROR: no ..." (e.g. no matching lead on a
    // lead_info/dnc_check) is a normal negative result, not a failure.
    if (text.startsWith('ERROR') && !text.startsWith('ERROR: no')) { stats.errors += 1; }
  } catch {
    stats.errors += 1;
  }
}

function randomKnownPhone() {
  // numbers from the seeded lead ranges (mostly real rows -> indexed lookups)
  return Math.random() < 0.5
    ? String(8125560000 + Math.floor(Math.random() * 5000))
    : String(8125700000 + Math.floor(Math.random() * 95000));
}

function fire() {
  const roll = Math.random() * 100;
  if (roll < 40) {
    call('lead_info', { phone_number: randomKnownPhone() });
  } else if (roll < 60) {
    call('dnc_check', { phone_number: randomKnownPhone() });
  } else if (roll < 80) {
    addSeq += 1;
    call('add_lead', {
      list_id: LIST_ID,
      phone_number: String(8127000000 + addSeq),
      first_name: 'CrmSim',
      last_name: `Lead${addSeq}`,
      state: rand(['FL', 'TX', 'OH', 'CA', 'NY']),
    });
  } else if (roll < 90) {
    call('update_lead', { phone_number_lookup: randomKnownPhone(), comments: `crm touch ${Date.now()}` });
  } else {
    call(rand(['campaigns_list', 'lead_status_count']), { campaign_id: 'LOADTEST' });
  }
}

console.log(`CRM sim -> ${API} at ${RATE} req/s`);
setInterval(fire, Math.max(50, Math.round(1000 / RATE)));
setInterval(() => {
  console.log(`--- crm: total=${stats.total} errors=${stats.errors} lat p50=${pct(50)}ms p95=${pct(95)}ms | ${Object.entries(stats.byFn).map(([k, v]) => `${k}:${v}`).join(' ')}`);
}, 30000);
