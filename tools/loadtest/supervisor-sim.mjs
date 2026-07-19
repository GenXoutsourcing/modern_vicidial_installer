#!/usr/bin/env node
// ============================================================================
// Supervisor tier: simulates floor managers with Mission Control open — the
// standing web/DB load a real call-center floor puts on the admin UI.
// Mirrors the real client's cadence: /api/dashboard every 5s (DASHBOARD_POLL_MS)
// and the /api/admin catalog every 30s per logged-in supervisor.
//
// Usage (on the admin box):
//   USERS="2001:demo224203,2002:demo727578,2003:demo311114" node supervisor-sim.mjs
// ============================================================================

const BASE = process.env.BASE || 'https://admin.viciboxclone.genxcontactcenter.com/genx/api';
const USERS = (process.env.USERS || '').split(',').map((s) => s.trim()).filter(Boolean)
  .map((s) => { const [user, pass] = s.split(':'); return { user, pass }; });

const stats = { dash: 0, admin: 0, errors: 0, lat: [] };
const pct = (p) => {
  if (!stats.lat.length) return 0;
  const s = [...stats.lat].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
};

async function api(path, token, body) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  stats.lat.push(Date.now() - t0);
  if (stats.lat.length > 4000) stats.lat.splice(0, 1000);
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload?.error || `http_${res.status}`);
  return payload;
}

async function runSupervisor({ user, pass }) {
  try {
    const login = await api('/login', '', { username: user, password: pass });
    const token = login.token;
    console.log(`[${user}] supervisor logged in`);
    setInterval(() => { api('/dashboard', token).then(() => { stats.dash += 1; }).catch(() => { stats.errors += 1; }); }, 5000);
    setInterval(() => { api('/admin', token).then(() => { stats.admin += 1; }).catch(() => { stats.errors += 1; }); }, 30000);
    api('/dashboard', token).catch(() => {});
    api('/admin', token).catch(() => {});
  } catch (e) {
    console.log(`[${user}] LOGIN FAILED: ${e.message}`);
  }
}

if (!USERS.length) { console.error('USERS env required (user:pass,comma-separated)'); process.exit(1); }
USERS.forEach((u, i) => setTimeout(() => runSupervisor(u), i * 3000));
setInterval(() => {
  console.log(`--- supervisors: dash=${stats.dash} admin=${stats.admin} errors=${stats.errors} lat p50=${pct(50)}ms p95=${pct(95)}ms`);
}, 30000);
