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

function accessScope(value, allMarkers = []) {
  const raw = String(value || '').trim();
  const upper = raw.toUpperCase();
  const all = allMarkers.some((marker) => upper.includes(String(marker).toUpperCase()));
  const values = raw
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item && item !== '-' && !allMarkers.some((marker) => item.toUpperCase() === String(marker).toUpperCase()));
  return { raw, all, values };
}

function publicUser(row) {
  const allowedCampaigns = accessScope(row.allowed_campaigns, ['-ALL-CAMPAIGNS-', 'ALL-CAMPAIGNS', '---ALL---']);
  const allowedReports = accessScope(row.allowed_reports, ['ALL REPORTS', 'ALL_REPORTS', '---ALL---']);
  const adminViewableGroups = accessScope(row.admin_viewable_groups, ['---ALL---', '-ALL-GROUPS-', 'ALL-GROUPS']);
  const adminViewableCallTimes = accessScope(row.admin_viewable_call_times, ['---ALL---', '-ALL-CALLTIMES-', 'ALL-CALLTIMES']);
  const allowedQueueGroups = row.allowed_queue_groups
    ? accessScope(row.allowed_queue_groups, ['---ALL---', '-ALL-GROUPS-', 'ALL-GROUPS'])
    : adminViewableGroups;

  return {
    user: row.user,
    fullName: row.full_name || row.user,
    userGroup: row.user_group || '',
    userLevel: Number(row.user_level || 0),
    campaignDetail: row.campaign_detail === '1',
    viewReports: row.view_reports === '1',
    modifyCampaigns: row.modify_campaigns === '1',
    modifyLists: row.modify_lists === '1',
    modifyUsers: row.modify_users === '1',
    modifyIngroups: row.modify_ingroups === '1',
    modifyUsergroups: row.modify_usergroups === '1',
    modifyScripts: row.modify_scripts === '1',
    modifyFilters: row.modify_filters === '1',
    modifyServers: row.modify_servers === '1',
    modifyCarriers: row.modify_carriers === '1',
    modifyStatuses: row.modify_statuses === '1',
    modifyPhones: row.modify_phones === '1',
    modifyCallTimes: row.modify_call_times === '1',
    modifySettingsContainers: ['1', '2', '3', '4', '5', '6'].includes(String(row.modify_settings_containers || '')),
    accessRecordings: row.access_recordings === '1',
    exportReports: row.export_reports === '1',
    permissions: {
      allowedCampaigns,
      allowedReports,
      adminViewableGroups,
      adminViewableCallTimes,
      allowedQueueGroups,
    },
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
    `SELECT u.user,
            u.pass,
            u.full_name,
            u.user_level,
            u.user_group,
            u.active,
            u.campaign_detail,
            u.view_reports,
            u.modify_campaigns,
            u.modify_lists,
            u.modify_users,
            u.modify_ingroups,
            u.modify_usergroups,
            u.modify_scripts,
            u.modify_filters,
            u.modify_servers,
            u.modify_carriers,
            u.modify_statuses,
            u.modify_phones,
            u.modify_call_times,
            u.export_reports,
            u.access_recordings,
            u.modify_settings_containers,
            ug.allowed_campaigns,
            ug.allowed_reports,
            ug.admin_viewable_groups,
            ug.admin_viewable_call_times,
            ug.allowed_queue_groups
     FROM vicidial_users u
     LEFT JOIN vicidial_user_groups ug ON ug.user_group = u.user_group
     WHERE u.user = ?
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

async function tableColumns(table) {
  const [result] = await pool.query(`SHOW COLUMNS FROM ${quoteId(table)}`);
  return result.map((column) => ({
    field: column.Field,
    autoIncrement: String(column.Extra || '').toLowerCase().includes('auto_increment'),
  }));
}

async function copyCampaignScopedRows(table, sourceCampaignId, targetCampaignId) {
  try {
    const columns = (await tableColumns(table)).filter((column) => !column.autoIncrement);
    if (!columns.some((column) => column.field === 'campaign_id')) return 0;
    const params = [];
    const insertColumns = columns.map((column) => quoteId(column.field)).join(', ');
    const selectColumns = columns.map((column) => {
      if (column.field === 'campaign_id') {
        params.push(targetCampaignId);
        return '?';
      }
      return quoteId(column.field);
    }).join(', ');
    params.push(sourceCampaignId);
    const result = await execute(
      `INSERT INTO ${quoteId(table)} (${insertColumns})
       SELECT ${selectColumns}
       FROM ${quoteId(table)}
       WHERE campaign_id = ?`,
      params,
    );
    return Number(result.affectedRows || 0);
  } catch (error) {
    return 0;
  }
}

async function copyCampaignRecord(sourceCampaignId, targetCampaignId, campaignName) {
  const columns = (await tableColumns('vicidial_campaigns')).filter((column) => !column.autoIncrement);
  const params = [];
  const insertColumns = columns.map((column) => quoteId(column.field)).join(', ');
  const selectColumns = columns.map((column) => {
    if (column.field === 'campaign_id') {
      params.push(targetCampaignId);
      return '?';
    }
    if (column.field === 'campaign_name') {
      params.push(campaignName);
      return '?';
    }
    if (column.field === 'active') {
      params.push('N');
      return '?';
    }
    if (column.field === 'list_order_mix') {
      params.push('DISABLED');
      return '?';
    }
    if (column.field === 'campaign_changedate') {
      return 'NOW()';
    }
    return quoteId(column.field);
  }).join(', ');
  params.push(sourceCampaignId);
  return execute(
    `INSERT INTO vicidial_campaigns (${insertColumns})
     SELECT ${selectColumns}
     FROM vicidial_campaigns
     WHERE campaign_id = ?`,
    params,
  );
}

async function copyCampaignSettingsContainer(sourceCampaignId, targetCampaignId) {
  try {
    const source = `AMD_AGENT_OPT_${sourceCampaignId}`;
    const target = `AMD_AGENT_OPT_${targetCampaignId}`;
    const result = await execute(
      `INSERT INTO vicidial_settings_containers
         (container_id, container_notes, container_type, user_group, container_entry)
       SELECT ?, ?, container_type, user_group, container_entry
       FROM vicidial_settings_containers
       WHERE container_id = ?`,
      [target, `AMD agent options for ${targetCampaignId} campaign`, source],
    );
    return Number(result.affectedRows || 0);
  } catch (error) {
    return 0;
  }
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

function quoteId(value) {
  return `\`${String(value).replace(/`/g, '``')}\``;
}

function boolFlag(value, on = '1', off = '0') {
  return ['1', 'Y', 'YES', 'TRUE', true, 1].includes(value) ? on : off;
}

function ynFlag(value, fallback = 'N') {
  return cleanChoice(value, ['Y', 'N'], fallback);
}

function canUseCampaignDetail(user) {
  return Number(user?.userLevel || 0) >= 9 || Boolean(user?.campaignDetail);
}

function scopeWhere(scope, column, params) {
  if (!scope || scope.all) return '1=1';
  const values = Array.isArray(scope.values) ? scope.values.filter(Boolean) : [];
  if (!values.length) return '1=0';
  params.push(...values);
  return `${column} IN (${values.map(() => '?').join(',')})`;
}

function scopeAllows(scope, value) {
  if (!scope || scope.all) return true;
  return scope.values?.includes(String(value)) || false;
}

async function ensureCampaignVisibleToUserGroup(user, campaignId) {
  const scope = user?.permissions?.allowedCampaigns;
  if (!user?.userGroup || !scope || scope.all || scopeAllows(scope, campaignId)) return;
  const next = `${scope.raw || ''} ${campaignId} -`.trim();
  await execute('UPDATE vicidial_user_groups SET allowed_campaigns = ? WHERE user_group = ?', [next, user.userGroup]);
  scope.raw = next;
  scope.values = [...(scope.values || []), campaignId];
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

async function adminData(user) {
  const allowedCampaignParams = [];
  const campaignWhere = scopeWhere(user?.permissions?.allowedCampaigns, 'c.campaign_id', allowedCampaignParams);
  const listCampaignParams = [];
  const listWhere = scopeWhere(user?.permissions?.allowedCampaigns, 'l.campaign_id', listCampaignParams);
  const userGroupParams = [];
  const userGroupWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'user_group', userGroupParams);
  const inboundParams = [];
  const inboundWhere = scopeWhere(user?.permissions?.allowedQueueGroups, 'group_id', inboundParams);
  const callTimeParams = [];
  const callTimeWhere = scopeWhere(user?.permissions?.adminViewableCallTimes, 'call_time_id', callTimeParams);
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
    scripts,
    leadFilters,
  ] = await Promise.all([
    rows(
      `SELECT c.campaign_id,
              c.campaign_name,
              c.campaign_description,
              c.active,
              c.dial_status_a,
              c.dial_status_b,
              c.dial_status_c,
              c.dial_status_d,
              c.dial_status_e,
              c.dial_method,
              c.auto_dial_level,
              c.hopper_level,
              c.lead_order,
              c.allow_closers,
              c.next_agent_call,
              c.local_call_time,
              c.dial_timeout,
              c.dial_prefix,
              c.campaign_cid,
              c.campaign_recording,
              c.campaign_rec_filename,
              c.campaign_script,
              c.campaign_script_two,
              c.get_call_launch,
              c.scheduled_callbacks,
              c.lead_filter_id,
              c.drop_call_seconds,
              c.drop_action,
              c.safe_harbor_exten,
              c.display_dialable_count,
              c.wrapup_seconds,
              c.wrapup_message,
              c.use_internal_dnc,
              c.omit_phone_code,
              c.available_only_ratio_tally,
              c.adaptive_dropped_percentage,
              c.adaptive_maximum_level,
              c.adaptive_intensity,
              c.adaptive_dl_diff_target,
              c.concurrent_transfers,
              c.auto_alt_dial,
              c.auto_alt_dial_statuses,
              c.agent_pause_codes_active,
              c.dial_statuses,
              c.no_hopper_leads_logins,
              c.use_auto_hopper,
              c.list_order_mix,
              c.campaign_allow_inbound,
              c.manual_dial_list_id,
              c.default_xfer_group,
              c.queue_priority,
              c.drop_inbound_group,
              c.enable_xfer_presets,
              c.use_custom_cid,
              c.display_queue_count,
              c.manual_dial_filter,
              c.agent_clipboard_copy,
              c.use_campaign_dnc,
              c.three_way_call_cid,
              c.three_way_dial_prefix,
              c.web_form_target,
              c.web_form_address,
              c.web_form_address_two,
              c.web_form_address_three,
              c.start_call_url,
              c.dispo_call_url,
              c.na_call_url,
              c.manual_dial_prefix,
              c.manual_preview_dial,
              c.manual_dial_call_time_check,
              c.display_leads_count,
              c.lead_order_randomize,
              c.lead_order_secondary,
              c.per_call_notes,
              c.my_callback_option,
              c.agent_lead_search,
              c.callback_days_limit,
              c.callback_hours_block,
              c.callback_list_calltime,
              c.user_group,
              c.pause_after_each_call,
              c.pause_after_next_call,
              c.owner_populate,
              c.allow_emails,
              c.allow_chats,
              c.max_inbound_calls,
              c.hide_call_log_info,
              c.wrapup_bypass,
              c.callback_active_limit,
              c.callback_active_limit_override,
              c.show_previous_callback,
              c.clear_script,
              c.manual_dial_search_filter,
              c.status_display_ingroup,
              c.manual_dial_timeout,
              c.manual_dial_hopper_check,
              c.manual_auto_next,
              c.manual_auto_show,
              c.ready_max_logout,
              c.callback_display_days,
              c.scheduled_callbacks_alert,
              c.next_dial_my_callbacks,
              c.callback_dnc,
              c.mute_recordings,
              c.amd_type,
              c.transfer_button_launch,
              c.shared_dial_rank,
              c.call_limit_24hour_method,
              c.call_limit_24hour_scope,
              c.call_limit_24hour,
              c.call_limit_24hour_override,
              c.agent_hide_hangup,
              c.max_logged_in_agents,
              c.show_confetti,
              c.dead_stop_recording,
              c.daily_phone_number_call_limit,
              c.call_log_days,
              c.hangup_again_link,
              c.campaign_changedate,
              COALESCE(list_counts.list_count, 0) AS list_count,
              COALESCE(list_counts.active_list_count, 0) AS active_list_count,
              COALESCE(lead_counts.lead_count, 0) AS lead_count,
              COALESCE(live_counts.live_agents, 0) AS live_agents,
              COALESCE(status_counts.status_count, 0) AS status_count,
              COALESCE(hotkey_counts.hotkey_count, 0) AS hotkey_count,
              COALESCE(recycle_counts.recycle_count, 0) AS recycle_count,
              COALESCE(pause_counts.pause_count, 0) AS pause_count,
              COALESCE(mix_counts.mix_count, 0) AS mix_count
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
       LEFT JOIN (
         SELECT campaign_id, COUNT(*) AS status_count
         FROM vicidial_campaign_statuses
         GROUP BY campaign_id
       ) status_counts ON status_counts.campaign_id = c.campaign_id
       LEFT JOIN (
         SELECT campaign_id, COUNT(*) AS hotkey_count
         FROM vicidial_campaign_hotkeys
         GROUP BY campaign_id
       ) hotkey_counts ON hotkey_counts.campaign_id = c.campaign_id
       LEFT JOIN (
         SELECT campaign_id, COUNT(*) AS recycle_count
         FROM vicidial_lead_recycle
         GROUP BY campaign_id
       ) recycle_counts ON recycle_counts.campaign_id = c.campaign_id
       LEFT JOIN (
         SELECT campaign_id, COUNT(*) AS pause_count
         FROM vicidial_pause_codes
         GROUP BY campaign_id
       ) pause_counts ON pause_counts.campaign_id = c.campaign_id
       LEFT JOIN (
         SELECT campaign_id, COUNT(*) AS mix_count
         FROM vicidial_campaigns_list_mix
         GROUP BY campaign_id
       ) mix_counts ON mix_counts.campaign_id = c.campaign_id
       WHERE ${campaignWhere}
       ORDER BY c.active DESC, c.campaign_id ASC
       LIMIT 100`,
      allowedCampaignParams,
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
              campaign_detail,
              view_reports,
              export_reports,
              modify_campaigns,
              modify_lists,
              modify_users,
              modify_ingroups,
              modify_usergroups,
              modify_scripts,
              modify_filters,
              modify_call_times,
              modify_phones,
              modify_servers,
              modify_carriers,
              modify_statuses,
              access_recordings,
              alter_admin_interface_options,
              modify_settings_containers,
              vdc_agent_api_access
       FROM vicidial_users
       WHERE ${userGroupWhere}
       ORDER BY active DESC, user_level DESC, user ASC
       LIMIT 200`,
      userGroupParams,
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
       WHERE ${listWhere}
       ORDER BY l.active DESC, l.list_id DESC
       LIMIT 100`,
      listCampaignParams,
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
       WHERE ${inboundWhere}
       ORDER BY active DESC, group_id ASC
       LIMIT 100`,
      inboundParams,
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
       WHERE ${userGroupWhere}
       ORDER BY user_group ASC
       LIMIT 200`,
      [...userGroupParams],
      [],
    ),
    rows(
      `SELECT call_time_id, call_time_name
       FROM vicidial_call_times
       WHERE ${callTimeWhere}
       ORDER BY call_time_id ASC
       LIMIT 200`,
      callTimeParams,
      [],
    ),
    rows(
      `SELECT script_id, script_name
       FROM vicidial_scripts
       ORDER BY script_id ASC
       LIMIT 200`,
      [],
      [],
    ),
    rows(
      `SELECT lead_filter_id, lead_filter_name
       FROM vicidial_lead_filters
       ORDER BY lead_filter_id ASC
       LIMIT 200`,
      [],
      [],
    ),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    permissions: user?.permissions || {},
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
      status_count: Number(item.status_count || 0),
      hotkey_count: Number(item.hotkey_count || 0),
      recycle_count: Number(item.recycle_count || 0),
      pause_count: Number(item.pause_count || 0),
      mix_count: Number(item.mix_count || 0),
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
      scripts,
      leadFilters,
      inboundGroups: inboundGroups.map((item) => ({
        group_id: item.group_id,
        group_name: item.group_name || item.group_id,
      })),
      lists: lists.map((item) => ({
        list_id: item.list_id,
        list_name: item.list_name || item.list_id,
      })),
    },
  };
}

function campaignPayload(body, currentUser) {
  const codeText = (value, max = 40, fallback = '') => cleanText(value, max).replace(/[^-_.:| 0-9a-zA-Z]/g, '') || fallback;
  const decimalText = (value, fallback = '0', max = 6) => cleanText(value, max).replace(/[^0-9.]/g, '') || fallback;
  const payload = {
    campaign_name: cleanText(body.campaign_name, 40) || 'New Campaign',
    campaign_description: cleanText(body.campaign_description, 255),
    active: ynFlag(body.active, 'N'),
    dial_method: cleanChoice(body.dial_method, ['MANUAL', 'RATIO', 'ADAPT_HARD_LIMIT', 'ADAPT_TAPERED', 'ADAPT_AVERAGE', 'ADAPT_PERCENTMAX', 'INBOUND_MAN', 'SHARED_RATIO', 'SHARED_ADAPT_HARD_LIMIT', 'SHARED_ADAPT_TAPERED', 'SHARED_ADAPT_AVERAGE', 'SHARED_ADAPT_PERCENTMAX'], 'MANUAL'),
    auto_dial_level: decimalText(body.auto_dial_level, '0'),
    hopper_level: cleanInt(body.hopper_level, 1, 0, 999999),
    lead_order: codeText(body.lead_order, 30, 'DOWN'),
    local_call_time: cleanId(body.local_call_time, 10) || '9am-9pm',
    campaign_recording: cleanChoice(body.campaign_recording, ['NEVER', 'ONDEMAND', 'ALLCALLS', 'ALLFORCE'], 'ONDEMAND'),
    campaign_allow_inbound: ynFlag(body.campaign_allow_inbound, 'N'),
  };

  if (!body?._detailMode || !canUseCampaignDetail(currentUser)) return payload;

  return {
    ...payload,
    dial_status_a: cleanId(body.dial_status_a, 6) || 'NEW',
    dial_status_b: cleanId(body.dial_status_b, 6),
    dial_status_c: cleanId(body.dial_status_c, 6),
    dial_status_d: cleanId(body.dial_status_d, 6),
    dial_status_e: cleanId(body.dial_status_e, 6),
    allow_closers: ynFlag(body.allow_closers, 'N'),
    next_agent_call: codeText(body.next_agent_call, 40, 'longest_wait_time'),
    dial_timeout: cleanInt(body.dial_timeout, 60, 5, 255),
    dial_prefix: codeText(body.dial_prefix, 20, '9'),
    campaign_cid: cleanDigits(body.campaign_cid, 20) || '0000000000',
    campaign_rec_filename: codeText(body.campaign_rec_filename, 50, 'FULLDATE_CUSTPHONE'),
    campaign_script: cleanId(body.campaign_script, 20),
    campaign_script_two: cleanId(body.campaign_script_two, 20),
    get_call_launch: cleanChoice(body.get_call_launch, ['NONE', 'SCRIPT', 'SCRIPTTWO', 'WEBFORM', 'WEBFORMTWO', 'WEBFORMTHREE', 'FORM', 'PREVIEW_WEBFORM', 'PREVIEW_WEBFORMTWO', 'PREVIEW_WEBFORMTHREE', 'PREVIEW_SCRIPT', 'PREVIEW_SCRIPTTWO', 'PREVIEW_FORM'], 'NONE'),
    scheduled_callbacks: ynFlag(body.scheduled_callbacks, 'N'),
    lead_filter_id: codeText(body.lead_filter_id, 20, 'NONE'),
    drop_call_seconds: cleanInt(body.drop_call_seconds, 5, 0, 255),
    drop_action: cleanChoice(body.drop_action, ['HANGUP', 'MESSAGE', 'VOICEMAIL', 'IN_GROUP', 'AUDIO', 'CALLMENU', 'VMAIL_NO_INST'], 'AUDIO'),
    safe_harbor_exten: codeText(body.safe_harbor_exten, 20, '8307'),
    display_dialable_count: ynFlag(body.display_dialable_count, 'Y'),
    wrapup_seconds: cleanInt(body.wrapup_seconds, 0, 0, 999),
    wrapup_message: cleanText(body.wrapup_message, 255),
    use_internal_dnc: cleanChoice(body.use_internal_dnc, ['Y', 'N', 'AREACODE'], 'Y'),
    omit_phone_code: ynFlag(body.omit_phone_code, 'N'),
    available_only_ratio_tally: ynFlag(body.available_only_ratio_tally, 'N'),
    adaptive_dropped_percentage: decimalText(body.adaptive_dropped_percentage, '3', 4),
    adaptive_maximum_level: decimalText(body.adaptive_maximum_level, '3.0'),
    adaptive_intensity: decimalText(body.adaptive_intensity, '0'),
    adaptive_dl_diff_target: cleanInt(body.adaptive_dl_diff_target, 0, -999, 999),
    concurrent_transfers: codeText(body.concurrent_transfers, 10, 'AUTO'),
    auto_alt_dial: cleanChoice(body.auto_alt_dial, ['NONE', 'ALT_ONLY', 'ADDR3_ONLY', 'ALT_AND_ADDR3', 'ALT_AND_EXTENDED', 'ALT_AND_ADDR3_AND_EXTENDED', 'EXTENDED_ONLY', 'MULTI_LEAD'], 'NONE'),
    auto_alt_dial_statuses: cleanText(body.auto_alt_dial_statuses, 255),
    agent_pause_codes_active: cleanChoice(body.agent_pause_codes_active, ['Y', 'N', 'FORCE'], 'N'),
    dial_statuses: cleanText(body.dial_statuses, 255) || ' NEW -',
    no_hopper_leads_logins: ynFlag(body.no_hopper_leads_logins, 'N'),
    use_auto_hopper: ynFlag(body.use_auto_hopper, 'Y'),
    list_order_mix: codeText(body.list_order_mix, 20, 'DISABLED'),
    manual_dial_list_id: cleanDigits(body.manual_dial_list_id, 14) || '998',
    default_xfer_group: codeText(body.default_xfer_group, 20, '---NONE---'),
    queue_priority: cleanInt(body.queue_priority, 50, 0, 99),
    drop_inbound_group: codeText(body.drop_inbound_group, 20, '---NONE---'),
    display_queue_count: ynFlag(body.display_queue_count, 'Y'),
    manual_dial_filter: codeText(body.manual_dial_filter, 50, 'NONE'),
    agent_clipboard_copy: codeText(body.agent_clipboard_copy, 50, 'NONE'),
    use_campaign_dnc: cleanChoice(body.use_campaign_dnc, ['Y', 'N', 'AREACODE'], 'N'),
    three_way_call_cid: cleanChoice(body.three_way_call_cid, ['CAMPAIGN', 'CUSTOMER', 'AGENT_PHONE', 'AGENT_CHOOSE', 'CUSTOM_CID'], 'CAMPAIGN'),
    three_way_dial_prefix: codeText(body.three_way_dial_prefix, 20),
    web_form_target: codeText(body.web_form_target, 100, 'vdcwebform'),
    web_form_address: cleanText(body.web_form_address, 2000),
    web_form_address_two: cleanText(body.web_form_address_two, 2000),
    web_form_address_three: cleanText(body.web_form_address_three, 2000),
    start_call_url: cleanText(body.start_call_url, 2000),
    dispo_call_url: cleanText(body.dispo_call_url, 2000),
    na_call_url: cleanText(body.na_call_url, 2000),
    manual_dial_prefix: codeText(body.manual_dial_prefix, 20),
    manual_preview_dial: cleanChoice(body.manual_preview_dial, ['DISABLED', 'PREVIEW_AND_SKIP', 'PREVIEW_ONLY'], 'PREVIEW_AND_SKIP'),
    manual_dial_call_time_check: cleanChoice(body.manual_dial_call_time_check, ['DISABLED', 'ENABLED'], 'DISABLED'),
    display_leads_count: ynFlag(body.display_leads_count, 'N'),
    lead_order_randomize: ynFlag(body.lead_order_randomize, 'N'),
    lead_order_secondary: codeText(body.lead_order_secondary, 30, 'LEAD_ASCEND'),
    per_call_notes: cleanChoice(body.per_call_notes, ['ENABLED', 'DISABLED'], 'DISABLED'),
    my_callback_option: cleanChoice(body.my_callback_option, ['CHECKED', 'UNCHECKED'], 'UNCHECKED'),
    agent_lead_search: cleanChoice(body.agent_lead_search, ['ENABLED', 'LIVE_CALL_INBOUND', 'LIVE_CALL_INBOUND_AND_MANUAL', 'DISABLED'], 'DISABLED'),
    callback_days_limit: cleanInt(body.callback_days_limit, 0, 0, 999),
    callback_hours_block: cleanInt(body.callback_hours_block, 0, 0, 99),
    callback_list_calltime: cleanChoice(body.callback_list_calltime, ['ENABLED', 'DISABLED'], 'DISABLED'),
    user_group: codeText(body.user_group, 20, '---ALL---'),
    pause_after_each_call: ynFlag(body.pause_after_each_call, 'N'),
    pause_after_next_call: cleanChoice(body.pause_after_next_call, ['ENABLED', 'DISABLED'], 'DISABLED'),
    owner_populate: cleanChoice(body.owner_populate, ['ENABLED', 'DISABLED'], 'DISABLED'),
    allow_emails: ynFlag(body.allow_emails, 'N'),
    allow_chats: ynFlag(body.allow_chats, 'N'),
    max_inbound_calls: cleanInt(body.max_inbound_calls, 0, 0, 99999),
    hide_call_log_info: cleanText(body.hide_call_log_info, 20) || 'N',
    wrapup_bypass: cleanChoice(body.wrapup_bypass, ['ENABLED', 'DISABLED'], 'ENABLED'),
    callback_active_limit: cleanInt(body.callback_active_limit, 0, 0, 99999),
    callback_active_limit_override: ynFlag(body.callback_active_limit_override, 'N'),
    show_previous_callback: cleanChoice(body.show_previous_callback, ['ENABLED', 'DISABLED'], 'ENABLED'),
    clear_script: cleanChoice(body.clear_script, ['ENABLED', 'DISABLED'], 'DISABLED'),
    manual_dial_search_filter: codeText(body.manual_dial_search_filter, 50, 'NONE'),
    status_display_ingroup: cleanChoice(body.status_display_ingroup, ['ENABLED', 'DISABLED'], 'ENABLED'),
    manual_dial_timeout: cleanText(body.manual_dial_timeout, 3).replace(/[^0-9]/g, ''),
    manual_dial_hopper_check: ynFlag(body.manual_dial_hopper_check, 'N'),
    manual_auto_next: cleanInt(body.manual_auto_next, 0, 0, 99999),
    manual_auto_show: ynFlag(body.manual_auto_show, 'N'),
    ready_max_logout: cleanInt(body.ready_max_logout, 0, 0, 9999999),
    callback_display_days: cleanInt(body.callback_display_days, 0, 0, 999),
    scheduled_callbacks_alert: cleanText(body.scheduled_callbacks_alert, 20) || 'NONE',
    next_dial_my_callbacks: cleanChoice(body.next_dial_my_callbacks, ['ENABLED', 'DISABLED'], 'DISABLED'),
    callback_dnc: cleanChoice(body.callback_dnc, ['ENABLED', 'DISABLED'], 'DISABLED'),
    mute_recordings: ynFlag(body.mute_recordings, 'N'),
    amd_type: cleanChoice(body.amd_type, ['AMD', 'CPD', 'KHOMP', 'ViciAMD'], 'AMD'),
    transfer_button_launch: cleanText(body.transfer_button_launch, 12) || 'NONE',
    shared_dial_rank: cleanInt(body.shared_dial_rank, 99, 0, 99),
    call_limit_24hour_method: cleanChoice(body.call_limit_24hour_method, ['DISABLED', 'PHONE_NUMBER', 'LEAD'], 'DISABLED'),
    call_limit_24hour_scope: cleanChoice(body.call_limit_24hour_scope, ['SYSTEM_WIDE', 'CAMPAIGN_LISTS'], 'SYSTEM_WIDE'),
    call_limit_24hour: cleanInt(body.call_limit_24hour, 0, 0, 255),
    call_limit_24hour_override: cleanText(body.call_limit_24hour_override, 40) || 'DISABLED',
    agent_hide_hangup: ynFlag(body.agent_hide_hangup, 'N'),
    max_logged_in_agents: cleanInt(body.max_logged_in_agents, 0, 0, 99999),
    show_confetti: cleanChoice(body.show_confetti, ['DISABLED', 'SALES', 'CALLBACKS', 'SALES_AND_CALLBACKS'], 'DISABLED'),
    dead_stop_recording: cleanText(body.dead_stop_recording, 20) || 'DISABLED',
    daily_phone_number_call_limit: cleanInt(body.daily_phone_number_call_limit, 0, 0, 255),
    call_log_days: cleanInt(body.call_log_days, 0, 0, 99999),
    hangup_again_link: cleanChoice(body.hangup_again_link, ['ENABLED', 'DISABLED'], 'ENABLED'),
  };
}

async function saveCampaign(req, res, mode) {
  if (!requireModify(req, res, 'modifyCampaigns')) return;
  const id = cleanId(mode === 'create' ? req.body?.campaign_id : req.params.id, 8);
  if (!id) return badRequest(res, 'invalid_campaign_id');
  if (mode !== 'create' && !scopeAllows(req.genxUser?.permissions?.allowedCampaigns, id)) {
    return res.status(403).json({ ok: false, error: 'campaign_not_allowed' });
  }
  const payload = campaignPayload(req.body || {}, req.genxUser);
  const keys = Object.keys(payload);
  const assignments = keys.map((key) => `${quoteId(key)} = ?`).join(', ');
  const values = keys.map((key) => payload[key]);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_campaigns
         SET campaign_id = ?,
             ${assignments},
             campaign_changedate = NOW()`,
        [id, ...values],
      );
      await execute('INSERT IGNORE INTO vicidial_campaign_stats (campaign_id) VALUES (?)', [id]);
      await execute('INSERT IGNORE INTO vicidial_campaign_stats_debug (campaign_id) VALUES (?)', [id]);
      await ensureCampaignVisibleToUserGroup(req.genxUser, id);
      await adminLog(req, 'CAMPAIGNS', 'ADD', id, 'GENX ADD CAMPAIGN', 'INSERT INTO vicidial_campaigns', payload.campaign_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_campaigns
         SET ${assignments},
             campaign_changedate = NOW()
         WHERE campaign_id = ?`,
        [...values, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'campaign_not_found' });
      await adminLog(
        req,
        'CAMPAIGNS',
        'MODIFY',
        id,
        req.body?._detailMode && canUseCampaignDetail(req.genxUser) ? 'GENX MODIFY CAMPAIGN DETAIL' : 'GENX MODIFY CAMPAIGN BASIC',
        'UPDATE vicidial_campaigns',
        payload.campaign_name,
      );
    }

    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'campaign_exists' : 'campaign_write_failed' });
  }
}

async function copyCampaign(req, res) {
  if (!requireModify(req, res, 'modifyCampaigns')) return;
  const id = cleanId(req.body?.campaign_id, 8);
  const sourceId = cleanId(req.body?.source_campaign_id, 8);
  const name = cleanText(req.body?.campaign_name, 40);
  if (!id) return badRequest(res, 'invalid_campaign_id');
  if (!sourceId) return badRequest(res, 'invalid_source_campaign_id');
  if (name.length < 6) return badRequest(res, 'campaign_name_required');
  if (!scopeAllows(req.genxUser?.permissions?.allowedCampaigns, sourceId)) {
    return res.status(403).json({ ok: false, error: 'source_campaign_not_allowed' });
  }

  try {
    const existing = await scalar('SELECT COUNT(*) AS value FROM vicidial_campaigns WHERE campaign_id = ?', [id], 0);
    if (Number(existing) > 0) return res.status(409).json({ ok: false, error: 'campaign_exists' });
    const sourceExists = await scalar('SELECT COUNT(*) AS value FROM vicidial_campaigns WHERE campaign_id = ?', [sourceId], 0);
    if (Number(sourceExists) < 1) return res.status(404).json({ ok: false, error: 'source_campaign_not_found' });
    const inboundExists = await scalar('SELECT COUNT(*) AS value FROM vicidial_inbound_groups WHERE group_id = ?', [id], 0);
    const statusGroupExists = await scalar('SELECT COUNT(*) AS value FROM vicidial_status_groups WHERE status_group_id = ?', [id], 0);
    if (Number(inboundExists) > 0 || Number(statusGroupExists) > 0) {
      return res.status(409).json({ ok: false, error: 'id_conflict' });
    }

    const mainResult = await copyCampaignRecord(sourceId, id, name);
    if (Number(mainResult.affectedRows || 0) < 1) return res.status(404).json({ ok: false, error: 'source_campaign_not_found' });

    await execute('INSERT IGNORE INTO vicidial_campaign_stats (campaign_id) VALUES (?)', [id]);
    await execute('INSERT IGNORE INTO vicidial_campaign_stats_debug (campaign_id) VALUES (?)', [id]);
    const copyCounts = {};
    for (const table of [
      'vicidial_campaign_statuses',
      'vicidial_campaign_hotkeys',
      'vicidial_lead_recycle',
      'vicidial_pause_codes',
      'vicidial_xfer_presets',
      'vicidial_xfer_stats',
      'vicidial_campaign_cid_areacodes',
      'vicidial_url_multi',
    ]) {
      copyCounts[table] = await copyCampaignScopedRows(table, sourceId, id);
    }
    copyCounts.vicidial_settings_containers = await copyCampaignSettingsContainer(sourceId, id);
    await ensureCampaignVisibleToUserGroup(req.genxUser, id);
    await adminLog(
      req,
      'CAMPAIGNS',
      'COPY',
      id,
      'GENX COPY CAMPAIGN',
      'INSERT INTO vicidial_campaigns SELECT source campaign settings',
      `${id} copied from ${sourceId}`,
    );

    return res.json({ ok: true, copyCounts, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'campaign_exists' : 'campaign_copy_failed' });
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
    campaign_detail: boolFlag(body.campaign_detail),
    view_reports: boolFlag(body.view_reports),
    export_reports: boolFlag(body.export_reports),
    modify_campaigns: boolFlag(body.modify_campaigns),
    modify_lists: boolFlag(body.modify_lists),
    modify_users: boolFlag(body.modify_users),
    modify_ingroups: boolFlag(body.modify_ingroups),
    modify_usergroups: boolFlag(body.modify_usergroups),
    modify_scripts: boolFlag(body.modify_scripts),
    modify_filters: boolFlag(body.modify_filters),
    modify_call_times: boolFlag(body.modify_call_times),
    modify_phones: boolFlag(body.modify_phones),
    modify_servers: boolFlag(body.modify_servers),
    modify_carriers: boolFlag(body.modify_carriers),
    modify_statuses: boolFlag(body.modify_statuses),
    access_recordings: boolFlag(body.access_recordings),
    alter_admin_interface_options: boolFlag(body.alter_admin_interface_options),
    modify_settings_containers: cleanInt(body.modify_settings_containers, 0, 0, 6),
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
             campaign_detail = ?,
             view_reports = ?,
             export_reports = ?,
             modify_campaigns = ?,
             modify_lists = ?,
             modify_users = ?,
             modify_ingroups = ?,
             modify_usergroups = ?,
             modify_scripts = ?,
             modify_filters = ?,
             modify_call_times = ?,
             modify_phones = ?,
             modify_servers = ?,
             modify_carriers = ?,
             modify_statuses = ?,
             access_recordings = ?,
             alter_admin_interface_options = ?,
             modify_settings_containers = ?`,
        [
          id,
          payload.pass,
          payload.full_name,
          payload.user_level,
          payload.user_group,
          payload.phone_login,
          payload.active,
          payload.email,
          payload.campaign_detail,
          payload.view_reports,
          payload.export_reports,
          payload.modify_campaigns,
          payload.modify_lists,
          payload.modify_users,
          payload.modify_ingroups,
          payload.modify_usergroups,
          payload.modify_scripts,
          payload.modify_filters,
          payload.modify_call_times,
          payload.modify_phones,
          payload.modify_servers,
          payload.modify_carriers,
          payload.modify_statuses,
          payload.access_recordings,
          payload.alter_admin_interface_options,
          payload.modify_settings_containers,
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
             campaign_detail = ?,
             view_reports = ?,
             export_reports = ?,
             modify_campaigns = ?,
             modify_lists = ?,
             modify_users = ?,
             modify_ingroups = ?,
             modify_usergroups = ?,
             modify_scripts = ?,
             modify_filters = ?,
             modify_call_times = ?,
             modify_phones = ?,
             modify_servers = ?,
             modify_carriers = ?,
             modify_statuses = ?,
             access_recordings = ?,
             alter_admin_interface_options = ?,
             modify_settings_containers = ?
         WHERE user = ?`,
        [
          ...passwordValues,
          payload.full_name,
          payload.user_level,
          payload.user_group,
          payload.phone_login,
          payload.active,
          payload.email,
          payload.campaign_detail,
          payload.view_reports,
          payload.export_reports,
          payload.modify_campaigns,
          payload.modify_lists,
          payload.modify_users,
          payload.modify_ingroups,
          payload.modify_usergroups,
          payload.modify_scripts,
          payload.modify_filters,
          payload.modify_call_times,
          payload.modify_phones,
          payload.modify_servers,
          payload.modify_carriers,
          payload.modify_statuses,
          payload.access_recordings,
          payload.alter_admin_interface_options,
          payload.modify_settings_containers,
          id,
        ],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'user_not_found' });
      await adminLog(req, 'USERS', 'MODIFY', id, 'GENX MODIFY USER', 'UPDATE vicidial_users', payload.full_name);
    }

    return res.json({ ok: true, data: await adminData(req.genxUser) });
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

    return res.json({ ok: true, data: await adminData(req.genxUser) });
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

    return res.json({ ok: true, data: await adminData(req.genxUser) });
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

app.get('/api/admin', requireAccess, async (req, res) => {
  try {
    res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    res.status(500).json({ ok: false, error: 'admin_unavailable' });
  }
});

app.post('/api/admin/campaigns', requireAccess, (req, res) => saveCampaign(req, res, 'create'));
app.post('/api/admin/campaigns/copy', requireAccess, copyCampaign);
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
