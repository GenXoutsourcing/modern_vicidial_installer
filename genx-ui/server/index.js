import express from 'express';
import mysql from 'mysql2/promise';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

const config = {
  port: Number(process.env.GENX_UI_PORT || 3200),
  minUserLevel: Number(process.env.GENX_UI_MIN_USER_LEVEL || 7),
  sessionTtlMs: Number(process.env.GENX_UI_SESSION_TTL_MS || 8 * 60 * 60 * 1000),
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
const sessions = new Map();
const ranges = {
  today: { key: 'today', label: 'Today', days: 1 },
  '7d': { key: '7d', label: '7 Days', days: 7 },
  '30d': { key: '30d', label: '30 Days', days: 30 },
};

app.disable('x-powered-by');
app.use(express.json({ limit: '64kb' }));

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function digest(value, algorithm) {
  return crypto.createHash(algorithm).update(String(value || '')).digest('hex');
}

function passwordMatches(input, stored) {
  if (!stored) return false;
  const password = String(input || '');
  const expected = String(stored || '');
  const candidates = [
    password,
    digest(password, 'md5'),
    digest(password, 'sha1'),
    digest(password, 'sha256'),
  ];

  return candidates.some((candidate) => safeEqual(candidate, expected));
}

function publicUser(row) {
  return {
    user: row.user,
    fullName: row.full_name || row.user,
    userGroup: row.user_group || '',
    userLevel: Number(row.user_level || 0),
    viewReports: row.view_reports === '1',
    modifyCampaigns: row.modify_campaigns === '1',
    modifyLists: row.modify_lists === '1',
    modifyUsers: row.modify_users === '1',
  };
}

function createSession(user) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, {
    user,
    expiresAt: Date.now() + config.sessionTtlMs,
  });
  return token;
}

function sessionFromRequest(req) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt <= Date.now()) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + config.sessionTtlMs;
  return session;
}

function requireAccess(req, res, next) {
  const session = sessionFromRequest(req);
  if (session?.user?.userLevel >= config.minUserLevel) {
    req.genxUser = session.user;
    return next();
  }
  return res.status(401).json({ ok: false, error: 'access_required' });
}

async function authenticateVicidialUser(username, password) {
  const login = String(username || '').trim();
  if (!login || !password) return null;

  const [user] = await rows(
    `SELECT user,
            pass,
            full_name,
            user_level,
            user_group,
            active,
            view_reports,
            modify_campaigns,
            modify_lists,
            modify_users
     FROM vicidial_users
     WHERE user = ?
     LIMIT 1`,
    [login],
    [],
  );

  if (!user) return null;
  if (user.active !== 'Y') return null;
  if (Number(user.user_level || 0) < config.minUserLevel) return null;
  if (!passwordMatches(password, user.pass)) return null;

  return publicUser(user);
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

async function adminData() {
  const [
    campaigns,
    users,
    lists,
    inboundGroups,
    recordings,
    servers,
    carriers,
  ] = await Promise.all([
    rows(
      `SELECT c.campaign_id,
              c.campaign_name,
              c.campaign_description,
              c.active,
              c.dial_method,
              c.auto_dial_level,
              c.hopper_level,
              c.lead_order,
              c.local_call_time,
              c.campaign_recording,
              c.campaign_allow_inbound,
              c.campaign_changedate,
              COALESCE(list_counts.list_count, 0) AS list_count,
              COALESCE(list_counts.active_list_count, 0) AS active_list_count,
              COALESCE(lead_counts.lead_count, 0) AS lead_count,
              COALESCE(live_counts.live_agents, 0) AS live_agents
       FROM vicidial_campaigns c
       LEFT JOIN (
         SELECT campaign_id,
                COUNT(*) AS list_count,
                SUM(active = 'Y') AS active_list_count
         FROM vicidial_lists
         GROUP BY campaign_id
       ) list_counts ON list_counts.campaign_id = c.campaign_id
       LEFT JOIN (
         SELECT campaign_id, COUNT(*) AS lead_count
         FROM vicidial_list
         GROUP BY campaign_id
       ) lead_counts ON lead_counts.campaign_id = c.campaign_id
       LEFT JOIN (
         SELECT campaign_id, COUNT(*) AS live_agents
         FROM vicidial_live_agents
         GROUP BY campaign_id
       ) live_counts ON live_counts.campaign_id = c.campaign_id
       ORDER BY c.active DESC, c.campaign_id ASC
       LIMIT 100`,
      [],
      [],
    ),
    rows(
      `SELECT user,
              full_name,
              user_level,
              user_group,
              active,
              email,
              phone_login,
              view_reports,
              modify_campaigns,
              modify_lists,
              modify_users,
              vdc_agent_api_access
       FROM vicidial_users
       ORDER BY active DESC, user_level DESC, user ASC
       LIMIT 200`,
      [],
      [],
    ),
    rows(
      `SELECT l.list_id,
              l.list_name,
              l.campaign_id,
              l.active,
              l.list_description,
              l.list_changedate,
              l.list_lastcalldate,
              l.cache_count,
              l.cache_count_new,
              l.cache_count_dialable_new,
              COALESCE(leads.lead_count, 0) AS lead_count,
              COALESCE(leads.new_leads, 0) AS new_leads,
              COALESCE(leads.called_leads, 0) AS called_leads
       FROM vicidial_lists l
       LEFT JOIN (
         SELECT list_id,
                COUNT(*) AS lead_count,
                SUM(status = 'NEW') AS new_leads,
                SUM(called_count > 0) AS called_leads
         FROM vicidial_list
         GROUP BY list_id
       ) leads ON leads.list_id = l.list_id
       ORDER BY l.active DESC, l.list_id DESC
       LIMIT 100`,
      [],
      [],
    ),
    rows(
      `SELECT group_id,
              group_name,
              group_color,
              active,
              next_agent_call,
              queue_priority,
              drop_call_seconds,
              drop_action,
              call_time_id,
              play_welcome_message,
              no_agent_action,
              hold_time_option
       FROM vicidial_inbound_groups
       ORDER BY active DESC, group_id ASC
       LIMIT 100`,
      [],
      [],
    ),
    rows(
      `SELECT recording_id,
              start_time,
              length_in_sec,
              filename,
              location,
              lead_id,
              user,
              vicidial_id,
              server_ip
       FROM recording_log
       ORDER BY start_time DESC
       LIMIT 60`,
      [],
      [],
    ),
    rows(
      `SELECT server_id,
              server_description,
              server_ip,
              active,
              active_asterisk_server,
              asterisk_version,
              max_vicidial_trunks,
              sysload,
              channels_total,
              cpu_idle_percent,
              disk_usage,
              system_uptime,
              conf_engine,
              web_socket_url,
              external_web_socket_url
       FROM servers
       ORDER BY active DESC, server_id ASC
       LIMIT 50`,
      [],
      [],
    ),
    rows(
      `SELECT carrier_id,
              carrier_name,
              protocol,
              server_ip,
              active,
              carrier_description,
              user_group
       FROM vicidial_server_carriers
       ORDER BY active DESC, carrier_id ASC
       LIMIT 100`,
      [],
      [],
    ),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    counts: {
      campaigns: campaigns.length,
      activeCampaigns: campaigns.filter((item) => item.active === 'Y').length,
      users: users.length,
      activeUsers: users.filter((item) => item.active === 'Y').length,
      lists: lists.length,
      activeLists: lists.filter((item) => item.active === 'Y').length,
      inboundGroups: inboundGroups.length,
      activeInboundGroups: inboundGroups.filter((item) => item.active === 'Y').length,
      servers: servers.length,
      activeServers: servers.filter((item) => item.active === 'Y').length,
      carriers: carriers.length,
      activeCarriers: carriers.filter((item) => item.active === 'Y').length,
    },
    campaigns: campaigns.map((item) => ({
      ...item,
      hopper_level: Number(item.hopper_level || 0),
      list_count: Number(item.list_count || 0),
      active_list_count: Number(item.active_list_count || 0),
      lead_count: Number(item.lead_count || 0),
      live_agents: Number(item.live_agents || 0),
    })),
    users,
    lists: lists.map((item) => ({
      ...item,
      cache_count: Number(item.cache_count || 0),
      cache_count_new: Number(item.cache_count_new || 0),
      cache_count_dialable_new: Number(item.cache_count_dialable_new || 0),
      lead_count: Number(item.lead_count || 0),
      new_leads: Number(item.new_leads || 0),
      called_leads: Number(item.called_leads || 0),
    })),
    inboundGroups,
    recordings: recordings.map((item) => ({
      ...item,
      length_in_sec: Number(item.length_in_sec || 0),
    })),
    servers,
    carriers,
  };
}

app.get('/api/health', async (_req, res) => {
  try {
    const system = await systemStatus();
    res.json({
      ok: system.dbOnline,
      authRequired: true,
      minUserLevel: config.minUserLevel,
      system,
    });
  } catch (error) {
    res.status(500).json({ ok: false, authRequired: true, minUserLevel: config.minUserLevel, error: 'db_unavailable' });
  }
});

app.get('/api/session', requireAccess, (req, res) => {
  res.json({ ok: true, user: req.genxUser, minUserLevel: config.minUserLevel });
});

app.post('/api/login', async (req, res) => {
  try {
    const user = await authenticateVicidialUser(req.body?.username, req.body?.password);
    if (!user) {
      return res.status(401).json({ ok: false, error: 'invalid_credentials_or_level' });
    }

    const token = createSession(user);
    return res.json({ ok: true, token, user, minUserLevel: config.minUserLevel });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'login_unavailable' });
  }
});

app.post('/api/logout', requireAccess, (req, res) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (token) sessions.delete(token);
  res.json({ ok: true });
});

app.get('/api/dashboard', requireAccess, async (req, res) => {
  try {
    res.json({ ok: true, data: await dashboardData(req.query.range) });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'dashboard_unavailable' });
  }
});

app.get('/api/admin', requireAccess, async (_req, res) => {
  try {
    res.json({ ok: true, data: await adminData() });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'admin_unavailable' });
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

setInterval(() => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expiresAt <= now) {
      sessions.delete(token);
    }
  }
}, 5 * 60 * 1000).unref();
