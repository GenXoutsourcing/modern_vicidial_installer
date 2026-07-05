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
const ranges = {
  today: { key: 'today', label: 'Today', days: 1 },
  '7d': { key: '7d', label: '7 Days', days: 7 },
  '30d': { key: '30d', label: '30 Days', days: 30 },
};

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

function resolveRange(value) {
  return ranges[value] || ranges.today;
}

function dateWhere(column, range) {
  if (range.key === 'today') {
    return `${column} >= CURDATE()`;
  }

  return `${column} >= DATE_SUB(CURDATE(), INTERVAL ${range.days - 1} DAY)`;
}

function secondsLabel(seconds) {
  const total = Number(seconds || 0);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
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

async function activitySeries(range) {
  const outboundWhere = dateWhere('call_date', range);

  if (range.key === 'today') {
    const hourlyCalls = await rows(
      `SELECT HOUR(call_date) AS bucket, COUNT(*) AS calls
       FROM (
         SELECT call_date FROM vicidial_log WHERE ${outboundWhere}
         UNION ALL
         SELECT call_date FROM vicidial_closer_log WHERE ${outboundWhere}
       ) c
       GROUP BY HOUR(call_date)
       ORDER BY bucket`,
      [],
      [],
    );
    const hourlyMap = new Map(hourlyCalls.map((item) => [Number(item.bucket), Number(item.calls)]));
    return Array.from({ length: 24 }, (_, hour) => ({
      key: String(hour),
      label: String(hour),
      calls: hourlyMap.get(hour) || 0,
    }));
  }

  const dailyCalls = await rows(
    `SELECT DATE_FORMAT(call_date, '%Y-%m-%d') AS bucket, COUNT(*) AS calls
     FROM (
       SELECT call_date FROM vicidial_log WHERE ${outboundWhere}
       UNION ALL
       SELECT call_date FROM vicidial_closer_log WHERE ${outboundWhere}
     ) c
     GROUP BY DATE_FORMAT(call_date, '%Y-%m-%d')
     ORDER BY bucket`,
    [],
    [],
  );
  const dailyMap = new Map(dailyCalls.map((item) => [String(item.bucket), Number(item.calls || 0)]));
  return Array.from({ length: range.days }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (range.days - index - 1));
    const key = date.toISOString().slice(0, 10);
    return {
      key,
      label: new Intl.DateTimeFormat('en-US', { month: 'numeric', day: 'numeric' }).format(date),
      calls: dailyMap.get(key) || 0,
    };
  });
}

async function dashboardData(selectedRange = 'today') {
  const range = resolveRange(selectedRange);
  const outboundWhere = dateWhere('call_date', range);
  const inboundWhere = dateWhere('call_date', range);
  const [
    activeAgents,
    pausedAgents,
    currentCalls,
    campaignsTotal,
    campaignsActive,
    inboundGroupsActive,
    listsActive,
    leadsTotal,
    callsRangeOutbound,
    callsRangeInbound,
    talkSeconds,
    recordingsRange,
    system,
    callSeries,
    campaignPerformance,
    statusBreakdown,
    leadStatusBreakdown,
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
    scalar(`SELECT COUNT(*) AS value FROM vicidial_log WHERE ${outboundWhere}`, [], 0),
    scalar(`SELECT COUNT(*) AS value FROM vicidial_closer_log WHERE ${inboundWhere}`, [], 0),
    scalar(
      `SELECT COALESCE(SUM(length_in_sec), 0) AS value
       FROM (
         SELECT length_in_sec FROM vicidial_log WHERE ${outboundWhere}
         UNION ALL
         SELECT length_in_sec FROM vicidial_closer_log WHERE ${inboundWhere}
       ) c`,
      [],
      0,
    ),
    scalar(`SELECT COUNT(*) AS value FROM recording_log WHERE ${dateWhere('start_time', range)}`, [], 0),
    systemStatus(),
    activitySeries(range),
    rows(
      `SELECT campaign_id,
              COUNT(*) AS calls,
              COUNT(DISTINCT user) AS users,
              COALESCE(SUM(length_in_sec), 0) AS talk_seconds,
              ROUND(AVG(NULLIF(length_in_sec, 0))) AS avg_seconds
       FROM (
         SELECT campaign_id, user, length_in_sec FROM vicidial_log WHERE ${outboundWhere}
         UNION ALL
         SELECT campaign_id, user, length_in_sec FROM vicidial_closer_log WHERE ${inboundWhere}
       ) c
       GROUP BY campaign_id
       ORDER BY calls DESC, campaign_id ASC
       LIMIT 12`,
      [],
      [],
    ),
    rows(
      `SELECT status, COUNT(*) AS calls
       FROM (
         SELECT status FROM vicidial_log WHERE ${outboundWhere}
         UNION ALL
         SELECT status FROM vicidial_closer_log WHERE ${inboundWhere}
       ) c
       GROUP BY status
       ORDER BY calls DESC, status ASC
       LIMIT 10`,
      [],
      [],
    ),
    rows(
      `SELECT status, COUNT(*) AS leads
       FROM vicidial_list
       GROUP BY status
       ORDER BY leads DESC, status ASC
       LIMIT 10`,
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

  const callsInRange = Number(callsRangeOutbound) + Number(callsRangeInbound);
  const averageSeconds = callsInRange > 0 ? Math.round(Number(talkSeconds || 0) / callsInRange) : 0;

  return {
    generatedAt: new Date().toISOString(),
    range,
    metrics: {
      activeAgents: Number(activeAgents),
      pausedAgents: Number(pausedAgents),
      currentCalls: Number(currentCalls),
      campaignsTotal: Number(campaignsTotal),
      campaignsActive: Number(campaignsActive),
      inboundGroupsActive: Number(inboundGroupsActive),
      listsActive: Number(listsActive),
      leadsTotal: Number(leadsTotal),
      callsToday: callsInRange,
      outboundCalls: Number(callsRangeOutbound),
      inboundCalls: Number(callsRangeInbound),
      talkSeconds: Number(talkSeconds || 0),
      talkTimeLabel: secondsLabel(talkSeconds),
      averageSeconds,
      recordingsToday: Number(recordingsRange),
    },
    system,
    hourlyCalls: callSeries,
    campaignPerformance: campaignPerformance.map((item) => ({
      ...item,
      calls: Number(item.calls || 0),
      users: Number(item.users || 0),
      talk_seconds: Number(item.talk_seconds || 0),
      avg_seconds: Number(item.avg_seconds || 0),
      talk_time_label: secondsLabel(item.talk_seconds),
    })),
    statusBreakdown: statusBreakdown.map((item) => ({
      ...item,
      calls: Number(item.calls || 0),
    })),
    leadStatusBreakdown: leadStatusBreakdown.map((item) => ({
      ...item,
      leads: Number(item.leads || 0),
    })),
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

app.get('/api/dashboard', requireAccess, async (req, res) => {
  try {
    res.json({ ok: true, data: await dashboardData(req.query.range) });
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
