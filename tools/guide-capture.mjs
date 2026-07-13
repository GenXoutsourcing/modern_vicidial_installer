// Refreshes the /genxguide/ screenshots (genx-ui/guide/img/*.jpg).
// Runs headless on the admin web box itself — the cluster firewall blocks
// outside browsers, and the guide is written for the ADMIN floor-manager
// role, so capture as the standing 7777 test account.
//
// One-time setup on the box:
//   mkdir -p /root/uiguide && cd /root/uiguide && npm init -y >/dev/null \
//     && npm i playwright >/dev/null \
//     && npx playwright install --with-deps chromium
// Run:
//   GENX_PASS='<7777 password>' node guide-capture.mjs
// Output lands in ./out; copy into the repo's genx-ui/guide/img/ and deploy.
import { chromium } from 'playwright';
import fs from 'fs';

const BASE = process.env.GENX_URL || 'https://admin.viciboxclone.genxcontactcenter.com/genx/';
const USER = process.env.GENX_USER || '7777';
const PASS = process.env.GENX_PASS;
if (!PASS) { console.error('GENX_PASS is required'); process.exit(1); }
fs.mkdirSync('out', { recursive: true });

const browser = await chromium.launch();
// 1720 wide: the Mission Control metric row is 7 cards on desktop and only
// wraps below ~1500px — capture at a width where the guide shows the full row.
const page = await browser.newPage({ viewport: { width: 1720, height: 950 }, ignoreHTTPSErrors: true });

const shot = (name) => page.screenshot({ path: `out/${name}.jpg`, type: 'jpeg', quality: 82, fullPage: true });
const settle = async (ms = 1200) => {
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(ms);
};
const view = async (hash, name, ms) => {
  await page.evaluate((h) => { window.location.hash = h; }, hash);
  await settle(ms);
  await shot(name);
};
const tryClick = async (selector) => {
  try {
    await page.locator(selector).first().click({ timeout: 4000 });
    await settle();
    return true;
  } catch { return false; }
};
// Modal close: Escape works app-wide (backdropCloseProps handles the rest).
const closeModal = async () => { await page.keyboard.press('Escape'); await settle(600); };

await page.goto(BASE, { waitUntil: 'networkidle' });
await settle(800);
await shot('01-login');
await page.fill('#vicidial-user', USER);
await page.fill('#vicidial-password', PASS);
await page.click('button.primary-action');
await settle(3000);
await shot('02-command');

await view('/users', '03-users');
if (await tryClick('table button:has-text("Manage")') || await tryClick('table button:has-text("Edit")')) {
  await shot('04-user-edit');
  await closeModal();
}
await view('/remoteAgents', '05-remote-agents');
await view('/campaigns', '06-campaigns');
if (await tryClick('button:has-text("Basic")')) {
  await shot('07-campaign-basic');
  await closeModal();
}
await view('/callTimes', '09-call-times');
await view('/scripts', '10-scripts');
await view('/leadFilters', '11-filters');
await view('/lists', '12-lists', 2000);
await view('/leadSearch', '14-lead-search');
await view('/leadLoader', '15-lead-loader');
await view('/dnc', '16-dnc');
await view('/dropLists', '17-drop-lists');
await view('/inbound', '18-inbound');
if (await tryClick('button:has-text("Manage")')) {
  await shot('19-ingroup-edit');
  await closeModal();
}
await view('/dids', '20-dids');
await view('/callMenus', '21-call-menus');
await view('/filterPhoneGroups', '22-filter-groups');
await view('/reports', '23-reports');
await view('/recordings', '24-recordings', 2000);

// SuperAdmin guide shots (guide/superadmin.html) — needs a SUPERADMIN
// account (standing test login 8888). Skipped when GENX_SA_PASS is unset.
const SA_USER = process.env.GENX_SA_USER || '8888';
const SA_PASS = process.env.GENX_SA_PASS;
if (SA_PASS) {
  const sa = await browser.newPage({ viewport: { width: 1720, height: 950 }, ignoreHTTPSErrors: true });
  const saShot = (name) => sa.screenshot({ path: `out/${name}.jpg`, type: 'jpeg', quality: 82, fullPage: true });
  const saSettle = async (ms = 1200) => {
    await sa.waitForLoadState('networkidle').catch(() => {});
    await sa.waitForTimeout(ms);
  };
  const saView = async (hash, name, ms) => {
    await sa.evaluate((h) => { window.location.hash = h; }, hash);
    await saSettle(ms);
    await saShot(name);
  };
  await sa.goto(BASE, { waitUntil: 'networkidle' });
  await saSettle(800);
  await sa.fill('#vicidial-user', SA_USER);
  await sa.fill('#vicidial-password', SA_PASS);
  await sa.click('button.primary-action');
  await saSettle(1500);
  // SuperAdmins have both-UI access, so the sign-in shows the destination
  // choice — capture it, then continue into the console.
  await saShot('sa-00-choice');
  try { await sa.locator('button:has-text("Admin Console")').first().click({ timeout: 4000 }); } catch {}
  await saSettle(3000);
  await saView('/userGroups', 'sa-01-groups');
  try {
    await sa.locator('table button:has-text("Manage")').first().click({ timeout: 4000 });
    await saSettle();
    await saShot('sa-02-group-edit');
    await sa.keyboard.press('Escape');
    await saSettle(600);
  } catch {}
  await saView('/statuses', 'sa-03-statuses');
  await saView('/phones', 'sa-04-phones');
  await saView('/shifts', 'sa-05-shifts');
  await saView('/system', 'sa-06-system', 2000);
  await saView('/systemSettings', 'sa-07-settings');
  await saView('/mediaTools', 'sa-08-media-tools', 2000);
  await saView('/adminReports', 'sa-09-admin-reports');
  await sa.close();
}

await browser.close();
console.log(`done: ${fs.readdirSync('out').length} screenshots in ./out`);
