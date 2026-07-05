import express from 'express';
import mysql from 'mysql2/promise';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const config = {
  port: Number(process.env.GENX_UI_PORT || 3200),
  accessCode: process.env.GENX_UI_ACCESS_CODE || '',
  db: {
    host: process.env.GENX_UI_DB_HOST || '127.0.0.1',
    port: Number(process.env.GENX_UI_DB_PORT || 3306),
    user: process.env.GENX_UI_DB_USER || 'cron',
    password: process.env.GENX_UI_DB_PASS || '',
    database: process.env.GENX_UI_DB_NAME || 'asterisk',
    waitForConnections: true,
    connectionLimit: Number(process.env.GENX_UI_DB_POOL || 6),
    namedPlaceholders: true,
  },
};

const app = express();
const pool = mysql.createPool(config.db);

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

function isAuthorized(req) {
  if (!config.accessCode) return true;
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  return token && token === config.accessCode;
}

function requireAccess(req, res, next) {
  if (isAuthorized(req)) return next();
  return res.status(401).json({ ok: false, error: 'access_required' });
}

async function scalar(sql, params = [], fallback = 0) {
  try {
    const [rows] = await pool.query(sql, params);
    const row = rows?.[0] || {};
    const value = row.value ?? Object.values(row)[0];
    return value ?? fallback;
  } catch (error) {
    return fallback;
  }
}

async function rows(sql, params = [], fallback = []) {
  try {
    const [result] = await pool.query(sql, params);
    return result;
  } catch (error) {
    return fallback;
  }
}

async function systemStatus() {
  const [identity] = await rows(
    "SELECT @@hostname AS hostname, @@version AS version, DATABASE() AS database_name, NOW() AS db_time",
    [],
    [{}],
  );

  return {
    dbOnline: Boolean(identity?.hostname),
    hostname: identity?.hostname || 'unknown',
    version: identity?.version || 'unknown',
    database: identity?.database_name || config.db.database,
    dbTime: identity?.db_time || null,
  };
}

async function dashboardData() {
  const [
    activeAgents,
    pausedAgents,
    currentCalls,
    campaignsTotal,
    campaignsActive,
    inboundGroupsActive,
    listsActive,
    leadsTotal,
    callsTodayOutbound,
    callsTodayInbound,
    recordingsToday,
    system,
    hourlyCalls,
    campaigns,
    agents,
  ] = await Promise.all([
    scalar('SELECT COUNT(*) AS value FROM vicidial_live_agents', [], 0),
    scalar("SELECT COUNT(*) AS value FROM vicidial_live_agents WHERE status = 'PAUSED'", [], 0),
    scalar('SELECT COUNT(*) AS value FROM vicidial_auto_calls', [], 0),
    scalar('SELECT COUNT(*) AS value FROM vicidial_campaigns', [], 0),
    scalar("SELECT COUNT(*) AS value FROM vicidial_campaigns WHERE active = 'Y'", [], 0),
    scalar("SELECT COUNT(*) AS value FROM vicidial_inbound_groups WHERE active = 'Y'", [], 0),
    scalar("SELECT COUNT(*) AS value FROM vicidial_lists WHERE active = 'Y'", [], 0),
    scalar('SELECT COUNT(*) AS value FROM vicidial_list', [], 0),
    scalar('SELECT COUNT(*) AS value FROM vicidial_log WHERE call_date >= CURDATE()', [], 0),
    scalar('SELECT COUNT(*) AS value FROM vicidial_closer_log WHERE call_date >= CURDATE()', [], 0),
    scalar('SELECT COUNT(*) AS value FROM recording_log WHERE start_time >= CURDATE()', [], 0),
    systemStatus(),
    rows(
      `SELECT HOUR(call_date) AS hour, COUNT(*) AS calls
       FROM (
         SELECT call_date FROM vicidial_log WHERE call_date >= CURDATE()
         UNION ALL
         SELECT call_date FROM vicidial_closer_log WHERE call_date >= CURDATE()
       ) c
       GROUP BY HOUR(call_date)
       ORDER BY hour`,
      [],
      [],
    ),
    rows(
      `SELECT campaign_id, campaign_name, active, dial_method, hopper_level, lead_order
       FROM vicidial_campaigns
       ORDER BY active DESC, campaign_id ASC
       LIMIT 12`,
      [],
      [],
    ),
    rows(
      `SELECT user, status, campaign_id, server_ip, calls_today, last_call_time, pause_code
       FROM vicidial_live_agents
       ORDER BY last_update_time DESC
       LIMIT 24`,
      [],
      [],
    ),
  ]);

  const hourlyMap = new Map(hourlyCalls.map((item) => [Number(item.hour), Number(item.calls)]));
  const series = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    calls: hourlyMap.get(hour) || 0,
  }));

  return {
    generatedAt: new Date().toISOString(),
    metrics: {
      activeAgents: Number(activeAgents),
      pausedAgents: Number(pausedAgents),
      currentCalls: Number(currentCalls),
      campaignsTotal: Number(campaignsTotal),
      campaignsActive: Number(campaignsActive),
      inboundGroupsActive: Number(inboundGroupsActive),
      listsActive: Number(listsActive),
      leadsTotal: Number(leadsTotal),
      callsToday: Number(callsTodayOutbound) + Number(callsTodayInbound),
      recordingsToday: Number(recordingsToday),
    },
    system,
    hourlyCalls: series,
    campaigns,
    agents,
  };
}

app.get('/api/health', async (_req, res) => {
  try {
    const system = await systemStatus();
    res.json({
      ok: system.dbOnline,
      authRequired: Boolean(config.accessCode),
      system,
    });
  } catch (error) {
    res.status(500).json({ ok: false, authRequired: Boolean(config.accessCode), error: 'db_unavailable' });
  }
});

app.post('/api/login', (req, res) => {
  if (!config.accessCode) {
    return res.json({ ok: true, token: '' });
  }

  if (req.body?.accessCode === config.accessCode) {
    return res.json({ ok: true, token: config.accessCode });
  }

  return res.status(401).json({ ok: false, error: 'invalid_access_code' });
});

app.get('/api/dashboard', requireAccess, async (_req, res) => {
  try {
    res.json({ ok: true, data: await dashboardData() });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'dashboard_unavailable' });
  }
});

app.use(express.static(distDir, {
  etag: true,
  maxAge: '1h',
  index: false,
}));

app.get('*', (_req, res) => {
  res.sendFile(path.join(distDir, 'index.html'));
});

app.listen(config.port, '127.0.0.1', () => {
  console.log(`GenX UI listening on 127.0.0.1:${config.port}`);
});
