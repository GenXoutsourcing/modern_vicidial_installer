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
  if (/^[a-f0-9]{32}$/i.test(expected)) return safeEqual(digest(password, 'md5'), expected);
  if (/^[a-f0-9]{40}$/i.test(expected)) return safeEqual(digest(password, 'sha1'), expected);
  if (/^[a-f0-9]{64}$/i.test(expected)) return safeEqual(digest(password, 'sha256'), expected);
  return safeEqual(password, expected);
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
    modifyIngroups: row.modify_ingroups === '1',
    modifyServers: row.modify_servers === '1',
    modifyCarriers: row.modify_carriers === '1',
    modifyStatuses: row.modify_statuses === '1',
    modifyPhones: row.modify_phones === '1',
    modifyCallTimes: row.modify_call_times === '1',
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
            modify_users,
            modify_ingroups,
            modify_servers,
            modify_carriers,
            modify_statuses,
            modify_phones,
            modify_call_times
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

async function requiredRows(sql, params = []) {
  const [result] = await pool.query(sql, params);
  return result;
}

async function execute(sql, params = []) {
  const [result] = await pool.execute(sql, params);
  return result;
}

function canModify(user, permission) {
  if (!user) return false;
  if (Number(user.userLevel || 0) >= 9) return true;
  return Boolean(user[permission]);
}

function requireModify(req, res, permission) {
  if (canModify(req.genxUser, permission)) return true;
  res.status(403).json({ ok: false, error: 'permission_denied' });
  return false;
}

function cleanText(value, max = 255) {
  return String(value ?? '').trim().slice(0, max);
}

function cleanId(value, max = 20) {
  const next = cleanText(value, max).replace(/[^-_0-9a-zA-Z]/g, '');
  return next || '';
}

function cleanDigits(value, max = 14) {
  const next = cleanText(value, max).replace(/[^0-9]/g, '');
  return next || '';
}

function cleanChoice(value, allowed, fallback) {
  const next = cleanText(value, 60).toUpperCase();
  return allowed.includes(next) ? next : fallback;
}

function cleanInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function boolFlag(value, on = '1', off = '0') {
  return ['1', 'Y', 'YES', 'TRUE', true, 1].includes(value) ? on : off;
}

function ynFlag(value, fallback = 'N') {
  return cleanChoice(value, ['Y', 'N'], fallback);
}

async function adminLog(req, section, type, recordId, code, eventSql = '', notes = '') {
  try {
    await execute(
      `INSERT INTO vicidial_admin_log
       SET event_date = NOW(),
           user = ?,
           ip_address = ?,
           event_section = ?,
           event_type = ?,
           record_id = ?,
           event_code = ?,
           event_sql = ?,
           event_notes = ?`,
      [
        req.genxUser?.user || 'GENX',
        cleanText(req.ip || '', 15),
        section,
        type,
        cleanText(recordId, 100),
        code,
        cleanText(eventSql, 2000),
        cleanText(notes, 255),
      ],
    );
  } catch (error) {
    // Some report-only DB users may not be allowed to write the audit table.
  }
}

function badRequest(res, message) {
  return res.status(400).json({ ok: false, error: message });
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
    requiredRows(
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
    requiredRows(
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
    userGroups,
    callTimes,
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
         SELECT lists.campaign_id, COUNT(leads.lead_id) AS lead_count
         FROM vicidial_lists lists
         LEFT JOIN vicidial_list leads ON leads.list_id = lists.list_id
         GROUP BY lists.campaign_id
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
    requiredRows(
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
    requiredRows(
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
    requiredRows(
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
    requiredRows(
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
    requiredRows(
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
    requiredRows(
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
    rows(
      `SELECT user_group, group_name
       FROM vicidial_user_groups
       ORDER BY user_group ASC
       LIMIT 200`,
      [],
      [],
    ),
    rows(
      `SELECT call_time_id, call_time_name
       FROM vicidial_call_times
       ORDER BY call_time_id ASC
       LIMIT 200`,
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
    lookups: {
      campaigns: campaigns.map((item) => ({
        campaign_id: item.campaign_id,
        campaign_name: item.campaign_name || item.campaign_id,
      })),
      userGroups,
      callTimes,
    },
  };
}

function campaignPayload(body) {
  return {
    campaign_name: cleanText(body.campaign_name, 40) || 'New Campaign',
    campaign_description: cleanText(body.campaign_description, 255),
    active: ynFlag(body.active, 'N'),
    dial_method: cleanChoice(body.dial_method, ['MANUAL', 'RATIO', 'ADAPT_HARD_LIMIT', 'ADAPT_TAPERED', 'ADAPT_AVERAGE', 'ADAPT_PERCENTMAX', 'INBOUND_MAN', 'SHARED_RATIO', 'SHARED_ADAPT_HARD_LIMIT', 'SHARED_ADAPT_TAPERED', 'SHARED_ADAPT_AVERAGE', 'SHARED_ADAPT_PERCENTMAX'], 'MANUAL'),
    auto_dial_level: cleanText(body.auto_dial_level, 6).replace(/[^0-9.]/g, '') || '0',
    hopper_level: cleanInt(body.hopper_level, 1, 0, 999999),
    lead_order: cleanText(body.lead_order, 30).replace(/[^-_ 0-9a-zA-Z]/g, '') || 'DOWN',
    local_call_time: cleanId(body.local_call_time, 10) || '9am-9pm',
    campaign_recording: cleanChoice(body.campaign_recording, ['NEVER', 'ONDEMAND', 'ALLCALLS', 'ALLFORCE'], 'ONDEMAND'),
    campaign_allow_inbound: ynFlag(body.campaign_allow_inbound, 'N'),
  };
}

async function saveCampaign(req, res, mode) {
  if (!requireModify(req, res, 'modifyCampaigns')) return;
  const id = cleanId(mode === 'create' ? req.body?.campaign_id : req.params.id, 8);
  if (!id) return badRequest(res, 'invalid_campaign_id');
  const payload = campaignPayload(req.body || {});

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_campaigns
         SET campaign_id = ?,
             campaign_name = ?,
             campaign_description = ?,
             active = ?,
             dial_method = ?,
             auto_dial_level = ?,
             hopper_level = ?,
             lead_order = ?,
             local_call_time = ?,
             campaign_recording = ?,
             campaign_allow_inbound = ?,
             campaign_changedate = NOW()`,
        [
          id,
          payload.campaign_name,
          payload.campaign_description,
          payload.active,
          payload.dial_method,
          payload.auto_dial_level,
          payload.hopper_level,
          payload.lead_order,
          payload.local_call_time,
          payload.campaign_recording,
          payload.campaign_allow_inbound,
        ],
      );
      await adminLog(req, 'CAMPAIGNS', 'ADD', id, 'GENX ADD CAMPAIGN', 'INSERT INTO vicidial_campaigns', payload.campaign_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_campaigns
         SET campaign_name = ?,
             campaign_description = ?,
             active = ?,
             dial_method = ?,
             auto_dial_level = ?,
             hopper_level = ?,
             lead_order = ?,
             local_call_time = ?,
             campaign_recording = ?,
             campaign_allow_inbound = ?,
             campaign_changedate = NOW()
         WHERE campaign_id = ?`,
        [
          payload.campaign_name,
          payload.campaign_description,
          payload.active,
          payload.dial_method,
          payload.auto_dial_level,
          payload.hopper_level,
          payload.lead_order,
          payload.local_call_time,
          payload.campaign_recording,
          payload.campaign_allow_inbound,
          id,
        ],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'campaign_not_found' });
      await adminLog(req, 'CAMPAIGNS', 'MODIFY', id, 'GENX MODIFY CAMPAIGN', 'UPDATE vicidial_campaigns', payload.campaign_name);
    }

    return res.json({ ok: true, data: await adminData() });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'campaign_exists' : 'campaign_write_failed' });
  }
}

function userPayload(body, currentUser) {
  const requestedLevel = cleanInt(body.user_level, 1, 1, 9);
  const userLevel = Number(currentUser?.userLevel || 0) >= 9
    ? requestedLevel
    : Math.min(requestedLevel, Math.max(1, Number(currentUser?.userLevel || 1) - 1));

  return {
    pass: cleanText(body.pass, 100),
    full_name: cleanText(body.full_name, 50) || 'New User',
    user_level: userLevel,
    user_group: cleanId(body.user_group, 20) || 'ADMIN',
    active: ynFlag(body.active, 'Y'),
    email: cleanText(body.email, 100),
    phone_login: cleanText(body.phone_login, 20),
    view_reports: boolFlag(body.view_reports),
    modify_campaigns: boolFlag(body.modify_campaigns),
    modify_lists: boolFlag(body.modify_lists),
    modify_users: boolFlag(body.modify_users),
  };
}

async function saveUser(req, res, mode) {
  if (!requireModify(req, res, 'modifyUsers')) return;
  const id = cleanId(mode === 'create' ? req.body?.user : req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_user');
  const payload = userPayload(req.body || {}, req.genxUser);
  if (mode === 'create' && !payload.pass) return badRequest(res, 'password_required');

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_users
         SET user = ?,
             pass = ?,
             full_name = ?,
             user_level = ?,
             user_group = ?,
             phone_login = ?,
             phone_pass = '',
             pass_hash = '',
             active = ?,
             email = ?,
             view_reports = ?,
             modify_campaigns = ?,
             modify_lists = ?,
             modify_users = ?`,
        [
          id,
          payload.pass,
          payload.full_name,
          payload.user_level,
          payload.user_group,
          payload.phone_login,
          payload.active,
          payload.email,
          payload.view_reports,
          payload.modify_campaigns,
          payload.modify_lists,
          payload.modify_users,
        ],
      );
      await adminLog(req, 'USERS', 'ADD', id, 'GENX ADD USER', 'INSERT INTO vicidial_users', payload.full_name);
    } else {
      const passwordSql = payload.pass ? 'pass = ?, pass_hash = ?,' : '';
      const passwordValues = payload.pass ? [payload.pass, ''] : [];
      const result = await execute(
        `UPDATE vicidial_users
         SET ${passwordSql}
             full_name = ?,
             user_level = ?,
             user_group = ?,
             phone_login = ?,
             active = ?,
             email = ?,
             view_reports = ?,
             modify_campaigns = ?,
             modify_lists = ?,
             modify_users = ?
         WHERE user = ?`,
        [
          ...passwordValues,
          payload.full_name,
          payload.user_level,
          payload.user_group,
          payload.phone_login,
          payload.active,
          payload.email,
          payload.view_reports,
          payload.modify_campaigns,
          payload.modify_lists,
          payload.modify_users,
          id,
        ],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'user_not_found' });
      await adminLog(req, 'USERS', 'MODIFY', id, 'GENX MODIFY USER', 'UPDATE vicidial_users', payload.full_name);
    }

    return res.json({ ok: true, data: await adminData() });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'user_exists' : 'user_write_failed' });
  }
}

function listPayload(body) {
  const expiration = /^\d{4}-\d{2}-\d{2}$/.test(cleanText(body.expiration_date, 10))
    ? cleanText(body.expiration_date, 10)
    : '2099-12-31';

  return {
    list_name: cleanText(body.list_name, 30) || 'New List',
    campaign_id: cleanId(body.campaign_id, 8),
    active: ynFlag(body.active, 'N'),
    list_description: cleanText(body.list_description, 255),
    local_call_time: cleanId(body.local_call_time, 10) || 'campaign',
    expiration_date: expiration,
  };
}

async function saveList(req, res, mode) {
  if (!requireModify(req, res, 'modifyLists')) return;
  const id = cleanDigits(mode === 'create' ? req.body?.list_id : req.params.id, 14);
  if (!id) return badRequest(res, 'invalid_list_id');
  const payload = listPayload(req.body || {});
  if (!payload.campaign_id) return badRequest(res, 'campaign_required');

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_lists
         SET list_id = ?,
             list_name = ?,
             campaign_id = ?,
             active = ?,
             list_description = ?,
             local_call_time = ?,
             expiration_date = ?,
             list_changedate = NOW()`,
        [
          id,
          payload.list_name,
          payload.campaign_id,
          payload.active,
          payload.list_description,
          payload.local_call_time,
          payload.expiration_date,
        ],
      );
      await adminLog(req, 'LISTS', 'ADD', id, 'GENX ADD LIST', 'INSERT INTO vicidial_lists', payload.list_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_lists
         SET list_name = ?,
             campaign_id = ?,
             active = ?,
             list_description = ?,
             local_call_time = ?,
             expiration_date = ?,
             list_changedate = NOW()
         WHERE list_id = ?`,
        [
          payload.list_name,
          payload.campaign_id,
          payload.active,
          payload.list_description,
          payload.local_call_time,
          payload.expiration_date,
          id,
        ],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'list_not_found' });
      await adminLog(req, 'LISTS', 'MODIFY', id, 'GENX MODIFY LIST', 'UPDATE vicidial_lists', payload.list_name);
    }

    return res.json({ ok: true, data: await adminData() });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'list_exists' : 'list_write_failed' });
  }
}

function inboundPayload(body) {
  return {
    group_name: cleanText(body.group_name, 30) || 'New In-Group',
    group_color: cleanText(body.group_color, 20) || 'WHITE',
    active: ynFlag(body.active, 'N'),
    next_agent_call: cleanText(body.next_agent_call, 40).replace(/[^-_0-9a-zA-Z]/g, '') || 'longest_wait_time',
    queue_priority: cleanInt(body.queue_priority, 0, 0, 99),
    drop_call_seconds: cleanInt(body.drop_call_seconds, 360, 0, 9999),
    drop_action: cleanChoice(body.drop_action, ['HANGUP', 'MESSAGE', 'VOICEMAIL', 'IN_GROUP', 'CALLMENU', 'VMAIL_NO_INST'], 'MESSAGE'),
    call_time_id: cleanId(body.call_time_id, 20) || '24hours',
    play_welcome_message: cleanChoice(body.play_welcome_message, ['ALWAYS', 'NEVER', 'IF_WAIT_ONLY', 'YES_UNLESS_NODELAY'], 'ALWAYS'),
    no_agent_action: cleanChoice(body.no_agent_action, ['CALLMENU', 'INGROUP', 'DID', 'MESSAGE', 'EXTENSION', 'VOICEMAIL', 'VMAIL_NO_INST'], 'MESSAGE'),
    group_handling: cleanChoice(body.group_handling, ['PHONE', 'EMAIL', 'CHAT'], 'PHONE'),
  };
}

async function saveInboundGroup(req, res, mode) {
  if (!requireModify(req, res, 'modifyIngroups')) return;
  const id = cleanId(mode === 'create' ? req.body?.group_id : req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_group_id');
  const payload = inboundPayload(req.body || {});

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_inbound_groups
         SET group_id = ?,
             group_name = ?,
             group_color = ?,
             active = ?,
             next_agent_call = ?,
             queue_priority = ?,
             drop_call_seconds = ?,
             drop_action = ?,
             call_time_id = ?,
             play_welcome_message = ?,
             no_agent_action = ?,
             group_handling = ?`,
        [
          id,
          payload.group_name,
          payload.group_color,
          payload.active,
          payload.next_agent_call,
          payload.queue_priority,
          payload.drop_call_seconds,
          payload.drop_action,
          payload.call_time_id,
          payload.play_welcome_message,
          payload.no_agent_action,
          payload.group_handling,
        ],
      );
      await adminLog(req, 'INGROUPS', 'ADD', id, 'GENX ADD INBOUND GROUP', 'INSERT INTO vicidial_inbound_groups', payload.group_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_inbound_groups
         SET group_name = ?,
             group_color = ?,
             active = ?,
             next_agent_call = ?,
             queue_priority = ?,
             drop_call_seconds = ?,
             drop_action = ?,
             call_time_id = ?,
             play_welcome_message = ?,
             no_agent_action = ?,
             group_handling = ?
         WHERE group_id = ?`,
        [
          payload.group_name,
          payload.group_color,
          payload.active,
          payload.next_agent_call,
          payload.queue_priority,
          payload.drop_call_seconds,
          payload.drop_action,
          payload.call_time_id,
          payload.play_welcome_message,
          payload.no_agent_action,
          payload.group_handling,
          id,
        ],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'ingroup_not_found' });
      await adminLog(req, 'INGROUPS', 'MODIFY', id, 'GENX MODIFY INBOUND GROUP', 'UPDATE vicidial_inbound_groups', payload.group_name);
    }

    return res.json({ ok: true, data: await adminData() });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'ingroup_exists' : 'ingroup_write_failed' });
  }
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

app.post('/api/admin/campaigns', requireAccess, (req, res) => saveCampaign(req, res, 'create'));
app.put('/api/admin/campaigns/:id', requireAccess, (req, res) => saveCampaign(req, res, 'update'));
app.post('/api/admin/users', requireAccess, (req, res) => saveUser(req, res, 'create'));
app.put('/api/admin/users/:id', requireAccess, (req, res) => saveUser(req, res, 'update'));
app.post('/api/admin/lists', requireAccess, (req, res) => saveList(req, res, 'create'));
app.put('/api/admin/lists/:id', requireAccess, (req, res) => saveList(req, res, 'update'));
app.post('/api/admin/inbound', requireAccess, (req, res) => saveInboundGroup(req, res, 'create'));
app.put('/api/admin/inbound/:id', requireAccess, (req, res) => saveInboundGroup(req, res, 'update'));

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
