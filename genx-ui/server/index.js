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
const INGROUP_DROP_ACTION_OPTIONS = ['HANGUP', 'MESSAGE', 'VOICEMAIL', 'IN_GROUP', 'CALLMENU', 'VMAIL_NO_INST'];
const INGROUP_AFTER_HOURS_ACTION_OPTIONS = ['HANGUP', 'MESSAGE', 'EXTENSION', 'VOICEMAIL', 'IN_GROUP', 'CALLMENU', 'VMAIL_NO_INST'];
const INGROUP_NO_AGENT_ACTION_OPTIONS = ['CALLMENU', 'INGROUP', 'DID', 'MESSAGE', 'EXTENSION', 'VOICEMAIL', 'VMAIL_NO_INST'];
const INGROUP_GET_CALL_LAUNCH_OPTIONS = ['NONE', 'SCRIPT', 'SCRIPTTWO', 'WEBFORM', 'WEBFORMTWO', 'WEBFORMTHREE', 'FORM', 'EMAIL'];
const INGROUP_QC_GET_RECORD_LAUNCH_OPTIONS = ['NONE', 'SCRIPT', 'WEBFORM', 'QCSCRIPT', 'QCWEBFORM'];
const INGROUP_RECORDING_OPTIONS = ['DISABLED', 'NEVER', 'ONDEMAND', 'ALLCALLS', 'ALLFORCE'];
const INGROUP_STEREO_RECORDING_OPTIONS = ['DISABLED', 'BOTH_CHANNELS', 'CUSTOMER_ONLY', 'CUSTOMER_MUTE'];
const INGROUP_PLAY_WELCOME_OPTIONS = ['ALWAYS', 'NEVER', 'IF_WAIT_ONLY', 'YES_UNLESS_NODELAY'];
const INGROUP_NO_AGENT_NO_QUEUE_OPTIONS = ['N', 'Y', 'NO_PAUSED', 'NO_READY'];
const INGROUP_IN_QUEUE_NANQUE_OPTIONS = ['N', 'Y', 'NO_PAUSED', 'NO_PAUSED_EXCEPTIONS', 'NO_READY'];
const INGROUP_HOLD_WAIT_ROUTE_OPTIONS = ['NONE', 'EXTENSION', 'VOICEMAIL', 'VMAIL_NO_INST', 'IN_GROUP', 'CALLMENU', 'CALLERID_CALLBACK', 'DROP_ACTION', 'PRESS_STAY', 'PRESS_VMAIL', 'PRESS_VMAIL_NO_INST', 'PRESS_EXTEN', 'PRESS_CALLMENU', 'PRESS_CID_CALLBACK', 'PRESS_INGROUP', 'PRESS_CALLBACK_QUEUE'];
const INGROUP_WAIT_HOLD_PRIORITY_OPTIONS = ['WAIT', 'HOLD', 'BOTH'];
const INGROUP_MAX_CALLS_METHOD_OPTIONS = ['TOTAL', 'IN_QUEUE', 'DISABLED'];
const INGROUP_MAX_CALLS_ACTION_OPTIONS = ['DROP', 'AFTERHOURS', 'NO_AGENT_NO_QUEUE', 'AREACODE_FILTER'];
const INGROUP_AREACODE_FILTER_OPTIONS = ['DISABLED', 'ALLOW_ONLY', 'DROP_ONLY'];
const INGROUP_POPULATE_STATE_OPTIONS = ['DISABLED', 'NEW_LEAD_ONLY', 'OVERWRITE_ALWAYS'];
const INGROUP_ADD_LEAD_TIMEZONE_OPTIONS = ['SERVER', 'PHONE_CODE_AREACODE'];
const INGROUP_ANSWER_SIGNAL_OPTIONS = ['START', 'ROUTE', 'NONE'];
const PHONE_PROTOCOL_OPTIONS = ['SIP', 'PJSIP', 'Zap', 'IAX2', 'EXTERNAL'];
const PHONE_WEBPHONE_OPTIONS = ['Y', 'N', 'Y_API_LAUNCH'];
const PHONE_WEBPHONE_DIALPAD_OPTIONS = ['Y', 'N', 'TOGGLE', 'TOGGLE_OFF'];
const CALL_MENU_ROUTE_OPTIONS = ['CALLMENU', 'INGROUP', 'DID', 'HANGUP', 'EXTENSION', 'PHONE', 'VOICEMAIL', 'VMAIL_NO_INST', 'AGI'];
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
const ENABLED_DISABLED_OPTIONS = ['ENABLED', 'DISABLED'];
const TRANSFER_PRESET_OPTIONS = ['N', 'PRESET_1', 'PRESET_2', 'PRESET_3', 'PRESET_4', 'PRESET_5'];
const QUICK_TRANSFER_OPTIONS = ['N', 'IN_GROUP', 'PRESET_1', 'PRESET_2', 'PRESET_3', 'PRESET_4', 'PRESET_5', 'LOCKED_IN_GROUP', 'LOCKED_PRESET_1', 'LOCKED_PRESET_2', 'LOCKED_PRESET_3', 'LOCKED_PRESET_4', 'LOCKED_PRESET_5'];
const TRANSFER_NO_DISPO_OPTIONS = ['DISABLED', 'EXTERNAL_ONLY', 'LOCAL_ONLY', 'LEAVE3WAY_ONLY', 'LOCAL_AND_EXTERNAL', 'LOCAL_AND_LEAVE3WAY', 'LEAVE3WAY_AND_EXTERNAL', 'LOCAL_AND_EXTERNAL_AND_LEAVE3WAY'];
const CUSTOM_3WAY_OPTIONS = ['DISABLED', 'PRESET_1', 'PRESET_2', 'PRESET_3', 'PRESET_4', 'PRESET_5', 'FIELD_address3', 'FIELD_province', 'FIELD_security_phrase', 'FIELD_vendor_lead_code', 'FIELD_email', 'FIELD_owner', 'PARK_PRESET_1', 'PARK_PRESET_2', 'PARK_PRESET_3', 'PARK_PRESET_4', 'PARK_PRESET_5', 'PARK_FIELD_address3', 'PARK_FIELD_province', 'PARK_FIELD_security_phrase', 'PARK_FIELD_vendor_lead_code', 'PARK_FIELD_email', 'PARK_FIELD_owner', 'VIEW_PRESET', 'VIEW_CONTACTS'];
const AGENT_LEAD_SEARCH_METHOD_OPTIONS = ['SYSTEM', 'CAMPAIGNLISTS', 'CAMPLISTS_ALL', 'LIST', 'USER_CAMPAIGNLISTS', 'USER_CAMPLISTS_ALL', 'USER_LIST', 'GROUP_SYSTEM', 'GROUP_CAMPAIGNLISTS', 'GROUP_CAMPLISTS_ALL', 'GROUP_LIST', 'TERRITORY_SYSTEM', 'TERRITORY_CAMPAIGNLISTS', 'TERRITORY_CAMPLISTS_ALL', 'TERRITORY_LIST'];
const AGENT_OWNER_ONLY_OPTIONS = ['NONE', 'USER', 'TERRITORY', 'USER_GROUP', 'USER_BLANK', 'TERRITORY_BLANK', 'USER_GROUP_BLANK'];
const STATUS_DISPLAY_FIELD_OPTIONS = ['NAME', 'CALLID', 'LEADID', 'LISTID', 'CALLID_LEADID', 'CALLID_LISTID', 'CALLID_LEADID_LISTID', 'NAME_CALLID', 'NAME_CALLID_LEADID', 'NAME_CALLID_LISTID', 'NAME_CALLID_LEADID_LISTID', '---NONE---'];
const AGENT_SCREEN_TIME_OPTIONS = ['DISABLED', 'ENABLED_BASIC', 'ENABLED_FULL', 'ENABLED_BILL_BREAK_LUNCH_COACH', 'ENABLED_BASIC_RANGE', 'ENABLED_FULL_RANGE', 'ENABLED_EXTENDED_RANGE', 'ENABLED_BILL_BREAK_LUNCH_COACH_RANGE'];
const MANUAL_DIAL_FILTER_OPTIONS = ['NONE', 'DNC_ONLY', 'CAMPDNC_ONLY', 'INTERNALDNC_ONLY', 'DNC_AND_CAMPDNC', 'CAMPLISTS_ONLY', 'CAMPLISTS_ALL', 'SYSTEM', 'DNC_AND_CAMPLISTS', 'CAMPDNC_ONLY_AND_CAMPLISTS', 'INTERNALDNC_ONLY_AND_CAMPLISTS', 'DNC_AND_CAMPDNC_AND_CAMPLISTS', 'DNC_AND_CAMPLISTS_ALL', 'CAMPDNC_ONLY_AND_CAMPLISTS_ALL', 'INTERNALDNC_ONLY_AND_CAMPLISTS_ALL', 'DNC_AND_CAMPDNC_AND_CAMPLISTS_ALL', 'DNC_AND_SYSTEM', 'CAMPDNC_ONLY_AND_SYSTEM', 'INTERNALDNC_ONLY_AND_SYSTEM', 'DNC_AND_CAMPDNC_AND_SYSTEM', 'NONE_WITH_ALT', 'DNC_ONLY_WITH_ALT', 'CAMPDNC_ONLY_WITH_ALT', 'INTERNALDNC_ONLY_WITH_ALT', 'DNC_AND_CAMPDNC_WITH_ALT', 'CAMPLISTS_ONLY_WITH_ALT', 'CAMPLISTS_ALL_WITH_ALT', 'SYSTEM_WITH_ALT', 'DNC_AND_CAMPLISTS_WITH_ALT', 'CAMPDNC_ONLY_AND_CAMPLISTS_WITH_ALT', 'INTERNALDNC_ONLY_AND_CAMPLISTS_WITH_ALT', 'DNC_AND_CAMPDNC_AND_CAMPLISTS_WITH_ALT', 'DNC_AND_CAMPLISTS_ALL_WITH_ALT', 'CAMPDNC_ONLY_AND_CAMPLISTS_ALL_WITH_ALT', 'INTERNALDNC_ONLY_AND_CAMPLISTS_ALL_WITH_ALT', 'DNC_AND_CAMPDNC_AND_CAMPLISTS_ALL_WITH_ALT', 'DNC_AND_SYSTEM_WITH_ALT', 'CAMPDNC_ONLY_AND_SYSTEM_WITH_ALT', 'INTERNALDNC_ONLY_AND_SYSTEM_WITH_ALT', 'DNC_AND_CAMPDNC_AND_SYSTEM_WITH_ALT', 'NONE_WITH_ALT_ADDR3', 'DNC_ONLY_WITH_ALT_ADDR3', 'CAMPDNC_ONLY_WITH_ALT_ADDR3', 'INTERNALDNC_ONLY_WITH_ALT_ADDR3', 'DNC_AND_CAMPDNC_WITH_ALT_ADDR3', 'CAMPLISTS_ONLY_WITH_ALT_ADDR3', 'CAMPLISTS_ALL_WITH_ALT_ADDR3', 'SYSTEM_WITH_ALT_ADDR3', 'DNC_AND_CAMPLISTS_WITH_ALT_ADDR3', 'CAMPDNC_ONLY_AND_CAMPLISTS_WITH_ALT_ADDR3', 'INTERNALDNC_ONLY_AND_CAMPLISTS_WITH_ALT_ADDR3', 'DNC_AND_CAMPDNC_AND_CAMPLISTS_WITH_ALT_ADDR3', 'DNC_AND_CAMPLISTS_ALL_WITH_ALT_ADDR3', 'CAMPDNC_ONLY_AND_CAMPLISTS_ALL_WITH_ALT_ADDR3', 'INTERNALDNC_ONLY_AND_CAMPLISTS_ALL_WITH_ALT_ADDR3', 'DNC_AND_CAMPDNC_AND_CAMPLISTS_ALL_WITH_ALT_ADDR3', 'DNC_AND_SYSTEM_WITH_ALT_ADDR3', 'CAMPDNC_ONLY_AND_SYSTEM_WITH_ALT_ADDR3', 'INTERNALDNC_ONLY_AND_SYSTEM_WITH_ALT_ADDR3', 'DNC_AND_CAMPDNC_AND_SYSTEM_WITH_ALT_ADDR3', 'CALLBACK', 'DNC_AND_CALLBACK', 'CAMPDNC_ONLY_AND_CALLBACK', 'INTERNALDNC_ONLY_AND_CALLBACK', 'DNC_AND_CAMPDNC_AND_CALLBACK', 'NONE_WITH_ALT_AND_CALLBACK', 'DNC_ONLY_WITH_ALT_AND_CALLBACK', 'CAMPDNC_ONLY_WITH_ALT_AND_CALLBACK', 'INTERNALDNC_ONLY_WITH_ALT_AND_CALLBACK', 'DNC_AND_CAMPDNC_WITH_ALT_AND_CALLBACK', 'NONE_WITH_ALT_ADDR3_AND_CALLBACK', 'DNC_ONLY_WITH_ALT_ADDR3_AND_CALLBACK', 'CAMPDNC_ONLY_WITH_ALT_ADDR3_AND_CALLBACK', 'INTERNALDNC_ONLY_WITH_ALT_ADDR3_AND_CALLBACK', 'DNC_AND_CAMPDNC_WITH_ALT_ADDR3_AND_CALLBACK'];
const MANUAL_SEARCH_FILTER_OPTIONS = ['NONE', 'CAMPLISTS_ONLY', 'CAMPLISTS_ALL', 'NONE_WITH_ALT', 'CAMPLISTS_ONLY_WITH_ALT', 'CAMPLISTS_ALL_WITH_ALT', 'NONE_WITH_ALT_ADDR3', 'CAMPLISTS_ONLY_WITH_ALT_ADDR3', 'CAMPLISTS_ALL_WITH_ALT_ADDR3'];
const QUEUE_FIELD_OPTIONS = ['DISABLED', 'lead_id', 'entry_date', 'status', 'user', 'vendor_lead_code', 'source_id', 'list_id', 'gmt_offset_now', 'called_since_last_reset', 'phone_code', 'phone_number', 'title', 'first_name', 'middle_initial', 'last_name', 'address1', 'address2', 'address3', 'city', 'state', 'province', 'postal_code', 'country_code', 'gender', 'date_of_birth', 'alt_phone', 'email', 'security_phrase', 'comments', 'called_count', 'last_local_call_time', 'rank', 'owner', 'entry_list_id'];
const LEAD_FIELD_OPTIONS = ['DISABLED', 'vendor_lead_code', 'source_id', 'list_id', 'phone_code', 'phone_number', 'title', 'first_name', 'middle_initial', 'last_name', 'address1', 'address2', 'address3', 'city', 'state', 'province', 'postal_code', 'country_code', 'gender', 'alt_phone', 'email', 'security_phrase', 'comments', 'rank', 'owner', 'entry_list_id'];
const AUTO_HOPPER_MULTI_OPTIONS = ['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '2.0', '2.2', '2.4', '2.6', '2.8', '3.0', '3.5', '4.0'];

app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

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
    deleteIngroups: row.delete_ingroups === '1',
    deleteInboundDids: row.delete_inbound_dids === '1',
    deleteFromDnc: row.delete_from_dnc === '1',
    deleteFilters: row.delete_filters === '1',
    modifyUsergroups: row.modify_usergroups === '1',
    modifyScripts: row.modify_scripts === '1',
    modifyFilters: row.modify_filters === '1',
    modifyServers: row.modify_servers === '1',
    modifyCarriers: row.modify_carriers === '1',
    modifyStatuses: row.modify_statuses === '1',
    modifyPhones: row.modify_phones === '1',
    modifyCallTimes: row.modify_call_times === '1',
    loadLeads: row.load_leads === '1',
    modifySettingsContainers: ['1', '2', '3', '4', '5', '6'].includes(String(row.modify_settings_containers || '')),
    accessRecordings: row.access_recordings === '1',
    exportReports: row.export_reports === '1',
    deleteCampaigns: row.delete_campaigns === '1',
    deleteUsers: row.delete_users === '1',
    deleteLists: row.delete_lists === '1',
    deleteScripts: row.delete_scripts === '1',
    deleteUserGroups: row.delete_user_groups === '1',
    deleteCallTimes: row.delete_call_times === '1',
    downloadLists: row.download_lists === '1',
    modifyLeads: Number(row.modify_leads || 0),
    astDeletePhones: row.ast_delete_phones === '1',
    modifyRemoteagents: row.modify_remoteagents === '1',
    deleteRemoteAgents: row.delete_remote_agents === '1',
    modifyIpLists: row.modify_ip_lists === '1',
    modifyContacts: row.modify_contacts === '1',
    modifyLanguages: row.modify_languages === '1',
    modifyVoicemail: row.modify_voicemail === '1',
    modifyAutoReports: row.modify_auto_reports === '1',
    modifyMoh: row.modify_moh === '1',
    modifyTts: row.modify_tts === '1',
    modifyLabels: row.modify_labels === '1',
    modifyColors: row.modify_colors === '1',
    adminHideLeadData: row.admin_hide_lead_data === '1',
    adminHidePhoneData: row.admin_hide_phone_data || '0',
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
            u.delete_ingroups,
            u.delete_inbound_dids,
            u.delete_from_dnc,
            u.delete_filters,
            u.modify_usergroups,
            u.modify_scripts,
            u.modify_filters,
            u.modify_servers,
            u.modify_carriers,
            u.modify_statuses,
            u.modify_phones,
            u.modify_call_times,
            u.load_leads,
            u.export_reports,
            u.access_recordings,
            u.modify_settings_containers,
            u.delete_campaigns,
            u.delete_users,
            u.delete_lists,
            u.delete_scripts,
            u.delete_user_groups,
            u.delete_call_times,
            u.download_lists,
            u.modify_leads,
            u.ast_delete_phones,
            u.modify_remoteagents,
            u.delete_remote_agents,
            u.modify_ip_lists,
            u.modify_contacts,
            u.modify_languages,
            u.modify_voicemail,
            u.modify_auto_reports,
            u.modify_moh,
            u.modify_tts,
            u.modify_labels,
            u.modify_colors,
            u.admin_hide_lead_data,
            u.admin_hide_phone_data,
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

function groupListValues(value) {
  const values = Array.isArray(value) ? value : String(value || '').split(/\s+/);
  return [...new Set(values.map((item) => cleanId(item, 20)).filter((item) => item && item !== '-'))];
}

function groupListText(value) {
  const cleanValues = groupListValues(value);
  return cleanValues.length ? `${cleanValues.join(' ')} -` : '';
}

function scopedGroupListText(value, scope) {
  return groupListText(groupListValues(value).filter((item) => scopeAllows(scope, item)));
}

function mergeScopedGroupList(submittedValue, existingValue, scope) {
  if (!scope || scope.all) return groupListText(submittedValue);
  const submittedAllowed = groupListValues(submittedValue).filter((item) => scopeAllows(scope, item));
  const existingRestricted = groupListValues(existingValue).filter((item) => !scopeAllows(scope, item));
  return groupListText([...existingRestricted, ...submittedAllowed]);
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
  const serverParams = [];
  const serverWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'user_group', serverParams);
  const carrierParams = [];
  const carrierWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'user_group', carrierParams);
  const callTimeParams = [];
  const callTimeWhere = scopeWhere(user?.permissions?.adminViewableCallTimes, 'call_time_id', callTimeParams);
  const scriptParams = [];
  const scriptWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'user_group', scriptParams);
  const filterParams = [];
  const filterWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'user_group', filterParams);
  const callMenuParams = [];
  const callMenuScopeWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'user_group', callMenuParams);
  const callMenuWhere = `(${callMenuScopeWhere} OR user_group = '---ALL---')`;
  const callMenuOptionParams = [];
  const callMenuOptionScopeWhere = scopeWhere(user?.permissions?.adminViewableGroups, 'm.user_group', callMenuOptionParams);
  const callMenuOptionWhere = `(${callMenuOptionScopeWhere} OR m.user_group = '---ALL---')`;
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
    pauseCodes,
    campaignHotkeys,
    leadRecycle,
    systemSettingsRows,
    dids,
    phones,
    callMenus,
    callMenuOptions,
    shifts,
    phoneCodes,
    cidGroups,
    ipLists,
    filterPhoneGroups,
    audioStore,
    voicemailBoxes,
    musicOnHold,
    remoteAgents,
    dropLists,
    phoneAliases,
    groupAliases,
    conferences,
    agentConferences,
    queueGroups,
    contacts,
    languages,
    voicemailFull,
    vmMessageGroups,
    automatedReports,
    mohFull,
    ttsPrompts,
    soundboards,
    stateCallTimes,
    holidays,
    statusGroups,
    screenLabels,
    screenColors,
    settingsContainers,
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
              c.incall_tally_threshold_seconds,
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
              c.closer_campaigns,
              c.manual_dial_list_id,
              c.default_xfer_group,
              c.xfer_groups,
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
              c.campaign_stats_refresh,
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
              c.adaptive_latest_server_time,
              c.adaptive_percentmax_percentage,
              c.drop_rate_group,
              c.call_count_limit,
              c.call_count_target,
              c.call_count_limit_restrict,
              c.drop_lockout_time,
              c.auto_alt_threshold,
              c.alt_number_dialing,
              c.timer_alt_seconds,
              c.inbound_no_agents_no_dial_container,
              c.inbound_no_agents_no_dial_threshold,
              c.dial_timeout_lead_container,
              c.cid_group_id,
              c.cid_group_id_two,
              c.safe_harbor_menu_id,
              c.agent_hangup_ig_override,
              c.campaign_vdad_exten,
              c.user_group_script,
              c.script_tab_frame_size,
              c.script_tab_height,
              c.clear_form,
              c.am_message_exten,
              c.vmm_daily_limit,
              c.waitforsilence_options,
              c.manual_vm_status_updates,
              c.am_message_wildcards,
              c.amd_send_to_vmx,
              c.amd_agent_route_options,
              c.amd_status_map,
              c.cpd_amd_action,
              c.cpd_unknown_action,
              c.amd_inbound_group,
              c.amd_callmenu,
              c.leave_vm_message_group_id,
              c.leave_vm_no_dispo,
              c.xferconf_a_dtmf,
              c.xferconf_a_number,
              c.xferconf_b_dtmf,
              c.xferconf_b_number,
              c.xferconf_c_number,
              c.xferconf_d_number,
              c.xferconf_e_number,
              c.hide_xfer_number_to_dial,
              c.prepopulate_transfer_preset,
              c.quick_transfer_button,
              c.transfer_no_dispo,
              c.custom_3way_button_transfer,
              c.three_way_volume_buttons,
              c.customer_3way_hangup_logging,
              c.customer_3way_hangup_seconds,
              c.customer_3way_hangup_action,
              c.three_way_record_stop,
              c.three_way_record_stop_exception,
              c.leave_3way_start_recording,
              c.leave_3way_start_recording_exception,
              c.leave_3way_stop_recording,
              c.hangup_xfer_record_start,
              c.scheduled_callbacks_timezones_container,
              c.callback_useronly_move_minutes,
              c.disable_dispo_screen,
              c.disable_dispo_status,
              c.script_top_dispo,
              c.wrapup_after_hotkey,
              c.dead_trigger_action,
              c.dead_trigger_seconds,
              c.dead_trigger_repeat,
              c.dead_trigger_filename,
              c.dead_trigger_url,
              c.dead_max,
              c.dead_max_dispo,
              c.dead_to_dispo,
              c.dispo_max,
              c.dispo_max_dispo,
              c.pause_max,
              c.pause_max_dispo,
              c.pause_max_exceptions,
              c.pause_max_url,
              c.in_man_dial_next_ready_seconds,
              c.in_man_dial_next_ready_seconds_override,
              c.customer_gone_seconds,
              c.agent_lead_search_method,
              c.agent_search_ingroup_list,
              c.agent_dial_owner_only,
              c.agent_display_dialable_leads,
              c.screen_labels,
              c.allow_required_fields,
              c.status_display_fields,
              c.state_descriptions,
              c.agent_screen_time_display,
              c.calls_inqueue_count_one,
              c.calls_inqueue_count_two,
              c.view_calls_in_queue,
              c.view_calls_in_queue_launch,
              c.calls_waiting_vl_one,
              c.calls_waiting_vl_two,
              c.grab_calls_in_queue,
              c.call_requeue_button,
              c.auto_pause_precall,
              c.auto_resume_precall,
              c.auto_pause_precall_code,
              c.realtime_agent_time_stats,
              c.disable_alter_custdata,
              c.disable_alter_custphone,
              c.no_hopper_dialing,
              c.manual_dial_override,
              c.manual_dial_override_field,
              c.manual_dial_search_checkbox,
              c.manual_dial_lead_id,
              c.api_manual_dial,
              c.manual_dial_cid,
              c.manual_minimum_attempt_seconds,
              c.manual_minimum_answer_seconds,
              c.post_phone_time_diff_alert,
              c.in_group_dial,
              c.in_group_dial_select,
              c.force_per_call_notes,
              c.comments_all_tabs,
              c.comments_dispo_screen,
              c.comments_callback_screen,
              c.qc_comment_history,
              c.max_inbound_calls_outcome,
              c.agent_allow_group_alias,
              c.crm_popup_login,
              c.crm_login_address,
              c.extension_appended_cidname,
              c.blind_monitor_warning,
              c.blind_monitor_message,
              c.blind_monitor_filename,
              c.agent_xfer_validation,
              c.ig_xfer_list_sort,
              c.use_other_campaign_dnc,
              c.agent_display_fields,
              c.custom_one,
              c.custom_two,
              c.custom_three,
              c.custom_four,
              c.custom_five,
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
              modify_email_accounts,
              vdc_agent_api_access,
              phone_pass,
              delete_users,
              delete_user_groups,
              delete_lists,
              delete_campaigns,
              delete_ingroups,
              delete_remote_agents,
              delete_scripts,
              delete_filters,
              delete_call_times,
              delete_inbound_dids,
              delete_from_dnc,
              load_leads,
              modify_leads,
              modify_remoteagents,
              modify_shifts,
              modify_labels,
              modify_voicemail,
              modify_audiostore,
              modify_moh,
              modify_tts,
              modify_contacts,
              modify_same_user_level,
              modify_custom_dialplans,
              modify_languages,
              modify_colors,
              modify_auto_reports,
              modify_ip_lists,
              modify_dial_prefix,
              ast_admin_access,
              ast_delete_phones,
              hotkeys_active,
              change_agent_campaign,
              agent_choose_ingroups,
              closer_campaigns,
              scheduled_callbacks,
              agentonly_callbacks,
              agentcall_manual,
              vicidial_recording,
              vicidial_transfers,
              alter_agent_interface_options,
              closer_default_blended,
              vicidial_recording_override,
              alter_custdata_override,
              alter_custphone_override,
              alert_enabled,
              allow_alerts,
              agent_choose_territories,
              download_lists,
              agent_shift_enforcement_override,
              manager_shift_enforcement_override,
              shift_override_flag,
              user_code,
              territory,
              voicemail_id,
              agent_call_log_view_override,
              callcard_admin,
              agent_choose_blended,
              realtime_block_user_info,
              custom_fields_modify,
              force_change_password,
              agent_lead_search_override,
              preset_contact_search,
              admin_hide_lead_data,
              admin_hide_phone_data,
              agentcall_email,
              agentcall_chat,
              max_inbound_calls,
              wrapup_seconds_override,
              selected_language,
              user_choose_language,
              ignore_group_on_search,
              api_list_restrict,
              api_allowed_functions,
              lead_filter_id,
              admin_cf_show_hidden,
              user_hide_realtime,
              user_nickname,
              user_new_lead_limit,
              api_only_user,
              ignore_ip_list,
              ready_max_logout,
              export_gdpr_leads,
              pause_code_approval,
              max_hopper_calls,
              max_hopper_calls_hour,
              mute_recordings,
              hide_call_log_info,
              next_dial_my_callbacks,
              user_admin_redirect_url,
              max_inbound_filter_enabled,
              max_inbound_filter_statuses,
              max_inbound_filter_ingroups,
              max_inbound_filter_min_sec,
              status_group_id,
              mobile_number,
              two_factor_override,
              manual_dial_filter,
              user_location,
              download_invalid_files,
              user_group_two,
              inbound_credits,
              hci_enabled,
              manual_dial_lead_id,
              qc_enabled,
              qc_user_level,
              qc_pass,
              qc_finish,
              qc_commit,
              add_timeclock_log,
              modify_timeclock_log,
              delete_timeclock_log,
              custom_one,
              custom_two,
              custom_three,
              custom_four,
              custom_five
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
              l.reset_time,
              l.agent_script_override,
              l.campaign_cid_override,
              l.am_message_exten_override,
              l.drop_inbound_group_override,
              l.xferconf_a_number,
              l.xferconf_b_number,
              l.xferconf_c_number,
              l.xferconf_d_number,
              l.xferconf_e_number,
              l.web_form_address,
              l.web_form_address_two,
              l.web_form_address_three,
              l.time_zone_setting,
              l.inventory_report,
              l.expiration_date,
              l.na_call_url,
              l.local_call_time,
              l.status_group_id,
              l.user_new_lead_limit,
              l.inbound_list_script_override,
              l.default_xfer_group,
              l.daily_reset_limit,
              l.auto_active_list_rank,
              l.inbound_drop_voicemail,
              l.inbound_after_hours_voicemail,
              l.qc_scorecard_id,
              l.qc_statuses_id,
              l.qc_web_form_address,
              l.auto_alt_threshold,
              l.cid_group_id,
              l.dial_prefix,
              l.weekday_resets_container,
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
      `SELECT *
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
              telnet_host,
              telnet_port,
              ASTmgrUSERNAME,
              ASTmgrSECRET,
              ASTmgrUSERNAMEupdate,
              ASTmgrUSERNAMElisten,
              ASTmgrUSERNAMEsend,
              local_gmt,
              voicemail_dump_exten,
              voicemail_dump_exten_no_inst,
              answer_transfer_agent,
              ext_context,
              sys_perf_log,
              vd_server_logs,
              agi_output,
              vicidial_balance_active,
              vicidial_balance_rank,
              balance_trunks_offlimits,
              recording_web_link,
              alt_server_ip,
              active_twin_server_ip,
              sysload,
              channels_total,
              cpu_idle_percent,
              disk_usage,
              generate_vicidial_conf,
              rebuild_conf_files,
              outbound_calls_per_second,
              sounds_update,
              vicidial_recording_limit,
              carrier_logging_active,
              active_agent_login_server,
              external_server_ip,
              custom_dialplan_entry,
              user_group,
              system_uptime,
              auto_restart_asterisk,
              asterisk_temp_no_restart,
              gather_asterisk_output,
              conf_engine,
              conf_secret,
              conf_qualify,
              routing_prefix,
              conf_update_interval,
              web_socket_url,
              external_web_socket_url,
              ara_url
       FROM servers
       WHERE ${serverWhere}
       ORDER BY active DESC, server_id ASC
       LIMIT 50`,
      serverParams,
      [],
    ),
    requiredRows(
      `SELECT carrier_id,
              carrier_name,
              registration_string,
              template_id,
              account_entry,
              protocol,
              globals_string,
              dialplan_entry,
              server_ip,
              active,
              carrier_description,
              user_group
       FROM vicidial_server_carriers
       WHERE ${carrierWhere}
       ORDER BY active DESC, carrier_id ASC
       LIMIT 100`,
      carrierParams,
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
              agent_fullscreen,
              agent_xfer_consultative,
              agent_xfer_dial_override,
              agent_xfer_vm_transfer,
              agent_xfer_blind_transfer,
              agent_xfer_dial_with_customer,
              agent_xfer_park_customer_dial,
              agent_xfer_park_3way,
              allowed_reports,
              admin_viewable_groups,
              admin_viewable_call_times,
              allowed_custom_reports,
              agent_allowed_chat_groups,
              allowed_queue_groups,
              webphone_url_override,
              webphone_systemkey_override,
              webphone_dialpad_override,
              webphone_layout,
              admin_ip_list,
              agent_ip_list,
              api_ip_list,
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
              mix_method,
              list_mix_container
       FROM vicidial_campaigns_list_mix
       WHERE ${campaignStatusWhere}
       ORDER BY campaign_id ASC, status ASC, vcl_id ASC
       LIMIT 1000`,
      campaignStatusParams,
      [],
    ),
    rows(
      `SELECT campaign_id,
              pause_code,
              pause_code_name,
              billable,
              time_limit,
              require_mgr_approval
       FROM vicidial_pause_codes
       WHERE ${campaignStatusWhere}
       ORDER BY campaign_id ASC, pause_code ASC
       LIMIT 1000`,
      campaignStatusParams,
      [],
    ),
    rows(
      `SELECT campaign_id,
              hotkey,
              status,
              status_name,
              selectable
       FROM vicidial_campaign_hotkeys
       WHERE ${campaignStatusWhere}
       ORDER BY campaign_id ASC, hotkey ASC
       LIMIT 1000`,
      campaignStatusParams,
      [],
    ),
    rows(
      `SELECT recycle_id,
              campaign_id,
              status,
              attempt_delay,
              attempt_maximum,
              active
       FROM vicidial_lead_recycle
       WHERE ${campaignStatusWhere}
       ORDER BY campaign_id ASC, status ASC, recycle_id ASC
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
              filter_clean_cid_number,
              no_agent_ingroup_redirect,
              no_agent_ingroup_id,
              no_agent_ingroup_extension,
              max_queue_ingroup_calls,
              max_queue_ingroup_id,
              max_queue_ingroup_extension,
              pre_filter_phone_group_id,
              pre_filter_extension,
              pre_filter_recent_call,
              pre_filter_recent_extension,
              filter_phone_group_id,
              filter_url,
              filter_url_did_redirect,
              filter_dnc_campaign,
              filter_action,
              filter_extension,
              filter_exten_context,
              filter_voicemail_ext,
              filter_phone,
              filter_server_ip,
              filter_user,
              filter_user_unavailable_action,
              filter_user_route_settings_ingroup,
              filter_group_id,
              filter_call_handle_method,
              filter_agent_search_method,
              filter_list_id,
              filter_campaign_id,
              filter_phone_code,
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
              company,
              picture,
              messages,
              old_messages,
              protocol,
              local_gmt,
              ASTmgrUSERNAME,
              ASTmgrSECRET,
              login_user,
              login_campaign,
              park_on_extension,
              conf_on_extension,
              VICIDIAL_park_on_extension,
              VICIDIAL_park_on_filename,
              monitor_prefix,
              recording_exten,
              voicemail_exten,
              voicemail_dump_exten,
              voicemail_dump_exten_no_inst,
              ext_context,
              dtmf_send_extension,
              call_out_number_group,
              client_browser,
              install_directory,
              local_web_callerID_URL,
              VICIDIAL_web_URL,
              AGI_call_logging_enabled,
              user_switching_enabled,
              conferencing_enabled,
              admin_hangup_enabled,
              admin_hijack_enabled,
              admin_monitor_enabled,
              call_parking_enabled,
              updater_check_enabled,
              AFLogging_enabled,
              QUEUE_ACTION_enabled,
              CallerID_popup_enabled,
              voicemail_button_enabled,
              enable_fast_refresh,
              fast_refresh_rate,
              enable_persistant_mysql,
              auto_dial_next_number,
              VDstop_rec_after_each_call,
              outbound_cid,
              outbound_alt_cid,
              enable_sipsak_messages,
              email,
              template_id,
              conf_override,
              phone_context,
              phone_ring_timeout,
              conf_secret,
              delete_vm_after_email,
              is_webphone,
              use_external_server_ip,
              codecs_list,
              codecs_with_template,
              on_hook_agent,
              voicemail_timezone,
              voicemail_options,
              user_group,
              voicemail_greeting,
              voicemail_instructions,
              on_login_report,
              unavail_dialplan_fwd_exten,
              unavail_dialplan_fwd_context,
              nva_call_url,
              nva_search_method,
              nva_error_filename,
              nva_new_list_id,
              nva_new_phone_code,
              nva_new_status,
              webphone_dialpad,
              webphone_auto_answer,
              webphone_dialbox,
              webphone_mute,
              webphone_volume,
              webphone_debug,
              conf_qualify,
              webphone_layout,
              mohsuggest,
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
      `SELECT o.menu_id,
              o.option_value,
              o.option_description,
              o.option_route,
              o.option_route_value,
              o.option_route_value_context,
              m.menu_name,
              m.user_group
       FROM vicidial_call_menu_options o
       JOIN vicidial_call_menu m ON m.menu_id = o.menu_id
       WHERE ${callMenuOptionWhere}
       ORDER BY o.menu_id ASC, o.option_value ASC
       LIMIT 1000`,
      callMenuOptionParams,
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
    rows(
      `SELECT cid_group_id,
              cid_group_notes,
              cid_group_type,
              user_group,
              cid_auto_rotate_minutes,
              cid_auto_rotate_minimum,
              cid_auto_rotate_calls
       FROM vicidial_cid_groups
       ORDER BY cid_group_id ASC
       LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT l.ip_list_id,
              l.ip_list_name,
              l.active,
              l.user_group,
              COALESCE(e.entry_count, 0) AS entry_count
       FROM vicidial_ip_lists l
       LEFT JOIN (SELECT ip_list_id, COUNT(*) AS entry_count FROM vicidial_ip_list_entries GROUP BY ip_list_id) e
         ON e.ip_list_id = l.ip_list_id
       ORDER BY l.ip_list_id ASC
       LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT g.filter_phone_group_id,
              g.filter_phone_group_name,
              g.filter_phone_group_description,
              g.user_group,
              COALESCE(counts.phone_count, 0) AS phone_count,
              GROUP_CONCAT(numbers.phone_number SEPARATOR '\n') AS phone_numbers
       FROM vicidial_filter_phone_groups g
       LEFT JOIN (
         SELECT filter_phone_group_id, COUNT(*) AS phone_count
         FROM vicidial_filter_phone_numbers
         GROUP BY filter_phone_group_id
       ) counts ON counts.filter_phone_group_id = g.filter_phone_group_id
       LEFT JOIN vicidial_filter_phone_numbers numbers ON numbers.filter_phone_group_id = g.filter_phone_group_id
       GROUP BY g.filter_phone_group_id, g.filter_phone_group_name, g.filter_phone_group_description, g.user_group, counts.phone_count
       ORDER BY g.filter_phone_group_id ASC
       LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT filename,
              description,
              active,
              user_group
       FROM vicidial_audio_store
       ORDER BY active DESC, filename ASC
       LIMIT 1000`,
      [],
      [],
    ),
    rows(
      `SELECT voicemail_id,
              fullname,
              email,
              user_group
       FROM vicidial_voicemail
       ORDER BY voicemail_id ASC
       LIMIT 1000`,
      [],
      [],
    ),
    rows(
      `SELECT moh_id,
              moh_name,
              active,
              user_group
       FROM vicidial_music_on_hold
       ORDER BY active DESC, moh_id ASC
       LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT remote_agent_id,
              user_start,
              number_of_lines,
              server_ip,
              conf_exten,
              status,
              campaign_id,
              closer_campaigns,
              extension_group,
              extension_group_order,
              on_hook_agent,
              on_hook_ring_time
       FROM vicidial_remote_agents
       ORDER BY remote_agent_id ASC
       LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT dl_id,
              dl_name,
              last_run,
              dl_server,
              dl_times,
              dl_weekdays,
              dl_monthdays,
              drop_statuses,
              list_id,
              duplicate_check,
              run_now_trigger,
              active,
              user_group,
              closer_campaigns,
              dl_minutes
       FROM vicidial_drop_lists
       ORDER BY dl_id ASC
       LIMIT 500`,
      [],
      [],
    ),
    rows(
      'SELECT alias_id, alias_name, logins_list, user_group FROM phones_alias ORDER BY alias_id ASC LIMIT 500',
      [],
      [],
    ),
    rows(
      `SELECT group_alias_id, group_alias_name, caller_id_number, caller_id_name, active, user_group
       FROM groups_alias ORDER BY group_alias_id ASC LIMIT 500`,
      [],
      [],
    ),
    rows(
      'SELECT conf_exten, server_ip, extension FROM conferences ORDER BY server_ip ASC, conf_exten ASC LIMIT 1000',
      [],
      [],
    ),
    rows(
      `SELECT conf_exten, server_ip, extension, leave_3way FROM vicidial_conferences
       ORDER BY server_ip ASC, conf_exten ASC LIMIT 1000`,
      [],
      [],
    ),
    rows(
      `SELECT queue_group, queue_group_name, included_campaigns, included_inbound_groups, user_group, active
       FROM vicidial_queue_groups ORDER BY queue_group ASC LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT contact_id, first_name, last_name, office_num, cell_num, other_num1, other_num2,
              bu_name, department, group_name, job_title, location
       FROM contact_information ORDER BY last_name ASC, first_name ASC LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT language_id, language_code, language_description, user_group, active
       FROM vicidial_languages ORDER BY language_id ASC LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT voicemail_id, active, fullname, messages, old_messages, email, delete_vm_after_email,
              voicemail_timezone, user_group, on_login_report
       FROM vicidial_voicemail ORDER BY voicemail_id ASC LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT leave_vm_message_group_id, leave_vm_message_group_notes, active, user_group
       FROM leave_vm_message_groups ORDER BY leave_vm_message_group_id ASC LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT report_id, report_name, report_last_run, report_server, report_times, report_weekdays,
              report_destination, email_to, report_url, run_now_trigger, active, user_group
       FROM vicidial_automated_reports ORDER BY report_id ASC LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT m.moh_id, m.moh_name, m.active, m.random, m.user_group,
              COALESCE(f.file_count, 0) AS file_count
       FROM vicidial_music_on_hold m
       LEFT JOIN (SELECT moh_id, COUNT(*) AS file_count FROM vicidial_music_on_hold_files GROUP BY moh_id) f
         ON f.moh_id = m.moh_id
       ORDER BY m.moh_id ASC LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT tts_id, tts_name, active, tts_text, tts_voice, user_group
       FROM vicidial_tts_prompts ORDER BY tts_id ASC LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT avatar_id, avatar_name, avatar_notes, active, user_group, soundboard_layout, columns_limit
       FROM vicidial_avatars ORDER BY avatar_id ASC LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT state_call_time_id, state_call_time_state, state_call_time_name, state_call_time_comments,
              sct_default_start, sct_default_stop, user_group
       FROM vicidial_state_call_times ORDER BY state_call_time_id ASC LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT holiday_id, holiday_name, holiday_comments, holiday_date, holiday_status,
              ct_default_start, ct_default_stop, holiday_method, user_group
       FROM vicidial_call_time_holidays ORDER BY holiday_date DESC LIMIT 500`,
      [],
      [],
    ),
    rows(
      `SELECT status_group_id, status_group_notes, user_group
       FROM vicidial_status_groups ORDER BY status_group_id ASC LIMIT 500`,
      [],
      [],
    ),
    rows(
      'SELECT * FROM vicidial_screen_labels ORDER BY label_id ASC LIMIT 200',
      [],
      [],
    ),
    rows(
      'SELECT * FROM vicidial_screen_colors ORDER BY colors_id ASC LIMIT 200',
      [],
      [],
    ),
    rows(
      `SELECT container_id, container_notes, container_type, user_group, container_entry
       FROM vicidial_settings_containers ORDER BY container_id ASC LIMIT 500`,
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
      pauseCodes: pauseCodes.length,
      campaignHotkeys: campaignHotkeys.length,
      leadRecycle: leadRecycle.length,
      listMixes: listMixes.length,
      callMenus: callMenus.length,
      callMenuOptions: callMenuOptions.length,
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
    pauseCodes,
    campaignHotkeys,
    leadRecycle,
    listMixes,
    callMenus,
    callMenuOptions,
    shifts,
    recordings: recordings.map((item) => ({
      ...item,
      length_in_sec: Number(item.length_in_sec || 0),
    })),
    servers,
    carriers,
    remoteAgents,
    dropLists,
    phoneAliases,
    groupAliases,
    conferences,
    agentConferences,
    queueGroups,
    contacts,
    languages,
    voicemailFull,
    vmMessageGroups,
    automatedReports,
    mohFull,
    ttsPrompts,
    soundboards,
    stateCallTimes,
    holidays,
    statusGroups,
    screenLabels,
    screenColors,
    settingsContainers,
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
      cidGroups,
      ipLists,
      filterPhoneGroups,
      audioStore,
      voicemailBoxes,
      musicOnHold,
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

  const detailPayload = {
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
    incall_tally_threshold_seconds: cleanInt(body.incall_tally_threshold_seconds, 0, 0, 9999),
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
    closer_campaigns: scopedGroupListText(body.closer_campaigns, currentUser?.permissions?.allowedQueueGroups),
    manual_dial_list_id: cleanDigits(body.manual_dial_list_id, 14) || '998',
    default_xfer_group: codeText(body.default_xfer_group, 20, '---NONE---'),
    xfer_groups: scopedGroupListText(body.xfer_groups, currentUser?.permissions?.allowedQueueGroups),
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
    enable_xfer_presets: cleanChoice(body.enable_xfer_presets, ['DISABLED', 'ENABLED', 'STAGING', 'CONTACTS'], 'DISABLED'),
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
    adaptive_latest_server_time: cleanDigits(body.adaptive_latest_server_time, 4) || '2100',
    adaptive_percentmax_percentage: cleanInt(body.adaptive_percentmax_percentage, 50, 5, 95),
    drop_rate_group: exactChoice(body.drop_rate_group, ['DISABLED', '101', '102', '103', '104', '105', '106', '107', '108', '109', '110'], 'DISABLED', 20),
    call_count_limit: cleanInt(body.call_count_limit, 0, 0, 65000),
    call_count_target: cleanInt(body.call_count_target, 3, 0, 65000),
    call_count_limit_restrict: cleanChoice(body.call_count_limit_restrict, ['DISABLED', 'RESTRICT_ALL'], 'DISABLED'),
    drop_lockout_time: cleanText(body.drop_lockout_time, 6).replace(/[^0-9]/g, '') || '0',
    auto_alt_threshold: cleanInt(body.auto_alt_threshold, 0, 0, 255),
    alt_number_dialing: cleanChoice(body.alt_number_dialing, ['N', 'Y', 'SELECTED', 'SELECTED_TIMER_ALT', 'SELECTED_TIMER_ADDR3', 'UNSELECTED', 'UNSELECTED_TIMER_ALT', 'UNSELECTED_TIMER_ADDR3'], 'N'),
    timer_alt_seconds: cleanInt(body.timer_alt_seconds, 0, 0, 65000),
    inbound_no_agents_no_dial_container: codeText(body.inbound_no_agents_no_dial_container, 40, '---DISABLED---'),
    inbound_no_agents_no_dial_threshold: cleanInt(body.inbound_no_agents_no_dial_threshold, 0, 0, 65000),
    dial_timeout_lead_container: codeText(body.dial_timeout_lead_container, 40, 'DISABLED'),
    cid_group_id: codeText(body.cid_group_id, 20, '---DISABLED---'),
    cid_group_id_two: codeText(body.cid_group_id_two, 20, '---DISABLED---'),
    safe_harbor_menu_id: cleanId(body.safe_harbor_menu_id, 50),
    agent_hangup_ig_override: ynFlag(body.agent_hangup_ig_override, 'N'),
    campaign_vdad_exten: codeText(body.campaign_vdad_exten, 20, '8368'),
    user_group_script: cleanChoice(body.user_group_script, ENABLED_DISABLED_OPTIONS, 'DISABLED'),
    script_tab_frame_size: cleanChoice(body.script_tab_frame_size, ['DEFAULT', 'LEFT_EDGE'], 'DEFAULT'),
    script_tab_height: cleanInt(body.script_tab_height, 0, 0, 65000),
    clear_form: cleanChoice(body.clear_form, ['DISABLED', 'ENABLED', 'ACKNOWLEDGE'], 'ACKNOWLEDGE'),
    am_message_exten: codeText(body.am_message_exten, 100, 'vm-goodbye'),
    vmm_daily_limit: cleanInt(body.vmm_daily_limit, 0, 0, 255),
    waitforsilence_options: codeText(body.waitforsilence_options, 25),
    manual_vm_status_updates: cleanChoice(body.manual_vm_status_updates, ENABLED_DISABLED_OPTIONS, 'ENABLED'),
    am_message_wildcards: ynFlag(body.am_message_wildcards, 'N'),
    amd_send_to_vmx: ynFlag(body.amd_send_to_vmx, 'N'),
    amd_agent_route_options: cleanChoice(body.amd_agent_route_options, ['ENABLED', 'DISABLED', 'PENDING'], 'DISABLED'),
    amd_status_map: codeText(body.amd_status_map, 40, 'DISABLED'),
    cpd_amd_action: cleanChoice(body.cpd_amd_action, ['DISABLED', 'DISPO', 'MESSAGE', 'CALLMENU', 'INGROUP'], 'DISABLED'),
    cpd_unknown_action: cleanChoice(body.cpd_unknown_action, ['DISABLED', 'DISPO', 'MESSAGE', 'CALLMENU', 'INGROUP'], 'DISABLED'),
    amd_inbound_group: codeText(body.amd_inbound_group, 20),
    amd_callmenu: codeText(body.amd_callmenu, 50),
    leave_vm_message_group_id: codeText(body.leave_vm_message_group_id, 40, '---NONE---'),
    leave_vm_no_dispo: cleanChoice(body.leave_vm_no_dispo, ENABLED_DISABLED_OPTIONS, 'DISABLED'),
    xferconf_a_dtmf: cleanText(body.xferconf_a_dtmf, 50),
    xferconf_a_number: cleanText(body.xferconf_a_number, 50),
    xferconf_b_dtmf: cleanText(body.xferconf_b_dtmf, 50),
    xferconf_b_number: cleanText(body.xferconf_b_number, 50),
    xferconf_c_number: cleanText(body.xferconf_c_number, 50),
    xferconf_d_number: cleanText(body.xferconf_d_number, 50),
    xferconf_e_number: cleanText(body.xferconf_e_number, 50),
    hide_xfer_number_to_dial: cleanChoice(body.hide_xfer_number_to_dial, ENABLED_DISABLED_OPTIONS, 'DISABLED'),
    prepopulate_transfer_preset: cleanChoice(body.prepopulate_transfer_preset, TRANSFER_PRESET_OPTIONS, 'N'),
    quick_transfer_button: cleanChoice(body.quick_transfer_button, QUICK_TRANSFER_OPTIONS, 'N'),
    transfer_no_dispo: cleanChoice(body.transfer_no_dispo, TRANSFER_NO_DISPO_OPTIONS, 'DISABLED'),
    custom_3way_button_transfer: cleanChoice(body.custom_3way_button_transfer, CUSTOM_3WAY_OPTIONS, 'DISABLED'),
    three_way_volume_buttons: cleanChoice(body.three_way_volume_buttons, ENABLED_DISABLED_OPTIONS, 'ENABLED'),
    customer_3way_hangup_logging: cleanChoice(body.customer_3way_hangup_logging, ENABLED_DISABLED_OPTIONS, 'ENABLED'),
    customer_3way_hangup_seconds: cleanInt(body.customer_3way_hangup_seconds, 5, 0, 65000),
    customer_3way_hangup_action: cleanChoice(body.customer_3way_hangup_action, ['NONE', 'DISPO'], 'NONE'),
    three_way_record_stop: ynFlag(body.three_way_record_stop, 'N'),
    three_way_record_stop_exception: codeText(body.three_way_record_stop_exception, 40, 'DISABLED'),
    leave_3way_start_recording: cleanChoice(body.leave_3way_start_recording, ['DISABLED', 'ALL_CALLS', 'ALL_BUT_EXCEPTIONS', 'ONLY_EXCEPTIONS'], 'DISABLED'),
    leave_3way_start_recording_exception: codeText(body.leave_3way_start_recording_exception, 40, 'DISABLED'),
    leave_3way_stop_recording: cleanChoice(body.leave_3way_stop_recording, ['DISABLED', 'ALL_CALLS'], 'DISABLED'),
    hangup_xfer_record_start: ynFlag(body.hangup_xfer_record_start, 'N'),
    scheduled_callbacks_timezones_container: codeText(body.scheduled_callbacks_timezones_container, 40, 'DISABLED'),
    callback_useronly_move_minutes: cleanInt(body.callback_useronly_move_minutes, 0, 0, 99999),
    disable_dispo_screen: cleanChoice(body.disable_dispo_screen, ['DISPO_ENABLED', 'DISPO_DISABLED', 'DISPO_SELECT_DISABLED'], 'DISPO_ENABLED'),
    disable_dispo_status: cleanId(body.disable_dispo_status, 6),
    script_top_dispo: ynFlag(body.script_top_dispo, 'N'),
    wrapup_after_hotkey: cleanChoice(body.wrapup_after_hotkey, ENABLED_DISABLED_OPTIONS, 'DISABLED'),
    dead_trigger_action: cleanChoice(body.dead_trigger_action, ['DISABLED', 'AUDIO', 'URL', 'AUDIO_AND_URL'], 'DISABLED'),
    dead_trigger_seconds: cleanInt(body.dead_trigger_seconds, 0, 0, 65000),
    dead_trigger_repeat: cleanChoice(body.dead_trigger_repeat, ['NO', 'REPEAT_ALL', 'REPEAT_AUDIO', 'REPEAT_URL'], 'NO'),
    dead_trigger_filename: cleanText(body.dead_trigger_filename, 2000),
    dead_trigger_url: cleanText(body.dead_trigger_url, 2000),
    dead_max: cleanInt(body.dead_max, 0, 0, 65000),
    dead_max_dispo: cleanId(body.dead_max_dispo, 6) || 'DCMX',
    dead_to_dispo: cleanChoice(body.dead_to_dispo, ENABLED_DISABLED_OPTIONS, 'DISABLED'),
    dispo_max: cleanInt(body.dispo_max, 0, 0, 65000),
    dispo_max_dispo: cleanId(body.dispo_max_dispo, 6) || 'DISMX',
    pause_max: cleanInt(body.pause_max, 0, 0, 65000),
    pause_max_dispo: cleanId(body.pause_max_dispo, 6) || 'PAUSMX',
    pause_max_exceptions: codeText(body.pause_max_exceptions, 40),
    pause_max_url: cleanText(body.pause_max_url, 2000),
    in_man_dial_next_ready_seconds: cleanInt(body.in_man_dial_next_ready_seconds, 0, 0, 65000),
    in_man_dial_next_ready_seconds_override: codeText(body.in_man_dial_next_ready_seconds_override, 40, 'DISABLED'),
    customer_gone_seconds: cleanInt(body.customer_gone_seconds, 30, 0, 65000),
    agent_lead_search_method: cleanChoice(body.agent_lead_search_method, AGENT_LEAD_SEARCH_METHOD_OPTIONS, 'CAMPLISTS_ALL'),
    agent_search_ingroup_list: cleanChoice(body.agent_search_ingroup_list, ['DISABLED', 'ENABLED', 'ENABLED_OVERRIDE'], 'DISABLED'),
    agent_dial_owner_only: cleanChoice(body.agent_dial_owner_only, AGENT_OWNER_ONLY_OPTIONS, 'NONE'),
    agent_display_dialable_leads: ynFlag(body.agent_display_dialable_leads, 'N'),
    screen_labels: codeText(body.screen_labels, 20, '--SYSTEM-SETTINGS--'),
    allow_required_fields: ynFlag(body.allow_required_fields, 'N'),
    status_display_fields: cleanChoice(body.status_display_fields, STATUS_DISPLAY_FIELD_OPTIONS, 'CALLID'),
    state_descriptions: codeText(body.state_descriptions, 40, '---DISABLED---'),
    agent_screen_time_display: cleanChoice(body.agent_screen_time_display, AGENT_SCREEN_TIME_OPTIONS, 'DISABLED', 40),
    calls_inqueue_count_one: codeText(body.calls_inqueue_count_one, 40, 'DISABLED'),
    calls_inqueue_count_two: codeText(body.calls_inqueue_count_two, 40, 'DISABLED'),
    view_calls_in_queue: cleanChoice(body.view_calls_in_queue, ['NONE', 'ALL', '1', '2', '3', '4', '5'], 'NONE'),
    view_calls_in_queue_launch: cleanChoice(body.view_calls_in_queue_launch, ['AUTO', 'MANUAL'], 'MANUAL'),
    calls_waiting_vl_one: cleanChoice(body.calls_waiting_vl_one, QUEUE_FIELD_OPTIONS, 'DISABLED'),
    calls_waiting_vl_two: cleanChoice(body.calls_waiting_vl_two, QUEUE_FIELD_OPTIONS, 'DISABLED'),
    grab_calls_in_queue: ynFlag(body.grab_calls_in_queue, 'N'),
    call_requeue_button: ynFlag(body.call_requeue_button, 'N'),
    auto_pause_precall: ynFlag(body.auto_pause_precall, 'N'),
    auto_resume_precall: ynFlag(body.auto_resume_precall, 'N'),
    auto_pause_precall_code: cleanId(body.auto_pause_precall_code, 6) || 'PRECAL',
    campaign_stats_refresh: ynFlag(body.campaign_stats_refresh, 'N'),
    realtime_agent_time_stats: cleanChoice(body.realtime_agent_time_stats, ['DISABLED', 'WAIT_CUST_ACW', 'WAIT_CUST_ACW_PAUSE', 'CALLS_WAIT_CUST_ACW_PAUSE'], 'CALLS_WAIT_CUST_ACW_PAUSE'),
    disable_alter_custdata: ynFlag(body.disable_alter_custdata, 'N'),
    disable_alter_custphone: cleanChoice(body.disable_alter_custphone, ['Y', 'N', 'HIDE'], 'Y'),
    no_hopper_dialing: ynFlag(body.no_hopper_dialing, 'N'),
    manual_dial_override: cleanChoice(body.manual_dial_override, ['NONE', 'ALLOW_ALL', 'DISABLE_ALL'], 'NONE'),
    manual_dial_override_field: cleanChoice(body.manual_dial_override_field, ENABLED_DISABLED_OPTIONS, 'ENABLED'),
    manual_dial_search_checkbox: cleanChoice(body.manual_dial_search_checkbox, ['SELECTED', 'SELECTED_RESET', 'UNSELECTED', 'UNSELECTED_RESET', 'SELECTED_LOCK', 'UNSELECTED_LOCK'], 'SELECTED'),
    manual_dial_lead_id: cleanChoice(body.manual_dial_lead_id, ['Y', 'N', 'ONLY'], 'N'),
    api_manual_dial: cleanChoice(body.api_manual_dial, ['STANDARD', 'QUEUE', 'QUEUE_AND_AUTOCALL'], 'STANDARD'),
    manual_dial_cid: cleanChoice(body.manual_dial_cid, ['CAMPAIGN', 'AGENT_PHONE', 'AGENT_PHONE_OVERRIDE'], 'CAMPAIGN'),
    manual_minimum_attempt_seconds: cleanInt(body.manual_minimum_attempt_seconds, 0, 0, 65000),
    manual_minimum_answer_seconds: cleanInt(body.manual_minimum_answer_seconds, 0, 0, 65000),
    post_phone_time_diff_alert: cleanChoice(body.post_phone_time_diff_alert, ['ENABLED', 'OUTSIDE_CALLTIME_ONLY', 'OUTSIDE_CALLTIME_PHONE', 'OUTSIDE_CALLTIME_POSTAL', 'OUTSIDE_CALLTIME_BOTH', 'DISABLED'], 'DISABLED'),
    in_group_dial: cleanChoice(body.in_group_dial, ['DISABLED', 'MANUAL_DIAL', 'NO_DIAL', 'BOTH'], 'DISABLED'),
    in_group_dial_select: cleanChoice(body.in_group_dial_select, ['AGENT_SELECTED', 'CAMPAIGN_SELECTED', 'ALL_USER_GROUP'], 'CAMPAIGN_SELECTED'),
    force_per_call_notes: cleanChoice(body.force_per_call_notes, ['DISABLED', 'ENABLED', '5_CHARACTERS', '15_CHARACTERS', '30_CHARACTERS', '100_CHARACTERS'], 'DISABLED'),
    comments_all_tabs: cleanChoice(body.comments_all_tabs, ENABLED_DISABLED_OPTIONS, 'DISABLED'),
    comments_dispo_screen: cleanChoice(body.comments_dispo_screen, ['DISABLED', 'ENABLED', 'REPLACE_CALL_NOTES'], 'DISABLED'),
    comments_callback_screen: cleanChoice(body.comments_callback_screen, ['DISABLED', 'ENABLED', 'REPLACE_CB_NOTES'], 'DISABLED'),
    qc_comment_history: cleanChoice(body.qc_comment_history, ['CLICK', 'AUTO_OPEN', 'CLICK_ALLOW_MINIMIZE', 'AUTO_OPEN_ALLOW_MINIMIZE'], 'CLICK'),
    max_inbound_calls_outcome: cleanChoice(body.max_inbound_calls_outcome, ['DEFAULT', 'ALLOW_AGENTDIRECT', 'ALLOW_MI_PAUSE', 'ALLOW_AGENTDIRECT_AND_MI_PAUSE'], 'DEFAULT'),
    agent_allow_group_alias: ynFlag(body.agent_allow_group_alias, 'N'),
    crm_popup_login: ynFlag(body.crm_popup_login, 'N'),
    crm_login_address: cleanText(body.crm_login_address, 2000),
    extension_appended_cidname: cleanChoice(body.extension_appended_cidname, ['Y', 'N', 'Y_USER', 'Y_WITH_CAMPAIGN', 'Y_USER_WITH_CAMPAIGN'], 'N'),
    blind_monitor_warning: cleanChoice(body.blind_monitor_warning, ['DISABLED', 'ALERT', 'NOTICE', 'AUDIO', 'ALERT_NOTICE', 'ALERT_AUDIO', 'NOTICE_AUDIO', 'ALL'], 'DISABLED'),
    blind_monitor_message: cleanText(body.blind_monitor_message, 255),
    blind_monitor_filename: codeText(body.blind_monitor_filename, 100),
    agent_xfer_validation: ynFlag(body.agent_xfer_validation, 'N'),
    ig_xfer_list_sort: cleanChoice(body.ig_xfer_list_sort, ['GROUP_ID_UP', 'GROUP_ID_DOWN', 'GROUP_NAME_UP', 'GROUP_NAME_DOWN', 'PRIORITY_UP', 'PRIORITY_DOWN'], 'GROUP_ID_UP'),
    use_other_campaign_dnc: cleanId(body.use_other_campaign_dnc, 8),
    agent_display_fields: codeText(body.agent_display_fields, 100),
    custom_one: cleanText(body.custom_one, 12000),
    custom_two: cleanText(body.custom_two, 12000),
    custom_three: cleanText(body.custom_three, 12000),
    custom_four: cleanText(body.custom_four, 12000),
    custom_five: cleanText(body.custom_five, 12000),
  };
  if (/ADAPT/.test(detailPayload.dial_method) && cleanInt(body.dial_level_override, 0, 0, 1) < 1) {
    if (Number(detailPayload.auto_dial_level || 0) < 1) detailPayload.auto_dial_level = '1.0';
    else delete detailPayload.auto_dial_level;
  }
  return detailPayload;
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

async function applyCampaignRuntimeActions(req, campaignId) {
  const hopperTrigger = cleanChoice(req.body?.hopper_drop_run_trigger, ['N', 'Y', 'A'], 'N');
  if (hopperTrigger !== 'N') {
    await execute(
      `UPDATE vicidial_campaigns
       SET hopper_drop_run_trigger = ?,
           campaign_changedate = NOW()
       WHERE campaign_id = ?`,
      [hopperTrigger, campaignId],
    );
    await adminLog(
      req,
      'CAMPAIGNS',
      'MODIFY',
      campaignId,
      hopperTrigger === 'A' ? 'GENX HOPPER ALL-DROPS-RUN TRIGGER' : 'GENX HOPPER DROP-RUN TRIGGER',
      'UPDATE vicidial_campaigns SET hopper_drop_run_trigger',
      hopperTrigger === 'A' ? 'Hopper all-drops-run triggered' : 'Hopper drop-run triggered',
    );
  }

  if (ynFlag(req.body?.reset_hopper, 'N') === 'Y') {
    await execute(
      `DELETE FROM vicidial_hopper
       WHERE campaign_id = ?
         AND status IN ('READY', 'QUEUE', 'DONE', 'RHOLD', 'RQUEUE')`,
      [campaignId],
    );
    await adminLog(
      req,
      'CAMPAIGNS',
      'RESET',
      campaignId,
      'GENX RESET CAMPAIGN LEAD HOPPER',
      'DELETE FROM vicidial_hopper WHERE campaign_id',
      'Wait 1 minute before dialing next number',
    );
  }
}

async function saveCampaign(req, res, mode) {
  if (!requireModify(req, res, 'modifyCampaigns')) return;
  const id = cleanId(mode === 'create' ? req.body?.campaign_id : req.params.id, 8);
  if (!id) return badRequest(res, 'invalid_campaign_id');
  if (mode !== 'create' && !scopeAllows(req.genxUser?.permissions?.allowedCampaigns, id)) {
    return res.status(403).json({ ok: false, error: 'campaign_not_allowed' });
  }
  const payload = campaignPayload(req.body || {}, req.genxUser);
  if (mode !== 'create' && req.body?._detailMode && !req.genxUser?.permissions?.allowedQueueGroups?.all) {
    const [existingCampaign] = await rows(
      'SELECT closer_campaigns, xfer_groups FROM vicidial_campaigns WHERE campaign_id = ?',
      [id],
      [],
    );
    if (existingCampaign) {
      const queueScope = req.genxUser?.permissions?.allowedQueueGroups;
      payload.closer_campaigns = mergeScopedGroupList(req.body?.closer_campaigns, existingCampaign.closer_campaigns, queueScope);
      payload.xfer_groups = mergeScopedGroupList(req.body?.xfer_groups, existingCampaign.xfer_groups, queueScope);
    }
  }
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
      await applyCampaignRuntimeActions(req, id);
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
      await applyCampaignRuntimeActions(req, id);
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
    modify_email_accounts: boolFlag(body.modify_email_accounts),
    vdc_agent_api_access: boolFlag(body.vdc_agent_api_access),
    phone_pass: cleanText(body.phone_pass, 100),
    delete_users: boolFlag(body.delete_users),
    delete_user_groups: boolFlag(body.delete_user_groups),
    delete_lists: boolFlag(body.delete_lists),
    delete_campaigns: boolFlag(body.delete_campaigns),
    delete_ingroups: boolFlag(body.delete_ingroups),
    delete_remote_agents: boolFlag(body.delete_remote_agents),
    delete_scripts: boolFlag(body.delete_scripts),
    delete_filters: boolFlag(body.delete_filters),
    delete_call_times: boolFlag(body.delete_call_times),
    delete_inbound_dids: boolFlag(body.delete_inbound_dids),
    delete_from_dnc: boolFlag(body.delete_from_dnc),
    load_leads: boolFlag(body.load_leads),
    modify_leads: cleanInt(body.modify_leads, 0, 0, 6),
    modify_remoteagents: boolFlag(body.modify_remoteagents),
    modify_shifts: boolFlag(body.modify_shifts),
    modify_labels: boolFlag(body.modify_labels),
    modify_voicemail: boolFlag(body.modify_voicemail),
    modify_audiostore: boolFlag(body.modify_audiostore),
    modify_moh: boolFlag(body.modify_moh),
    modify_tts: boolFlag(body.modify_tts),
    modify_contacts: boolFlag(body.modify_contacts),
    modify_same_user_level: boolFlag(body.modify_same_user_level, '1', '0'),
    modify_custom_dialplans: boolFlag(body.modify_custom_dialplans),
    modify_languages: boolFlag(body.modify_languages),
    modify_colors: boolFlag(body.modify_colors),
    modify_auto_reports: boolFlag(body.modify_auto_reports),
    modify_ip_lists: boolFlag(body.modify_ip_lists),
    modify_dial_prefix: cleanInt(body.modify_dial_prefix, 0, 0, 6),
    ast_admin_access: boolFlag(body.ast_admin_access),
    ast_delete_phones: boolFlag(body.ast_delete_phones),
    hotkeys_active: boolFlag(body.hotkeys_active),
    change_agent_campaign: boolFlag(body.change_agent_campaign),
    agent_choose_ingroups: boolFlag(body.agent_choose_ingroups),
    closer_campaigns: scopedGroupListText(body.closer_campaigns, currentUser?.permissions?.allowedQueueGroups),
    scheduled_callbacks: boolFlag(body.scheduled_callbacks),
    agentonly_callbacks: boolFlag(body.agentonly_callbacks),
    agentcall_manual: cleanInt(body.agentcall_manual, 0, 0, 5),
    vicidial_recording: boolFlag(body.vicidial_recording),
    vicidial_transfers: boolFlag(body.vicidial_transfers),
    alter_agent_interface_options: boolFlag(body.alter_agent_interface_options),
    closer_default_blended: boolFlag(body.closer_default_blended),
    vicidial_recording_override: cleanExactChoice(body.vicidial_recording_override, ['DISABLED', 'NEVER', 'ONDEMAND', 'ALLCALLS', 'ALLFORCE'], 'DISABLED'),
    alter_custdata_override: cleanExactChoice(body.alter_custdata_override, ['NOT_ACTIVE', 'ALLOW_ALTER'], 'NOT_ACTIVE'),
    alter_custphone_override: cleanExactChoice(body.alter_custphone_override, ['NOT_ACTIVE', 'ALLOW_ALTER'], 'NOT_ACTIVE'),
    alert_enabled: boolFlag(body.alert_enabled),
    allow_alerts: boolFlag(body.allow_alerts),
    agent_choose_territories: boolFlag(body.agent_choose_territories),
    download_lists: boolFlag(body.download_lists),
    agent_shift_enforcement_override: cleanExactChoice(body.agent_shift_enforcement_override, ['DISABLED', 'OFF', 'START', 'ALL'], 'DISABLED'),
    manager_shift_enforcement_override: boolFlag(body.manager_shift_enforcement_override),
    shift_override_flag: boolFlag(body.shift_override_flag),
    user_code: cleanText(body.user_code, 100),
    territory: cleanText(body.territory, 100),
    voicemail_id: cleanId(body.voicemail_id, 10),
    agent_call_log_view_override: cleanExactChoice(body.agent_call_log_view_override, ['DISABLED', 'Y', 'N'], 'DISABLED'),
    callcard_admin: boolFlag(body.callcard_admin),
    agent_choose_blended: boolFlag(body.agent_choose_blended),
    realtime_block_user_info: boolFlag(body.realtime_block_user_info),
    custom_fields_modify: boolFlag(body.custom_fields_modify),
    force_change_password: ynFlag(body.force_change_password, 'N'),
    agent_lead_search_override: cleanExactChoice(body.agent_lead_search_override, ['NOT_ACTIVE', 'ENABLED', 'LIVE_CALL_INBOUND', 'LIVE_CALL_INBOUND_AND_MANUAL', 'DISABLED'], 'NOT_ACTIVE'),
    preset_contact_search: cleanExactChoice(body.preset_contact_search, ['NOT_ACTIVE', 'ENABLED', 'DISABLED'], 'NOT_ACTIVE'),
    admin_hide_lead_data: boolFlag(body.admin_hide_lead_data),
    admin_hide_phone_data: cleanExactChoice(body.admin_hide_phone_data, ['0', '1', '2_DIGITS', '3_DIGITS', '4_DIGITS'], '0'),
    agentcall_email: boolFlag(body.agentcall_email),
    agentcall_chat: boolFlag(body.agentcall_chat),
    max_inbound_calls: cleanInt(body.max_inbound_calls, 0, 0, 65000),
    wrapup_seconds_override: cleanInt(body.wrapup_seconds_override, -1, -1, 65000),
    selected_language: cleanText(body.selected_language, 100) || 'default English',
    user_choose_language: boolFlag(body.user_choose_language),
    ignore_group_on_search: boolFlag(body.ignore_group_on_search),
    api_list_restrict: boolFlag(body.api_list_restrict),
    api_allowed_functions: cleanText(body.api_allowed_functions, 1000) || ' ALL_FUNCTIONS ',
    lead_filter_id: cleanId(body.lead_filter_id, 20) || 'NONE',
    admin_cf_show_hidden: boolFlag(body.admin_cf_show_hidden),
    user_hide_realtime: boolFlag(body.user_hide_realtime),
    user_nickname: cleanText(body.user_nickname, 50),
    user_new_lead_limit: cleanInt(body.user_new_lead_limit, -1, -1, 65000),
    api_only_user: boolFlag(body.api_only_user),
    ignore_ip_list: boolFlag(body.ignore_ip_list),
    ready_max_logout: cleanInt(body.ready_max_logout, -1, -1, 9999999),
    export_gdpr_leads: cleanExactChoice(body.export_gdpr_leads, ['0', '1', '2'], '0'),
    pause_code_approval: boolFlag(body.pause_code_approval),
    max_hopper_calls: cleanInt(body.max_hopper_calls, 0, 0, 65000),
    max_hopper_calls_hour: cleanInt(body.max_hopper_calls_hour, 0, 0, 65000),
    mute_recordings: cleanExactChoice(body.mute_recordings, ['DISABLED', 'Y', 'N'], 'DISABLED'),
    hide_call_log_info: cleanExactChoice(body.hide_call_log_info, HIDE_CALL_LOG_OPTIONS, 'DISABLED'),
    next_dial_my_callbacks: cleanExactChoice(body.next_dial_my_callbacks, ['NOT_ACTIVE', 'DISABLED', 'ENABLED'], 'NOT_ACTIVE'),
    user_admin_redirect_url: cleanText(body.user_admin_redirect_url, 12000),
    max_inbound_filter_enabled: boolFlag(body.max_inbound_filter_enabled),
    max_inbound_filter_statuses: cleanText(body.max_inbound_filter_statuses, 12000),
    max_inbound_filter_ingroups: scopedGroupListText(body.max_inbound_filter_ingroups, currentUser?.permissions?.allowedQueueGroups),
    max_inbound_filter_min_sec: cleanInt(body.max_inbound_filter_min_sec, -1, -1, 65000),
    status_group_id: cleanId(body.status_group_id, 20),
    mobile_number: cleanText(body.mobile_number, 20),
    two_factor_override: cleanExactChoice(body.two_factor_override, ['NOT_ACTIVE', 'ENABLED', 'DISABLED'], 'NOT_ACTIVE'),
    manual_dial_filter: codeText(body.manual_dial_filter, 50, 'DISABLED'),
    user_location: cleanText(body.user_location, 100),
    download_invalid_files: boolFlag(body.download_invalid_files),
    user_group_two: cleanId(body.user_group_two, 20),
    inbound_credits: cleanInt(body.inbound_credits, -1, -1, 9999999),
    hci_enabled: cleanInt(body.hci_enabled, 0, 0, 6),
    manual_dial_lead_id: cleanExactChoice(body.manual_dial_lead_id, ['Y', 'N', 'ONLY', 'DISABLED'], 'DISABLED'),
    qc_enabled: boolFlag(body.qc_enabled),
    qc_user_level: cleanInt(body.qc_user_level, 1, 1, 9),
    qc_pass: boolFlag(body.qc_pass),
    qc_finish: boolFlag(body.qc_finish),
    qc_commit: boolFlag(body.qc_commit),
    add_timeclock_log: boolFlag(body.add_timeclock_log),
    modify_timeclock_log: boolFlag(body.modify_timeclock_log),
    delete_timeclock_log: boolFlag(body.delete_timeclock_log),
    custom_one: cleanText(body.custom_one, 100),
    custom_two: cleanText(body.custom_two, 100),
    custom_three: cleanText(body.custom_three, 100),
    custom_four: cleanText(body.custom_four, 100),
    custom_five: cleanText(body.custom_five, 100),
  };
}

async function saveUser(req, res, mode) {
  if (!requireModify(req, res, 'modifyUsers')) return;
  const id = cleanId(mode === 'create' ? req.body?.user : req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_user');
  const payload = userPayload(req.body || {}, req.genxUser);
  if (mode === 'create' && !payload.pass) return badRequest(res, 'password_required');
  if (mode !== 'create' && !payload.pass) delete payload.pass;
  if (payload.pass) payload.pass_hash = '';
  if (mode !== 'create' && !req.genxUser?.permissions?.allowedQueueGroups?.all) {
    const [existingUser] = await rows(
      'SELECT closer_campaigns, max_inbound_filter_ingroups FROM vicidial_users WHERE user = ?',
      [id],
      [],
    );
    if (existingUser) {
      const queueScope = req.genxUser?.permissions?.allowedQueueGroups;
      payload.closer_campaigns = mergeScopedGroupList(req.body?.closer_campaigns, existingUser.closer_campaigns, queueScope);
      payload.max_inbound_filter_ingroups = mergeScopedGroupList(req.body?.max_inbound_filter_ingroups, existingUser.max_inbound_filter_ingroups, queueScope);
    }
  }
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_users
         SET user = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'USERS', 'ADD', id, 'GENX ADD USER', 'INSERT INTO vicidial_users', payload.full_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_users
         SET ${assignments}
         WHERE user = ?`,
        [...values, id],
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
    reset_time: cleanText(body.reset_time, 100),
    agent_script_override: cleanId(body.agent_script_override, 20),
    inbound_list_script_override: cleanId(body.inbound_list_script_override, 20),
    campaign_cid_override: cleanDigits(body.campaign_cid_override, 20),
    am_message_exten_override: codeText(body.am_message_exten_override, 100),
    drop_inbound_group_override: codeText(body.drop_inbound_group_override, 20, '---NONE---'),
    default_xfer_group: codeText(body.default_xfer_group, 20, '---NONE---'),
    xferconf_a_number: cleanText(body.xferconf_a_number, 50),
    xferconf_b_number: cleanText(body.xferconf_b_number, 50),
    xferconf_c_number: cleanText(body.xferconf_c_number, 50),
    xferconf_d_number: cleanText(body.xferconf_d_number, 50),
    xferconf_e_number: cleanText(body.xferconf_e_number, 50),
    web_form_address: cleanText(body.web_form_address, 12000),
    web_form_address_two: cleanText(body.web_form_address_two, 12000),
    web_form_address_three: cleanText(body.web_form_address_three, 12000),
    time_zone_setting: cleanExactChoice(body.time_zone_setting, ['COUNTRY_AND_AREA_CODE', 'POSTAL_CODE', 'NANPA_PREFIX', 'OWNER_TIME_ZONE_CODE'], 'COUNTRY_AND_AREA_CODE'),
    inventory_report: ynFlag(body.inventory_report, 'Y'),
    na_call_url: cleanText(body.na_call_url, 12000),
    status_group_id: cleanId(body.status_group_id, 20),
    user_new_lead_limit: cleanInt(body.user_new_lead_limit, -1, -1, 65000),
    daily_reset_limit: cleanInt(body.daily_reset_limit, -1, -1, 65000),
    auto_active_list_rank: cleanInt(body.auto_active_list_rank, 0, -65000, 65000),
    inbound_drop_voicemail: cleanId(body.inbound_drop_voicemail, 20),
    inbound_after_hours_voicemail: cleanId(body.inbound_after_hours_voicemail, 20),
    qc_scorecard_id: cleanId(body.qc_scorecard_id, 20),
    qc_statuses_id: cleanId(body.qc_statuses_id, 20),
    qc_web_form_address: cleanText(body.qc_web_form_address, 255),
    auto_alt_threshold: cleanInt(body.auto_alt_threshold, -1, -1, 255),
    cid_group_id: codeText(body.cid_group_id, 20, '---DISABLED---'),
    dial_prefix: codeText(body.dial_prefix, 20),
    weekday_resets_container: codeText(body.weekday_resets_container, 40, 'DISABLED'),
  };
}

async function saveList(req, res, mode) {
  if (!requireModify(req, res, 'modifyLists')) return;
  const id = cleanDigits(mode === 'create' ? req.body?.list_id : req.params.id, 14);
  if (!id) return badRequest(res, 'invalid_list_id');
  const payload = listPayload(req.body || {});
  if (!payload.campaign_id) return badRequest(res, 'campaign_required');
  if (!scopeAllows(req.genxUser?.permissions?.allowedCampaigns, payload.campaign_id)) {
    return res.status(403).json({ ok: false, error: 'campaign_not_allowed' });
  }
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_lists
         SET list_id = ?,
             ${assignments},
             list_changedate = NOW()`,
        [id, ...values],
      );
      await adminLog(req, 'LISTS', 'ADD', id, 'GENX ADD LIST', 'INSERT INTO vicidial_lists', payload.list_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_lists
         SET ${assignments},
             list_changedate = NOW()
         WHERE list_id = ?`,
        [...values, id],
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

const LEAD_IMPORT_FIELDS = [
  'vendor_lead_code',
  'source_id',
  'phone_number',
  'phone_code',
  'title',
  'first_name',
  'middle_initial',
  'last_name',
  'address1',
  'address2',
  'address3',
  'city',
  'state',
  'province',
  'postal_code',
  'country_code',
  'gender',
  'date_of_birth',
  'alt_phone',
  'email',
  'security_phrase',
  'comments',
  'rank',
  'owner',
  'status',
];

const LEAD_IMPORT_ALIASES = new Map([
  ['phone', 'phone_number'],
  ['phone number', 'phone_number'],
  ['phonenumber', 'phone_number'],
  ['number', 'phone_number'],
  ['mobile', 'phone_number'],
  ['cell', 'phone_number'],
  ['phone code', 'phone_code'],
  ['phonecode', 'phone_code'],
  ['vendor id', 'vendor_lead_code'],
  ['vendor lead code', 'vendor_lead_code'],
  ['vendorleadcode', 'vendor_lead_code'],
  ['source', 'source_id'],
  ['source id', 'source_id'],
  ['sourceid', 'source_id'],
  ['first', 'first_name'],
  ['firstname', 'first_name'],
  ['first name', 'first_name'],
  ['mi', 'middle_initial'],
  ['middle', 'middle_initial'],
  ['middle initial', 'middle_initial'],
  ['last', 'last_name'],
  ['lastname', 'last_name'],
  ['last name', 'last_name'],
  ['address', 'address1'],
  ['address 1', 'address1'],
  ['address1', 'address1'],
  ['address 2', 'address2'],
  ['address2', 'address2'],
  ['address 3', 'address3'],
  ['address3', 'address3'],
  ['zip', 'postal_code'],
  ['zipcode', 'postal_code'],
  ['zip code', 'postal_code'],
  ['postal', 'postal_code'],
  ['postal code', 'postal_code'],
  ['country', 'country_code'],
  ['country code', 'country_code'],
  ['dob', 'date_of_birth'],
  ['date of birth', 'date_of_birth'],
  ['alt phone', 'alt_phone'],
  ['altphone', 'alt_phone'],
  ['security phrase', 'security_phrase'],
]);

function parseCsvRows(text) {
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;

  for (let index = 0; index < String(text || '').length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((items) => items.some((item) => String(item || '').trim()));
}

function normalizeLeadHeader(header) {
  const raw = String(header || '').trim();
  const compact = raw.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
  const direct = compact.replace(/\s+/g, '_');
  if (LEAD_IMPORT_FIELDS.includes(direct)) return direct;
  return LEAD_IMPORT_ALIASES.get(compact) || LEAD_IMPORT_ALIASES.get(compact.replace(/\s+/g, '')) || '';
}

function leadImportValue(field, value, defaults) {
  if (field === 'phone_number' || field === 'alt_phone') return cleanDigits(value, 18);
  if (field === 'phone_code') return cleanDigits(value, 10) || defaults.phone_code;
  if (field === 'status') return cleanId(value, 6) || defaults.status;
  if (field === 'rank') return cleanInt(value, 0, -999999, 999999);
  if (field === 'owner') return cleanId(value, 20);
  if (field === 'gender') return cleanText(value, 1).toUpperCase();
  if (field === 'date_of_birth') return cleanText(value, 10) || '0000-00-00';
  if (field === 'email') return cleanText(value, 70);
  return cleanText(value, field === 'comments' ? 255 : 80);
}

async function duplicateLeadExists(phoneNumber, listId, campaignId, mode) {
  if (!phoneNumber || mode === 'NONE') return false;
  if (mode === 'LIST') {
    const [match] = await rows(
      'SELECT lead_id FROM vicidial_list WHERE phone_number = ? AND list_id = ? LIMIT 1',
      [phoneNumber, listId],
      [],
    );
    return Boolean(match);
  }
  if (mode === 'CAMPAIGN') {
    const [match] = await rows(
      `SELECT leads.lead_id
       FROM vicidial_list leads
       JOIN vicidial_lists lists ON lists.list_id = leads.list_id
       WHERE leads.phone_number = ?
         AND lists.campaign_id = ?
       LIMIT 1`,
      [phoneNumber, campaignId],
      [],
    );
    return Boolean(match);
  }
  const [match] = await rows(
    'SELECT lead_id FROM vicidial_list WHERE phone_number = ? LIMIT 1',
    [phoneNumber],
    [],
  );
  return Boolean(match);
}

async function loadLeads(req, res) {
  if (!requireModify(req, res, 'loadLeads')) return;
  const listId = cleanDigits(req.body?.list_id, 14);
  const csvText = String(req.body?.csv || '').trim();
  const duplicateMode = cleanChoice(req.body?.duplicate_mode, ['NONE', 'LIST', 'CAMPAIGN', 'SYSTEM'], 'LIST');
  const defaults = {
    phone_code: cleanDigits(req.body?.phone_code, 10) || '1',
    status: cleanId(req.body?.status, 6) || 'NEW',
  };

  if (!listId) return badRequest(res, 'list_required');
  if (!csvText) return badRequest(res, 'csv_required');

  const [list] = await rows(
    'SELECT list_id, campaign_id, list_name FROM vicidial_lists WHERE list_id = ? LIMIT 1',
    [listId],
    [],
  );
  if (!list) return res.status(404).json({ ok: false, error: 'list_not_found' });
  if (!scopeAllows(req.genxUser?.permissions?.allowedCampaigns, list.campaign_id)) {
    return res.status(403).json({ ok: false, error: 'campaign_not_allowed' });
  }

  const parsed = parseCsvRows(csvText);
  if (parsed.length < 2) return badRequest(res, 'csv_header_and_rows_required');

  const headers = parsed[0].map(normalizeLeadHeader);
  if (!headers.includes('phone_number')) return badRequest(res, 'phone_number_header_required');

  const rowsToImport = parsed.slice(1, 10001);
  const skipped = [];
  let inserted = 0;

  try {
    for (let index = 0; index < rowsToImport.length; index += 1) {
      const sourceRow = rowsToImport[index];
      const lead = Object.fromEntries(LEAD_IMPORT_FIELDS.map((field) => [field, '']));
      lead.phone_code = defaults.phone_code;
      lead.status = defaults.status;
      lead.date_of_birth = '0000-00-00';

      headers.forEach((field, fieldIndex) => {
        if (!field) return;
        lead[field] = leadImportValue(field, sourceRow[fieldIndex], defaults);
      });

      if (!lead.phone_number) {
        skipped.push({ row: index + 2, reason: 'missing_phone_number' });
        continue;
      }

      if (await duplicateLeadExists(lead.phone_number, listId, list.campaign_id, duplicateMode)) {
        skipped.push({ row: index + 2, reason: 'duplicate_phone_number', phone_number: lead.phone_number });
        continue;
      }

      await execute(
        `INSERT INTO vicidial_list
         SET entry_date = NOW(),
             modify_date = NOW(),
             status = ?,
             user = '',
             vendor_lead_code = ?,
             source_id = ?,
             list_id = ?,
             gmt_offset_now = 0,
             called_since_last_reset = 'N',
             phone_code = ?,
             phone_number = ?,
             title = ?,
             first_name = ?,
             middle_initial = ?,
             last_name = ?,
             address1 = ?,
             address2 = ?,
             address3 = ?,
             city = ?,
             state = ?,
             province = ?,
             postal_code = ?,
             country_code = ?,
             gender = ?,
             date_of_birth = ?,
             alt_phone = ?,
             email = ?,
             security_phrase = ?,
             comments = ?,
             rank = ?,
             owner = ?`,
        [
          lead.status,
          lead.vendor_lead_code,
          lead.source_id,
          listId,
          lead.phone_code,
          lead.phone_number,
          lead.title,
          lead.first_name,
          lead.middle_initial,
          lead.last_name,
          lead.address1,
          lead.address2,
          lead.address3,
          lead.city,
          lead.state,
          lead.province,
          lead.postal_code,
          lead.country_code,
          lead.gender,
          lead.date_of_birth,
          lead.alt_phone,
          lead.email,
          lead.security_phrase,
          lead.comments,
          lead.rank,
          lead.owner,
        ],
      );
      inserted += 1;
    }

    await execute('UPDATE vicidial_lists SET list_changedate = NOW() WHERE list_id = ?', [listId]);
    await adminLog(req, 'LEADS', 'LOAD', listId, 'GENX LOAD LEADS', 'INSERT INTO vicidial_list', `${inserted} loaded, ${skipped.length} skipped`);

    return res.json({
      ok: true,
      summary: {
        list_id: listId,
        campaign_id: list.campaign_id,
        inserted,
        skipped: skipped.length,
        skipped_rows: skipped.slice(0, 100),
      },
      data: await adminData(req.genxUser),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'lead_load_failed' });
  }
}

const DNC_SYSTEM_SCOPE = 'SYSTEM_INTERNAL';
const DNC_LOG_SYSTEM_CAMPAIGN = '-SYSINT-';

function parseDncPhoneNumbers(raw) {
  const cleaned = String(raw || '').replace(/[^X\n0-9]/gi, '');
  return [...new Set(cleaned.split('\n').map((line) => line.trim()).filter(Boolean))].slice(0, 5000);
}

async function bulkDnc(req, res) {
  const scope = cleanText(req.body?.scope, 8) || DNC_SYSTEM_SCOPE;
  const isSystem = scope === DNC_SYSTEM_SCOPE;
  if (!requireModify(req, res, 'deleteFromDnc')) return;
  const action = req.body?.action === 'delete' ? 'delete' : 'add';
  const numbers = parseDncPhoneNumbers(req.body?.phone_numbers);
  if (!numbers.length) return badRequest(res, 'phone_numbers_required');

  if (!isSystem) {
    const [campaign] = await rows(
      "SELECT campaign_id FROM vicidial_campaigns WHERE campaign_id = ? AND use_campaign_dnc IN ('Y', 'AREACODE') LIMIT 1",
      [scope],
      [],
    );
    if (!campaign) return badRequest(res, 'invalid_dnc_campaign');
    if (!scopeAllows(req.genxUser?.permissions?.allowedCampaigns, scope)) {
      return res.status(403).json({ ok: false, error: 'dnc_campaign_not_allowed' });
    }
  }

  const table = isSystem ? 'vicidial_dnc' : 'vicidial_campaign_dnc';
  const logCampaignId = isSystem ? DNC_LOG_SYSTEM_CAMPAIGN : scope;
  let processed = 0;

  try {
    for (const phoneNumber of numbers) {
      if (action === 'add') {
        if (isSystem) {
          await execute('INSERT IGNORE INTO vicidial_dnc (phone_number) VALUES (?)', [phoneNumber]);
        } else {
          await execute('INSERT IGNORE INTO vicidial_campaign_dnc (phone_number, campaign_id) VALUES (?, ?)', [phoneNumber, scope]);
        }
      } else if (isSystem) {
        await execute('DELETE FROM vicidial_dnc WHERE phone_number = ?', [phoneNumber]);
      } else {
        await execute('DELETE FROM vicidial_campaign_dnc WHERE phone_number = ? AND campaign_id = ?', [phoneNumber, scope]);
      }
      await execute(
        'INSERT INTO vicidial_dnc_log (phone_number, campaign_id, action, action_date, user) VALUES (?, ?, ?, NOW(), ?)',
        [phoneNumber, logCampaignId, action, req.genxUser?.user || ''],
      );
      processed += 1;
    }
    await adminLog(req, 'DNC', action === 'add' ? 'ADD' : 'DELETE', scope, `GENX ${action.toUpperCase()} DNC`, `${table} bulk ${action}`, `${processed} numbers`);
    return res.json({ ok: true, processed });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'dnc_write_failed' });
  }
}

async function dncSearch(req, res) {
  if (!requireModify(req, res, 'deleteFromDnc')) return;
  const phone = cleanText(req.query?.phone, 18).replace(/[^0-9]/g, '');
  if (phone.length < 3) return badRequest(res, 'phone_search_too_short');
  const entries = await rows(
    `SELECT campaign_id, action, action_date, user
     FROM vicidial_dnc_log
     WHERE phone_number = ?
     ORDER BY action_date DESC
     LIMIT 200`,
    [phone],
    [],
  );
  return res.json({ ok: true, entries });
}

// --- Shared native-report helpers ---
// Reports take an arbitrary begin/end date (unlike the dashboard's fixed range
// presets in `dateWhere`/`ranges`), so they get their own small date parser.
function cleanReportDate(value, fallback) {
  const text = cleanText(value, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : fallback;
}

function parseReportDateRange(req) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    beginDate: cleanReportDate(req.query?.begin_date, today),
    endDate: cleanReportDate(req.query?.end_date, today),
  };
}

async function agentMonitorLogReport(req, res) {
  if (!requireModify(req, res, 'viewReports')) return;
  const { beginDate, endDate } = parseReportDateRange(req);
  const params = [`${beginDate} 00:00:00`, `${endDate} 23:59:59`];
  const campaignWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'campaign_id', params);

  const entries = await rows(
    `SELECT manager_user, manager_server_ip, manager_phone, agent_user, agent_server_ip,
            agent_status, campaign_id, lead_id, monitor_start_time, monitor_end_time,
            monitor_sec, monitor_type
     FROM vicidial_rt_monitor_log
     WHERE monitor_start_time BETWEEN ? AND ?
       AND ${campaignWhere}
     ORDER BY monitor_start_time DESC
     LIMIT 2000`,
    params,
    [],
  );
  return res.json({ ok: true, entries, range: { beginDate, endDate } });
}

async function realtimeMainReport(req, res) {
  if (!requireModify(req, res, 'viewReports')) return;
  const agentParams = [];
  const agentCampaignWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'la.campaign_id', agentParams);
  const agents = await rows(
    `SELECT la.user, u.full_name, la.status, la.campaign_id, la.server_ip, la.calls_today,
            la.last_call_time, la.pause_code, la.callerid
     FROM vicidial_live_agents la
     LEFT JOIN vicidial_users u ON u.user = la.user
     WHERE ${agentCampaignWhere}
     ORDER BY la.campaign_id ASC, la.status ASC
     LIMIT 500`,
    agentParams,
    [],
  );

  const campaignParams = [];
  const campaignWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'c.campaign_id', campaignParams);
  const campaigns = await rows(
    `SELECT c.campaign_id, c.campaign_name, c.active, c.dial_method, c.hopper_level,
            COALESCE(live.live_agents, 0) AS live_agents,
            COALESCE(autod.auto_calls, 0) AS auto_calls
     FROM vicidial_campaigns c
     LEFT JOIN (SELECT campaign_id, COUNT(*) AS live_agents FROM vicidial_live_agents GROUP BY campaign_id) live
       ON live.campaign_id = c.campaign_id
     LEFT JOIN (SELECT campaign_id, COUNT(*) AS auto_calls FROM vicidial_auto_calls GROUP BY campaign_id) autod
       ON autod.campaign_id = c.campaign_id
     WHERE c.active = 'Y' AND ${campaignWhere}
     ORDER BY c.campaign_id ASC
     LIMIT 100`,
    campaignParams,
    [],
  );

  return res.json({ ok: true, agents, campaigns, generatedAt: new Date().toISOString() });
}

async function campaignSummaryReport(req, res) {
  if (!requireModify(req, res, 'viewReports')) return;
  const params = [];
  const campaignWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'c.campaign_id', params);
  const campaigns = await rows(
    `SELECT c.campaign_id, c.campaign_name, c.active, c.dial_method, c.hopper_level,
            cs.dialable_leads, cs.calls_today, cs.answers_today, cs.drops_today, cs.drops_answers_today_pct,
            cs.differential_onemin, cs.agents_average_onemin, cs.balance_trunk_fill,
            cs.status_category_1, cs.status_category_count_1,
            cs.status_category_2, cs.status_category_count_2,
            cs.status_category_3, cs.status_category_count_3,
            cs.status_category_4, cs.status_category_count_4,
            cs.agent_calls_today, cs.agent_wait_today, cs.agent_custtalk_today,
            cs.agent_acw_today, cs.agent_pause_today,
            COALESCE(live.live_agents, 0) AS live_agents
     FROM vicidial_campaigns c
     LEFT JOIN vicidial_campaign_stats cs ON cs.campaign_id = c.campaign_id
     LEFT JOIN (SELECT campaign_id, COUNT(*) AS live_agents FROM vicidial_live_agents GROUP BY campaign_id) live
       ON live.campaign_id = c.campaign_id
     WHERE c.active = 'Y' AND ${campaignWhere}
     ORDER BY c.campaign_id ASC
     LIMIT 100`,
    params,
    [],
  );
  return res.json({ ok: true, campaigns, generatedAt: new Date().toISOString() });
}

// Native port of AST_LISTS_stats.php: per-list status breakdown with the
// status-flag rollups computed client-side from the flag map.
async function listStatusesReport(req, res) {
  if (!requireModify(req, res, 'viewReports')) return;
  const listIdsRaw = String(req.query?.list_ids || '').split(',').map((item) => cleanId(item, 30)).filter(Boolean).slice(0, 100);

  const listParams = [];
  const listWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'campaign_id', listParams);
  const lists = await rows(
    `SELECT list_id, list_name, campaign_id, active FROM vicidial_lists WHERE ${listWhere} ORDER BY list_id ASC LIMIT 500`,
    listParams,
    [],
  );

  if (!listIdsRaw.length) return res.json({ ok: true, lists, entries: null, statusFlags: [] });

  const allowedListIds = new Set(lists.map((row) => String(row.list_id)));
  const listIds = listIdsRaw.filter((id) => allowedListIds.has(id));
  if (!listIds.length) return res.json({ ok: true, lists, entries: [], statusFlags: [] });

  const placeholders = listIds.map(() => '?').join(',');
  const entries = await rows(
    `SELECT list_id, status, COUNT(*) AS leads
     FROM vicidial_list WHERE list_id IN (${placeholders})
     GROUP BY list_id, status ORDER BY list_id ASC, status ASC LIMIT 2000`,
    listIds,
    [],
  );
  const statusFlags = await rows(
    `SELECT status, status_name, human_answered, sale, dnc, customer_contact, not_interested,
            unworkable, scheduled_callback, completed
     FROM vicidial_statuses
     UNION
     SELECT status, status_name, human_answered, sale, dnc, customer_contact, not_interested,
            unworkable, scheduled_callback, completed
     FROM vicidial_campaign_statuses LIMIT 1000`,
    [],
    [],
  );

  return res.json({ ok: true, lists, entries, statusFlags });
}

// Native port of AST_LISTS_campaign_stats.php: pick campaigns instead of lists,
// then the same per-list status math plus status-category counts.
async function listCampaignStatusesReport(req, res) {
  if (!requireModify(req, res, 'viewReports')) return;
  const campaignIdsRaw = String(req.query?.campaigns || '').split(',').map((item) => cleanId(item, 20)).filter(Boolean).slice(0, 200);

  const campaignParams = [];
  const campaignWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'campaign_id', campaignParams);
  const campaigns = await rows(
    `SELECT campaign_id, campaign_name FROM vicidial_campaigns WHERE ${campaignWhere} ORDER BY campaign_id ASC LIMIT 500`,
    campaignParams,
    [],
  );

  if (!campaignIdsRaw.length) return res.json({ ok: true, campaigns, lists: null, entries: null, statusFlags: [], categories: [] });

  const allowedIds = new Set(campaigns.map((row) => String(row.campaign_id)));
  const campaignIds = campaignIdsRaw.filter((id) => allowedIds.has(id));
  if (!campaignIds.length) return res.json({ ok: true, campaigns, lists: [], entries: [], statusFlags: [], categories: [] });
  const campPlaceholders = campaignIds.map(() => '?').join(',');

  const lists = await rows(
    `SELECT list_id, list_name, campaign_id, active FROM vicidial_lists
     WHERE active IN ('Y','N') AND campaign_id IN (${campPlaceholders})
     ORDER BY list_id ASC LIMIT 1000`,
    campaignIds,
    [],
  );
  const listIds = lists.map((row) => String(row.list_id));
  const entries = listIds.length
    ? await rows(
      `SELECT list_id, status, COUNT(*) AS leads
       FROM vicidial_list WHERE list_id IN (${listIds.map(() => '?').join(',')})
       GROUP BY list_id, status ORDER BY list_id ASC, status ASC LIMIT 5000`,
      listIds,
      [],
    )
    : [];

  const statusFlags = await rows(
    `SELECT status, status_name, category, human_answered, sale, dnc, customer_contact, not_interested,
            unworkable, scheduled_callback, completed
     FROM vicidial_statuses
     UNION
     SELECT status, status_name, category, human_answered, sale, dnc, customer_contact, not_interested,
            unworkable, scheduled_callback, completed
     FROM vicidial_campaign_statuses WHERE campaign_id IN (${campPlaceholders}) LIMIT 1000`,
    campaignIds,
    [],
  );
  const categories = await rows(
    'SELECT vsc_id, vsc_name FROM vicidial_status_categories ORDER BY vsc_id ASC LIMIT 200',
    [],
    [],
  );

  return res.json({ ok: true, campaigns, lists, entries, statusFlags, categories });
}

// Native port of AST_campaign_status_list_report.php: per campaign, per list,
// dispositions from outbound + inbound logs in the date range with duration and
// handle-time sums. The legacy per-call UNION is aggregated with GROUP BY here.
async function campaignStatusListReport(req, res) {
  if (!requireModify(req, res, 'viewReports')) return;
  const { beginDate, endDate } = parseReportDateRange(req);
  const begin = `${beginDate} 00:00:00`;
  const end = `${endDate} 23:59:59`;
  const campaignIdsRaw = String(req.query?.campaigns || '').split(',').map((item) => cleanId(item, 20)).filter(Boolean).slice(0, 20);

  const campaignParams = [];
  const campaignWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'campaign_id', campaignParams);
  const campaigns = await rows(
    `SELECT campaign_id FROM vicidial_campaigns WHERE ${campaignWhere} ORDER BY campaign_id ASC LIMIT 500`,
    campaignParams,
    [],
  );

  if (!campaignIdsRaw.length) {
    return res.json({ ok: true, campaigns, results: null, range: { beginDate, endDate } });
  }
  const allowedIds = new Set(campaigns.map((row) => String(row.campaign_id)));
  const campaignIds = campaignIdsRaw.filter((id) => allowedIds.has(id));

  const results = [];
  for (const campaignId of campaignIds) {
    const statuses = await rows(
      `SELECT status, status_name, human_answered, sale, dnc, customer_contact, not_interested,
              unworkable, scheduled_callback, completed
       FROM vicidial_campaign_statuses WHERE campaign_id = ?
       UNION
       SELECT status, status_name, human_answered, sale, dnc, customer_contact, not_interested,
              unworkable, scheduled_callback, completed
       FROM vicidial_statuses LIMIT 500`,
      [campaignId],
      [],
    );
    const lists = await rows(
      'SELECT DISTINCT list_id, list_name, active FROM vicidial_lists WHERE campaign_id = ? ORDER BY list_id ASC LIMIT 100',
      [campaignId],
      [],
    );
    const listResults = [];
    for (const list of lists) {
      const outbound = await rows(
        `SELECT vl.status AS status, COUNT(*) AS calls,
                COALESCE(SUM(vl.length_in_sec), 0) AS duration,
                COALESCE(SUM(CAST(al.talk_sec AS SIGNED) - CAST(al.dead_sec AS SIGNED)), 0) AS handle_time
         FROM vicidial_log vl
         LEFT JOIN vicidial_agent_log al
           ON al.lead_id = vl.lead_id AND al.uniqueid = vl.uniqueid AND al.user = vl.user
         WHERE vl.call_date >= ? AND vl.call_date <= ? AND vl.list_id = ?
         GROUP BY vl.status LIMIT 500`,
        [begin, end, list.list_id],
        [],
      );
      const inbound = await rows(
        `SELECT cl.status AS status, COUNT(*) AS calls,
                COALESCE(SUM(cl.length_in_sec), 0) AS duration,
                COALESCE(SUM(CAST(al.talk_sec AS SIGNED) - CAST(al.dead_sec AS SIGNED)), 0) AS handle_time
         FROM vicidial_closer_log cl
         LEFT JOIN vicidial_agent_log al
           ON al.lead_id = cl.lead_id AND al.uniqueid = cl.uniqueid AND al.user = cl.user
         WHERE cl.call_date >= ? AND cl.call_date <= ? AND cl.list_id = ?
         GROUP BY cl.status LIMIT 500`,
        [begin, end, list.list_id],
        [],
      );
      const merged = new Map();
      for (const row of [...outbound, ...inbound]) {
        const key = String(row.status ?? '');
        if (!merged.has(key)) merged.set(key, { status: key, calls: 0, duration: 0, handle_time: 0 });
        const bucket = merged.get(key);
        bucket.calls += Number(row.calls || 0);
        bucket.duration += Number(row.duration || 0);
        bucket.handle_time += Number(row.handle_time || 0);
      }
      listResults.push({
        list_id: list.list_id,
        list_name: list.list_name,
        active: list.active,
        dispositions: [...merged.values()].sort((a, b) => a.status.localeCompare(b.status)),
      });
    }
    results.push({ campaign_id: campaignId, statuses, lists: listResults });
  }

  return res.json({ ok: true, campaigns, results, range: { beginDate, endDate } });
}

// --- Dialer Inventory report (native port of AST_dialer_inventory_report.php) ---
// The legacy report leans on dialable_leads() in functions.php; the call-time to
// GMT-offset window math is ported below. State call-time split rules are ported;
// per-shift columns are only produced when shifts have report_option='Y' (none on
// this system), so they are omitted here.
const CT_DAY_FIELDS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function ctWindow(row, prefix, dayIndex) {
  const start = Number(row[`${prefix}_${CT_DAY_FIELDS[dayIndex]}_start`] || 0);
  const stop = Number(row[`${prefix}_${CT_DAY_FIELDS[dayIndex]}_stop`] || 0);
  if (start === 0 && stop === 0) {
    return [Number(row[`${prefix}_default_start`] || 0), Number(row[`${prefix}_default_stop`] || 0)];
  }
  return [start, stop];
}

function gmtOffsetSlots() {
  const slots = [];
  const now = Date.now();
  for (let p = 13; p > -13; p -= 0.25) {
    const t = new Date(now + p * 3600000);
    slots.push({ gmt: p.toFixed(2), day: t.getUTCDay(), hour: t.getUTCHours() * 100 + t.getUTCMinutes() });
  }
  return slots;
}

async function holidayWindowToday(holidayList) {
  const ids = String(holidayList || '').split('|').map((item) => cleanId(item, 30)).filter(Boolean);
  if (!ids.length) return null;
  const today = new Date().toISOString().slice(0, 10);
  const [holiday] = await rows(
    `SELECT holiday_id, ct_default_start, ct_default_stop FROM vicidial_call_time_holidays
     WHERE holiday_id IN (${ids.map(() => '?').join(',')}) AND holiday_status = 'ACTIVE' AND holiday_date = ?
     ORDER BY holiday_id LIMIT 1`,
    [...ids, today],
    [],
  );
  return holiday || null;
}

// Tighten every day window with an active holiday's window, like legacy does.
function applyHolidayWindows(row, prefix, holiday, guardStopPositive) {
  if (!holiday) return;
  const hStart = Number(holiday.ct_default_start || 0);
  const hStop = Number(holiday.ct_default_stop || 0);
  const fields = ['default', ...CT_DAY_FIELDS];
  for (const field of fields) {
    const startKey = `${prefix}_${field}_start`;
    const stopKey = `${prefix}_${field}_stop`;
    const stopOk = guardStopPositive ? Number(row[stopKey] || 0) > 0 : true;
    if (Number(row[startKey] || 0) < hStart && stopOk) row[startKey] = hStart;
    if (Number(row[stopKey] || 0) > hStop && stopOk) row[stopKey] = hStop;
  }
}

// Returns a SQL condition on vicidial_list (gmt_offset_now/state) for the given
// call time, or null when the call time imposes no restriction (24hours).
async function callTimeGmtCondition(callTimeId) {
  const id = cleanId(callTimeId, 10);
  if (!id || id === '24hours') return null;
  const [ct] = await rows(
    `SELECT ct_default_start, ct_default_stop,
            ct_sunday_start, ct_sunday_stop, ct_monday_start, ct_monday_stop,
            ct_tuesday_start, ct_tuesday_stop, ct_wednesday_start, ct_wednesday_stop,
            ct_thursday_start, ct_thursday_stop, ct_friday_start, ct_friday_stop,
            ct_saturday_start, ct_saturday_stop, ct_state_call_times, ct_holidays
     FROM vicidial_call_times WHERE call_time_id = ? LIMIT 1`,
    [id],
    [],
  );
  if (!ct) return null;
  applyHolidayWindows(ct, 'ct', await holidayWindowToday(ct.ct_holidays), false);

  const slots = gmtOffsetSlots();
  const inSet = (row, prefix) => slots
    .filter((slot) => {
      const [start, stop] = ctWindow(row, prefix, slot.day);
      return slot.hour >= start && slot.hour < stop;
    })
    .map((slot) => `'${slot.gmt}'`);

  const defaultSet = inSet(ct, 'ct');
  defaultSet.push("'99'");

  const stateIds = String(ct.ct_state_call_times || '').split('|').map((item) => cleanId(item, 10)).filter(Boolean);
  const stateParts = [];
  const stateNames = [];
  for (const stateId of stateIds) {
    const [sct] = await rows(
      `SELECT state_call_time_state, sct_default_start, sct_default_stop,
              sct_sunday_start, sct_sunday_stop, sct_monday_start, sct_monday_stop,
              sct_tuesday_start, sct_tuesday_stop, sct_wednesday_start, sct_wednesday_stop,
              sct_thursday_start, sct_thursday_stop, sct_friday_start, sct_friday_stop,
              sct_saturday_start, sct_saturday_stop, ct_holidays
       FROM vicidial_state_call_times WHERE state_call_time_id = ? LIMIT 1`,
      [stateId],
      [],
    );
    if (!sct) continue;
    applyHolidayWindows(sct, 'sct', await holidayWindowToday(sct.ct_holidays), true);
    const state = cleanText(sct.state_call_time_state, 4).replace(/[^A-Z0-9]/gi, '');
    if (!state) continue;
    stateNames.push(`'${state}'`);
    const stateSet = inSet(sct, 'sct');
    stateSet.push("'99'");
    stateParts.push(`(state = '${state}' AND gmt_offset_now IN (${stateSet.join(',')}))`);
  }

  const stateExclusion = stateNames.length ? ` AND state NOT IN (${stateNames.join(',')})` : '';
  const base = `(gmt_offset_now IN (${defaultSet.join(',')})${stateExclusion})`;
  return stateParts.length ? `(${base} OR ${stateParts.join(' OR ')})` : base;
}

// Port of dialable_leads() as used by the inventory report: counts leads in one
// list matching statuses + call-time window + campaign limits + filter SQL.
async function dialableLeadCount(list, statuses, campaign, gmtCondition, extraSql) {
  if (!list || list.active !== 'Y') return 0;
  const today = new Date().toISOString().slice(0, 10);
  if (list.expiration_date && String(list.expiration_date).slice(0, 10) < today) return 0;
  const statusIn = statuses.length
    ? statuses.map((status) => `'${String(status).replace(/[^-_0-9A-Za-z]/g, '')}'`).join(',')
    : "''";
  let where = `called_since_last_reset = 'N' AND status IN (${statusIn}) AND list_id = ?`;
  if (gmtCondition) where += ` AND ${gmtCondition}`;
  const callCountLimit = Number(campaign.call_count_limit || 0);
  if (callCountLimit > 0) where += ` AND called_count < ${callCountLimit}`;
  const dropLockout = Number(campaign.drop_lockout_time || 0);
  if (dropLockout > 0) {
    const seconds = Math.floor(dropLockout * 3600);
    where += ` AND ((status IN ('DROP','XDROP') AND last_local_call_time < CONCAT(DATE_ADD(NOW(), INTERVAL -${seconds} SECOND), ' ', CURTIME())) OR status NOT IN ('DROP','XDROP'))`;
  }
  if (extraSql) where += ` AND ${extraSql}`;
  const [row] = await rows(`SELECT COUNT(*) AS cnt FROM vicidial_list WHERE ${where}`, [list.list_id], []);
  return Number(row?.cnt || 0);
}

async function inventoryListRow(campaign, list, inventoryStatuses, inactiveStatuses, filterSql, gmtCondition, override24) {
  // Lists may override the campaign call time (legacy list local_call_time branch).
  if (!override24 && list.local_call_time && list.local_call_time !== 'campaign'
    && list.local_call_time !== campaign.local_call_time) {
    gmtCondition = await callTimeGmtCondition(list.local_call_time);
  }
  const counts = await rows(
    'SELECT status, called_count, COUNT(*) AS leads FROM vicidial_list WHERE list_id = ? GROUP BY status, called_count ORDER BY status, called_count LIMIT 2000',
    [list.list_id],
    [],
  );
  let startInv = 0;
  let totalCalls = 0;
  for (const row of counts) {
    startInv += Number(row.leads || 0);
    totalCalls += Number(row.called_count || 0) * Number(row.leads || 0);
  }
  const callCountLimit = Number(campaign.call_count_limit || 0);
  const oneoffSql = `${filterSql ? `${filterSql} AND ` : ''}(called_count < ${callCountLimit - 1})`;
  const [dialable, dialableNoFilter, oneoff, inactiveDialable] = await Promise.all([
    dialableLeadCount(list, inventoryStatuses, campaign, gmtCondition, filterSql),
    dialableLeadCount(list, inventoryStatuses, campaign, gmtCondition, ''),
    dialableLeadCount(list, inventoryStatuses, campaign, gmtCondition, oneoffSql),
    inactiveStatuses.length
      ? dialableLeadCount(list, inactiveStatuses, campaign, gmtCondition, filterSql)
      : Promise.resolve(0),
  ]);
  return {
    list_id: list.list_id,
    list_name: list.list_name,
    list_description: String(list.list_description || '').slice(0, 30),
    campaign_id: campaign.campaign_id,
    last_call_date: list.list_lastcalldate || null,
    start_inv: startInv,
    dialable,
    dialable_nofilter: dialableNoFilter,
    oneoff,
    inactive_dialable: inactiveDialable,
    average_calls: startInv ? Number((totalCalls / startInv).toFixed(1)) : 0,
    penetration: startInv ? Number((100 * ((startInv - dialable) / startInv)).toFixed(2)) : 0,
    status_counts: counts,
  };
}

async function inventoryCampaignContext(campaignId, override24) {
  const [campaign] = await rows(
    `SELECT campaign_id, call_count_limit, call_count_target, dial_statuses, local_call_time,
            drop_lockout_time, lead_filter_id
     FROM vicidial_campaigns WHERE campaign_id = ? LIMIT 1`,
    [campaignId],
    [],
  );
  if (!campaign) return null;
  const statusRows = await rows(
    `SELECT DISTINCT status FROM vicidial_statuses WHERE completed = 'N'
     UNION
     SELECT DISTINCT status FROM vicidial_campaign_statuses WHERE completed = 'N' AND campaign_id = ? LIMIT 500`,
    [campaignId],
    [],
  );
  const inventoryStatuses = statusRows.map((row) => String(row.status));
  const activeSet = new Set(String(campaign.dial_statuses || '').trim().split(/\s+/).filter(Boolean));
  const inactiveStatuses = inventoryStatuses.filter((status) => !activeSet.has(status));

  let filterSql = '';
  if (campaign.lead_filter_id && campaign.lead_filter_id !== 'NONE') {
    // Legacy appends the raw admin-authored filter SQL; parenthesized here.
    const [filter] = await rows(
      'SELECT lead_filter_sql FROM vicidial_lead_filters WHERE lead_filter_id = ? LIMIT 1',
      [campaign.lead_filter_id],
      [],
    );
    if (filter?.lead_filter_sql) filterSql = `(${String(filter.lead_filter_sql).replace(/\\/g, '')})`;
  }
  const gmtCondition = override24 ? null : await callTimeGmtCondition(campaign.local_call_time);
  return { campaign, inventoryStatuses, inactiveStatuses, filterSql, gmtCondition };
}

async function dialerInventoryReport(req, res) {
  if (!requireModify(req, res, 'viewReports')) return;
  const reportType = cleanChoice(req.query?.report_type, ['CAMPAIGNS', 'LIST', 'SNAPSHOT'], 'CAMPAIGNS');
  const override24 = String(req.query?.override_24hours || '') === '1';
  const submitted = String(req.query?.submit || '') === '1';

  const campaignParams = [];
  const campaignWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'campaign_id', campaignParams);
  const campaigns = await rows(
    `SELECT campaign_id FROM vicidial_campaigns
     WHERE campaign_id IN (SELECT DISTINCT campaign_id FROM vicidial_lists WHERE inventory_report = 'Y')
       AND ${campaignWhere}
     ORDER BY campaign_id ASC LIMIT 500`,
    campaignParams,
    [],
  );
  const listParams = [];
  const listWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'campaign_id', listParams);
  const pickerLists = await rows(
    `SELECT list_id, list_name, campaign_id FROM vicidial_lists
     WHERE inventory_report = 'Y' AND ${listWhere}
     ORDER BY list_id ASC LIMIT 500`,
    listParams,
    [],
  );
  const snapshots = await rows(
    'SELECT DISTINCT snapshot_time FROM dialable_inventory_snapshots ORDER BY snapshot_time DESC LIMIT 100',
    [],
    [],
  );

  const picker = { campaigns, lists: pickerLists, snapshots: snapshots.map((row) => row.snapshot_time) };
  if (!submitted) return res.json({ ok: true, ...picker, entries: null });

  if (reportType === 'SNAPSHOT') {
    const snapshotTime = cleanText(req.query?.snapshot_time, 20);
    const timeSetting = cleanChoice(req.query?.time_setting, ['GMT', 'LOCAL'], 'GMT');
    const params = [snapshotTime, timeSetting];
    const snapWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'campaign_id', params);
    const entries = await rows(
      `SELECT snapshot_time, list_id, list_name, list_description, campaign_id, list_lastcalldate AS last_call_date,
              list_start_inv AS start_inv, dialable_count AS dialable, dialable_count_nofilter AS dialable_nofilter,
              dialable_count_oneoff AS oneoff, dialable_count_inactive AS inactive_dialable,
              average_call_count AS average_calls, penetration, time_setting
       FROM dialable_inventory_snapshots
       WHERE snapshot_time = ? AND time_setting = ? AND ${snapWhere}
       ORDER BY campaign_id ASC, list_id ASC LIMIT 1000`,
      params,
      [],
    );
    return res.json({ ok: true, ...picker, reportType, entries, snapshotTime, timeSetting });
  }

  const allowedIds = new Set(campaigns.map((row) => String(row.campaign_id)));

  if (reportType === 'LIST') {
    const listId = cleanId(req.query?.list_id, 30);
    const [list] = await rows(
      `SELECT list_id, list_name, list_description, active, expiration_date, local_call_time,
              campaign_id, list_lastcalldate
       FROM vicidial_lists WHERE list_id = ? AND inventory_report = 'Y' LIMIT 1`,
      [listId],
      [],
    );
    if (!list || !allowedIds.has(String(list.campaign_id))) {
      return res.status(404).json({ ok: false, error: 'list_not_found' });
    }
    const context = await inventoryCampaignContext(list.campaign_id, override24);
    if (!context) return res.status(404).json({ ok: false, error: 'campaign_not_found' });
    const entry = await inventoryListRow(context.campaign, list, context.inventoryStatuses, context.inactiveStatuses, context.filterSql, context.gmtCondition, override24);
    return res.json({ ok: true, ...picker, reportType, entries: [entry], statusMatrix: entry.status_counts });
  }

  const requestedIds = String(req.query?.campaigns || '').split(',').map((item) => cleanId(item, 20)).filter(Boolean).slice(0, 50);
  const campaignIds = requestedIds.filter((id) => allowedIds.has(id));
  const entries = [];
  for (const campaignId of campaignIds) {
    const context = await inventoryCampaignContext(campaignId, override24);
    if (!context) continue;
    const lists = await rows(
      `SELECT list_id, list_name, list_description, active, expiration_date, local_call_time, list_lastcalldate
       FROM vicidial_lists WHERE campaign_id = ? AND inventory_report = 'Y' ORDER BY list_id ASC LIMIT 200`,
      [campaignId],
      [],
    );
    for (const list of lists) {
      entries.push(await inventoryListRow(context.campaign, list, context.inventoryStatuses, context.inactiveStatuses, context.filterSql, context.gmtCondition, override24));
    }
  }
  return res.json({ ok: true, ...picker, reportType, entries });
}

// --- Outbound Calling report (native port of AST_VDADstats.php) ---
// Legacy fixed status sets used by the quick dial-stat sections.
const VDAD_NA_STATUSES = ['NA', 'ADC', 'AB', 'CPDB', 'CPDUK', 'CPDATB', 'CPDNA', 'CPDREJ', 'CPDINV', 'CPDSUA', 'CPDSI', 'CPDSNC', 'CPDSR', 'CPDSUK', 'CPDSV', 'CPDERR'];
const VDAD_BDN_STATUSES = ['B', 'DC', 'N'];
// Statuses the legacy interval report counts as system (non-agent) releases.
const SYSTEM_RELEASE_STATUSES = ['NA', 'NEW', 'QUEUE', 'INCALL', 'DROP', 'XDROP', 'AA', 'AM', 'AL', 'AFAX', 'AB', 'ADC', 'DNCL', 'DNCC', 'PU', 'PM', 'SVYEXT', 'SVYHU', 'SVYVM', 'SVYREC', 'QVMAIL'];
const CLOSER_UNANSWERED_STATUSES = ['DROP', 'XDROP', 'HXFER', 'QVMAIL', 'HOLDTO', 'LIVE', 'QUEUE'];

function sqlStatusList(statuses) {
  const cleaned = statuses.map((status) => String(status).replace(/[^-_0-9A-Za-z]/g, '')).filter(Boolean);
  return cleaned.length ? cleaned.map((status) => `'${status}'`).join(',') : "''";
}

// Reads the campaigns' status-flag sets (human answered / answering machine /
// sale / dnc) from system plus per-campaign statuses, like every legacy report.
async function campaignStatusSets(campaignIds) {
  const ph = campaignIds.map(() => '?').join(',');
  const flagRows = await rows(
    `SELECT status, human_answered, answering_machine, sale, dnc FROM vicidial_statuses
     UNION
     SELECT status, human_answered, answering_machine, sale, dnc
     FROM vicidial_campaign_statuses WHERE campaign_id IN (${ph}) LIMIT 1000`,
    campaignIds,
    [],
  );
  const pick = (flag) => flagRows.filter((row) => row[flag] === 'Y').map((row) => row.status);
  return {
    humanAnswered: pick('human_answered'),
    answeringMachine: pick('answering_machine'),
    sale: pick('sale'),
    dnc: pick('dnc'),
  };
}

async function campaignInboundGroups(campaignIds) {
  const ph = campaignIds.map(() => '?').join(',');
  const camps = await rows(
    `SELECT campaign_id, drop_inbound_group, closer_campaigns FROM vicidial_campaigns WHERE campaign_id IN (${ph})`,
    campaignIds,
    [],
  );
  const dropGroups = [...new Set(camps
    .map((row) => String(row.drop_inbound_group || '').trim())
    .filter((group) => group && group !== 'NONE'))];
  const closerGroups = [...new Set(camps
    .flatMap((row) => String(row.closer_campaigns || '').trim().replace(/ -$/, '').split(/\s+/))
    .filter(Boolean))];
  return { dropGroups, closerGroups };
}

async function outboundCallingReport(req, res) {
  if (!requireModify(req, res, 'viewReports')) return;
  const { beginDate, endDate } = parseReportDateRange(req);
  const begin = `${beginDate} 00:00:00`;
  const end = `${endDate} 23:59:59`;
  const campaignIdsRaw = String(req.query?.campaigns || '').split(',').map((item) => cleanId(item, 20)).filter(Boolean).slice(0, 50);

  const campaignParams = [];
  const campaignWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'campaign_id', campaignParams);
  const campaigns = await rows(
    `SELECT campaign_id, campaign_name FROM vicidial_campaigns WHERE ${campaignWhere} ORDER BY campaign_id ASC LIMIT 500`,
    campaignParams,
    [],
  );
  if (!campaignIdsRaw.length) return res.json({ ok: true, campaigns, sections: null, range: { beginDate, endDate } });
  const allowedIds = new Set(campaigns.map((row) => String(row.campaign_id)));
  const campaignIds = campaignIdsRaw.filter((id) => allowedIds.has(id));
  if (!campaignIds.length) return res.json({ ok: true, campaigns, sections: null, range: { beginDate, endDate } });

  const ph = campaignIds.map(() => '?').join(',');
  const logWhere = `call_date >= ? AND call_date <= ? AND campaign_id IN (${ph})`;
  const logParams = [begin, end, ...campaignIds];
  const sets = await campaignStatusSets(campaignIds);
  const { dropGroups, closerGroups } = await campaignInboundGroups(campaignIds);
  const haIn = sqlStatusList(sets.humanAnswered);
  const amIn = sqlStatusList(sets.answeringMachine);

  const one = async (sql, params) => (await rows(sql, params, []))[0] || {};
  const [
    totals, haAgent, haAll, ansAgent, amCalls, drops, naStats, bdnStats,
    termReasons, agentTime, statusBreakdown, listBreakdown, carrierBreakdown,
  ] = await Promise.all([
    one(`SELECT COUNT(*) AS calls, COALESCE(SUM(length_in_sec),0) AS seconds FROM vicidial_log WHERE ${logWhere}`, logParams),
    one(`SELECT COUNT(*) AS calls, COALESCE(SUM(length_in_sec),0) AS seconds FROM vicidial_log WHERE ${logWhere} AND user != 'VDAD' AND status IN (${haIn})`, logParams),
    one(`SELECT COUNT(*) AS calls, COALESCE(SUM(length_in_sec),0) AS seconds FROM vicidial_log WHERE ${logWhere} AND status IN (${haIn})`, logParams),
    one(`SELECT COUNT(*) AS calls FROM vicidial_log WHERE ${logWhere} AND user != 'VDAD' AND status IN (${haIn})`, logParams),
    one(`SELECT COUNT(*) AS calls FROM vicidial_log WHERE ${logWhere} AND user != 'VDAD' AND status IN (${amIn})`, logParams),
    one(`SELECT COUNT(*) AS calls, COALESCE(SUM(length_in_sec),0) AS seconds FROM vicidial_log WHERE ${logWhere} AND status = 'DROP' AND (length_in_sec <= 6000 OR length_in_sec IS NULL)`, logParams),
    one(`SELECT COUNT(*) AS calls, COALESCE(SUM(length_in_sec),0) AS seconds FROM vicidial_log WHERE ${logWhere} AND status IN (${sqlStatusList(VDAD_NA_STATUSES)}) AND (length_in_sec <= 60 OR length_in_sec IS NULL)`, logParams),
    one(`SELECT COUNT(*) AS calls, COALESCE(SUM(length_in_sec),0) AS seconds FROM vicidial_log WHERE ${logWhere} AND status IN (${sqlStatusList(VDAD_BDN_STATUSES)}) AND (length_in_sec <= 60 OR length_in_sec IS NULL)`, logParams),
    rows(`SELECT term_reason, COUNT(*) AS calls FROM vicidial_log WHERE ${logWhere} GROUP BY term_reason ORDER BY calls DESC LIMIT 50`, logParams, []),
    one(
      `SELECT COALESCE(SUM(pause_sec + wait_sec + talk_sec + dispo_sec),0) AS seconds
       FROM vicidial_agent_log WHERE event_time >= ? AND event_time <= ? AND campaign_id IN (${ph})
         AND pause_sec < 65000 AND wait_sec < 65000 AND talk_sec < 65000 AND dispo_sec < 65000`,
      logParams,
    ),
    rows(
      `SELECT vl.status, COUNT(*) AS calls, COALESCE(SUM(vl.length_in_sec),0) AS seconds, s.status_name, s.category
       FROM vicidial_log vl
       LEFT JOIN (SELECT status, status_name, category FROM vicidial_statuses
                  UNION SELECT status, status_name, category FROM vicidial_campaign_statuses WHERE campaign_id IN (${ph})) s
         ON s.status = vl.status
       WHERE vl.call_date >= ? AND vl.call_date <= ? AND vl.campaign_id IN (${ph})
       GROUP BY vl.status ORDER BY vl.status ASC LIMIT 200`,
      [...campaignIds, begin, end, ...campaignIds],
      [],
    ),
    rows(
      `SELECT vl.list_id, COUNT(*) AS calls, l.list_name
       FROM vicidial_log vl LEFT JOIN vicidial_lists l ON l.list_id = vl.list_id
       WHERE ${logWhere.replace(/call_date/g, 'vl.call_date').replace('campaign_id', 'vl.campaign_id')}
       GROUP BY vl.list_id ORDER BY calls DESC LIMIT 200`,
      logParams,
      [],
    ),
    rows(
      `SELECT vcl.dialstatus, COUNT(*) AS calls
       FROM vicidial_carrier_log vcl, vicidial_log vl
       WHERE vcl.uniqueid = vl.uniqueid AND vcl.call_date > ? AND vcl.call_date < ?
         AND vl.call_date > ? AND vl.call_date < ? AND vl.campaign_id IN (${ph})
       GROUP BY vcl.dialstatus ORDER BY vcl.dialstatus ASC LIMIT 50`,
      [begin, end, begin, end, ...campaignIds],
      [],
    ),
  ]);

  // Rollover in-group sections only exist when campaigns route drops inbound.
  let inbound = null;
  if (dropGroups.length) {
    const dropIn = sqlStatusList(dropGroups);
    const [inboundTotals, inboundBreakdown] = await Promise.all([
      one(
        `SELECT COUNT(*) AS calls, COALESCE(SUM(cl.length_in_sec),0) AS seconds,
                COALESCE(SUM(cl.queue_seconds),0) AS queue_seconds,
                COALESCE(SUM(GREATEST(cl.length_in_sec - cl.queue_seconds - ROUND(COALESCE(ig.agent_alert_delay,0) / 1000), 0)),0) AS talk_seconds
         FROM vicidial_closer_log cl
         LEFT JOIN vicidial_inbound_groups ig ON ig.group_id = cl.campaign_id
         WHERE cl.call_date >= ? AND cl.call_date <= ? AND cl.campaign_id IN (${dropIn})`,
        [begin, end],
      ),
      rows(
        `SELECT status, COUNT(*) AS calls, COALESCE(SUM(length_in_sec),0) AS seconds
         FROM vicidial_closer_log WHERE call_date >= ? AND call_date <= ? AND campaign_id IN (${dropIn})
         GROUP BY status ORDER BY status ASC LIMIT 200`,
        [begin, end],
        [],
      ),
    ]);
    inbound = { groups: dropGroups, totals: inboundTotals, breakdown: inboundBreakdown };
  }
  let inboundAnswered = null;
  if (closerGroups.length) {
    inboundAnswered = await one(
      `SELECT COUNT(*) AS calls FROM vicidial_closer_log
       WHERE call_date >= ? AND call_date <= ? AND campaign_id IN (${sqlStatusList(closerGroups)})
         AND status NOT IN (${sqlStatusList(CLOSER_UNANSWERED_STATUSES)})`,
      [begin, end],
    );
  }

  return res.json({
    ok: true,
    campaigns,
    range: { beginDate, endDate },
    sections: {
      totals, haAgent, haAll, ansAgent, amCalls, drops, naStats, bdnStats,
      termReasons, agentSeconds: Number(agentTime.seconds || 0), statusBreakdown,
      listBreakdown, carrierBreakdown, inbound, inboundAnswered,
    },
  });
}

// --- Outbound Interval summary (native port of AST_OUTBOUNDsummary_interval.php) ---
// The legacy per-call PHP loop becomes per-bucket SUM(CASE) aggregation; the
// system/agent release split and sale/dnc sets follow the legacy rules exactly.
async function outboundIntervalReport(req, res) {
  if (!requireModify(req, res, 'viewReports')) return;
  const { beginDate, endDate } = parseReportDateRange(req);
  const begin = `${beginDate} 00:00:00`;
  const end = `${endDate} 23:59:59`;
  const intervalSec = Number(cleanChoice(req.query?.interval, ['900', '1800', '3600'], '1800'));
  const includeRollover = String(req.query?.include_rollover || '') === '1';
  const campaignIdsRaw = String(req.query?.campaigns || '').split(',').map((item) => cleanId(item, 20)).filter(Boolean).slice(0, 20);

  const campaignParams = [];
  const campaignWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'campaign_id', campaignParams);
  const campaigns = await rows(
    `SELECT campaign_id, campaign_name FROM vicidial_campaigns WHERE ${campaignWhere} ORDER BY campaign_id ASC LIMIT 500`,
    campaignParams,
    [],
  );
  if (!campaignIdsRaw.length) return res.json({ ok: true, campaigns, results: null, range: { beginDate, endDate }, intervalSec });
  const allowedIds = new Set(campaigns.map((row) => String(row.campaign_id)));
  const campaignIds = campaignIdsRaw.filter((id) => allowedIds.has(id));

  const results = [];
  for (const campaignId of campaignIds) {
    const sets = await campaignStatusSets([campaignId]);
    const { dropGroups } = await campaignInboundGroups([campaignId]);
    const saleIn = sqlStatusList(sets.sale);
    const dncIn = sqlStatusList(sets.dnc);
    const systemIn = sqlStatusList(SYSTEM_RELEASE_STATUSES);
    const bucketExpr = `FLOOR(UNIX_TIMESTAMP(call_date) / ${intervalSec}) * ${intervalSec}`;

    const outbound = await rows(
      `SELECT ${bucketExpr} AS bucket, COUNT(*) AS calls,
              COALESCE(SUM(GREATEST(length_in_sec,0)),0) AS talk_seconds,
              COALESCE(SUM(status LIKE '%DROP%'),0) AS drops,
              COALESCE(SUM(status IN (${systemIn})),0) AS system_release,
              COALESCE(SUM(status = 'NA'),0) AS na_calls,
              COALESCE(SUM(status IN (${saleIn})),0) AS sale_calls,
              COALESCE(SUM(status IN (${dncIn})),0) AS dnc_calls
       FROM vicidial_log
       WHERE call_date >= ? AND call_date <= ? AND campaign_id = ?
       GROUP BY bucket ORDER BY bucket ASC LIMIT 3000`,
      [begin, end, campaignId],
      [],
    );

    let inboundBuckets = [];
    if (includeRollover && dropGroups.length) {
      inboundBuckets = await rows(
        `SELECT ${bucketExpr.replace(/call_date/g, 'cl.call_date')} AS bucket, COUNT(*) AS calls_in,
                COALESCE(SUM(cl.status LIKE '%DROP%'),0) AS drops_in,
                COALESCE(SUM(GREATEST(cl.length_in_sec - cl.queue_seconds - ROUND(COALESCE(ig.agent_alert_delay,0) / 1000), 0)),0) AS talk_seconds,
                COALESCE(SUM(cl.status IN (${saleIn})),0) AS sale_calls,
                COALESCE(SUM(cl.status IN (${dncIn})),0) AS dnc_calls,
                COALESCE(SUM(cl.status IN (${systemIn})),0) AS system_release,
                COALESCE(SUM(cl.status = 'NA'),0) AS na_calls
         FROM vicidial_closer_log cl
         LEFT JOIN vicidial_inbound_groups ig ON ig.group_id = cl.campaign_id
         WHERE cl.call_date >= ? AND cl.call_date <= ? AND cl.campaign_id IN (${sqlStatusList(dropGroups)})
         GROUP BY bucket ORDER BY bucket ASC LIMIT 3000`,
        [begin, end],
        [],
      );
    }

    const agentCampaigns = [campaignId, ...(includeRollover ? dropGroups : [])];
    const agentBuckets = await rows(
      `SELECT FLOOR(UNIX_TIMESTAMP(event_time) / ${intervalSec}) * ${intervalSec} AS bucket,
              COALESCE(SUM(pause_sec + wait_sec + talk_sec + dispo_sec),0) AS login_seconds,
              COALESCE(SUM(pause_sec),0) AS pause_seconds
       FROM vicidial_agent_log
       WHERE event_time >= ? AND event_time <= ? AND campaign_id IN (${agentCampaigns.map(() => '?').join(',')})
         AND pause_sec < 65000 AND wait_sec < 65000 AND talk_sec < 65000 AND dispo_sec < 65000
       GROUP BY bucket ORDER BY bucket ASC LIMIT 3000`,
      [begin, end, ...agentCampaigns],
      [],
    );

    const buckets = new Map();
    const ensure = (bucket) => {
      const key = Number(bucket);
      if (!buckets.has(key)) {
        buckets.set(key, {
          bucket: key, calls: 0, calls_in: 0, drops: 0, system_release: 0, na_calls: 0,
          sale_calls: 0, dnc_calls: 0, talk_seconds: 0, login_seconds: 0, pause_seconds: 0,
        });
      }
      return buckets.get(key);
    };
    for (const row of outbound) {
      const bucket = ensure(row.bucket);
      bucket.calls += Number(row.calls || 0);
      bucket.drops += Number(row.drops || 0);
      bucket.system_release += Number(row.system_release || 0);
      bucket.na_calls += Number(row.na_calls || 0);
      bucket.sale_calls += Number(row.sale_calls || 0);
      bucket.dnc_calls += Number(row.dnc_calls || 0);
      bucket.talk_seconds += Number(row.talk_seconds || 0);
    }
    for (const row of inboundBuckets) {
      const bucket = ensure(row.bucket);
      bucket.calls += Number(row.calls_in || 0);
      bucket.calls_in += Number(row.calls_in || 0);
      bucket.drops += Number(row.drops_in || 0);
      bucket.system_release += Number(row.system_release || 0);
      bucket.na_calls += Number(row.na_calls || 0);
      bucket.sale_calls += Number(row.sale_calls || 0);
      bucket.dnc_calls += Number(row.dnc_calls || 0);
      bucket.talk_seconds += Number(row.talk_seconds || 0);
    }
    for (const row of agentBuckets) {
      const bucket = ensure(row.bucket);
      bucket.login_seconds += Number(row.login_seconds || 0);
      bucket.pause_seconds += Number(row.pause_seconds || 0);
    }

    const meta = campaigns.find((row) => String(row.campaign_id) === campaignId);
    results.push({
      campaign_id: campaignId,
      campaign_name: meta?.campaign_name || '',
      drop_groups: dropGroups,
      buckets: [...buckets.values()].sort((a, b) => a.bucket - b.bucket),
    });
  }

  return res.json({ ok: true, campaigns, results, range: { beginDate, endDate }, intervalSec });
}

const WHITEBOARD_REPORT_TYPES = ['DISPOSITION_TOTALS', 'AGENT_PERFORMANCE_TOTALS'];

async function whiteboardReport(req, res) {
  if (!requireModify(req, res, 'viewReports')) return;
  const { beginDate, endDate } = parseReportDateRange(req);
  const reportType = cleanChoice(req.query?.report_type, WHITEBOARD_REPORT_TYPES, 'DISPOSITION_TOTALS');
  const params = [`${beginDate} 00:00:00`, `${endDate} 23:59:59`];
  const campaignWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'campaign_id', params);

  if (reportType === 'AGENT_PERFORMANCE_TOTALS') {
    const items = await rows(
      `SELECT user, COUNT(*) AS calls, SUM(length_in_sec) AS talk_seconds
       FROM vicidial_log
       WHERE call_date BETWEEN ? AND ?
         AND ${campaignWhere}
       GROUP BY user
       ORDER BY calls DESC
       LIMIT 30`,
      params,
      [],
    );
    return res.json({ ok: true, reportType, items, range: { beginDate, endDate } });
  }

  const items = await rows(
    `SELECT status, COUNT(*) AS calls
     FROM vicidial_log
     WHERE call_date BETWEEN ? AND ?
       AND ${campaignWhere}
     GROUP BY status
     ORDER BY calls DESC
     LIMIT 30`,
    params,
    [],
  );
  return res.json({ ok: true, reportType, items, range: { beginDate, endDate } });
}

// Mirrors legacy admin.php ADD=6 (user delete): remove the user row plus their
// campaign/in-group rank rows, deactivate remote agents they started.
async function deleteUser(req, res) {
  if (!requireModify(req, res, 'deleteUsers')) return;
  const id = cleanId(req.params.id, 20);
  if (!id || id.length < 2) return badRequest(res, 'invalid_user_id');
  if (id === req.genxUser.user) return res.status(403).json({ ok: false, error: 'cannot_delete_self' });
  const [target] = await rows('SELECT user, user_group FROM vicidial_users WHERE user = ? LIMIT 1', [id], []);
  if (!target) return res.status(404).json({ ok: false, error: 'user_not_found' });
  if (!scopeAllows(req.genxUser?.permissions?.adminViewableGroups, target.user_group)) {
    return res.status(403).json({ ok: false, error: 'user_not_allowed' });
  }
  try {
    await execute('DELETE FROM vicidial_users WHERE user = ? LIMIT 1', [id]);
    await execute('DELETE FROM vicidial_campaign_agents WHERE user = ?', [id]).catch(() => {});
    await execute('DELETE FROM vicidial_inbound_group_agents WHERE user = ?', [id]).catch(() => {});
    await execute("UPDATE vicidial_remote_agents SET status = 'INACTIVE' WHERE user_start = ?", [id]).catch(() => {});
    await adminLog(req, 'USERS', 'DELETE', id, 'GENX DELETE USER', 'DELETE FROM vicidial_users + agent rank rows', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'user_delete_failed' });
  }
}

// Per-user campaign/in-group rank grids from legacy user modify (ADD=3).
async function getUserRanks(req, res) {
  if (!requireModify(req, res, 'modifyUsers')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_user_id');

  const campaignParams = [id];
  const campaignWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'campaign_id', campaignParams);
  const campaigns = await rows(
    `SELECT campaign_id, campaign_rank, campaign_grade
     FROM vicidial_campaign_agents WHERE user = ? AND ${campaignWhere}
     ORDER BY campaign_id ASC LIMIT 500`,
    campaignParams,
    [],
  );

  const groupParams = [id];
  const groupWhere = scopeWhere(req.genxUser?.permissions?.allowedQueueGroups, 'group_id', groupParams);
  const ingroups = await rows(
    `SELECT group_id, group_rank, group_grade, daily_limit
     FROM vicidial_inbound_group_agents WHERE user = ? AND ${groupWhere}
     ORDER BY group_id ASC LIMIT 500`,
    groupParams,
    [],
  );

  return res.json({ ok: true, campaigns, ingroups });
}

async function saveUserRanks(req, res) {
  if (!requireModify(req, res, 'modifyUsers')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_user_id');
  const [target] = await rows('SELECT user, user_group FROM vicidial_users WHERE user = ? LIMIT 1', [id], []);
  if (!target) return res.status(404).json({ ok: false, error: 'user_not_found' });
  if (!scopeAllows(req.genxUser?.permissions?.adminViewableGroups, target.user_group)) {
    return res.status(403).json({ ok: false, error: 'user_not_allowed' });
  }

  const campaigns = Array.isArray(req.body?.campaigns) ? req.body.campaigns.slice(0, 200) : [];
  const ingroups = Array.isArray(req.body?.ingroups) ? req.body.ingroups.slice(0, 200) : [];

  try {
    for (const entry of campaigns) {
      const campaignId = cleanId(entry.campaign_id, 20);
      if (!campaignId || !scopeAllows(req.genxUser?.permissions?.allowedCampaigns, campaignId)) continue;
      const rank = cleanInt(entry.campaign_rank, 0, -9, 9);
      const grade = cleanInt(entry.campaign_grade, 1, 1, 10);
      const updated = await execute(
        'UPDATE vicidial_campaign_agents SET campaign_rank = ?, campaign_grade = ? WHERE user = ? AND campaign_id = ?',
        [rank, grade, id, campaignId],
      );
      if (updated.affectedRows < 1) {
        await execute(
          `INSERT INTO vicidial_campaign_agents (user, campaign_id, campaign_rank, campaign_weight, calls_today, campaign_grade)
           VALUES (?, ?, ?, 0, 0, ?)`,
          [id, campaignId, rank, grade],
        ).catch(() => {});
      }
    }

    for (const entry of ingroups) {
      const groupId = cleanId(entry.group_id, 20);
      if (!groupId || !scopeAllows(req.genxUser?.permissions?.allowedQueueGroups, groupId)) continue;
      const rank = cleanInt(entry.group_rank, 0, -9, 9);
      const grade = cleanInt(entry.group_grade, 1, 1, 10);
      const dailyLimit = cleanInt(entry.daily_limit, -1, -1, 99999);
      const updated = await execute(
        'UPDATE vicidial_inbound_group_agents SET group_rank = ?, group_grade = ?, daily_limit = ? WHERE user = ? AND group_id = ?',
        [rank, grade, dailyLimit, id, groupId],
      );
      if (updated.affectedRows < 1) {
        await execute(
          `INSERT INTO vicidial_inbound_group_agents (user, group_id, group_rank, group_weight, calls_today, group_grade, daily_limit)
           VALUES (?, ?, ?, 0, 0, ?, ?)`,
          [id, groupId, rank, grade, dailyLimit],
        ).catch(() => {});
      }
    }

    await adminLog(req, 'USERS', 'MODIFY', id, 'GENX MODIFY USER RANKS', 'UPDATE vicidial_campaign_agents / vicidial_inbound_group_agents', `${campaigns.length} campaigns, ${ingroups.length} ingroups`);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'user_ranks_save_failed' });
  }
}

// The cross-references at the bottom of legacy in-group modify (ADD=3111):
// agent rank rows, DIDs / call menus / campaigns pointing at this group.
async function inboundGroupConnections(req, res) {
  if (!requireModify(req, res, 'modifyIngroups')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_group_id');
  if (!scopeAllows(req.genxUser?.permissions?.allowedQueueGroups, id)) {
    return res.status(403).json({ ok: false, error: 'ingroup_not_allowed' });
  }

  const agents = await rows(
    `SELECT iga.user, u.full_name, u.user_group, iga.group_rank, iga.group_grade, iga.daily_limit, iga.calls_today
     FROM vicidial_inbound_group_agents iga
     LEFT JOIN vicidial_users u ON u.user = iga.user
     WHERE iga.group_id = ?
     ORDER BY iga.user ASC LIMIT 500`,
    [id],
    [],
  );
  const dids = await rows(
    `SELECT did_pattern, did_description, did_active
     FROM vicidial_inbound_dids WHERE did_route = 'IN_GROUP' AND group_id = ?
     ORDER BY did_pattern ASC LIMIT 200`,
    [id],
    [],
  );
  const callMenus = await rows(
    `SELECT DISTINCT menu_id, option_value
     FROM vicidial_call_menu_options WHERE option_route = 'INGROUP' AND option_route_value = ?
     ORDER BY menu_id ASC LIMIT 200`,
    [id],
    [],
  );
  const campaignsUsing = await rows(
    `SELECT campaign_id, campaign_name FROM vicidial_campaigns
     WHERE drop_inbound_group = ? OR amd_inbound_group = ?
     ORDER BY campaign_id ASC LIMIT 200`,
    [id, id],
    [],
  );
  const campaignsAllowing = await rows(
    `SELECT campaign_id, campaign_name FROM vicidial_campaigns
     WHERE closer_campaigns LIKE ?
     ORDER BY campaign_id ASC LIMIT 200`,
    [`% ${id} %`],
    [],
  );
  const [liveAgents] = await rows(
    'SELECT COUNT(*) AS live FROM vicidial_live_inbound_agents WHERE group_id = ?',
    [id],
    [{ live: 0 }],
  );

  return res.json({
    ok: true,
    agents,
    dids,
    callMenus,
    campaignsUsing,
    campaignsAllowing,
    liveAgents: Number(liveAgents?.live || 0),
  });
}

// Inverse of saveUserRanks: set rank/grade/daily-limit for the agents of one
// in-group, as on the legacy in-group modify AGENT RANKS grid.
async function saveInboundGroupAgentRanks(req, res) {
  if (!requireModify(req, res, 'modifyIngroups')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_group_id');
  if (!scopeAllows(req.genxUser?.permissions?.allowedQueueGroups, id)) {
    return res.status(403).json({ ok: false, error: 'ingroup_not_allowed' });
  }
  const agents = Array.isArray(req.body?.agents) ? req.body.agents.slice(0, 500) : [];
  try {
    for (const entry of agents) {
      const agentUser = cleanId(entry.user, 20);
      if (!agentUser) continue;
      const rank = cleanInt(entry.group_rank, 0, -9, 9);
      const grade = cleanInt(entry.group_grade, 1, 1, 10);
      const dailyLimit = cleanInt(entry.daily_limit, -1, -1, 99999);
      await execute(
        'UPDATE vicidial_inbound_group_agents SET group_rank = ?, group_grade = ?, daily_limit = ? WHERE user = ? AND group_id = ?',
        [rank, grade, dailyLimit, agentUser, id],
      );
      await execute(
        'UPDATE vicidial_live_inbound_agents SET group_weight = ?, group_grade = ? WHERE user = ? AND group_id = ?',
        [rank, grade, agentUser, id],
      ).catch(() => {});
    }
    await adminLog(req, 'INGROUPS', 'MODIFY', id, 'GENX MODIFY INGROUP AGENT RANKS', 'UPDATE vicidial_inbound_group_agents', `${agents.length} agents`);
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'ingroup_ranks_save_failed' });
  }
}

// Cross-references from legacy script modify (ADD=3111111): campaigns,
// in-groups, list overrides and user-group overrides using the script.
async function scriptConnections(req, res) {
  if (!requireModify(req, res, 'modifyScripts')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_script_id');

  const campaigns = await rows(
    `SELECT campaign_id, campaign_name FROM vicidial_campaigns
     WHERE campaign_script = ? OR campaign_script_two = ?
     ORDER BY campaign_id ASC LIMIT 200`,
    [id, id],
    [],
  );
  const ingroups = await rows(
    `SELECT group_id, group_name FROM vicidial_inbound_groups
     WHERE ingroup_script = ? OR ingroup_script_two = ?
     ORDER BY group_id ASC LIMIT 200`,
    [id, id],
    [],
  );
  const lists = await rows(
    `SELECT list_id, list_name FROM vicidial_lists
     WHERE agent_script_override = ? OR inbound_list_script_override = ?
     ORDER BY list_id ASC LIMIT 200`,
    [id, id],
    [],
  );
  const userGroups = await rows(
    'SELECT user_group, group_name FROM vicidial_user_groups WHERE script_id = ? ORDER BY user_group ASC LIMIT 200',
    [id],
    [],
  );

  return res.json({ ok: true, campaigns, ingroups, lists, userGroups });
}

// Legacy ADD=6111111: delete the script record.
async function deleteScript(req, res) {
  if (!requireModify(req, res, 'deleteScripts')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_script_id');
  try {
    const result = await execute('DELETE FROM vicidial_scripts WHERE script_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'script_not_found' });
    await adminLog(req, 'SCRIPTS', 'DELETE', id, 'GENX DELETE SCRIPT', 'DELETE FROM vicidial_scripts', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'script_delete_failed' });
  }
}

// Cross-references from legacy filter modify (ADD=31111111): campaigns and
// users using the lead filter.
async function leadFilterConnections(req, res) {
  if (!requireModify(req, res, 'modifyFilters')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_filter_id');
  const campaigns = await rows(
    'SELECT campaign_id, campaign_name FROM vicidial_campaigns WHERE lead_filter_id = ? ORDER BY campaign_id ASC LIMIT 200',
    [id],
    [],
  );
  const users = await rows(
    'SELECT user, full_name FROM vicidial_users WHERE lead_filter_id = ? ORDER BY user ASC LIMIT 200',
    [id],
    [],
  );
  return res.json({ ok: true, campaigns, users });
}

// Legacy ADD=61111111: delete the lead filter.
async function deleteLeadFilter(req, res) {
  if (!requireModify(req, res, 'deleteFilters')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_filter_id');
  try {
    const result = await execute('DELETE FROM vicidial_lead_filters WHERE lead_filter_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'filter_not_found' });
    await adminLog(req, 'FILTERS', 'DELETE', id, 'GENX DELETE LEAD FILTER', 'DELETE FROM vicidial_lead_filters', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'filter_delete_failed' });
  }
}

// Users belonging to a user group, from legacy user-group modify (ADD=311111).
async function userGroupConnections(req, res) {
  if (!requireModify(req, res, 'modifyUsergroups')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_user_group');
  const users = await rows(
    `SELECT user, full_name, user_level, active FROM vicidial_users
     WHERE user_group = ? ORDER BY user ASC LIMIT 500`,
    [id],
    [],
  );
  return res.json({ ok: true, users });
}

// Legacy ADD=611111: delete the user group (own group blocked).
async function deleteUserGroup(req, res) {
  if (!requireModify(req, res, 'deleteUserGroups')) return;
  const id = cleanId(req.params.id, 20);
  if (!id || id.length < 2) return badRequest(res, 'invalid_user_group');
  if (id === req.genxUser.userGroup) return res.status(403).json({ ok: false, error: 'cannot_delete_own_group' });
  if (!scopeAllows(req.genxUser?.permissions?.adminViewableGroups, id)) {
    return res.status(403).json({ ok: false, error: 'group_not_allowed' });
  }
  try {
    const result = await execute('DELETE FROM vicidial_user_groups WHERE user_group = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'group_not_found' });
    await adminLog(req, 'USERGROUPS', 'DELETE', id, 'GENX DELETE USER GROUP', 'DELETE FROM vicidial_user_groups', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'group_delete_failed' });
  }
}

// Legacy ADD=61111111111: delete a phone (composite key extension+server_ip),
// then flag conf-file rebuilds on its server and the voicemail server.
async function deletePhone(req, res) {
  if (!requireModify(req, res, 'astDeletePhones')) return;
  const extension = cleanId(req.params.id, 100);
  const serverIp = cleanIp(req.query?.server_ip);
  if (!extension || extension.length < 2 || !serverIp || serverIp.length < 7) {
    return badRequest(res, 'invalid_phone');
  }
  const [phone] = await rows(
    'SELECT extension, server_ip, user_group FROM phones WHERE extension = ? AND server_ip = ? LIMIT 1',
    [extension, serverIp],
    [],
  );
  if (!phone) return res.status(404).json({ ok: false, error: 'phone_not_found' });
  if (!scopeAllows(req.genxUser?.permissions?.adminViewableGroups, phone.user_group)) {
    return res.status(403).json({ ok: false, error: 'phone_not_allowed' });
  }
  try {
    await execute('DELETE FROM phones WHERE extension = ? AND server_ip = ? LIMIT 1', [extension, serverIp]);
    await execute(
      "UPDATE servers SET rebuild_conf_files = 'Y' WHERE generate_vicidial_conf = 'Y' AND active_asterisk_server = 'Y' AND server_ip = ?",
      [serverIp],
    ).catch(() => {});
    const [settings] = await rows('SELECT active_voicemail_server FROM system_settings LIMIT 1', [], []);
    if (settings?.active_voicemail_server) {
      await execute(
        "UPDATE servers SET rebuild_conf_files = 'Y' WHERE generate_vicidial_conf = 'Y' AND active_asterisk_server = 'Y' AND server_ip = ?",
        [settings.active_voicemail_server],
      ).catch(() => {});
    }
    await adminLog(req, 'PHONES', 'DELETE', extension, 'GENX DELETE PHONE', 'DELETE FROM phones + rebuild_conf_files', `${extension}@${serverIp}`);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'phone_delete_failed' });
  }
}

// Legacy ADD=611111111111: delete a server (composite server_id+server_ip),
// gated on ast_delete_phones AND modify_servers like legacy.
async function deleteServer(req, res) {
  const user = req.genxUser;
  const allowed = Number(user?.userLevel || 0) >= 9 || (user?.astDeletePhones && user?.modifyServers);
  if (!allowed) return res.status(403).json({ ok: false, error: 'permission_denied' });
  const serverId = cleanId(req.params.id, 20);
  const serverIp = cleanIp(req.query?.server_ip);
  if (!serverId || serverId.length < 2 || !serverIp || serverIp.length < 7) return badRequest(res, 'invalid_server');
  try {
    const result = await execute('DELETE FROM servers WHERE server_id = ? AND server_ip = ? LIMIT 1', [serverId, serverIp]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'server_not_found' });
    await adminLog(req, 'SERVERS', 'DELETE', serverId, 'GENX DELETE SERVER', 'DELETE FROM servers', `${serverId}@${serverIp}`);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'server_delete_failed' });
  }
}

// Legacy ADD=641111111111: delete a carrier and flag conf rebuilds on its
// server (or every dialer when the carrier is set to 0.0.0.0 / all servers).
async function deleteCarrier(req, res) {
  if (!requireModify(req, res, 'modifyCarriers')) return;
  const id = cleanId(req.params.id, 20);
  if (!id || id.length < 2) return badRequest(res, 'invalid_carrier_id');
  const [carrier] = await rows('SELECT carrier_id, server_ip FROM vicidial_server_carriers WHERE carrier_id = ? LIMIT 1', [id], []);
  if (!carrier) return res.status(404).json({ ok: false, error: 'carrier_not_found' });
  try {
    await execute('DELETE FROM vicidial_server_carriers WHERE carrier_id = ?', [id]);
    if (carrier.server_ip === '0.0.0.0') {
      await execute("UPDATE servers SET rebuild_conf_files = 'Y' WHERE generate_vicidial_conf = 'Y' AND active_asterisk_server = 'Y'").catch(() => {});
    } else {
      await execute(
        "UPDATE servers SET rebuild_conf_files = 'Y' WHERE generate_vicidial_conf = 'Y' AND active_asterisk_server = 'Y' AND server_ip = ?",
        [carrier.server_ip],
      ).catch(() => {});
    }
    await adminLog(req, 'CARRIERS', 'DELETE', id, 'GENX DELETE CARRIER', 'DELETE FROM vicidial_server_carriers + rebuild_conf_files', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'carrier_delete_failed' });
  }
}

// Cross-references from legacy DID modify (ADD=3311).
async function didConnections(req, res) {
  if (!requireModify(req, res, 'modifyInboundDids')) return;
  const id = cleanId(req.params.id, 10);
  if (!id) return badRequest(res, 'invalid_did_id');
  const [did] = await rows('SELECT did_id, did_pattern FROM vicidial_inbound_dids WHERE did_id = ? LIMIT 1', [id], []);
  if (!did) return res.status(404).json({ ok: false, error: 'did_not_found' });
  const pattern = did.did_pattern;

  const callMenus = await rows(
    `SELECT DISTINCT vm.menu_id, vm.menu_name
     FROM vicidial_call_menu vm
     JOIN vicidial_call_menu_options vmo ON vm.menu_id = vmo.menu_id
     WHERE vmo.option_route = 'DID' AND vmo.option_route_value = ? LIMIT 200`,
    [pattern],
    [],
  );
  const campaigns = await rows(
    'SELECT campaign_id, campaign_name FROM vicidial_campaigns WHERE campaign_cid = ? LIMIT 200',
    [pattern],
    [],
  );
  const acCids = await rows(
    `SELECT camp.campaign_id, camp.campaign_name
     FROM vicidial_campaign_cid_areacodes campac
     JOIN vicidial_campaigns camp ON camp.campaign_id = campac.campaign_id
     WHERE campac.outbound_cid = ? LIMIT 200`,
    [pattern],
    [],
  );
  const ingroups = await rows(
    'SELECT group_id, group_name FROM vicidial_inbound_groups WHERE dial_ingroup_cid = ? LIMIT 200',
    [pattern],
    [],
  );
  const lists = await rows(
    'SELECT list_id, list_name FROM vicidial_lists WHERE campaign_cid_override = ? LIMIT 200',
    [pattern],
    [],
  );

  return res.json({ ok: true, callMenus, campaigns, acCids, ingroups, lists });
}

// Cross-references from legacy call menu modify.
async function callMenuConnections(req, res) {
  if (!requireModify(req, res, 'modifyIngroups')) return;
  const id = cleanId(req.params.id, 50);
  if (!id) return badRequest(res, 'invalid_menu_id');

  const dids = await rows(
    "SELECT did_id, did_pattern, did_description FROM vicidial_inbound_dids WHERE menu_id = ? AND did_route = 'CALLMENU' LIMIT 200",
    [id],
    [],
  );
  const callMenus = await rows(
    `SELECT DISTINCT vm.menu_id, vm.menu_name
     FROM vicidial_call_menu vm
     JOIN vicidial_call_menu_options vmo ON vm.menu_id = vmo.menu_id
     WHERE vmo.option_route = 'CALLMENU' AND vmo.option_route_value = ? LIMIT 200`,
    [id],
    [],
  );
  const campaigns = await rows(
    `SELECT campaign_id, campaign_name FROM vicidial_campaigns
     WHERE safe_harbor_menu_id = ? OR survey_menu_id = ? OR amd_callmenu = ?
        OR (agent_hangup_route = 'CALLMENU' AND agent_hangup_value = ?) LIMIT 200`,
    [id, id, id, id],
    [],
  );
  const ingroups = await rows(
    `SELECT group_id, group_name FROM vicidial_inbound_groups
     WHERE hold_time_option_callmenu = ? OR wait_time_option_callmenu = ?
        OR drop_callmenu = ? OR after_hours_callmenu = ? LIMIT 200`,
    [id, id, id, id],
    [],
  );

  return res.json({ ok: true, dids, callMenus, campaigns, ingroups });
}

function remoteAgentPayload(body) {
  return {
    user_start: cleanId(body.user_start, 20),
    number_of_lines: cleanInt(body.number_of_lines, 1, 1, 250),
    server_ip: cleanIp(body.server_ip),
    conf_exten: codeText(body.conf_exten, 20),
    status: cleanChoice(body.status, ['ACTIVE', 'INACTIVE'], 'INACTIVE'),
    campaign_id: cleanId(body.campaign_id, 8),
    closer_campaigns: cleanText(body.closer_campaigns, 2000),
    extension_group: cleanId(body.extension_group, 20) || 'NONE',
    extension_group_order: cleanChoice(body.extension_group_order, ['NONE', 'RANDOM', 'UP_COUNT', 'DOWN_COUNT', 'UP_EXTEN', 'DOWN_EXTEN'], 'NONE'),
    on_hook_agent: ynFlag(body.on_hook_agent, 'N'),
    on_hook_ring_time: cleanInt(body.on_hook_ring_time, 15, 1, 999),
  };
}

async function saveRemoteAgent(req, res, mode) {
  if (!requireModify(req, res, 'modifyRemoteagents')) return;
  const payload = remoteAgentPayload(req.body || {});
  if (!payload.user_start || !payload.server_ip || !payload.conf_exten || !payload.campaign_id) {
    return badRequest(res, 'missing_required_fields');
  }
  if (!scopeAllows(req.genxUser?.permissions?.allowedCampaigns, payload.campaign_id)) {
    return res.status(403).json({ ok: false, error: 'campaign_not_allowed' });
  }
  const { assignments, values } = dynamicAssignments(payload);
  try {
    if (mode === 'create') {
      const result = await execute(`INSERT INTO vicidial_remote_agents SET ${assignments}`, values);
      await adminLog(req, 'REMOTEAGENTS', 'ADD', String(result.insertId), 'GENX ADD REMOTE AGENT', 'INSERT INTO vicidial_remote_agents', payload.user_start);
    } else {
      const id = cleanInt(req.params.id, 0, 1, 999999999);
      if (!id) return badRequest(res, 'invalid_remote_agent_id');
      const result = await execute(`UPDATE vicidial_remote_agents SET ${assignments} WHERE remote_agent_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'remote_agent_not_found' });
      await adminLog(req, 'REMOTEAGENTS', 'MODIFY', String(id), 'GENX MODIFY REMOTE AGENT', 'UPDATE vicidial_remote_agents', payload.user_start);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'remote_agent_save_failed' });
  }
}

// Legacy ADD=61111: delete the remote agent row.
async function deleteRemoteAgent(req, res) {
  if (!requireModify(req, res, 'deleteRemoteAgents')) return;
  const id = cleanInt(req.params.id, 0, 1, 999999999);
  if (!id) return badRequest(res, 'invalid_remote_agent_id');
  try {
    const result = await execute('DELETE FROM vicidial_remote_agents WHERE remote_agent_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'remote_agent_not_found' });
    await adminLog(req, 'REMOTEAGENTS', 'DELETE', String(id), 'GENX DELETE REMOTE AGENT', 'DELETE FROM vicidial_remote_agents', String(id));
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'remote_agent_delete_failed' });
  }
}

function dropListPayload(body) {
  return {
    dl_name: cleanText(body.dl_name, 100) || 'New Drop List',
    dl_server: cleanText(body.dl_server, 30) || 'active_voicemail_server',
    dl_times: cleanText(body.dl_times, 120),
    dl_weekdays: cleanText(body.dl_weekdays, 7).replace(/[^0-6]/g, ''),
    dl_monthdays: cleanText(body.dl_monthdays, 100).replace(/[^-0-9,]/g, ''),
    drop_statuses: dialStatusesText(parseDialStatuses(body.drop_statuses)),
    list_id: cleanInt(body.list_id, 0, 0, 99999999999999),
    duplicate_check: cleanChoice(body.duplicate_check, ['NONE', 'DAY', 'WEEK', 'MONTH', '30DAY', '60DAY', '90DAY', '180DAY', '360DAY', 'EVER'], 'NONE'),
    run_now_trigger: ynFlag(body.run_now_trigger, 'N'),
    active: ynFlag(body.active, 'N'),
    user_group: cleanId(body.user_group, 20) || '---ALL---',
    closer_campaigns: cleanText(body.closer_campaigns, 2000),
    dl_minutes: cleanInt(body.dl_minutes, 0, 0, 999999),
  };
}

async function saveDropList(req, res, mode) {
  if (!requireModify(req, res, 'modifyLists')) return;
  const payload = dropListPayload(req.body || {});
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.dl_id, 30);
      if (!id || id.length < 2) return badRequest(res, 'invalid_dl_id');
      const { assignments, values } = dynamicAssignments({ dl_id: id, ...payload });
      await execute(`INSERT INTO vicidial_drop_lists SET ${assignments}`, values);
      await adminLog(req, 'LISTS', 'ADD', id, 'GENX ADD DROP LIST', 'INSERT INTO vicidial_drop_lists', payload.dl_name);
    } else {
      const id = cleanId(req.params.id, 30);
      if (!id) return badRequest(res, 'invalid_dl_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_drop_lists SET ${assignments} WHERE dl_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'drop_list_not_found' });
      await adminLog(req, 'LISTS', 'MODIFY', id, 'GENX MODIFY DROP LIST', 'UPDATE vicidial_drop_lists', payload.dl_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'drop_list_save_failed' });
  }
}

// Legacy ADD=631: delete the drop list record.
async function deleteDropList(req, res) {
  if (!requireModify(req, res, 'deleteLists')) return;
  const id = cleanId(req.params.id, 30);
  if (!id) return badRequest(res, 'invalid_dl_id');
  try {
    const result = await execute('DELETE FROM vicidial_drop_lists WHERE dl_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'drop_list_not_found' });
    await adminLog(req, 'LISTS', 'DELETE', id, 'GENX DELETE DROP LIST', 'DELETE FROM vicidial_drop_lists', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'drop_list_delete_failed' });
  }
}

async function savePhoneAlias(req, res, mode) {
  if (!requireModify(req, res, 'modifyPhones')) return;
  const payload = {
    alias_name: cleanText(req.body?.alias_name, 50) || 'New Phone Alias',
    logins_list: cleanText(req.body?.logins_list, 255).replace(/[^-_,0-9a-zA-Z]/g, ''),
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
  };
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.alias_id, 20);
      if (!id || id.length < 2) return badRequest(res, 'invalid_alias_id');
      const { assignments, values } = dynamicAssignments({ alias_id: id, ...payload });
      await execute(`INSERT INTO phones_alias SET ${assignments}`, values);
      await adminLog(req, 'PHONEALIASES', 'ADD', id, 'GENX ADD PHONE ALIAS', 'INSERT INTO phones_alias', payload.alias_name);
    } else {
      const id = cleanId(req.params.id, 20);
      if (!id) return badRequest(res, 'invalid_alias_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE phones_alias SET ${assignments} WHERE alias_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'alias_not_found' });
      await adminLog(req, 'PHONEALIASES', 'MODIFY', id, 'GENX MODIFY PHONE ALIAS', 'UPDATE phones_alias', payload.alias_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'phone_alias_save_failed' });
  }
}

// Legacy ADD=62111111111: delete phone alias, gated ast_delete_phones.
async function deletePhoneAlias(req, res) {
  if (!requireModify(req, res, 'astDeletePhones')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_alias_id');
  try {
    const result = await execute('DELETE FROM phones_alias WHERE alias_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'alias_not_found' });
    await adminLog(req, 'PHONEALIASES', 'DELETE', id, 'GENX DELETE PHONE ALIAS', 'DELETE FROM phones_alias', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'phone_alias_delete_failed' });
  }
}

async function saveGroupAlias(req, res, mode) {
  if (!requireModify(req, res, 'modifyPhones')) return;
  const payload = {
    group_alias_name: cleanText(req.body?.group_alias_name, 50) || 'New Group Alias',
    caller_id_number: cleanDigits(req.body?.caller_id_number, 20),
    caller_id_name: cleanText(req.body?.caller_id_name, 20),
    active: ynFlag(req.body?.active, 'N'),
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
  };
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.group_alias_id, 30);
      if (!id || id.length < 2) return badRequest(res, 'invalid_group_alias_id');
      const { assignments, values } = dynamicAssignments({ group_alias_id: id, ...payload });
      await execute(`INSERT INTO groups_alias SET ${assignments}`, values);
      await adminLog(req, 'GROUPALIASES', 'ADD', id, 'GENX ADD GROUP ALIAS', 'INSERT INTO groups_alias', payload.group_alias_name);
    } else {
      const id = cleanId(req.params.id, 30);
      if (!id) return badRequest(res, 'invalid_group_alias_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE groups_alias SET ${assignments} WHERE group_alias_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'group_alias_not_found' });
      await adminLog(req, 'GROUPALIASES', 'MODIFY', id, 'GENX MODIFY GROUP ALIAS', 'UPDATE groups_alias', payload.group_alias_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'group_alias_save_failed' });
  }
}

// Legacy ADD=63111111111: delete group alias.
async function deleteGroupAlias(req, res) {
  if (!requireModify(req, res, 'modifyPhones')) return;
  const id = cleanId(req.params.id, 30);
  if (!id) return badRequest(res, 'invalid_group_alias_id');
  try {
    const result = await execute('DELETE FROM groups_alias WHERE group_alias_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'group_alias_not_found' });
    await adminLog(req, 'GROUPALIASES', 'DELETE', id, 'GENX DELETE GROUP ALIAS', 'DELETE FROM groups_alias', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'group_alias_delete_failed' });
  }
}

function conferenceKey(raw) {
  const [confExten = '', serverIp = ''] = String(raw || '').split('__');
  return { conf_exten: cleanDigits(confExten, 7), server_ip: cleanIp(serverIp) };
}

// conferences (admin/monitoring) and vicidial_conferences (agent sessions)
// share the same composite key and legacy gating (ast_delete_phones for
// deletes, modify_servers for adds like legacy's conference pages).
async function saveConference(req, res, table, mode) {
  if (!requireModify(req, res, 'modifyServers')) return;
  const key = mode === 'create'
    ? { conf_exten: cleanDigits(req.body?.conf_exten, 7), server_ip: cleanIp(req.body?.server_ip) }
    : conferenceKey(req.params.id);
  if (!key.conf_exten || !key.server_ip) return badRequest(res, 'invalid_conference_key');
  const extension = cleanText(req.body?.extension, 100);
  const section = table === 'conferences' ? 'CONFERENCES' : 'AGENT CONFERENCES';
  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO ${quoteId(table)} (conf_exten, server_ip, extension) VALUES (?, ?, ?)`,
        [key.conf_exten, key.server_ip, extension],
      );
      await adminLog(req, 'SERVERS', 'ADD', key.conf_exten, `GENX ADD ${section}`, `INSERT INTO ${table}`, `${key.conf_exten}@${key.server_ip}`);
    } else {
      const result = await execute(
        `UPDATE ${quoteId(table)} SET extension = ? WHERE conf_exten = ? AND server_ip = ? LIMIT 1`,
        [extension, key.conf_exten, key.server_ip],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'conference_not_found' });
      await adminLog(req, 'SERVERS', 'MODIFY', key.conf_exten, `GENX MODIFY ${section}`, `UPDATE ${table}`, `${key.conf_exten}@${key.server_ip}`);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'conference_save_failed' });
  }
}

async function deleteConference(req, res, table) {
  if (!requireModify(req, res, 'astDeletePhones')) return;
  const key = conferenceKey(req.params.id);
  if (!key.conf_exten || !key.server_ip) return badRequest(res, 'invalid_conference_key');
  try {
    const result = await execute(
      `DELETE FROM ${quoteId(table)} WHERE conf_exten = ? AND server_ip = ? LIMIT 1`,
      [key.conf_exten, key.server_ip],
    );
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'conference_not_found' });
    await adminLog(req, 'SERVERS', 'DELETE', key.conf_exten, `GENX DELETE ${table === 'conferences' ? 'CONFERENCE' : 'AGENT CONFERENCE'}`, `DELETE FROM ${table}`, `${key.conf_exten}@${key.server_ip}`);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'conference_delete_failed' });
  }
}

async function saveIpList(req, res, mode) {
  if (!requireModify(req, res, 'modifyIpLists')) return;
  const payload = {
    ip_list_name: cleanText(req.body?.ip_list_name, 100) || 'New IP List',
    active: ynFlag(req.body?.active, 'N'),
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
  };
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.ip_list_id, 30);
      if (!id || id.length < 2) return badRequest(res, 'invalid_ip_list_id');
      const { assignments, values } = dynamicAssignments({ ip_list_id: id, ...payload });
      await execute(`INSERT INTO vicidial_ip_lists SET ${assignments}`, values);
      await adminLog(req, 'IPLISTS', 'ADD', id, 'GENX ADD IP LIST', 'INSERT INTO vicidial_ip_lists', payload.ip_list_name);
    } else {
      const id = cleanId(req.params.id, 30);
      if (!id) return badRequest(res, 'invalid_ip_list_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_ip_lists SET ${assignments} WHERE ip_list_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'ip_list_not_found' });
      await adminLog(req, 'IPLISTS', 'MODIFY', id, 'GENX MODIFY IP LIST', 'UPDATE vicidial_ip_lists', payload.ip_list_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'ip_list_save_failed' });
  }
}

async function deleteIpList(req, res) {
  if (!requireModify(req, res, 'modifyIpLists')) return;
  const id = cleanId(req.params.id, 30);
  if (!id) return badRequest(res, 'invalid_ip_list_id');
  try {
    const result = await execute('DELETE FROM vicidial_ip_lists WHERE ip_list_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'ip_list_not_found' });
    await execute('DELETE FROM vicidial_ip_list_entries WHERE ip_list_id = ?', [id]).catch(() => {});
    await adminLog(req, 'IPLISTS', 'DELETE', id, 'GENX DELETE IP LIST', 'DELETE FROM vicidial_ip_lists + entries', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'ip_list_delete_failed' });
  }
}

async function saveCidGroup(req, res, mode) {
  if (!requireModify(req, res, 'modifyCampaigns')) return;
  const payload = {
    cid_group_notes: cleanText(req.body?.cid_group_notes, 255),
    cid_group_type: cleanChoice(req.body?.cid_group_type, ['AREACODE', 'STATE', 'NONE'], 'AREACODE'),
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
    cid_auto_rotate_minutes: cleanInt(req.body?.cid_auto_rotate_minutes, 0, 0, 9999999),
    cid_auto_rotate_minimum: cleanInt(req.body?.cid_auto_rotate_minimum, 0, 0, 9999999),
    cid_auto_rotate_calls: cleanInt(req.body?.cid_auto_rotate_calls, 0, 0, 9999999),
  };
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.cid_group_id, 20);
      if (!id || id.length < 2) return badRequest(res, 'invalid_cid_group_id');
      const { assignments, values } = dynamicAssignments({ cid_group_id: id, ...payload });
      await execute(`INSERT INTO vicidial_cid_groups SET ${assignments}`, values);
      await adminLog(req, 'CIDGROUPS', 'ADD', id, 'GENX ADD CID GROUP', 'INSERT INTO vicidial_cid_groups', payload.cid_group_notes);
    } else {
      const id = cleanId(req.params.id, 20);
      if (!id) return badRequest(res, 'invalid_cid_group_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_cid_groups SET ${assignments} WHERE cid_group_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'cid_group_not_found' });
      await adminLog(req, 'CIDGROUPS', 'MODIFY', id, 'GENX MODIFY CID GROUP', 'UPDATE vicidial_cid_groups', payload.cid_group_notes);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'cid_group_save_failed' });
  }
}

async function deleteCidGroup(req, res) {
  if (!requireModify(req, res, 'modifyCampaigns')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_cid_group_id');
  try {
    const result = await execute('DELETE FROM vicidial_cid_groups WHERE cid_group_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'cid_group_not_found' });
    await adminLog(req, 'CIDGROUPS', 'DELETE', id, 'GENX DELETE CID GROUP', 'DELETE FROM vicidial_cid_groups', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'cid_group_delete_failed' });
  }
}

async function saveQueueGroup(req, res, mode) {
  if (!requireModify(req, res, 'modifyIngroups')) return;
  const payload = {
    queue_group_name: cleanText(req.body?.queue_group_name, 40) || 'New Queue Group',
    included_campaigns: cleanText(req.body?.included_campaigns, 2000),
    included_inbound_groups: cleanText(req.body?.included_inbound_groups, 2000),
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
    active: ynFlag(req.body?.active, 'N'),
  };
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.queue_group, 20);
      if (!id || id.length < 2) return badRequest(res, 'invalid_queue_group');
      const { assignments, values } = dynamicAssignments({ queue_group: id, ...payload });
      await execute(`INSERT INTO vicidial_queue_groups SET ${assignments}`, values);
      await adminLog(req, 'QUEUEGROUPS', 'ADD', id, 'GENX ADD QUEUE GROUP', 'INSERT INTO vicidial_queue_groups', payload.queue_group_name);
    } else {
      const id = cleanId(req.params.id, 20);
      if (!id) return badRequest(res, 'invalid_queue_group');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_queue_groups SET ${assignments} WHERE queue_group = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'queue_group_not_found' });
      await adminLog(req, 'QUEUEGROUPS', 'MODIFY', id, 'GENX MODIFY QUEUE GROUP', 'UPDATE vicidial_queue_groups', payload.queue_group_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'queue_group_save_failed' });
  }
}

async function deleteQueueGroup(req, res) {
  if (!requireModify(req, res, 'modifyIngroups')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_queue_group');
  try {
    const result = await execute('DELETE FROM vicidial_queue_groups WHERE queue_group = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'queue_group_not_found' });
    await adminLog(req, 'QUEUEGROUPS', 'DELETE', id, 'GENX DELETE QUEUE GROUP', 'DELETE FROM vicidial_queue_groups', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'queue_group_delete_failed' });
  }
}

function contactPayload(body) {
  return {
    first_name: cleanText(body.first_name, 50),
    last_name: cleanText(body.last_name, 50),
    office_num: cleanDigits(body.office_num, 20),
    cell_num: cleanDigits(body.cell_num, 20),
    other_num1: cleanDigits(body.other_num1, 20),
    other_num2: cleanDigits(body.other_num2, 20),
    bu_name: cleanText(body.bu_name, 100),
    department: cleanText(body.department, 100),
    group_name: cleanText(body.group_name, 100),
    job_title: cleanText(body.job_title, 100),
    location: cleanText(body.location, 100),
  };
}

async function saveContact(req, res, mode) {
  if (!requireModify(req, res, 'modifyContacts')) return;
  const payload = contactPayload(req.body || {});
  if (!payload.first_name && !payload.last_name) return badRequest(res, 'missing_name');
  try {
    const { assignments, values } = dynamicAssignments(payload);
    if (mode === 'create') {
      const result = await execute(`INSERT INTO contact_information SET ${assignments}`, values);
      await adminLog(req, 'CONTACTS', 'ADD', String(result.insertId), 'GENX ADD CONTACT', 'INSERT INTO contact_information', `${payload.first_name} ${payload.last_name}`);
    } else {
      const id = cleanInt(req.params.id, 0, 1, 999999999);
      if (!id) return badRequest(res, 'invalid_contact_id');
      const result = await execute(`UPDATE contact_information SET ${assignments} WHERE contact_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'contact_not_found' });
      await adminLog(req, 'CONTACTS', 'MODIFY', String(id), 'GENX MODIFY CONTACT', 'UPDATE contact_information', `${payload.first_name} ${payload.last_name}`);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'contact_save_failed' });
  }
}

async function deleteContact(req, res) {
  if (!requireModify(req, res, 'modifyContacts')) return;
  const id = cleanInt(req.params.id, 0, 1, 999999999);
  if (!id) return badRequest(res, 'invalid_contact_id');
  try {
    const result = await execute('DELETE FROM contact_information WHERE contact_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'contact_not_found' });
    await adminLog(req, 'CONTACTS', 'DELETE', String(id), 'GENX DELETE CONTACT', 'DELETE FROM contact_information', String(id));
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'contact_delete_failed' });
  }
}

async function saveLanguage(req, res, mode) {
  if (!requireModify(req, res, 'modifyLanguages')) return;
  const payload = {
    language_code: cleanId(req.body?.language_code, 20),
    language_description: cleanText(req.body?.language_description, 255),
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
    active: ynFlag(req.body?.active, 'N'),
  };
  try {
    if (mode === 'create') {
      const id = cleanText(req.body?.language_id, 100).replace(/[^-_ 0-9a-zA-Z]/g, '');
      if (!id || id.length < 2) return badRequest(res, 'invalid_language_id');
      const { assignments, values } = dynamicAssignments({ language_id: id, ...payload });
      await execute(`INSERT INTO vicidial_languages SET ${assignments}`, values);
      await adminLog(req, 'LANGUAGES', 'ADD', id, 'GENX ADD LANGUAGE', 'INSERT INTO vicidial_languages', payload.language_description);
    } else {
      const id = cleanText(req.params.id, 100).replace(/[^-_ 0-9a-zA-Z]/g, '');
      if (!id) return badRequest(res, 'invalid_language_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_languages SET ${assignments} WHERE language_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'language_not_found' });
      await adminLog(req, 'LANGUAGES', 'MODIFY', id, 'GENX MODIFY LANGUAGE', 'UPDATE vicidial_languages', payload.language_description);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'language_save_failed' });
  }
}

async function deleteLanguage(req, res) {
  if (!requireModify(req, res, 'modifyLanguages')) return;
  const id = cleanText(req.params.id, 100).replace(/[^-_ 0-9a-zA-Z]/g, '');
  if (!id) return badRequest(res, 'invalid_language_id');
  try {
    const result = await execute('DELETE FROM vicidial_languages WHERE language_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'language_not_found' });
    await adminLog(req, 'LANGUAGES', 'DELETE', id, 'GENX DELETE LANGUAGE', 'DELETE FROM vicidial_languages', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'language_delete_failed' });
  }
}

async function saveVoicemailBox(req, res, mode) {
  if (!requireModify(req, res, 'modifyVoicemail')) return;
  const payload = {
    active: ynFlag(req.body?.active, 'Y'),
    pass: cleanText(req.body?.pass, 10).replace(/[^0-9a-zA-Z]/g, ''),
    fullname: cleanText(req.body?.fullname, 100),
    email: cleanText(req.body?.email, 100),
    delete_vm_after_email: ynFlag(req.body?.delete_vm_after_email, 'N'),
    voicemail_timezone: cleanText(req.body?.voicemail_timezone, 30) || 'eastern',
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
    on_login_report: ynFlag(req.body?.on_login_report, 'N'),
  };
  if (mode !== 'create' || payload.pass) {
    if (!payload.pass && mode === 'create') return badRequest(res, 'missing_pass');
  }
  if (mode !== 'create' && !payload.pass) delete payload.pass;
  try {
    if (mode === 'create') {
      const id = cleanDigits(req.body?.voicemail_id, 10);
      if (!id || id.length < 2) return badRequest(res, 'invalid_voicemail_id');
      const { assignments, values } = dynamicAssignments({ voicemail_id: id, ...payload });
      await execute(`INSERT INTO vicidial_voicemail SET ${assignments}`, values);
      await adminLog(req, 'VOICEMAIL', 'ADD', id, 'GENX ADD VOICEMAIL BOX', 'INSERT INTO vicidial_voicemail', payload.fullname);
      await execute("UPDATE servers SET rebuild_conf_files = 'Y' WHERE generate_vicidial_conf = 'Y' AND active_asterisk_server = 'Y'").catch(() => {});
    } else {
      const id = cleanDigits(req.params.id, 10);
      if (!id) return badRequest(res, 'invalid_voicemail_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_voicemail SET ${assignments} WHERE voicemail_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'voicemail_not_found' });
      await adminLog(req, 'VOICEMAIL', 'MODIFY', id, 'GENX MODIFY VOICEMAIL BOX', 'UPDATE vicidial_voicemail', payload.fullname);
      await execute("UPDATE servers SET rebuild_conf_files = 'Y' WHERE generate_vicidial_conf = 'Y' AND active_asterisk_server = 'Y'").catch(() => {});
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'voicemail_save_failed' });
  }
}

async function deleteVoicemailBox(req, res) {
  if (!requireModify(req, res, 'modifyVoicemail')) return;
  const id = cleanDigits(req.params.id, 10);
  if (!id) return badRequest(res, 'invalid_voicemail_id');
  try {
    const result = await execute('DELETE FROM vicidial_voicemail WHERE voicemail_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'voicemail_not_found' });
    await execute("UPDATE servers SET rebuild_conf_files = 'Y' WHERE generate_vicidial_conf = 'Y' AND active_asterisk_server = 'Y'").catch(() => {});
    await adminLog(req, 'VOICEMAIL', 'DELETE', id, 'GENX DELETE VOICEMAIL BOX', 'DELETE FROM vicidial_voicemail', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'voicemail_delete_failed' });
  }
}

async function saveVmMessageGroup(req, res, mode) {
  if (!requireModify(req, res, 'modifyVoicemail')) return;
  const payload = {
    leave_vm_message_group_notes: cleanText(req.body?.leave_vm_message_group_notes, 255),
    active: ynFlag(req.body?.active, 'N'),
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
  };
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.leave_vm_message_group_id, 40);
      if (!id || id.length < 2) return badRequest(res, 'invalid_vm_group_id');
      const { assignments, values } = dynamicAssignments({ leave_vm_message_group_id: id, ...payload });
      await execute(`INSERT INTO leave_vm_message_groups SET ${assignments}`, values);
      await adminLog(req, 'VOICEMAIL', 'ADD', id, 'GENX ADD VM MESSAGE GROUP', 'INSERT INTO leave_vm_message_groups', payload.leave_vm_message_group_notes);
    } else {
      const id = cleanId(req.params.id, 40);
      if (!id) return badRequest(res, 'invalid_vm_group_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE leave_vm_message_groups SET ${assignments} WHERE leave_vm_message_group_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'vm_group_not_found' });
      await adminLog(req, 'VOICEMAIL', 'MODIFY', id, 'GENX MODIFY VM MESSAGE GROUP', 'UPDATE leave_vm_message_groups', payload.leave_vm_message_group_notes);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'vm_group_save_failed' });
  }
}

async function deleteVmMessageGroup(req, res) {
  if (!requireModify(req, res, 'modifyVoicemail')) return;
  const id = cleanId(req.params.id, 40);
  if (!id) return badRequest(res, 'invalid_vm_group_id');
  try {
    const result = await execute('DELETE FROM leave_vm_message_groups WHERE leave_vm_message_group_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'vm_group_not_found' });
    await execute('DELETE FROM leave_vm_message_groups_entries WHERE leave_vm_message_group_id = ?', [id]).catch(() => {});
    await adminLog(req, 'VOICEMAIL', 'DELETE', id, 'GENX DELETE VM MESSAGE GROUP', 'DELETE FROM leave_vm_message_groups + entries', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'vm_group_delete_failed' });
  }
}

function automatedReportPayload(body) {
  return {
    report_name: cleanText(body.report_name, 100) || 'New Automated Report',
    report_server: cleanText(body.report_server, 30),
    report_times: cleanText(body.report_times, 255),
    report_weekdays: cleanText(body.report_weekdays, 7).replace(/[^0-6]/g, ''),
    report_monthdays: cleanText(body.report_monthdays, 100).replace(/[^-0-9,]/g, ''),
    report_destination: cleanChoice(body.report_destination, ['EMAIL', 'FTP'], 'EMAIL'),
    email_from: cleanText(body.email_from, 255),
    email_to: cleanText(body.email_to, 255),
    email_subject: cleanText(body.email_subject, 255),
    ftp_server: cleanText(body.ftp_server, 255),
    ftp_user: cleanText(body.ftp_user, 255),
    ftp_pass: cleanText(body.ftp_pass, 255),
    ftp_directory: cleanText(body.ftp_directory, 255),
    report_url: cleanText(body.report_url, 12000),
    run_now_trigger: ynFlag(body.run_now_trigger, 'N'),
    active: ynFlag(body.active, 'N'),
    user_group: cleanId(body.user_group, 20) || '---ALL---',
    filename_override: cleanText(body.filename_override, 255),
  };
}

async function saveAutomatedReport(req, res, mode) {
  if (!requireModify(req, res, 'modifyAutoReports')) return;
  const payload = automatedReportPayload(req.body || {});
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.report_id, 30);
      if (!id || id.length < 2) return badRequest(res, 'invalid_report_id');
      const { assignments, values } = dynamicAssignments({ report_id: id, ...payload });
      await execute(`INSERT INTO vicidial_automated_reports SET ${assignments}`, values);
      await adminLog(req, 'REPORTS', 'ADD', id, 'GENX ADD AUTOMATED REPORT', 'INSERT INTO vicidial_automated_reports', payload.report_name);
    } else {
      const id = cleanId(req.params.id, 30);
      if (!id) return badRequest(res, 'invalid_report_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_automated_reports SET ${assignments} WHERE report_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'report_not_found' });
      await adminLog(req, 'REPORTS', 'MODIFY', id, 'GENX MODIFY AUTOMATED REPORT', 'UPDATE vicidial_automated_reports', payload.report_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'automated_report_save_failed' });
  }
}

async function deleteAutomatedReport(req, res) {
  if (!requireModify(req, res, 'modifyAutoReports')) return;
  const id = cleanId(req.params.id, 30);
  if (!id) return badRequest(res, 'invalid_report_id');
  try {
    const result = await execute('DELETE FROM vicidial_automated_reports WHERE report_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'report_not_found' });
    await adminLog(req, 'REPORTS', 'DELETE', id, 'GENX DELETE AUTOMATED REPORT', 'DELETE FROM vicidial_automated_reports', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'automated_report_delete_failed' });
  }
}

// Generic save/delete for the simple single-key media entities. Audio file
// management (MOH files, soundboard audio) is a follow-up; this is metadata.
const SIMPLE_MEDIA_ENTITIES = {
  moh: {
    table: 'vicidial_music_on_hold',
    idColumn: 'moh_id',
    idMax: 100,
    permission: 'modifyMoh',
    section: 'MOH',
    payload: (body) => ({
      moh_name: cleanText(body.moh_name, 255) || 'New MOH Group',
      active: ynFlag(body.active, 'N'),
      random: ynFlag(body.random, 'N'),
      user_group: cleanId(body.user_group, 20) || '---ALL---',
    }),
  },
  tts: {
    table: 'vicidial_tts_prompts',
    idColumn: 'tts_id',
    idMax: 50,
    permission: 'modifyTts',
    section: 'TTS',
    payload: (body) => ({
      tts_name: cleanText(body.tts_name, 100) || 'New TTS Prompt',
      active: ynFlag(body.active, 'N'),
      tts_text: cleanText(body.tts_text, 12000),
      tts_voice: cleanText(body.tts_voice, 100),
      user_group: cleanId(body.user_group, 20) || '---ALL---',
    }),
  },
  soundboards: {
    table: 'vicidial_avatars',
    idColumn: 'avatar_id',
    idMax: 100,
    permission: 'modifyMoh',
    section: 'SOUNDBOARDS',
    payload: (body) => ({
      avatar_name: cleanText(body.avatar_name, 100) || 'New Soundboard',
      avatar_notes: cleanText(body.avatar_notes, 2000),
      active: ynFlag(body.active, 'N'),
      user_group: cleanId(body.user_group, 20) || '---ALL---',
      soundboard_layout: cleanText(body.soundboard_layout, 40),
      columns_limit: cleanInt(body.columns_limit, 0, 0, 99),
    }),
  },
};

async function saveSimpleMedia(req, res, kind, mode) {
  const spec = SIMPLE_MEDIA_ENTITIES[kind];
  if (!requireModify(req, res, spec.permission)) return;
  const payload = spec.payload(req.body || {});
  try {
    if (mode === 'create') {
      const id = cleanText(req.body?.[spec.idColumn], spec.idMax).replace(/[^-_ 0-9a-zA-Z]/g, '');
      if (!id || id.length < 2) return badRequest(res, 'invalid_id');
      const { assignments, values } = dynamicAssignments({ [spec.idColumn]: id, ...payload });
      await execute(`INSERT INTO ${quoteId(spec.table)} SET ${assignments}`, values);
      await adminLog(req, spec.section, 'ADD', id, `GENX ADD ${spec.section}`, `INSERT INTO ${spec.table}`, id);
    } else {
      const id = cleanText(req.params.id, spec.idMax).replace(/[^-_ 0-9a-zA-Z]/g, '');
      if (!id) return badRequest(res, 'invalid_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE ${quoteId(spec.table)} SET ${assignments} WHERE ${quoteId(spec.idColumn)} = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'not_found' });
      await adminLog(req, spec.section, 'MODIFY', id, `GENX MODIFY ${spec.section}`, `UPDATE ${spec.table}`, id);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'media_save_failed' });
  }
}

async function deleteSimpleMedia(req, res, kind) {
  const spec = SIMPLE_MEDIA_ENTITIES[kind];
  if (!requireModify(req, res, spec.permission)) return;
  const id = cleanText(req.params.id, spec.idMax).replace(/[^-_ 0-9a-zA-Z]/g, '');
  if (!id) return badRequest(res, 'invalid_id');
  try {
    const result = await execute(`DELETE FROM ${quoteId(spec.table)} WHERE ${quoteId(spec.idColumn)} = ? LIMIT 1`, [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'not_found' });
    if (kind === 'moh') {
      await execute('DELETE FROM vicidial_music_on_hold_files WHERE moh_id = ?', [id]).catch(() => {});
    }
    await adminLog(req, spec.section, 'DELETE', id, `GENX DELETE ${spec.section}`, `DELETE FROM ${spec.table}`, id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'media_delete_failed' });
  }
}

const HHMM_FIELDS_SCT = ['sct_default_start', 'sct_default_stop', 'sct_sunday_start', 'sct_sunday_stop',
  'sct_monday_start', 'sct_monday_stop', 'sct_tuesday_start', 'sct_tuesday_stop', 'sct_wednesday_start',
  'sct_wednesday_stop', 'sct_thursday_start', 'sct_thursday_stop', 'sct_friday_start', 'sct_friday_stop',
  'sct_saturday_start', 'sct_saturday_stop'];

async function saveStateCallTime(req, res, mode) {
  if (!requireModify(req, res, 'modifyCallTimes')) return;
  const payload = {
    state_call_time_state: cleanId(req.body?.state_call_time_state, 2).toUpperCase(),
    state_call_time_name: cleanText(req.body?.state_call_time_name, 30) || 'New State Call Time',
    state_call_time_comments: cleanText(req.body?.state_call_time_comments, 255),
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
  };
  for (const field of HHMM_FIELDS_SCT) {
    payload[field] = cleanInt(req.body?.[field], 0, 0, 2400);
  }
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.state_call_time_id, 10);
      if (!id || id.length < 2) return badRequest(res, 'invalid_state_call_time_id');
      const { assignments, values } = dynamicAssignments({ state_call_time_id: id, ...payload });
      await execute(`INSERT INTO vicidial_state_call_times SET ${assignments}`, values);
      await adminLog(req, 'CALLTIMES', 'ADD', id, 'GENX ADD STATE CALL TIME', 'INSERT INTO vicidial_state_call_times', payload.state_call_time_name);
    } else {
      const id = cleanId(req.params.id, 10);
      if (!id) return badRequest(res, 'invalid_state_call_time_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_state_call_times SET ${assignments} WHERE state_call_time_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'state_call_time_not_found' });
      await adminLog(req, 'CALLTIMES', 'MODIFY', id, 'GENX MODIFY STATE CALL TIME', 'UPDATE vicidial_state_call_times', payload.state_call_time_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'state_call_time_save_failed' });
  }
}

// Legacy ADD=5211111111 gate: delete_call_times.
async function deleteStateCallTime(req, res) {
  if (!requireModify(req, res, 'deleteCallTimes')) return;
  const id = cleanId(req.params.id, 10);
  if (!id) return badRequest(res, 'invalid_state_call_time_id');
  try {
    const result = await execute('DELETE FROM vicidial_state_call_times WHERE state_call_time_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'state_call_time_not_found' });
    await adminLog(req, 'CALLTIMES', 'DELETE', id, 'GENX DELETE STATE CALL TIME', 'DELETE FROM vicidial_state_call_times', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'state_call_time_delete_failed' });
  }
}

async function saveHoliday(req, res, mode) {
  if (!requireModify(req, res, 'modifyCallTimes')) return;
  const holidayDate = cleanText(req.body?.holiday_date, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(holidayDate)) return badRequest(res, 'invalid_holiday_date');
  const payload = {
    holiday_name: cleanText(req.body?.holiday_name, 100) || 'New Holiday',
    holiday_comments: cleanText(req.body?.holiday_comments, 255),
    holiday_date: holidayDate,
    holiday_status: cleanChoice(req.body?.holiday_status, ['ACTIVE', 'INACTIVE', 'EXPIRED'], 'INACTIVE'),
    ct_default_start: cleanInt(req.body?.ct_default_start, 0, 0, 2400),
    ct_default_stop: cleanInt(req.body?.ct_default_stop, 0, 0, 2400),
    holiday_method: cleanChoice(req.body?.holiday_method, ['REPLACE', 'REDUCE', 'ADDITIVE'], 'REPLACE'),
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
  };
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.holiday_id, 30);
      if (!id || id.length < 2) return badRequest(res, 'invalid_holiday_id');
      const { assignments, values } = dynamicAssignments({ holiday_id: id, ...payload });
      await execute(`INSERT INTO vicidial_call_time_holidays SET ${assignments}`, values);
      await adminLog(req, 'CALLTIMES', 'ADD', id, 'GENX ADD HOLIDAY', 'INSERT INTO vicidial_call_time_holidays', payload.holiday_name);
    } else {
      const id = cleanId(req.params.id, 30);
      if (!id) return badRequest(res, 'invalid_holiday_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_call_time_holidays SET ${assignments} WHERE holiday_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'holiday_not_found' });
      await adminLog(req, 'CALLTIMES', 'MODIFY', id, 'GENX MODIFY HOLIDAY', 'UPDATE vicidial_call_time_holidays', payload.holiday_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'holiday_save_failed' });
  }
}

async function deleteHoliday(req, res) {
  if (!requireModify(req, res, 'deleteCallTimes')) return;
  const id = cleanId(req.params.id, 30);
  if (!id) return badRequest(res, 'invalid_holiday_id');
  try {
    const result = await execute('DELETE FROM vicidial_call_time_holidays WHERE holiday_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'holiday_not_found' });
    await adminLog(req, 'CALLTIMES', 'DELETE', id, 'GENX DELETE HOLIDAY', 'DELETE FROM vicidial_call_time_holidays', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'holiday_delete_failed' });
  }
}

async function saveStatusGroup(req, res, mode) {
  if (!requireModify(req, res, 'modifyStatuses')) return;
  const payload = {
    status_group_notes: cleanText(req.body?.status_group_notes, 255),
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
  };
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.status_group_id, 20);
      if (!id || id.length < 2) return badRequest(res, 'invalid_status_group_id');
      const { assignments, values } = dynamicAssignments({ status_group_id: id, ...payload });
      await execute(`INSERT INTO vicidial_status_groups SET ${assignments}`, values);
      await adminLog(req, 'STATUSES', 'ADD', id, 'GENX ADD STATUS GROUP', 'INSERT INTO vicidial_status_groups', payload.status_group_notes);
    } else {
      const id = cleanId(req.params.id, 20);
      if (!id) return badRequest(res, 'invalid_status_group_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_status_groups SET ${assignments} WHERE status_group_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'status_group_not_found' });
      await adminLog(req, 'STATUSES', 'MODIFY', id, 'GENX MODIFY STATUS GROUP', 'UPDATE vicidial_status_groups', payload.status_group_notes);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'status_group_save_failed' });
  }
}

async function deleteStatusGroup(req, res) {
  if (!requireModify(req, res, 'modifyStatuses')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_status_group_id');
  try {
    const result = await execute('DELETE FROM vicidial_status_groups WHERE status_group_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'status_group_not_found' });
    await adminLog(req, 'STATUSES', 'DELETE', id, 'GENX DELETE STATUS GROUP', 'DELETE FROM vicidial_status_groups', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'status_group_delete_failed' });
  }
}

const SCREEN_LABEL_FIELDS = ['label_hide_field_logs', 'label_title', 'label_first_name', 'label_middle_initial',
  'label_last_name', 'label_address1', 'label_address2', 'label_address3', 'label_city', 'label_state',
  'label_province', 'label_postal_code', 'label_vendor_lead_code', 'label_gender', 'label_phone_number',
  'label_phone_code', 'label_alt_phone', 'label_security_phrase', 'label_email', 'label_comments',
  'label_lead_id', 'label_list_id', 'label_entry_date', 'label_gmt_offset_now', 'label_source_id',
  'label_called_since_last_reset', 'label_status', 'label_user', 'label_date_of_birth', 'label_country_code',
  'label_last_local_call_time', 'label_called_count', 'label_rank', 'label_owner', 'label_entry_list_id'];

const SCREEN_COLOR_FIELDS = ['menu_background', 'frame_background', 'std_row1_background', 'std_row2_background',
  'std_row3_background', 'std_row4_background', 'std_row5_background', 'alt_row1_background',
  'alt_row2_background', 'alt_row3_background', 'web_logo', 'button_color'];

async function saveScreenLabel(req, res, mode) {
  if (!requireModify(req, res, 'modifyLabels')) return;
  const payload = {
    label_name: cleanText(req.body?.label_name, 100) || 'New Screen Label Set',
    active: ynFlag(req.body?.active, 'N'),
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
  };
  for (const field of SCREEN_LABEL_FIELDS) {
    payload[field] = cleanText(req.body?.[field], 60);
  }
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.label_id, 20);
      if (!id || id.length < 2) return badRequest(res, 'invalid_label_id');
      const { assignments, values } = dynamicAssignments({ label_id: id, ...payload });
      await execute(`INSERT INTO vicidial_screen_labels SET ${assignments}`, values);
      await adminLog(req, 'LABELS', 'ADD', id, 'GENX ADD SCREEN LABELS', 'INSERT INTO vicidial_screen_labels', payload.label_name);
    } else {
      const id = cleanId(req.params.id, 20);
      if (!id) return badRequest(res, 'invalid_label_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_screen_labels SET ${assignments} WHERE label_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'label_not_found' });
      await adminLog(req, 'LABELS', 'MODIFY', id, 'GENX MODIFY SCREEN LABELS', 'UPDATE vicidial_screen_labels', payload.label_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'label_save_failed' });
  }
}

async function deleteScreenLabel(req, res) {
  if (!requireModify(req, res, 'modifyLabels')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_label_id');
  try {
    const result = await execute('DELETE FROM vicidial_screen_labels WHERE label_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'label_not_found' });
    await adminLog(req, 'LABELS', 'DELETE', id, 'GENX DELETE SCREEN LABELS', 'DELETE FROM vicidial_screen_labels', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'label_delete_failed' });
  }
}

async function saveScreenColor(req, res, mode) {
  if (!requireModify(req, res, 'modifyColors')) return;
  const payload = {
    colors_name: cleanText(req.body?.colors_name, 100) || 'New Color Scheme',
    active: ynFlag(req.body?.active, 'N'),
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
  };
  for (const field of SCREEN_COLOR_FIELDS) {
    payload[field] = field === 'web_logo'
      ? cleanText(req.body?.[field], 100)
      : cleanText(req.body?.[field], 6).replace(/[^0-9a-fA-F]/g, '');
  }
  try {
    if (mode === 'create') {
      const id = cleanId(req.body?.colors_id, 20);
      if (!id || id.length < 2) return badRequest(res, 'invalid_colors_id');
      const { assignments, values } = dynamicAssignments({ colors_id: id, ...payload });
      await execute(`INSERT INTO vicidial_screen_colors SET ${assignments}`, values);
      await adminLog(req, 'COLORS', 'ADD', id, 'GENX ADD SCREEN COLORS', 'INSERT INTO vicidial_screen_colors', payload.colors_name);
    } else {
      const id = cleanId(req.params.id, 20);
      if (!id) return badRequest(res, 'invalid_colors_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_screen_colors SET ${assignments} WHERE colors_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'colors_not_found' });
      await adminLog(req, 'COLORS', 'MODIFY', id, 'GENX MODIFY SCREEN COLORS', 'UPDATE vicidial_screen_colors', payload.colors_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'colors_save_failed' });
  }
}

async function deleteScreenColor(req, res) {
  if (!requireModify(req, res, 'modifyColors')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_colors_id');
  try {
    const result = await execute('DELETE FROM vicidial_screen_colors WHERE colors_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'colors_not_found' });
    await adminLog(req, 'COLORS', 'DELETE', id, 'GENX DELETE SCREEN COLORS', 'DELETE FROM vicidial_screen_colors', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'colors_delete_failed' });
  }
}

async function saveSettingsContainer(req, res, mode) {
  if (!requireModify(req, res, 'modifySettingsContainers')) return;
  const payload = {
    container_notes: cleanText(req.body?.container_notes, 255),
    container_type: cleanText(req.body?.container_type, 40) || 'OTHER',
    user_group: cleanId(req.body?.user_group, 20) || '---ALL---',
    container_entry: String(req.body?.container_entry ?? '').slice(0, 65000),
  };
  try {
    if (mode === 'create') {
      const id = cleanText(req.body?.container_id, 40).replace(/[^-_ 0-9a-zA-Z]/g, '');
      if (!id || id.length < 2) return badRequest(res, 'invalid_container_id');
      const { assignments, values } = dynamicAssignments({ container_id: id, ...payload });
      await execute(`INSERT INTO vicidial_settings_containers SET ${assignments}`, values);
      await adminLog(req, 'SETTINGS', 'ADD', id, 'GENX ADD SETTINGS CONTAINER', 'INSERT INTO vicidial_settings_containers', payload.container_type);
    } else {
      const id = cleanText(req.params.id, 40).replace(/[^-_ 0-9a-zA-Z]/g, '');
      if (!id) return badRequest(res, 'invalid_container_id');
      const { assignments, values } = dynamicAssignments(payload);
      const result = await execute(`UPDATE vicidial_settings_containers SET ${assignments} WHERE container_id = ?`, [...values, id]);
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'container_not_found' });
      await adminLog(req, 'SETTINGS', 'MODIFY', id, 'GENX MODIFY SETTINGS CONTAINER', 'UPDATE vicidial_settings_containers', payload.container_type);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'container_save_failed' });
  }
}

async function deleteSettingsContainer(req, res) {
  if (!requireModify(req, res, 'modifySettingsContainers')) return;
  const id = cleanText(req.params.id, 40).replace(/[^-_ 0-9a-zA-Z]/g, '');
  if (!id) return badRequest(res, 'invalid_container_id');
  try {
    const result = await execute('DELETE FROM vicidial_settings_containers WHERE container_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'container_not_found' });
    await adminLog(req, 'SETTINGS', 'DELETE', id, 'GENX DELETE SETTINGS CONTAINER', 'DELETE FROM vicidial_settings_containers', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'container_delete_failed' });
  }
}

// System Settings: single-row table, ~248 columns. Column list and types come
// from SHOW COLUMNS so the editor stays correct across Vicidial upgrades.
async function getSystemSettings(req, res) {
  if (Number(req.genxUser?.userLevel || 0) < 9) return res.status(403).json({ ok: false, error: 'permission_denied' });
  try {
    const columns = await rows('SHOW COLUMNS FROM system_settings', [], []);
    const [settings] = await rows('SELECT * FROM system_settings LIMIT 1', [], []);
    return res.json({
      ok: true,
      settings: settings || {},
      columns: columns.map((column) => ({ field: column.Field, type: column.Type })),
    });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'system_settings_load_failed' });
  }
}

async function saveSystemSettings(req, res) {
  if (Number(req.genxUser?.userLevel || 0) < 9) return res.status(403).json({ ok: false, error: 'permission_denied' });
  const changes = req.body?.changes;
  if (!changes || typeof changes !== 'object' || Array.isArray(changes)) return badRequest(res, 'invalid_changes');
  try {
    const columns = await rows('SHOW COLUMNS FROM system_settings', [], []);
    const allowed = new Map(columns.map((column) => [column.Field, String(column.Type)]));
    const payload = {};
    for (const [key, rawValue] of Object.entries(changes)) {
      const type = allowed.get(key);
      if (!type) continue;
      let value = String(rawValue ?? '');
      if (/int\(/.test(type) || /decimal|float|double/.test(type)) {
        value = value.replace(/[^-0-9.]/g, '') || '0';
      } else {
        value = value.slice(0, 60000);
      }
      payload[key] = value;
    }
    if (!Object.keys(payload).length) return badRequest(res, 'no_valid_changes');
    const { assignments, values } = dynamicAssignments(payload);
    await execute(`UPDATE system_settings SET ${assignments} LIMIT 1`, values);
    await adminLog(req, 'SYSTEM SETTINGS', 'MODIFY', 'system_settings', 'GENX MODIFY SYSTEM SETTINGS', 'UPDATE system_settings', Object.keys(payload).join(','));
    return res.json({ ok: true, updated: Object.keys(payload) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'system_settings_save_failed' });
  }
}

async function listWithScope(req, listId) {
  const [list] = await rows('SELECT list_id, campaign_id, list_name FROM vicidial_lists WHERE list_id = ? LIMIT 1', [listId], []);
  if (!list) return { error: 404 };
  if (!scopeAllows(req.genxUser?.permissions?.allowedCampaigns, list.campaign_id)) return { error: 403 };
  return { list };
}

// The five breakdowns at the bottom of legacy list modify (ADD=311):
// statuses, timezones, owners, ranks and called-counts within the list.
async function listStats(req, res) {
  if (!requireModify(req, res, 'modifyLists')) return;
  const id = cleanId(req.params.id, 30);
  if (!id) return badRequest(res, 'invalid_list_id');
  const scoped = await listWithScope(req, id);
  if (scoped.error) return res.status(scoped.error).json({ ok: false, error: 'list_not_available' });

  const statuses = await rows(
    `SELECT status, SUM(called_since_last_reset = 'Y') AS called, SUM(called_since_last_reset != 'Y') AS not_called, COUNT(*) AS total
     FROM vicidial_list WHERE list_id = ? GROUP BY status ORDER BY status ASC LIMIT 200`,
    [id],
    [],
  );
  const timezones = await rows(
    `SELECT gmt_offset_now, SUM(called_since_last_reset = 'Y') AS called, SUM(called_since_last_reset != 'Y') AS not_called
     FROM vicidial_list WHERE list_id = ? GROUP BY gmt_offset_now ORDER BY gmt_offset_now ASC LIMIT 60`,
    [id],
    [],
  );
  const owners = await rows(
    `SELECT owner, SUM(called_since_last_reset = 'Y') AS called, SUM(called_since_last_reset != 'Y') AS not_called
     FROM vicidial_list WHERE list_id = ? GROUP BY owner ORDER BY owner ASC LIMIT 200`,
    [id],
    [],
  );
  const ranks = await rows(
    `SELECT rank, SUM(called_since_last_reset = 'Y') AS called, SUM(called_since_last_reset != 'Y') AS not_called
     FROM vicidial_list WHERE list_id = ? GROUP BY rank ORDER BY rank DESC LIMIT 200`,
    [id],
    [],
  );
  const calledCounts = await rows(
    `SELECT status, called_count, COUNT(*) AS leads
     FROM vicidial_list WHERE list_id = ? GROUP BY status, called_count ORDER BY status ASC, called_count ASC LIMIT 500`,
    [id],
    [],
  );

  return res.json({ ok: true, statuses, timezones, owners, ranks, calledCounts });
}

// Legacy ADD=611: delete the list record, its hopper rows and all its leads.
async function deleteList(req, res) {
  if (!requireModify(req, res, 'deleteLists')) return;
  const id = cleanId(req.params.id, 30);
  if (!id || id.length < 2) return badRequest(res, 'invalid_list_id');
  const scoped = await listWithScope(req, id);
  if (scoped.error) return res.status(scoped.error).json({ ok: false, error: 'list_not_available' });
  try {
    await execute('DELETE FROM vicidial_lists WHERE list_id = ? LIMIT 1', [id]);
    await execute('DELETE FROM vicidial_hopper WHERE list_id = ?', [id]).catch(() => {});
    await execute('DELETE FROM vicidial_list WHERE list_id = ?', [id]);
    await adminLog(req, 'LISTS', 'DELETE', id, 'GENX DELETE LIST', 'DELETE FROM vicidial_lists/vicidial_hopper/vicidial_list', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'list_delete_failed' });
  }
}

// Legacy ADD=612: remove all leads from the list but keep the list record.
// Legacy gates this on level 9 plus delete/modify lists and modify leads.
async function clearList(req, res) {
  const user = req.genxUser;
  if (Number(user?.userLevel || 0) < 9 || !user?.deleteLists || !user?.modifyLists || Number(user?.modifyLeads || 0) < 1) {
    return res.status(403).json({ ok: false, error: 'permission_denied' });
  }
  const id = cleanId(req.params.id, 30);
  if (!id || id.length < 2) return badRequest(res, 'invalid_list_id');
  const scoped = await listWithScope(req, id);
  if (scoped.error) return res.status(scoped.error).json({ ok: false, error: 'list_not_available' });
  try {
    await execute('DELETE FROM vicidial_hopper WHERE list_id = ?', [id]).catch(() => {});

    const [settings] = await rows('SELECT custom_fields_enabled FROM system_settings LIMIT 1', [], []);
    if (Number(settings?.custom_fields_enabled || 0) > 0) {
      const entryLists = await rows(
        'SELECT DISTINCT entry_list_id FROM vicidial_list WHERE list_id = ? AND entry_list_id > 0 LIMIT 200',
        [id],
        [],
      );
      for (const entry of entryLists) {
        const entryListId = String(entry.entry_list_id || '').replace(/[^0-9]/g, '');
        if (!entryListId) continue;
        const tables = await rows('SHOW TABLES LIKE ?', [`custom_${entryListId}`], []);
        if (!tables.length) continue;
        await execute(
          `DELETE cf FROM ${quoteId(`custom_${entryListId}`)} cf
           JOIN vicidial_list l ON l.lead_id = cf.lead_id
           WHERE l.list_id = ?`,
          [id],
        ).catch(() => {});
      }
    }

    const result = await execute('DELETE FROM vicidial_list WHERE list_id = ?', [id]);
    await adminLog(req, 'LISTS', 'DELETE', id, 'GENX CLEAR LIST', 'DELETE FROM vicidial_list WHERE list_id', `${result.affectedRows} leads`);
    return res.json({ ok: true, cleared: result.affectedRows, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'list_clear_failed' });
  }
}

// The "Reset Lead-Called-Status" flag on legacy list modify.
async function resetList(req, res) {
  if (!requireModify(req, res, 'modifyLists')) return;
  const id = cleanId(req.params.id, 30);
  if (!id) return badRequest(res, 'invalid_list_id');
  const scoped = await listWithScope(req, id);
  if (scoped.error) return res.status(scoped.error).json({ ok: false, error: 'list_not_available' });
  try {
    const result = await execute("UPDATE vicidial_list SET called_since_last_reset = 'N' WHERE list_id = ?", [id]);
    await adminLog(req, 'LISTS', 'MODIFY', id, 'GENX RESET LIST', 'UPDATE vicidial_list SET called_since_last_reset=N', `${result.affectedRows} leads`);
    return res.json({ ok: true, reset: result.affectedRows });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'list_reset_failed' });
  }
}

const LIST_DOWNLOAD_COLUMNS = [
  'lead_id', 'entry_date', 'status', 'user', 'vendor_lead_code', 'source_id', 'list_id',
  'phone_code', 'phone_number', 'title', 'first_name', 'middle_initial', 'last_name',
  'address1', 'address2', 'address3', 'city', 'state', 'province', 'postal_code',
  'country_code', 'gender', 'date_of_birth', 'alt_phone', 'email', 'security_phrase',
  'comments', 'called_count', 'last_local_call_time', 'rank', 'owner',
];

// Legacy list_download.php equivalent, gated on the download_lists user flag.
async function downloadList(req, res) {
  if (!requireModify(req, res, 'downloadLists')) return;
  const id = cleanId(req.params.id, 30);
  if (!id) return badRequest(res, 'invalid_list_id');
  const scoped = await listWithScope(req, id);
  if (scoped.error) return res.status(scoped.error).json({ ok: false, error: 'list_not_available' });

  const leads = await rows(
    `SELECT ${LIST_DOWNLOAD_COLUMNS.join(', ')} FROM vicidial_list WHERE list_id = ? ORDER BY lead_id ASC LIMIT 500000`,
    [id],
    [],
  );

  const hideLead = Boolean(req.genxUser?.adminHideLeadData);
  const phoneMode = req.genxUser?.adminHidePhoneData || '0';
  const escapeCell = (value) => {
    const text = value == null ? '' : String(value);
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [LIST_DOWNLOAD_COLUMNS.join(',')];
  for (const lead of leads) {
    lines.push(LIST_DOWNLOAD_COLUMNS.map((column) => {
      let value = lead[column];
      if (column === 'phone_number' || column === 'alt_phone') {
        if (phoneMode !== '0') value = maskPhoneNumber(value, phoneMode);
      } else if (hideLead && ['vendor_lead_code', 'security_phrase', 'comments'].includes(column)) {
        value = maskText(value);
      }
      return escapeCell(value);
    }).join(','));
  }

  await adminLog(req, 'LISTS', 'MODIFY', id, 'GENX DOWNLOAD LIST', 'SELECT FROM vicidial_list', `${leads.length} leads`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="list_${id}.csv"`);
  return res.send(lines.join('\r\n'));
}

// Cascade mirrors legacy admin.php ADD=61 (campaign delete): callbacks are
// archived before deletion, and every campaign-scoped config/stats table is
// purged so no orphan rows remain.
const CAMPAIGN_DELETE_TABLES = [
  'vicidial_campaign_agents',
  'vicidial_live_agents',
  'vicidial_campaign_statuses',
  'vicidial_campaign_hotkeys',
  'vicidial_campaign_stats',
  'vicidial_campaign_stats_debug',
  'vicidial_lead_recycle',
  'vicidial_campaign_server_stats',
  'vicidial_server_trunks',
  'vicidial_pause_codes',
  'vicidial_campaigns_list_mix',
  'vicidial_xfer_presets',
  'vicidial_xfer_stats',
  'vicidial_campaign_cid_areacodes',
  'vicidial_url_multi',
  'vicidial_hopper',
];

async function deleteCampaign(req, res) {
  if (!requireModify(req, res, 'deleteCampaigns')) return;
  const id = cleanId(req.params.id, 20);
  if (!id || id.length < 2) return badRequest(res, 'invalid_campaign_id');
  if (!scopeAllows(req.genxUser?.permissions?.allowedCampaigns, id)) {
    return res.status(403).json({ ok: false, error: 'campaign_not_allowed' });
  }
  try {
    const result = await execute('DELETE FROM vicidial_campaigns WHERE campaign_id = ? LIMIT 1', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'campaign_not_found' });
    await execute('INSERT INTO vicidial_callbacks_archive SELECT * FROM vicidial_callbacks WHERE campaign_id = ?', [id]).catch(() => {});
    await execute('DELETE FROM vicidial_callbacks WHERE campaign_id = ?', [id]).catch(() => {});
    for (const table of CAMPAIGN_DELETE_TABLES) {
      await execute(`DELETE FROM ${quoteId(table)} WHERE campaign_id = ?`, [id]).catch(() => {});
    }
    await adminLog(req, 'CAMPAIGNS', 'DELETE', id, 'GENX DELETE CAMPAIGN', 'DELETE FROM vicidial_campaigns + campaign-scoped tables', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'campaign_delete_failed' });
  }
}

// Mirrors legacy admin.php ADD=62: reconcile the agent's open vicidial_agent_log
// row, remove them from vicidial_live_agents, kick their conference channel via
// vicidial_manager, and log the manager-forced logout in vicidial_user_log.
async function logoutCampaignAgents(req, res) {
  if (!requireModify(req, res, 'modifyCampaigns')) return;
  const id = cleanId(req.params.id, 20);
  if (!id || id.length < 2) return badRequest(res, 'invalid_campaign_id');
  if (!scopeAllows(req.genxUser?.permissions?.allowedCampaigns, id)) {
    return res.status(403).json({ ok: false, error: 'campaign_not_allowed' });
  }
  const [campaign] = await rows('SELECT campaign_id FROM vicidial_campaigns WHERE campaign_id = ? LIMIT 1', [id], []);
  if (!campaign) return res.status(404).json({ ok: false, error: 'campaign_not_found' });

  const agents = await rows(
    `SELECT user, campaign_id, UNIX_TIMESTAMP(last_update_time) AS last_update_epoch, conf_exten, server_ip
     FROM vicidial_live_agents WHERE campaign_id = ?`,
    [id],
    [],
  );
  const nowEpoch = Math.floor(Date.now() / 1000);
  const inactiveEpoch = nowEpoch - 60;

  try {
    for (const agent of agents) {
      let userGroup = '';
      if (Number(agent.last_update_epoch || 0) > inactiveEpoch) {
        const [log] = await rows(
          `SELECT agent_log_id, lead_id, pause_epoch, pause_sec, wait_epoch, wait_sec,
                  talk_epoch, talk_sec, dispo_epoch, dispo_sec, status, user_group
           FROM vicidial_agent_log WHERE user = ? ORDER BY agent_log_id DESC LIMIT 1`,
          [agent.user],
          [],
        );
        if (log) {
          userGroup = log.user_group || '';
          const noStatus = !log.status || log.status === 'NULL';
          if (!Number(log.wait_epoch) || (log.status === 'PAUSE' && !Number(log.dispo_epoch))) {
            const pauseSec = (nowEpoch - Number(log.pause_epoch || 0)) + Number(log.pause_sec || 0);
            await execute(
              "UPDATE vicidial_agent_log SET wait_epoch = ?, pause_sec = ?, pause_type = 'ADMIN' WHERE agent_log_id = ?",
              [nowEpoch, pauseSec, log.agent_log_id],
            );
          } else if (!Number(log.talk_epoch)) {
            const waitSec = (nowEpoch - Number(log.wait_epoch || 0)) + Number(log.wait_sec || 0);
            await execute(
              'UPDATE vicidial_agent_log SET talk_epoch = ?, wait_sec = ? WHERE agent_log_id = ?',
              [nowEpoch, waitSec, log.agent_log_id],
            );
          } else {
            if (noStatus && Number(log.lead_id) > 0) {
              await execute("UPDATE vicidial_list SET status = 'PU' WHERE lead_id = ?", [log.lead_id]);
            }
            if (!Number(log.dispo_epoch)) {
              const talkSec = nowEpoch - Number(log.talk_epoch || 0);
              await execute(
                `UPDATE vicidial_agent_log SET dispo_epoch = ?, talk_sec = ?${noStatus && Number(log.lead_id) > 0 ? ", status = 'PU'" : ''} WHERE agent_log_id = ?`,
                [nowEpoch, talkSec, log.agent_log_id],
              );
            } else if (!Number(log.dispo_sec)) {
              await execute(
                'UPDATE vicidial_agent_log SET dispo_sec = ? WHERE agent_log_id = ?',
                [nowEpoch - Number(log.dispo_epoch || 0), log.agent_log_id],
              );
            }
          }
        }
      }

      await execute('DELETE FROM vicidial_live_agents WHERE user = ?', [agent.user]);

      if (!userGroup) {
        const [userRow] = await rows('SELECT user_group FROM vicidial_users WHERE user = ?', [agent.user], []);
        userGroup = userRow?.user_group || '';
      }

      const kickChannel = `Local/5555${agent.conf_exten || ''}@default`;
      const queryCID = `ULGH3457${nowEpoch}`;
      await execute(
        `INSERT INTO vicidial_manager
           (uniqueid, entry_date, status, response, server_ip, channel, action, callerid,
            cmd_line_b, cmd_line_c, cmd_line_d, cmd_line_e, cmd_line_f)
         VALUES ('', NOW(), 'NEW', 'N', ?, '', 'Originate', ?, ?, 'Context: default', 'Exten: 8300', 'Priority: 1', ?)`,
        [agent.server_ip || '', queryCID, `Channel: ${kickChannel}`, `Callerid: ${queryCID}`],
      ).catch(() => {});

      await execute(
        `INSERT INTO vicidial_user_log (user, event, campaign_id, event_date, event_epoch, user_group, extension)
         VALUES (?, 'LOGOUT', ?, NOW(), ?, ?, ?)`,
        [agent.user, agent.campaign_id, nowEpoch, userGroup, `MGR LOGOUT: ${req.genxUser.user}`],
      ).catch(() => {});
    }

    await adminLog(req, 'CAMPAIGNS', 'MODIFY', id, 'GENX LOGOUT ALL CAMPAIGN AGENTS', 'DELETE FROM vicidial_live_agents WHERE campaign_id', `${agents.length} agents`);
    return res.json({ ok: true, loggedOut: agents.length });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'logout_agents_failed' });
  }
}

function maskPhoneNumber(value, mode) {
  const text = String(value || '');
  if (!text) return text;
  const keep = mode === '2_DIGITS' ? 2 : mode === '3_DIGITS' ? 3 : mode === '4_DIGITS' ? 4 : 0;
  if (!keep) return 'X'.repeat(text.length);
  return 'X'.repeat(Math.max(text.length - keep, 0)) + text.slice(-keep);
}

function maskText(value) {
  const text = String(value || '');
  return text ? 'X'.repeat(text.length) : text;
}

const HOPPER_STATUS_OPTIONS = ['READY', 'HOLD', 'READY_AND_HOLD'];

async function hopperListReport(req, res) {
  if (!requireModify(req, res, 'viewReports')) return;
  const status = cleanChoice(req.query?.status, HOPPER_STATUS_OPTIONS, 'READY');

  const campaignParams = [];
  const campaignWhere = scopeWhere(req.genxUser?.permissions?.allowedCampaigns, 'campaign_id', campaignParams);
  const campaigns = await rows(
    `SELECT campaign_id, campaign_name FROM vicidial_campaigns WHERE ${campaignWhere} ORDER BY campaign_id ASC LIMIT 500`,
    campaignParams,
    [],
  );

  const campaignId = cleanId(req.query?.campaign_id, 20);
  if (!campaignId || !scopeAllows(req.genxUser?.permissions?.allowedCampaigns, campaignId)) {
    return res.json({ ok: true, campaigns, entries: null, totals: null, status });
  }

  const statusList = status === 'READY_AND_HOLD' ? ['READY', 'RHOLD', 'RQUEUE']
    : status === 'HOLD' ? ['RHOLD', 'RQUEUE']
    : ['READY'];

  const [totalRow] = await rows(
    'SELECT COUNT(*) AS total FROM vicidial_hopper WHERE campaign_id = ?',
    [campaignId],
    [{ total: 0 }],
  );

  let readyCount = null;
  let holdCount = null;
  if (status === 'READY_AND_HOLD') {
    const [readyRow] = await rows(
      "SELECT COUNT(*) AS n FROM vicidial_hopper WHERE campaign_id = ? AND status = 'READY'",
      [campaignId],
      [{ n: 0 }],
    );
    const [holdRow] = await rows(
      "SELECT COUNT(*) AS n FROM vicidial_hopper WHERE campaign_id = ? AND status IN ('RHOLD','RQUEUE')",
      [campaignId],
      [{ n: 0 }],
    );
    readyCount = Number(readyRow?.n || 0);
    holdCount = Number(holdRow?.n || 0);
  }

  const entries = await rows(
    `SELECT h.hopper_id, h.priority, h.lead_id, h.list_id, l.phone_number, h.state, l.status,
            l.called_count, h.gmt_offset_now, h.alt_dial, h.source, h.vendor_lead_code,
            l.phone_code, l.rank, l.owner, h.status AS hopper_status, h.user AS hopper_user,
            UNIX_TIMESTAMP(l.entry_date) AS entry_epoch, UNIX_TIMESTAMP(l.last_local_call_time) AS last_call_epoch
     FROM vicidial_hopper h
     JOIN vicidial_list l ON l.lead_id = h.lead_id
     WHERE h.campaign_id = ? AND h.status IN (${statusList.map(() => '?').join(',')})
     ORDER BY h.priority DESC, h.hopper_id ASC
     LIMIT 3000`,
    [campaignId, ...statusList],
    [],
  );

  const hideLead = Boolean(req.genxUser?.adminHideLeadData);
  const phoneMode = req.genxUser?.adminHidePhoneData || '0';
  const nowSeconds = Math.floor(Date.now() / 1000);

  const shaped = entries.map((row, index) => ({
    order: index + 1,
    hopper_id: row.hopper_id,
    priority: row.priority,
    lead_id: row.lead_id,
    list_id: row.list_id,
    phone_number: phoneMode !== '0' ? maskPhoneNumber(row.phone_number, phoneMode) : row.phone_number,
    phone_code: row.phone_code,
    state: hideLead ? maskText(row.state) : row.state,
    status: row.status,
    called_count: row.called_count,
    gmt_offset_now: row.gmt_offset_now,
    alt_dial: row.alt_dial,
    source: row.source,
    vendor_lead_code: hideLead ? maskText(row.vendor_lead_code) : row.vendor_lead_code,
    rank: row.rank,
    owner: row.owner,
    hopper_status: row.hopper_status,
    hopper_user: row.hopper_user,
    age_days: row.entry_epoch ? Math.floor((nowSeconds - row.entry_epoch) / 86400) : null,
    last_call_hours: row.last_call_epoch ? Math.floor((nowSeconds - row.last_call_epoch) / 3600) : null,
  }));

  return res.json({
    ok: true,
    campaigns,
    entries: shaped,
    totals: { total: Number(totalRow?.total || 0), ready: readyCount, hold: holdCount },
    status,
    campaignId,
  });
}

function inboundPayload(body) {
  const routeCode = (value, max = 255, fallback = '') => codeText(value, max, fallback);
  const longText = (value) => cleanText(value, 12000);

  return {
    group_name: cleanText(body.group_name, 30) || 'New In-Group',
    group_color: cleanChoice(body.group_color, ADMIN_COLOR_OPTIONS, 'WHITE'),
    active: ynFlag(body.active, 'N'),
    user_group: routeCode(body.user_group, 20, '---ALL---'),
    call_time_id: cleanId(body.call_time_id, 20) || '24hours',
    next_agent_call: cleanExactChoice(body.next_agent_call, NEXT_AGENT_CALL_OPTIONS, 'longest_wait_time'),
    agent_search_method: cleanExactChoice(body.agent_search_method, AGENT_SEARCH_OPTIONS, '', 4),
    fronter_display: ynFlag(body.fronter_display, 'Y'),
    default_group_alias: cleanText(body.default_group_alias, 30),
    dial_ingroup_cid: cleanText(body.dial_ingroup_cid, 20),
    queue_priority: cleanInt(body.queue_priority, 0, -99, 99),
    group_handling: cleanChoice(body.group_handling, ['PHONE', 'EMAIL', 'CHAT'], 'PHONE'),
    voicemail_ext: routeCode(body.voicemail_ext, 10),
    web_form_address: longText(body.web_form_address),
    web_form_address_two: longText(body.web_form_address_two),
    web_form_address_three: longText(body.web_form_address_three),
    ingroup_script: cleanId(body.ingroup_script, 20),
    ingroup_script_two: cleanId(body.ingroup_script_two, 20),
    get_call_launch: cleanChoice(body.get_call_launch, INGROUP_GET_CALL_LAUNCH_OPTIONS, 'NONE'),
    ignore_list_script_override: ynFlag(body.ignore_list_script_override, 'N'),
    start_call_url: longText(body.start_call_url),
    dispo_call_url: longText(body.dispo_call_url),
    na_call_url: longText(body.na_call_url),
    add_lead_url: longText(body.add_lead_url),
    enter_ingroup_url: longText(body.enter_ingroup_url),
    waiting_call_url_on: longText(body.waiting_call_url_on),
    waiting_call_url_off: longText(body.waiting_call_url_off),
    waiting_call_count: cleanInt(body.waiting_call_count, 0, 0, 99999),
    drop_call_seconds: cleanInt(body.drop_call_seconds, 360, 0, 9999),
    drop_call_seconds_override: cleanInt(body.drop_call_seconds_override, 0, 0, 9999),
    drop_action: cleanChoice(body.drop_action, INGROUP_DROP_ACTION_OPTIONS, 'MESSAGE'),
    drop_exten: routeCode(body.drop_exten, 255),
    drop_inbound_group: routeCode(body.drop_inbound_group, 20, '---NONE---'),
    drop_callmenu: routeCode(body.drop_callmenu, 50, '---NONE---'),
    drop_lead_reset: ynFlag(body.drop_lead_reset, 'N'),
    after_hours_action: cleanChoice(body.after_hours_action, INGROUP_AFTER_HOURS_ACTION_OPTIONS, 'MESSAGE'),
    after_hours_message_filename: routeCode(body.after_hours_message_filename, 255),
    after_hours_exten: routeCode(body.after_hours_exten, 255),
    after_hours_voicemail: routeCode(body.after_hours_voicemail, 255),
    afterhours_xfer_group: routeCode(body.afterhours_xfer_group, 20, '---NONE---'),
    after_hours_callmenu: routeCode(body.after_hours_callmenu, 50, '---NONE---'),
    after_hours_lead_reset: ynFlag(body.after_hours_lead_reset, 'N'),
    welcome_message_filename: routeCode(body.welcome_message_filename, 255),
    play_welcome_message: cleanChoice(body.play_welcome_message, INGROUP_PLAY_WELCOME_OPTIONS, 'ALWAYS'),
    moh_context: routeCode(body.moh_context, 100, 'default'),
    park_file_name: routeCode(body.park_file_name, 100),
    onhold_prompt_filename: routeCode(body.onhold_prompt_filename, 255),
    onhold_prompt_no_block: ynFlag(body.onhold_prompt_no_block, 'N'),
    onhold_prompt_seconds: cleanInt(body.onhold_prompt_seconds, 10, 0, 9999),
    prompt_interval: cleanInt(body.prompt_interval, 60, 0, 9999),
    play_place_in_line: ynFlag(body.play_place_in_line, 'N'),
    play_estimate_hold_time: ynFlag(body.play_estimate_hold_time, 'N'),
    calculate_estimated_hold_seconds: cleanInt(body.calculate_estimated_hold_seconds, 0, 0, 99999),
    place_in_line_caller_number_filename: routeCode(body.place_in_line_caller_number_filename, 255),
    place_in_line_you_next_filename: routeCode(body.place_in_line_you_next_filename, 255),
    hold_time_option: cleanExactChoice(body.hold_time_option, INGROUP_HOLD_WAIT_ROUTE_OPTIONS, 'NONE'),
    hold_time_second_option: cleanExactChoice(body.hold_time_second_option, INGROUP_HOLD_WAIT_ROUTE_OPTIONS, 'NONE'),
    hold_time_third_option: cleanExactChoice(body.hold_time_third_option, INGROUP_HOLD_WAIT_ROUTE_OPTIONS, 'NONE'),
    hold_time_option_seconds: cleanInt(body.hold_time_option_seconds, 120, 0, 99999),
    hold_time_option_minimum: cleanInt(body.hold_time_option_minimum, 0, 0, 99999),
    hold_time_option_exten: routeCode(body.hold_time_option_exten, 255),
    hold_time_option_voicemail: routeCode(body.hold_time_option_voicemail, 255),
    hold_time_option_xfer_group: routeCode(body.hold_time_option_xfer_group, 20, '---NONE---'),
    hold_time_option_callmenu: routeCode(body.hold_time_option_callmenu, 50, '---NONE---'),
    hold_time_option_callback_filename: routeCode(body.hold_time_option_callback_filename, 255),
    hold_time_option_callback_list_id: cleanInt(body.hold_time_option_callback_list_id, 0, 0, 999999999),
    hold_time_option_press_filename: routeCode(body.hold_time_option_press_filename, 255),
    hold_time_option_no_block: ynFlag(body.hold_time_option_no_block, 'N'),
    hold_time_option_prompt_seconds: cleanInt(body.hold_time_option_prompt_seconds, 10, 0, 9999),
    hold_recall_xfer_group: routeCode(body.hold_recall_xfer_group, 20, '---NONE---'),
    hold_time_lead_reset: ynFlag(body.hold_time_lead_reset, 'N'),
    wait_hold_option_priority: cleanChoice(body.wait_hold_option_priority, INGROUP_WAIT_HOLD_PRIORITY_OPTIONS, 'WAIT'),
    wait_time_option: cleanExactChoice(body.wait_time_option, INGROUP_HOLD_WAIT_ROUTE_OPTIONS, 'NONE'),
    wait_time_second_option: cleanExactChoice(body.wait_time_second_option, INGROUP_HOLD_WAIT_ROUTE_OPTIONS, 'NONE'),
    wait_time_third_option: cleanExactChoice(body.wait_time_third_option, INGROUP_HOLD_WAIT_ROUTE_OPTIONS, 'NONE'),
    wait_time_option_seconds: cleanInt(body.wait_time_option_seconds, 120, 0, 99999),
    wait_time_option_exten: routeCode(body.wait_time_option_exten, 255),
    wait_time_option_voicemail: routeCode(body.wait_time_option_voicemail, 255),
    wait_time_option_xfer_group: routeCode(body.wait_time_option_xfer_group, 20, '---NONE---'),
    wait_time_option_callmenu: routeCode(body.wait_time_option_callmenu, 50, '---NONE---'),
    wait_time_option_callback_filename: routeCode(body.wait_time_option_callback_filename, 255),
    wait_time_option_callback_list_id: cleanInt(body.wait_time_option_callback_list_id, 0, 0, 999999999),
    wait_time_option_press_filename: routeCode(body.wait_time_option_press_filename, 255),
    wait_time_option_no_block: ynFlag(body.wait_time_option_no_block, 'N'),
    wait_time_option_prompt_seconds: cleanInt(body.wait_time_option_prompt_seconds, 10, 0, 9999),
    wait_time_lead_reset: ynFlag(body.wait_time_lead_reset, 'N'),
    eht_minimum_prompt_filename: routeCode(body.eht_minimum_prompt_filename, 255),
    eht_minimum_prompt_no_block: ynFlag(body.eht_minimum_prompt_no_block, 'N'),
    eht_minimum_prompt_seconds: cleanInt(body.eht_minimum_prompt_seconds, 10, 0, 9999),
    no_agent_no_queue: cleanChoice(body.no_agent_no_queue, INGROUP_NO_AGENT_NO_QUEUE_OPTIONS, 'N'),
    no_agent_action: cleanChoice(body.no_agent_action, INGROUP_NO_AGENT_ACTION_OPTIONS, 'MESSAGE'),
    no_agent_action_value: routeCode(body.no_agent_action_value, 255),
    no_agent_delay: cleanInt(body.no_agent_delay, 0, 0, 9999),
    in_queue_nanque: cleanChoice(body.in_queue_nanque, INGROUP_IN_QUEUE_NANQUE_OPTIONS, 'N'),
    in_queue_nanque_exceptions: cleanText(body.in_queue_nanque_exceptions, 255),
    nanq_lead_reset: ynFlag(body.nanq_lead_reset, 'N'),
    default_xfer_group: routeCode(body.default_xfer_group, 20, '---NONE---'),
    action_xfer_cid: routeCode(body.action_xfer_cid, 50, 'CUSTOMER'),
    extension_appended_cidname: cleanChoice(body.extension_appended_cidname, ['N', 'Y', 'Y_USER', 'Y_WITH_CAMPAIGN', 'Y_USER_WITH_CAMPAIGN'], 'N'),
    xferconf_a_dtmf: routeCode(body.xferconf_a_dtmf, 50),
    xferconf_a_number: routeCode(body.xferconf_a_number, 50),
    xferconf_b_dtmf: routeCode(body.xferconf_b_dtmf, 50),
    xferconf_b_number: routeCode(body.xferconf_b_number, 50),
    xferconf_c_number: routeCode(body.xferconf_c_number, 50),
    xferconf_d_number: routeCode(body.xferconf_d_number, 50),
    xferconf_e_number: routeCode(body.xferconf_e_number, 50),
    xfer_talk_minimum: cleanChoice(body.xfer_talk_minimum, ['DISABLED', 'ENABLED'], 'DISABLED'),
    xfer_talk_minimum_sec: cleanInt(body.xfer_talk_minimum_sec, 5, 0, 9999),
    ingroup_recording_override: cleanChoice(body.ingroup_recording_override, INGROUP_RECORDING_OPTIONS, 'DISABLED'),
    ingroup_rec_filename: routeCode(body.ingroup_rec_filename, 255),
    routing_initiated_recordings: ynFlag(body.routing_initiated_recordings, 'N'),
    stereo_recording: cleanChoice(body.stereo_recording, INGROUP_STEREO_RECORDING_OPTIONS, 'DISABLED'),
    stereo_rec_filename: routeCode(body.stereo_rec_filename, 255),
    stereo_parallel_recording: ynFlag(body.stereo_parallel_recording, 'N'),
    parallel_rec_co_filename: routeCode(body.parallel_rec_co_filename, 255),
    parallel_rec_cm_filename: routeCode(body.parallel_rec_cm_filename, 255),
    parallel_rec_fr_filename: routeCode(body.parallel_rec_fr_filename, 255),
    recording_dtmf_muting: cleanChoice(body.recording_dtmf_muting, ENABLED_DISABLED_OPTIONS, 'DISABLED'),
    stereo_recording_agent: cleanChoice(body.stereo_recording_agent, INGROUP_RECORDING_OPTIONS, 'DISABLED'),
    qc_enabled: ynFlag(body.qc_enabled, 'N'),
    qc_statuses: cleanText(body.qc_statuses, 255),
    qc_shift_id: routeCode(body.qc_shift_id, 20),
    qc_get_record_launch: cleanChoice(body.qc_get_record_launch, INGROUP_QC_GET_RECORD_LAUNCH_OPTIONS, 'NONE'),
    qc_show_recording: ynFlag(body.qc_show_recording, 'N'),
    qc_web_form_address: longText(body.qc_web_form_address),
    qc_script: cleanId(body.qc_script, 20),
    qc_scorecard_id: routeCode(body.qc_scorecard_id, 20),
    qc_statuses_id: routeCode(body.qc_statuses_id, 20),
    max_calls_method: cleanChoice(body.max_calls_method, INGROUP_MAX_CALLS_METHOD_OPTIONS, 'DISABLED'),
    max_calls_count: cleanInt(body.max_calls_count, 0, 0, 999999),
    max_calls_action: cleanChoice(body.max_calls_action, INGROUP_MAX_CALLS_ACTION_OPTIONS, 'DROP'),
    areacode_filter: cleanChoice(body.areacode_filter, INGROUP_AREACODE_FILTER_OPTIONS, 'DISABLED'),
    areacode_filter_seconds: cleanInt(body.areacode_filter_seconds, 0, 0, 99999),
    areacode_filter_action: cleanChoice(body.areacode_filter_action, INGROUP_NO_AGENT_ACTION_OPTIONS, 'MESSAGE'),
    areacode_filter_action_value: routeCode(body.areacode_filter_action_value, 255),
    timer_action: cleanChoice(body.timer_action, TIMER_ACTION_OPTIONS, 'NONE'),
    timer_action_message: routeCode(body.timer_action_message, 255),
    timer_action_seconds: cleanInt(body.timer_action_seconds, 0, 0, 99999),
    timer_action_destination: routeCode(body.timer_action_destination, 255),
    no_delay_call_route: ynFlag(body.no_delay_call_route, 'N'),
    on_hook_ring_time: cleanInt(body.on_hook_ring_time, 0, 0, 9999),
    on_hook_cid: cleanText(body.on_hook_cid, 20),
    on_hook_cid_number: cleanText(body.on_hook_cid_number, 20),
    uniqueid_status_display: cleanChoice(body.uniqueid_status_display, ['DISABLED', 'ENABLED', 'ENABLED_PREFIX', 'ENABLED_PRESERVE'], 'DISABLED'),
    uniqueid_status_prefix: routeCode(body.uniqueid_status_prefix, 20),
    status_group_id: routeCode(body.status_group_id, 20),
    answer_signal: cleanChoice(body.answer_signal, INGROUP_ANSWER_SIGNAL_OPTIONS, 'START'),
    inbound_survey: cleanChoice(body.inbound_survey, ENABLED_DISABLED_OPTIONS, 'DISABLED'),
    inbound_survey_filename: routeCode(body.inbound_survey_filename, 255),
    inbound_survey_accept_digit: routeCode(body.inbound_survey_accept_digit, 1, '1'),
    inbound_survey_question_filename: routeCode(body.inbound_survey_question_filename, 255),
    inbound_survey_callmenu: routeCode(body.inbound_survey_callmenu, 50, '---NONE---'),
    icbq_expiration_hours: cleanInt(body.icbq_expiration_hours, 0, 0, 99999),
    icbq_call_time_id: cleanId(body.icbq_call_time_id, 20),
    icbq_dial_filter: routeCode(body.icbq_dial_filter, 20, 'NONE'),
    closing_time_action: cleanChoice(body.closing_time_action, INGROUP_NO_AGENT_ACTION_OPTIONS, 'MESSAGE'),
    closing_time_now_trigger: ynFlag(body.closing_time_now_trigger, 'N'),
    closing_time_filename: routeCode(body.closing_time_filename, 255),
    closing_time_end_filename: routeCode(body.closing_time_end_filename, 255),
    closing_time_lead_reset: ynFlag(body.closing_time_lead_reset, 'N'),
    closing_time_option_exten: routeCode(body.closing_time_option_exten, 255),
    closing_time_option_callmenu: routeCode(body.closing_time_option_callmenu, 50, '---NONE---'),
    closing_time_option_voicemail: routeCode(body.closing_time_option_voicemail, 255),
    closing_time_option_xfer_group: routeCode(body.closing_time_option_xfer_group, 20, '---NONE---'),
    closing_time_option_callback_list_id: cleanInt(body.closing_time_option_callback_list_id, 0, 0, 999999999),
    cid_cb_confirm_number: ynFlag(body.cid_cb_confirm_number, 'N'),
    cid_cb_invalid_filter_phone_group: routeCode(body.cid_cb_invalid_filter_phone_group, 20),
    cid_cb_valid_length: cleanInt(body.cid_cb_valid_length, 10, 0, 20),
    cid_cb_valid_filename: routeCode(body.cid_cb_valid_filename, 255),
    cid_cb_confirmed_filename: routeCode(body.cid_cb_confirmed_filename, 255),
    cid_cb_enter_filename: routeCode(body.cid_cb_enter_filename, 255),
    cid_cb_you_entered_filename: routeCode(body.cid_cb_you_entered_filename, 255),
    cid_cb_press_to_confirm_filename: routeCode(body.cid_cb_press_to_confirm_filename, 255),
    cid_cb_invalid_filename: routeCode(body.cid_cb_invalid_filename, 255),
    cid_cb_reenter_filename: routeCode(body.cid_cb_reenter_filename, 255),
    cid_cb_error_filename: routeCode(body.cid_cb_error_filename, 255),
    populate_lead_ingroup: cleanChoice(body.populate_lead_ingroup, ENABLED_DISABLED_OPTIONS, 'DISABLED'),
    populate_lead_province: routeCode(body.populate_lead_province, 50, 'DISABLED'),
    populate_state_areacode: cleanChoice(body.populate_state_areacode, INGROUP_POPULATE_STATE_OPTIONS, 'DISABLED'),
    populate_lead_source: cleanText(body.populate_lead_source, 255),
    populate_lead_vendor: cleanText(body.populate_lead_vendor, 255),
    populate_lead_comments: cleanText(body.populate_lead_comments, 255),
    populate_lead_owner: routeCode(body.populate_lead_owner, 50),
    add_lead_timezone: cleanChoice(body.add_lead_timezone, INGROUP_ADD_LEAD_TIMEZONE_OPTIONS, 'SERVER'),
    customer_chat_screen_colors: cleanText(body.customer_chat_screen_colors, 50),
    customer_chat_survey_link: longText(body.customer_chat_survey_link),
    customer_chat_survey_text: cleanText(body.customer_chat_survey_text, 1000),
    agent_alert_exten: routeCode(body.agent_alert_exten, 20),
    agent_alert_delay: cleanInt(body.agent_alert_delay, 0, 0, 9999),
    browser_alert_sound: routeCode(body.browser_alert_sound, 255),
    browser_alert_volume: cleanInt(body.browser_alert_volume, 50, 0, 100),
    second_alert_trigger: routeCode(body.second_alert_trigger, 50),
    second_alert_trigger_seconds: cleanInt(body.second_alert_trigger_seconds, 0, 0, 99999),
    second_alert_filename: routeCode(body.second_alert_filename, 255),
    second_alert_delay: cleanInt(body.second_alert_delay, 0, 0, 99999),
    second_alert_container: routeCode(body.second_alert_container, 50),
    second_alert_only: ynFlag(body.second_alert_only, 'N'),
    third_alert_trigger: routeCode(body.third_alert_trigger, 50),
    third_alert_trigger_seconds: cleanInt(body.third_alert_trigger_seconds, 0, 0, 99999),
    third_alert_filename: routeCode(body.third_alert_filename, 255),
    third_alert_delay: cleanInt(body.third_alert_delay, 0, 0, 99999),
    third_alert_container: routeCode(body.third_alert_container, 50),
    third_alert_only: ynFlag(body.third_alert_only, 'N'),
    custom_one: cleanText(body.custom_one, 255),
    custom_two: cleanText(body.custom_two, 255),
    custom_three: cleanText(body.custom_three, 255),
    custom_four: cleanText(body.custom_four, 255),
    custom_five: cleanText(body.custom_five, 255),
  };
}

async function saveInboundGroup(req, res, mode) {
  if (!requireModify(req, res, 'modifyIngroups')) return;
  const id = cleanId(mode === 'create' ? req.body?.group_id : req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_group_id');
  const payload = inboundPayload(req.body || {});
  if (!scopeAllows(req.genxUser?.permissions?.allowedQueueGroups, id)) {
    return res.status(403).json({ ok: false, error: 'ingroup_not_allowed' });
  }
  if (payload.user_group !== '---ALL---' && !scopeAllows(req.genxUser?.permissions?.adminViewableGroups, payload.user_group)) {
    return res.status(403).json({ ok: false, error: 'ingroup_user_group_scope_required' });
  }
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_inbound_groups
         SET group_id = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'INGROUPS', 'ADD', id, 'GENX ADD INBOUND GROUP', 'INSERT INTO vicidial_inbound_groups', payload.group_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_inbound_groups
         SET ${assignments}
         WHERE group_id = ?`,
        [...values, id],
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

async function deleteInboundGroup(req, res) {
  if (!requireModify(req, res, 'deleteIngroups')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_group_id');
  if (!scopeAllows(req.genxUser?.permissions?.allowedQueueGroups, id)) {
    return res.status(403).json({ ok: false, error: 'ingroup_not_allowed' });
  }
  try {
    const result = await execute('DELETE FROM vicidial_inbound_groups WHERE group_id = ?', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'ingroup_not_found' });
    await adminLog(req, 'INGROUPS', 'DELETE', id, 'GENX DELETE INBOUND GROUP', 'DELETE FROM vicidial_inbound_groups', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'ingroup_delete_failed' });
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
    forced_timeclock_login: cleanChoice(body.forced_timeclock_login, ['Y', 'N', 'ADMIN_EXEMPT'], 'N'),
    shift_enforcement: cleanChoice(body.shift_enforcement, ['OFF', 'START', 'ALL', 'ADMIN_EXEMPT'], 'OFF'),
    agent_status_viewable_groups: cleanText(body.agent_status_viewable_groups, 1000) || '---ALL---',
    agent_status_view_time: cleanChoice(body.agent_status_view_time, ['Y', 'N'], 'N'),
    agent_call_log_view: cleanChoice(body.agent_call_log_view, ['Y', 'N'], 'N'),
    agent_fullscreen: ynFlag(body.agent_fullscreen, 'N'),
    agent_xfer_consultative: ynFlag(body.agent_xfer_consultative, 'Y'),
    agent_xfer_dial_override: ynFlag(body.agent_xfer_dial_override, 'Y'),
    agent_xfer_vm_transfer: ynFlag(body.agent_xfer_vm_transfer, 'Y'),
    agent_xfer_blind_transfer: ynFlag(body.agent_xfer_blind_transfer, 'Y'),
    agent_xfer_dial_with_customer: ynFlag(body.agent_xfer_dial_with_customer, 'Y'),
    agent_xfer_park_customer_dial: ynFlag(body.agent_xfer_park_customer_dial, 'Y'),
    agent_xfer_park_3way: ynFlag(body.agent_xfer_park_3way, 'Y'),
    allowed_reports: cleanText(body.allowed_reports, 2000) || 'ALL REPORTS',
    admin_viewable_groups: cleanText(body.admin_viewable_groups, 1000) || '---ALL---',
    admin_viewable_call_times: cleanText(body.admin_viewable_call_times, 1000) || '---ALL---',
    allowed_custom_reports: cleanText(body.allowed_custom_reports, 1000) || 'ALL REPORTS',
    agent_allowed_chat_groups: cleanText(body.agent_allowed_chat_groups, 1000) || '---ALL---',
    allowed_queue_groups: cleanText(body.allowed_queue_groups, 1000) || '---ALL---',
    webphone_url_override: cleanText(body.webphone_url_override, 255),
    webphone_systemkey_override: cleanText(body.webphone_systemkey_override, 100),
    webphone_dialpad_override: cleanChoice(body.webphone_dialpad_override, ['DISABLED', 'Y', 'N', 'TOGGLE', 'TOGGLE_OFF'], 'DISABLED'),
    webphone_layout: cleanText(body.webphone_layout, 255),
    admin_ip_list: codeText(body.admin_ip_list, 30),
    agent_ip_list: codeText(body.agent_ip_list, 30),
    api_ip_list: codeText(body.api_ip_list, 30),
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
  const didGroupListText = (value) => {
    const values = Array.isArray(value) ? value : String(value || '').split(/\s+/);
    const cleanValues = [...new Set(values.map((item) => cleanId(item, 20)).filter((item) => item && item !== '-'))];
    return cleanValues.length ? `${cleanValues.join(' ')} -` : '';
  };
  return {
    did_description: cleanText(body.did_description, 50) || 'New DID',
    did_active: ynFlag(body.did_active, 'Y'),
    did_route: cleanExactChoice(body.did_route, ['EXTEN', 'VOICEMAIL', 'AGENT', 'PHONE', 'IN_GROUP', 'CALLMENU', 'VMAIL_NO_INST'], 'EXTEN'),
    extension: cleanText(body.extension, 100),
    exten_context: codeText(body.exten_context, 50, 'default'),
    voicemail_ext: cleanText(body.voicemail_ext, 10),
    phone: cleanText(body.phone, 100),
    server_ip: cleanIp(body.server_ip),
    user: cleanId(body.user, 20),
    user_unavailable_action: cleanExactChoice(body.user_unavailable_action, ['IN_GROUP', 'EXTEN', 'VOICEMAIL', 'PHONE', 'VMAIL_NO_INST'], 'VOICEMAIL'),
    user_route_settings_ingroup: cleanId(body.user_route_settings_ingroup, 20),
    group_id: cleanId(body.group_id, 20),
    call_handle_method: codeText(body.call_handle_method, 40, 'CID'),
    agent_search_method: cleanExactChoice(body.agent_search_method, ['LB', 'LO', 'SO'], 'LB'),
    list_id: cleanDigits(body.list_id, 14),
    campaign_id: cleanId(body.campaign_id, 20),
    phone_code: cleanDigits(body.phone_code, 10) || '1',
    menu_id: cleanId(body.menu_id, 50),
    record_call: cleanExactChoice(body.record_call, ['Y', 'N', 'Y_QUEUESTOP'], 'N'),
    filter_inbound_number: cleanText(body.filter_inbound_number, 20),
    filter_clean_cid_number: cleanText(body.filter_clean_cid_number, 20),
    no_agent_ingroup_redirect: cleanExactChoice(body.no_agent_ingroup_redirect, ['DISABLED', 'Y', 'NO_PAUSED', 'READY_ONLY'], 'DISABLED'),
    no_agent_ingroup_id: codeText(body.no_agent_ingroup_id, 20, '---NONE---'),
    no_agent_ingroup_extension: cleanText(body.no_agent_ingroup_extension, 50),
    max_queue_ingroup_calls: cleanInt(body.max_queue_ingroup_calls, 0, 0, 65000),
    max_queue_ingroup_id: codeText(body.max_queue_ingroup_id, 20, '---NONE---'),
    max_queue_ingroup_extension: cleanText(body.max_queue_ingroup_extension, 50),
    pre_filter_phone_group_id: didGroupListText(body.pre_filter_phone_group_id),
    pre_filter_extension: cleanText(body.pre_filter_extension, 50),
    pre_filter_recent_call: codeText(body.pre_filter_recent_call, 20),
    pre_filter_recent_extension: cleanText(body.pre_filter_recent_extension, 50),
    filter_phone_group_id: didGroupListText(body.filter_phone_group_id),
    filter_url: cleanText(body.filter_url, 1000),
    filter_url_did_redirect: ynFlag(body.filter_url_did_redirect, 'N'),
    filter_dnc_campaign: cleanId(body.filter_dnc_campaign, 8),
    filter_action: cleanExactChoice(body.filter_action, ['EXTEN', 'VOICEMAIL', 'AGENT', 'PHONE', 'IN_GROUP', 'CALLMENU', 'VMAIL_NO_INST'], 'EXTEN'),
    filter_extension: cleanText(body.filter_extension, 100),
    filter_exten_context: codeText(body.filter_exten_context, 50, 'default'),
    filter_voicemail_ext: cleanText(body.filter_voicemail_ext, 10),
    filter_phone: cleanText(body.filter_phone, 100),
    filter_server_ip: cleanIp(body.filter_server_ip),
    filter_user: cleanId(body.filter_user, 20),
    filter_user_unavailable_action: cleanExactChoice(body.filter_user_unavailable_action, ['IN_GROUP', 'EXTEN', 'VOICEMAIL', 'PHONE', 'VMAIL_NO_INST'], 'VOICEMAIL'),
    filter_user_route_settings_ingroup: codeText(body.filter_user_route_settings_ingroup, 20, '---NONE---'),
    filter_group_id: cleanId(body.filter_group_id, 20),
    filter_call_handle_method: codeText(body.filter_call_handle_method, 40, 'CID'),
    filter_agent_search_method: cleanExactChoice(body.filter_agent_search_method, ['LB', 'LO', 'SO'], 'LB'),
    filter_list_id: cleanDigits(body.filter_list_id, 14),
    filter_campaign_id: cleanId(body.filter_campaign_id, 20),
    filter_phone_code: cleanDigits(body.filter_phone_code, 10) || '1',
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

async function deleteDid(req, res) {
  if (!requireModify(req, res, 'deleteInboundDids')) return;
  const id = didPattern(req.params.id);
  if (!id) return badRequest(res, 'invalid_did_pattern');
  if (!(await didVisibleToUser(req.genxUser, id))) {
    return res.status(403).json({ ok: false, error: 'did_not_allowed' });
  }
  try {
    const result = await execute('DELETE FROM vicidial_inbound_dids WHERE did_pattern = ?', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'did_not_found' });
    await adminLog(req, 'DIDS', 'DELETE', id, 'GENX DELETE DID', 'DELETE FROM vicidial_inbound_dids', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'did_delete_failed' });
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
    phone_type: cleanText(body.phone_type, 50) || 'SIP',
    fullname: cleanText(body.fullname, 50),
    company: cleanText(body.company, 10),
    picture: cleanText(body.picture, 19),
    messages: cleanInt(body.messages, 0, 0, 9999),
    old_messages: cleanInt(body.old_messages, 0, 0, 9999),
    protocol: cleanExactChoice(body.protocol, PHONE_PROTOCOL_OPTIONS, 'SIP'),
    local_gmt: cleanExactChoice(body.local_gmt, GMT_OPTIONS, '-5.00', 6),
    ASTmgrUSERNAME: cleanText(body.ASTmgrUSERNAME, 20) || 'cron',
    ASTmgrSECRET: cleanText(body.ASTmgrSECRET, 20) || '1234',
    login_user: cleanText(body.login_user, 20),
    login_campaign: cleanId(body.login_campaign, 10),
    park_on_extension: cleanText(body.park_on_extension, 10) || '8301',
    conf_on_extension: cleanText(body.conf_on_extension, 10) || '8302',
    VICIDIAL_park_on_extension: cleanText(body.VICIDIAL_park_on_extension, 10) || '8301',
    VICIDIAL_park_on_filename: cleanText(body.VICIDIAL_park_on_filename, 10) || 'park',
    monitor_prefix: cleanText(body.monitor_prefix, 10) || '8612',
    recording_exten: cleanText(body.recording_exten, 10) || '8309',
    voicemail_exten: cleanText(body.voicemail_exten, 10) || '8501',
    voicemail_dump_exten: cleanText(body.voicemail_dump_exten, 20) || '85026666666666',
    voicemail_dump_exten_no_inst: cleanText(body.voicemail_dump_exten_no_inst, 20) || '85026666666667',
    ext_context: cleanText(body.ext_context, 20) || 'default',
    dtmf_send_extension: cleanText(body.dtmf_send_extension, 100) || 'local/8500998@default',
    call_out_number_group: cleanText(body.call_out_number_group, 100) || 'Zap/g2/',
    client_browser: cleanText(body.client_browser, 100),
    install_directory: cleanText(body.install_directory, 100),
    local_web_callerID_URL: cleanText(body.local_web_callerID_URL, 255),
    VICIDIAL_web_URL: cleanText(body.VICIDIAL_web_URL, 255),
    AGI_call_logging_enabled: boolFlag(body.AGI_call_logging_enabled, '1', '0'),
    user_switching_enabled: boolFlag(body.user_switching_enabled, '1', '0'),
    conferencing_enabled: boolFlag(body.conferencing_enabled, '1', '0'),
    admin_hangup_enabled: boolFlag(body.admin_hangup_enabled, '1', '0'),
    admin_hijack_enabled: boolFlag(body.admin_hijack_enabled, '1', '0'),
    admin_monitor_enabled: boolFlag(body.admin_monitor_enabled, '1', '0'),
    call_parking_enabled: boolFlag(body.call_parking_enabled, '1', '0'),
    updater_check_enabled: boolFlag(body.updater_check_enabled, '1', '0'),
    AFLogging_enabled: boolFlag(body.AFLogging_enabled, '1', '0'),
    QUEUE_ACTION_enabled: boolFlag(body.QUEUE_ACTION_enabled, '1', '0'),
    CallerID_popup_enabled: boolFlag(body.CallerID_popup_enabled, '1', '0'),
    voicemail_button_enabled: boolFlag(body.voicemail_button_enabled, '1', '0'),
    enable_fast_refresh: boolFlag(body.enable_fast_refresh, '1', '0'),
    fast_refresh_rate: cleanInt(body.fast_refresh_rate, 1000, 0, 99999),
    enable_persistant_mysql: boolFlag(body.enable_persistant_mysql, '1', '0'),
    auto_dial_next_number: boolFlag(body.auto_dial_next_number, '1', '0'),
    VDstop_rec_after_each_call: boolFlag(body.VDstop_rec_after_each_call, '1', '0'),
    outbound_cid: cleanText(body.outbound_cid, 20),
    outbound_alt_cid: cleanText(body.outbound_alt_cid, 20),
    enable_sipsak_messages: boolFlag(body.enable_sipsak_messages, '1', '0'),
    email: cleanText(body.email, 100),
    template_id: cleanText(body.template_id, 20),
    conf_override: cleanText(body.conf_override, 12000),
    phone_context: cleanText(body.phone_context, 20) || 'default',
    phone_ring_timeout: cleanInt(body.phone_ring_timeout, 60, 0, 999),
    conf_secret: cleanText(body.conf_secret, 20),
    delete_vm_after_email: ynFlag(body.delete_vm_after_email, 'N'),
    is_webphone: cleanChoice(body.is_webphone, PHONE_WEBPHONE_OPTIONS, 'N'),
    use_external_server_ip: ynFlag(body.use_external_server_ip, 'N'),
    codecs_list: cleanText(body.codecs_list, 100),
    codecs_with_template: boolFlag(body.codecs_with_template, '1', '0'),
    on_hook_agent: ynFlag(body.on_hook_agent, 'N'),
    voicemail_timezone: cleanText(body.voicemail_timezone, 30),
    voicemail_options: cleanText(body.voicemail_options, 255),
    user_group: codeText(body.user_group, 20, '---ALL---'),
    voicemail_greeting: cleanText(body.voicemail_greeting, 100),
    voicemail_instructions: ynFlag(body.voicemail_instructions, 'Y'),
    on_login_report: ynFlag(body.on_login_report, 'N'),
    unavail_dialplan_fwd_exten: cleanText(body.unavail_dialplan_fwd_exten, 40),
    unavail_dialplan_fwd_context: cleanText(body.unavail_dialplan_fwd_context, 100),
    nva_call_url: cleanText(body.nva_call_url, 12000),
    nva_search_method: codeText(body.nva_search_method, 40, 'NONE'),
    nva_error_filename: cleanText(body.nva_error_filename, 255),
    nva_new_list_id: cleanInt(body.nva_new_list_id, 995, 0, 999999999),
    nva_new_phone_code: cleanText(body.nva_new_phone_code, 10) || '1',
    nva_new_status: cleanId(body.nva_new_status, 6) || 'NVAINS',
    webphone_dialpad: cleanExactChoice(body.webphone_dialpad, PHONE_WEBPHONE_DIALPAD_OPTIONS, 'Y', 20),
    webphone_auto_answer: ynFlag(body.webphone_auto_answer, 'N'),
    webphone_dialbox: ynFlag(body.webphone_dialbox, 'Y'),
    webphone_mute: ynFlag(body.webphone_mute, 'Y'),
    webphone_volume: ynFlag(body.webphone_volume, 'Y'),
    webphone_debug: ynFlag(body.webphone_debug, 'N'),
    conf_qualify: ynFlag(body.conf_qualify, 'Y'),
    webphone_layout: cleanText(body.webphone_layout, 255),
    mohsuggest: cleanText(body.mohsuggest, 100),
    webphone_settings: cleanText(body.webphone_settings, 40),
  };
  const pass = cleanText(body.pass, 20);
  if (mode === 'create' || pass) payload.pass = pass;
  const loginPass = cleanText(body.login_pass, 100);
  if (loginPass) payload.login_pass = loginPass;
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

function serverPayload(body) {
  return {
    server_description: cleanText(body.server_description, 255),
    server_ip: cleanIp(body.server_ip),
    active: ynFlag(body.active, 'Y'),
    active_asterisk_server: ynFlag(body.active_asterisk_server, 'Y'),
    asterisk_version: cleanText(body.asterisk_version, 20),
    max_vicidial_trunks: cleanInt(body.max_vicidial_trunks, 23, 0, 9999),
    telnet_host: cleanText(body.telnet_host, 20) || 'localhost',
    telnet_port: cleanInt(body.telnet_port, 5038, 1, 65535),
    ASTmgrUSERNAME: cleanText(body.ASTmgrUSERNAME, 20) || 'cron',
    ASTmgrSECRET: cleanText(body.ASTmgrSECRET, 20) || '1234',
    ASTmgrUSERNAMEupdate: cleanText(body.ASTmgrUSERNAMEupdate, 20) || 'updatecron',
    ASTmgrUSERNAMElisten: cleanText(body.ASTmgrUSERNAMElisten, 20) || 'listencron',
    ASTmgrUSERNAMEsend: cleanText(body.ASTmgrUSERNAMEsend, 20) || 'sendcron',
    local_gmt: cleanExactChoice(body.local_gmt, GMT_OPTIONS, '-5.00', 6),
    voicemail_dump_exten: cleanText(body.voicemail_dump_exten, 20) || '85026666666666',
    voicemail_dump_exten_no_inst: cleanText(body.voicemail_dump_exten_no_inst, 20) || '85026666666667',
    answer_transfer_agent: cleanText(body.answer_transfer_agent, 20) || '8365',
    ext_context: cleanText(body.ext_context, 20) || 'default',
    sys_perf_log: ynFlag(body.sys_perf_log, 'N'),
    vd_server_logs: ynFlag(body.vd_server_logs, 'Y'),
    agi_output: cleanChoice(body.agi_output, ['NONE', 'STDERR', 'FILE', 'BOTH'], 'FILE'),
    vicidial_balance_active: ynFlag(body.vicidial_balance_active, 'N'),
    vicidial_balance_rank: cleanInt(body.vicidial_balance_rank, 0, 0, 255),
    balance_trunks_offlimits: cleanInt(body.balance_trunks_offlimits, 0, 0, 99999),
    recording_web_link: cleanChoice(body.recording_web_link, ['SERVER_IP', 'ALT_IP', 'EXTERNAL_IP'], 'SERVER_IP'),
    alt_server_ip: cleanText(body.alt_server_ip, 100),
    active_twin_server_ip: cleanText(body.active_twin_server_ip, 15),
    generate_vicidial_conf: ynFlag(body.generate_vicidial_conf, 'Y'),
    rebuild_conf_files: ynFlag(body.rebuild_conf_files, 'Y'),
    outbound_calls_per_second: cleanInt(body.outbound_calls_per_second, 5, 0, 999),
    sounds_update: ynFlag(body.sounds_update, 'N'),
    vicidial_recording_limit: cleanInt(body.vicidial_recording_limit, 60, 0, 999999),
    carrier_logging_active: ynFlag(body.carrier_logging_active, 'Y'),
    active_agent_login_server: ynFlag(body.active_agent_login_server, 'Y'),
    external_server_ip: cleanText(body.external_server_ip, 100),
    custom_dialplan_entry: cleanText(body.custom_dialplan_entry, 12000),
    user_group: codeText(body.user_group, 20, '---ALL---'),
    auto_restart_asterisk: ynFlag(body.auto_restart_asterisk, 'N'),
    asterisk_temp_no_restart: ynFlag(body.asterisk_temp_no_restart, 'N'),
    gather_asterisk_output: ynFlag(body.gather_asterisk_output, 'N'),
    web_socket_url: cleanText(body.web_socket_url, 255),
    external_web_socket_url: cleanText(body.external_web_socket_url, 255),
    conf_qualify: ynFlag(body.conf_qualify, 'Y'),
    routing_prefix: cleanText(body.routing_prefix, 10) || '13',
    conf_engine: cleanChoice(body.conf_engine, ['MEETME', 'CONFBRIDGE'], 'MEETME'),
    conf_secret: cleanText(body.conf_secret, 100) || 'test',
    conf_update_interval: cleanInt(body.conf_update_interval, 60, 1, 9999),
    ara_url: cleanText(body.ara_url, 12000),
  };
}

async function saveServer(req, res, mode) {
  if (!requireModify(req, res, 'modifyServers')) return;
  const id = cleanId(mode === 'create' ? req.body?.server_id : req.params.id, 10);
  if (!id) return badRequest(res, 'invalid_server_id');
  if (mode !== 'create' && !scopedUserGroupAllowed(req.genxUser, await recordUserGroup('servers', 'server_id', id))) {
    return res.status(403).json({ ok: false, error: 'server_not_allowed' });
  }
  const payload = serverPayload(req.body || {});
  if (!payload.server_ip) return badRequest(res, 'server_ip_required');
  if (!scopedUserGroupAllowed(req.genxUser, payload.user_group)) return res.status(403).json({ ok: false, error: 'server_scope_required' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO servers
         SET server_id = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'SERVERS', 'ADD', id, 'GENX ADD SERVER', 'INSERT INTO servers', payload.server_description);
    } else {
      const result = await execute(
        `UPDATE servers
         SET ${assignments}
         WHERE server_id = ?`,
        [...values, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'server_not_found' });
      await adminLog(req, 'SERVERS', 'MODIFY', id, 'GENX MODIFY SERVER', 'UPDATE servers', payload.server_description);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'server_exists' : 'server_write_failed' });
  }
}

function carrierPayload(body) {
  return {
    carrier_name: cleanText(body.carrier_name, 50) || 'New Carrier',
    registration_string: cleanText(body.registration_string, 255),
    template_id: cleanText(body.template_id, 15),
    account_entry: cleanText(body.account_entry, 12000),
    protocol: cleanExactChoice(body.protocol, ['SIP', 'PJSIP', 'PJSIP_WIZ', 'Zap', 'IAX2', 'EXTERNAL'], 'SIP', 20),
    globals_string: cleanText(body.globals_string, 255),
    dialplan_entry: cleanText(body.dialplan_entry, 12000),
    server_ip: cleanIp(body.server_ip),
    active: ynFlag(body.active, 'Y'),
    carrier_description: cleanText(body.carrier_description, 255),
    user_group: codeText(body.user_group, 20, '---ALL---'),
  };
}

async function saveCarrier(req, res, mode) {
  if (!requireModify(req, res, 'modifyCarriers')) return;
  const id = cleanId(mode === 'create' ? req.body?.carrier_id : req.params.id, 15);
  if (!id) return badRequest(res, 'invalid_carrier_id');
  if (mode !== 'create' && !scopedUserGroupAllowed(req.genxUser, await recordUserGroup('vicidial_server_carriers', 'carrier_id', id))) {
    return res.status(403).json({ ok: false, error: 'carrier_not_allowed' });
  }
  const payload = carrierPayload(req.body || {});
  if (!payload.server_ip) return badRequest(res, 'server_ip_required');
  if (!scopedUserGroupAllowed(req.genxUser, payload.user_group)) return res.status(403).json({ ok: false, error: 'carrier_scope_required' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_server_carriers
         SET carrier_id = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'CARRIERS', 'ADD', id, 'GENX ADD CARRIER', 'INSERT INTO vicidial_server_carriers', payload.carrier_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_server_carriers
         SET ${assignments}
         WHERE carrier_id = ?`,
        [...values, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'carrier_not_found' });
      await adminLog(req, 'CARRIERS', 'MODIFY', id, 'GENX MODIFY CARRIER', 'UPDATE vicidial_server_carriers', payload.carrier_name);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'carrier_exists' : 'carrier_write_failed' });
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

function filterPhoneGroupPayload(body) {
  return {
    filter_phone_group_name: cleanText(body.filter_phone_group_name, 40) || 'New Filter Group',
    filter_phone_group_description: cleanText(body.filter_phone_group_description, 100),
    user_group: codeText(body.user_group, 20, '---ALL---'),
  };
}

async function syncFilterPhoneNumbers(groupId, rawNumbers) {
  const numbers = parseDncPhoneNumbers(rawNumbers).map((value) => value.slice(0, 18));
  await execute('DELETE FROM vicidial_filter_phone_numbers WHERE filter_phone_group_id = ?', [groupId]);
  for (const phoneNumber of numbers) {
    await execute(
      'INSERT IGNORE INTO vicidial_filter_phone_numbers (phone_number, filter_phone_group_id) VALUES (?, ?)',
      [phoneNumber, groupId],
    );
  }
  return numbers.length;
}

async function saveFilterPhoneGroup(req, res, mode) {
  if (!requireModify(req, res, 'modifyFilters')) return;
  const id = cleanId(mode === 'create' ? req.body?.filter_phone_group_id : req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_filter_phone_group_id');
  if (mode !== 'create' && !scopedUserGroupAllowed(req.genxUser, await recordUserGroup('vicidial_filter_phone_groups', 'filter_phone_group_id', id))) {
    return res.status(403).json({ ok: false, error: 'filter_phone_group_not_allowed' });
  }
  const payload = filterPhoneGroupPayload(req.body || {});
  if (!scopedUserGroupAllowed(req.genxUser, payload.user_group)) return res.status(403).json({ ok: false, error: 'filter_phone_group_scope_required' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_filter_phone_groups
         SET filter_phone_group_id = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'FILTERPHONEGROUPS', 'ADD', id, 'GENX ADD FILTER PHONE GROUP', 'INSERT INTO vicidial_filter_phone_groups', payload.filter_phone_group_name);
    } else {
      const result = await execute(
        `UPDATE vicidial_filter_phone_groups
         SET ${assignments}
         WHERE filter_phone_group_id = ?`,
        [...values, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'filter_phone_group_not_found' });
      await adminLog(req, 'FILTERPHONEGROUPS', 'MODIFY', id, 'GENX MODIFY FILTER PHONE GROUP', 'UPDATE vicidial_filter_phone_groups', payload.filter_phone_group_name);
    }
    const phoneCount = await syncFilterPhoneNumbers(id, req.body?.phone_numbers);
    await adminLog(req, 'FILTERPHONEGROUPS', 'MODIFY', id, 'GENX SYNC FILTER PHONE NUMBERS', 'REPLACE vicidial_filter_phone_numbers', `${phoneCount} numbers`);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'filter_phone_group_exists' : 'filter_phone_group_write_failed' });
  }
}

async function deleteFilterPhoneGroup(req, res) {
  if (!requireModify(req, res, 'deleteFilters')) return;
  const id = cleanId(req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_filter_phone_group_id');
  if (!scopedUserGroupAllowed(req.genxUser, await recordUserGroup('vicidial_filter_phone_groups', 'filter_phone_group_id', id))) {
    return res.status(403).json({ ok: false, error: 'filter_phone_group_not_allowed' });
  }
  try {
    await execute('DELETE FROM vicidial_filter_phone_numbers WHERE filter_phone_group_id = ?', [id]);
    const result = await execute('DELETE FROM vicidial_filter_phone_groups WHERE filter_phone_group_id = ?', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'filter_phone_group_not_found' });
    await adminLog(req, 'FILTERPHONEGROUPS', 'DELETE', id, 'GENX DELETE FILTER PHONE GROUP', 'DELETE FROM vicidial_filter_phone_groups', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'filter_phone_group_delete_failed' });
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

async function deleteCallMenu(req, res) {
  if (!requireModify(req, res, 'modifyIngroups')) return;
  const id = cleanId(req.params.id, 50);
  if (!id) return badRequest(res, 'invalid_menu_id');
  if (!scopedUserGroupAllowed(req.genxUser, await recordUserGroup('vicidial_call_menu', 'menu_id', id))) {
    return res.status(403).json({ ok: false, error: 'call_menu_not_allowed' });
  }
  try {
    await execute('DELETE FROM vicidial_call_menu_options WHERE menu_id = ?', [id]);
    const result = await execute('DELETE FROM vicidial_call_menu WHERE menu_id = ?', [id]);
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'call_menu_not_found' });
    await adminLog(req, 'CALLMENU', 'DELETE', id, 'GENX DELETE CALL MENU', 'DELETE FROM vicidial_call_menu', id);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'call_menu_delete_failed' });
  }
}

function callMenuOptionKey(raw) {
  const [menuRaw, ...optionParts] = String(raw || '').split('__');
  return {
    menu_id: cleanId(menuRaw, 50),
    option_value: cleanCallMenuOptionValue(optionParts.join('__')),
  };
}

function cleanCallMenuOptionValue(value) {
  return cleanText(value, 20).toUpperCase().replace(/[^-_*#0-9A-Z]/g, '');
}

function callMenuRouteValue(value, max = 255) {
  return cleanText(value, max).replace(/[^-\/|_#*,.0-9a-zA-Z]/g, '');
}

function callMenuRouteContext(value) {
  return cleanText(value, 1000).replace(/[^-,_ 0-9a-zA-Z]/g, '');
}

async function callMenuVisibleToUser(user, menuId) {
  return scopedUserGroupAllowed(user, await recordUserGroup('vicidial_call_menu', 'menu_id', menuId));
}

function callMenuOptionPayload(body) {
  return {
    option_description: cleanText(body.option_description, 255),
    option_route: cleanChoice(body.option_route, CALL_MENU_ROUTE_OPTIONS, 'CALLMENU'),
    option_route_value: callMenuRouteValue(body.option_route_value, 255),
    option_route_value_context: callMenuRouteContext(body.option_route_value_context),
  };
}

async function saveCallMenuOption(req, res, mode) {
  if (!requireModify(req, res, 'modifyIngroups')) return;
  const key = mode === 'create'
    ? { menu_id: cleanId(req.body?.menu_id, 50), option_value: cleanCallMenuOptionValue(req.body?.option_value) }
    : callMenuOptionKey(req.params.id);
  if (!key.menu_id || !key.option_value) return badRequest(res, 'invalid_call_menu_option_key');
  if (!(await callMenuVisibleToUser(req.genxUser, key.menu_id))) {
    return res.status(403).json({ ok: false, error: 'call_menu_not_allowed' });
  }
  const payload = callMenuOptionPayload(req.body || {});
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_call_menu_options
         SET menu_id = ?,
             option_value = ?,
             ${assignments}`,
        [key.menu_id, key.option_value, ...values],
      );
      await adminLog(req, 'CALLMENUOPT', 'ADD', key.menu_id, 'GENX ADD CALL MENU OPTION', 'INSERT INTO vicidial_call_menu_options', `${key.option_value} -> ${payload.option_route}`);
    } else {
      const result = await execute(
        `UPDATE vicidial_call_menu_options
         SET ${assignments}
         WHERE menu_id = ?
           AND option_value = ?`,
        [...values, key.menu_id, key.option_value],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'call_menu_option_not_found' });
      await adminLog(req, 'CALLMENUOPT', 'MODIFY', key.menu_id, 'GENX MODIFY CALL MENU OPTION', 'UPDATE vicidial_call_menu_options', `${key.option_value} -> ${payload.option_route}`);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'call_menu_option_exists' : 'call_menu_option_write_failed' });
  }
}

async function deleteCallMenuOption(req, res) {
  if (!requireModify(req, res, 'modifyIngroups')) return;
  const key = callMenuOptionKey(req.params.id);
  if (!key.menu_id || !key.option_value) return badRequest(res, 'invalid_call_menu_option_key');
  if (!(await callMenuVisibleToUser(req.genxUser, key.menu_id))) {
    return res.status(403).json({ ok: false, error: 'call_menu_not_allowed' });
  }
  try {
    const result = await execute(
      'DELETE FROM vicidial_call_menu_options WHERE menu_id = ? AND option_value = ?',
      [key.menu_id, key.option_value],
    );
    if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'call_menu_option_not_found' });
    await adminLog(req, 'CALLMENUOPT', 'DELETE', key.menu_id, 'GENX DELETE CALL MENU OPTION', 'DELETE FROM vicidial_call_menu_options', key.option_value);
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    return res.status(500).json({ ok: false, error: 'call_menu_option_delete_failed' });
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

function campaignToolAllowed(user, campaignId) {
  return campaignId && scopeAllows(user?.permissions?.allowedCampaigns, campaignId);
}

function pauseCodePayload(body) {
  return {
    campaign_id: cleanId(body.campaign_id, 20),
    pause_code_name: cleanText(body.pause_code_name, 30) || 'Pause Code',
    billable: cleanExactChoice(body.billable, ['NO', 'YES', 'HALF'], 'NO', 4),
    time_limit: cleanInt(body.time_limit, 65000, 0, 65000),
    require_mgr_approval: cleanExactChoice(body.require_mgr_approval, ['NO', 'YES'], 'NO', 3),
  };
}

async function savePauseCode(req, res, mode) {
  if (!requireModify(req, res, 'modifyCampaigns')) return;
  const id = cleanId(mode === 'create' ? req.body?.pause_code : req.params.id, 6);
  if (!id) return badRequest(res, 'invalid_pause_code');
  const payload = pauseCodePayload(req.body || {});
  if (!campaignToolAllowed(req.genxUser, payload.campaign_id)) return res.status(403).json({ ok: false, error: 'campaign_not_allowed' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_pause_codes
         SET pause_code = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'PAUSECODES', 'ADD', payload.campaign_id, 'GENX ADD PAUSE CODE', 'INSERT INTO vicidial_pause_codes', `${id} - ${payload.pause_code_name}`);
    } else {
      const result = await execute(
        `UPDATE vicidial_pause_codes
         SET ${assignments}
         WHERE campaign_id = ?
           AND pause_code = ?`,
        [...values, payload.campaign_id, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'pause_code_not_found' });
      await adminLog(req, 'PAUSECODES', 'MODIFY', payload.campaign_id, 'GENX MODIFY PAUSE CODE', 'UPDATE vicidial_pause_codes', `${id} - ${payload.pause_code_name}`);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'pause_code_exists' : 'pause_code_write_failed' });
  }
}

function hotkeyPayload(body) {
  return {
    campaign_id: cleanId(body.campaign_id, 20),
    status: cleanId(body.status, 6),
    status_name: cleanText(body.status_name, 30) || 'Hotkey',
    selectable: ynFlag(body.selectable, 'Y'),
  };
}

function cleanHotkey(value) {
  return cleanText(value, 1).replace(/[^0-9a-zA-Z*#]/g, '') || '';
}

async function saveCampaignHotkey(req, res, mode) {
  if (!requireModify(req, res, 'modifyCampaigns')) return;
  const id = cleanHotkey(mode === 'create' ? req.body?.hotkey : req.params.id);
  if (!id) return badRequest(res, 'invalid_hotkey');
  const payload = hotkeyPayload(req.body || {});
  if (!payload.status) return badRequest(res, 'status_required');
  if (!campaignToolAllowed(req.genxUser, payload.campaign_id)) return res.status(403).json({ ok: false, error: 'campaign_not_allowed' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_campaign_hotkeys
         SET hotkey = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'CAMPAIGN_HOTKEYS', 'ADD', payload.campaign_id, 'GENX ADD CAMPAIGN HOTKEY', 'INSERT INTO vicidial_campaign_hotkeys', `${id} - ${payload.status}`);
    } else {
      const result = await execute(
        `UPDATE vicidial_campaign_hotkeys
         SET ${assignments}
         WHERE campaign_id = ?
           AND hotkey = ?`,
        [...values, payload.campaign_id, id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'hotkey_not_found' });
      await adminLog(req, 'CAMPAIGN_HOTKEYS', 'MODIFY', payload.campaign_id, 'GENX MODIFY CAMPAIGN HOTKEY', 'UPDATE vicidial_campaign_hotkeys', `${id} - ${payload.status}`);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'hotkey_exists' : 'hotkey_write_failed' });
  }
}

function leadRecyclePayload(body) {
  return {
    campaign_id: cleanId(body.campaign_id, 20),
    status: cleanId(body.status, 6),
    attempt_delay: cleanInt(body.attempt_delay, 1800, 0, 65000),
    attempt_maximum: cleanInt(body.attempt_maximum, 2, 1, 255),
    active: ynFlag(body.active, 'N'),
  };
}

async function saveLeadRecycle(req, res, mode) {
  if (!requireModify(req, res, 'modifyCampaigns')) return;
  const id = mode === 'create' ? 0 : cleanInt(req.params.id, 0, 1, 999999999);
  const payload = leadRecyclePayload(req.body || {});
  if (!payload.status) return badRequest(res, 'status_required');
  if (!campaignToolAllowed(req.genxUser, payload.campaign_id)) return res.status(403).json({ ok: false, error: 'campaign_not_allowed' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_lead_recycle
         SET ${assignments}`,
        values,
      );
      await adminLog(req, 'LEADRECYCLE', 'ADD', payload.campaign_id, 'GENX ADD LEAD RECYCLE', 'INSERT INTO vicidial_lead_recycle', payload.status);
    } else {
      const result = await execute(
        `UPDATE vicidial_lead_recycle
         SET ${assignments}
         WHERE recycle_id = ?
           AND campaign_id = ?`,
        [...values, id, payload.campaign_id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'lead_recycle_not_found' });
      await adminLog(req, 'LEADRECYCLE', 'MODIFY', payload.campaign_id, 'GENX MODIFY LEAD RECYCLE', 'UPDATE vicidial_lead_recycle', payload.status);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'lead_recycle_exists' : 'lead_recycle_write_failed' });
  }
}

function listMixPayload(body) {
  return {
    vcl_name: cleanText(body.vcl_name, 50) || 'List Mix',
    campaign_id: cleanId(body.campaign_id, 20),
    list_mix_container: cleanText(body.list_mix_container, 12000),
    mix_method: cleanExactChoice(body.mix_method, ['EVEN_MIX', 'IN_ORDER', 'RANDOM'], 'IN_ORDER', 20),
    status: cleanExactChoice(body.status, ['ACTIVE', 'INACTIVE'], 'INACTIVE', 10),
  };
}

async function saveListMix(req, res, mode) {
  if (!requireModify(req, res, 'modifyCampaigns')) return;
  const id = cleanId(mode === 'create' ? req.body?.vcl_id : req.params.id, 20);
  if (!id) return badRequest(res, 'invalid_list_mix_id');
  const payload = listMixPayload(req.body || {});
  if (!campaignToolAllowed(req.genxUser, payload.campaign_id)) return res.status(403).json({ ok: false, error: 'campaign_not_allowed' });
  const { assignments, values } = dynamicAssignments(payload);

  try {
    if (mode === 'create') {
      await execute(
        `INSERT INTO vicidial_campaigns_list_mix
         SET vcl_id = ?,
             ${assignments}`,
        [id, ...values],
      );
      await adminLog(req, 'LISTMIX', 'ADD', payload.campaign_id, 'GENX ADD LIST MIX', 'INSERT INTO vicidial_campaigns_list_mix', `${id} - ${payload.vcl_name}`);
    } else {
      const result = await execute(
        `UPDATE vicidial_campaigns_list_mix
         SET ${assignments}
         WHERE vcl_id = ?
           AND campaign_id = ?`,
        [...values, id, payload.campaign_id],
      );
      if (result.affectedRows < 1) return res.status(404).json({ ok: false, error: 'list_mix_not_found' });
      await adminLog(req, 'LISTMIX', 'MODIFY', payload.campaign_id, 'GENX MODIFY LIST MIX', 'UPDATE vicidial_campaigns_list_mix', `${id} - ${payload.vcl_name}`);
    }
    return res.json({ ok: true, data: await adminData(req.genxUser) });
  } catch (error) {
    const status = error.code === 'ER_DUP_ENTRY' ? 409 : 500;
    return res.status(status).json({ ok: false, error: status === 409 ? 'list_mix_exists' : 'list_mix_write_failed' });
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
app.delete('/api/admin/campaigns/:id', requireAccess, deleteCampaign);
app.post('/api/admin/campaigns/:id/logout-agents', requireAccess, logoutCampaignAgents);
app.post('/api/admin/users', requireAccess, (req, res) => saveUser(req, res, 'create'));
app.put('/api/admin/users/:id', requireAccess, (req, res) => saveUser(req, res, 'update'));
app.delete('/api/admin/users/:id', requireAccess, deleteUser);
app.get('/api/admin/users/:id/ranks', requireAccess, getUserRanks);
app.post('/api/admin/users/:id/ranks', requireAccess, saveUserRanks);
app.post('/api/admin/lists', requireAccess, (req, res) => saveList(req, res, 'create'));
app.put('/api/admin/lists/:id', requireAccess, (req, res) => saveList(req, res, 'update'));
app.delete('/api/admin/lists/:id', requireAccess, deleteList);
app.get('/api/admin/lists/:id/stats', requireAccess, listStats);
app.post('/api/admin/lists/:id/clear', requireAccess, clearList);
app.post('/api/admin/lists/:id/reset', requireAccess, resetList);
app.get('/api/admin/lists/:id/download', requireAccess, downloadList);
app.post('/api/admin/lead-loader', requireAccess, loadLeads);
app.post('/api/admin/dnc', requireAccess, bulkDnc);
app.get('/api/admin/dnc/search', requireAccess, dncSearch);
app.get('/api/reports/agent-monitor-log', requireAccess, agentMonitorLogReport);
app.get('/api/reports/realtime-main', requireAccess, realtimeMainReport);
app.get('/api/reports/campaign-summary', requireAccess, campaignSummaryReport);
app.get('/api/reports/whiteboard', requireAccess, whiteboardReport);
app.get('/api/reports/hopper-list', requireAccess, hopperListReport);
app.get('/api/reports/list-statuses', requireAccess, listStatusesReport);
app.get('/api/reports/list-campaign-statuses', requireAccess, listCampaignStatusesReport);
app.get('/api/reports/campaign-status-list', requireAccess, campaignStatusListReport);
app.get('/api/reports/dialer-inventory', requireAccess, dialerInventoryReport);
app.get('/api/reports/outbound-calling', requireAccess, outboundCallingReport);
app.get('/api/reports/outbound-interval', requireAccess, outboundIntervalReport);
app.post('/api/admin/inbound', requireAccess, (req, res) => saveInboundGroup(req, res, 'create'));
app.put('/api/admin/inbound/:id', requireAccess, (req, res) => saveInboundGroup(req, res, 'update'));
app.delete('/api/admin/inbound/:id', requireAccess, deleteInboundGroup);
app.get('/api/admin/inbound/:id/connections', requireAccess, inboundGroupConnections);
app.post('/api/admin/inbound/:id/agent-ranks', requireAccess, saveInboundGroupAgentRanks);
app.post('/api/admin/user-groups', requireAccess, (req, res) => saveUserGroup(req, res, 'create'));
app.put('/api/admin/user-groups/:id', requireAccess, (req, res) => saveUserGroup(req, res, 'update'));
app.delete('/api/admin/user-groups/:id', requireAccess, deleteUserGroup);
app.get('/api/admin/user-groups/:id/connections', requireAccess, userGroupConnections);
app.post('/api/admin/dids', requireAccess, (req, res) => saveDid(req, res, 'create'));
app.put('/api/admin/dids/:id', requireAccess, (req, res) => saveDid(req, res, 'update'));
app.delete('/api/admin/dids/:id', requireAccess, deleteDid);
app.get('/api/admin/dids/:id/connections', requireAccess, didConnections);
app.get('/api/admin/call-menus/:id/connections', requireAccess, callMenuConnections);
app.post('/api/admin/phones', requireAccess, (req, res) => savePhone(req, res, 'create'));
app.put('/api/admin/phones/:id', requireAccess, (req, res) => savePhone(req, res, 'update'));
app.delete('/api/admin/phones/:id', requireAccess, deletePhone);
app.post('/api/admin/servers', requireAccess, (req, res) => saveServer(req, res, 'create'));
app.put('/api/admin/servers/:id', requireAccess, (req, res) => saveServer(req, res, 'update'));
app.post('/api/admin/carriers', requireAccess, (req, res) => saveCarrier(req, res, 'create'));
app.put('/api/admin/carriers/:id', requireAccess, (req, res) => saveCarrier(req, res, 'update'));
app.delete('/api/admin/servers/:id', requireAccess, deleteServer);
app.post('/api/admin/remote-agents', requireAccess, (req, res) => saveRemoteAgent(req, res, 'create'));
app.put('/api/admin/remote-agents/:id', requireAccess, (req, res) => saveRemoteAgent(req, res, 'update'));
app.delete('/api/admin/remote-agents/:id', requireAccess, deleteRemoteAgent);
app.post('/api/admin/drop-lists', requireAccess, (req, res) => saveDropList(req, res, 'create'));
app.put('/api/admin/drop-lists/:id', requireAccess, (req, res) => saveDropList(req, res, 'update'));
app.delete('/api/admin/drop-lists/:id', requireAccess, deleteDropList);
app.post('/api/admin/phone-aliases', requireAccess, (req, res) => savePhoneAlias(req, res, 'create'));
app.put('/api/admin/phone-aliases/:id', requireAccess, (req, res) => savePhoneAlias(req, res, 'update'));
app.delete('/api/admin/phone-aliases/:id', requireAccess, deletePhoneAlias);
app.post('/api/admin/group-aliases', requireAccess, (req, res) => saveGroupAlias(req, res, 'create'));
app.put('/api/admin/group-aliases/:id', requireAccess, (req, res) => saveGroupAlias(req, res, 'update'));
app.delete('/api/admin/group-aliases/:id', requireAccess, deleteGroupAlias);
app.post('/api/admin/conferences', requireAccess, (req, res) => saveConference(req, res, 'conferences', 'create'));
app.put('/api/admin/conferences/:id', requireAccess, (req, res) => saveConference(req, res, 'conferences', 'update'));
app.delete('/api/admin/conferences/:id', requireAccess, (req, res) => deleteConference(req, res, 'conferences'));
app.post('/api/admin/agent-conferences', requireAccess, (req, res) => saveConference(req, res, 'vicidial_conferences', 'create'));
app.put('/api/admin/agent-conferences/:id', requireAccess, (req, res) => saveConference(req, res, 'vicidial_conferences', 'update'));
app.delete('/api/admin/agent-conferences/:id', requireAccess, (req, res) => deleteConference(req, res, 'vicidial_conferences'));
app.post('/api/admin/ip-lists', requireAccess, (req, res) => saveIpList(req, res, 'create'));
app.put('/api/admin/ip-lists/:id', requireAccess, (req, res) => saveIpList(req, res, 'update'));
app.delete('/api/admin/ip-lists/:id', requireAccess, deleteIpList);
app.post('/api/admin/cid-groups', requireAccess, (req, res) => saveCidGroup(req, res, 'create'));
app.put('/api/admin/cid-groups/:id', requireAccess, (req, res) => saveCidGroup(req, res, 'update'));
app.delete('/api/admin/cid-groups/:id', requireAccess, deleteCidGroup);
app.post('/api/admin/queue-groups', requireAccess, (req, res) => saveQueueGroup(req, res, 'create'));
app.put('/api/admin/queue-groups/:id', requireAccess, (req, res) => saveQueueGroup(req, res, 'update'));
app.delete('/api/admin/queue-groups/:id', requireAccess, deleteQueueGroup);
app.post('/api/admin/contacts', requireAccess, (req, res) => saveContact(req, res, 'create'));
app.put('/api/admin/contacts/:id', requireAccess, (req, res) => saveContact(req, res, 'update'));
app.delete('/api/admin/contacts/:id', requireAccess, deleteContact);
app.post('/api/admin/languages', requireAccess, (req, res) => saveLanguage(req, res, 'create'));
app.put('/api/admin/languages/:id', requireAccess, (req, res) => saveLanguage(req, res, 'update'));
app.delete('/api/admin/languages/:id', requireAccess, deleteLanguage);
app.post('/api/admin/voicemail-boxes', requireAccess, (req, res) => saveVoicemailBox(req, res, 'create'));
app.put('/api/admin/voicemail-boxes/:id', requireAccess, (req, res) => saveVoicemailBox(req, res, 'update'));
app.delete('/api/admin/voicemail-boxes/:id', requireAccess, deleteVoicemailBox);
app.post('/api/admin/vm-message-groups', requireAccess, (req, res) => saveVmMessageGroup(req, res, 'create'));
app.put('/api/admin/vm-message-groups/:id', requireAccess, (req, res) => saveVmMessageGroup(req, res, 'update'));
app.delete('/api/admin/vm-message-groups/:id', requireAccess, deleteVmMessageGroup);
app.post('/api/admin/automated-reports', requireAccess, (req, res) => saveAutomatedReport(req, res, 'create'));
app.put('/api/admin/automated-reports/:id', requireAccess, (req, res) => saveAutomatedReport(req, res, 'update'));
app.delete('/api/admin/automated-reports/:id', requireAccess, deleteAutomatedReport);
app.post('/api/admin/moh', requireAccess, (req, res) => saveSimpleMedia(req, res, 'moh', 'create'));
app.put('/api/admin/moh/:id', requireAccess, (req, res) => saveSimpleMedia(req, res, 'moh', 'update'));
app.delete('/api/admin/moh/:id', requireAccess, (req, res) => deleteSimpleMedia(req, res, 'moh'));
app.post('/api/admin/tts', requireAccess, (req, res) => saveSimpleMedia(req, res, 'tts', 'create'));
app.put('/api/admin/tts/:id', requireAccess, (req, res) => saveSimpleMedia(req, res, 'tts', 'update'));
app.delete('/api/admin/tts/:id', requireAccess, (req, res) => deleteSimpleMedia(req, res, 'tts'));
app.post('/api/admin/soundboards', requireAccess, (req, res) => saveSimpleMedia(req, res, 'soundboards', 'create'));
app.put('/api/admin/soundboards/:id', requireAccess, (req, res) => saveSimpleMedia(req, res, 'soundboards', 'update'));
app.delete('/api/admin/soundboards/:id', requireAccess, (req, res) => deleteSimpleMedia(req, res, 'soundboards'));
app.post('/api/admin/state-call-times', requireAccess, (req, res) => saveStateCallTime(req, res, 'create'));
app.put('/api/admin/state-call-times/:id', requireAccess, (req, res) => saveStateCallTime(req, res, 'update'));
app.delete('/api/admin/state-call-times/:id', requireAccess, deleteStateCallTime);
app.post('/api/admin/holidays', requireAccess, (req, res) => saveHoliday(req, res, 'create'));
app.put('/api/admin/holidays/:id', requireAccess, (req, res) => saveHoliday(req, res, 'update'));
app.delete('/api/admin/holidays/:id', requireAccess, deleteHoliday);
app.post('/api/admin/status-groups', requireAccess, (req, res) => saveStatusGroup(req, res, 'create'));
app.put('/api/admin/status-groups/:id', requireAccess, (req, res) => saveStatusGroup(req, res, 'update'));
app.delete('/api/admin/status-groups/:id', requireAccess, deleteStatusGroup);
app.post('/api/admin/screen-labels', requireAccess, (req, res) => saveScreenLabel(req, res, 'create'));
app.put('/api/admin/screen-labels/:id', requireAccess, (req, res) => saveScreenLabel(req, res, 'update'));
app.delete('/api/admin/screen-labels/:id', requireAccess, deleteScreenLabel);
app.post('/api/admin/screen-colors', requireAccess, (req, res) => saveScreenColor(req, res, 'create'));
app.put('/api/admin/screen-colors/:id', requireAccess, (req, res) => saveScreenColor(req, res, 'update'));
app.delete('/api/admin/screen-colors/:id', requireAccess, deleteScreenColor);
app.post('/api/admin/settings-containers', requireAccess, (req, res) => saveSettingsContainer(req, res, 'create'));
app.put('/api/admin/settings-containers/:id', requireAccess, (req, res) => saveSettingsContainer(req, res, 'update'));
app.delete('/api/admin/settings-containers/:id', requireAccess, deleteSettingsContainer);
app.get('/api/admin/system-settings', requireAccess, getSystemSettings);
app.put('/api/admin/system-settings', requireAccess, saveSystemSettings);
app.delete('/api/admin/carriers/:id', requireAccess, deleteCarrier);
app.post('/api/admin/scripts', requireAccess, (req, res) => saveScript(req, res, 'create'));
app.put('/api/admin/scripts/:id', requireAccess, (req, res) => saveScript(req, res, 'update'));
app.delete('/api/admin/scripts/:id', requireAccess, deleteScript);
app.get('/api/admin/scripts/:id/connections', requireAccess, scriptConnections);
app.post('/api/admin/lead-filters', requireAccess, (req, res) => saveLeadFilter(req, res, 'create'));
app.put('/api/admin/lead-filters/:id', requireAccess, (req, res) => saveLeadFilter(req, res, 'update'));
app.delete('/api/admin/lead-filters/:id', requireAccess, deleteLeadFilter);
app.get('/api/admin/lead-filters/:id/connections', requireAccess, leadFilterConnections);
app.post('/api/admin/filter-phone-groups', requireAccess, (req, res) => saveFilterPhoneGroup(req, res, 'create'));
app.put('/api/admin/filter-phone-groups/:id', requireAccess, (req, res) => saveFilterPhoneGroup(req, res, 'update'));
app.delete('/api/admin/filter-phone-groups/:id', requireAccess, deleteFilterPhoneGroup);
app.post('/api/admin/call-times', requireAccess, (req, res) => saveCallTime(req, res, 'create'));
app.put('/api/admin/call-times/:id', requireAccess, (req, res) => saveCallTime(req, res, 'update'));
app.post('/api/admin/call-menus', requireAccess, (req, res) => saveCallMenu(req, res, 'create'));
app.put('/api/admin/call-menus/:id', requireAccess, (req, res) => saveCallMenu(req, res, 'update'));
app.delete('/api/admin/call-menus/:id', requireAccess, deleteCallMenu);
app.post('/api/admin/call-menu-options', requireAccess, (req, res) => saveCallMenuOption(req, res, 'create'));
app.put('/api/admin/call-menu-options/:id', requireAccess, (req, res) => saveCallMenuOption(req, res, 'update'));
app.delete('/api/admin/call-menu-options/:id', requireAccess, deleteCallMenuOption);
app.post('/api/admin/shifts', requireAccess, (req, res) => saveShift(req, res, 'create'));
app.put('/api/admin/shifts/:id', requireAccess, (req, res) => saveShift(req, res, 'update'));
app.post('/api/admin/pause-codes', requireAccess, (req, res) => savePauseCode(req, res, 'create'));
app.put('/api/admin/pause-codes/:id', requireAccess, (req, res) => savePauseCode(req, res, 'update'));
app.post('/api/admin/campaign-hotkeys', requireAccess, (req, res) => saveCampaignHotkey(req, res, 'create'));
app.put('/api/admin/campaign-hotkeys/:id', requireAccess, (req, res) => saveCampaignHotkey(req, res, 'update'));
app.post('/api/admin/lead-recycle', requireAccess, (req, res) => saveLeadRecycle(req, res, 'create'));
app.put('/api/admin/lead-recycle/:id', requireAccess, (req, res) => saveLeadRecycle(req, res, 'update'));
app.post('/api/admin/list-mixes', requireAccess, (req, res) => saveListMix(req, res, 'create'));
app.put('/api/admin/list-mixes/:id', requireAccess, (req, res) => saveListMix(req, res, 'update'));
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
