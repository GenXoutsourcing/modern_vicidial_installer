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

const HOPPER_LEVELS = ['1', '5', '10', '20', '50', '100', '200', '500', '700', '1000', '2000', '3000', '4000', '5000'];
const LEAD_ORDER_OPTIONS = [
  'DOWN',
  'UP',
  'DOWN PHONE',
  'UP PHONE',
  'DOWN LAST NAME',
  'UP LAST NAME',
  'DOWN COUNT',
  'UP COUNT',
  'RANDOM',
  'DOWN LAST CALL TIME',
  'UP LAST CALL TIME',
  'DOWN RANK',
  'UP RANK',
  'DOWN OWNER',
  'UP OWNER',
  'DOWN TIMEZONE',
  'UP TIMEZONE',
];
for (const suffix of ['2nd NEW', '3rd NEW', '4th NEW', '5th NEW', '6th NEW']) {
  for (const prefix of ['DOWN', 'UP', 'DOWN PHONE', 'UP PHONE', 'DOWN LAST NAME', 'UP LAST NAME', 'DOWN COUNT', 'UP COUNT', 'RANDOM', 'DOWN LAST CALL TIME', 'UP LAST CALL TIME', 'DOWN RANK', 'UP RANK', 'DOWN OWNER', 'UP OWNER', 'DOWN TIMEZONE', 'UP TIMEZONE']) {
    LEAD_ORDER_OPTIONS.push(`${prefix} ${suffix}`);
  }
}
const NEXT_AGENT_CALL_OPTIONS = ['random', 'oldest_call_start', 'oldest_call_finish', 'overall_user_level', 'campaign_rank', 'campaign_grade_random', 'fewest_calls', 'longest_wait_time', 'overall_user_level_wait_time', 'campaign_rank_wait_time', 'fewest_calls_wait_time'];
const TALLY_THRESHOLD_OPTIONS = ['DISABLED', 'LOGGED-IN_AGENTS', 'NON-PAUSED_AGENTS', 'WAITING_AGENTS'];
const CONCURRENT_TRANSFER_OPTIONS = ['AUTO', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '15', '20', '25', '30', '40', '50', '60', '80', '100', '1000', '10000'];
const INBOUND_QUEUE_NO_DIAL_OPTIONS = ['DISABLED', 'ENABLED', 'ALL_SERVERS', 'ENABLED_WITH_CHAT', 'ALL_SERVERS_WITH_CHAT'];
const CUSTOM_CID_OPTIONS = ['Y', 'N', 'AREACODE', 'USER_CUSTOM_1', 'USER_CUSTOM_2', 'USER_CUSTOM_3', 'USER_CUSTOM_4', 'USER_CUSTOM_5'];
const AGENT_SEARCH_OPTIONS = ['', 'LB', 'LO', 'SO'];
const TRANSFER_BUTTON_LAUNCH_OPTIONS = ['NONE', 'SCRIPT', 'SCRIPTTWO', 'WEBFORM', 'WEBFORMTWO', 'WEBFORMTHREE', 'FORM'];
const SCHEDULED_CALLBACK_ALERT_OPTIONS = ['NONE', 'BLINK', 'RED', 'BLINK_RED', 'BLINK_DEFER', 'RED_DEFER', 'BLINK_RED_DEFER'];
const SCHEDULED_CALLBACK_AUTO_RESCHEDULE_OPTIONS = ['NONE', 'ALL', 'DISPO_DEAD', 'DISPO_NA', 'DISPO_BUSY', 'DISPO_DROP', 'DISPO_INCALL', 'DISPO_NEW'];
const TIMER_ACTION_OPTIONS = ['NONE', 'D1_DIAL', 'D2_DIAL', 'D3_DIAL', 'D4_DIAL', 'D5_DIAL', 'D1_DIAL_QUIET', 'D2_DIAL_QUIET', 'D3_DIAL_QUIET', 'D4_DIAL_QUIET', 'D5_DIAL_QUIET', 'MESSAGE_ONLY', 'WEBFORM', 'HANGUP', 'CALLMENU', 'EXTENSION', 'IN_GROUP'];
const AGENT_HANGUP_ROUTE_OPTIONS = ['HANGUP', 'MESSAGE', 'EXTENSION', 'IN_GROUP', 'CALLMENU'];
const PARK_CALL_IVR_OPTIONS = ['DISABLED', 'ENABLED', 'ENABLED_PARK_ONLY', 'ENABLED_BUTTON_HIDDEN'];
const HIDE_CALL_LOG_OPTIONS = ['Y', 'N', 'SHOW_1', 'SHOW_2', 'SHOW_3', 'SHOW_4', 'SHOW_5', 'SHOW_6', 'SHOW_7', 'SHOW_8', 'SHOW_9', 'SHOW_10'];
const DEAD_STOP_RECORDING_OPTIONS = ['DISABLED', 'ALL_CALLS', 'OUTBOUND_ONLY', 'INBOUND_ONLY', 'AUTODIAL_ONLY', 'MANUAL_ONLY'];
const ADMIN_COLOR_OPTIONS = ['WHITE', 'BLACK', 'BLUE', 'RED', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE'];
const SCRIPT_COLOR_OPTIONS = ['white', 'black', 'blue', 'red', 'yellow', 'green', 'purple', 'orange'];
const GMT_OPTIONS = ['-12.00', '-11.00', '-10.00', '-9.00', '-8.00', '-7.00', '-6.00', '-5.00', '-4.00', '-3.00', '-2.00', '-1.00', '0.00', '1.00', '2.00', '3.00', '4.00', '5.00', '6.00', '7.00', '8.00', '9.00', '10.00', '11.00', '12.00'];
const LEAD_FIELD_OPTIONS = ['DISABLED', 'vendor_lead_code', 'source_id', 'list_id', 'phone_code', 'phone_number', 'title', 'first_name', 'middle_initial', 'last_name', 'address1', 'address2', 'address3', 'city', 'state', 'province', 'postal_code', 'country_code', 'gender', 'alt_phone', 'email', 'security_phrase', 'comments', 'rank', 'owner', 'entry_list_id'];
const AUTO_HOPPER_MULTI_OPTIONS = ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '2.0', '2.2', '2.4', '2.6', '2.8', '3.0', '3.5', '4.0'];

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

function reportAccessScope(value) {
  const raw = String(value || '').trim();
  const upper = raw.toUpperCase();
  const all = upper.includes('ALL REPORTS') || upper.includes('ALL_REPORTS') || upper.includes('---ALL---');
  const values = raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item && item.toUpperCase() !== 'NONE' && item.toUpperCase() !== 'ALL REPORTS');
  return { raw, all, values };
}

function publicUser(row) {
  const allowedCampaigns = accessScope(row.allowed_campaigns, ['-ALL-CAMPAIGNS-', 'ALL-CAMPAIGNS', '---ALL---']);
  const allowedReports = reportAccessScope(row.allowed_reports);
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
    modifyInboundDids: row.modify_inbound_dids === '1',
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
            u.modify_inbound_dids,
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

function cleanIp(value) {
  return cleanText(value, 15).replace(/[^0-9.]/g, '');
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

function codeText(value, max = 40, fallback = '') {
  return cleanText(value, max).replace(/[^-_.:| 0-9a-zA-Z]/g, '') || fallback;
}

function cleanExactChoice(value, allowed, fallback, max = 60) {
  const next = codeText(value, max, fallback);
  return allowed.includes(next) ? next : fallback;
}

function cleanLeadOrder(value) {
  const next = codeText(value, 30, 'DOWN');
  return LEAD_ORDER_OPTIONS.find((option) => option.toUpperCase() === next.toUpperCase()) || 'DOWN';
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

function scopeWhereAny(scope, columns, params) {
  if (!scope || scope.all) return '1=1';
  const values = Array.isArray(scope.values) ? scope.values.filter(Boolean) : [];
  if (!values.length) return '1=0';
  const checks = columns.map((column) => {
    params.push(...values);
    return `${column} IN (${values.map(() => '?').join(',')})`;
  });
  return `(${checks.join(' OR ')})`;
}

function scopeAllows(scope, value) {
  if (!scope || scope.all) return true;
  return scope.values?.includes(String(value)) || false;
}

function parseDialStatuses(value) {
  return String(value || '')
    .replace(/\s+-$/, '')
    .trim()
    .split(/\s+/)
    .map((status) => status.trim())
    .filter(Boolean);
}

function dialStatusesText(statuses) {
  const unique = [...new Set(statuses.map((status) => cleanId(status, 6)).filter(Boolean))];
  return unique.length ? ` ${unique.join(' ')} -` : ' -';
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
  const didQueueParams = [];
  const didQueueWhere = scopeWhere(user?.permissions?.allowedQueueGroups, 'group_id', didQueueParams);
  const didUserGroupParams = [];
  const didUserGroupWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'user_group', didUserGroupParams);
  const didParams = [...didQueueParams, ...didUserGroupParams];
  const didWhere = `(${didQueueWhere} OR ${didUserGroupWhere})`;
  const phoneParams = [];
  const phoneWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'user_group', phoneParams);
  const callTimeParams = [];
  const callTimeWhere = scopeWhere(user?.permissions?.adminViewableCallTimes, 'call_time_id', callTimeParams);
  const scriptParams = [];
  const scriptWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'user_group', scriptParams);
  const filterParams = [];
  const filterWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'user_group', filterParams);
  const callMenuParams = [];
  const callMenuScopeWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'user_group', callMenuParams);
  const callMenuWhere = `(${callMenuScopeWhere} OR user_group = '---ALL---')`;
  const shiftParams = [];
  const shiftScopeWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'user_group', shiftParams);
  const shiftWhere = `(${shiftScopeWhere} OR user_group = '---ALL---')`;
  const campaignStatusParams = [];
  const campaignStatusWhere = scopeWhere(user?.permissions?.allowedCampaigns, 'campaign_id', campaignStatusParams);
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
    statuses,
    campaignStatuses,
    listMixes,
    systemSettingsRows,
    dids,
    phones,
    callMenus,
    shifts,
    phoneCodes,
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
              c.campaign_rec_exten,
              c.allcalls_delay,
              c.routing_initiated_recordings,
              c.campaign_script,
              c.campaign_script_two,
              c.get_call_launch,
              c.scheduled_callbacks,
              c.lead_filter_id,
              c.drop_call_seconds,
              c.drop_action,
              c.safe_harbor_exten,
              c.safe_harbor_audio,
              c.safe_harbor_audio_field,
              c.voicemail_ext,
              c.park_file_name,
              c.display_dialable_count,
              c.wrapup_seconds,
              c.wrapup_message,
              c.use_internal_dnc,
              c.omit_phone_code,
              c.available_only_ratio_tally,
              c.available_only_tally_threshold,
              c.available_only_tally_threshold_agents,
              c.dial_level_threshold,
              c.dial_level_threshold_agents,
              c.adaptive_dropped_percentage,
              c.adaptive_maximum_level,
              c.adaptive_intensity,
              c.adaptive_dl_diff_target,
              c.dl_diff_target_method,
              c.concurrent_transfers,
              c.auto_alt_dial,
              c.auto_alt_dial_statuses,
              c.agent_pause_codes_active,
              c.dial_statuses,
              c.no_hopper_leads_logins,
              c.use_auto_hopper,
              c.auto_hopper_multi,
              c.auto_trim_hopper,
              c.hopper_vlc_dup_check,
              c.list_order_mix,
              c.campaign_allow_inbound,
              c.manual_dial_list_id,
              c.default_xfer_group,
              c.queue_priority,
              c.drop_inbound_group,
              c.inbound_queue_no_dial,
              c.enable_xfer_presets,
              c.use_custom_cid,
              c.agent_search_method,
              c.agent_hangup_route,
              c.agent_hangup_value,
              c.ivr_park_call,
              c.ivr_park_call_agi,
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
              c.timer_action,
              c.timer_action_message,
              c.timer_action_seconds,
              c.timer_action_destination,
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
              c.scheduled_callbacks_email_alert,
              c.scheduled_callbacks_count,
              c.scheduled_callbacks_force_dial,
              c.scheduled_callbacks_auto_reschedule,
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
              modify_inbound_dids,
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
      `SELECT user_group,
              group_name,
              allowed_campaigns,
              qc_allowed_campaigns,
              qc_allowed_inbound_groups,
              group_shifts,
              forced_timeclock_login,
              shift_enforcement,
              agent_status_viewable_groups,
              agent_status_view_time,
              agent_call_log_view,
              allowed_reports,
              admin_viewable_groups,
              admin_viewable_call_times,
              allowed_custom_reports,
              allowed_queue_groups,
              reports_header_override,
              admin_home_url,
              script_id
       FROM vicidial_user_groups
       WHERE ${userGroupWhere}
       ORDER BY user_group ASC
       LIMIT 200`,
      [...userGroupParams],
      [],
    ),
    rows(
      `SELECT call_time_id,
              call_time_name,
              call_time_comments,
              ct_default_start,
              ct_default_stop,
              ct_sunday_start,
              ct_sunday_stop,
              ct_monday_start,
              ct_monday_stop,
              ct_tuesday_start,
              ct_tuesday_stop,
              ct_wednesday_start,
              ct_wednesday_stop,
              ct_thursday_start,
              ct_thursday_stop,
              ct_friday_start,
              ct_friday_stop,
              ct_saturday_start,
              ct_saturday_stop,
              ct_state_call_times,
              default_afterhours_filename_override,
              sunday_afterhours_filename_override,
              monday_afterhours_filename_override,
              tuesday_afterhours_filename_override,
              wednesday_afterhours_filename_override,
              thursday_afterhours_filename_override,
              friday_afterhours_filename_override,
              saturday_afterhours_filename_override,
              user_group,
              ct_holidays
       FROM vicidial_call_times
       WHERE ${callTimeWhere}
       ORDER BY call_time_id ASC
       LIMIT 200`,
      callTimeParams,
      [],
    ),
    rows(
      `SELECT script_id,
              script_name,
              script_comments,
              script_text,
              active,
              user_group,
              script_color
       FROM vicidial_scripts
       WHERE ${scriptWhere}
       ORDER BY script_id ASC
       LIMIT 200`,
      scriptParams,
      [],
    ),
    rows(
      `SELECT lead_filter_id,
              lead_filter_name,
              lead_filter_comments,
              lead_filter_sql,
              user_group
       FROM vicidial_lead_filters
       WHERE ${filterWhere}
       ORDER BY lead_filter_id ASC
       LIMIT 200`,
      filterParams,
      [],
    ),
    rows(
      `SELECT status,
              status_name,
              selectable,
              human_answered,
              category,
              sale,
              dnc,
              customer_contact,
              not_interested,
              unworkable,
              scheduled_callback,
              completed,
              min_sec,
              max_sec,
              answering_machine
       FROM vicidial_statuses
       WHERE status NOT IN ('INCALL', 'QUEUE', 'CBHOLD')
       ORDER BY status ASC
       LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT campaign_id,
              status,
              status_name,
              selectable,
              human_answered,
              category,
              sale,
              dnc,
              customer_contact,
              not_interested,
              unworkable,
              scheduled_callback,
              completed,
              min_sec,
              max_sec,
              answering_machine
       FROM vicidial_campaign_statuses
       WHERE ${campaignStatusWhere}
         AND status NOT IN ('INCALL', 'QUEUE', 'CBHOLD')
       ORDER BY campaign_id ASC, status ASC
       LIMIT 1000`,
      campaignStatusParams,
      [],
    ),
    rows(
      `SELECT campaign_id,
              vcl_id,
              vcl_name,
              status,
              mix_method
       FROM vicidial_campaigns_list_mix
       WHERE ${campaignStatusWhere}
       ORDER BY campaign_id ASC, status ASC, vcl_id ASC
       LIMIT 1000`,
      campaignStatusParams,
      [],
    ),
    rows(
      `SELECT auto_dial_limit
       FROM system_settings
       LIMIT 1`,
      [],
      [{ auto_dial_limit: 8 }],
    ),
    rows(
      `SELECT did_id,
              did_pattern,
              did_description,
              did_active,
              did_route,
              extension,
              exten_context,
              voicemail_ext,
              phone,
              server_ip,
              user,
              user_unavailable_action,
              user_route_settings_ingroup,
              group_id,
              call_handle_method,
              agent_search_method,
              list_id,
              campaign_id,
              phone_code,
              menu_id,
              record_call,
              filter_inbound_number,
              filter_action,
              filter_extension,
              filter_group_id,
              filter_campaign_id,
              filter_menu_id,
              user_group,
              did_carrier_description,
              inbound_route_answer,
              alter_cid_name
       FROM vicidial_inbound_dids
       WHERE ${didWhere}
       ORDER BY did_active DESC, did_pattern ASC
       LIMIT 300`,
      didParams,
      [],
    ),
    rows(
      `SELECT extension,
              dialplan_number,
              voicemail_id,
              phone_ip,
              computer_ip,
              server_ip,
              login,
              status,
              active,
              phone_type,
              fullname,
              protocol,
              local_gmt,
              outbound_cid,
              email,
              template_id,
              phone_context,
              phone_ring_timeout,
              conf_secret,
              is_webphone,
              user_group,
              webphone_dialpad,
              webphone_auto_answer,
              webphone_dialbox,
              webphone_mute,
              webphone_volume,
              webphone_debug,
              webphone_settings,
              peer_status
       FROM phones
       WHERE ${phoneWhere}
       ORDER BY active DESC, extension ASC, server_ip ASC
       LIMIT 300`,
      phoneParams,
      [],
    ),
    rows(
      `SELECT menu_id,
              menu_name,
              menu_prompt,
              menu_timeout,
              menu_timeout_prompt,
              menu_invalid_prompt,
              menu_repeat,
              menu_time_check,
              call_time_id,
              track_in_vdac,
              custom_dialplan_entry,
              tracking_group,
              dtmf_log,
              dtmf_field,
              qualify_sql,
              alt_dtmf_log,
              answer_signal,
              user_group
       FROM vicidial_call_menu
       WHERE ${callMenuWhere}
       ORDER BY menu_id ASC
       LIMIT 500`,
      callMenuParams,
      [],
    ),
    rows(
      `SELECT shift_id,
              shift_name,
              shift_start_time,
              shift_length,
              shift_weekdays,
              user_group
       FROM vicidial_shifts
       WHERE ${shiftWhere}
       ORDER BY shift_id ASC
       LIMIT 300`,
      shiftParams,
      [],
    ),
    rows(
      `SELECT country_code,
              MAX(country) AS country
       FROM vicidial_phone_codes
       WHERE country_code IS NOT NULL
       GROUP BY country_code
       ORDER BY country_code ASC
       LIMIT 500`,
      [],
      [],
    ),
  ]);
  const systemSettings = systemSettingsRows?.[0] || {};

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
      userGroups: userGroups.length,
      dids: dids.length,
      activeDids: dids.filter((item) => item.did_active === 'Y').length,
      phones: phones.length,
      activePhones: phones.filter((item) => item.active === 'Y').length,
      scripts: scripts.length,
      activeScripts: scripts.filter((item) => item.active === 'Y').length,
      leadFilters: leadFilters.length,
      callTimes: callTimes.length,
      statuses: statuses.length,
      campaignStatuses: campaignStatuses.length,
      callMenus: callMenus.length,
      shifts: shifts.length,
      servers: servers.length,
      activeServers: servers.filter((item) => item.active === 'Y').length,
      carriers: carriers.length,
      activeCarriers: carriers.filter((item) => item.active === 'Y').length,
    },
    campaigns: campaigns.map((item) => ({
      ...item,
      hopper_level: Number(item.hopper_level || 0),
      dial_status_list: parseDialStatuses(item.dial_statuses),
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
    userGroups,
    dids,
    phones,
    scripts,
    leadFilters,
    callTimes,
    statuses,
    campaignStatuses,
    callMenus,
    shifts,
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
      callTimes,
      scripts,
      leadFilters,
      statuses,
      campaignStatuses,
      listMixes,
      callMenus,
      shifts,
      phoneCodes,
      systemSettings: {
        autoDialLimit: Number(systemSettings.auto_dial_limit || 8),
      },
      inboundGroups: inboundGroups.map((item) => ({
        group_id: item.group_id,
        group_name: item.group_name || item.group_id,
      })),
      userGroups: userGroups.map((item) => ({
        user_group: item.user_group,
        group_name: item.group_name || item.user_group,
      })),
      phones: phones.map((item) => ({
        extension: item.extension,
        server_ip: item.server_ip,
        label: `${item.extension} @ ${item.server_ip}`,
      })),
      users: users.map((item) => ({
        user: item.user,
        full_name: item.full_name || item.user,
      })),
      phoneContexts: [...new Set(phones.map((item) => item.phone_context).filter(Boolean))]
        .sort()
        .map((phone_context) => ({ phone_context })),
      servers: servers.map((item) => ({
        server_id: item.server_id,
        server_ip: item.server_ip,
        server_description: item.server_description || item.server_id,
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
  const exactChoice = (value, allowed, fallback, max = 60) => {
    const next = codeText(value, max, fallback);
    return allowed.includes(next) ? next : fallback;
  };
  const payload = {
    campaign_name: cleanText(body.campaign_name, 40) || 'New Campaign',
    campaign_description: cleanText(body.campaign_description, 255),
    active: ynFlag(body.active, 'N'),
    dial_method: cleanChoice(body.dial_method, ['MANUAL', 'RATIO', 'ADAPT_HARD_LIMIT', 'ADAPT_TAPERED', 'ADAPT_AVERAGE', 'ADAPT_PERCENTMAX', 'INBOUND_MAN', 'SHARED_RATIO', 'SHARED_ADAPT_HARD_LIMIT', 'SHARED_ADAPT_TAPERED', 'SHARED_ADAPT_AVERAGE', 'SHARED_ADAPT_PERCENTMAX'], 'MANUAL'),
    auto_dial_level: decimalText(body.auto_dial_level, '0'),
    hopper_level: cleanInt(body.hopper_level, 1, 0, 999999),
    lead_order: cleanLeadOrder(body.lead_order),
    local_call_time: cleanId(body.local_call_time, 10) || '9am-9pm',
    campaign_recording: cleanChoice(body.campaign_recording, ['NEVER', 'ONDEMAND', 'ALLCALLS', 'ALLFORCE'], 'ONDEMAND'),
    campaign_allow_inbound: ynFlag(body.campaign_allow_inbound, 'N'),
  };

  if (!body?._detailMode || !canUseCampaignDetail(currentUser)) return payload;

  return {
    ...payload,
    allow_closers: ynFlag(body.allow_closers, 'N'),
    next_agent_call: exactChoice(body.next_agent_call, NEXT_AGENT_CALL_OPTIONS, 'longest_wait_time'),
    dial_timeout: cleanInt(body.dial_timeout, 60, 5, 255),
    dial_prefix: codeText(body.dial_prefix, 20, '9'),
    campaign_cid: cleanDigits(body.campaign_cid, 20) || '0000000000',
    campaign_rec_filename: codeText(body.campaign_rec_filename, 50, 'FULLDATE_CUSTPHONE'),
    campaign_rec_exten: codeText(body.campaign_rec_exten, 10, '8309'),
    allcalls_delay: cleanInt(body.allcalls_delay, 0, 0, 255),
    routing_initiated_recordings: ynFlag(body.routing_initiated_recordings, 'N'),
    campaign_script: cleanId(body.campaign_script, 20),
    campaign_script_two: cleanId(body.campaign_script_two, 20),
    get_call_launch: cleanChoice(body.get_call_launch, ['NONE', 'SCRIPT', 'SCRIPTTWO', 'WEBFORM', 'WEBFORMTWO', 'WEBFORMTHREE', 'FORM', 'PREVIEW_WEBFORM', 'PREVIEW_WEBFORMTWO', 'PREVIEW_WEBFORMTHREE', 'PREVIEW_SCRIPT', 'PREVIEW_SCRIPTTWO', 'PREVIEW_FORM'], 'NONE'),
    scheduled_callbacks: ynFlag(body.scheduled_callbacks, 'N'),
    lead_filter_id: codeText(body.lead_filter_id, 20, 'NONE'),
    drop_call_seconds: cleanInt(body.drop_call_seconds, 5, 0, 255),
    drop_action: cleanChoice(body.drop_action, ['HANGUP', 'MESSAGE', 'VOICEMAIL', 'IN_GROUP', 'AUDIO', 'CALLMENU', 'VMAIL_NO_INST'], 'AUDIO'),
    safe_harbor_exten: codeText(body.safe_harbor_exten, 20, '8307'),
    safe_harbor_audio: codeText(body.safe_harbor_audio, 100, 'buzz'),
    safe_harbor_audio_field: exactChoice(body.safe_harbor_audio_field, LEAD_FIELD_OPTIONS, 'DISABLED', 40),
    voicemail_ext: codeText(body.voicemail_ext, 10),
    park_file_name: codeText(body.park_file_name, 100),
    display_dialable_count: ynFlag(body.display_dialable_count, 'Y'),
    wrapup_seconds: cleanInt(body.wrapup_seconds, 0, 0, 999),
    wrapup_message: cleanText(body.wrapup_message, 255),
    use_internal_dnc: cleanChoice(body.use_internal_dnc, ['Y', 'N', 'AREACODE'], 'Y'),
    omit_phone_code: ynFlag(body.omit_phone_code, 'N'),
    available_only_ratio_tally: ynFlag(body.available_only_ratio_tally, 'N'),
    available_only_tally_threshold: cleanChoice(body.available_only_tally_threshold, TALLY_THRESHOLD_OPTIONS, 'DISABLED'),
    available_only_tally_threshold_agents: cleanInt(body.available_only_tally_threshold_agents, 0, 0, 50),
    dial_level_threshold: cleanChoice(body.dial_level_threshold, TALLY_THRESHOLD_OPTIONS, 'DISABLED'),
    dial_level_threshold_agents: cleanInt(body.dial_level_threshold_agents, 0, 0, 50),
    adaptive_dropped_percentage: decimalText(body.adaptive_dropped_percentage, '3', 4),
    adaptive_maximum_level: decimalText(body.adaptive_maximum_level, '3.0'),
    adaptive_intensity: cleanInt(body.adaptive_intensity, 0, -40, 40),
    adaptive_dl_diff_target: cleanInt(body.adaptive_dl_diff_target, 0, -40, 40),
    dl_diff_target_method: cleanChoice(body.dl_diff_target_method, ['ADAPT_CALC_ONLY', 'CALLS_PLACED'], 'ADAPT_CALC_ONLY'),
    concurrent_transfers: exactChoice(body.concurrent_transfers, CONCURRENT_TRANSFER_OPTIONS, 'AUTO', 10),
    auto_alt_dial: cleanChoice(body.auto_alt_dial, ['NONE', 'ALT_ONLY', 'ADDR3_ONLY', 'ALT_AND_ADDR3', 'ALT_AND_EXTENDED', 'ALT_AND_ADDR3_AND_EXTENDED', 'EXTENDED_ONLY', 'MULTI_LEAD'], 'NONE'),
    auto_alt_dial_statuses: cleanText(body.auto_alt_dial_statuses, 255),
    agent_pause_codes_active: cleanChoice(body.agent_pause_codes_active, ['Y', 'N', 'FORCE'], 'N'),
    no_hopper_leads_logins: ynFlag(body.no_hopper_leads_logins, 'N'),
    use_auto_hopper: ynFlag(body.use_auto_hopper, 'Y'),
    auto_hopper_multi: exactChoice(body.auto_hopper_multi, AUTO_HOPPER_MULTI_OPTIONS, '1.0', 4),
    auto_trim_hopper: ynFlag(body.auto_trim_hopper, 'Y'),
    hopper_vlc_dup_check: ynFlag(body.hopper_vlc_dup_check, 'N'),
    list_order_mix: codeText(body.list_order_mix, 20, 'DISABLED'),
    manual_dial_list_id: cleanDigits(body.manual_dial_list_id, 14) || '998',
    default_xfer_group: codeText(body.default_xfer_group, 20, '---NONE---'),
    queue_priority: cleanInt(body.queue_priority, 50, -99, 99),
    drop_inbound_group: codeText(body.drop_inbound_group, 20, '---NONE---'),
    inbound_queue_no_dial: cleanChoice(body.inbound_queue_no_dial, INBOUND_QUEUE_NO_DIAL_OPTIONS, 'DISABLED'),
    display_queue_count: ynFlag(body.display_queue_count, 'Y'),
    manual_dial_filter: codeText(body.manual_dial_filter, 50, 'NONE'),
    agent_clipboard_copy: codeText(body.agent_clipboard_copy, 50, 'NONE'),
    use_campaign_dnc: cleanChoice(body.use_campaign_dnc, ['Y', 'N', 'AREACODE'], 'N'),
    use_custom_cid: cleanChoice(body.use_custom_cid, CUSTOM_CID_OPTIONS, 'N'),
    agent_search_method: exactChoice(body.agent_search_method, AGENT_SEARCH_OPTIONS, '', 4),
    agent_hangup_route: cleanChoice(body.agent_hangup_route, AGENT_HANGUP_ROUTE_OPTIONS, 'HANGUP'),
    agent_hangup_value: codeText(body.agent_hangup_value, 255),
    ivr_park_call: cleanChoice(body.ivr_park_call, PARK_CALL_IVR_OPTIONS, 'DISABLED'),
    ivr_park_call_agi: codeText(body.ivr_park_call_agi, 255),
    three_way_call_cid: cleanChoice(body.three_way_call_cid, ['CAMPAIGN', 'CUSTOMER', 'AGENT_PHONE', 'AGENT_CHOOSE', 'CUSTOM_CID'], 'CAMPAIGN'),
    three_way_dial_prefix: codeText(body.three_way_dial_prefix, 20),
    web_form_target: codeText(body.web_form_target, 100, 'vdcwebform'),
    web_form_address: cleanText(body.web_form_address, 2000),
    web_form_address_two: cleanText(body.web_form_address_two, 2000),
    web_form_address_three: cleanText(body.web_form_address_three, 2000),
    start_call_url: cleanText(body.start_call_url, 2000),
    dispo_call_url: cleanText(body.dispo_call_url, 2000),
    na_call_url: cleanText(body.na_call_url, 2000),
    timer_action: cleanChoice(body.timer_action, TIMER_ACTION_OPTIONS, 'NONE'),
    timer_action_message: cleanText(body.timer_action_message, 255),
    timer_action_seconds: cleanInt(body.timer_action_seconds, 0, 0, 99999),
    timer_action_destination: codeText(body.timer_action_destination, 255),
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
    scheduled_callbacks_alert: cleanChoice(body.scheduled_callbacks_alert, SCHEDULED_CALLBACK_ALERT_OPTIONS, 'NONE'),
    scheduled_callbacks_email_alert: ynFlag(body.scheduled_callbacks_email_alert, 'N'),
    scheduled_callbacks_count: cleanChoice(body.scheduled_callbacks_count, ['LIVE', 'ALL_ACTIVE'], 'LIVE'),
    scheduled_callbacks_force_dial: ynFlag(body.scheduled_callbacks_force_dial, 'N'),
    scheduled_callbacks_auto_reschedule: cleanChoice(body.scheduled_callbacks_auto_reschedule, SCHEDULED_CALLBACK_AUTO_RESCHEDULE_OPTIONS, 'NONE'),
    next_dial_my_callbacks: cleanChoice(body.next_dial_my_callbacks, ['ENABLED', 'DISABLED'], 'DISABLED'),
    callback_dnc: cleanChoice(body.callback_dnc, ['ENABLED', 'DISABLED'], 'DISABLED'),
    mute_recordings: ynFlag(body.mute_recordings, 'N'),
    amd_type: cleanChoice(body.amd_type, ['AMD', 'CPD', 'KHOMP', 'ViciAMD'], 'AMD'),
    transfer_button_launch: cleanChoice(body.transfer_button_launch, TRANSFER_BUTTON_LAUNCH_OPTIONS, 'NONE'),
    shared_dial_rank: cleanInt(body.shared_dial_rank, 99, 0, 99),
    call_limit_24hour_method: cleanChoice(body.call_limit_24hour_method, ['DISABLED', 'PHONE_NUMBER', 'LEAD'], 'DISABLED'),
    call_limit_24hour_scope: cleanChoice(body.call_limit_24hour_scope, ['SYSTEM_WIDE', 'CAMPAIGN_LISTS'], 'SYSTEM_WIDE'),
    call_limit_24hour: cleanInt(body.call_limit_24hour, 0, 0, 255),
    call_limit_24hour_override: codeText(body.call_limit_24hour_override, 40, 'DISABLED'),
    agent_hide_hangup: ynFlag(body.agent_hide_hangup, 'N'),
    max_logged_in_agents: cleanInt(body.max_logged_in_agents, 0, 0, 99999),
    show_confetti: cleanChoice(body.show_confetti, ['DISABLED', 'SALES', 'CALLBACKS', 'SALES_AND_CALLBACKS'], 'DISABLED'),
    dead_stop_recording: cleanChoice(body.dead_stop_recording, DEAD_STOP_RECORDING_OPTIONS, 'DISABLED'),
    daily_phone_number_call_limit: cleanInt(body.daily_phone_number_call_limit, 0, 0, 255),
    call_log_days: cleanInt(body.call_log_days, 0, 0, 99999),
    hangup_again_link: cleanChoice(body.hangup_again_link, ['ENABLED', 'DISABLED'], 'ENABLED'),
  };
}

async function dialStatusExistsForCampaign(campaignId, status) {
  const [match] = await rows(
    `SELECT status
     FROM (
       SELECT status
       FROM vicidial_statuses
       WHERE status = ?
         AND status NOT IN ('INCALL', 'QUEUE', 'CBHOLD')
       UNION
       SELECT status
       FROM vicidial_campaign_statuses
       WHERE campaign_id = ?
         AND status = ?
         AND status NOT IN ('INCALL', 'QUEUE', 'CBHOLD')
     ) dial_statuses
     LIMIT 1`,
    [status, campaignId, status],
    [],
  );
  return Boolean(match);
}

async function applyCampaignDialStatusChanges(req, campaignId) {
  const addStatus = cleanId(req.body?.add_dial_status, 6);
  const removeStatus = cleanId(req.body?.remove_dial_status, 6);
  if (!addStatus && !removeStatus) return;

  const [campaign] = await rows(
    'SELECT dial_statuses FROM vicidial_campaigns WHERE campaign_id = ?',
    [campaignId],
    [],
  );
  if (!campaign) return;

  let statuses = parseDialStatuses(campaign.dial_statuses);
  let changed = false;
  const notes = [];

  if (removeStatus && statuses.includes(removeStatus)) {
    statuses = statuses.filter((status) => status !== removeStatus);
    changed = true;
    notes.push(`Removed: ${removeStatus}`);
  }

  if (addStatus) {
    const exists = await dialStatusExistsForCampaign(campaignId, addStatus);
    if (!exists) {
      const error = new Error('invalid_dial_status');
      error.statusCode = 400;
      error.publicError = 'invalid_dial_status';
      throw error;
    }
    if (!statuses.includes(addStatus)) {
      statuses = [addStatus, ...statuses];
      changed = true;
      notes.push(`Added: ${addStatus}`);
    }
  }

  if (!changed) return;
  const nextStatuses = dialStatusesText(statuses);
  await execute(
    `UPDATE vicidial_campaigns
     SET dial_statuses = ?,
         campaign_changedate = NOW()
     WHERE campaign_id = ?`,
    [nextStatuses, campaignId],
  );
  await adminLog(
    req,
    'CAMPAIGN_DIALSTATUS',
    'MODIFY',
    campaignId,
    'GENX MODIFY CAMPAIGN DIAL STATUS',
    'UPDATE vicidial_campaigns SET dial_statuses',
    notes.join(' | '),
  );
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
      await applyCampaignDialStatusChanges(req, id);
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
      await applyCampaignDialStatusChanges(req, id);
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
    if (error.statusCode) {
      return res.status(error.statusCode).json({ ok: false, error: error.publicError || 'campaign_write_failed' });
    }
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
    modify_inbound_dids: boolFlag(body.modify_inbound_dids),
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
             modify_inbound_dids = ?,
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
          payload.modify_inbound_dids,
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
             modify_inbound_dids = ?,
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
          payload.modify_inbound_dids,
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
    group_color: cleanChoice(body.group_color, ADMIN_COLOR_OPTIONS, 'WHITE'),
    active: ynFlag(body.active, 'N'),
    next_agent_call: cleanExactChoice(body.next_agent_call, NEXT_AGENT_CALL_OPTIONS, 'longest_wait_time'),
    queue_priority: cleanInt(body.queue_priority, 0, -99, 99),
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

function dynamicAssignments(payload) {
  const keys = Object.keys(payload);
  return {
    keys,
    assignments: keys.map((key) => `${quoteId(key)} = ?`).join(', '),
    values: keys.map((key) => payload[key]),
  };
}

function userGroupPayload(body) {
  return {
    group_name: cleanText(body.group_name, 40) || 'New User Group',
    allowed_campaigns: cleanText(body.allowed_campaigns, 1000) || '-ALL-CAMPAIGNS-',
    qc_allowed_campaigns: cleanText(body.qc_allowed_campaigns, 1000) || '-ALL-CAMPAIGNS-',
    qc_allowed_inbound_groups: cleanText(body.qc_allowed_inbound_groups, 1000) || '---ALL---',
    group_shifts: cleanText(body.group_shifts, 1000) || '---ALL---',
    forced_timeclock_login: ynFlag(body.forced_timeclock_login, 'N'),
    shift_enforcement: cleanChoice(body.shift_enforcement, ['OFF', 'START', 'ALL'], 'OFF'),
    agent_status_viewable_groups: cleanText(body.agent_status_viewable_groups, 1000) || '---ALL---',
    agent_status_view_time: cleanChoice(body.agent_status_view_time, ['Y', 'N'], 'N'),
    agent_call_log_view: cleanChoice(body.agent_call_log_view, ['Y', 'N'], 'N'),
    allowed_reports: cleanText(body.allowed_reports, 2000) || 'ALL REPORTS',
    admin_viewable_groups: cleanText(body.admin_viewable_groups, 1000) || '---ALL---',
    admin_viewable_call_times: cleanText(body.admin_viewable_call_times, 1000) || '---ALL---',
    allowed_custom_reports: cleanText(body.allowed_custom_reports, 1000) || 'ALL REPORTS',
    allowed_queue_groups: cleanText(body.allowed_queue_groups, 1000) || '---ALL---',
    reports_header_override: cleanText(body.reports_header_override, 255),
    admin_home_url: cleanText(body.admin_home_url, 255),
    script_id: cleanId(body.script_id, 20),
  };
}

async function saveUserGroup(req, res, mode) {
  if (!requireModify(req, res, 'modifyUsergroups')) return;
  const id = cleanId(mode === 'create' ? req.body?.user_group : req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_user_group');
  if (mode !== 'create' && !scopeAllows(req.genxUser?.permissions?.adminViewableGroups, id)) {
    return res.status(403).json({ ok: false, error: 'user_group_not_allowed' });
  }
  if (mode === 'create' && Number(req.genxUser?.userLevel || 0) < 9 && !req.genxUser?.permissions?.adminViewableGroups?.all) {
    return res.status(403).json({ ok: false, error: 'user_group_scope_required' });
  }
  const payload = userGroupPayload(req.body || {});
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_user_groups
         SET user_group = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'USERGROUPS', 'ADD', id, 'GENX ADD USER GROUP', 'INSERT INTO vicidial_user_groups', payload.group_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_user_groups
         SET ${assignments}
         WHERE user_group = ?`,
        [...values, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'user_group_not_found' });
      await adminLog(req, 'USERGROUPS', 'MODIFY', id, 'GENX MODIFY USER GROUP', 'UPDATE vicidial_user_groups', payload.group_name);
    }

    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'user_group_exists' : 'user_group_write_failed' });
  }
}

function didPattern(value) {
  return cleanText(value, 50).replace(/[^-*#+0-9a-zA-Z]/g, '');
}

function didPayload(body) {
  return {
    did_description: cleanText(body.did_description, 50) || 'New DID',
    did_active: ynFlag(body.did_active, 'Y'),
    did_route: cleanExactChoice(body.did_route, ['EXTEN', 'VOICEMAIL', 'PHONE', 'USER', 'IN_GROUP', 'CALLMENU'], 'EXTEN'),
    extension: cleanText(body.extension, 100),
    exten_context: codeText(body.exten_context, 50, 'default'),
    voicemail_ext: cleanText(body.voicemail_ext, 10),
    phone: cleanText(body.phone, 100),
    server_ip: cleanIp(body.server_ip),
    user: cleanId(body.user, 20),
    user_unavailable_action: cleanExactChoice(body.user_unavailable_action, ['VOICEMAIL', 'IN_GROUP', 'EXTEN', 'PHONE', 'HANGUP'], 'VOICEMAIL'),
    user_route_settings_ingroup: cleanId(body.user_route_settings_ingroup, 20),
    group_id: cleanId(body.group_id, 20),
    call_handle_method: cleanExactChoice(body.call_handle_method, ['CID', 'CIDLOOKUP', 'CIDLOOKUPRL', 'ANI', 'DID'], 'CID'),
    agent_search_method: cleanExactChoice(body.agent_search_method, ['LB', 'LO', 'SO', 'RANDOM', 'CLOSER', 'STICKY'], 'LB'),
    list_id: cleanDigits(body.list_id, 14),
    campaign_id: cleanId(body.campaign_id, 20),
    phone_code: cleanDigits(body.phone_code, 10) || '1',
    menu_id: cleanId(body.menu_id, 50),
    record_call: ynFlag(body.record_call, 'N'),
    filter_inbound_number: cleanText(body.filter_inbound_number, 20),
    filter_action: cleanExactChoice(body.filter_action, ['DISABLED', 'EXTEN', 'VOICEMAIL', 'PHONE', 'IN_GROUP', 'CALLMENU'], 'DISABLED'),
    filter_extension: cleanText(body.filter_extension, 100),
    filter_group_id: cleanId(body.filter_group_id, 20),
    filter_campaign_id: cleanId(body.filter_campaign_id, 20),
    filter_menu_id: cleanId(body.filter_menu_id, 50),
    user_group: codeText(body.user_group, 20, '---ALL---'),
    did_carrier_description: cleanText(body.did_carrier_description, 50),
    inbound_route_answer: ynFlag(body.inbound_route_answer, 'N'),
    alter_cid_name: cleanText(body.alter_cid_name, 40),
  };
}

async function didVisibleToUser(user, pattern) {
  if (Number(user?.userLevel || 0) >= 9) return true;
  const [did] = await rows(
    'SELECT group_id, user_group FROM vicidial_inbound_dids WHERE did_pattern = ? LIMIT 1',
    [pattern],
    [],
  );
  if (!did) return false;
  return scopeAllows(user?.permissions?.allowedQueueGroups, did.group_id) || scopeAllows(user?.permissions?.adminViewableGroups, did.user_group);
}

function didPayloadAllowed(user, payload) {
  if (Number(user?.userLevel || 0) >= 9) return true;
  return scopeAllows(user?.permissions?.allowedQueueGroups, payload.group_id) || scopeAllows(user?.permissions?.adminViewableGroups, payload.user_group);
}

async function saveDid(req, res, mode) {
  if (!requireModify(req, res, 'modifyInboundDids')) return;
  const id = didPattern(mode === 'create' ? req.body?.did_pattern : req.params.id);
  if (!id) return badRequest(res, 'invalid_did_pattern');
  if (mode !== 'create' && !(await didVisibleToUser(req.genxUser, id))) {
    return res.status(403).json({ ok: false, error: 'did_not_allowed' });
  }
  const payload = didPayload(req.body || {});
  if (!didPayloadAllowed(req.genxUser, payload)) return res.status(403).json({ ok: false, error: 'did_scope_required' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_inbound_dids
         SET did_pattern = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'DIDS', 'ADD', id, 'GENX ADD DID', 'INSERT INTO vicidial_inbound_dids', payload.did_description);
    } else {
      const result = await execute(
        `UPDATE vicidial_inbound_dids
         SET ${assignments}
         WHERE did_pattern = ?`,
        [...values, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'did_not_found' });
      await adminLog(req, 'DIDS', 'MODIFY', id, 'GENX MODIFY DID', 'UPDATE vicidial_inbound_dids', payload.did_description);
    }

    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'did_exists' : 'did_write_failed' });
  }
}

function phoneKey(raw) {
  const [extensionRaw, ...serverParts] = String(raw || '').split('__');
  return {
    extension: codeText(extensionRaw, 100),
    server_ip: cleanIp(serverParts.join('__')),
  };
}

function phonePayload(body, mode) {
  const payload = {
    dialplan_number: cleanText(body.dialplan_number, 20),
    voicemail_id: cleanText(body.voicemail_id, 10),
    phone_ip: cleanIp(body.phone_ip),
    computer_ip: cleanIp(body.computer_ip),
    server_ip: cleanIp(body.server_ip),
    login: cleanText(body.login, 20),
    status: cleanChoice(body.status, ['ACTIVE', 'SUSPENDED', 'CLOSED', 'PENDING'], 'ACTIVE'),
    active: ynFlag(body.active, 'Y'),
    phone_type: cleanExactChoice(body.phone_type, ['SIP', 'Zap', 'IAX2', 'EXTERNAL'], 'SIP'),
    fullname: cleanText(body.fullname, 50),
    protocol: cleanExactChoice(body.protocol, ['SIP', 'Zap', 'IAX2', 'EXTERNAL'], 'SIP'),
    local_gmt: cleanExactChoice(body.local_gmt, GMT_OPTIONS, '-5.00', 6),
    outbound_cid: cleanText(body.outbound_cid, 20),
    email: cleanText(body.email, 100),
    template_id: cleanText(body.template_id, 20),
    phone_context: cleanText(body.phone_context, 20) || 'default',
    phone_ring_timeout: cleanInt(body.phone_ring_timeout, 60, 0, 999),
    conf_secret: cleanText(body.conf_secret, 20),
    is_webphone: ynFlag(body.is_webphone, 'N'),
    user_group: codeText(body.user_group, 20, '---ALL---'),
    webphone_dialpad: ynFlag(body.webphone_dialpad, 'Y'),
    webphone_auto_answer: ynFlag(body.webphone_auto_answer, 'N'),
    webphone_dialbox: ynFlag(body.webphone_dialbox, 'Y'),
    webphone_mute: ynFlag(body.webphone_mute, 'Y'),
    webphone_volume: cleanInt(body.webphone_volume, 50, 0, 100),
    webphone_debug: ynFlag(body.webphone_debug, 'N'),
    webphone_settings: cleanText(body.webphone_settings, 255),
  };
  const pass = cleanText(body.pass, 20);
  if (mode === 'create' || pass) payload.pass = pass;
  return payload;
}

async function phoneVisibleToUser(user, extension, serverIp) {
  if (Number(user?.userLevel || 0) >= 9) return true;
  const [phone] = await rows(
    'SELECT user_group FROM phones WHERE extension = ? AND server_ip = ? LIMIT 1',
    [extension, serverIp],
    [],
  );
  if (!phone) return false;
  return scopeAllows(user?.permissions?.adminViewableGroups, phone.user_group);
}

async function savePhone(req, res, mode) {
  if (!requireModify(req, res, 'modifyPhones')) return;
  const key = mode === 'create'
    ? { extension: codeText(req.body?.extension, 100), server_ip: cleanIp(req.body?.server_ip) }
    : phoneKey(req.params.id);
  if (!key.extension || !key.server_ip) return badRequest(res, 'invalid_phone_key');
  if (mode !== 'create' && !(await phoneVisibleToUser(req.genxUser, key.extension, key.server_ip))) {
    return res.status(403).json({ ok: false, error: 'phone_not_allowed' });
  }
  const payload = phonePayload({ ...req.body, server_ip: req.body?.server_ip || key.server_ip }, mode);
  if (!payload.server_ip) payload.server_ip = key.server_ip;
  if (!scopeAllows(req.genxUser?.permissions?.adminViewableGroups, payload.user_group)) {
    return res.status(403).json({ ok: false, error: 'phone_scope_required' });
  }
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO phones
         SET extension = ?,
             ${assignments}`,
        [key.extension, ...values],
      );
      await adminLog(req, 'PHONES', 'ADD', key.extension, 'GENX ADD PHONE', 'INSERT INTO phones', payload.fullname);
    } else {
      const result = await execute(
        `UPDATE phones
         SET ${assignments}
         WHERE extension = ?
           AND server_ip = ?`,
        [...values, key.extension, key.server_ip],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'phone_not_found' });
      await adminLog(req, 'PHONES', 'MODIFY', key.extension, 'GENX MODIFY PHONE', 'UPDATE phones', payload.fullname);
    }

    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'phone_exists' : 'phone_write_failed' });
  }
}

function scopedUserGroupAllowed(user, userGroup) {
  if (Number(user?.userLevel || 0) >= 9) return true;
  return scopeAllows(user?.permissions?.adminViewableGroups, userGroup);
}

async function recordUserGroup(table, idColumn, id) {
  const [record] = await rows(
    `SELECT user_group FROM ${quoteId(table)} WHERE ${quoteId(idColumn)} = ? LIMIT 1`,
    [id],
    [],
  );
  return record?.user_group || '';
}

function scriptPayload(body) {
  return {
    script_name: cleanText(body.script_name, 50) || 'New Script',
    script_comments: cleanText(body.script_comments, 255),
    script_text: cleanText(body.script_text, 12000),
    active: ynFlag(body.active, 'Y'),
    user_group: codeText(body.user_group, 20, '---ALL---'),
    script_color: cleanExactChoice(body.script_color, SCRIPT_COLOR_OPTIONS, 'white', 20),
  };
}

async function saveScript(req, res, mode) {
  if (!requireModify(req, res, 'modifyScripts')) return;
  const id = cleanId(mode === 'create' ? req.body?.script_id : req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_script_id');
  if (mode !== 'create' && !scopedUserGroupAllowed(req.genxUser, await recordUserGroup('vicidial_scripts', 'script_id', id))) {
    return res.status(403).json({ ok: false, error: 'script_not_allowed' });
  }
  const payload = scriptPayload(req.body || {});
  if (!scopedUserGroupAllowed(req.genxUser, payload.user_group)) return res.status(403).json({ ok: false, error: 'script_scope_required' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_scripts
         SET script_id = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'SCRIPTS', 'ADD', id, 'GENX ADD SCRIPT', 'INSERT INTO vicidial_scripts', payload.script_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_scripts
         SET ${assignments}
         WHERE script_id = ?`,
        [...values, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'script_not_found' });
      await adminLog(req, 'SCRIPTS', 'MODIFY', id, 'GENX MODIFY SCRIPT', 'UPDATE vicidial_scripts', payload.script_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'script_exists' : 'script_write_failed' });
  }
}

function leadFilterPayload(body) {
  return {
    lead_filter_name: cleanText(body.lead_filter_name, 30) || 'New Filter',
    lead_filter_comments: cleanText(body.lead_filter_comments, 255),
    lead_filter_sql: cleanText(body.lead_filter_sql, 12000),
    user_group: codeText(body.user_group, 20, '---ALL---'),
  };
}

async function saveLeadFilter(req, res, mode) {
  if (!requireModify(req, res, 'modifyFilters')) return;
  const id = cleanId(mode === 'create' ? req.body?.lead_filter_id : req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_lead_filter_id');
  if (mode !== 'create' && !scopedUserGroupAllowed(req.genxUser, await recordUserGroup('vicidial_lead_filters', 'lead_filter_id', id))) {
    return res.status(403).json({ ok: false, error: 'lead_filter_not_allowed' });
  }
  const payload = leadFilterPayload(req.body || {});
  if (!scopedUserGroupAllowed(req.genxUser, payload.user_group)) return res.status(403).json({ ok: false, error: 'lead_filter_scope_required' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_lead_filters
         SET lead_filter_id = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'FILTERS', 'ADD', id, 'GENX ADD LEAD FILTER', 'INSERT INTO vicidial_lead_filters', payload.lead_filter_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_lead_filters
         SET ${assignments}
         WHERE lead_filter_id = ?`,
        [...values, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'lead_filter_not_found' });
      await adminLog(req, 'FILTERS', 'MODIFY', id, 'GENX MODIFY LEAD FILTER', 'UPDATE vicidial_lead_filters', payload.lead_filter_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'lead_filter_exists' : 'lead_filter_write_failed' });
  }
}

function callTimeValue(value, fallback = 0) {
  return cleanInt(value, fallback, 0, 2400);
}

function callTimePayload(body) {
  return {
    call_time_name: cleanText(body.call_time_name, 30) || 'New Call Time',
    call_time_comments: cleanText(body.call_time_comments, 255),
    ct_default_start: callTimeValue(body.ct_default_start, 900),
    ct_default_stop: callTimeValue(body.ct_default_stop, 2100),
    ct_sunday_start: callTimeValue(body.ct_sunday_start, 0),
    ct_sunday_stop: callTimeValue(body.ct_sunday_stop, 0),
    ct_monday_start: callTimeValue(body.ct_monday_start, 0),
    ct_monday_stop: callTimeValue(body.ct_monday_stop, 0),
    ct_tuesday_start: callTimeValue(body.ct_tuesday_start, 0),
    ct_tuesday_stop: callTimeValue(body.ct_tuesday_stop, 0),
    ct_wednesday_start: callTimeValue(body.ct_wednesday_start, 0),
    ct_wednesday_stop: callTimeValue(body.ct_wednesday_stop, 0),
    ct_thursday_start: callTimeValue(body.ct_thursday_start, 0),
    ct_thursday_stop: callTimeValue(body.ct_thursday_stop, 0),
    ct_friday_start: callTimeValue(body.ct_friday_start, 0),
    ct_friday_stop: callTimeValue(body.ct_friday_stop, 0),
    ct_saturday_start: callTimeValue(body.ct_saturday_start, 0),
    ct_saturday_stop: callTimeValue(body.ct_saturday_stop, 0),
    ct_state_call_times: cleanText(body.ct_state_call_times, 12000),
    default_afterhours_filename_override: cleanText(body.default_afterhours_filename_override, 255),
    sunday_afterhours_filename_override: cleanText(body.sunday_afterhours_filename_override, 255),
    monday_afterhours_filename_override: cleanText(body.monday_afterhours_filename_override, 255),
    tuesday_afterhours_filename_override: cleanText(body.tuesday_afterhours_filename_override, 255),
    wednesday_afterhours_filename_override: cleanText(body.wednesday_afterhours_filename_override, 255),
    thursday_afterhours_filename_override: cleanText(body.thursday_afterhours_filename_override, 255),
    friday_afterhours_filename_override: cleanText(body.friday_afterhours_filename_override, 255),
    saturday_afterhours_filename_override: cleanText(body.saturday_afterhours_filename_override, 255),
    user_group: codeText(body.user_group, 20, '---ALL---'),
    ct_holidays: cleanText(body.ct_holidays, 12000),
  };
}

async function saveCallTime(req, res, mode) {
  if (!requireModify(req, res, 'modifyCallTimes')) return;
  const id = cleanId(mode === 'create' ? req.body?.call_time_id : req.params.id, 10);
  if (!id) return badRequest(res, 'invalid_call_time_id');
  if (mode !== 'create' && !scopeAllows(req.genxUser?.permissions?.adminViewableCallTimes, id)) {
    return res.status(403).json({ ok: false, error: 'call_time_not_allowed' });
  }
  const payload = callTimePayload(req.body || {});
  if (!scopedUserGroupAllowed(req.genxUser, payload.user_group)) return res.status(403).json({ ok: false, error: 'call_time_scope_required' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_call_times
         SET call_time_id = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'CALLTIMES', 'ADD', id, 'GENX ADD CALL TIME', 'INSERT INTO vicidial_call_times', payload.call_time_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_call_times
         SET ${assignments}
         WHERE call_time_id = ?`,
        [...values, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'call_time_not_found' });
      await adminLog(req, 'CALLTIMES', 'MODIFY', id, 'GENX MODIFY CALL TIME', 'UPDATE vicidial_call_times', payload.call_time_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'call_time_exists' : 'call_time_write_failed' });
  }
}

function callMenuPayload(body) {
  return {
    menu_name: cleanText(body.menu_name, 100) || 'New Call Menu',
    menu_prompt: cleanText(body.menu_prompt, 255),
    menu_timeout: cleanInt(body.menu_timeout, 10, 0, 999),
    menu_timeout_prompt: cleanText(body.menu_timeout_prompt, 255) || 'NONE',
    menu_invalid_prompt: cleanText(body.menu_invalid_prompt, 255) || 'NONE',
    menu_repeat: cleanInt(body.menu_repeat, 0, 0, 99),
    menu_time_check: boolFlag(body.menu_time_check, '1', '0'),
    call_time_id: cleanId(body.call_time_id, 20) || '24hours',
    track_in_vdac: boolFlag(body.track_in_vdac, '1', '0'),
    custom_dialplan_entry: cleanText(body.custom_dialplan_entry, 12000),
    tracking_group: codeText(body.tracking_group, 20, 'CALLMENU'),
    dtmf_log: boolFlag(body.dtmf_log, '1', '0'),
    dtmf_field: cleanExactChoice(body.dtmf_field, ['NONE', ...LEAD_FIELD_OPTIONS], 'NONE', 50),
    user_group: codeText(body.user_group, 20, '---ALL---'),
    qualify_sql: cleanText(body.qualify_sql, 12000),
    alt_dtmf_log: boolFlag(body.alt_dtmf_log, '1', '0'),
    answer_signal: ynFlag(body.answer_signal, 'Y'),
  };
}

async function saveCallMenu(req, res, mode) {
  if (!requireModify(req, res, 'modifyIngroups')) return;
  const id = cleanId(mode === 'create' ? req.body?.menu_id : req.params.id, 50);
  if (!id) return badRequest(res, 'invalid_menu_id');
  if (mode !== 'create' && !scopedUserGroupAllowed(req.genxUser, await recordUserGroup('vicidial_call_menu', 'menu_id', id))) {
    return res.status(403).json({ ok: false, error: 'call_menu_not_allowed' });
  }
  const payload = callMenuPayload(req.body || {});
  if (!scopedUserGroupAllowed(req.genxUser, payload.user_group)) return res.status(403).json({ ok: false, error: 'call_menu_scope_required' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_call_menu
         SET menu_id = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'CALLMENU', 'ADD', id, 'GENX ADD CALL MENU', 'INSERT INTO vicidial_call_menu', payload.menu_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_call_menu
         SET ${assignments}
         WHERE menu_id = ?`,
        [...values, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'call_menu_not_found' });
      await adminLog(req, 'CALLMENU', 'MODIFY', id, 'GENX MODIFY CALL MENU', 'UPDATE vicidial_call_menu', payload.menu_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'call_menu_exists' : 'call_menu_write_failed' });
  }
}

function shiftWeekdays(value) {
  return [...new Set(cleanText(value, 20).replace(/[^0-6]/g, '').split(''))].join('') || '0123456';
}

function shiftPayload(body) {
  return {
    shift_name: cleanText(body.shift_name, 50) || 'New Shift',
    shift_start_time: cleanDigits(body.shift_start_time, 4) || '0900',
    shift_length: cleanText(body.shift_length, 5).replace(/[^0-9:]/g, '') || '16:00',
    shift_weekdays: shiftWeekdays(body.shift_weekdays),
    report_option: ynFlag(body.report_option, 'N'),
    user_group: codeText(body.user_group, 20, '---ALL---'),
    report_rank: cleanInt(body.report_rank, 1, 0, 999),
  };
}

async function saveShift(req, res, mode) {
  if (!requireModify(req, res, 'modifyCallTimes')) return;
  const id = cleanId(mode === 'create' ? req.body?.shift_id : req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_shift_id');
  if (mode !== 'create' && !scopedUserGroupAllowed(req.genxUser, await recordUserGroup('vicidial_shifts', 'shift_id', id))) {
    return res.status(403).json({ ok: false, error: 'shift_not_allowed' });
  }
  const payload = shiftPayload(req.body || {});
  if (!scopedUserGroupAllowed(req.genxUser, payload.user_group)) return res.status(403).json({ ok: false, error: 'shift_scope_required' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_shifts
         SET shift_id = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'SHIFTS', 'ADD', id, 'GENX ADD SHIFT', 'INSERT INTO vicidial_shifts', payload.shift_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_shifts
         SET ${assignments}
         WHERE shift_id = ?`,
        [...values, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'shift_not_found' });
      await adminLog(req, 'SHIFTS', 'MODIFY', id, 'GENX MODIFY SHIFT', 'UPDATE vicidial_shifts', payload.shift_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'shift_exists' : 'shift_write_failed' });
  }
}

function statusPayload(body) {
  return {
    status_name: cleanText(body.status_name, 30) || 'New Status',
    selectable: ynFlag(body.selectable, 'N'),
    human_answered: ynFlag(body.human_answered, 'N'),
    category: codeText(body.category, 20, 'UNDEFINED'),
    sale: ynFlag(body.sale, 'N'),
    dnc: ynFlag(body.dnc, 'N'),
    customer_contact: ynFlag(body.customer_contact, 'N'),
    not_interested: ynFlag(body.not_interested, 'N'),
    unworkable: ynFlag(body.unworkable, 'N'),
    scheduled_callback: ynFlag(body.scheduled_callback, 'N'),
    completed: ynFlag(body.completed, 'N'),
    min_sec: cleanInt(body.min_sec, 0, 0, 99999),
    max_sec: cleanInt(body.max_sec, 0, 0, 99999),
    answering_machine: ynFlag(body.answering_machine, 'N'),
  };
}

async function saveStatus(req, res, mode) {
  if (!requireModify(req, res, 'modifyStatuses')) return;
  const id = cleanId(mode === 'create' ? req.body?.status : req.params.id, 6);
  if (!id) return badRequest(res, 'invalid_status');
  const payload = statusPayload(req.body || {});
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_statuses
         SET status = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'STATUSES', 'ADD', id, 'GENX ADD STATUS', 'INSERT INTO vicidial_statuses', payload.status_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_statuses
         SET ${assignments}
         WHERE status = ?`,
        [...values, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'status_not_found' });
      await adminLog(req, 'STATUSES', 'MODIFY', id, 'GENX MODIFY STATUS', 'UPDATE vicidial_statuses', payload.status_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'status_exists' : 'status_write_failed' });
  }
}

function campaignStatusPayload(body) {
  return {
    campaign_id: cleanId(body.campaign_id, 20),
    ...statusPayload(body),
  };
}

async function saveCampaignStatus(req, res, mode) {
  if (!canModify(req.genxUser, 'modifyStatuses') && !canModify(req.genxUser, 'modifyCampaigns')) {
    return res.status(403).json({ ok: false, error: 'permission_denied' });
  }
  const id = cleanId(mode === 'create' ? req.body?.status : req.params.id, 6);
  if (!id) return badRequest(res, 'invalid_status');
  const payload = campaignStatusPayload(req.body || {});
  if (!payload.campaign_id) return badRequest(res, 'campaign_required');
  if (!scopeAllows(req.genxUser?.permissions?.allowedCampaigns, payload.campaign_id)) {
    return res.status(403).json({ ok: false, error: 'campaign_not_allowed' });
  }
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_campaign_statuses
         SET status = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'CAMPAIGN_STATUS', 'ADD', payload.campaign_id, 'GENX ADD CAMPAIGN STATUS', 'INSERT INTO vicidial_campaign_statuses', `${id} - ${payload.status_name}`);
    } else {
      const result = await execute(
        `UPDATE vicidial_campaign_statuses
         SET ${assignments}
         WHERE campaign_id = ?
           AND status = ?`,
        [...values, payload.campaign_id, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'campaign_status_not_found' });
      await adminLog(req, 'CAMPAIGN_STATUS', 'MODIFY', payload.campaign_id, 'GENX MODIFY CAMPAIGN STATUS', 'UPDATE vicidial_campaign_statuses', `${id} - ${payload.status_name}`);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'campaign_status_exists' : 'campaign_status_write_failed' });
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
app.post('/api/admin/user-groups', requireAccess, (req, res) => saveUserGroup(req, res, 'create'));
app.put('/api/admin/user-groups/:id', requireAccess, (req, res) => saveUserGroup(req, res, 'update'));
app.post('/api/admin/dids', requireAccess, (req, res) => saveDid(req, res, 'create'));
app.put('/api/admin/dids/:id', requireAccess, (req, res) => saveDid(req, res, 'update'));
app.post('/api/admin/phones', requireAccess, (req, res) => savePhone(req, res, 'create'));
app.put('/api/admin/phones/:id', requireAccess, (req, res) => savePhone(req, res, 'update'));
app.post('/api/admin/scripts', requireAccess, (req, res) => saveScript(req, res, 'create'));
app.put('/api/admin/scripts/:id', requireAccess, (req, res) => saveScript(req, res, 'update'));
app.post('/api/admin/lead-filters', requireAccess, (req, res) => saveLeadFilter(req, res, 'create'));
app.put('/api/admin/lead-filters/:id', requireAccess, (req, res) => saveLeadFilter(req, res, 'update'));
app.post('/api/admin/call-times', requireAccess, (req, res) => saveCallTime(req, res, 'create'));
app.put('/api/admin/call-times/:id', requireAccess, (req, res) => saveCallTime(req, res, 'update'));
app.post('/api/admin/call-menus', requireAccess, (req, res) => saveCallMenu(req, res, 'create'));
app.put('/api/admin/call-menus/:id', requireAccess, (req, res) => saveCallMenu(req, res, 'update'));
app.post('/api/admin/shifts', requireAccess, (req, res) => saveShift(req, res, 'create'));
app.put('/api/admin/shifts/:id', requireAccess, (req, res) => saveShift(req, res, 'update'));
app.post('/api/admin/statuses', requireAccess, (req, res) => saveStatus(req, res, 'create'));
app.put('/api/admin/statuses/:id', requireAccess, (req, res) => saveStatus(req, res, 'update'));
app.post('/api/admin/campaign-statuses', requireAccess, (req, res) => saveCampaignStatus(req, res, 'create'));
app.put('/api/admin/campaign-statuses/:id', requireAccess, (req, res) => saveCampaignStatus(req, res, 'update'));

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
