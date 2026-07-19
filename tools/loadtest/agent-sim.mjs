#!/usr/bin/env node
// ============================================================================
// GenX agent-side load simulator. Drives the SAME genx-ui HTTP endpoints the
// real agent console uses, at the same 2s poll cadence:
//   auth -> login -> webphone-call -> status poll -> (INCALL: dispo-statuses/
//   script/web-forms) -> hangup -> dispo -> ready ... -> logout
//
// Two modes per agent:
//   protocol : full lifecycle; the phone leg is an EXTERNAL/Local auto-answer
//              exten served by the genx-loadtest dialplan.
//   driver   : pairs with a real headless-browser webphone session started by
//              webphone-agents.mjs — auth re-attaches to the browser's live
//              row, then this driver does ready/hangup/dispo via the API while
//              the browser keeps the WebRTC leg alive.
//
// Usage (on the admin box):
//   node agent-sim.mjs                          # defaults below
//   PROTOCOL=LT201-LT215 DRIVERS=LT101-LT110 RUN_MINUTES=30 node agent-sim.mjs
// ============================================================================

const BASE = process.env.BASE || 'https://admin.viciboxclone.genxcontactcenter.com/genx/api';
const CAMPAIGN = process.env.CAMPAIGN || 'LOADTEST';
const RUN_MINUTES = Number(process.env.RUN_MINUTES || 30);
const RAMP_SECONDS = Number(process.env.RAMP_SECONDS || 60);
const POLL_MS = 2000;

function parseRange(spec) {
  if (!spec) return [];
  const m = String(spec).match(/^([A-Za-z]+)(\d+)-[A-Za-z]+(\d+)$/);
  if (!m) return spec.split(',').filter(Boolean);
  const out = [];
  for (let i = Number(m[2]); i <= Number(m[3]); i += 1) out.push(`${m[1]}${i}`);
  return out;
}
const PROTOCOL_AGENTS = parseRange(process.env.PROTOCOL ?? 'LT201-LT215');
const DRIVER_AGENTS = parseRange(process.env.DRIVERS ?? '');

const DISPO_WEIGHTS = { NI: 28, N: 18, NP: 12, DC: 8, SALE: 5, DNC: 3, DEC: 8, A: 6, AA: 4 };

const stats = {
  startedAt: new Date().toISOString(),
  calls: 0, dispos: 0, hangups: 0, errors: 0, pollErrors: 0,
  latencies: [], // status-poll ms, rolling window
  perAgent: {},
};
function recordLatency(ms) {
  stats.latencies.push(ms);
  if (stats.latencies.length > 5000) stats.latencies.splice(0, 1000);
}
function pct(arr, p) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  return Math.round(s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]);
}
const rand = (min, max) => min + Math.random() * (max - min);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(path, token, body) {
  const started = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const ms = Date.now() - started;
  let payload = null;
  try { payload = await res.json(); } catch { payload = {}; }
  if (!res.ok) {
    const err = new Error(payload?.error || `http_${res.status}`);
    err.status = res.status;
    throw err;
  }
  return { payload, ms };
}

function pickDispo(statuses) {
  const avail = (statuses || []).map((s) => String(s.status)).filter((s) => s && s !== 'CALLBK' && s !== 'XFER');
  const weighted = avail.filter((s) => DISPO_WEIGHTS[s]);
  const pool = weighted.length ? weighted : avail;
  if (!pool.length) return 'NI';
  if (weighted.length) {
    const total = pool.reduce((t, s) => t + DISPO_WEIGHTS[s], 0);
    let roll = Math.random() * total;
    for (const s of pool) { roll -= DISPO_WEIGHTS[s]; if (roll <= 0) return s; }
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

class Agent {
  constructor(user, mode) {
    this.user = user;
    this.mode = mode; // 'protocol' | 'driver'
    this.pass = `GxLoad${user}`;
    this.token = null;
    this.stopFlag = false;
    this.uniqueid = '';
    this.custGone = 0;
    this.plannedHangAt = 0;
    this.fetchedSession = false;
    this.st = stats.perAgent[user] = { calls: 0, dispos: 0, errors: 0, state: 'init' };
  }

  log(msg) { console.log(`${new Date().toISOString().slice(11, 19)} [${this.user}] ${msg}`); }

  async start() {
    try {
      const { payload } = await api('/agent/auth', '', { user: this.user, pass: this.pass });
      this.token = payload.token;
      let live = payload.live;
      if (this.mode === 'driver') {
        // Wait for the browser session to create the live row.
        while (!live && !this.stopFlag) {
          await sleep(3000);
          live = (await api('/agent/status', this.token)).payload.live;
        }
        this.log('attached to browser session');
      } else if (!live) {
        try {
          await api('/agent/login', this.token, { campaign_id: CAMPAIGN });
        } catch (e) {
          if (e.message === 'timeclock_required') {
            await api('/agent/timeclock', this.token, { action: 'in' });
            await api('/agent/login', this.token, { campaign_id: CAMPAIGN });
          } else if (e.message !== 'already_logged_in') throw e;
        }
        await sleep(2500);
        await api('/agent/webphone-call', this.token, {});
        this.log('logged in, phone leg ringing into conference');
        await sleep(2500);
      }
      await api('/agent/ready', this.token, {}).catch(() => {});
      this.st.state = 'ready';
      await this.loop();
    } catch (e) {
      this.st.errors += 1; stats.errors += 1;
      this.log(`FATAL ${e.message}`);
      this.st.state = `dead:${e.message}`;
    }
  }

  async loop() {
    while (!this.stopFlag) {
      const tick = Date.now();
      try {
        const { payload, ms } = await api('/agent/status', this.token);
        recordLatency(ms);
        const live = payload.live;
        if (!live) { this.st.state = 'logged-out'; return; }
        const leadId = Number(live.lead_id || 0);

        if (live.status === 'INCALL' && leadId > 0) {
          this.st.state = 'incall';
          if (this.uniqueid !== String(live.uniqueid || '')) {
            // new call: mirror the client's on-call fetches
            this.uniqueid = String(live.uniqueid || '');
            this.custGone = 0;
            stats.calls += 1; this.st.calls += 1;
            this.plannedHangAt = Math.random() < 0.45 ? Date.now() + rand(15000, 60000) : 0;
            api('/agent/dispo-statuses', this.token).then((r) => { this.dispoStatuses = r.payload.statuses || []; }).catch(() => {});
            if (!this.fetchedSession) {
              this.fetchedSession = true;
              api('/agent/web-forms', this.token).catch(() => {});
            }
            api('/agent/script', this.token).catch(() => {});
          }
          // dead-call detection, same 2-poll rule as the client
          if (payload.customerChannels === 0) this.custGone += 1; else this.custGone = 0;
          if (this.custGone >= 2 || (this.plannedHangAt && Date.now() >= this.plannedHangAt)) {
            stats.hangups += 1;
            await api('/agent/hangup', this.token, {}).catch(() => {});
            this.plannedHangAt = 0;
          }
        } else if (live.status !== 'INCALL' && leadId > 0) {
          // dispo screen: wrap-up delay then disposition + resume, like a human
          this.st.state = 'dispo';
          await sleep(rand(2000, 6000));
          const dispo = pickDispo(this.dispoStatuses);
          const comments = Math.random() < 0.25 ? `loadtest note ${Date.now()}` : '';
          await api('/agent/dispo', this.token, { status: dispo, comments }).catch((e) => {
            this.st.errors += 1; stats.errors += 1; this.log(`dispo failed: ${e.message}`);
          });
          stats.dispos += 1; this.st.dispos += 1;
          this.uniqueid = '';
          await sleep(rand(1000, 3000));
          await api('/agent/ready', this.token, {}).catch(() => {});
          this.st.state = 'ready';
        } else {
          this.st.state = live.status === 'READY' ? 'ready' : `idle:${live.status}`;
          if (live.status === 'PAUSED') await api('/agent/ready', this.token, {}).catch(() => {});
        }
      } catch (e) {
        if (e.status === 401) { this.st.state = 'session-expired'; return; }
        stats.pollErrors += 1;
      }
      const elapsed = Date.now() - tick;
      await sleep(Math.max(200, POLL_MS - elapsed));
    }
  }

  async stop() {
    this.stopFlag = true;
    if (this.token) {
      await api('/agent/logout', this.token, {}).catch(() => {});
      this.log('logged out');
    }
  }
}

async function main() {
  const agents = [
    ...PROTOCOL_AGENTS.map((u) => new Agent(u, 'protocol')),
    ...DRIVER_AGENTS.map((u) => new Agent(u, 'driver')),
  ];
  if (!agents.length) { console.error('no agents configured (PROTOCOL/DRIVERS env)'); process.exit(1); }
  console.log(`starting ${agents.length} agents (${PROTOCOL_AGENTS.length} protocol, ${DRIVER_AGENTS.length} driver) -> ${BASE}, campaign ${CAMPAIGN}, ${RUN_MINUTES}min run, ${RAMP_SECONDS}s ramp`);

  const step = agents.length > 1 ? (RAMP_SECONDS * 1000) / (agents.length - 1) : 0;
  agents.forEach((a, i) => setTimeout(() => a.start(), Math.round(i * step)));

  const report = setInterval(() => {
    const states = {};
    for (const a of agents) states[a.st.state] = (states[a.st.state] || 0) + 1;
    console.log(`--- calls=${stats.calls} dispos=${stats.dispos} hangups=${stats.hangups} errors=${stats.errors} pollErr=${stats.pollErrors} `
      + `poll p50=${pct(stats.latencies, 50)}ms p95=${pct(stats.latencies, 95)}ms max=${pct(stats.latencies, 100)}ms `
      + `| ${Object.entries(states).map(([k, v]) => `${k}:${v}`).join(' ')}`);
  }, 30000);

  const shutdown = async () => {
    clearInterval(report);
    console.log('shutting down: logging all agents out...');
    await Promise.allSettled(agents.map((a) => a.stop()));
    const fs = await import('node:fs');
    fs.writeFileSync('/tmp/genx-loadtest-sim-stats.json', JSON.stringify({
      ...stats,
      latencies: undefined,
      pollP50: pct(stats.latencies, 50), pollP95: pct(stats.latencies, 95), pollMax: pct(stats.latencies, 100),
      endedAt: new Date().toISOString(),
    }, null, 2));
    console.log('final stats written to /tmp/genx-loadtest-sim-stats.json');
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  setTimeout(shutdown, RUN_MINUTES * 60000);
}

main();
