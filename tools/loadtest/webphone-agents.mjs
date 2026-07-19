#!/usr/bin/env node
// ============================================================================
// Webphone tier: real headless-Chromium agent sessions. Each agent loads the
// actual genx-ui agent console, logs in through the real login form, and keeps
// the ViciPhone WebRTC webphone (WSS/DTLS/opus to the sip boxes) alive for the
// whole run — the exact human agent path. Call handling (ready/hangup/dispo)
// is done by paired 'driver' agents in agent-sim.mjs via the same API the
// console uses.
//
// Usage (on the admin box, after `npm i playwright` in this dir):
//   AGENTS=LT101-LT110 node webphone-agents.mjs
// ============================================================================
import { chromium } from 'playwright';

const BASE_UI = process.env.BASE_UI || 'https://admin.viciboxclone.genxcontactcenter.com/genx/agent';
const CAMPAIGN = process.env.CAMPAIGN || 'LOADTEST';
// Renderer main-thread throttle (CDP). The page only needs to keep ViciPhone
// registered and auto-answer; WebRTC media runs on unthrottled native threads.
// Cuts per-browser CPU so one 12-core box can host the whole 100-phone fleet.
const CPU_THROTTLE = Number(process.env.CPU_THROTTLE || 3);

function parseRange(spec) {
  const m = String(spec).match(/^([A-Za-z]+)(\d+)-[A-Za-z]+(\d+)$/);
  if (!m) return String(spec).split(',').filter(Boolean);
  const out = [];
  for (let i = Number(m[2]); i <= Number(m[3]); i += 1) out.push(`${m[1]}${i}`);
  return out;
}
const AGENTS = parseRange(process.env.AGENTS || 'LT101-LT110');
const log = (u, msg) => console.log(`${new Date().toISOString().slice(11, 19)} [${u}] ${msg}`);

async function loginAgent(browser, user) {
  const context = await browser.newContext({ permissions: ['microphone'] });
  const page = await context.newPage();
  page.on('pageerror', (e) => log(user, `pageerror: ${e.message}`));
  await page.goto(BASE_UI, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('User Login').fill(user);
  await page.getByLabel('User Password').fill(`GxLoad${user}`);
  // Focusing the campaign select triggers the auth + campaign fetch.
  await page.getByLabel('Campaign').focus();
  await page.waitForFunction(
    (c) => [...document.querySelectorAll('option')].some((o) => o.value === c),
    CAMPAIGN,
    { timeout: 20000 },
  );
  await page.getByLabel('Campaign').selectOption(CAMPAIGN);
  await page.getByRole('button', { name: 'Submit' }).click();
  // Console up = webphone iframe present (attached — it renders collapsed, so
  // it is never "visible"); ViciPhone then registers over WSS and the client's
  // own webphone-call trigger rings it into the conference (auto-answer).
  await page.waitForSelector('iframe', { state: 'attached', timeout: 30000 });
  if (CPU_THROTTLE > 1) {
    const cdp = await context.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
  }
  log(user, 'agent console up, webphone iframe loaded');
  return { context, page, user };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  });
  const sessions = [];
  for (const user of AGENTS) {
    try {
      sessions.push(await loginAgent(browser, user));
      await new Promise((r) => setTimeout(r, 1500));
    } catch (e) {
      log(user, `LOGIN FAILED: ${e.message}`);
    }
  }
  console.log(`${sessions.length}/${AGENTS.length} webphone agents up — keeping sessions alive (SIGTERM to stop)`);

  const shutdown = async () => {
    console.log('closing webphone sessions...');
    await browser.close().catch(() => {});
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  // Periodic health line: confirm pages are still alive.
  setInterval(() => {
    console.log(`webphones alive: ${sessions.filter((s) => !s.page.isClosed()).length}/${sessions.length}`);
  }, 60000);
}

main();
