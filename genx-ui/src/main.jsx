/**
 * GenX UI frontend — the entire React app in one file, served at /genx/.
 * It contains TWO applications that share helpers but render separately:
 *   - Admin UI: AdminShell + the admin/report views (hash-routed as
 *     #/viewKey — see viewFromHash/navigateTo; nav/catalog links are real
 *     anchors so ctrl/middle-click opens new tabs).
 *   - Agent UI: AgentApp/AgentConsole at /genx/agent — a port of the legacy
 *     agc agent screen against /api/agent/*.
 *
 * Conventions worth knowing before editing:
 *   - Dates: ALWAYS default from localDateStr()/localSqlNow() — VICIdial
 *     stores DB-local times; toISOString() is the UTC day and breaks evening
 *     shifts (see the comment on localDateStr).
 *   - CSV: downloadCsv() neutralizes spreadsheet formula injection — route
 *     any new export through it.
 *   - Loaders: views that re-query on picker changes carry a seq/ref guard
 *     against out-of-order responses; destructive actions must target the
 *     LOADED entity (loadedUser/loadedTarget patterns), never live form
 *     state.
 *   - apiFetch() throws Error with .status and .message = server error code;
 *     401 handling is per-view (onLogout).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  ArrowRightLeft,
  BarChart3,
  BookOpen,
  CalendarDays,
  CircleDot,
  Clock3,
  Compass,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Gauge,
  Hash,
  Headphones,
  History,
  Mail,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  MessageSquare,
  Mic,
  MicOff,
  Pause,
  Pencil,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneOff,
  Play,
  Plus,
  RefreshCcw,
  Radio,
  Save,
  Search,
  Server,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Timer,
  Trash2,
  TrendingUp,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { REPORT_GROUPS, LEGACY_REPORT_GROUPS } from './catalog';
import './styles.css';

const API_BASE = `${import.meta.env.BASE_URL}api`;
const TOKEN_KEY = 'genx-ui-access-token';
const HOPPER_LEVELS = ['1', '5', '10', '20', '50', '100', '200', '500', '700', '1000', '2000', '3000', '4000', '5000'];
const LEAD_ORDER_BASES = [
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
const LEAD_ORDER_OPTIONS = [
  ...LEAD_ORDER_BASES,
  ...['2nd NEW', '3rd NEW', '4th NEW', '5th NEW', '6th NEW'].flatMap((suffix) => LEAD_ORDER_BASES.map((prefix) => `${prefix} ${suffix}`)),
];
const NEXT_AGENT_CALL_OPTIONS = [
  'random',
  'oldest_call_start',
  'oldest_call_finish',
  'overall_user_level',
  'campaign_rank',
  'campaign_grade_random',
  'fewest_calls',
  'longest_wait_time',
  'overall_user_level_wait_time',
  'campaign_rank_wait_time',
  'fewest_calls_wait_time',
];
const TALLY_THRESHOLD_OPTIONS = ['DISABLED', 'LOGGED-IN_AGENTS', 'NON-PAUSED_AGENTS', 'WAITING_AGENTS'];
const TALLY_AGENT_OPTIONS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '25', '30', '35', '40', '50'];
const CONCURRENT_TRANSFER_OPTIONS = ['AUTO', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '15', '20', '25', '30', '40', '50', '60', '80', '100', '1000', '10000'];
const INBOUND_QUEUE_NO_DIAL_OPTIONS = ['DISABLED', 'ENABLED', 'ALL_SERVERS'];
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
const CALL_MENU_OPTION_VALUE_OPTIONS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '#', 'TIMECHECK', 'TIMEOUT', 'INVALID', 'I', 'T', 'HANGUP', 'H'];
const CUSTOM_CID_OPTIONS = ['Y', 'N', 'AREACODE', 'USER_CUSTOM_1', 'USER_CUSTOM_2', 'USER_CUSTOM_3', 'USER_CUSTOM_4', 'USER_CUSTOM_5'];
const AGENT_SEARCH_OPTIONS = ['', 'LB', 'LO', 'SO'];
const TRANSFER_BUTTON_LAUNCH_OPTIONS = ['NONE', 'SCRIPT', 'SCRIPTTWO', 'WEBFORM', 'WEBFORMTWO', 'WEBFORMTHREE', 'FORM'];
const SCHEDULED_CALLBACK_ALERT_OPTIONS = ['NONE', 'BLINK', 'RED', 'BLINK_RED', 'BLINK_DEFER', 'RED_DEFER', 'BLINK_RED_DEFER'];
const SCHEDULED_CALLBACK_AUTO_RESCHEDULE_OPTIONS = ['NONE', 'ALL', 'DISPO_DEAD', 'DISPO_NA', 'DISPO_BUSY', 'DISPO_DROP', 'DISPO_INCALL', 'DISPO_NEW'];
const TIMER_ACTION_OPTIONS = [
  'NONE',
  'D1_DIAL',
  'D2_DIAL',
  'D3_DIAL',
  'D4_DIAL',
  'D5_DIAL',
  'D1_DIAL_QUIET',
  'D2_DIAL_QUIET',
  'D3_DIAL_QUIET',
  'D4_DIAL_QUIET',
  'D5_DIAL_QUIET',
  'MESSAGE_ONLY',
  'WEBFORM',
  'HANGUP',
  'CALLMENU',
  'EXTENSION',
  'IN_GROUP',
];
const AGENT_HANGUP_ROUTE_OPTIONS = ['HANGUP', 'MESSAGE', 'EXTENSION', 'IN_GROUP', 'CALLMENU'];
const PARK_CALL_IVR_OPTIONS = ['DISABLED', 'ENABLED', 'ENABLED_PARK_ONLY', 'ENABLED_BUTTON_HIDDEN'];
const HIDE_CALL_LOG_OPTIONS = ['Y', 'N', 'SHOW_1', 'SHOW_2', 'SHOW_3', 'SHOW_4', 'SHOW_5', 'SHOW_6', 'SHOW_7', 'SHOW_8', 'SHOW_9', 'SHOW_10'];
const DEAD_STOP_RECORDING_OPTIONS = ['DISABLED', 'ALL_CALLS', 'OUTBOUND_ONLY', 'INBOUND_ONLY', 'AUTODIAL_ONLY', 'MANUAL_ONLY'];
const USER_LEVEL_OPTIONS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];
const ADMIN_COLOR_OPTIONS = ['WHITE', 'BLACK', 'BLUE', 'RED', 'YELLOW', 'GREEN', 'PURPLE', 'ORANGE'];
const SCRIPT_COLOR_OPTIONS = ['white', 'black', 'blue', 'red', 'yellow', 'green', 'purple', 'orange'];
const GMT_OPTIONS = ['-12.00', '-11.00', '-10.00', '-9.00', '-8.00', '-7.00', '-6.00', '-5.00', '-4.00', '-3.00', '-2.00', '-1.00', '0.00', '1.00', '2.00', '3.00', '4.00', '5.00', '6.00', '7.00', '8.00', '9.00', '10.00', '11.00', '12.00'];
const STATUS_CATEGORY_OPTIONS = ['UNDEFINED', 'SALE', 'DNC', 'CALLBK', 'CONTACT', 'NI', 'UNWORKABLE', 'AM', 'DROP', 'NA', 'OTHER'];
const ENABLED_DISABLED_OPTIONS = ['ENABLED', 'DISABLED'];
const TRANSFER_PRESET_OPTIONS = ['N', 'PRESET_1', 'PRESET_2', 'PRESET_3', 'PRESET_4', 'PRESET_5'];
const QUICK_TRANSFER_OPTIONS = ['N', 'IN_GROUP', 'PRESET_1', 'PRESET_2', 'PRESET_3', 'PRESET_4', 'PRESET_5', 'LOCKED_IN_GROUP', 'LOCKED_PRESET_1', 'LOCKED_PRESET_2', 'LOCKED_PRESET_3', 'LOCKED_PRESET_4', 'LOCKED_PRESET_5'];
const TRANSFER_NO_DISPO_OPTIONS = ['DISABLED', 'EXTERNAL_ONLY', 'LOCAL_ONLY', 'LEAVE3WAY_ONLY', 'LOCAL_AND_EXTERNAL', 'LOCAL_AND_LEAVE3WAY', 'LEAVE3WAY_AND_EXTERNAL', 'LOCAL_AND_EXTERNAL_AND_LEAVE3WAY'];
const CUSTOM_3WAY_OPTIONS = ['DISABLED', 'PRESET_1', 'PRESET_2', 'PRESET_3', 'PRESET_4', 'PRESET_5', 'FIELD_address3', 'FIELD_province', 'FIELD_security_phrase', 'FIELD_vendor_lead_code', 'FIELD_email', 'FIELD_owner', 'PARK_PRESET_1', 'PARK_PRESET_2', 'PARK_PRESET_3', 'PARK_PRESET_4', 'PARK_PRESET_5', 'PARK_FIELD_address3', 'PARK_FIELD_province', 'PARK_FIELD_security_phrase', 'PARK_FIELD_vendor_lead_code', 'PARK_FIELD_email', 'PARK_FIELD_owner', 'VIEW_PRESET', 'VIEW_CONTACTS'];
const AGENT_LEAD_SEARCH_METHOD_OPTIONS = ['SYSTEM', 'CAMPAIGNLISTS', 'CAMPLISTS_ALL', 'LIST', 'USER_CAMPAIGNLISTS', 'USER_CAMPLISTS_ALL', 'USER_LIST', 'GROUP_SYSTEM', 'GROUP_CAMPAIGNLISTS', 'GROUP_CAMPLISTS_ALL', 'GROUP_LIST'];
const AGENT_OWNER_ONLY_OPTIONS = ['NONE', 'USER', 'USER_GROUP', 'USER_BLANK', 'USER_GROUP_BLANK'];
const STATUS_DISPLAY_FIELD_OPTIONS = ['NAME', 'CALLID', 'LEADID', 'LISTID', 'CALLID_LEADID', 'CALLID_LISTID', 'CALLID_LEADID_LISTID', 'NAME_CALLID', 'NAME_CALLID_LEADID', 'NAME_CALLID_LISTID', 'NAME_CALLID_LEADID_LISTID', '---NONE---'];
const AGENT_SCREEN_TIME_OPTIONS = ['DISABLED', 'ENABLED_BASIC', 'ENABLED_FULL', 'ENABLED_BILL_BREAK_LUNCH_COACH', 'ENABLED_BASIC_RANGE', 'ENABLED_FULL_RANGE', 'ENABLED_EXTENDED_RANGE', 'ENABLED_BILL_BREAK_LUNCH_COACH_RANGE'];
const MANUAL_DIAL_FILTER_OPTIONS = ['NONE', 'DNC_ONLY', 'CAMPDNC_ONLY', 'INTERNALDNC_ONLY', 'DNC_AND_CAMPDNC', 'CAMPLISTS_ONLY', 'CAMPLISTS_ALL', 'SYSTEM', 'DNC_AND_CAMPLISTS', 'CAMPDNC_ONLY_AND_CAMPLISTS', 'INTERNALDNC_ONLY_AND_CAMPLISTS', 'DNC_AND_CAMPDNC_AND_CAMPLISTS', 'DNC_AND_CAMPLISTS_ALL', 'CAMPDNC_ONLY_AND_CAMPLISTS_ALL', 'INTERNALDNC_ONLY_AND_CAMPLISTS_ALL', 'DNC_AND_CAMPDNC_AND_CAMPLISTS_ALL', 'DNC_AND_SYSTEM', 'CAMPDNC_ONLY_AND_SYSTEM', 'INTERNALDNC_ONLY_AND_SYSTEM', 'DNC_AND_CAMPDNC_AND_SYSTEM', 'NONE_WITH_ALT', 'DNC_ONLY_WITH_ALT', 'CAMPDNC_ONLY_WITH_ALT', 'INTERNALDNC_ONLY_WITH_ALT', 'DNC_AND_CAMPDNC_WITH_ALT', 'CAMPLISTS_ONLY_WITH_ALT', 'CAMPLISTS_ALL_WITH_ALT', 'SYSTEM_WITH_ALT', 'DNC_AND_CAMPLISTS_WITH_ALT', 'CAMPDNC_ONLY_AND_CAMPLISTS_WITH_ALT', 'INTERNALDNC_ONLY_AND_CAMPLISTS_WITH_ALT', 'DNC_AND_CAMPDNC_AND_CAMPLISTS_WITH_ALT', 'DNC_AND_CAMPLISTS_ALL_WITH_ALT', 'CAMPDNC_ONLY_AND_CAMPLISTS_ALL_WITH_ALT', 'INTERNALDNC_ONLY_AND_CAMPLISTS_ALL_WITH_ALT', 'DNC_AND_CAMPDNC_AND_CAMPLISTS_ALL_WITH_ALT', 'DNC_AND_SYSTEM_WITH_ALT', 'CAMPDNC_ONLY_AND_SYSTEM_WITH_ALT', 'INTERNALDNC_ONLY_AND_SYSTEM_WITH_ALT', 'DNC_AND_CAMPDNC_AND_SYSTEM_WITH_ALT', 'NONE_WITH_ALT_ADDR3', 'DNC_ONLY_WITH_ALT_ADDR3', 'CAMPDNC_ONLY_WITH_ALT_ADDR3', 'INTERNALDNC_ONLY_WITH_ALT_ADDR3', 'DNC_AND_CAMPDNC_WITH_ALT_ADDR3', 'CAMPLISTS_ONLY_WITH_ALT_ADDR3', 'CAMPLISTS_ALL_WITH_ALT_ADDR3', 'SYSTEM_WITH_ALT_ADDR3', 'DNC_AND_CAMPLISTS_WITH_ALT_ADDR3', 'CAMPDNC_ONLY_AND_CAMPLISTS_WITH_ALT_ADDR3', 'INTERNALDNC_ONLY_AND_CAMPLISTS_WITH_ALT_ADDR3', 'DNC_AND_CAMPDNC_AND_CAMPLISTS_WITH_ALT_ADDR3', 'DNC_AND_CAMPLISTS_ALL_WITH_ALT_ADDR3', 'CAMPDNC_ONLY_AND_CAMPLISTS_ALL_WITH_ALT_ADDR3', 'INTERNALDNC_ONLY_AND_CAMPLISTS_ALL_WITH_ALT_ADDR3', 'DNC_AND_CAMPDNC_AND_CAMPLISTS_ALL_WITH_ALT_ADDR3', 'DNC_AND_SYSTEM_WITH_ALT_ADDR3', 'CAMPDNC_ONLY_AND_SYSTEM_WITH_ALT_ADDR3', 'INTERNALDNC_ONLY_AND_SYSTEM_WITH_ALT_ADDR3', 'DNC_AND_CAMPDNC_AND_SYSTEM_WITH_ALT_ADDR3', 'CALLBACK', 'DNC_AND_CALLBACK', 'CAMPDNC_ONLY_AND_CALLBACK', 'INTERNALDNC_ONLY_AND_CALLBACK', 'DNC_AND_CAMPDNC_AND_CALLBACK', 'NONE_WITH_ALT_AND_CALLBACK', 'DNC_ONLY_WITH_ALT_AND_CALLBACK', 'CAMPDNC_ONLY_WITH_ALT_AND_CALLBACK', 'INTERNALDNC_ONLY_WITH_ALT_AND_CALLBACK', 'DNC_AND_CAMPDNC_WITH_ALT_AND_CALLBACK', 'NONE_WITH_ALT_ADDR3_AND_CALLBACK', 'DNC_ONLY_WITH_ALT_ADDR3_AND_CALLBACK', 'CAMPDNC_ONLY_WITH_ALT_ADDR3_AND_CALLBACK', 'INTERNALDNC_ONLY_WITH_ALT_ADDR3_AND_CALLBACK', 'DNC_AND_CAMPDNC_WITH_ALT_ADDR3_AND_CALLBACK'];
const MANUAL_SEARCH_FILTER_OPTIONS = ['NONE', 'CAMPLISTS_ONLY', 'CAMPLISTS_ALL', 'NONE_WITH_ALT', 'CAMPLISTS_ONLY_WITH_ALT', 'CAMPLISTS_ALL_WITH_ALT', 'NONE_WITH_ALT_ADDR3', 'CAMPLISTS_ONLY_WITH_ALT_ADDR3', 'CAMPLISTS_ALL_WITH_ALT_ADDR3'];
const QUEUE_FIELD_OPTIONS = ['DISABLED', 'lead_id', 'entry_date', 'status', 'user', 'vendor_lead_code', 'source_id', 'list_id', 'gmt_offset_now', 'called_since_last_reset', 'phone_code', 'phone_number', 'title', 'first_name', 'middle_initial', 'last_name', 'address1', 'address2', 'address3', 'city', 'state', 'province', 'postal_code', 'country_code', 'gender', 'date_of_birth', 'alt_phone', 'email', 'security_phrase', 'comments', 'called_count', 'last_local_call_time', 'rank', 'owner', 'entry_list_id'];
const LEAD_FIELD_OPTIONS = [
  'DISABLED',
  'vendor_lead_code',
  'source_id',
  'list_id',
  'phone_code',
  'phone_number',
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
  'alt_phone',
  'email',
  'security_phrase',
  'comments',
  'rank',
  'owner',
  'entry_list_id',
];
const RECORDING_FILENAME_OPTIONS = ['FULLDATE_CUSTPHONE', 'FULLDATE_CUSTPHONE_CAMPAIGN', 'FULLDATE_CUSTPHONE_USER', 'FULLDATE_CUSTPHONE_LEADID', 'DATE_TIME_PHONE', 'DATE_TIME_PHONE_USER', 'CUSTPHONE', 'LEADID', 'CAMPAIGN_LEADID', 'CALLID'];
const WEEKDAY_OPTIONS = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '2', label: 'Tuesday' },
  { value: '3', label: 'Wednesday' },
  { value: '4', label: 'Thursday' },
  { value: '5', label: 'Friday' },
  { value: '6', label: 'Saturday' },
];

const NAV_ITEMS = [
  { key: 'command', label: 'Command', eyebrow: 'Live Operations', title: 'GenX command layer', icon: LayoutDashboard },
  { key: 'campaigns', label: 'Campaigns', eyebrow: 'Admin', title: 'Campaign Control', icon: Radio },
  { key: 'users', label: 'Users', eyebrow: 'Admin', title: 'Users and Permissions', icon: Users },
  { key: 'userGroups', label: 'Groups', eyebrow: 'Access', title: 'User Groups', icon: ShieldCheck },
  { key: 'lists', label: 'Lists', eyebrow: 'Admin', title: 'Lists and Lead Inventory', icon: Database },
  { key: 'leadSearch', label: 'Lead Search', eyebrow: 'Lists', title: 'Lead Search and Modify', icon: Search },
  { key: 'leadLoader', label: 'Lead Loader', eyebrow: 'Admin', title: 'Lead Loader', icon: FileText },
  { key: 'dnc', label: 'DNC', eyebrow: 'Compliance', title: 'Do Not Call Management', icon: ShieldCheck },
  { key: 'inbound', label: 'Inbound', eyebrow: 'Admin', title: 'Inbound Groups', icon: Headphones },
  { key: 'dids', label: 'DIDs', eyebrow: 'Inbound', title: 'DID Routing', icon: PhoneCall },
  { key: 'callMenus', label: 'Call Menus', eyebrow: 'Inbound', title: 'Call Menu Routing', icon: Compass },
  { key: 'filterPhoneGroups', label: 'Filter Groups', eyebrow: 'Inbound', title: 'Filter Phone Groups', icon: SlidersHorizontal },
  { key: 'phones', label: 'Phones', eyebrow: 'Platform', title: 'Phones and Webphones', icon: PhoneCall },
  { key: 'scripts', label: 'Scripts', eyebrow: 'Admin', title: 'Scripts and Agent Prompts', icon: FileText },
  { key: 'leadFilters', label: 'Filters', eyebrow: 'Admin', title: 'Lead Filters', icon: SlidersHorizontal },
  { key: 'callTimes', label: 'Call Times', eyebrow: 'Admin', title: 'Call Times', icon: Timer },
  { key: 'shifts', label: 'Shifts', eyebrow: 'Access', title: 'Shifts and Login Windows', icon: Clock3 },
  { key: 'statuses', label: 'Statuses', eyebrow: 'Admin', title: 'Statuses and Outcomes', icon: Gauge },
  { key: 'reports', label: 'Reports', eyebrow: 'Reporting', title: 'Reporting Center', icon: FileText },
  { key: 'recordings', label: 'Recordings', eyebrow: 'Reports', title: 'Recent Recordings', icon: Activity },
  { key: 'system', label: 'System', eyebrow: 'Platform', title: 'Servers and Carriers', icon: Server },
  { key: 'remoteAgents', label: 'Remote Agents', eyebrow: 'Users', title: 'Remote Agents', icon: Headphones },
  { key: 'dropLists', label: 'Drop Lists', eyebrow: 'Lists', title: 'Drop Lists', icon: Database },
  { key: 'mediaTools', label: 'Media & Tools', eyebrow: 'Platform', title: 'Media and Tools', icon: SlidersHorizontal },
  { key: 'display', label: 'Settings Containers', eyebrow: 'Platform', title: 'Settings Containers', icon: LayoutDashboard },
  { key: 'systemSettings', label: 'System Settings', eyebrow: 'System', title: 'System Settings', icon: SlidersHorizontal },
  { key: 'adminReports', label: 'Admin Reports', eyebrow: 'Reporting', title: 'Legacy Admin Reports', icon: ExternalLink },
];

const NAV_GROUPS = [
  { title: '', section: '', keys: ['command'] },
  { title: 'Users', section: 'users', keys: ['users', 'remoteAgents'] },
  { title: 'Campaigns', section: 'campaigns', keys: ['campaigns', 'statuses', 'callTimes', 'scripts', 'leadFilters'] },
  { title: 'Lists', section: 'lists', keys: ['lists', 'leadSearch', 'leadLoader', 'dnc', 'dropLists'] },
  { title: 'Inbound', section: 'inbound', keys: ['inbound', 'dids', 'callMenus', 'filterPhoneGroups'] },
  { title: 'Admin', section: 'admin', keys: ['userGroups', 'phones', 'shifts', 'system', 'systemSettings', 'mediaTools', 'display', 'adminReports'] },
  { title: 'Reports', section: 'reports', keys: ['reports', 'recordings'] },
];

// GenX permission: which nav sections a user group can see. Stored in
// genx_group_permissions (perm 'nav_sections'); no row = ALL.
const NAV_SECTION_OPTIONS = [
  { value: 'users', label: 'Users' },
  { value: 'campaigns', label: 'Campaigns' },
  { value: 'lists', label: 'Lists' },
  { value: 'inbound', label: 'Inbound' },
  { value: 'admin', label: 'Admin' },
  { value: 'reports', label: 'Reports' },
];

function navSectionValues(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toUpperCase() === 'ALL') return NAV_SECTION_OPTIONS.map((option) => option.value);
  return raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean);
}

// Full admin capability = the user's group has the Admin nav section.
function hasAdminNav(user) {
  return !user?.navSections || user.navSections.includes('admin');
}

// Nav items inside otherwise-allowed sections that stay admin-only.
const ADMIN_ONLY_NAV_KEYS = new Set(['statuses']);

function formatNumber(value) {
  return new Intl.NumberFormat().format(Number(value || 0));
}

function formatTime(value) {
  if (!value) return 'Waiting';
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function formatDateTime(value) {
  if (!value) return 'Never';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

function durationLabel(value) {
  if (!value) return 'No recent call';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}

function formatSeconds(value) {
  const seconds = Number(value || 0);
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
  }
  if (minutes > 0) return `${minutes}m ${remainder}s`;
  return `${seconds}s`;
}

function percent(value, total) {
  if (!total) return 0;
  return Math.round((Number(value || 0) / Number(total)) * 100);
}

async function apiFetch(path, token, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error || 'request_failed');
    error.status = response.status;
    throw error;
  }
  return payload;
}

// VICIdial stores call_date/event_time in the DB server's LOCAL time, so date
// pickers must default to the local calendar day. new Date().toISOString()
// is the UTC day — after ~4-8pm in US timezones that is already "tomorrow",
// and every report defaulting to it comes back empty for the current shift.
// Always use this helper for default dates, never toISOString().slice(0,10).
function localDateStr(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Local-time 'YYYY-MM-DD HH:MM:SS' — matches MySQL NOW() on a same-timezone
// dialer. Used for legacy merge fields (--A--SQLdate--B--) that downstream
// CRMs parse as server-local, so UTC here would be hours off.
function localSqlNow(date = new Date()) {
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${localDateStr(date)} ${hh}:${mm}:${ss}`;
}

function downloadCsv(filename, columns, dataRows) {
  const escapeCell = (value) => {
    let text = String(value ?? '');
    // Spreadsheet formula-injection guard: caller-ID names, lead fields etc.
    // are externally controlled; a cell starting with = + - @ executes as a
    // formula when the CSV is opened in Excel. Prefix a quote to neutralize
    // (plain numbers like -5 are left alone).
    if (/^[=+@-]/.test(text) && !/^-?\d*\.?\d+$/.test(text)) text = `'${text}`;
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const header = columns.map((column) => escapeCell(column.label)).join(',');
  const lines = dataRows.map((row) => columns.map((column) => escapeCell(column.value(row))).join(','));
  const csv = [header, ...lines].join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function ReportFilterBar({ beginDate, endDate, onBeginDate, onEndDate, onSubmit, loading, children }) {
  return (
    <form className="entity-form report-filter-bar" onSubmit={onSubmit}>
      <div className="field-grid">
        <label>
          <span>Begin Date</span>
          <input type="date" value={beginDate} onChange={(event) => onBeginDate(event.target.value)} />
        </label>
        <label>
          <span>End Date</span>
          <input type="date" value={endDate} onChange={(event) => onEndDate(event.target.value)} />
        </label>
        {children}
      </div>
      <div className="modal-actions">
        <button type="submit" className="primary-action" disabled={loading}>
          <Search size={16} aria-hidden="true" />
          {loading ? 'Loading' : 'Run Report'}
        </button>
      </div>
    </form>
  );
}

function Login({ onLogin }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = await apiFetch('/login', '', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      onLogin(payload.token || '', payload.user);
    } catch (requestError) {
      // Only a real 401 means bad credentials; a 502/network error during a
      // deploy or outage must not send users off to reset their passwords.
      setError(requestError.status === 401 || requestError.status === 403
        ? 'Credentials or user level were not accepted'
        : 'The server could not be reached - try again shortly');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-label="GenX access">
        <div className="brand-lock">
          <div className="brand-mark">GX</div>
          <div>
            <p className="eyebrow">GenX Contact Center</p>
            <h1>Mission Control</h1>
          </div>
        </div>
        <form onSubmit={submit} className="login-form">
          <label htmlFor="vicidial-user">Username</label>
          <div className="input-row">
            <Users size={18} aria-hidden="true" />
            <input
              id="vicidial-user"
              type="text"
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              autoComplete="username"
              autoFocus
            />
          </div>
          <label htmlFor="vicidial-password">Password</label>
          <div className="input-row">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              id="vicidial-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <button type="submit" className="primary-action" disabled={loading}>
            <ShieldCheck size={18} aria-hidden="true" />
            {loading ? 'Checking' : 'Enter'}
          </button>
        </form>
      </section>
    </main>
  );
}

function userCan(user, entity) {
  if (Number(user?.userLevel || 0) >= 9) return true;
  if (entity === 'campaignCopy') return Boolean(user?.modifyCampaigns);
  if (entity === 'campaigns') return Boolean(user?.modifyCampaigns);
  if (entity === 'pauseCodes') return Boolean(user?.modifyCampaigns);
  if (entity === 'campaignHotkeys') return Boolean(user?.modifyCampaigns);
  if (entity === 'leadRecycle') return Boolean(user?.modifyCampaigns);
  if (entity === 'listMixes') return Boolean(user?.modifyCampaigns);
  if (entity === 'users') return Boolean(user?.modifyUsers);
  if (entity === 'userGroups') return Boolean(user?.modifyUsergroups);
  if (entity === 'lists') return Boolean(user?.modifyLists);
  if (entity === 'leadLoader') return Boolean(user?.loadLeads);
  if (entity === 'dnc') return Boolean(user?.deleteFromDnc);
  if (entity === 'inbound') return Boolean(user?.modifyIngroups);
  if (entity === 'dids') return Boolean(user?.modifyInboundDids);
  if (entity === 'callMenus') return Boolean(user?.modifyIngroups);
  if (entity === 'callMenuOptions') return Boolean(user?.modifyIngroups);
  if (entity === 'phones') return Boolean(user?.modifyPhones);
  if (entity === 'servers') return Boolean(user?.modifyServers);
  if (entity === 'carriers') return Boolean(user?.modifyCarriers);
  if (entity === 'scripts') return Boolean(user?.modifyScripts);
  if (entity === 'leadFilters') return Boolean(user?.modifyFilters);
  if (entity === 'filterPhoneGroups') return Boolean(user?.modifyFilters);
  if (entity === 'callTimes') return Boolean(user?.modifyCallTimes);
  if (entity === 'shifts') return Boolean(user?.modifyShifts);
  if (entity === 'statuses') return Boolean(user?.modifyStatuses);
  if (entity === 'campaignStatuses') return Boolean(user?.modifyStatuses || user?.modifyCampaigns);
  if (entity === 'remoteAgents') return Boolean(user?.modifyRemoteagents);
  if (entity === 'dropLists') return Boolean(user?.modifyLists);
  if (entity === 'phoneAliases') return Boolean(user?.modifyPhones);
  if (entity === 'groupAliases') return Boolean(user?.modifyPhones);
  if (entity === 'ipLists') return Boolean(user?.modifyIpLists);
  if (entity === 'cidGroups') return Boolean(user?.modifyCampaigns);
  if (entity === 'queueGroups') return Boolean(user?.modifyIngroups) && hasAdminNav(user);
  if (entity === 'contacts') return Boolean(user?.modifyContacts);
  if (entity === 'languages') return Boolean(user?.modifyLanguages);
  if (entity === 'emailAccounts') return Boolean(user?.modifyEmailAccounts);
  if (entity === 'voicemailBoxes' || entity === 'vmMessageGroups') return Boolean(user?.modifyVoicemail);
  if (entity === 'automatedReports') return Boolean(user?.modifyAutoReports);
  if (entity === 'moh') return Boolean(user?.modifyMoh);
  if (entity === 'tts') return Boolean(user?.modifyTts);
  if (entity === 'stateCallTimes' || entity === 'holidays') return Boolean(user?.deleteCallTimes);
  if (entity === 'statusGroups') return Boolean(user?.modifyStatuses);
  if (entity === 'statusCategories') return Boolean(user?.modifyStatuses || user?.modifyServers);
  if (entity === 'extensionGroups') return Boolean(user?.modifyRemoteagents);
  if (entity === 'confTemplates') return Boolean(user?.modifyServers);
  if (entity === 'settingsContainers') return Boolean(user?.modifySettingsContainers);
  return false;
}

const DELETABLE_ENTITIES = new Set(['inbound', 'dids', 'callMenus', 'callMenuOptions', 'filterPhoneGroups', 'campaigns', 'users', 'lists', 'scripts', 'leadFilters', 'userGroups', 'carriers', 'remoteAgents', 'dropLists', 'phoneAliases', 'groupAliases', 'ipLists', 'cidGroups', 'queueGroups', 'contacts', 'languages', 'voicemailBoxes', 'vmMessageGroups', 'automatedReports', 'moh', 'tts', 'stateCallTimes', 'holidays', 'statusGroups', 'settingsContainers', 'statusCategories', 'extensionGroups', 'confTemplates', 'emailAccounts', 'campaignStatuses', 'campaignHotkeys', 'leadRecycle', 'pauseCodes', 'listMixes']);

// Campaign-scoped tool rows key on (campaign_id, id) — DELETE has no body,
// so handleDelete sends the campaign as a ?campaign_id= query param.
const CAMPAIGN_SCOPED_TOOL_ENTITIES = new Set(['campaignStatuses', 'campaignHotkeys', 'leadRecycle', 'pauseCodes', 'listMixes']);

function userCanDelete(user, entity) {
  if (!DELETABLE_ENTITIES.has(entity)) return false;
  if (Number(user?.userLevel || 0) >= 9) return true;
  if (entity === 'inbound') return Boolean(user?.deleteIngroups);
  if (entity === 'dids') return Boolean(user?.deleteInboundDids);
  if (entity === 'callMenus') return Boolean(user?.modifyIngroups);
  if (entity === 'callMenuOptions') return Boolean(user?.modifyIngroups);
  if (entity === 'filterPhoneGroups') return Boolean(user?.deleteFilters);
  if (entity === 'campaigns') return Boolean(user?.deleteCampaigns);
  if (entity === 'users') return Boolean(user?.deleteUsers);
  if (entity === 'lists') return Boolean(user?.deleteLists);
  if (entity === 'scripts') return Boolean(user?.deleteScripts);
  if (entity === 'leadFilters') return Boolean(user?.deleteFilters);
  if (entity === 'userGroups') return Boolean(user?.deleteUserGroups);
  if (entity === 'carriers') return Boolean(user?.modifyCarriers);
  if (entity === 'remoteAgents') return Boolean(user?.deleteRemoteAgents);
  if (entity === 'dropLists') return Boolean(user?.deleteLists);
  if (entity === 'phoneAliases') return Boolean(user?.astDeletePhones);
  if (entity === 'groupAliases') return Boolean(user?.modifyPhones);
  if (entity === 'ipLists') return Boolean(user?.modifyIpLists);
  if (entity === 'cidGroups') return Boolean(user?.modifyCampaigns);
  if (entity === 'queueGroups') return Boolean(user?.modifyIngroups) && hasAdminNav(user);
  if (entity === 'contacts') return Boolean(user?.modifyContacts);
  if (entity === 'languages') return Boolean(user?.modifyLanguages);
  if (entity === 'emailAccounts') return Boolean(user?.modifyEmailAccounts);
  if (entity === 'voicemailBoxes' || entity === 'vmMessageGroups') return Boolean(user?.modifyVoicemail);
  if (entity === 'automatedReports') return Boolean(user?.modifyAutoReports);
  if (entity === 'moh') return Boolean(user?.modifyMoh);
  if (entity === 'tts') return Boolean(user?.modifyTts);
  if (entity === 'stateCallTimes' || entity === 'holidays') return Boolean(user?.modifyCallTimes);
  if (entity === 'statusGroups') return Boolean(user?.modifyStatuses);
  if (entity === 'statusCategories') return Boolean(user?.modifyStatuses || user?.modifyServers);
  if (entity === 'extensionGroups') return Boolean(user?.deleteRemoteAgents);
  if (entity === 'confTemplates') return Boolean(user?.modifyServers);
  if (entity === 'settingsContainers') return Boolean(user?.modifySettingsContainers);
  // Campaign-scoped tools follow their save gates, not a delete_* flag.
  if (entity === 'campaignStatuses') return Boolean(user?.modifyStatuses || user?.modifyCampaigns);
  if (CAMPAIGN_SCOPED_TOOL_ENTITIES.has(entity)) return Boolean(user?.modifyCampaigns);
  return false;
}

function yesNoOptions(yes = 'Y', no = 'N', yesLabel = 'Active', noLabel = 'Off') {
  return [
    { value: yes, label: yesLabel },
    { value: no, label: noLabel },
  ];
}

function flagOptions() {
  return [
    { value: '1', label: 'Allowed' },
    { value: '0', label: 'No' },
  ];
}

function enumOptions(values) {
  return values.map((value) => ({ value, label: value }));
}

function ensureOption(values, currentValue) {
  const current = String(currentValue ?? '');
  const list = values.map(String);
  if (current && !list.includes(current)) return [current, ...list];
  return list;
}

function numberRangeOptions(start, end, step = 1, currentValue) {
  const values = [];
  if (step > 0) {
    for (let value = start; value <= end; value += step) values.push(String(value));
  } else {
    for (let value = start; value >= end; value += step) values.push(String(value));
  }
  return enumOptions(ensureOption(values, currentValue));
}

function labeledNumberOptions(start, end, labelForValue, currentValue) {
  const values = [];
  const step = start <= end ? 1 : -1;
  for (let value = start; step > 0 ? value <= end : value >= end; value += step) {
    values.push({
      value: String(value),
      label: labelForValue(value),
    });
  }
  const current = String(currentValue ?? '');
  if (current && !values.some((option) => option.value === current)) {
    values.unshift({ value: current, label: current });
  }
  return values;
}

function dropPercentOptions(currentValue) {
  const values = [];
  for (let value = 100; value >= 4; value -= 1) values.push(String(value));
  for (let value = 3; value >= 0.1; value -= 0.1) values.push(String(Number(value.toFixed(1))));
  return enumOptions(ensureOption(values, currentValue));
}

function autoHopperMultiOptions(currentValue) {
  return enumOptions(ensureOption(['0.1', '0.2', '0.3', '0.4', '0.5', '0.6', '0.7', '0.8', '0.9', '1.0', '1.1', '1.2', '1.3', '1.4', '1.5', '1.6', '1.7', '1.8', '1.9', '2.0', '2.2', '2.4', '2.6', '2.8', '3.0', '3.5', '4.0'], currentValue));
}

function lookupOptions(items, valueKey, labelKey) {
  return (items || []).map((item) => ({
    value: String(item[valueKey] || ''),
    label: `${item[valueKey]}${item[labelKey] && item[labelKey] !== item[valueKey] ? ` - ${item[labelKey]}` : ''}`,
  })).filter((item) => item.value);
}

function withCurrentOption(options, currentValue) {
  const current = String(currentValue ?? '');
  if (!current || options.some((option) => String(option.value) === current)) return options;
  return [{ value: current, label: current }, ...options];
}

function uniqueOptions(options) {
  const seen = new Set();
  return (options || []).filter((option) => {
    const value = String(option.value || '');
    if (!value || seen.has(value)) return false;
    seen.add(value);
    return true;
  });
}

function scopeValues(rawValue, allValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [];
  if (allValue && raw.toUpperCase().includes(String(allValue).toUpperCase())) return [allValue];
  return raw.split(/\s+/).filter((item) => item && item !== '-');
}

// WARNING (legacy semantics, mirrored by the server): serializing an EMPTY
// selection falls back to the ALL sentinel — deselecting every campaign in
// 'Allowed Campaigns' grants access to ALL campaigns, not none. That is how
// stock vicidial stores these fields; changing it here without changing the
// server (and legacy admin.php) would only mask the widening on save.
function scopeText(values, allValue, suffix = ' -') {
  if (allValue && values.includes(allValue)) return allValue;
  const cleanValues = values.filter(Boolean);
  return cleanValues.length ? `${cleanValues.join(' ')}${suffix}` : allValue || '';
}

function viciGroupText(values) {
  const cleanValues = values.filter(Boolean);
  return cleanValues.length ? `${cleanValues.join(' ')} -` : '';
}

// Legacy pipe-delimited multi-value format used by vicidial_call_times
// ct_state_call_times / ct_holidays: stored as |ID|ID| (matched with LIKE "%|id|%").
function pipeValues(rawValue) {
  return String(rawValue || '').split('|').map((item) => item.trim()).filter(Boolean);
}

function pipeText(values) {
  const cleanValues = (values || []).filter(Boolean);
  return cleanValues.length ? `|${cleanValues.join('|')}|` : '';
}

function reportOptions() {
  return REPORT_GROUPS.flatMap((group) => group.items.map((item) => ({
    value: item.label,
    label: item.label,
  })));
}

function reportScopeValues(rawValue) {
  const raw = String(rawValue || '').trim();
  if (!raw) return [];
  if (raw.toUpperCase().includes('ALL REPORTS')) return ['ALL REPORTS'];
  if (raw.toUpperCase() === 'NONE') return ['NONE'];
  return raw.split(',').map((item) => item.trim()).filter(Boolean);
}

function reportScopeText(values) {
  if (values.includes('ALL REPORTS')) return 'ALL REPORTS';
  if (values.includes('NONE') || !values.length) return 'NONE';
  return values.join(', ');
}

function weekdayValues(rawValue) {
  return String(rawValue || '').split('').filter((value) => WEEKDAY_OPTIONS.some((option) => option.value === value));
}

function weekdayText(values) {
  return values.filter(Boolean).join('');
}

function campaignDialStatuses(row) {
  const statuses = Array.isArray(row?.dial_status_list)
    ? row.dial_status_list
    : String(row?.dial_statuses || '').replace(/\s+-$/, '').trim().split(/\s+/).filter(Boolean);
  return [...new Set(statuses.filter(Boolean))];
}

function autoDialLevelOptions(admin, currentValue) {
  const limit = Math.max(1, Number(admin?.lookups?.systemSettings?.autoDialLimit || 8));
  const values = ['0'];
  let level = 0;
  // Irregular step ladder mirrors legacy admin.php's auto-dial-level dropdown
  // increments exactly (0.1 to 3, 0.25 to 4, 0.5 to 5, 1 to 20, 2 to 40...),
  // capped by system_settings.auto_dial_limit. Do not "simplify" to a uniform
  // step: values legacy accepts would vanish from the list and ensureOption
  // would prepend odd current values on every edit.
  while (level <= limit) {
    if (level < 1) level += 1;
    else if (level < 3) level += 0.1;
    else if (level < 4) level += 0.25;
    else if (level < 5) level += 0.5;
    else if (level < 20) level += 1;
    else if (level < 40) level += 2;
    else if (level < 100) level += 5;
    else if (level < 200) level += 10;
    else if (level < 400) level += 50;
    else if (level < 1000) level += 100;
    else level += 1;
    if (level <= limit) values.push(String(Number(level.toFixed(2))));
  }
  if (currentValue !== undefined && currentValue !== null && currentValue !== '' && !values.includes(String(currentValue))) {
    values.unshift(String(currentValue));
  }
  return enumOptions([...new Set(values)]);
}

function statusOptionsForCampaign(admin, campaignId, currentStatuses = []) {
  const selected = new Set(currentStatuses);
  const options = [];
  const seen = new Set();
  const pushStatus = (item, source) => {
    const value = String(item?.status || '');
    if (!value || selected.has(value) || seen.has(value)) return;
    seen.add(value);
    options.push({
      value,
      label: `${value} - ${item.status_name || source}`,
    });
  };
  (admin?.lookups?.statuses || []).forEach((item) => pushStatus(item, 'System'));
  (admin?.lookups?.campaignStatuses || [])
    .filter((item) => String(item.campaign_id || '') === String(campaignId || ''))
    .forEach((item) => pushStatus(item, 'Campaign'));
  return [{ value: '', label: '- NONE -' }, ...options];
}

function statusSelectOptions(admin, campaignId, currentValue) {
  const seen = new Set();
  const options = [{ value: '', label: '- NONE -' }];
  const pushStatus = (item, source) => {
    const value = String(item?.status || '');
    if (!value || seen.has(value)) return;
    seen.add(value);
    options.push({
      value,
      label: `${value} - ${item.status_name || source}`,
    });
  };
  (admin?.lookups?.statuses || []).forEach((item) => pushStatus(item, 'System'));
  (admin?.lookups?.campaignStatuses || [])
    .filter((item) => String(item.campaign_id || '') === String(campaignId || ''))
    .forEach((item) => pushStatus(item, 'Campaign'));
  return withCurrentOption(options, currentValue);
}

function actionDefaults(entity, admin) {
  const campaign = admin?.lookups?.campaigns?.[0]?.campaign_id || '';
  const group = admin?.lookups?.userGroups?.[0]?.user_group || 'ADMIN';
  const inboundGroup = admin?.lookups?.inboundGroups?.[0]?.group_id || '';
  const serverIp = admin?.lookups?.servers?.[0]?.server_ip || '127.0.0.1';
  const callTime = admin?.lookups?.callTimes?.find((item) => item.call_time_id === '24hours')?.call_time_id
    || admin?.lookups?.callTimes?.[0]?.call_time_id
    || '24hours';

  if (entity === 'campaigns') {
    return {
      campaign_id: '',
      campaign_name: '',
      campaign_description: '',
      active: 'N',
      dial_status_a: 'NEW',
      dial_status_b: '',
      dial_status_c: '',
      dial_status_d: '',
      dial_status_e: '',
      dial_method: 'MANUAL',
      auto_dial_level: '0',
      hopper_level: '1',
      lead_order: 'DOWN',
      allow_closers: 'N',
      next_agent_call: 'longest_wait_time',
      local_call_time: '9am-9pm',
      dial_timeout: '60',
      dial_prefix: '9',
      campaign_cid: '0000000000',
      campaign_recording: 'ONDEMAND',
      campaign_rec_filename: 'FULLDATE_CUSTPHONE',
      campaign_rec_exten: '8309',
      allcalls_delay: '0',
      routing_initiated_recordings: 'N',
      campaign_script: '',
      campaign_script_two: '',
      get_call_launch: 'NONE',
      scheduled_callbacks: 'N',
      lead_filter_id: 'NONE',
      drop_call_seconds: '5',
      drop_action: 'AUDIO',
      safe_harbor_exten: '8307',
      safe_harbor_audio: 'buzz',
      safe_harbor_audio_field: 'DISABLED',
      voicemail_ext: '',
      park_file_name: '',
      display_dialable_count: 'Y',
      wrapup_seconds: '0',
      wrapup_message: 'Wrapup Call',
      use_internal_dnc: 'Y',
      omit_phone_code: 'N',
      available_only_ratio_tally: 'N',
      available_only_tally_threshold: 'DISABLED',
      available_only_tally_threshold_agents: '0',
      dial_level_threshold: 'DISABLED',
      dial_level_threshold_agents: '0',
      adaptive_dropped_percentage: '3',
      adaptive_maximum_level: '3.0',
      adaptive_intensity: '0',
      adaptive_dl_diff_target: '0',
      dl_diff_target_method: 'ADAPT_CALC_ONLY',
      concurrent_transfers: 'AUTO',
      auto_alt_dial: 'NONE',
      auto_alt_dial_statuses: ' B N NA DC -',
      agent_pause_codes_active: 'N',
      dial_statuses: ' NEW -',
      add_dial_status: '',
      remove_dial_status: '',
      no_hopper_leads_logins: 'N',
      use_auto_hopper: 'Y',
      auto_hopper_multi: '1.0',
      auto_trim_hopper: 'Y',
      hopper_vlc_dup_check: 'N',
      hopper_drop_run_trigger: 'N',
      reset_hopper: 'N',
      dial_level_override: '0',
      list_order_mix: 'DISABLED',
      campaign_allow_inbound: 'N',
      closer_campaigns: '',
      manual_dial_list_id: '998',
      default_xfer_group: '---NONE---',
      xfer_groups: '',
      queue_priority: '50',
      drop_inbound_group: '---NONE---',
      inbound_queue_no_dial: 'DISABLED',
      display_queue_count: 'Y',
      manual_dial_filter: 'NONE',
      agent_clipboard_copy: 'NONE',
      use_campaign_dnc: 'N',
      use_custom_cid: 'N',
      agent_search_method: '',
      agent_hangup_route: 'HANGUP',
      agent_hangup_value: '',
      ivr_park_call: 'DISABLED',
      ivr_park_call_agi: '',
      three_way_call_cid: 'CAMPAIGN',
      three_way_dial_prefix: '',
      web_form_target: 'vdcwebform',
      web_form_address: '',
      web_form_address_two: '',
      web_form_address_three: '',
      start_call_url: '',
      dispo_call_url: '',
      na_call_url: '',
      timer_action: 'NONE',
      timer_action_message: '',
      timer_action_seconds: '0',
      timer_action_destination: '',
      manual_dial_prefix: '',
      manual_preview_dial: 'PREVIEW_AND_SKIP',
      manual_dial_call_time_check: 'DISABLED',
      display_leads_count: 'N',
      lead_order_randomize: 'N',
      lead_order_secondary: 'LEAD_ASCEND',
      call_count_limit: '0',
      call_count_target: '3',
      call_count_limit_restrict: 'DISABLED',
      drop_lockout_time: '0',
      per_call_notes: 'DISABLED',
      force_per_call_notes: 'DISABLED',
      my_callback_option: 'UNCHECKED',
      agent_lead_search: 'DISABLED',
      agent_lead_search_method: 'CAMPLISTS_ALL',
      agent_search_ingroup_list: 'DISABLED',
      callback_days_limit: '0',
      callback_hours_block: '0',
      callback_list_calltime: 'DISABLED',
      user_group: '---ALL---',
      pause_after_each_call: 'N',
      pause_after_next_call: 'DISABLED',
      owner_populate: 'DISABLED',
      allow_emails: 'N',
      max_inbound_calls: '0',
      max_inbound_calls_outcome: 'DEFAULT',
      hide_call_log_info: 'N',
      wrapup_bypass: 'ENABLED',
      wrapup_after_hotkey: 'DISABLED',
      callback_active_limit: '0',
      callback_active_limit_override: 'N',
      show_previous_callback: 'ENABLED',
      clear_script: 'DISABLED',
      manual_dial_search_filter: 'NONE',
      manual_dial_search_checkbox: 'SELECTED',
      status_display_ingroup: 'ENABLED',
      status_display_fields: 'CALLID',
      manual_dial_timeout: '',
      manual_dial_hopper_check: 'N',
      manual_dial_override: 'NONE',
      manual_dial_override_field: 'ENABLED',
      manual_dial_lead_id: 'N',
      api_manual_dial: 'STANDARD',
      manual_dial_cid: 'CAMPAIGN',
      manual_minimum_attempt_seconds: '0',
      manual_minimum_answer_seconds: '0',
      manual_auto_next: '0',
      manual_auto_show: 'N',
      ready_max_logout: '0',
      callback_display_days: '0',
      callback_useronly_move_minutes: '0',
      scheduled_callbacks_alert: 'NONE',
      scheduled_callbacks_email_alert: 'N',
      scheduled_callbacks_count: 'LIVE',
      scheduled_callbacks_force_dial: 'N',
      scheduled_callbacks_auto_reschedule: 'NONE',
      scheduled_callbacks_timezones_container: 'DISABLED',
      next_dial_my_callbacks: 'DISABLED',
      callback_dnc: 'DISABLED',
      mute_recordings: 'N',
      amd_type: 'AMD',
      am_message_exten: 'vm-goodbye',
      vmm_daily_limit: '0',
      waitforsilence_options: '',
      manual_vm_status_updates: 'ENABLED',
      am_message_wildcards: 'N',
      amd_send_to_vmx: 'N',
      amd_agent_route_options: 'DISABLED',
      amd_status_map: 'DISABLED',
      cpd_amd_action: 'DISABLED',
      cpd_unknown_action: 'DISABLED',
      amd_inbound_group: '---NONE---',
      amd_callmenu: '---NONE---',
      leave_vm_message_group_id: '---NONE---',
      leave_vm_no_dispo: 'DISABLED',
      transfer_button_launch: 'NONE',
      enable_xfer_presets: 'DISABLED',
      hide_xfer_number_to_dial: 'DISABLED',
      prepopulate_transfer_preset: 'N',
      quick_transfer_button: 'N',
      transfer_no_dispo: 'DISABLED',
      custom_3way_button_transfer: 'DISABLED',
      shared_dial_rank: '99',
      call_limit_24hour_method: 'DISABLED',
      call_limit_24hour_scope: 'SYSTEM_WIDE',
      call_limit_24hour: '0',
      call_limit_24hour_override: 'DISABLED',
      three_way_volume_buttons: 'ENABLED',
      customer_3way_hangup_logging: 'ENABLED',
      customer_3way_hangup_seconds: '5',
      customer_3way_hangup_action: 'NONE',
      three_way_record_stop: 'N',
      three_way_record_stop_exception: 'DISABLED',
      leave_3way_start_recording: 'DISABLED',
      leave_3way_start_recording_exception: 'DISABLED',
      leave_3way_stop_recording: 'DISABLED',
      hangup_xfer_record_start: 'N',
      agent_hide_hangup: 'N',
      max_logged_in_agents: '0',
      show_confetti: 'DISABLED',
      dead_stop_recording: 'DISABLED',
      dead_trigger_action: 'DISABLED',
      dead_trigger_seconds: '0',
      dead_trigger_repeat: 'NO',
      dead_trigger_filename: '',
      dead_trigger_url: '',
      dead_max: '0',
      dead_max_dispo: 'DCMX',
      dead_to_dispo: 'DISABLED',
      dispo_max: '0',
      dispo_max_dispo: 'DISMX',
      pause_max: '0',
      pause_max_dispo: 'PAUSMX',
      pause_max_exceptions: 'DISABLED',
      pause_max_url: '',
      daily_phone_number_call_limit: '0',
      call_log_days: '0',
      hangup_again_link: 'ENABLED',
      incall_tally_threshold_seconds: '0',
      adaptive_latest_server_time: '2100',
      adaptive_percentmax_percentage: '50',
      drop_rate_group: 'DISABLED',
      inbound_no_agents_no_dial_container: '---DISABLED---',
      inbound_no_agents_no_dial_threshold: '0',
      dial_timeout_lead_container: 'DISABLED',
      cid_group_id: '---DISABLED---',
      cid_group_id_two: '---DISABLED---',
      safe_harbor_menu_id: '',
      agent_hangup_ig_override: 'N',
      campaign_vdad_exten: '8368',
      comments_all_tabs: 'DISABLED',
      comments_dispo_screen: 'DISABLED',
      comments_callback_screen: 'DISABLED',
      qc_comment_history: 'CLICK',
      user_group_script: 'DISABLED',
      script_tab_frame_size: 'DEFAULT',
      script_tab_height: '0',
      clear_form: 'ACKNOWLEDGE',
      disable_dispo_screen: 'DISPO_ENABLED',
      disable_dispo_status: '',
      script_top_dispo: 'N',
      in_man_dial_next_ready_seconds: '0',
      in_man_dial_next_ready_seconds_override: 'DISABLED',
      customer_gone_seconds: '30',
      auto_pause_precall: 'N',
      auto_resume_precall: 'N',
      auto_pause_precall_code: 'PRECAL',
      campaign_stats_refresh: 'N',
      realtime_agent_time_stats: 'CALLS_WAIT_CUST_ACW_PAUSE',
      disable_alter_custdata: 'N',
      disable_alter_custphone: 'Y',
      no_hopper_dialing: 'N',
      agent_dial_owner_only: 'NONE',
      agent_display_dialable_leads: 'N',
      screen_labels: '--SYSTEM-SETTINGS--',
      allow_required_fields: 'N',
      state_descriptions: '---DISABLED---',
      agent_screen_time_display: 'DISABLED',
      calls_inqueue_count_one: 'DISABLED',
      calls_inqueue_count_two: 'DISABLED',
      view_calls_in_queue: 'NONE',
      view_calls_in_queue_launch: 'MANUAL',
      calls_waiting_vl_one: 'DISABLED',
      calls_waiting_vl_two: 'DISABLED',
      grab_calls_in_queue: 'N',
      call_requeue_button: 'N',
      post_phone_time_diff_alert: 'DISABLED',
      in_group_dial: 'DISABLED',
      in_group_dial_select: 'CAMPAIGN_SELECTED',
      alt_number_dialing: 'N',
      timer_alt_seconds: '0',
      agent_allow_group_alias: 'N',
      crm_popup_login: 'N',
      crm_login_address: '',
      extension_appended_cidname: 'N',
      blind_monitor_warning: 'DISABLED',
      blind_monitor_message: 'Someone is blind monitoring your session',
      blind_monitor_filename: '',
      agent_xfer_validation: 'N',
      ig_xfer_list_sort: 'GROUP_ID_UP',
      use_other_campaign_dnc: '',
      agent_display_fields: '',
      custom_one: '',
      custom_two: '',
      custom_three: '',
      custom_four: '',
      custom_five: '',
    };
  }

  if (entity === 'campaignCopy') {
    return {
      campaign_id: '',
      campaign_name: '',
      source_campaign_id: campaign,
    };
  }

  if (entity === 'pauseCodes') {
    return {
      campaign_id: campaign,
      pause_code: '',
      pause_code_name: '',
      billable: 'NO',
      time_limit: '65000',
      require_mgr_approval: 'NO',
    };
  }

  if (entity === 'campaignHotkeys') {
    return {
      campaign_id: campaign,
      hotkey: '',
      status: '',
      status_name: '',
      selectable: 'Y',
    };
  }

  if (entity === 'leadRecycle') {
    return {
      recycle_id: '',
      campaign_id: campaign,
      status: '',
      attempt_delay: '1800',
      attempt_maximum: '2',
      active: 'N',
    };
  }

  if (entity === 'listMixes') {
    return {
      vcl_id: '',
      vcl_name: '',
      campaign_id: campaign,
      list_mix_container: '',
      mix_method: 'IN_ORDER',
      status: 'INACTIVE',
    };
  }

  if (entity === 'users') {
    return {
      user: '',
      pass: '',
      full_name: '',
      user_level: '1',
      user_group: group,
      active: 'Y',
      email: '',
      phone_login: '',
      campaign_detail: '0',
      view_reports: '0',
      export_reports: '0',
      modify_campaigns: '0',
      modify_lists: '0',
      modify_users: '0',
      modify_ingroups: '0',
      modify_inbound_dids: '0',
      modify_usergroups: '0',
      modify_scripts: '0',
      modify_filters: '0',
      modify_call_times: '0',
      modify_phones: '0',
      modify_servers: '0',
      modify_carriers: '0',
      modify_statuses: '0',
      access_recordings: '0',
      alter_admin_interface_options: '1',
      modify_settings_containers: '0',
      modify_email_accounts: '0',
      phone_pass: '',
      delete_users: '0',
      delete_user_groups: '0',
      delete_lists: '0',
      delete_campaigns: '0',
      delete_ingroups: '0',
      delete_remote_agents: '0',
      delete_scripts: '0',
      delete_filters: '0',
      delete_call_times: '0',
      delete_inbound_dids: '0',
      delete_from_dnc: '0',
      load_leads: '0',
      modify_leads: '0',
      modify_remoteagents: '0',
      modify_shifts: '0',
      modify_labels: '0',
      modify_voicemail: '0',
      modify_audiostore: '0',
      modify_moh: '0',
      modify_tts: '0',
      modify_contacts: '0',
      modify_same_user_level: '1',
      modify_custom_dialplans: '0',
      modify_languages: '0',
      modify_colors: '0',
      modify_auto_reports: '0',
      modify_ip_lists: '0',
      modify_dial_prefix: '0',
      ast_admin_access: '0',
      ast_delete_phones: '0',
      hotkeys_active: '0',
      change_agent_campaign: '0',
      agent_choose_ingroups: '1',
      closer_campaigns: '',
      scheduled_callbacks: '1',
      agentonly_callbacks: '0',
      agentcall_manual: '0',
      vicidial_recording: '1',
      vicidial_transfers: '1',
      alter_agent_interface_options: '0',
      closer_default_blended: '0',
      vicidial_recording_override: 'DISABLED',
      alter_custdata_override: 'NOT_ACTIVE',
      alter_custphone_override: 'NOT_ACTIVE',
      vdc_agent_api_access: '0',
      alert_enabled: '0',
      allow_alerts: '0',
      download_lists: '0',
      agent_shift_enforcement_override: 'DISABLED',
      manager_shift_enforcement_override: '0',
      shift_override_flag: '0',
      user_code: '',
      voicemail_id: '',
      agent_call_log_view_override: 'DISABLED',
      agent_choose_blended: '1',
      realtime_block_user_info: '0',
      custom_fields_modify: '0',
      force_change_password: 'N',
      agent_lead_search_override: 'NOT_ACTIVE',
      preset_contact_search: 'NOT_ACTIVE',
      admin_hide_lead_data: '0',
      admin_hide_phone_data: '0',
      agentcall_email: '0',
      max_inbound_calls: '0',
      wrapup_seconds_override: '-1',
      selected_language: 'default English',
      user_choose_language: '0',
      ignore_group_on_search: '0',
      api_list_restrict: '0',
      api_allowed_functions: ' ALL_FUNCTIONS ',
      lead_filter_id: 'NONE',
      admin_cf_show_hidden: '0',
      user_hide_realtime: '0',
      user_nickname: '',
      user_new_lead_limit: '-1',
      api_only_user: '0',
      ignore_ip_list: '0',
      ready_max_logout: '-1',
      export_gdpr_leads: '0',
      pause_code_approval: '0',
      max_hopper_calls: '0',
      max_hopper_calls_hour: '0',
      mute_recordings: 'DISABLED',
      hide_call_log_info: 'DISABLED',
      next_dial_my_callbacks: 'NOT_ACTIVE',
      user_admin_redirect_url: '',
      max_inbound_filter_enabled: '0',
      max_inbound_filter_statuses: '',
      max_inbound_filter_ingroups: '',
      max_inbound_filter_min_sec: '-1',
      status_group_id: '',
      mobile_number: '',
      two_factor_override: 'NOT_ACTIVE',
      manual_dial_filter: 'DISABLED',
      user_location: '',
      download_invalid_files: '0',
      user_group_two: '',
      inbound_credits: '-1',
      manual_dial_lead_id: 'DISABLED',
      qc_enabled: '0',
      qc_user_level: '1',
      qc_pass: '0',
      qc_finish: '0',
      qc_commit: '0',
      add_timeclock_log: '0',
      modify_timeclock_log: '0',
      delete_timeclock_log: '0',
      custom_one: '',
      custom_two: '',
      custom_three: '',
      custom_four: '',
      custom_five: '',
    };
  }

  if (entity === 'lists') {
    return {
      list_id: '',
      list_name: '',
      campaign_id: campaign,
      active: 'N',
      list_description: '',
      local_call_time: 'campaign',
      expiration_date: '2099-12-31',
      reset_time: '',
      agent_script_override: '',
      inbound_list_script_override: '',
      campaign_cid_override: '',
      am_message_exten_override: '',
      drop_inbound_group_override: '---NONE---',
      default_xfer_group: '---NONE---',
      xferconf_a_number: '',
      xferconf_b_number: '',
      xferconf_c_number: '',
      xferconf_d_number: '',
      xferconf_e_number: '',
      web_form_address: '',
      web_form_address_two: '',
      web_form_address_three: '',
      time_zone_setting: 'COUNTRY_AND_AREA_CODE',
      inventory_report: 'Y',
      na_call_url: '',
      status_group_id: '',
      user_new_lead_limit: '-1',
      daily_reset_limit: '-1',
      auto_active_list_rank: '0',
      inbound_drop_voicemail: '',
      inbound_after_hours_voicemail: '',
      qc_scorecard_id: '',
      qc_statuses_id: '',
      qc_web_form_address: '',
      auto_alt_threshold: '-1',
      cid_group_id: '---DISABLED---',
      dial_prefix: '',
      weekday_resets_container: 'DISABLED',
    };
  }

  if (entity === 'userGroups') {
    return {
      user_group: '',
      group_name: '',
      genx_nav_sections: 'ALL',
      allowed_campaigns: '-ALL-CAMPAIGNS-',
      allowed_reports: 'ALL REPORTS',
      admin_viewable_groups: '---ALL---',
      admin_viewable_call_times: '---ALL---',
      allowed_queue_groups: '---ALL---',
      qc_allowed_campaigns: '-ALL-CAMPAIGNS-',
      qc_allowed_inbound_groups: '---ALL---',
      group_shifts: '---ALL---',
      forced_timeclock_login: 'N',
      shift_enforcement: 'OFF',
      agent_status_viewable_groups: '---ALL---',
      agent_status_view_time: 'N',
      agent_call_log_view: 'N',
      agent_fullscreen: 'N',
      agent_xfer_consultative: 'Y',
      agent_xfer_dial_override: 'Y',
      agent_xfer_vm_transfer: 'Y',
      agent_xfer_blind_transfer: 'Y',
      agent_xfer_dial_with_customer: 'Y',
      agent_xfer_park_customer_dial: 'Y',
      agent_xfer_park_3way: 'Y',
      allowed_custom_reports: 'ALL REPORTS',
      webphone_url_override: '',
      webphone_systemkey_override: '',
      webphone_dialpad_override: 'DISABLED',
      webphone_layout: '',
      admin_ip_list: '',
      agent_ip_list: '',
      api_ip_list: '',
      reports_header_override: '',
      admin_home_url: '',
      script_id: '',
    };
  }

  if (entity === 'dids') {
    return {
      did_pattern: '',
      did_description: '',
      did_active: 'Y',
      did_route: 'IN_GROUP',
      extension: '',
      exten_context: 'default',
      voicemail_ext: '',
      phone: '',
      server_ip: serverIp,
      user: '',
      user_unavailable_action: 'VOICEMAIL',
      user_route_settings_ingroup: inboundGroup,
      group_id: inboundGroup,
      call_handle_method: 'CID',
      agent_search_method: 'LB',
      list_id: '',
      campaign_id: campaign,
      phone_code: '1',
      menu_id: '',
      record_call: 'N',
      filter_inbound_number: '',
      filter_clean_cid_number: '',
      no_agent_ingroup_redirect: 'DISABLED',
      no_agent_ingroup_id: '---NONE---',
      no_agent_ingroup_extension: '',
      max_queue_ingroup_calls: '0',
      max_queue_ingroup_id: '---NONE---',
      max_queue_ingroup_extension: '',
      pre_filter_phone_group_id: '',
      pre_filter_extension: '',
      pre_filter_recent_call: 'DISABLED',
      pre_filter_recent_extension: '',
      filter_phone_group_id: '',
      filter_url: '',
      filter_url_did_redirect: 'N',
      filter_dnc_campaign: '',
      filter_action: 'DISABLED',
      filter_extension: '',
      filter_exten_context: 'default',
      filter_voicemail_ext: '',
      filter_phone: '',
      filter_server_ip: serverIp,
      filter_user: '',
      filter_user_unavailable_action: 'VOICEMAIL',
      filter_user_route_settings_ingroup: inboundGroup,
      filter_group_id: inboundGroup,
      filter_call_handle_method: 'CID',
      filter_agent_search_method: 'LB',
      filter_list_id: '',
      filter_campaign_id: campaign,
      filter_phone_code: '1',
      filter_menu_id: '',
      user_group: group,
      did_carrier_description: '',
      inbound_route_answer: 'N',
      alter_cid_name: '',
    };
  }

  if (entity === 'phones') {
    return {
      extension: '',
      dialplan_number: '',
      voicemail_id: '',
      phone_ip: '',
      computer_ip: '',
      server_ip: serverIp,
      login: '',
      pass: '',
      status: 'ACTIVE',
      active: 'Y',
      phone_type: 'SIP',
      fullname: '',
      company: '',
      picture: '',
      messages: '0',
      old_messages: '0',
      protocol: 'SIP',
      local_gmt: '-5.00',
      ASTmgrUSERNAME: 'cron',
      ASTmgrSECRET: '1234',
      login_user: '',
      login_campaign: '',
      park_on_extension: '8301',
      conf_on_extension: '8302',
      VICIDIAL_park_on_extension: '8301',
      VICIDIAL_park_on_filename: 'park',
      monitor_prefix: '8612',
      recording_exten: '8309',
      voicemail_exten: '8501',
      voicemail_dump_exten: '85026666666666',
      voicemail_dump_exten_no_inst: '85026666666667',
      ext_context: 'default',
      dtmf_send_extension: 'local/8500998@default',
      call_out_number_group: 'Zap/g2/',
      client_browser: '/usr/bin/mozilla',
      install_directory: '/usr/local/perl_TK',
      local_web_callerID_URL: '',
      VICIDIAL_web_URL: '',
      outbound_cid: '',
      outbound_alt_cid: '',
      email: '',
      template_id: '',
      conf_override: '',
      phone_context: 'default',
      phone_ring_timeout: '60',
      conf_secret: '',
      delete_vm_after_email: 'N',
      is_webphone: 'N',
      use_external_server_ip: 'N',
      codecs_list: '',
      codecs_with_template: '0',
      on_hook_agent: 'N',
      voicemail_timezone: 'eastern',
      voicemail_options: '',
      user_group: group,
      voicemail_greeting: '',
      voicemail_instructions: 'Y',
      on_login_report: 'N',
      unavail_dialplan_fwd_exten: '',
      unavail_dialplan_fwd_context: '',
      nva_call_url: '',
      nva_search_method: 'NONE',
      nva_error_filename: '',
      nva_new_list_id: '995',
      nva_new_phone_code: '1',
      nva_new_status: 'NVAINS',
      webphone_dialpad: 'Y',
      webphone_auto_answer: 'Y',
      webphone_dialbox: 'Y',
      webphone_mute: 'Y',
      webphone_volume: 'Y',
      webphone_debug: 'N',
      conf_qualify: 'Y',
      webphone_layout: '',
      mohsuggest: '',
      webphone_settings: 'VICIPHONE_SETTINGS',
    };
  }

  if (entity === 'servers') {
    return {
      server_id: '',
      server_description: '',
      server_ip: serverIp,
      active: 'Y',
      active_asterisk_server: 'Y',
      asterisk_version: '',
      max_vicidial_trunks: '23',
      telnet_host: 'localhost',
      telnet_port: '5038',
      ASTmgrUSERNAME: 'cron',
      ASTmgrSECRET: '1234',
      ASTmgrUSERNAMEupdate: 'updatecron',
      ASTmgrUSERNAMElisten: 'listencron',
      ASTmgrUSERNAMEsend: 'sendcron',
      local_gmt: '-5.00',
      answer_transfer_agent: '8365',
      ext_context: 'default',
      sys_perf_log: 'N',
      vd_server_logs: 'Y',
      agi_output: 'FILE',
      vicidial_balance_active: 'N',
      vicidial_balance_rank: '0',
      balance_trunks_offlimits: '0',
      recording_web_link: 'SERVER_IP',
      alt_server_ip: '',
      active_twin_server_ip: '',
      generate_vicidial_conf: 'Y',
      rebuild_conf_files: 'Y',
      outbound_calls_per_second: '5',
      sounds_update: 'N',
      vicidial_recording_limit: '60',
      carrier_logging_active: 'Y',
      active_agent_login_server: 'Y',
      external_server_ip: '',
      custom_dialplan_entry: '',
      user_group: '---ALL---',
      auto_restart_asterisk: 'N',
      asterisk_temp_no_restart: 'N',
      voicemail_dump_exten: '85026666666666',
      voicemail_dump_exten_no_inst: '85026666666667',
      gather_asterisk_output: 'N',
      web_socket_url: '',
      external_web_socket_url: '',
      conf_qualify: 'Y',
      conf_secret: 'test',
      routing_prefix: '13',
      conf_engine: 'MEETME',
      conf_update_interval: '60',
      ara_url: '',
    };
  }

  if (entity === 'carriers') {
    return {
      carrier_id: '',
      carrier_name: '',
      protocol: 'SIP',
      server_ip: serverIp,
      active: 'Y',
      carrier_description: '',
      user_group: '---ALL---',
      template_id: '',
      registration_string: '',
      account_entry: '',
      globals_string: '',
      dialplan_entry: '',
    };
  }

  if (entity === 'scripts') {
    return {
      script_id: '',
      script_name: '',
      script_comments: '',
      script_text: '',
      active: 'Y',
      user_group: group,
      script_color: 'white',
    };
  }

  if (entity === 'leadFilters') {
    return {
      lead_filter_id: '',
      lead_filter_name: '',
      lead_filter_comments: '',
      lead_filter_sql: '',
      user_group: group,
    };
  }

  if (entity === 'filterPhoneGroups') {
    return {
      filter_phone_group_id: '',
      filter_phone_group_name: '',
      filter_phone_group_description: '',
      user_group: group,
      phone_numbers: '',
    };
  }

  if (entity === 'callTimes') {
    return {
      call_time_id: '',
      call_time_name: '',
      call_time_comments: '',
      ct_default_start: '900',
      ct_default_stop: '2100',
      ct_sunday_start: '0',
      ct_sunday_stop: '0',
      ct_monday_start: '0',
      ct_monday_stop: '0',
      ct_tuesday_start: '0',
      ct_tuesday_stop: '0',
      ct_wednesday_start: '0',
      ct_wednesday_stop: '0',
      ct_thursday_start: '0',
      ct_thursday_stop: '0',
      ct_friday_start: '0',
      ct_friday_stop: '0',
      ct_saturday_start: '0',
      ct_saturday_stop: '0',
      ct_state_call_times: '',
      default_afterhours_filename_override: '',
      sunday_afterhours_filename_override: '',
      monday_afterhours_filename_override: '',
      tuesday_afterhours_filename_override: '',
      wednesday_afterhours_filename_override: '',
      thursday_afterhours_filename_override: '',
      friday_afterhours_filename_override: '',
      saturday_afterhours_filename_override: '',
      user_group: group,
      ct_holidays: '',
    };
  }

  if (entity === 'callMenuOptions') {
    return {
      menu_id: admin?.lookups?.callMenus?.[0]?.menu_id || '',
      option_value: '1',
      option_description: '',
      option_route: 'CALLMENU',
      option_route_value: admin?.lookups?.callMenus?.[0]?.menu_id || '',
      option_route_value_context: '',
    };
  }

  if (entity === 'callMenus') {
    return {
      menu_id: '',
      menu_name: '',
      menu_prompt: '',
      menu_timeout: '10',
      menu_timeout_prompt: 'NONE',
      menu_invalid_prompt: 'NONE',
      menu_repeat: '0',
      menu_time_check: '0',
      call_time_id: callTime,
      track_in_vdac: '1',
      custom_dialplan_entry: '',
      tracking_group: 'CALLMENU',
      dtmf_log: '0',
      dtmf_field: 'NONE',
      user_group: group,
      qualify_sql: '',
      alt_dtmf_log: '0',
      answer_signal: 'Y',
    };
  }

  if (entity === 'shifts') {
    return {
      shift_id: '',
      shift_name: '',
      shift_start_time: '0900',
      shift_length: '16:00',
      shift_weekdays: '0123456',
      report_option: 'N',
      user_group: group,
      report_rank: '1',
    };
  }

  if (entity === 'ipLists') {
    return { ip_list_id: '', ip_list_name: '', active: 'N', user_group: '---ALL---', ip_addresses: '' };
  }

  if (entity === 'queueGroups') {
    return { queue_group: '', queue_group_name: '', included_campaigns: '', included_inbound_groups: '', user_group: '---ALL---', active: 'N' };
  }

  if (entity === 'voicemailBoxes') {
    return { voicemail_id: '', pass: '', fullname: '', email: '', active: 'Y', delete_vm_after_email: 'N', voicemail_timezone: 'eastern', user_group: '---ALL---', on_login_report: 'N' };
  }

  if (entity === 'moh') {
    return { moh_id: '', moh_name: '', active: 'N', random: 'N', user_group: '---ALL---' };
  }

  if (entity === 'stateCallTimes') {
    return { state_call_time_id: '', state_call_time_state: '', state_call_time_name: '', state_call_time_comments: '', sct_default_start: '900', sct_default_stop: '2100', user_group: '---ALL---' };
  }

  if (entity === 'holidays') {
    return { holiday_id: '', holiday_name: '', holiday_comments: '', holiday_date: '', holiday_status: 'INACTIVE', ct_default_start: '0', ct_default_stop: '0', holiday_method: 'REPLACE', user_group: '---ALL---' };
  }

  if (entity === 'statusGroups') {
    return { status_group_id: '', status_group_notes: '', user_group: '---ALL---' };
  }

  if (entity === 'statusCategories') {
    return { vsc_id: '', vsc_name: '', vsc_description: '', tovdad_display: 'N', sale_category: 'N', dead_lead_category: 'N' };
  }

  if (entity === 'extensionGroups') {
    return { extension_group_id: '', extension: '', rank: '0', campaign_groups: '' };
  }

  if (entity === 'confTemplates') {
    return { template_id: '', template_name: '', template_contents: '', user_group: '---ALL---' };
  }

  if (entity === 'settingsContainers') {
    return { container_id: '', container_notes: '', container_type: 'OTHER', user_group: '---ALL---', container_entry: '' };
  }

  if (entity === 'tts') {
    return { tts_id: '', tts_name: '', active: 'N', tts_text: '', tts_voice: '', user_group: '---ALL---' };
  }


  if (entity === 'vmMessageGroups') {
    return { leave_vm_message_group_id: '', leave_vm_message_group_notes: '', active: 'N', user_group: '---ALL---' };
  }

  if (entity === 'automatedReports') {
    return { report_id: '', report_name: '', report_server: '', report_times: '0700', report_weekdays: '12345', report_monthdays: '', report_destination: 'EMAIL', email_from: '', email_to: '', email_subject: '', ftp_server: '', ftp_user: '', ftp_pass: '', ftp_directory: '', report_url: '', run_now_trigger: 'N', active: 'N', user_group: '---ALL---', filename_override: '' };
  }

  if (entity === 'contacts') {
    return { first_name: '', last_name: '', office_num: '', cell_num: '', other_num1: '', other_num2: '', bu_name: '', department: '', group_name: '', job_title: '', location: '' };
  }

  if (entity === 'languages') {
    return { language_id: '', language_code: '', language_description: '', user_group: '---ALL---', active: 'N' };
  }

  if (entity === 'emailAccounts') {
    return {
      email_account_id: '', email_account_name: '', email_account_description: '', user_group: '---ALL---',
      email_account_type: 'INBOUND', protocol: 'IMAP', email_account_server: '', email_account_user: '',
      email_account_pass: '', email_replyto_address: '', pop3_auth_mode: 'BEST', active: 'N',
      email_frequency_check_mins: '5', group_id: '', default_list_id: '0',
    };
  }

  if (entity === 'cidGroups') {
    return { cid_group_id: '', cid_group_notes: '', cid_group_type: 'AREACODE', user_group: '---ALL---', cid_auto_rotate_minutes: '0', cid_auto_rotate_minimum: '0', cid_auto_rotate_calls: '0' };
  }

  if (entity === 'phoneAliases') {
    return { alias_id: '', alias_name: '', logins_list: '', user_group: '---ALL---' };
  }

  if (entity === 'groupAliases') {
    return { group_alias_id: '', group_alias_name: '', caller_id_number: '', caller_id_name: '', active: 'N', user_group: '---ALL---' };
  }

  if (entity === 'dropLists') {
    return {
      dl_id: '',
      dl_name: '',
      dl_server: 'active_voicemail_server',
      dl_times: '0800 1200 1600',
      dl_weekdays: '12345',
      dl_monthdays: '',
      drop_statuses: 'DROP',
      list_id: '',
      duplicate_check: 'NONE',
      run_now_trigger: 'N',
      active: 'N',
      user_group: '---ALL---',
      closer_campaigns: '',
      dl_minutes: '0',
    };
  }

  if (entity === 'remoteAgents') {
    return {
      user_start: '',
      number_of_lines: '1',
      server_ip: admin?.servers?.[0]?.server_ip || '',
      conf_exten: '',
      status: 'INACTIVE',
      campaign_id: campaign,
      closer_campaigns: '',
      extension_group: 'NONE',
      extension_group_order: 'NONE',
      on_hook_agent: 'N',
      on_hook_ring_time: '15',
    };
  }

  if (entity === 'statuses' || entity === 'campaignStatuses') {
    return {
      campaign_id: campaign,
      status: '',
      status_name: '',
      selectable: 'Y',
      human_answered: 'N',
      category: 'UNDEFINED',
      sale: 'N',
      dnc: 'N',
      customer_contact: 'N',
      not_interested: 'N',
      unworkable: 'N',
      scheduled_callback: 'N',
      completed: 'N',
      min_sec: '0',
      max_sec: '0',
      answering_machine: 'N',
    };
  }

  return {
    group_id: '',
    group_name: '',
    group_color: 'WHITE',
    active: 'N',
    user_group: '---ALL---',
    call_time_id: callTime,
    next_agent_call: 'longest_wait_time',
    agent_search_method: '',
    fronter_display: 'Y',
    default_group_alias: '',
    dial_ingroup_cid: '',
    queue_priority: '0',
    group_handling: 'PHONE',
    web_form_address: '',
    web_form_address_two: '',
    web_form_address_three: '',
    ingroup_script: '',
    ingroup_script_two: '',
    get_call_launch: 'NONE',
    start_call_url: '',
    dispo_call_url: '',
    na_call_url: '',
    add_lead_url: '',
    enter_ingroup_url: '',
    drop_call_seconds: '360',
    drop_action: 'MESSAGE',
    drop_exten: '',
    drop_inbound_group: '---NONE---',
    drop_callmenu: '---NONE---',
    drop_lead_reset: 'N',
    after_hours_action: 'MESSAGE',
    after_hours_message_filename: '',
    after_hours_exten: '',
    after_hours_voicemail: '',
    afterhours_xfer_group: '---NONE---',
    after_hours_callmenu: '---NONE---',
    after_hours_lead_reset: 'N',
    play_welcome_message: 'ALWAYS',
    welcome_message_filename: '',
    moh_context: 'default',
    onhold_prompt_filename: '',
    onhold_prompt_no_block: 'N',
    onhold_prompt_seconds: '10',
    prompt_interval: '60',
    play_place_in_line: 'N',
    play_estimate_hold_time: 'N',
    hold_time_option: 'NONE',
    hold_time_second_option: 'NONE',
    hold_time_third_option: 'NONE',
    hold_time_option_seconds: '120',
    hold_time_option_minimum: '0',
    hold_time_option_exten: '',
    hold_time_option_voicemail: '',
    hold_time_option_xfer_group: '---NONE---',
    hold_time_option_callmenu: '---NONE---',
    hold_time_option_callback_filename: '',
    hold_time_option_callback_list_id: '',
    hold_time_option_press_filename: '',
    hold_time_option_no_block: 'N',
    hold_time_option_prompt_seconds: '10',
    hold_recall_xfer_group: '---NONE---',
    hold_time_lead_reset: 'N',
    wait_hold_option_priority: 'WAIT',
    wait_time_option: 'NONE',
    wait_time_second_option: 'NONE',
    wait_time_third_option: 'NONE',
    wait_time_option_seconds: '120',
    wait_time_option_exten: '',
    wait_time_option_voicemail: '',
    wait_time_option_xfer_group: '---NONE---',
    wait_time_option_callmenu: '---NONE---',
    wait_time_option_callback_filename: '',
    wait_time_option_callback_list_id: '',
    wait_time_option_press_filename: '',
    wait_time_option_no_block: 'N',
    wait_time_option_prompt_seconds: '10',
    wait_time_lead_reset: 'N',
    no_agent_no_queue: 'N',
    no_agent_action: 'MESSAGE',
    no_agent_action_value: '',
    no_agent_delay: '0',
    in_queue_nanque: 'N',
    in_queue_nanque_exceptions: '',
    nanq_lead_reset: 'N',
    default_xfer_group: '---NONE---',
    action_xfer_cid: 'CUSTOMER',
    extension_appended_cidname: 'N',
    xferconf_a_dtmf: '',
    xferconf_a_number: '',
    xferconf_b_dtmf: '',
    xferconf_b_number: '',
    xferconf_c_number: '',
    xferconf_d_number: '',
    xferconf_e_number: '',
    xfer_talk_minimum: 'DISABLED',
    xfer_talk_minimum_sec: '5',
    ingroup_recording_override: 'DISABLED',
    ingroup_rec_filename: '',
    routing_initiated_recordings: 'N',
    stereo_recording: 'DISABLED',
    stereo_rec_filename: '',
    stereo_parallel_recording: 'N',
    parallel_rec_co_filename: '',
    parallel_rec_cm_filename: '',
    parallel_rec_fr_filename: '',
    recording_dtmf_muting: 'DISABLED',
    stereo_recording_agent: 'DISABLED',
    qc_enabled: 'N',
    qc_statuses: '',
    qc_shift_id: '',
    qc_get_record_launch: 'NONE',
    qc_show_recording: 'N',
    qc_web_form_address: '',
    qc_script: '',
    qc_scorecard_id: '',
    qc_statuses_id: '',
    max_calls_method: 'DISABLED',
    max_calls_count: '0',
    max_calls_action: 'DROP',
    areacode_filter: 'DISABLED',
    areacode_filter_seconds: '0',
    areacode_filter_action: 'MESSAGE',
    areacode_filter_action_value: '',
    inbound_survey: 'DISABLED',
    inbound_survey_filename: '',
    inbound_survey_accept_digit: '1',
    inbound_survey_question_filename: '',
    inbound_survey_callmenu: '---NONE---',
    populate_lead_ingroup: 'DISABLED',
    populate_lead_province: 'DISABLED',
    populate_state_areacode: 'DISABLED',
    populate_lead_source: '',
    populate_lead_vendor: '',
    populate_lead_comments: '',
    populate_lead_owner: '',
    add_lead_timezone: 'SERVER',
    answer_signal: 'START',
    browser_alert_sound: '',
    browser_alert_volume: '50',
    custom_one: '',
    custom_two: '',
    custom_three: '',
    custom_four: '',
    custom_five: '',
  };
}

function actionFields(entity, mode, admin, form = {}, user = null) {
  // Legacy admin.php only saves custom_dialplan_entry when the editor has
  // modify_custom_dialplans, independent of modify_servers/modify_ingroups.
  const canEditCustomDialplan = Number(user?.userLevel || 0) >= 9 || Boolean(user?.modifyCustomDialplans);
  const customDialplanField = (extra = {}) => ({
    key: 'custom_dialplan_entry',
    label: canEditCustomDialplan ? 'Custom Dialplan Entry' : 'Custom Dialplan Entry (requires the Custom Dialplans permission)',
    type: 'textarea',
    wide: true,
    disabled: !canEditCustomDialplan,
    ...extra,
  });
  const callTimeOptions = lookupOptions(admin?.lookups?.callTimes, 'call_time_id', 'call_time_name');
  const campaignOptions = lookupOptions(admin?.lookups?.campaigns, 'campaign_id', 'campaign_name');
  const userGroupOptions = lookupOptions(admin?.lookups?.userGroups, 'user_group', 'group_name');
  const userGroupAllOptions = withCurrentOption([{ value: '---ALL---', label: '---ALL---' }, ...userGroupOptions], form?.user_group);
  const scriptOptions = [{ value: '', label: 'NONE' }, ...lookupOptions(admin?.lookups?.scripts, 'script_id', 'script_name')];
  const leadFilterOptions = [{ value: 'NONE', label: 'NONE' }, ...lookupOptions(admin?.lookups?.leadFilters, 'lead_filter_id', 'lead_filter_name')];
  const inboundOptions = [{ value: '---NONE---', label: '---NONE---' }, ...lookupOptions(admin?.lookups?.inboundGroups, 'group_id', 'group_name')];
  const inboundStrictOptions = lookupOptions(admin?.lookups?.inboundGroups, 'group_id', 'group_name');
  const didOptions = lookupOptions(admin?.dids, 'did_pattern', 'did_description');
  const serverOptions = lookupOptions(admin?.lookups?.servers, 'server_ip', 'server_description');
  const listOptions = [{ value: '998', label: '998' }, ...lookupOptions(admin?.lookups?.lists, 'list_id', 'list_name')];
  const userOptions = lookupOptions(admin?.lookups?.users, 'user', 'full_name');
  const phoneOptions = uniqueOptions(lookupOptions(admin?.lookups?.phones, 'extension', 'label'));
  const callMenuLookupOptions = lookupOptions(admin?.lookups?.callMenus, 'menu_id', 'menu_name');
  const callMenuOptions = [{ value: '', label: 'NONE' }, ...callMenuLookupOptions];
  const callMenuNoneOptions = withCurrentOption([{ value: '---NONE---', label: '---NONE---' }, ...lookupOptions(admin?.lookups?.callMenus, 'menu_id', 'menu_name')], form?.amd_callmenu || form?.safe_harbor_menu_id);
  const callMenuRouteOptions = (currentValue) => withCurrentOption([{ value: '---NONE---', label: '---NONE---' }, { value: '', label: 'NONE' }, ...callMenuLookupOptions], currentValue);
  const cidGroupOptions = withCurrentOption([{ value: '---DISABLED---', label: '---DISABLED---' }, ...lookupOptions(admin?.lookups?.cidGroups, 'cid_group_id', 'cid_group_notes')], form?.cid_group_id || form?.cid_group_id_two);
  const ipListOptions = [{ value: '', label: '--- DISABLED ---' }, ...lookupOptions(admin?.lookups?.ipLists, 'ip_list_id', 'ip_list_name')];
  const filterPhoneGroupOptions = lookupOptions(admin?.lookups?.filterPhoneGroups, 'filter_phone_group_id', 'filter_phone_group_name');
  const audioLookupOptions = uniqueOptions(lookupOptions(admin?.lookups?.audioStore, 'filename', 'description'));
  const voicemailLookupOptions = uniqueOptions(lookupOptions(admin?.lookups?.voicemailBoxes, 'voicemail_id', 'fullname'));
  const mohLookupOptions = uniqueOptions(lookupOptions(admin?.lookups?.musicOnHold, 'moh_id', 'moh_name'));
  const shiftScopeOptions = [{ value: '---ALL---', label: '---ALL---' }, ...lookupOptions(admin?.lookups?.shifts, 'shift_id', 'shift_name')];
  const phoneCodeOptions = withCurrentOption(lookupOptions(admin?.lookups?.phoneCodes, 'country_code', 'country'), form?.phone_code);
  const phoneContextOptions = withCurrentOption(lookupOptions(admin?.lookups?.phoneContexts, 'phone_context', 'phone_context'), form?.phone_context || form?.exten_context);
  const campaignScopeOptions = [{ value: '-ALL-CAMPAIGNS-', label: '-ALL-CAMPAIGNS-' }, ...campaignOptions];
  const userGroupScopeOptions = [{ value: '---ALL---', label: '---ALL---' }, ...userGroupOptions];
  const inboundScopeOptions = [{ value: '---ALL---', label: '---ALL---' }, ...inboundStrictOptions];
  const callTimeScopeOptions = [{ value: '---ALL---', label: '---ALL---' }, ...callTimeOptions];
  const reportScopeOptions = [{ value: 'ALL REPORTS', label: 'ALL REPORTS' }, { value: 'NONE', label: 'NONE' }, ...reportOptions()];
  const manualFilterOptions = withCurrentOption(enumOptions(MANUAL_DIAL_FILTER_OPTIONS), form?.manual_dial_filter);
  const manualSearchFilterOptions = withCurrentOption(enumOptions(MANUAL_SEARCH_FILTER_OPTIONS), form?.manual_dial_search_filter);
  const clipboardFieldOptions = withCurrentOption(enumOptions(['NONE', ...LEAD_FIELD_OPTIONS.filter((field) => field !== 'DISABLED')]), form?.agent_clipboard_copy);
  const dropRateGroupOptions = enumOptions(ensureOption(['DISABLED', '101', '102', '103', '104', '105', '106', '107', '108', '109', '110'], form?.drop_rate_group));
  const callbackTimezoneOptions = enumOptions(ensureOption(['DISABLED', 'TIMEZONES_AUSTRALIA', 'TIMEZONES_CANADA', 'TIMEZONES_USA'], form?.scheduled_callbacks_timezones_container));
  const didRouteOptions = ['EXTEN', 'VOICEMAIL', 'AGENT', 'PHONE', 'IN_GROUP', 'CALLMENU', 'VMAIL_NO_INST'];
  const didCallHandleOptions = ['CID', 'CIDLOOKUP', 'CIDLOOKUPRL', 'CIDLOOKUPRC', 'CIDLOOKUPALT', 'CIDLOOKUPRLALT', 'CIDLOOKUPRCALT', 'ANI', 'ANILOOKUP', 'ANILOOKUPRL', 'ANILOOKUPRC', 'ANILOOKUPALT', 'ANILOOKUPRLALT', 'ANILOOKUPRCALT', 'DID'];
  const audioOptionsFor = (currentValue) => withCurrentOption([{ value: '', label: 'NONE' }, ...audioLookupOptions], currentValue);
  const voicemailOptionsFor = (currentValue) => withCurrentOption([{ value: '', label: 'NONE' }, ...voicemailLookupOptions], currentValue);
  const mohOptionsFor = (currentValue) => withCurrentOption([{ value: '', label: 'NONE' }, ...mohLookupOptions], currentValue);
  const recordingOptionsFor = (currentValue) => withCurrentOption(enumOptions(RECORDING_FILENAME_OPTIONS), currentValue);
  const lookupField = (key, label, options, currentValue, enabled, extra = {}) => ({
    key,
    label,
    type: enabled ? 'select' : 'text',
    options: enabled ? options : undefined,
    ...extra,
  });
  // Audio prompt fields use the legacy-style chooser (free text + clickable
  // label opening the audio file list) instead of a select - values can be
  // pipe-separated lists and files often live only on the dialers.
  const audioField = (key, label, currentValue, extra = {}) => ({ key, label, type: 'audio', ...extra });
  const voicemailField = (key, label, currentValue, extra = {}) => lookupField(key, label, voicemailOptionsFor(currentValue), currentValue, true, extra);
  const mohField = (key, label, currentValue, extra = {}) => lookupField(key, label, mohOptionsFor(currentValue), currentValue, true, extra);
  const recordingField = (key, label, currentValue, extra = {}) => lookupField(key, label, recordingOptionsFor(currentValue), currentValue, true, extra);
  const routeOptionsFor = (route, currentValue) => {
    const normalized = String(route || '').toUpperCase();
    if (normalized === 'CALLMENU' || normalized === 'PRESS_CALLMENU') return callMenuRouteOptions(currentValue);
    if (normalized === 'INGROUP' || normalized === 'IN_GROUP' || normalized === 'PRESS_INGROUP') return withCurrentOption(inboundOptions, currentValue);
    if (normalized === 'DID') return withCurrentOption(didOptions, currentValue);
    if (normalized === 'PHONE') return withCurrentOption(phoneOptions, currentValue);
    if (normalized === 'VOICEMAIL' || normalized === 'VMAIL_NO_INST' || normalized === 'PRESS_VMAIL' || normalized === 'PRESS_VMAIL_NO_INST') return voicemailOptionsFor(currentValue);
    if (normalized === 'MESSAGE' || normalized === 'HANGUP' || normalized === 'AUDIO') return audioOptionsFor(currentValue);
    return [];
  };
  const routeTargetField = (route, key, label, currentValue, extra = {}) => {
    const normalized = String(route || '').toUpperCase();
    if (['MESSAGE', 'HANGUP', 'AUDIO', 'PLAY', 'PRESS_PLAY'].includes(normalized)) {
      return { key, label, type: 'audio', ...extra };
    }
    const options = routeOptionsFor(route, currentValue);
    const selectEnabled = options.length > 0 && !['EXTENSION', 'PRESS_EXTEN', 'AGI', 'WEBFORM'].includes(normalized);
    return {
      key,
      label,
      type: selectEnabled ? 'select' : 'text',
      options: selectEnabled ? options : undefined,
      ...extra,
    };
  };
  const currentStatuses = campaignDialStatuses(form);

  if (entity === 'campaignCopy') {
    return [
      { key: 'campaign_id', label: 'New Campaign ID' },
      { key: 'campaign_name', label: 'New Campaign Name' },
      { key: 'source_campaign_id', label: 'Source Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions },
    ];
  }

  if (entity === 'campaigns') {
    const basicFields = [
      { key: 'campaign_id', label: 'Campaign ID', disabled: mode === 'edit' },
      { key: 'campaign_name', label: 'Campaign Name' },
      { key: 'campaign_description', label: 'Description', wide: true },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'dial_method', label: 'Dial Method', type: 'select', options: enumOptions(['MANUAL', 'RATIO', 'ADAPT_HARD_LIMIT', 'ADAPT_TAPERED', 'ADAPT_AVERAGE', 'ADAPT_PERCENTMAX', 'INBOUND_MAN', 'SHARED_RATIO', 'SHARED_ADAPT_HARD_LIMIT', 'SHARED_ADAPT_TAPERED', 'SHARED_ADAPT_AVERAGE', 'SHARED_ADAPT_PERCENTMAX']) },
      { key: 'auto_dial_level', label: 'Auto Dial Level', type: 'select', options: autoDialLevelOptions(admin, form?.auto_dial_level) },
      { key: 'hopper_level', label: 'Minimum Hopper Level', type: 'select', options: enumOptions(HOPPER_LEVELS.includes(String(form?.hopper_level || '')) ? HOPPER_LEVELS : [String(form?.hopper_level || '1'), ...HOPPER_LEVELS]) },
      { key: 'lead_order', label: 'List Order', type: 'select', options: enumOptions(LEAD_ORDER_OPTIONS.includes(String(form?.lead_order || '')) ? LEAD_ORDER_OPTIONS : [String(form?.lead_order || 'DOWN'), ...LEAD_ORDER_OPTIONS]) },
      { key: 'local_call_time', label: 'Call Time', type: callTimeOptions.length ? 'select' : 'text', options: callTimeOptions },
      { key: 'campaign_recording', label: 'Recording', type: 'select', options: enumOptions(['NEVER', 'ONDEMAND', 'ALLCALLS', 'ALLFORCE']) },
      { key: 'campaign_allow_inbound', label: 'Allow Inbound', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    ];

    if (mode !== 'editDetail') {
      // BASIC edit page is operational-only (Steve 2026-07-12): every field
      // read-only except Auto Dial Level; full editing lives on the Detail
      // page. Create mode keeps everything editable.
      if (mode === 'edit') {
        return basicFields.map((field) => (field.key === 'auto_dial_level' ? field : { ...field, disabled: true }));
      }
      return basicFields;
    }

    return [
      { section: 'Basic Campaign' },
      ...basicFields.map((field) => ({ ...field, disabled: field.key === 'campaign_id' || field.disabled })),
      { section: 'Dialing and Hopper' },
      // Dial statuses are managed through the Manage Dial Statuses modal
      // (toggle grid, applies immediately) — the legacy one-at-a-time
      // add/remove selects are gone.
      { key: '_dial_status_list', label: 'Current Dial Statuses', type: 'statusList', statuses: currentStatuses, wide: true },
      { key: 'allow_closers', label: 'Allow Closers', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'next_agent_call', label: 'Next Agent Call', type: 'select', options: enumOptions(ensureOption(NEXT_AGENT_CALL_OPTIONS, form?.next_agent_call)) },
      { key: 'dial_timeout', label: 'Dial Timeout', type: 'number' },
      { key: 'dial_prefix', label: 'Dial Prefix' },
      { key: 'campaign_cid', label: 'Campaign CID' },
      // Hidden from the Detail form (Steve 2026-07-12): tally/threshold,
      // adaptive-tuning, concurrent-transfer and hopper-tuning knobs plus a
      // batch of recording/script/AMD extras. Their values stay in form
      // state, so the main Save resends them unchanged; the DB defaults (or
      // legacy admin.php) still control them.
      { key: 'call_count_limit', label: 'Call Count Limit', type: 'number' },
      { key: 'call_count_target', label: 'Call Count Target', type: 'number' },
      { key: 'call_count_limit_restrict', label: 'Call Count Limit Manual Restrict', type: 'select', options: enumOptions(ensureOption(['DISABLED', 'RESTRICT_ALL'], form?.call_count_limit_restrict)) },
      { key: 'reset_hopper', label: 'Force Reset of Hopper', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'auto_alt_dial', label: 'Auto Alt Dial', type: 'select', options: enumOptions(['NONE', 'ALT_ONLY', 'ADDR3_ONLY', 'ALT_AND_ADDR3', 'ALT_AND_EXTENDED', 'ALT_AND_ADDR3_AND_EXTENDED', 'EXTENDED_ONLY', 'MULTI_LEAD']) },
      { key: 'auto_alt_dial_statuses', label: 'Auto Alt Statuses', wide: true },
      { section: 'Routing and Inbound' },
      { key: 'manual_dial_list_id', label: 'Manual Dial List', type: listOptions.length ? 'select' : 'text', options: listOptions },
      { key: 'default_xfer_group', label: 'Default Xfer Group', type: inboundOptions.length ? 'select' : 'text', options: inboundOptions },
      { key: 'queue_priority', label: 'Queue Priority', type: 'select', options: labeledNumberOptions(99, -99, (value) => `${value} - ${value < 0 ? 'Lower' : value > 0 ? 'Higher' : 'Even'}`, form?.queue_priority) },
      { key: 'drop_call_seconds', label: 'Drop Seconds', type: 'number' },
      { key: 'drop_action', label: 'Drop Action', type: 'select', options: enumOptions(['HANGUP', 'MESSAGE', 'VOICEMAIL', 'IN_GROUP', 'AUDIO', 'CALLMENU', 'VMAIL_NO_INST']) },
      { key: 'drop_inbound_group', label: 'Drop Inbound Group', type: inboundOptions.length ? 'select' : 'text', options: inboundOptions },
      { key: 'inbound_queue_no_dial', label: 'Inbound Queue No Dial', type: 'select', options: enumOptions(ensureOption(INBOUND_QUEUE_NO_DIAL_OPTIONS, form?.inbound_queue_no_dial)) },
      { key: 'inbound_no_agents_no_dial_container', label: 'Inbound No-Agents No-Dial', type: 'select', options: enumOptions(ensureOption(['---DISABLED---'], form?.inbound_no_agents_no_dial_container)) },
      { key: 'inbound_no_agents_no_dial_threshold', label: 'Inbound No-Agents No-Dial Threshold', type: 'number' },
      { key: 'closer_campaigns', label: 'Allowed Inbound Groups', type: 'checkboxGroupText', options: inboundStrictOptions, values: scopeValues, serialize: viciGroupText, wide: true },
      ...(form?.allow_closers === 'Y' ? [{ key: 'xfer_groups', label: 'Allowed Transfer Groups', type: 'checkboxGroupText', options: inboundStrictOptions, values: scopeValues, serialize: viciGroupText, wide: true }] : []),
      { key: 'dial_timeout_lead_container', label: 'Dial Timeout Lead Container', type: 'select', options: enumOptions(ensureOption(['DISABLED'], form?.dial_timeout_lead_container)) },
      { key: 'cid_group_id', label: 'CID Group', type: 'select', options: cidGroupOptions },
      { key: 'cid_group_id_two', label: 'CID Group Failover', type: 'select', options: withCurrentOption(cidGroupOptions, form?.cid_group_id_two) },
      { key: 'safe_harbor_exten', label: 'Safe Harbor Exten' },
      audioField('safe_harbor_audio', 'Safe Harbor Audio', form?.safe_harbor_audio),
      { key: 'safe_harbor_audio_field', label: 'Safe Harbor Audio Field', type: 'select', options: enumOptions(ensureOption(LEAD_FIELD_OPTIONS, form?.safe_harbor_audio_field)) },
      { key: 'safe_harbor_menu_id', label: 'Safe Harbor Call Menu', type: callMenuOptions.length ? 'select' : 'text', options: withCurrentOption(callMenuOptions, form?.safe_harbor_menu_id) },
      voicemailField('voicemail_ext', 'Voicemail', form?.voicemail_ext),
      mohField('park_file_name', 'Park Music-on-Hold', form?.park_file_name),
      { key: 'use_internal_dnc', label: 'Internal DNC', type: 'select', options: enumOptions(['Y', 'N', 'AREACODE']) },
      { key: 'use_campaign_dnc', label: 'Campaign DNC', type: 'select', options: enumOptions(['Y', 'N', 'AREACODE']) },
      { key: 'use_other_campaign_dnc', label: 'Other Campaign DNC' },
      { key: 'use_custom_cid', label: 'Custom CallerID', type: 'select', options: enumOptions(ensureOption(CUSTOM_CID_OPTIONS, form?.use_custom_cid)) },
      { key: 'agent_search_method', label: 'Agent Search Override', type: 'select', options: [{ value: '', label: 'DISABLED' }, ...enumOptions(AGENT_SEARCH_OPTIONS.filter(Boolean))] },
      { key: 'agent_hangup_route', label: 'Agent Hangup Route', type: 'select', options: enumOptions(ensureOption(AGENT_HANGUP_ROUTE_OPTIONS, form?.agent_hangup_route)) },
      routeTargetField(form?.agent_hangup_route, 'agent_hangup_value', 'Agent Hangup Value', form?.agent_hangup_value),
      { key: 'agent_hangup_ig_override', label: 'Agent Hangup In-Group Override', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'ivr_park_call', label: 'Park Call IVR', type: 'select', options: enumOptions(ensureOption(PARK_CALL_IVR_OPTIONS, form?.ivr_park_call)) },
      { key: 'ivr_park_call_agi', label: 'Park IVR AGI' },
      { key: 'omit_phone_code', label: 'Omit Phone Code', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_pause_codes_active', label: 'Pause Codes Active', type: 'select', options: enumOptions(['Y', 'N', 'FORCE']) },
      { section: 'Recording, Scripts, and Forms' },
      { key: 'campaign_vdad_exten', label: 'Routing Extension' },
      recordingField('campaign_rec_filename', 'Recording Filename', form?.campaign_rec_filename),
      { key: 'campaign_script', label: 'Script', type: scriptOptions.length ? 'select' : 'text', options: scriptOptions },
      { key: 'campaign_script_two', label: 'Second Script', type: scriptOptions.length ? 'select' : 'text', options: scriptOptions },
      { key: 'user_group_script', label: 'User Group Script Override', type: 'select', options: enumOptions(ENABLED_DISABLED_OPTIONS) },
      { key: 'clear_form', label: 'Clear Form Tab', type: 'select', options: enumOptions(['DISABLED', 'ENABLED', 'ACKNOWLEDGE']) },
      { key: 'get_call_launch', label: 'Call Launch', type: 'select', options: enumOptions(['NONE', 'SCRIPT', 'SCRIPTTWO', 'WEBFORM', 'WEBFORMTWO', 'WEBFORMTHREE', 'FORM', 'PREVIEW_WEBFORM', 'PREVIEW_WEBFORMTWO', 'PREVIEW_WEBFORMTHREE', 'PREVIEW_SCRIPT', 'PREVIEW_SCRIPTTWO', 'PREVIEW_FORM']) },
      audioField('am_message_exten', 'Answering Machine Message', form?.am_message_exten),
      { key: 'vmm_daily_limit', label: 'Voicemail Message Daily Limit', type: 'number' },
      { section: 'AMD and Voicemail Routing' },
      { key: 'amd_type', label: 'AMD Type', type: 'select', options: enumOptions(['AMD', 'CPD', 'KHOMP', 'ViciAMD']) },
      { key: 'amd_send_to_vmx', label: 'AMD Send to Action', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'amd_agent_route_options', label: 'AMD Agent Route Options', type: 'select', options: enumOptions(['ENABLED', 'PENDING', 'DISABLED']) },
      { key: 'amd_status_map', label: 'AMD Status Map', type: 'select', options: enumOptions(ensureOption(['DISABLED', 'Default_AMD_status_map'], form?.amd_status_map)) },
      { key: 'amd_inbound_group', label: 'AMD Inbound Group', type: inboundOptions.length ? 'select' : 'text', options: inboundOptions },
      { key: 'amd_callmenu', label: 'AMD Call Menu', type: callMenuNoneOptions.length ? 'select' : 'text', options: withCurrentOption(callMenuNoneOptions, form?.amd_callmenu) },
      { key: 'leave_vm_message_group_id', label: 'VM Message Group', type: 'select', options: enumOptions(ensureOption(['---NONE---'], form?.leave_vm_message_group_id)) },
      { key: 'leave_vm_no_dispo', label: 'Leave VM No Dispo', type: 'select', options: enumOptions(ENABLED_DISABLED_OPTIONS) },
      { key: 'timer_action', label: 'Timer Action', type: 'select', options: enumOptions(ensureOption(TIMER_ACTION_OPTIONS, form?.timer_action)) },
      { key: 'timer_action_message', label: 'Timer Message' },
      { key: 'timer_action_seconds', label: 'Timer Seconds', type: 'number' },
      { key: 'timer_action_destination', label: 'Timer Destination' },
      { key: 'web_form_target', label: 'Web Form Target' },
      // Webform/call URLs moved to the Connections strip's "Webform URLs"
      // and "Call URLs" pill modals — the values still live in form state
      // (campaignPayload saves them on the main Save) but aren't rendered
      // as form fields here.
      { section: 'Transfers and 3-Way Calls' },
      { key: 'xferconf_a_dtmf', label: 'Transfer-Conf DTMF 1' },
      { key: 'xferconf_a_number', label: 'Transfer-Conf Number 1' },
      { key: 'xferconf_b_dtmf', label: 'Transfer-Conf DTMF 2' },
      { key: 'xferconf_b_number', label: 'Transfer-Conf Number 2' },
      { key: 'xferconf_c_number', label: 'Transfer-Conf Number 3' },
      { key: 'xferconf_d_number', label: 'Transfer-Conf Number 4' },
      { key: 'xferconf_e_number', label: 'Transfer-Conf Number 5' },
      { key: 'enable_xfer_presets', label: 'Enable Transfer Presets', type: 'select', options: enumOptions(['DISABLED', 'ENABLED', 'STAGING', 'CONTACTS']) },
      { key: 'hide_xfer_number_to_dial', label: 'Hide Transfer Number to Dial', type: 'select', options: enumOptions(ENABLED_DISABLED_OPTIONS) },
      { key: 'prepopulate_transfer_preset', label: 'PrePopulate Transfer Preset', type: 'select', options: enumOptions(TRANSFER_PRESET_OPTIONS) },
      { key: 'quick_transfer_button', label: 'Quick Transfer Button', type: 'select', options: enumOptions(QUICK_TRANSFER_OPTIONS) },
      { key: 'transfer_button_launch', label: 'Transfer Button Launch', type: 'select', options: enumOptions(ensureOption(TRANSFER_BUTTON_LAUNCH_OPTIONS, form?.transfer_button_launch)) },
      { key: 'transfer_no_dispo', label: 'Transfer No Dispo', type: 'select', options: enumOptions(TRANSFER_NO_DISPO_OPTIONS) },
      { key: 'custom_3way_button_transfer', label: 'Custom 3-Way Button Transfer', type: 'select', options: enumOptions(CUSTOM_3WAY_OPTIONS) },
      { key: 'three_way_call_cid', label: '3-Way Call Outbound CallerID', type: 'select', options: enumOptions(['CAMPAIGN', 'CUSTOMER', 'AGENT_PHONE', 'AGENT_CHOOSE', 'CUSTOM_CID']) },
      { key: 'three_way_dial_prefix', label: '3-Way Call Dial Prefix' },
      { key: 'three_way_volume_buttons', label: '3-Way Volume Buttons', type: 'select', options: enumOptions(ENABLED_DISABLED_OPTIONS) },
      { key: 'customer_3way_hangup_logging', label: 'Customer 3-Way Hangup Logging', type: 'select', options: enumOptions(ENABLED_DISABLED_OPTIONS) },
      { key: 'customer_3way_hangup_seconds', label: 'Customer 3-Way Hangup Seconds', type: 'number' },
      { key: 'customer_3way_hangup_action', label: 'Customer 3-Way Hangup Action', type: 'select', options: enumOptions(['NONE', 'DISPO']) },
      { key: 'three_way_record_stop', label: '3-Way Recording Stop', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'three_way_record_stop_exception', label: '3-Way Recording Stop Exception', type: 'select', options: enumOptions(ensureOption(['DISABLED'], form?.three_way_record_stop_exception)) },
      { key: 'leave_3way_start_recording', label: 'Leave 3-Way Start Recording', type: 'select', options: enumOptions(['DISABLED', 'ALL_CALLS', 'ALL_BUT_EXCEPTIONS', 'ONLY_EXCEPTIONS']) },
      { key: 'leave_3way_start_recording_exception', label: 'Leave 3-Way Start Recording Exception', type: 'select', options: enumOptions(ensureOption(['DISABLED'], form?.leave_3way_start_recording_exception)) },
      { key: 'leave_3way_stop_recording', label: 'Leave 3-Way Stop Recording', type: 'select', options: enumOptions(['DISABLED', 'ALL_CALLS']) },
      { key: 'hangup_xfer_record_start', label: 'Hangup Xfer Recording Start', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { section: 'Lead Control and Callbacks' },
      { key: 'lead_filter_id', label: 'Lead Filter', type: leadFilterOptions.length ? 'select' : 'text', options: leadFilterOptions },
      { key: 'list_order_mix', label: 'List Mix', type: 'select', options: withCurrentOption([{ value: 'DISABLED', label: 'DISABLED' }, ...(admin?.lookups?.listMixes || []).filter((item) => String(item.campaign_id || '') === String(form?.campaign_id || '')).map((item) => ({ value: String(item.vcl_id || ''), label: `${item.vcl_id} - ${item.vcl_name || item.status || ''}` }))], form?.list_order_mix) },
      { key: 'display_dialable_count', label: 'Display Dialable Count', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'display_leads_count', label: 'Display Leads Count', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'lead_order_randomize', label: 'Lead Order Randomize', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'lead_order_secondary', label: 'Secondary Lead Order', type: 'select', options: enumOptions(['LEAD_ASCEND', 'LEAD_DESCEND', 'CALLTIME_ASCEND', 'CALLTIME_DESCEND', 'VENDOR_ASCEND', 'VENDOR_DESCEND']) },
      { key: 'scheduled_callbacks', label: 'Scheduled Callbacks', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'scheduled_callbacks_alert', label: 'Callback Alert', type: 'select', options: enumOptions(ensureOption(SCHEDULED_CALLBACK_ALERT_OPTIONS, form?.scheduled_callbacks_alert)) },
      { key: 'scheduled_callbacks_email_alert', label: 'Callback Email Alert', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'scheduled_callbacks_count', label: 'Callback Count', type: 'select', options: enumOptions(ensureOption(['LIVE', 'ALL_ACTIVE'], form?.scheduled_callbacks_count)) },
      { key: 'scheduled_callbacks_force_dial', label: 'Callback Force Dial', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'scheduled_callbacks_auto_reschedule', label: 'Callback Auto Reschedule', type: 'select', options: enumOptions(ensureOption(SCHEDULED_CALLBACK_AUTO_RESCHEDULE_OPTIONS, form?.scheduled_callbacks_auto_reschedule)) },
      { key: 'scheduled_callbacks_timezones_container', label: 'Callback Local Timezones', type: 'select', options: callbackTimezoneOptions },
      { key: 'callback_days_limit', label: 'Callback Days Limit', type: 'number' },
      { key: 'callback_hours_block', label: 'Callback Hours Block', type: 'number' },
      { key: 'callback_list_calltime', label: 'Callback List Calltime', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'callback_active_limit', label: 'Callback Active Limit', type: 'number' },
      { key: 'callback_active_limit_override', label: 'Callback Limit Override', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'callback_display_days', label: 'Callback Display Days', type: 'number' },
      { key: 'callback_useronly_move_minutes', label: 'Useronly Move Minutes', type: 'number' },
      { key: 'my_callback_option', label: 'My Callback Option', type: 'select', options: enumOptions(['CHECKED', 'UNCHECKED']) },
      { key: 'show_previous_callback', label: 'Show Previous Callback', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'next_dial_my_callbacks', label: 'Next Dial My Callbacks', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'callback_dnc', label: 'Callback DNC', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { section: 'Dead Call and Limit Handling' },
      { key: 'disable_dispo_screen', label: 'Disable Dispo Screen', type: 'select', options: enumOptions(['DISPO_ENABLED', 'DISPO_DISABLED', 'DISPO_SELECT_DISABLED']) },
      { key: 'disable_dispo_status', label: 'Disable Dispo Status' },
      { key: 'script_top_dispo', label: 'Script on top of Dispo', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'wrapup_after_hotkey', label: 'Wrap Up After Hotkey', type: 'select', options: enumOptions(ENABLED_DISABLED_OPTIONS) },
      { key: 'dead_trigger_action', label: 'Dead Call Trigger Action', type: 'select', options: enumOptions(['DISABLED', 'AUDIO', 'URL', 'AUDIO_AND_URL']) },
      { key: 'dead_trigger_seconds', label: 'Dead Call Trigger Seconds', type: 'number' },
      { key: 'dead_trigger_repeat', label: 'Dead Call Trigger Repeat', type: 'select', options: enumOptions(['NO', 'REPEAT_ALL', 'REPEAT_AUDIO', 'REPEAT_URL']) },
      audioField('dead_trigger_filename', 'Dead Call Trigger Audio', form?.dead_trigger_filename),
      { key: 'dead_trigger_url', label: 'Dead Call Trigger URL' },
      { key: 'dead_max', label: 'Dead Call Max Seconds', type: 'number' },
      { key: 'dead_max_dispo', label: 'Dead Call Max Status' },
      { key: 'dead_to_dispo', label: 'Dead Call to Dispo Only', type: 'select', options: enumOptions(ENABLED_DISABLED_OPTIONS) },
      { key: 'dead_stop_recording', label: 'Dead Stop Recording', type: 'select', options: enumOptions(ensureOption(DEAD_STOP_RECORDING_OPTIONS, form?.dead_stop_recording)) },
      { key: 'dispo_max', label: 'Dispo Call Max Seconds', type: 'number' },
      { key: 'dispo_max_dispo', label: 'Dispo Call Max Status' },
      { key: 'pause_max', label: 'Agent Pause Max Seconds', type: 'number' },
      { key: 'pause_max_dispo', label: 'Agent Pause Max Status' },
      { key: 'pause_max_exceptions', label: 'Agent Pause Max Exceptions', type: 'select', options: enumOptions(ensureOption(['DISABLED'], form?.pause_max_exceptions)) },
      { key: 'pause_max_url', label: 'Pause Max URL' },
      { key: 'in_man_dial_next_ready_seconds', label: 'InMan Forced Ready Seconds', type: 'number' },
      { key: 'in_man_dial_next_ready_seconds_override', label: 'InMan Forced Ready Override', type: 'select', options: enumOptions(ensureOption(['DISABLED'], form?.in_man_dial_next_ready_seconds_override)) },
      { key: 'customer_gone_seconds', label: 'Customer Gone Warning Seconds', type: 'number' },
      { section: 'Agent Screen and Limits' },
      { key: 'wrapup_seconds', label: 'Wrapup Seconds', type: 'number' },
      { key: 'wrapup_message', label: 'Wrapup Message' },
      { key: 'wrapup_bypass', label: 'Wrapup Bypass', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'pause_after_each_call', label: 'Pause After Each Call', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'pause_after_next_call', label: 'Pause After Next Call', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'manual_dial_prefix', label: 'Manual Dial Prefix' },
      { key: 'manual_preview_dial', label: 'Manual Preview Dial', type: 'select', options: enumOptions(['DISABLED', 'PREVIEW_AND_SKIP', 'PREVIEW_ONLY']) },
      { key: 'manual_dial_call_time_check', label: 'Manual Dial Call Time Check', type: 'select', options: enumOptions(['DISABLED', 'ENABLED']) },
      { key: 'manual_dial_filter', label: 'Manual Dial Filter', type: manualFilterOptions.length ? 'select' : 'text', options: manualFilterOptions },
      { key: 'manual_dial_search_filter', label: 'Manual Search Filter', type: manualSearchFilterOptions.length ? 'select' : 'text', options: manualSearchFilterOptions },
      { key: 'manual_dial_timeout', label: 'Manual Dial Timeout' },
      { key: 'manual_dial_hopper_check', label: 'Manual Hopper Check', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'manual_auto_next', label: 'Manual Auto Next', type: 'number' },
      { key: 'manual_auto_show', label: 'Manual Auto Show', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_clipboard_copy', label: 'Clipboard Copy Field', type: 'select', options: clipboardFieldOptions },
      { key: 'agent_lead_search', label: 'Agent Lead Search', type: 'select', options: enumOptions(['ENABLED', 'LIVE_CALL_INBOUND', 'LIVE_CALL_INBOUND_AND_MANUAL', 'DISABLED']) },
      { key: 'agent_lead_search_method', label: 'Agent Lead Search Method', type: 'select', options: enumOptions(ensureOption(AGENT_LEAD_SEARCH_METHOD_OPTIONS, form?.agent_lead_search_method)) },
      { key: 'agent_search_ingroup_list', label: 'Agent Search In-Group List Restrict', type: 'select', options: enumOptions(['ENABLED', 'ENABLED_OVERRIDE', 'DISABLED']) },
      { key: 'agent_hide_hangup', label: 'Hide Hangup', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_dial_owner_only', label: 'Owner Only Dialing', type: 'select', options: enumOptions(AGENT_OWNER_ONLY_OPTIONS) },
      { key: 'owner_populate', label: 'Owner Populate', type: 'select', options: enumOptions(ENABLED_DISABLED_OPTIONS) },
      { key: 'agent_display_dialable_leads', label: 'Display Dialable Leads', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'screen_labels', label: 'Agent Screen Labels', type: 'select', options: enumOptions(ensureOption(['--SYSTEM-SETTINGS--'], form?.screen_labels)) },
      { key: 'allow_required_fields', label: 'Allow Required Fields', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'status_display_fields', label: 'Status Display Fields', type: 'select', options: enumOptions(ensureOption(STATUS_DISPLAY_FIELD_OPTIONS, form?.status_display_fields)) },
      { key: 'state_descriptions', label: 'State Descriptions Banner', type: 'select', options: enumOptions(ensureOption(['---DISABLED---'], form?.state_descriptions)) },
      { key: 'agent_display_fields', label: 'Agent Display Fields' },
      { key: 'agent_screen_time_display', label: 'Agent Screen Time Display', type: 'select', options: enumOptions(ensureOption(AGENT_SCREEN_TIME_OPTIONS, form?.agent_screen_time_display)) },
      { key: 'display_queue_count', label: 'Agent Display Queue Count', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'calls_inqueue_count_one', label: 'Calls In Queue Count Display 1', type: 'select', options: enumOptions(ensureOption(['DISABLED'], form?.calls_inqueue_count_one)) },
      { key: 'calls_inqueue_count_two', label: 'Calls In Queue Count Display 2', type: 'select', options: enumOptions(ensureOption(['DISABLED'], form?.calls_inqueue_count_two)) },
      { key: 'view_calls_in_queue', label: 'Agent View Calls in Queue', type: 'select', options: enumOptions(['NONE', 'ALL', '1', '2', '3', '4', '5']) },
      { key: 'view_calls_in_queue_launch', label: 'View Calls in Queue Launch', type: 'select', options: enumOptions(['AUTO', 'MANUAL']) },
      { key: 'calls_waiting_vl_one', label: 'Calls Queue Extra Column 1', type: 'select', options: enumOptions(ensureOption(QUEUE_FIELD_OPTIONS, form?.calls_waiting_vl_one)) },
      { key: 'calls_waiting_vl_two', label: 'Calls Queue Extra Column 2', type: 'select', options: enumOptions(ensureOption(QUEUE_FIELD_OPTIONS, form?.calls_waiting_vl_two)) },
      { key: 'grab_calls_in_queue', label: 'Agent Grab Calls in Queue', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'call_requeue_button', label: 'Agent Call Re-Queue Button', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'ready_max_logout', label: 'Ready Max Logout', type: 'number' },
      { key: 'max_logged_in_agents', label: 'Max Logged-In Agents', type: 'number' },
      { key: 'auto_pause_precall', label: 'Auto Pause Pre-Call Work', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'auto_resume_precall', label: 'Auto Resume Pre-Call Work', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'auto_pause_precall_code', label: 'Auto Pause Pre-Call Code' },
      { key: 'campaign_stats_refresh', label: 'Campaign Stats Refresh', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'realtime_agent_time_stats', label: 'Real-Time Agent Time Stats', type: 'select', options: enumOptions(['DISABLED', 'WAIT_CUST_ACW', 'WAIT_CUST_ACW_PAUSE', 'CALLS_WAIT_CUST_ACW_PAUSE']) },
      { key: 'disable_alter_custdata', label: 'Disable Alter Customer Data', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'disable_alter_custphone', label: 'Disable Alter Customer Phone', type: 'select', options: enumOptions(['Y', 'N', 'HIDE']) },
      { key: 'no_hopper_dialing', label: 'No Hopper Dialing', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'manual_dial_override', label: 'Manual Dial Override', type: 'select', options: enumOptions(['NONE', 'ALLOW_ALL', 'DISABLE_ALL']) },
      { key: 'manual_dial_override_field', label: 'Manual Dial Override Field', type: 'select', options: enumOptions(ENABLED_DISABLED_OPTIONS) },
      { key: 'manual_dial_search_checkbox', label: 'Manual Dial Search Checkbox', type: 'select', options: enumOptions(['SELECTED', 'SELECTED_RESET', 'SELECTED_LOCK', 'UNSELECTED', 'UNSELECTED_RESET', 'UNSELECTED_LOCK']) },
      { key: 'manual_dial_lead_id', label: 'Manual Dial by Lead ID', type: 'select', options: enumOptions(['Y', 'N', 'ONLY']) },
      { key: 'api_manual_dial', label: 'Manual Dial API', type: 'select', options: enumOptions(['STANDARD', 'QUEUE', 'QUEUE_AND_AUTOCALL']) },
      { key: 'manual_dial_cid', label: 'Manual Dial CID', type: 'select', options: enumOptions(['CAMPAIGN', 'AGENT_PHONE', 'AGENT_PHONE_OVERRIDE']) },
      { key: 'manual_minimum_attempt_seconds', label: 'Manual Minimum Attempt Seconds', type: 'number' },
      { key: 'manual_minimum_answer_seconds', label: 'Manual Minimum Answer Seconds', type: 'number' },
      { key: 'post_phone_time_diff_alert', label: 'Phone Post Time Difference Alert', type: 'select', options: enumOptions(['ENABLED', 'OUTSIDE_CALLTIME_ONLY', 'OUTSIDE_CALLTIME_PHONE', 'OUTSIDE_CALLTIME_POSTAL', 'OUTSIDE_CALLTIME_BOTH', 'DISABLED']) },
      { key: 'in_group_dial', label: 'In-Group Manual Dial', type: 'select', options: enumOptions(['DISABLED', 'MANUAL_DIAL', 'NO_DIAL', 'BOTH']) },
      { key: 'in_group_dial_select', label: 'In-Group Manual Dial Select', type: 'select', options: enumOptions(['CAMPAIGN_SELECTED', 'ALL_USER_GROUP']) },
      { section: 'Compliance and Enhancements' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'per_call_notes', label: 'Per Call Notes', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'force_per_call_notes', label: 'Per Call Notes Required', type: 'select', options: enumOptions(['DISABLED', 'ENABLED', '5_CHARACTERS', '15_CHARACTERS', '30_CHARACTERS', '100_CHARACTERS']) },
      { key: 'comments_all_tabs', label: 'Comments All Tabs', type: 'select', options: enumOptions(ENABLED_DISABLED_OPTIONS) },
      { key: 'comments_dispo_screen', label: 'Comments Dispo Screen', type: 'select', options: enumOptions(['ENABLED', 'DISABLED', 'REPLACE_CALL_NOTES']) },
      { key: 'comments_callback_screen', label: 'Comments Callback Screen', type: 'select', options: enumOptions(['ENABLED', 'DISABLED', 'REPLACE_CB_NOTES']) },
      { key: 'qc_comment_history', label: 'QC Comments History', type: 'select', options: enumOptions(['CLICK', 'AUTO_OPEN', 'CLICK_ALLOW_MINIMIZE', 'AUTO_OPEN_ALLOW_MINIMIZE']) },
      { key: 'allow_emails', label: 'Allow Emails', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'max_inbound_calls', label: 'Max Inbound Calls', type: 'number' },
      { key: 'max_inbound_calls_outcome', label: 'Max Inbound Calls Outcome', type: 'select', options: enumOptions(['DEFAULT', 'ALLOW_AGENTDIRECT', 'ALLOW_MI_PAUSE', 'ALLOW_AGENTDIRECT_AND_MI_PAUSE']) },
      { key: 'hide_call_log_info', label: 'Hide Call Log Info', type: 'select', options: enumOptions(ensureOption(HIDE_CALL_LOG_OPTIONS, form?.hide_call_log_info)) },
      { key: 'clear_script', label: 'Clear Script', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'status_display_ingroup', label: 'Status Display Ingroup', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'mute_recordings', label: 'Mute Recordings', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'shared_dial_rank', label: 'Shared Dial Rank', type: 'select', options: numberRangeOptions(0, 99, 1, form?.shared_dial_rank) },
      { key: 'call_limit_24hour_method', label: '24h Limit Method', type: 'select', options: enumOptions(['DISABLED', 'PHONE_NUMBER', 'LEAD']) },
      { key: 'call_limit_24hour_scope', label: '24h Limit Scope', type: 'select', options: enumOptions(['SYSTEM_WIDE', 'CAMPAIGN_LISTS']) },
      { key: 'call_limit_24hour', label: '24h Limit', type: 'number' },
      { key: 'call_limit_24hour_override', label: '24h Limit Override', type: 'select', options: enumOptions(ensureOption(['DISABLED', 'ENABLED'], form?.call_limit_24hour_override)) },
      { key: 'show_confetti', label: 'Confetti', type: 'select', options: enumOptions(['DISABLED', 'SALES', 'CALLBACKS', 'SALES_AND_CALLBACKS']) },
      { key: 'daily_phone_number_call_limit', label: 'Daily Phone Limit', type: 'number' },
      { key: 'call_log_days', label: 'Call Log Days', type: 'number' },
      { key: 'hangup_again_link', label: 'Hangup Again Link', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'agent_allow_group_alias', label: 'Group Alias Allowed', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'crm_popup_login', label: 'CRM Popup Login', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'crm_login_address', label: 'CRM Popup Address', wide: true },
      { key: 'extension_appended_cidname', label: 'Extension Append CID', type: 'select', options: enumOptions(['Y', 'N', 'Y_USER', 'Y_WITH_CAMPAIGN', 'Y_USER_WITH_CAMPAIGN']) },
      { key: 'blind_monitor_warning', label: 'Blind Monitor Warning', type: 'select', options: enumOptions(['DISABLED', 'ALERT', 'NOTICE', 'AUDIO', 'ALERT_NOTICE', 'ALERT_AUDIO', 'NOTICE_AUDIO', 'ALL']) },
      { key: 'blind_monitor_message', label: 'Blind Monitor Notice' },
      audioField('blind_monitor_filename', 'Blind Monitor Filename', form?.blind_monitor_filename),
      { key: 'agent_xfer_validation', label: 'Transfer In-Group Validation', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'ig_xfer_list_sort', label: 'Transfer In-Group Sort Order', type: 'select', options: enumOptions(['GROUP_ID_UP', 'GROUP_ID_DOWN', 'GROUP_NAME_UP', 'GROUP_NAME_DOWN', 'PRIORITY_UP', 'PRIORITY_DOWN']) },
      { key: 'custom_one', label: 'Custom 1', type: 'textarea', wide: true },
      { key: 'custom_two', label: 'Custom 2', type: 'textarea', wide: true },
      { key: 'custom_three', label: 'Custom 3', type: 'textarea', wide: true },
      { key: 'custom_four', label: 'Custom 4', type: 'textarea', wide: true },
      { key: 'custom_five', label: 'Custom 5', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'pauseCodes') {
    return [
      { key: 'campaign_id', label: 'Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions, disabled: mode === 'edit' || form?._campaignLocked },
      { key: 'pause_code', label: 'Pause Code', disabled: mode === 'edit' },
      { key: 'pause_code_name', label: 'Pause Code Name' },
      { key: 'billable', label: 'Billable', type: 'select', options: enumOptions(['NO', 'YES', 'HALF']) },
      { key: 'time_limit', label: 'Time Limit', type: 'number' },
      { key: 'require_mgr_approval', label: 'Manager Approval', type: 'select', options: enumOptions(['NO', 'YES']) },
    ];
  }

  if (entity === 'campaignHotkeys') {
    return [
      { key: 'campaign_id', label: 'Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions, disabled: mode === 'edit' || form?._campaignLocked },
      { key: 'hotkey', label: 'Hotkey', type: 'select', options: enumOptions(ensureOption(['1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '*', '#'], form?.hotkey)), disabled: mode === 'edit' },
      { key: 'status', label: 'Status', type: 'select', options: statusSelectOptions(admin, form?.campaign_id, form?.status) },
      { key: 'status_name', label: 'Status Name' },
      { key: 'selectable', label: 'Selectable', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    ];
  }

  if (entity === 'leadRecycle') {
    return [
      ...(mode === 'edit' ? [{ key: 'recycle_id', label: 'Recycle ID', disabled: true }] : []),
      { key: 'campaign_id', label: 'Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions, disabled: mode === 'edit' || form?._campaignLocked },
      { key: 'status', label: 'Status', type: 'select', options: statusSelectOptions(admin, form?.campaign_id, form?.status) },
      { key: 'attempt_delay', label: 'Attempt Delay', type: 'number' },
      { key: 'attempt_maximum', label: 'Attempt Maximum', type: 'number' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions('Y', 'N', 'Active', 'Off') },
    ];
  }

  if (entity === 'listMixes') {
    return [
      { key: 'vcl_id', label: 'List Mix ID', disabled: mode === 'edit' },
      { key: 'vcl_name', label: 'List Mix Name' },
      { key: 'campaign_id', label: 'Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions, disabled: mode === 'edit' || form?._campaignLocked },
      { key: 'mix_method', label: 'Mix Method', type: 'select', options: enumOptions(['EVEN_MIX', 'IN_ORDER', 'RANDOM']) },
      { key: 'status', label: 'Status', type: 'select', options: enumOptions(['ACTIVE', 'INACTIVE']) },
      { key: 'list_mix_container', label: 'List Mix Container', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'statuses' || entity === 'campaignStatuses') {
    return [
      ...(entity === 'campaignStatuses' ? [{ key: 'campaign_id', label: 'Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions, disabled: mode === 'edit' || form?._campaignLocked }] : []),
      { key: 'status', label: 'Status Code', disabled: mode === 'edit' },
      { key: 'status_name', label: 'Status Name' },
      { key: 'selectable', label: 'Selectable', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'human_answered', label: 'Human Answered', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'category', label: 'Category', type: 'select', options: enumOptions(ensureOption(STATUS_CATEGORY_OPTIONS, form?.category)) },
      { key: 'sale', label: 'Sale', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'dnc', label: 'DNC', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'customer_contact', label: 'Customer Contact', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'not_interested', label: 'Not Interested', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'unworkable', label: 'Unworkable', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'scheduled_callback', label: 'Scheduled Callback', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'completed', label: 'Completed', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'answering_machine', label: 'Answering Machine', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'min_sec', label: 'Min Seconds', type: 'number' },
      { key: 'max_sec', label: 'Max Seconds', type: 'number' },
    ];
  }

  if (entity === 'users') {
    // Managers without Admin nav access get the essential form only. Level,
    // group and phone are shown read-only; the server enforces the same
    // whitelist on save, so this is display, not the security boundary.
    if (!hasAdminNav(user)) {
      return [
        { section: 'Identity and Login' },
        { key: 'user', label: 'User ID', disabled: true },
        { key: 'pass', label: 'New Password', type: 'password' },
        { key: 'full_name', label: 'Full Name' },
        { key: 'email', label: 'Email' },
        { key: 'user_level', label: 'Level', disabled: true },
        { key: 'user_group', label: 'User Group', disabled: true },
        { key: 'phone_login', label: 'Phone Login', disabled: true },
        { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
        { section: 'Agent Options' },
        { key: 'view_reports', label: 'Reports', type: 'select', options: flagOptions() },
        { key: 'hotkeys_active', label: 'Hotkeys Active', type: 'select', options: flagOptions() },
        { key: 'agent_choose_ingroups', label: 'Agent Choose In-Groups', type: 'select', options: flagOptions() },
        { key: 'agent_choose_blended', label: 'Agent Choose Blended', type: 'select', options: flagOptions() },
        { key: 'closer_default_blended', label: 'Closer Default Blended', type: 'select', options: flagOptions() },
        { key: 'closer_campaigns', label: 'Allowed Inbound Groups', type: 'checkboxGroupText', options: inboundStrictOptions, values: scopeValues, serialize: viciGroupText, wide: true },
        { key: 'scheduled_callbacks', label: 'Scheduled Callbacks', type: 'select', options: flagOptions() },
        { key: 'agentcall_manual', label: 'Agent Manual Dial', type: 'select', options: enumOptions(['0', '1', '2', '3', '4', '5']) },
        { key: 'vicidial_transfers', label: 'Agent Transfers', type: 'select', options: flagOptions() },
        { key: 'custom_fields_modify', label: 'Custom Field Modify', type: 'select', options: flagOptions() },
      ];
    }
    return [
      { section: 'Identity and Login' },
      { key: 'user', label: 'User ID', disabled: mode === 'edit' },
      { key: 'pass', label: mode === 'edit' ? 'New Password' : 'Password', type: 'password' },
      { key: 'full_name', label: 'Full Name' },
      { key: 'user_level', label: 'Level', type: 'select', options: enumOptions(ensureOption(USER_LEVEL_OPTIONS, form?.user_level)) },
      { key: 'user_group', label: 'User Group', type: userGroupOptions.length ? 'select' : 'text', options: userGroupOptions },
      { key: 'user_group_two', label: 'User Group Two', type: userGroupOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...userGroupOptions], form?.user_group_two) },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'email', label: 'Email' },
      { key: 'mobile_number', label: 'Mobile Number' },
      { key: 'phone_login', label: 'Phone Login', type: phoneOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...phoneOptions], form?.phone_login) },
      { key: 'phone_pass', label: 'Phone Password', type: 'password' },
      { key: 'voicemail_id', label: 'Voicemail ID' },
      { key: 'user_code', label: 'User Code' },
      { key: 'user_nickname', label: 'Nickname' },
      { key: 'user_location', label: 'User Location' },
      { section: 'Admin Permissions' },
      { key: 'campaign_detail', label: 'Campaign Detail', type: 'select', options: flagOptions() },
      { key: 'view_reports', label: 'Reports', type: 'select', options: flagOptions() },
      { key: 'export_reports', label: 'Export Reports', type: 'select', options: flagOptions() },
      { key: 'export_gdpr_leads', label: 'Export GDPR Leads', type: 'select', options: enumOptions(['0', '1', '2']) },
      { key: 'modify_campaigns', label: 'Campaign Admin', type: 'select', options: flagOptions() },
      { key: 'modify_lists', label: 'List Admin', type: 'select', options: flagOptions() },
      { key: 'modify_users', label: 'User Admin', type: 'select', options: flagOptions() },
      { key: 'modify_ingroups', label: 'Inbound Admin', type: 'select', options: flagOptions() },
      { key: 'modify_inbound_dids', label: 'DID Admin', type: 'select', options: flagOptions() },
      { key: 'modify_usergroups', label: 'User Group Admin', type: 'select', options: flagOptions() },
      { key: 'modify_scripts', label: 'Script Admin', type: 'select', options: flagOptions() },
      { key: 'modify_filters', label: 'Filter Admin', type: 'select', options: flagOptions() },
      { key: 'modify_call_times', label: 'Call Time Admin', type: 'select', options: flagOptions() },
      { key: 'modify_phones', label: 'Phone Admin', type: 'select', options: flagOptions() },
      { key: 'modify_servers', label: 'Server Admin', type: 'select', options: flagOptions() },
      { key: 'modify_carriers', label: 'Carrier Admin', type: 'select', options: flagOptions() },
      { key: 'modify_statuses', label: 'Status Admin', type: 'select', options: flagOptions() },
      { key: 'modify_remoteagents', label: 'Remote Agent Admin', type: 'select', options: flagOptions() },
      { key: 'modify_shifts', label: 'Shift Admin', type: 'select', options: flagOptions() },
      { key: 'modify_labels', label: 'Label Admin', type: 'select', options: flagOptions() },
      { key: 'modify_voicemail', label: 'Voicemail Admin', type: 'select', options: flagOptions() },
      { key: 'modify_audiostore', label: 'Audio Store Admin', type: 'select', options: flagOptions() },
      { key: 'modify_moh', label: 'MOH Admin', type: 'select', options: flagOptions() },
      { key: 'modify_tts', label: 'TTS Admin', type: 'select', options: flagOptions() },
      { key: 'modify_contacts', label: 'Contacts Admin', type: 'select', options: flagOptions() },
      { key: 'modify_custom_dialplans', label: 'Custom Dialplans', type: 'select', options: flagOptions() },
      { key: 'modify_languages', label: 'Languages Admin', type: 'select', options: flagOptions() },
      { key: 'modify_colors', label: 'Colors Admin', type: 'select', options: flagOptions() },
      { key: 'modify_auto_reports', label: 'Auto Reports Admin', type: 'select', options: flagOptions() },
      { key: 'modify_ip_lists', label: 'IP Lists Admin', type: 'select', options: flagOptions() },
      { key: 'modify_same_user_level', label: 'Modify Same Level', type: 'select', options: flagOptions() },
      { key: 'modify_leads', label: 'Modify Leads', type: 'select', options: enumOptions(['0', '1', '2', '3', '4', '5', '6']) },
      { key: 'modify_dial_prefix', label: 'Modify Dial Prefix', type: 'select', options: enumOptions(['0', '1', '2', '3', '4', '5', '6']) },
      { key: 'load_leads', label: 'Load Leads', type: 'select', options: flagOptions() },
      { key: 'access_recordings', label: 'Recordings Access', type: 'select', options: flagOptions() },
      { key: 'alter_admin_interface_options', label: 'Admin UI Options', type: 'select', options: flagOptions() },
      { key: 'ast_admin_access', label: 'Asterisk Admin Access', type: 'select', options: flagOptions() },
      { key: 'ast_delete_phones', label: 'Asterisk Delete Phones', type: 'select', options: flagOptions() },
      { key: 'modify_settings_containers', label: 'Settings Containers', type: 'select', options: enumOptions(['0', '1', '2', '3', '4', '5', '6']) },
      { key: 'modify_email_accounts', label: 'Email Accounts Admin', type: 'select', options: flagOptions() },
      { section: 'Delete Permissions' },
      { key: 'delete_users', label: 'Delete Users', type: 'select', options: flagOptions() },
      { key: 'delete_user_groups', label: 'Delete User Groups', type: 'select', options: flagOptions() },
      { key: 'delete_lists', label: 'Delete Lists', type: 'select', options: flagOptions() },
      { key: 'delete_campaigns', label: 'Delete Campaigns', type: 'select', options: flagOptions() },
      { key: 'delete_ingroups', label: 'Delete In-Groups', type: 'select', options: flagOptions() },
      { key: 'delete_remote_agents', label: 'Delete Remote Agents', type: 'select', options: flagOptions() },
      { key: 'delete_scripts', label: 'Delete Scripts', type: 'select', options: flagOptions() },
      { key: 'delete_filters', label: 'Delete Filters', type: 'select', options: flagOptions() },
      { key: 'delete_call_times', label: 'Delete Call Times', type: 'select', options: flagOptions() },
      { key: 'delete_inbound_dids', label: 'Delete DIDs', type: 'select', options: flagOptions() },
      { key: 'delete_from_dnc', label: 'Delete From DNC', type: 'select', options: flagOptions() },
      { section: 'Agent Campaign Access' },
      { key: 'hotkeys_active', label: 'Hotkeys Active', type: 'select', options: flagOptions() },
      { key: 'change_agent_campaign', label: 'Change Agent Campaign', type: 'select', options: flagOptions() },
      { key: 'agent_choose_ingroups', label: 'Agent Choose In-Groups', type: 'select', options: flagOptions() },
      { key: 'closer_campaigns', label: 'Allowed Inbound Groups', type: 'checkboxGroupText', options: inboundStrictOptions, values: scopeValues, serialize: viciGroupText, wide: true },
      { key: 'agent_choose_blended', label: 'Agent Choose Blended', type: 'select', options: flagOptions() },
      { key: 'closer_default_blended', label: 'Closer Default Blended', type: 'select', options: flagOptions() },
      { section: 'Agent Call Behavior' },
      { key: 'scheduled_callbacks', label: 'Scheduled Callbacks', type: 'select', options: flagOptions() },
      { key: 'agentonly_callbacks', label: 'Agent-Only Callbacks', type: 'select', options: flagOptions() },
      { key: 'agentcall_manual', label: 'Agent Manual Dial', type: 'select', options: enumOptions(['0', '1', '2', '3', '4', '5']) },
      { key: 'agentcall_email', label: 'Agent Email Calls', type: 'select', options: flagOptions() },
      { key: 'vicidial_recording', label: 'Agent Recording', type: 'select', options: flagOptions() },
      { key: 'vicidial_transfers', label: 'Agent Transfers', type: 'select', options: flagOptions() },
      { key: 'alter_agent_interface_options', label: 'Agent UI Options', type: 'select', options: flagOptions() },
      { key: 'custom_fields_modify', label: 'Custom Fields Modify', type: 'select', options: flagOptions() },
      { key: 'force_change_password', label: 'Force Password Change', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'realtime_block_user_info', label: 'Realtime Block User Info', type: 'select', options: flagOptions() },
      { section: 'Recording and Data Overrides' },
      { key: 'vicidial_recording_override', label: 'Recording Override', type: 'select', options: enumOptions(['DISABLED', 'NEVER', 'ONDEMAND', 'ALLCALLS', 'ALLFORCE']) },
      { key: 'alter_custdata_override', label: 'Alter Customer Data', type: 'select', options: enumOptions(['NOT_ACTIVE', 'ALLOW_ALTER']) },
      { key: 'alter_custphone_override', label: 'Alter Customer Phone', type: 'select', options: enumOptions(['NOT_ACTIVE', 'ALLOW_ALTER']) },
      { key: 'agent_call_log_view_override', label: 'Call Log View Override', type: 'select', options: enumOptions(['DISABLED', 'Y', 'N']) },
      { key: 'hide_call_log_info', label: 'Hide Call Log Info', type: 'select', options: enumOptions(HIDE_CALL_LOG_OPTIONS.includes(form?.hide_call_log_info) ? HIDE_CALL_LOG_OPTIONS : [form?.hide_call_log_info || 'DISABLED', ...HIDE_CALL_LOG_OPTIONS]) },
      { key: 'mute_recordings', label: 'Mute Recordings', type: 'select', options: enumOptions(['DISABLED', 'Y', 'N']) },
      { key: 'admin_hide_lead_data', label: 'Admin Hide Lead Data', type: 'select', options: flagOptions() },
      { key: 'admin_hide_phone_data', label: 'Admin Hide Phone Data', type: 'select', options: enumOptions(['0', '1', '2_DIGITS', '3_DIGITS', '4_DIGITS']) },
      { section: 'Quality Control and Timeclock' },
      { key: 'qc_enabled', label: 'QC Enabled', type: 'select', options: flagOptions() },
      { key: 'qc_user_level', label: 'QC User Level', type: 'select', options: enumOptions(ensureOption(USER_LEVEL_OPTIONS, form?.qc_user_level)) },
      { key: 'qc_pass', label: 'QC Pass', type: 'select', options: flagOptions() },
      { key: 'qc_finish', label: 'QC Finish', type: 'select', options: flagOptions() },
      { key: 'qc_commit', label: 'QC Commit', type: 'select', options: flagOptions() },
      { key: 'pause_code_approval', label: 'Pause Code Approval', type: 'select', options: flagOptions() },
      { key: 'add_timeclock_log', label: 'Add Timeclock Log', type: 'select', options: flagOptions() },
      { key: 'modify_timeclock_log', label: 'Modify Timeclock Log', type: 'select', options: flagOptions() },
      { key: 'delete_timeclock_log', label: 'Delete Timeclock Log', type: 'select', options: flagOptions() },
      { section: 'API, Search, and Filters' },
      { key: 'vdc_agent_api_access', label: 'Agent API Access', type: 'select', options: flagOptions() },
      { key: 'api_only_user', label: 'API Only User', type: 'select', options: flagOptions() },
      { key: 'api_list_restrict', label: 'API List Restrict', type: 'select', options: flagOptions() },
      { key: 'api_allowed_functions', label: 'API Allowed Functions', wide: true },
      { key: 'lead_filter_id', label: 'Lead Filter', type: leadFilterOptions.length ? 'select' : 'text', options: leadFilterOptions },
      { key: 'agent_lead_search_override', label: 'Lead Search Override', type: 'select', options: enumOptions(['NOT_ACTIVE', 'ENABLED', 'LIVE_CALL_INBOUND', 'LIVE_CALL_INBOUND_AND_MANUAL', 'DISABLED']) },
      { key: 'preset_contact_search', label: 'Preset Contact Search', type: 'select', options: enumOptions(['NOT_ACTIVE', 'ENABLED', 'DISABLED']) },
      { key: 'manual_dial_filter', label: 'Manual Dial Filter', type: 'select', options: manualFilterOptions },
      { key: 'manual_dial_lead_id', label: 'Manual Dial Lead ID', type: 'select', options: enumOptions(['Y', 'N', 'ONLY', 'DISABLED']) },
      { key: 'status_group_id', label: 'Status Group ID' },
      { section: 'Limits and Callbacks' },
      { key: 'max_inbound_calls', label: 'Max Inbound Calls', type: 'number' },
      { key: 'wrapup_seconds_override', label: 'Wrapup Seconds Override', type: 'number' },
      { key: 'max_hopper_calls', label: 'Max Hopper Calls', type: 'number' },
      { key: 'max_hopper_calls_hour', label: 'Max Hopper Calls Hour', type: 'number' },
      { key: 'ready_max_logout', label: 'Ready Max Logout', type: 'number' },
      { key: 'user_new_lead_limit', label: 'New Lead Limit', type: 'number' },
      { key: 'inbound_credits', label: 'Inbound Credits', type: 'number' },
      { key: 'next_dial_my_callbacks', label: 'Next Dial My Callbacks', type: 'select', options: enumOptions(['NOT_ACTIVE', 'DISABLED', 'ENABLED']) },
      { key: 'max_inbound_filter_enabled', label: 'Max Inbound Filter', type: 'select', options: flagOptions() },
      { key: 'max_inbound_filter_statuses', label: 'Max Inbound Statuses', wide: true },
      { key: 'max_inbound_filter_ingroups', label: 'Max Inbound In-Groups', type: 'checkboxGroupText', options: inboundStrictOptions, values: scopeValues, serialize: viciGroupText, wide: true },
      { key: 'max_inbound_filter_min_sec', label: 'Max Inbound Min Seconds', type: 'number' },
      { section: 'Interface, Alerts, and Security' },
      { key: 'alert_enabled', label: 'Alerts Enabled', type: 'select', options: flagOptions() },
      { key: 'allow_alerts', label: 'Allow Alerts', type: 'select', options: flagOptions() },
      { key: 'download_lists', label: 'Download Lists', type: 'select', options: flagOptions() },
      { key: 'download_invalid_files', label: 'Download Invalid Files', type: 'select', options: flagOptions() },
      { key: 'agent_shift_enforcement_override', label: 'Agent Shift Override', type: 'select', options: enumOptions(['DISABLED', 'OFF', 'START', 'ALL']) },
      { key: 'manager_shift_enforcement_override', label: 'Manager Shift Override', type: 'select', options: flagOptions() },
      { key: 'shift_override_flag', label: 'Shift Override Flag', type: 'select', options: flagOptions() },
      { key: 'selected_language', label: 'Selected Language' },
      { key: 'user_choose_language', label: 'User Choose Language', type: 'select', options: flagOptions() },
      { key: 'ignore_group_on_search', label: 'Ignore Group On Search', type: 'select', options: flagOptions() },
      { key: 'admin_cf_show_hidden', label: 'Admin Custom Fields Hidden', type: 'select', options: flagOptions() },
      { key: 'user_hide_realtime', label: 'Hide Realtime User', type: 'select', options: flagOptions() },
      { key: 'ignore_ip_list', label: 'Ignore IP List', type: 'select', options: flagOptions() },
      { key: 'two_factor_override', label: '2FA Override', type: 'select', options: enumOptions(['NOT_ACTIVE', 'ENABLED', 'DISABLED']) },
      { key: 'user_admin_redirect_url', label: 'Admin Redirect URL', type: 'textarea', wide: true },
      { section: 'Custom Fields' },
      { key: 'custom_one', label: 'Custom 1' },
      { key: 'custom_two', label: 'Custom 2' },
      { key: 'custom_three', label: 'Custom 3' },
      { key: 'custom_four', label: 'Custom 4' },
      { key: 'custom_five', label: 'Custom 5' },
    ];
  }

  if (entity === 'lists') {
    return [
      { section: 'Basic List' },
      { key: 'list_id', label: 'List ID', disabled: mode === 'edit' },
      { key: 'list_name', label: 'List Name' },
      { key: 'campaign_id', label: 'Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'list_description', label: 'Description', wide: true },
      { key: 'local_call_time', label: 'Call Time', type: callTimeOptions.length ? 'select' : 'text', options: [{ value: 'campaign', label: 'campaign' }, ...callTimeOptions] },
      { key: 'expiration_date', label: 'Expiration', type: 'date' },
      { key: 'time_zone_setting', label: 'Timezone Method', type: 'select', options: enumOptions(['COUNTRY_AND_AREA_CODE', 'POSTAL_CODE', 'NANPA_PREFIX', 'OWNER_TIME_ZONE_CODE']) },
      { key: 'inventory_report', label: 'Inventory Report', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { section: 'Dialing and Resets' },
      { key: 'reset_time', label: 'Reset Time' },
      { key: 'daily_reset_limit', label: 'Daily Reset Limit', type: 'number' },
      { key: 'auto_active_list_rank', label: 'Auto Active Rank', type: 'number' },
      { key: 'user_new_lead_limit', label: 'User New Lead Limit', type: 'number' },
      { key: 'auto_alt_threshold', label: 'Auto Alt Threshold', type: 'number' },
      { key: 'dial_prefix', label: 'Dial Prefix' },
      { key: 'weekday_resets_container', label: 'Weekday Resets Container', type: 'select', options: enumOptions(ensureOption(['DISABLED'], form?.weekday_resets_container)) },
      { section: 'Overrides and Routing' },
      { key: 'agent_script_override', label: 'Agent Script Override', type: scriptOptions.length ? 'select' : 'text', options: withCurrentOption(scriptOptions, form?.agent_script_override) },
      { key: 'inbound_list_script_override', label: 'Inbound Script Override', type: scriptOptions.length ? 'select' : 'text', options: withCurrentOption(scriptOptions, form?.inbound_list_script_override) },
      { key: 'campaign_cid_override', label: 'Campaign CID Override' },
      { key: 'am_message_exten_override', label: 'AM Message Override' },
      { key: 'drop_inbound_group_override', label: 'Drop Inbound Group Override', type: inboundOptions.length ? 'select' : 'text', options: withCurrentOption(inboundOptions, form?.drop_inbound_group_override) },
      { key: 'default_xfer_group', label: 'Default Xfer Group', type: inboundOptions.length ? 'select' : 'text', options: withCurrentOption(inboundOptions, form?.default_xfer_group) },
      { key: 'cid_group_id', label: 'CID Group', type: 'select', options: withCurrentOption(cidGroupOptions, form?.cid_group_id) },
      { key: 'status_group_id', label: 'Status Group ID' },
      { key: 'inbound_drop_voicemail', label: 'Inbound Drop Voicemail' },
      { key: 'inbound_after_hours_voicemail', label: 'After Hours Voicemail' },
      { section: 'Transfer Presets' },
      { key: 'xferconf_a_number', label: 'Transfer A Number' },
      { key: 'xferconf_b_number', label: 'Transfer B Number' },
      { key: 'xferconf_c_number', label: 'Transfer C Number' },
      { key: 'xferconf_d_number', label: 'Transfer D Number' },
      { key: 'xferconf_e_number', label: 'Transfer E Number' },
      { section: 'Web Forms and QC' },
      { key: 'web_form_address', label: 'Web Form Address', type: 'textarea', wide: true },
      { key: 'web_form_address_two', label: 'Web Form Address 2', type: 'textarea', wide: true },
      { key: 'web_form_address_three', label: 'Web Form Address 3', type: 'textarea', wide: true },
      { key: 'na_call_url', label: 'NA Call URL', type: 'textarea', wide: true },
      { key: 'qc_scorecard_id', label: 'QC Scorecard ID' },
      { key: 'qc_statuses_id', label: 'QC Statuses ID' },
      { key: 'qc_web_form_address', label: 'QC Web Form Address', wide: true },
    ];
  }

  if (entity === 'userGroups') {
    return [
      { key: 'user_group', label: 'Group', disabled: mode === 'edit' },
      { key: 'group_name', label: 'Group Name' },
      { key: 'script_id', label: 'Default Script', type: scriptOptions.length ? 'select' : 'text', options: scriptOptions },
      { section: 'Campaign and Report Scope' },
      { key: 'allowed_campaigns', label: 'Allowed Campaigns', type: 'multiSelectText', options: campaignScopeOptions, allValue: '-ALL-CAMPAIGNS-', wide: true },
      { key: 'allowed_reports', label: 'Allowed Reports', type: 'multiSelectText', options: reportScopeOptions, values: reportScopeValues, serialize: reportScopeText, wide: true },
      { key: 'admin_viewable_groups', label: 'Admin Viewable Groups', type: 'multiSelectText', options: userGroupScopeOptions, allValue: '---ALL---', wide: true },
      { key: 'allowed_queue_groups', label: 'Allowed Queue Groups', type: 'multiSelectText', options: inboundScopeOptions, allValue: '---ALL---', wide: true },
      { key: 'admin_viewable_call_times', label: 'Admin Viewable Call Times', type: 'multiSelectText', options: callTimeScopeOptions, allValue: '---ALL---', wide: true },
      { section: 'Quality and Agent Scope' },
      { key: 'qc_allowed_campaigns', label: 'QC Allowed Campaigns', type: 'multiSelectText', options: campaignScopeOptions, allValue: '-ALL-CAMPAIGNS-', wide: true },
      { key: 'qc_allowed_inbound_groups', label: 'QC Allowed Inbound Groups', type: 'multiSelectText', options: inboundScopeOptions, allValue: '---ALL---', wide: true },
      { key: 'group_shifts', label: 'Group Shifts', type: 'multiSelectText', options: shiftScopeOptions, allValue: '---ALL---', wide: true },
      { key: 'agent_status_viewable_groups', label: 'Agent Status Viewable Groups', type: 'multiSelectText', options: userGroupScopeOptions, allValue: '---ALL---', wide: true },
      { section: 'Enforcement' },
      { key: 'forced_timeclock_login', label: 'Forced Timeclock', type: 'select', options: enumOptions(['N', 'Y', 'ADMIN_EXEMPT']) },
      { key: 'shift_enforcement', label: 'Shift Enforcement', type: 'select', options: enumOptions(['OFF', 'START', 'ALL', 'ADMIN_EXEMPT']) },
      { key: 'agent_status_view_time', label: 'Status View Time', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_call_log_view', label: 'Agent Call Log', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_fullscreen', label: 'Agent Fullscreen', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { section: 'Transfer Permissions' },
      { key: 'agent_xfer_consultative', label: 'Consultative Transfer', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_xfer_dial_override', label: 'Dial Override Transfer', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_xfer_vm_transfer', label: 'Voicemail Message Transfer', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_xfer_blind_transfer', label: 'Blind Transfer', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_xfer_dial_with_customer', label: 'Dial With Customer Transfer', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_xfer_park_customer_dial', label: 'Park Customer Dial Transfer', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_xfer_park_3way', label: 'Park 3-Way Transfer', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { section: 'Webphone and IP Access' },
      { key: 'webphone_url_override', label: 'Webphone URL Override', wide: true },
      { key: 'webphone_systemkey_override', label: 'Webphone System Key Override' },
      { key: 'webphone_dialpad_override', label: 'Webphone Dialpad Override', type: 'select', options: enumOptions(['DISABLED', 'Y', 'N', 'TOGGLE', 'TOGGLE_OFF']) },
      { key: 'webphone_layout', label: 'Webphone Layout Override' },
      { key: 'admin_ip_list', label: 'Admin IP Whitelist', type: 'select', options: withCurrentOption(ipListOptions, form?.admin_ip_list) },
      { key: 'agent_ip_list', label: 'Agent IP Whitelist', type: 'select', options: withCurrentOption(ipListOptions, form?.agent_ip_list) },
      { key: 'api_ip_list', label: 'API IP Whitelist', type: 'select', options: withCurrentOption(ipListOptions, form?.api_ip_list) },
      { section: 'Reports and Admin Entry' },
      { key: 'allowed_custom_reports', label: 'Custom Reports', type: 'multiSelectText', options: reportScopeOptions, values: reportScopeValues, serialize: reportScopeText, wide: true },
      { key: 'reports_header_override', label: 'Reports Header Override', type: 'select', options: enumOptions(['DISABLED', 'LOGO_ONLY_SMALL', 'LOGO_ONLY_LARGE', 'ALT_1', 'ALT_2', 'ALT_3', 'ALT_4']) },
      { key: 'admin_home_url', label: 'Admin Home URL', wide: true },
      { section: 'GenX Permissions' },
      { key: 'genx_nav_sections', label: 'Nav Menu Access', type: 'checkboxGroupText', options: NAV_SECTION_OPTIONS, values: navSectionValues, serialize: (values) => values.join(','), wide: true },
    ];
  }

  if (entity === 'dids') {
    return [
      { key: 'did_pattern', label: 'DID Pattern', disabled: mode === 'edit' },
      { key: 'did_description', label: 'Description' },
      { key: 'did_active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'did_route', label: 'DID Route', type: 'select', options: enumOptions(ensureOption(didRouteOptions, form?.did_route)) },
      { key: 'group_id', label: 'In-Group', type: inboundStrictOptions.length ? 'select' : 'text', options: inboundStrictOptions },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'extension', label: 'Extension' },
      { key: 'exten_context', label: 'Context', type: phoneContextOptions.length ? 'select' : 'text', options: phoneContextOptions },
      { key: 'server_ip', label: 'Server', type: serverOptions.length ? 'select' : 'text', options: serverOptions },
      { key: 'phone', label: 'Phone', type: phoneOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...phoneOptions], form?.phone) },
      { key: 'user', label: 'User', type: userOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...userOptions], form?.user) },
      voicemailField('voicemail_ext', 'Voicemail Ext', form?.voicemail_ext),
      { key: 'record_call', label: 'Record Call', type: 'select', options: enumOptions(['Y', 'N', 'Y_QUEUESTOP']) },
      { key: 'inbound_route_answer', label: 'Answer Route', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'call_handle_method', label: 'Call Handle Method', type: 'select', options: enumOptions(ensureOption(didCallHandleOptions, form?.call_handle_method)) },
      { key: 'agent_search_method', label: 'Agent Search', type: 'select', options: enumOptions(['LB', 'LO', 'SO']) },
      { section: 'Fallback and Filters' },
      { key: 'user_unavailable_action', label: 'User Unavailable', type: 'select', options: enumOptions(['IN_GROUP', 'EXTEN', 'VOICEMAIL', 'PHONE', 'VMAIL_NO_INST']) },
      { key: 'user_route_settings_ingroup', label: 'Unavailable In-Group', type: inboundOptions.length ? 'select' : 'text', options: inboundOptions },
      { key: 'no_agent_ingroup_redirect', label: 'No-Agent In-Group Redirect', type: 'select', options: enumOptions(['DISABLED', 'Y', 'NO_PAUSED', 'READY_ONLY']) },
      { key: 'no_agent_ingroup_id', label: 'No-Agent In-Group ID', type: inboundOptions.length ? 'select' : 'text', options: inboundOptions },
      { key: 'no_agent_ingroup_extension', label: 'No-Agent In-Group Extension' },
      { key: 'max_queue_ingroup_calls', label: 'Max Queue In-Group Calls', type: 'number' },
      { key: 'max_queue_ingroup_id', label: 'Max Queue In-Group ID', type: inboundOptions.length ? 'select' : 'text', options: inboundOptions },
      { key: 'max_queue_ingroup_extension', label: 'Max Queue In-Group Extension' },
      { key: 'campaign_id', label: 'Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions },
      { key: 'list_id', label: 'List ID', type: listOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...listOptions], form?.list_id) },
      { key: 'phone_code', label: 'Phone Code', type: phoneCodeOptions.length ? 'select' : 'text', options: phoneCodeOptions },
      { key: 'menu_id', label: 'Call Menu', type: callMenuOptions.length > 1 ? 'select' : 'text', options: withCurrentOption(callMenuOptions, form?.menu_id) },
      { section: 'DID Filters' },
      { key: 'filter_inbound_number', label: 'Filter Inbound Number' },
      { key: 'filter_clean_cid_number', label: 'Clean CID Number' },
      { key: 'pre_filter_phone_group_id', label: 'Pre-Filter Phone Group ID', type: 'multiSelectText', options: filterPhoneGroupOptions, values: scopeValues, serialize: viciGroupText, wide: true },
      { key: 'pre_filter_extension', label: 'Pre-Filter Phone Group DID' },
      { key: 'pre_filter_recent_call', label: 'Pre-Filter Recent Call', type: 'select', options: enumOptions(ensureOption(['DISABLED'], form?.pre_filter_recent_call)) },
      { key: 'pre_filter_recent_extension', label: 'Pre-Filter Recent Call DID' },
      { key: 'filter_phone_group_id', label: 'Filter Phone Group ID', type: 'multiSelectText', options: filterPhoneGroupOptions, values: scopeValues, serialize: viciGroupText, wide: true },
      { key: 'filter_url', label: 'Filter URL', wide: true },
      { key: 'filter_url_did_redirect', label: 'Filter URL DID Redirect', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'filter_dnc_campaign', label: 'Filter DNC Campaign', type: campaignOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...campaignOptions], form?.filter_dnc_campaign) },
      { key: 'filter_action', label: 'Filter Action', type: 'select', options: enumOptions(didRouteOptions) },
      routeTargetField(form?.filter_action, 'filter_extension', 'Filter Extension', form?.filter_extension),
      { key: 'filter_exten_context', label: 'Filter Extension Context', type: phoneContextOptions.length ? 'select' : 'text', options: phoneContextOptions },
      voicemailField('filter_voicemail_ext', 'Filter Voicemail Box', form?.filter_voicemail_ext),
      { key: 'filter_phone', label: 'Filter Phone Extension', type: phoneOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...phoneOptions], form?.filter_phone) },
      { key: 'filter_server_ip', label: 'Filter Server IP', type: serverOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: '---NONE---' }, ...serverOptions], form?.filter_server_ip) },
      { key: 'filter_user', label: 'Filter User Agent', type: userOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...userOptions], form?.filter_user) },
      { key: 'filter_user_unavailable_action', label: 'Filter User Unavailable Action', type: 'select', options: enumOptions(['IN_GROUP', 'EXTEN', 'VOICEMAIL', 'PHONE', 'VMAIL_NO_INST']) },
      { key: 'filter_user_route_settings_ingroup', label: 'Filter User Route In-Group', type: inboundOptions.length ? 'select' : 'text', options: inboundOptions },
      { key: 'filter_group_id', label: 'Filter In-Group', type: inboundOptions.length ? 'select' : 'text', options: inboundOptions },
      { key: 'filter_call_handle_method', label: 'Filter Call Handle Method', type: 'select', options: enumOptions(ensureOption(didCallHandleOptions, form?.filter_call_handle_method)) },
      { key: 'filter_agent_search_method', label: 'Filter Agent Search Method', type: 'select', options: enumOptions(['LB', 'LO', 'SO']) },
      { key: 'filter_list_id', label: 'Filter List ID', type: listOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...listOptions], form?.filter_list_id) },
      { key: 'filter_campaign_id', label: 'Filter Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions },
      { key: 'filter_phone_code', label: 'Filter Phone Code', type: phoneCodeOptions.length ? 'select' : 'text', options: phoneCodeOptions },
      { key: 'filter_menu_id', label: 'Filter Menu', type: callMenuOptions.length > 1 ? 'select' : 'text', options: withCurrentOption(callMenuOptions, form?.filter_menu_id) },
      { key: 'did_carrier_description', label: 'Carrier Description' },
      { key: 'alter_cid_name', label: 'Alter CID Name' },
    ];
  }

  if (entity === 'phones') {
    return [
      { section: 'Phone Identity' },
      { key: 'extension', label: 'Extension', disabled: mode === 'edit' },
      { key: 'server_ip', label: 'Server', type: serverOptions.length ? 'select' : 'text', options: serverOptions, disabled: mode === 'edit' },
      { key: 'fullname', label: 'Full Name' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'status', label: 'Phone Status', type: 'select', options: enumOptions(ensureOption(['ACTIVE', 'SUSPENDED', 'CLOSED', 'PENDING'], form?.status)) },
      { key: 'protocol', label: 'Protocol', type: 'select', options: enumOptions(ensureOption(PHONE_PROTOCOL_OPTIONS, form?.protocol)) },
      { key: 'phone_type', label: 'Phone Type' },
      { key: 'login', label: 'Login' },
      { key: 'pass', label: mode === 'edit' ? 'New Phone Password' : 'Phone Password', type: 'password' },
      { key: 'ASTmgrUSERNAME', label: 'Asterisk Manager User' },
      { key: 'ASTmgrSECRET', label: 'Asterisk Manager Secret', type: 'password' },
      { key: 'login_user', label: 'Login User' },
      { key: 'login_pass', label: mode === 'edit' ? 'New Login Password' : 'Login Password', type: 'password' },
      { key: 'login_campaign', label: 'Login Campaign', type: campaignOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...campaignOptions], form?.login_campaign) },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { section: 'Network and Client' },
      { key: 'dialplan_number', label: 'Dialplan Number' },
      { key: 'voicemail_id', label: 'Voicemail ID' },
      { key: 'phone_ip', label: 'Phone IP' },
      { key: 'computer_ip', label: 'Computer IP' },
      { key: 'local_gmt', label: 'Local GMT', type: 'select', options: enumOptions(ensureOption(GMT_OPTIONS, form?.local_gmt)) },
      { key: 'company', label: 'Company' },
      { key: 'picture', label: 'Picture' },
      { key: 'messages', label: 'Messages', type: 'number' },
      { key: 'old_messages', label: 'Old Messages', type: 'number' },
      { key: 'outbound_cid', label: 'Outbound CID' },
      { key: 'outbound_alt_cid', label: 'Outbound Alt CID' },
      { key: 'email', label: 'Email' },
      { key: 'template_id', label: 'Template ID' },
      { key: 'phone_context', label: 'Phone Context', type: phoneContextOptions.length ? 'select' : 'text', options: phoneContextOptions },
      { key: 'phone_ring_timeout', label: 'Ring Timeout', type: 'number' },
      { key: 'conf_secret', label: 'Conf Secret' },
      { key: 'conf_override', label: 'Conf Override', type: 'textarea', wide: true },
      { key: 'client_browser', label: 'Client Browser' },
      { key: 'install_directory', label: 'Install Directory' },
      { key: 'local_web_callerID_URL', label: 'Local CallerID URL', type: 'textarea', wide: true },
      { key: 'VICIDIAL_web_URL', label: 'Dialer Web URL', type: 'textarea', wide: true },
      { section: 'Dialplan Extensions' },
      { key: 'park_on_extension', label: 'Park Extension' },
      { key: 'conf_on_extension', label: 'Conference Extension' },
      { key: 'VICIDIAL_park_on_extension', label: 'Park Extension' },
      { key: 'VICIDIAL_park_on_filename', label: 'Park Filename' },
      { key: 'monitor_prefix', label: 'Monitor Prefix' },
      { key: 'recording_exten', label: 'Recording Extension' },
      { key: 'voicemail_exten', label: 'Voicemail Extension' },
      { key: 'voicemail_dump_exten', label: 'Voicemail Dump Extension' },
      { key: 'voicemail_dump_exten_no_inst', label: 'Voicemail Dump No Instructions' },
      { key: 'ext_context', label: 'Extension Context', type: phoneContextOptions.length ? 'select' : 'text', options: withCurrentOption(phoneContextOptions, form?.ext_context) },
      { key: 'dtmf_send_extension', label: 'DTMF Send Extension' },
      { key: 'call_out_number_group', label: 'Call Out Number Group' },
      { section: 'Phone Feature Flags' },
      { key: 'AGI_call_logging_enabled', label: 'AGI Call Logging', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'user_switching_enabled', label: 'User Switching', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'conferencing_enabled', label: 'Conferencing', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'admin_hangup_enabled', label: 'Admin Hangup', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'admin_hijack_enabled', label: 'Admin Hijack', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'admin_monitor_enabled', label: 'Admin Monitor', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'call_parking_enabled', label: 'Call Parking', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'updater_check_enabled', label: 'Updater Check', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'AFLogging_enabled', label: 'AF Logging', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'QUEUE_ACTION_enabled', label: 'Queue Action', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'CallerID_popup_enabled', label: 'CallerID Popup', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'voicemail_button_enabled', label: 'Voicemail Button', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'enable_fast_refresh', label: 'Fast Refresh', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'fast_refresh_rate', label: 'Fast Refresh Rate', type: 'number' },
      { key: 'enable_persistant_mysql', label: 'Persistent MySQL', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'auto_dial_next_number', label: 'Auto Dial Next Number', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'VDstop_rec_after_each_call', label: 'Stop Recording After Call', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'enable_sipsak_messages', label: 'SIPSAK Messages', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'use_external_server_ip', label: 'Use External Server IP', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'codecs_list', label: 'Codecs List' },
      { key: 'codecs_with_template', label: 'Codecs With Template', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'on_hook_agent', label: 'On-Hook Agent', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'conf_qualify', label: 'Conference Qualify', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'mohsuggest', label: 'MOH Suggest' },
      { section: 'Voicemail and No-Answer' },
      { key: 'delete_vm_after_email', label: 'Delete VM After Email', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'voicemail_timezone', label: 'Voicemail Timezone' },
      { key: 'voicemail_options', label: 'Voicemail Options' },
      { key: 'voicemail_greeting', label: 'Voicemail Greeting' },
      { key: 'voicemail_instructions', label: 'Voicemail Instructions', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'on_login_report', label: 'On-Login Report', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'unavail_dialplan_fwd_exten', label: 'Unavailable Forward Extension' },
      { key: 'unavail_dialplan_fwd_context', label: 'Unavailable Forward Context' },
      { key: 'nva_call_url', label: 'NVA Call URL', type: 'textarea', wide: true },
      { key: 'nva_search_method', label: 'NVA Search Method', type: 'select', options: enumOptions(ensureOption(['NONE', 'LB', 'LO', 'SO'], form?.nva_search_method)) },
      audioField('nva_error_filename', 'NVA Error Filename', form?.nva_error_filename),
      { key: 'nva_new_list_id', label: 'NVA New List', type: listOptions.length ? 'select' : 'text', options: withCurrentOption(listOptions, form?.nva_new_list_id) },
      { key: 'nva_new_phone_code', label: 'NVA Phone Code', type: phoneCodeOptions.length ? 'select' : 'text', options: phoneCodeOptions },
      { key: 'nva_new_status', label: 'NVA New Status', type: 'select', options: statusSelectOptions(admin, form?.login_campaign || admin?.lookups?.campaigns?.[0]?.campaign_id || '', form?.nva_new_status) },
      { section: 'Webphone' },
      { key: 'is_webphone', label: 'Webphone', type: 'select', options: enumOptions(ensureOption(PHONE_WEBPHONE_OPTIONS, form?.is_webphone)) },
      { key: 'webphone_auto_answer', label: 'Auto Answer', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'webphone_dialpad', label: 'Dialpad', type: 'select', options: enumOptions(ensureOption(PHONE_WEBPHONE_DIALPAD_OPTIONS, form?.webphone_dialpad)) },
      { key: 'webphone_dialbox', label: 'Dialbox', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'webphone_mute', label: 'Mute Control', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'webphone_volume', label: 'Volume Control', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'webphone_debug', label: 'Debug', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'webphone_layout', label: 'Webphone Layout' },
      { key: 'webphone_settings', label: 'Webphone Settings Container' },
    ];
  }

  if (entity === 'servers') {
    return [
      { section: 'Server Identity' },
      { key: 'server_id', label: 'Server ID', disabled: mode === 'edit' },
      { key: 'server_description', label: 'Description' },
      { key: 'server_ip', label: 'Server IP' },
      { key: 'active', label: 'Active', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'active_asterisk_server', label: 'Asterisk Active', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'asterisk_version', label: 'Asterisk Version' },
      { key: 'max_vicidial_trunks', label: 'Max Dialer Trunks', type: 'number' },
      { key: 'local_gmt', label: 'Local GMT', type: 'select', options: enumOptions(ensureOption(GMT_OPTIONS, form?.local_gmt)) },
      { section: 'Asterisk and Dialplan' },
      { key: 'telnet_host', label: 'Telnet Host' },
      { key: 'telnet_port', label: 'Telnet Port', type: 'number' },
      { key: 'ASTmgrUSERNAME', label: 'Asterisk Manager User' },
      { key: 'ASTmgrSECRET', label: 'Asterisk Manager Secret', type: 'password' },
      { key: 'ASTmgrUSERNAMEupdate', label: 'Asterisk Manager User (Update)' },
      { key: 'ASTmgrUSERNAMElisten', label: 'Asterisk Manager User (Listen)' },
      { key: 'ASTmgrUSERNAMEsend', label: 'Asterisk Manager User (Send)' },
      { key: 'ext_context', label: 'Extension Context', type: phoneContextOptions.length ? 'select' : 'text', options: withCurrentOption(phoneContextOptions, form?.ext_context) },
      { key: 'answer_transfer_agent', label: 'Answer Transfer Agent Exten' },
      { key: 'agi_output', label: 'AGI Output', type: 'select', options: enumOptions(['NONE', 'STDERR', 'FILE', 'BOTH']) },
      { key: 'generate_vicidial_conf', label: 'Generate Dialer Conf', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'rebuild_conf_files', label: 'Rebuild Conf Files', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      customDialplanField(),
      { key: 'routing_prefix', label: 'Routing Prefix' },
      { key: 'conf_engine', label: 'Conference Engine', type: 'select', options: enumOptions(['MEETME', 'CONFBRIDGE']) },
      { key: 'conf_secret', label: 'Conference File Secret', type: 'password' },
      { key: 'conf_update_interval', label: 'Conference Update Interval', type: 'number' },
      { key: 'conf_qualify', label: 'Conference Qualify', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'ara_url', label: 'ARA URL', type: 'textarea', wide: true },
      { section: 'Operations' },
      { key: 'sys_perf_log', label: 'System Performance Log', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'vd_server_logs', label: 'VD Server Logs', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'vicidial_balance_active', label: 'Balance Dialing Active', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'vicidial_balance_rank', label: 'Balance Dialing Rank', type: 'number' },
      { key: 'balance_trunks_offlimits', label: 'Balance Trunks Off Limits', type: 'number' },
      { key: 'outbound_calls_per_second', label: 'Outbound Calls Per Second', type: 'number' },
      { key: 'sounds_update', label: 'Sounds Update', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'vicidial_recording_limit', label: 'Recording Limit Minutes', type: 'number' },
      { key: 'carrier_logging_active', label: 'Carrier Logging', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'active_agent_login_server', label: 'Agent Login Server', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'auto_restart_asterisk', label: 'Auto Restart Asterisk', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'asterisk_temp_no_restart', label: 'Temp No Restart', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'gather_asterisk_output', label: 'Gather Asterisk Output', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { section: 'Network and Recording' },
      { key: 'recording_web_link', label: 'Recording Web Link', type: 'select', options: enumOptions(['SERVER_IP', 'ALT_IP', 'EXTERNAL_IP']) },
      { key: 'alt_server_ip', label: 'Alt Server IP' },
      { key: 'active_twin_server_ip', label: 'Active Twin Server IP' },
      { key: 'external_server_ip', label: 'External Server IP' },
      { key: 'voicemail_dump_exten', label: 'VM Dump Extension' },
      { key: 'voicemail_dump_exten_no_inst', label: 'VM Dump No Instructions' },
      { key: 'web_socket_url', label: 'WebSocket URL', type: 'textarea', wide: true },
      { key: 'external_web_socket_url', label: 'External WebSocket URL', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'carriers') {
    return [
      { key: 'carrier_id', label: 'Carrier ID', disabled: mode === 'edit' },
      { key: 'carrier_name', label: 'Carrier Name' },
      { key: 'protocol', label: 'Protocol', type: 'select', options: enumOptions(ensureOption(['SIP', 'PJSIP', 'PJSIP_WIZ', 'Zap', 'IAX2', 'EXTERNAL'], form?.protocol)) },
      { key: 'server_ip', label: 'Server', type: serverOptions.length ? 'select' : 'text', options: withCurrentOption(serverOptions, form?.server_ip) },
      { key: 'active', label: 'Active', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'carrier_description', label: 'Description', wide: true },
      { key: 'template_id', label: 'Template ID' },
      { section: 'Carrier Config' },
      { key: 'registration_string', label: 'Registration String', type: 'textarea', wide: true },
      { key: 'account_entry', label: 'Account Entry', type: 'textarea', wide: true },
      { key: 'globals_string', label: 'Globals String', type: 'textarea', wide: true },
      { key: 'dialplan_entry', label: 'Dialplan Entry', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'scripts') {
    return [
      { key: 'script_id', label: 'Script ID', disabled: mode === 'edit' },
      { key: 'script_name', label: 'Script Name' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'script_color', label: 'Script Color', type: 'select', options: enumOptions(ensureOption(SCRIPT_COLOR_OPTIONS, form?.script_color)) },
      { key: 'script_comments', label: 'Comments', wide: true },
      { key: 'script_text', label: 'Script Text', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'leadFilters') {
    return [
      { key: 'lead_filter_id', label: 'Filter ID', disabled: mode === 'edit' },
      { key: 'lead_filter_name', label: 'Filter Name' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'lead_filter_comments', label: 'Comments', wide: true },
      { key: 'lead_filter_sql', label: 'Filter SQL', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'filterPhoneGroups') {
    return [
      { key: 'filter_phone_group_id', label: 'Filter Phone Group ID', disabled: mode === 'edit' },
      { key: 'filter_phone_group_name', label: 'Group Name' },
      { key: 'filter_phone_group_description', label: 'Description', wide: true },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'phone_numbers', label: 'Phone Numbers (one per line - replaces the full list on save)', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'callTimes') {
    return [
      { key: 'call_time_id', label: 'Call Time ID', disabled: mode === 'edit' },
      { key: 'call_time_name', label: 'Call Time Name' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'call_time_comments', label: 'Comments', wide: true },
      { section: 'Default Hours' },
      { key: 'ct_default_start', label: 'Default Start', type: 'number' },
      { key: 'ct_default_stop', label: 'Default Stop', type: 'number' },
      audioField('default_afterhours_filename_override', 'Default Afterhours Audio', form?.default_afterhours_filename_override, { wide: true }),
      { section: 'Daily Hours' },
      { key: 'ct_sunday_start', label: 'Sunday Start', type: 'number' },
      { key: 'ct_sunday_stop', label: 'Sunday Stop', type: 'number' },
      audioField('sunday_afterhours_filename_override', 'Sunday Audio', form?.sunday_afterhours_filename_override),
      { key: 'ct_monday_start', label: 'Monday Start', type: 'number' },
      { key: 'ct_monday_stop', label: 'Monday Stop', type: 'number' },
      audioField('monday_afterhours_filename_override', 'Monday Audio', form?.monday_afterhours_filename_override),
      { key: 'ct_tuesday_start', label: 'Tuesday Start', type: 'number' },
      { key: 'ct_tuesday_stop', label: 'Tuesday Stop', type: 'number' },
      audioField('tuesday_afterhours_filename_override', 'Tuesday Audio', form?.tuesday_afterhours_filename_override),
      { key: 'ct_wednesday_start', label: 'Wednesday Start', type: 'number' },
      { key: 'ct_wednesday_stop', label: 'Wednesday Stop', type: 'number' },
      audioField('wednesday_afterhours_filename_override', 'Wednesday Audio', form?.wednesday_afterhours_filename_override),
      { key: 'ct_thursday_start', label: 'Thursday Start', type: 'number' },
      { key: 'ct_thursday_stop', label: 'Thursday Stop', type: 'number' },
      audioField('thursday_afterhours_filename_override', 'Thursday Audio', form?.thursday_afterhours_filename_override),
      { key: 'ct_friday_start', label: 'Friday Start', type: 'number' },
      { key: 'ct_friday_stop', label: 'Friday Stop', type: 'number' },
      audioField('friday_afterhours_filename_override', 'Friday Audio', form?.friday_afterhours_filename_override),
      { key: 'ct_saturday_start', label: 'Saturday Start', type: 'number' },
      { key: 'ct_saturday_stop', label: 'Saturday Stop', type: 'number' },
      audioField('saturday_afterhours_filename_override', 'Saturday Audio', form?.saturday_afterhours_filename_override),
      { section: 'States and Holidays' },
      {
        key: 'ct_state_call_times',
        label: 'State Call Times (select the state rules that apply to this call time)',
        type: 'checkboxGroupText',
        options: (admin?.stateCallTimes || []).map((row) => ({
          value: row.state_call_time_id,
          label: `${row.state_call_time_id} - ${row.state_call_time_state || ''} ${row.state_call_time_name || ''}`.replace(/\s+/g, ' ').trim(),
        })),
        values: pipeValues,
        serialize: pipeText,
        emptyHint: 'No state call time rules defined yet - add them in the State Call Times panel on this page.',
        wide: true,
      },
      {
        key: 'ct_holidays',
        label: 'Holidays (select the holidays that apply to this call time)',
        type: 'checkboxGroupText',
        options: (admin?.holidays || []).map((row) => ({
          value: row.holiday_id,
          label: `${row.holiday_id} - ${row.holiday_name || ''} (${row.holiday_date ? String(row.holiday_date).slice(0, 10) : 'no date'}${row.holiday_status && row.holiday_status !== 'ACTIVE' ? `, ${row.holiday_status}` : ''})`,
        })),
        values: pipeValues,
        serialize: pipeText,
        emptyHint: 'No holidays defined yet - add them in the Holidays panel on this page.',
        wide: true,
      },
    ];
  }

  if (entity === 'callMenuOptions') {
    const route = String(form?.option_route || 'CALLMENU');
    const routeTargets = routeOptionsFor(route, form?.option_route_value);
    const routeValueField = {
      key: 'option_route_value',
      label: route === 'CALLMENU'
        ? 'Target Call Menu'
        : route === 'INGROUP'
          ? 'Target In-Group'
          : route === 'DID'
            ? 'Target DID'
            : route === 'PHONE'
              ? 'Target Phone'
              : route === 'EXTENSION'
                ? 'Target Extension'
                : route === 'VOICEMAIL' || route === 'VMAIL_NO_INST'
                  ? 'Voicemail Box'
                  : route === 'HANGUP'
                    ? 'Hangup Audio File'
                    : route === 'AGI'
                      ? 'AGI Route'
                      : 'Route Value',
      type: routeTargets.length && !['EXTENSION', 'AGI'].includes(route) ? 'select' : 'text',
      options: routeTargets,
    };

    return [
      { key: 'menu_id', label: 'Call Menu', type: callMenuLookupOptions.length ? 'select' : 'text', options: withCurrentOption(callMenuLookupOptions, form?.menu_id), disabled: mode === 'edit' || form?._menuLocked },
      { key: 'option_value', label: 'Option', type: 'select', options: enumOptions(ensureOption(CALL_MENU_OPTION_VALUE_OPTIONS, form?.option_value)), disabled: mode === 'edit' },
      { key: 'option_description', label: 'Description' },
      { key: 'option_route', label: 'Route', type: 'select', options: enumOptions(ensureOption(CALL_MENU_ROUTE_OPTIONS, form?.option_route)) },
      routeValueField,
      { key: 'option_route_value_context', label: route === 'EXTENSION' ? 'Extension Context' : route === 'INGROUP' ? 'In-Group Route Context' : 'Route Context', type: route === 'INGROUP' ? 'textarea' : 'text', wide: route === 'INGROUP' },
    ];
  }

  if (entity === 'callMenus') {
    return [
      { key: 'menu_id', label: 'Menu ID', disabled: mode === 'edit' },
      { key: 'menu_name', label: 'Menu Name' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { section: 'Prompts and Timing' },
      audioField('menu_prompt', 'Menu Prompt', form?.menu_prompt),
      { key: 'menu_timeout', label: 'Timeout Seconds', type: 'number' },
      audioField('menu_timeout_prompt', 'Timeout Prompt', form?.menu_timeout_prompt),
      audioField('menu_invalid_prompt', 'Invalid Prompt', form?.menu_invalid_prompt),
      { key: 'menu_repeat', label: 'Repeat Count', type: 'number' },
      { key: 'menu_time_check', label: 'Time Check', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'call_time_id', label: 'Call Time', type: callTimeOptions.length ? 'select' : 'text', options: withCurrentOption(callTimeOptions, form?.call_time_id) },
      { section: 'Tracking and DTMF' },
      { key: 'track_in_vdac', label: 'Track in VDAD', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'tracking_group', label: 'Tracking Group' },
      { key: 'dtmf_log', label: 'DTMF Log', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'dtmf_field', label: 'DTMF Field', type: 'select', options: enumOptions(ensureOption(['NONE', ...LEAD_FIELD_OPTIONS], form?.dtmf_field)) },
      { key: 'alt_dtmf_log', label: 'Alt DTMF Log', type: 'select', options: yesNoOptions('1', '0', 'Yes', 'No') },
      { key: 'answer_signal', label: 'Answer Signal', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { section: 'Advanced' },
      customDialplanField(),
      { key: 'qualify_sql', label: 'Qualify SQL', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'settingsContainers') {
    return [
      { key: 'container_id', label: 'Container ID', disabled: mode === 'edit' },
      { key: 'container_notes', label: 'Notes' },
      { key: 'container_type', label: 'Type' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'container_entry', label: 'Container Entry', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'stateCallTimes') {
    return [
      { key: 'state_call_time_id', label: 'State Call Time ID', disabled: mode === 'edit' },
      { key: 'state_call_time_state', label: 'State (2-letter)' },
      { key: 'state_call_time_name', label: 'Name' },
      { key: 'state_call_time_comments', label: 'Comments' },
      { key: 'sct_default_start', label: 'Default Start (HHMM)', type: 'number' },
      { key: 'sct_default_stop', label: 'Default Stop (HHMM)', type: 'number' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
    ];
  }

  if (entity === 'holidays') {
    return [
      { key: 'holiday_id', label: 'Holiday ID', disabled: mode === 'edit' },
      { key: 'holiday_name', label: 'Name' },
      { key: 'holiday_date', label: 'Date', type: 'date' },
      { key: 'holiday_status', label: 'Status', type: 'select', options: enumOptions(['ACTIVE', 'INACTIVE', 'EXPIRED']) },
      { key: 'holiday_method', label: 'Method', type: 'select', options: enumOptions(['REPLACE', 'REDUCE', 'ADDITIVE']) },
      { key: 'ct_default_start', label: 'Default Start (HHMM)', type: 'number' },
      { key: 'ct_default_stop', label: 'Default Stop (HHMM)', type: 'number' },
      { key: 'holiday_comments', label: 'Comments', wide: true },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
    ];
  }

  if (entity === 'statusGroups') {
    return [
      { key: 'status_group_id', label: 'Status Group ID', disabled: mode === 'edit' },
      { key: 'status_group_notes', label: 'Notes' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
    ];
  }

  if (entity === 'statusCategories') {
    return [
      { key: 'vsc_id', label: 'Category ID', disabled: mode === 'edit' },
      { key: 'vsc_name', label: 'Name' },
      { key: 'vsc_description', label: 'Description', wide: true },
      { key: 'tovdad_display', label: 'TimeOnVDAD Display (max 4)', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'sale_category', label: 'Sale Category', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'dead_lead_category', label: 'Dead Lead Category', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    ];
  }

  if (entity === 'extensionGroups') {
    return [
      { key: 'extension_group_id', label: 'Extension Group ID', disabled: mode === 'edit' },
      { key: 'extension', label: 'Extension' },
      { key: 'rank', label: 'Rank', type: 'number' },
      { key: 'campaign_groups', label: 'Campaign Groups', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'confTemplates') {
    return [
      { key: 'template_id', label: 'Template ID', disabled: mode === 'edit' },
      { key: 'template_name', label: 'Name' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'template_contents', label: 'Template Contents', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'moh') {
    return [
      { key: 'moh_id', label: 'MOH ID', disabled: mode === 'edit' },
      { key: 'moh_name', label: 'Name' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'random', label: 'Random Order', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
    ];
  }

  if (entity === 'tts') {
    return [
      { key: 'tts_id', label: 'TTS ID', disabled: mode === 'edit' },
      { key: 'tts_name', label: 'Name' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'tts_voice', label: 'Voice' },
      { key: 'tts_text', label: 'Prompt Text', type: 'textarea', wide: true },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
    ];
  }

  if (entity === 'voicemailBoxes') {
    return [
      { key: 'voicemail_id', label: 'Voicemail ID (digits)', disabled: mode === 'edit' },
      { key: 'pass', label: mode === 'edit' ? 'New Password (blank keeps current)' : 'Password', type: 'password' },
      { key: 'fullname', label: 'Full Name' },
      { key: 'email', label: 'Email' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'delete_vm_after_email', label: 'Delete VM After Email', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'voicemail_timezone', label: 'Timezone' },
      { key: 'on_login_report', label: 'On-Login Report', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
    ];
  }

  if (entity === 'vmMessageGroups') {
    return [
      { key: 'leave_vm_message_group_id', label: 'Group ID', disabled: mode === 'edit' },
      { key: 'leave_vm_message_group_notes', label: 'Notes' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
    ];
  }

  if (entity === 'automatedReports') {
    return [
      { key: 'report_id', label: 'Report ID', disabled: mode === 'edit' },
      { key: 'report_name', label: 'Name' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'report_server', label: 'Report Server' },
      { key: 'report_times', label: 'Run Times (HHMM, space-separated)' },
      { key: 'report_weekdays', label: 'Weekdays (0-6)' },
      { key: 'report_monthdays', label: 'Month Days' },
      { key: 'report_destination', label: 'Destination', type: 'select', options: enumOptions(['EMAIL', 'FTP']) },
      { key: 'email_from', label: 'Email From' },
      { key: 'email_to', label: 'Email To' },
      { key: 'email_subject', label: 'Email Subject' },
      { key: 'ftp_server', label: 'FTP Server' },
      { key: 'ftp_user', label: 'FTP User' },
      { key: 'ftp_pass', label: 'FTP Pass', type: 'password' },
      { key: 'ftp_directory', label: 'FTP Directory' },
      { key: 'filename_override', label: 'Filename Override' },
      { key: 'report_url', label: 'Report URL', type: 'textarea', wide: true },
      { key: 'run_now_trigger', label: 'Run Now Trigger', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
    ];
  }

  if (entity === 'queueGroups') {
    return [
      { key: 'queue_group', label: 'Queue Group ID', disabled: mode === 'edit' },
      { key: 'queue_group_name', label: 'Name' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'included_campaigns', label: 'Included Campaigns (space-separated)', type: 'textarea', wide: true },
      { key: 'included_inbound_groups', label: 'Included In-Groups (space-separated)', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'contacts') {
    return [
      { key: 'first_name', label: 'First Name' },
      { key: 'last_name', label: 'Last Name' },
      { key: 'office_num', label: 'Office Number' },
      { key: 'cell_num', label: 'Cell Number' },
      { key: 'other_num1', label: 'Other Number 1' },
      { key: 'other_num2', label: 'Other Number 2' },
      { key: 'bu_name', label: 'Business Unit' },
      { key: 'department', label: 'Department' },
      { key: 'group_name', label: 'Group Name' },
      { key: 'job_title', label: 'Job Title' },
      { key: 'location', label: 'Location' },
    ];
  }

  if (entity === 'languages') {
    return [
      { key: 'language_id', label: 'Language ID', disabled: mode === 'edit' },
      { key: 'language_code', label: 'Language Code' },
      { key: 'language_description', label: 'Description' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
    ];
  }

  if (entity === 'emailAccounts') {
    const inboundGroupOptions = [{ value: '', label: '---NONE---' }, ...lookupOptions(admin?.lookups?.inboundGroups, 'group_id', 'group_name')];
    return [
      { key: 'email_account_id', label: 'Email Account ID', disabled: mode === 'edit' },
      { key: 'email_account_name', label: 'Account Name' },
      { key: 'email_account_description', label: 'Description', wide: true },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'email_account_type', label: 'Account Type', type: 'select', options: [{ value: 'INBOUND', label: 'INBOUND' }, { value: 'OUTBOUND', label: 'OUTBOUND' }] },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { section: 'Server' },
      { key: 'protocol', label: 'Protocol', type: 'select', options: ['POP3', 'IMAP', 'SMTP'].map((v) => ({ value: v, label: v })) },
      { key: 'email_account_server', label: 'Mail Server' },
      { key: 'email_account_user', label: 'Login User' },
      { key: 'email_account_pass', label: mode === 'edit' ? 'Password (blank = keep current)' : 'Password' },
      { key: 'pop3_auth_mode', label: 'POP3 Auth Mode', type: 'select', options: ['BEST', 'PASS', 'APOP', 'CRAM-MD5'].map((v) => ({ value: v, label: v })) },
      { key: 'email_replyto_address', label: 'Reply-To Address' },
      { key: 'email_frequency_check_mins', label: 'Check Frequency (mins)', type: 'number' },
      { section: 'Routing' },
      { key: 'group_id', label: 'Inbound Group', type: 'select', options: inboundGroupOptions },
      { key: 'default_list_id', label: 'Default List ID', type: 'number' },
    ];
  }

  if (entity === 'ipLists') {
    return [
      { key: 'ip_list_id', label: 'IP List ID', disabled: mode === 'edit' },
      { key: 'ip_list_name', label: 'Name' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'ip_addresses', label: 'IP Addresses (one per line - replaces the full list on save)', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'cidGroups') {
    return [
      { key: 'cid_group_id', label: 'CID Group ID', disabled: mode === 'edit' },
      { key: 'cid_group_notes', label: 'Notes' },
      { key: 'cid_group_type', label: 'Type', type: 'select', options: enumOptions(['AREACODE', 'STATE', 'NONE']) },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'cid_auto_rotate_minutes', label: 'Auto-Rotate Minutes', type: 'number' },
      { key: 'cid_auto_rotate_minimum', label: 'Auto-Rotate Minimum', type: 'number' },
      { key: 'cid_auto_rotate_calls', label: 'Auto-Rotate Calls', type: 'number' },
    ];
  }

  if (entity === 'phoneAliases') {
    return [
      { key: 'alias_id', label: 'Alias ID', disabled: mode === 'edit' },
      { key: 'alias_name', label: 'Alias Name' },
      { key: 'logins_list', label: 'Phone Logins (comma-separated)', type: 'textarea', wide: true },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
    ];
  }

  if (entity === 'groupAliases') {
    return [
      { key: 'group_alias_id', label: 'Group Alias ID', disabled: mode === 'edit' },
      { key: 'group_alias_name', label: 'Alias Name' },
      { key: 'caller_id_number', label: 'CallerID Number' },
      { key: 'caller_id_name', label: 'CallerID Name' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
    ];
  }

  if (entity === 'dropLists') {
    const listOptions = (admin?.lists || []).map((row) => ({ value: String(row.list_id), label: `${row.list_id} - ${row.list_name || ''}` }));
    return [
      { key: 'dl_id', label: 'Drop List ID', disabled: mode === 'edit' },
      { key: 'dl_name', label: 'Name' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'dl_server', label: 'Server' },
      { key: 'dl_times', label: 'Run Times (HHMM, space-separated)' },
      { key: 'dl_weekdays', label: 'Weekdays (0-6)' },
      { key: 'dl_monthdays', label: 'Month Days' },
      { key: 'drop_statuses', label: 'Drop Statuses (space-separated)' },
      { key: 'list_id', label: 'Destination List', type: listOptions.length ? 'select' : 'text', options: listOptions },
      { key: 'duplicate_check', label: 'Duplicate Check', type: 'select', options: enumOptions(['NONE', 'DAY', 'WEEK', 'MONTH', '30DAY', '60DAY', '90DAY', '180DAY', '360DAY', 'EVER']) },
      { key: 'run_now_trigger', label: 'Run Now Trigger', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'closer_campaigns', label: 'In-Groups (space-separated)', type: 'textarea', wide: true },
      { key: 'dl_minutes', label: 'Minutes Delay', type: 'number' },
    ];
  }

  if (entity === 'remoteAgents') {
    const serverOptions = (admin?.servers || []).map((row) => ({ value: row.server_ip, label: `${row.server_id || row.server_ip} - ${row.server_ip}` }));
    return [
      { key: 'user_start', label: 'User ID Start', disabled: false },
      { key: 'number_of_lines', label: 'Number of Lines', type: 'number' },
      { key: 'server_ip', label: 'Server', type: serverOptions.length ? 'select' : 'text', options: serverOptions },
      { key: 'conf_exten', label: 'External Extension' },
      { key: 'status', label: 'Status', type: 'select', options: enumOptions(['ACTIVE', 'INACTIVE']) },
      { key: 'campaign_id', label: 'Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions },
      { key: 'closer_campaigns', label: 'In-Groups (space-separated)', type: 'textarea', wide: true },
      { key: 'extension_group', label: 'Extension Group' },
      { key: 'extension_group_order', label: 'Extension Group Order', type: 'select', options: enumOptions(['NONE', 'RANDOM', 'UP_COUNT', 'DOWN_COUNT', 'UP_EXTEN', 'DOWN_EXTEN']) },
      { key: 'on_hook_agent', label: 'On-Hook Agent', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'on_hook_ring_time', label: 'On-Hook Ring Time', type: 'number' },
    ];
  }

  if (entity === 'shifts') {
    return [
      { key: 'shift_id', label: 'Shift ID', disabled: mode === 'edit' },
      { key: 'shift_name', label: 'Shift Name' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'shift_start_time', label: 'Start Time' },
      { key: 'shift_length', label: 'Shift Length' },
      { key: 'shift_weekdays', label: 'Weekdays', type: 'multiSelectText', options: WEEKDAY_OPTIONS, values: weekdayValues, serialize: weekdayText, wide: true },
      { key: 'report_option', label: 'Report Option', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'report_rank', label: 'Report Rank', type: 'number' },
    ];
  }

  return [
    { section: 'Basic In-Group' },
    { key: 'group_id', label: 'Group ID', disabled: mode === 'edit' },
    { key: 'group_name', label: 'Group Name' },
    { key: 'group_color', label: 'Color', type: 'select', options: enumOptions(ensureOption(ADMIN_COLOR_OPTIONS, form?.group_color)) },
    { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
    { key: 'group_handling', label: 'Handling', type: 'select', options: enumOptions(['PHONE', 'EMAIL']) },
    { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
    { key: 'call_time_id', label: 'Call Time', type: callTimeOptions.length ? 'select' : 'text', options: callTimeOptions },
    voicemailField('voicemail_ext', 'Voicemail', form?.voicemail_ext),
    { key: 'queue_priority', label: 'Priority', type: 'select', options: labeledNumberOptions(99, -99, (value) => `${value} - ${value < 0 ? 'Lower' : value > 0 ? 'Higher' : 'Even'}`, form?.queue_priority) },
    { key: 'next_agent_call', label: 'Next Agent Call', type: 'select', options: enumOptions(ensureOption(NEXT_AGENT_CALL_OPTIONS, form?.next_agent_call)) },
    { key: 'agent_search_method', label: 'Agent Search Method', type: 'select', options: enumOptions(ensureOption(AGENT_SEARCH_OPTIONS, form?.agent_search_method)) },
    { key: 'fronter_display', label: 'Fronter Display', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'default_group_alias', label: 'Default Group Alias' },
    { key: 'dial_ingroup_cid', label: 'Dial In-Group CID' },
    { section: 'Scripts and Web Forms' },
    { key: 'ingroup_script', label: 'Script', type: scriptOptions.length ? 'select' : 'text', options: scriptOptions },
    { key: 'ingroup_script_two', label: 'Second Script', type: scriptOptions.length ? 'select' : 'text', options: scriptOptions },
    { key: 'get_call_launch', label: 'Get Call Launch', type: 'select', options: enumOptions(ensureOption(INGROUP_GET_CALL_LAUNCH_OPTIONS, form?.get_call_launch)) },
    { key: 'ignore_list_script_override', label: 'Ignore List Script Override', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'web_form_address', label: 'Web Form Address', type: 'textarea', wide: true },
    { key: 'web_form_address_two', label: 'Web Form Address 2', type: 'textarea', wide: true },
    { key: 'web_form_address_three', label: 'Web Form Address 3', type: 'textarea', wide: true },
    { key: 'start_call_url', label: 'Start Call URL', type: 'textarea', wide: true },
    { key: 'dispo_call_url', label: 'Dispo Call URL', type: 'textarea', wide: true },
    { key: 'na_call_url', label: 'No-Agent URL', type: 'textarea', wide: true },
    { key: 'add_lead_url', label: 'Add Lead URL', type: 'textarea', wide: true },
    { key: 'enter_ingroup_url', label: 'Enter In-Group URL', type: 'textarea', wide: true },
    { key: 'waiting_call_url_on', label: 'Waiting Call URL On', type: 'textarea', wide: true },
    { key: 'waiting_call_url_off', label: 'Waiting Call URL Off', type: 'textarea', wide: true },
    { key: 'waiting_call_count', label: 'Waiting Call Count', type: 'number' },
    { section: 'Drop, After Hours, and No-Agent Routing' },
    { key: 'drop_call_seconds', label: 'Drop Seconds', type: 'number' },
    { key: 'drop_call_seconds_override', label: 'Drop Seconds Override', type: 'number' },
    { key: 'drop_action', label: 'Drop Action', type: 'select', options: enumOptions(ensureOption(INGROUP_DROP_ACTION_OPTIONS, form?.drop_action)) },
    routeTargetField(form?.drop_action, 'drop_exten', 'Drop Extension / Filename', form?.drop_exten),
    { key: 'drop_inbound_group', label: 'Drop In-Group', type: inboundOptions.length ? 'select' : 'text', options: withCurrentOption(inboundOptions, form?.drop_inbound_group) },
    { key: 'drop_callmenu', label: 'Drop Call Menu', type: callMenuRouteOptions(form?.drop_callmenu).length ? 'select' : 'text', options: callMenuRouteOptions(form?.drop_callmenu) },
    { key: 'drop_lead_reset', label: 'Drop Lead Reset', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'after_hours_action', label: 'After Hours Action', type: 'select', options: enumOptions(ensureOption(INGROUP_AFTER_HOURS_ACTION_OPTIONS, form?.after_hours_action)) },
    audioField('after_hours_message_filename', 'After Hours Message', form?.after_hours_message_filename),
    { key: 'after_hours_exten', label: 'After Hours Extension' },
    voicemailField('after_hours_voicemail', 'After Hours Voicemail', form?.after_hours_voicemail),
    { key: 'afterhours_xfer_group', label: 'After Hours In-Group', type: inboundOptions.length ? 'select' : 'text', options: withCurrentOption(inboundOptions, form?.afterhours_xfer_group) },
    { key: 'after_hours_callmenu', label: 'After Hours Call Menu', type: callMenuRouteOptions(form?.after_hours_callmenu).length ? 'select' : 'text', options: callMenuRouteOptions(form?.after_hours_callmenu) },
    { key: 'after_hours_lead_reset', label: 'After Hours Lead Reset', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'no_agent_no_queue', label: 'No Agent No Queue', type: 'select', options: enumOptions(ensureOption(INGROUP_NO_AGENT_NO_QUEUE_OPTIONS, form?.no_agent_no_queue)) },
    { key: 'no_agent_action', label: 'No Agent Action', type: 'select', options: enumOptions(ensureOption(INGROUP_NO_AGENT_ACTION_OPTIONS, form?.no_agent_action)) },
    routeTargetField(form?.no_agent_action, 'no_agent_action_value', 'No Agent Action Value', form?.no_agent_action_value),
    { key: 'no_agent_delay', label: 'No Agent Delay', type: 'number' },
    { key: 'in_queue_nanque', label: 'In Queue NANQUE', type: 'select', options: enumOptions(ensureOption(INGROUP_IN_QUEUE_NANQUE_OPTIONS, form?.in_queue_nanque)) },
    { key: 'in_queue_nanque_exceptions', label: 'NANQUE Exceptions' },
    { key: 'nanq_lead_reset', label: 'No-Agent Lead Reset', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { section: 'Prompts, Hold, and Wait Options' },
    audioField('welcome_message_filename', 'Welcome Message', form?.welcome_message_filename),
    { key: 'play_welcome_message', label: 'Play Welcome Message', type: 'select', options: enumOptions(ensureOption(INGROUP_PLAY_WELCOME_OPTIONS, form?.play_welcome_message)) },
    { key: 'moh_context', label: 'Music On Hold Context' },
    mohField('park_file_name', 'Park Music On Hold', form?.park_file_name),
    audioField('onhold_prompt_filename', 'On-Hold Prompt', form?.onhold_prompt_filename),
    { key: 'onhold_prompt_no_block', label: 'On-Hold Prompt No Block', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'onhold_prompt_seconds', label: 'On-Hold Prompt Seconds', type: 'number' },
    { key: 'prompt_interval', label: 'Prompt Interval', type: 'number' },
    { key: 'play_place_in_line', label: 'Play Place In Line', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'play_estimate_hold_time', label: 'Play Estimated Hold Time', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'calculate_estimated_hold_seconds', label: 'Estimated Hold Seconds', type: 'number' },
    audioField('place_in_line_caller_number_filename', 'Place-In-Line Caller Number Prompt', form?.place_in_line_caller_number_filename),
    audioField('place_in_line_you_next_filename', 'Place-In-Line You Are Next Prompt', form?.place_in_line_you_next_filename),
    { key: 'hold_time_option', label: 'Hold Time Option', type: 'select', options: enumOptions(ensureOption(INGROUP_HOLD_WAIT_ROUTE_OPTIONS, form?.hold_time_option)) },
    { key: 'hold_time_second_option', label: 'Hold Time Second Option', type: 'select', options: enumOptions(ensureOption(INGROUP_HOLD_WAIT_ROUTE_OPTIONS, form?.hold_time_second_option)) },
    { key: 'hold_time_third_option', label: 'Hold Time Third Option', type: 'select', options: enumOptions(ensureOption(INGROUP_HOLD_WAIT_ROUTE_OPTIONS, form?.hold_time_third_option)) },
    { key: 'hold_time_option_seconds', label: 'Hold Time Seconds', type: 'number' },
    { key: 'hold_time_option_minimum', label: 'Hold Time Minimum', type: 'number' },
    { key: 'hold_time_option_exten', label: 'Hold Time Extension' },
    voicemailField('hold_time_option_voicemail', 'Hold Time Voicemail', form?.hold_time_option_voicemail),
    { key: 'hold_time_option_xfer_group', label: 'Hold Time In-Group', type: inboundOptions.length ? 'select' : 'text', options: withCurrentOption(inboundOptions, form?.hold_time_option_xfer_group) },
    { key: 'hold_time_option_callmenu', label: 'Hold Time Call Menu', type: callMenuRouteOptions(form?.hold_time_option_callmenu).length ? 'select' : 'text', options: callMenuRouteOptions(form?.hold_time_option_callmenu) },
    audioField('hold_time_option_callback_filename', 'Hold Time Callback Prompt', form?.hold_time_option_callback_filename),
    { key: 'hold_time_option_callback_list_id', label: 'Hold Time Callback List', type: listOptions.length ? 'select' : 'text', options: withCurrentOption(listOptions, form?.hold_time_option_callback_list_id) },
    audioField('hold_time_option_press_filename', 'Hold Time Press Prompt', form?.hold_time_option_press_filename),
    { key: 'hold_time_option_no_block', label: 'Hold Time No Block', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'hold_time_option_prompt_seconds', label: 'Hold Time Prompt Seconds', type: 'number' },
    { key: 'hold_recall_xfer_group', label: 'Hold Recall In-Group', type: inboundOptions.length ? 'select' : 'text', options: withCurrentOption(inboundOptions, form?.hold_recall_xfer_group) },
    { key: 'hold_time_lead_reset', label: 'Hold Time Lead Reset', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'wait_hold_option_priority', label: 'Wait/Hold Priority', type: 'select', options: enumOptions(ensureOption(INGROUP_WAIT_HOLD_PRIORITY_OPTIONS, form?.wait_hold_option_priority)) },
    { key: 'wait_time_option', label: 'Wait Time Option', type: 'select', options: enumOptions(ensureOption(INGROUP_HOLD_WAIT_ROUTE_OPTIONS, form?.wait_time_option)) },
    { key: 'wait_time_second_option', label: 'Wait Time Second Option', type: 'select', options: enumOptions(ensureOption(INGROUP_HOLD_WAIT_ROUTE_OPTIONS, form?.wait_time_second_option)) },
    { key: 'wait_time_third_option', label: 'Wait Time Third Option', type: 'select', options: enumOptions(ensureOption(INGROUP_HOLD_WAIT_ROUTE_OPTIONS, form?.wait_time_third_option)) },
    { key: 'wait_time_option_seconds', label: 'Wait Time Seconds', type: 'number' },
    { key: 'wait_time_option_exten', label: 'Wait Time Extension' },
    voicemailField('wait_time_option_voicemail', 'Wait Time Voicemail', form?.wait_time_option_voicemail),
    { key: 'wait_time_option_xfer_group', label: 'Wait Time In-Group', type: inboundOptions.length ? 'select' : 'text', options: withCurrentOption(inboundOptions, form?.wait_time_option_xfer_group) },
    { key: 'wait_time_option_callmenu', label: 'Wait Time Call Menu', type: callMenuRouteOptions(form?.wait_time_option_callmenu).length ? 'select' : 'text', options: callMenuRouteOptions(form?.wait_time_option_callmenu) },
    audioField('wait_time_option_callback_filename', 'Wait Time Callback Prompt', form?.wait_time_option_callback_filename),
    { key: 'wait_time_option_callback_list_id', label: 'Wait Time Callback List', type: listOptions.length ? 'select' : 'text', options: withCurrentOption(listOptions, form?.wait_time_option_callback_list_id) },
    audioField('wait_time_option_press_filename', 'Wait Time Press Prompt', form?.wait_time_option_press_filename),
    { key: 'wait_time_option_no_block', label: 'Wait Time No Block', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'wait_time_option_prompt_seconds', label: 'Wait Time Prompt Seconds', type: 'number' },
    { key: 'wait_time_lead_reset', label: 'Wait Time Lead Reset', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    audioField('eht_minimum_prompt_filename', 'EHT Minimum Prompt', form?.eht_minimum_prompt_filename),
    { key: 'eht_minimum_prompt_no_block', label: 'EHT Minimum No Block', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'eht_minimum_prompt_seconds', label: 'EHT Minimum Prompt Seconds', type: 'number' },
    { section: 'Transfers and Recording' },
    { key: 'default_xfer_group', label: 'Default Transfer Group', type: inboundOptions.length ? 'select' : 'text', options: withCurrentOption(inboundOptions, form?.default_xfer_group) },
    { key: 'action_xfer_cid', label: 'Transfer CallerID' },
    { key: 'extension_appended_cidname', label: 'Append Extension To CID Name', type: 'select', options: enumOptions(ensureOption(['N', 'Y', 'Y_USER', 'Y_WITH_CAMPAIGN', 'Y_USER_WITH_CAMPAIGN'], form?.extension_appended_cidname)) },
    { key: 'xferconf_a_dtmf', label: 'Transfer-Conf DTMF 1' },
    { key: 'xferconf_a_number', label: 'Transfer-Conf Number 1' },
    { key: 'xferconf_b_dtmf', label: 'Transfer-Conf DTMF 2' },
    { key: 'xferconf_b_number', label: 'Transfer-Conf Number 2' },
    { key: 'xferconf_c_number', label: 'Transfer-Conf Number 3' },
    { key: 'xferconf_d_number', label: 'Transfer-Conf Number 4' },
    { key: 'xferconf_e_number', label: 'Transfer-Conf Number 5' },
    { key: 'xfer_talk_minimum', label: 'Transfer Talk Minimum', type: 'select', options: enumOptions(['DISABLED', 'ENABLED']) },
    { key: 'xfer_talk_minimum_sec', label: 'Transfer Talk Minimum Seconds', type: 'number' },
    { key: 'ingroup_recording_override', label: 'Recording Override', type: 'select', options: enumOptions(ensureOption(INGROUP_RECORDING_OPTIONS, form?.ingroup_recording_override)) },
    recordingField('ingroup_rec_filename', 'Recording Filename', form?.ingroup_rec_filename),
    { key: 'routing_initiated_recordings', label: 'Routing Initiated Recording', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'stereo_recording', label: 'Stereo Recording', type: 'select', options: enumOptions(ensureOption(INGROUP_STEREO_RECORDING_OPTIONS, form?.stereo_recording)) },
    { key: 'stereo_rec_filename', label: 'Stereo Recording Filename' },
    { key: 'stereo_parallel_recording', label: 'Parallel Stereo Recording', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'parallel_rec_co_filename', label: 'Parallel Customer-Only Filename' },
    { key: 'parallel_rec_cm_filename', label: 'Parallel Customer-Mute Filename' },
    { key: 'parallel_rec_fr_filename', label: 'Parallel Full Recording Filename' },
    { key: 'recording_dtmf_muting', label: 'Recording DTMF Muting', type: 'select', options: enumOptions(ensureOption(['DISABLED', 'ENABLED'], form?.recording_dtmf_muting)) },
    { key: 'stereo_recording_agent', label: 'Agent Stereo Recording', type: 'select', options: enumOptions(ensureOption(INGROUP_RECORDING_OPTIONS, form?.stereo_recording_agent)) },
    { section: 'Quality Control' },
    { key: 'qc_enabled', label: 'QC Enabled', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'qc_statuses', label: 'QC Statuses' },
    { key: 'qc_shift_id', label: 'QC Shift', type: shiftScopeOptions.length ? 'select' : 'text', options: withCurrentOption(shiftScopeOptions, form?.qc_shift_id) },
    { key: 'qc_get_record_launch', label: 'QC Record Launch', type: 'select', options: enumOptions(ensureOption(INGROUP_QC_GET_RECORD_LAUNCH_OPTIONS, form?.qc_get_record_launch)) },
    { key: 'qc_show_recording', label: 'QC Show Recording', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'qc_web_form_address', label: 'QC Web Form', type: 'textarea', wide: true },
    { key: 'qc_script', label: 'QC Script', type: scriptOptions.length ? 'select' : 'text', options: scriptOptions },
    { key: 'qc_scorecard_id', label: 'QC Scorecard ID' },
    { key: 'qc_statuses_id', label: 'QC Statuses ID' },
    { section: 'Limits, Filters, and Timers' },
    { key: 'max_calls_method', label: 'Max Calls Method', type: 'select', options: enumOptions(ensureOption(INGROUP_MAX_CALLS_METHOD_OPTIONS, form?.max_calls_method)) },
    { key: 'max_calls_count', label: 'Max Calls Count', type: 'number' },
    { key: 'max_calls_action', label: 'Max Calls Action', type: 'select', options: enumOptions(ensureOption(INGROUP_MAX_CALLS_ACTION_OPTIONS, form?.max_calls_action)) },
    { key: 'areacode_filter', label: 'Area Code Filter', type: 'select', options: enumOptions(ensureOption(INGROUP_AREACODE_FILTER_OPTIONS, form?.areacode_filter)) },
    { key: 'areacode_filter_seconds', label: 'Area Code Filter Seconds', type: 'number' },
    { key: 'areacode_filter_action', label: 'Area Code Filter Action', type: 'select', options: enumOptions(ensureOption(INGROUP_NO_AGENT_ACTION_OPTIONS, form?.areacode_filter_action)) },
    routeTargetField(form?.areacode_filter_action, 'areacode_filter_action_value', 'Area Code Filter Value', form?.areacode_filter_action_value),
    { key: 'timer_action', label: 'Timer Action', type: 'select', options: enumOptions(ensureOption(TIMER_ACTION_OPTIONS, form?.timer_action)) },
    audioField('timer_action_message', 'Timer Action Message', form?.timer_action_message),
    { key: 'timer_action_seconds', label: 'Timer Seconds', type: 'number' },
    routeTargetField(form?.timer_action, 'timer_action_destination', 'Timer Destination', form?.timer_action_destination),
    { key: 'no_delay_call_route', label: 'No Delay Call Route', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'on_hook_ring_time', label: 'On-Hook Ring Time', type: 'number' },
    { key: 'on_hook_cid', label: 'On-Hook CID' },
    { key: 'on_hook_cid_number', label: 'On-Hook CID Number' },
    { key: 'uniqueid_status_display', label: 'UniqueID Status Display', type: 'select', options: enumOptions(ensureOption(['DISABLED', 'ENABLED', 'ENABLED_PREFIX', 'ENABLED_PRESERVE'], form?.uniqueid_status_display)) },
    { key: 'uniqueid_status_prefix', label: 'UniqueID Status Prefix' },
    { key: 'status_group_id', label: 'Status Group ID' },
    { key: 'answer_signal', label: 'Answer Signal', type: 'select', options: enumOptions(ensureOption(INGROUP_ANSWER_SIGNAL_OPTIONS, form?.answer_signal)) },
    { section: 'Survey, Callbacks, and Closing Time' },
    { key: 'inbound_survey', label: 'Inbound Survey', type: 'select', options: enumOptions(['DISABLED', 'ENABLED']) },
    audioField('inbound_survey_filename', 'Survey Intro Prompt', form?.inbound_survey_filename),
    { key: 'inbound_survey_accept_digit', label: 'Survey Accept Digit' },
    audioField('inbound_survey_question_filename', 'Survey Question Prompt', form?.inbound_survey_question_filename),
    { key: 'inbound_survey_callmenu', label: 'Survey Call Menu', type: callMenuRouteOptions(form?.inbound_survey_callmenu).length ? 'select' : 'text', options: callMenuRouteOptions(form?.inbound_survey_callmenu) },
    { key: 'icbq_expiration_hours', label: 'ICBQ Expiration Hours', type: 'number' },
    { key: 'icbq_call_time_id', label: 'ICBQ Call Time', type: callTimeOptions.length ? 'select' : 'text', options: withCurrentOption(callTimeOptions, form?.icbq_call_time_id) },
    { key: 'icbq_dial_filter', label: 'ICBQ Dial Filter', type: leadFilterOptions.length ? 'select' : 'text', options: withCurrentOption(leadFilterOptions, form?.icbq_dial_filter) },
    { key: 'closing_time_action', label: 'Closing Time Action', type: 'select', options: enumOptions(ensureOption(INGROUP_NO_AGENT_ACTION_OPTIONS, form?.closing_time_action)) },
    { key: 'closing_time_now_trigger', label: 'Closing Time Trigger Now', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    audioField('closing_time_filename', 'Closing Time Prompt', form?.closing_time_filename),
    audioField('closing_time_end_filename', 'Closing Time End Prompt', form?.closing_time_end_filename),
    { key: 'closing_time_lead_reset', label: 'Closing Time Lead Reset', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'closing_time_option_exten', label: 'Closing Time Extension' },
    { key: 'closing_time_option_callmenu', label: 'Closing Time Call Menu', type: callMenuRouteOptions(form?.closing_time_option_callmenu).length ? 'select' : 'text', options: callMenuRouteOptions(form?.closing_time_option_callmenu) },
    voicemailField('closing_time_option_voicemail', 'Closing Time Voicemail', form?.closing_time_option_voicemail),
    { key: 'closing_time_option_xfer_group', label: 'Closing Time In-Group', type: inboundOptions.length ? 'select' : 'text', options: withCurrentOption(inboundOptions, form?.closing_time_option_xfer_group) },
    { key: 'closing_time_option_callback_list_id', label: 'Closing Time Callback List', type: listOptions.length ? 'select' : 'text', options: withCurrentOption(listOptions, form?.closing_time_option_callback_list_id) },
    { key: 'cid_cb_confirm_number', label: 'CID Callback Confirm Number', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'cid_cb_invalid_filter_phone_group', label: 'CID Callback Invalid Filter Group', type: filterPhoneGroupOptions.length ? 'select' : 'text', options: withCurrentOption(filterPhoneGroupOptions, form?.cid_cb_invalid_filter_phone_group) },
    { key: 'cid_cb_valid_length', label: 'CID Callback Valid Length', type: 'number' },
    audioField('cid_cb_valid_filename', 'CID Callback Valid Prompt', form?.cid_cb_valid_filename),
    audioField('cid_cb_confirmed_filename', 'CID Callback Confirmed Prompt', form?.cid_cb_confirmed_filename),
    audioField('cid_cb_enter_filename', 'CID Callback Enter Prompt', form?.cid_cb_enter_filename),
    audioField('cid_cb_you_entered_filename', 'CID Callback You Entered Prompt', form?.cid_cb_you_entered_filename),
    audioField('cid_cb_press_to_confirm_filename', 'CID Callback Press Confirm Prompt', form?.cid_cb_press_to_confirm_filename),
    audioField('cid_cb_invalid_filename', 'CID Callback Invalid Prompt', form?.cid_cb_invalid_filename),
    audioField('cid_cb_reenter_filename', 'CID Callback Re-enter Prompt', form?.cid_cb_reenter_filename),
    audioField('cid_cb_error_filename', 'CID Callback Error Prompt', form?.cid_cb_error_filename),
    { section: 'Lead Population' },
    { key: 'populate_lead_ingroup', label: 'Populate Lead In-Group', type: 'select', options: enumOptions(ENABLED_DISABLED_OPTIONS) },
    { key: 'populate_lead_province', label: 'Populate Lead Province' },
    { key: 'populate_state_areacode', label: 'Populate State From Area Code', type: 'select', options: enumOptions(ensureOption(INGROUP_POPULATE_STATE_OPTIONS, form?.populate_state_areacode)) },
    { key: 'populate_lead_source', label: 'Populate Lead Source' },
    { key: 'populate_lead_vendor', label: 'Populate Lead Vendor' },
    { key: 'populate_lead_comments', label: 'Populate Lead Comments', type: 'textarea', wide: true },
    { key: 'populate_lead_owner', label: 'Populate Lead Owner' },
    { key: 'add_lead_timezone', label: 'Add Lead Timezone', type: 'select', options: enumOptions(INGROUP_ADD_LEAD_TIMEZONE_OPTIONS) },
    { section: 'Alerts and Custom Fields' },
    { key: 'agent_alert_exten', label: 'Agent Alert Extension' },
    { key: 'agent_alert_delay', label: 'Agent Alert Delay', type: 'number' },
    audioField('browser_alert_sound', 'Browser Alert Sound', form?.browser_alert_sound),
    { key: 'browser_alert_volume', label: 'Browser Alert Volume', type: 'number' },
    { key: 'second_alert_trigger', label: 'Second Alert Trigger' },
    { key: 'second_alert_trigger_seconds', label: 'Second Alert Trigger Seconds', type: 'number' },
    audioField('second_alert_filename', 'Second Alert Prompt', form?.second_alert_filename),
    { key: 'second_alert_delay', label: 'Second Alert Delay', type: 'number' },
    { key: 'second_alert_container', label: 'Second Alert Container' },
    { key: 'second_alert_only', label: 'Second Alert Only', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'third_alert_trigger', label: 'Third Alert Trigger' },
    { key: 'third_alert_trigger_seconds', label: 'Third Alert Trigger Seconds', type: 'number' },
    audioField('third_alert_filename', 'Third Alert Prompt', form?.third_alert_filename),
    { key: 'third_alert_delay', label: 'Third Alert Delay', type: 'number' },
    { key: 'third_alert_container', label: 'Third Alert Container' },
    { key: 'third_alert_only', label: 'Third Alert Only', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    { key: 'custom_one', label: 'Custom One' },
    { key: 'custom_two', label: 'Custom Two' },
    { key: 'custom_three', label: 'Custom Three' },
    { key: 'custom_four', label: 'Custom Four' },
    { key: 'custom_five', label: 'Custom Five' },
  ];
}

function entityLabel(entity) {
  return {
    campaigns: 'Campaign',
    campaignCopy: 'Campaign Copy',
    pauseCodes: 'Pause Code',
    campaignHotkeys: 'Campaign Hotkey',
    leadRecycle: 'Lead Recycle Rule',
    listMixes: 'List Mix',
    users: 'User',
    userGroups: 'User Group',
    lists: 'List',
    inbound: 'Inbound Group',
    dids: 'DID',
    callMenus: 'Call Menu',
    callMenuOptions: 'Call Menu Option',
    phones: 'Phone',
    servers: 'Server',
    carriers: 'Carrier',
    scripts: 'Script',
    leadFilters: 'Lead Filter',
    callTimes: 'Call Time',
    shifts: 'Shift',
    statuses: 'System Status',
    campaignStatuses: 'Campaign Status',
    remoteAgents: 'Remote Agent',
    dropLists: 'Drop List',
    phoneAliases: 'Phone Alias',
    groupAliases: 'Group Alias',
    ipLists: 'IP List',
    cidGroups: 'CID Group',
    queueGroups: 'Queue Group',
    contacts: 'Contact',
    languages: 'Language',
    emailAccounts: 'Email Account',
    voicemailBoxes: 'Voicemail Box',
    vmMessageGroups: 'VM Message Group',
    automatedReports: 'Automated Report',
    moh: 'Music On Hold Group',
    tts: 'TTS Prompt',
    stateCallTimes: 'State Call Time',
    holidays: 'Holiday',
    statusGroups: 'Status Group',
    statusCategories: 'Status Category',
    extensionGroups: 'Extension Group Entry',
    confTemplates: 'Conf Template',
    settingsContainers: 'Settings Container',
  }[entity] || 'Record';
}

function entityId(entity, row) {
  return {
    campaigns: row.campaign_id,
    campaignCopy: row.campaign_id,
    pauseCodes: row.pause_code,
    campaignHotkeys: row.hotkey,
    leadRecycle: row.recycle_id,
    listMixes: row.vcl_id,
    users: row.user,
    userGroups: row.user_group,
    lists: row.list_id,
    inbound: row.group_id,
    dids: row.did_pattern,
    callMenus: row.menu_id,
    // '__' composite keys are a WIRE CONTRACT: the server splits the URL id
    // on '__' for these two entities (PUT/DELETE routing). Key parts must
    // never contain '__' themselves; change the delimiter in both places or
    // not at all.
    callMenuOptions: `${row.menu_id}__${row.option_value}`,
    phones: `${row.extension}__${row.server_ip}`,
    servers: row.server_id,
    carriers: row.carrier_id,
    scripts: row.script_id,
    leadFilters: row.lead_filter_id,
    filterPhoneGroups: row.filter_phone_group_id,
    callTimes: row.call_time_id,
    shifts: row.shift_id,
    statuses: row.status,
    campaignStatuses: row.status,
    remoteAgents: row.remote_agent_id,
    dropLists: row.dl_id,
    phoneAliases: row.alias_id,
    groupAliases: row.group_alias_id,
    ipLists: row.ip_list_id,
    cidGroups: row.cid_group_id,
    queueGroups: row.queue_group,
    contacts: row.contact_id,
    languages: row.language_id,
    emailAccounts: row.email_account_id,
    voicemailBoxes: row.voicemail_id,
    vmMessageGroups: row.leave_vm_message_group_id,
    automatedReports: row.report_id,
    moh: row.moh_id,
    tts: row.tts_id,
    stateCallTimes: row.state_call_time_id,
    holidays: row.holiday_id,
    statusGroups: row.status_group_id,
    statusCategories: row.vsc_id,
    extensionGroups: row.extension_id,
    confTemplates: row.template_id,
    settingsContainers: row.container_id,
  }[entity];
}

function entityPath(entity) {
  return {
    userGroups: 'user-groups',
    pauseCodes: 'pause-codes',
    campaignHotkeys: 'campaign-hotkeys',
    leadRecycle: 'lead-recycle',
    listMixes: 'list-mixes',
    leadFilters: 'lead-filters',
    filterPhoneGroups: 'filter-phone-groups',
    callTimes: 'call-times',
    callMenus: 'call-menus',
    callMenuOptions: 'call-menu-options',
    campaignStatuses: 'campaign-statuses',
    remoteAgents: 'remote-agents',
    dropLists: 'drop-lists',
    phoneAliases: 'phone-aliases',
    groupAliases: 'group-aliases',
    ipLists: 'ip-lists',
    cidGroups: 'cid-groups',
    queueGroups: 'queue-groups',
    voicemailBoxes: 'voicemail-boxes',
    vmMessageGroups: 'vm-message-groups',
    automatedReports: 'automated-reports',
    emailAccounts: 'email-accounts',
    stateCallTimes: 'state-call-times',
    statusGroups: 'status-groups',
    statusCategories: 'status-categories',
    extensionGroups: 'extension-groups',
    confTemplates: 'conf-templates',
    settingsContainers: 'settings-containers',
  }[entity] || entity;
}

function CheckboxTextGroup({ field, value, onChange }) {
  const options = field.options || [];
  const selectedValues = field.values ? field.values(value, field.allValue) : scopeValues(value, field.allValue);
  const selectedSet = new Set(selectedValues.map(String));
  const optionValues = options.map((option) => String(option.value));

  function updateValue(optionValue, checked) {
    // Keep stored values that are NOT in the visible option list (deleted
    // records, or rows outside the editing manager's scope). Re-serializing
    // only the visible boxes would silently strip those on any toggle.
    const hidden = selectedValues.map(String).filter((valueText) => !optionValues.includes(valueText));
    const nextValues = [
      ...optionValues.filter((valueText) => (valueText === optionValue ? checked : selectedSet.has(valueText))),
      ...hidden,
    ];
    onChange(field.serialize ? field.serialize(nextValues) : scopeText(nextValues, field.allValue));
  }

  return (
    <div className="check-grid" role="group" aria-label={field.label}>
      {!options.length && <em className="check-grid-empty">{field.emptyHint || 'No options available yet.'}</em>}
      {options.map((option) => {
        const optionValue = String(option.value);
        const checked = selectedSet.has(optionValue);
        return (
          <button
            key={optionValue}
            type="button"
            className={`check-option ${checked ? 'selected' : ''}`}
            disabled={field.disabled}
            onClick={() => updateValue(optionValue, !checked)}
          >
            <input
              type="checkbox"
              checked={checked}
              disabled={field.disabled}
              readOnly
              tabIndex={-1}
            />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// API keys for an APIUSERS integration account. The raw key is returned by
// the server exactly once (on generate) and shown here for copy; afterward
// only the hash prefix is listed. SuperAdmin-only surface.
function ApiKeysPanel({ userId, token, onLogout }) {
  const [keys, setKeys] = useState(null);
  const [label, setLabel] = useState('');
  const [newKey, setNewKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const payload = await apiFetch(`/admin/users/${encodeURIComponent(userId)}/api-keys`, token);
      setKeys(payload.keys || []);
    } catch (requestError) {
      if (requestError.status === 401) { onLogout?.(); return; }
      setError('Could not load API keys');
    }
  }, [userId, token, onLogout]);

  useEffect(() => { load(); }, [load]);

  async function generate() {
    setBusy(true);
    setError('');
    setNewKey('');
    try {
      const payload = await apiFetch(`/admin/users/${encodeURIComponent(userId)}/api-keys`, token, {
        method: 'POST',
        body: JSON.stringify({ label }),
      });
      setNewKey(payload.apiKey || '');
      setLabel('');
      load();
    } catch (requestError) {
      if (requestError.status === 401) { onLogout?.(); return; }
      setError('Could not generate key');
    } finally {
      setBusy(false);
    }
  }

  async function revoke(hashPrefix) {
    setBusy(true);
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(userId)}/api-keys/${hashPrefix}`, token, { method: 'DELETE' });
      load();
    } catch (requestError) {
      if (requestError.status === 401) { onLogout?.(); return; }
      setError('Could not revoke key');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="campaign-tool-panel">
      <div className="campaign-tool-head">
        <div>
          <p className="eyebrow">API Access</p>
          <h3>API Keys</h3>
        </div>
        <ShieldCheck size={20} aria-hidden="true" />
      </div>
      <p className="action-copy">Keys let this account call the GenX API at /genxapi/api.php without a password. A key is shown once — copy it now.</p>
      <div className="input-row">
        <input type="text" value={label} placeholder="Label (e.g. CRM integration)" onChange={(event) => setLabel(event.target.value)} />
        <button type="button" className="secondary-action compact-action" onClick={generate} disabled={busy}>
          <Plus size={15} aria-hidden="true" /> Generate Key
        </button>
      </div>
      {newKey && (
        <p className="connection-summary" style={{ wordBreak: 'break-all' }}>
          New key (copy now, not shown again): <strong>{newKey}</strong>
        </p>
      )}
      {error && <p className="form-error">{error}</p>}
      <div className="connection-lists">
        {(keys || []).map((row) => (
          <div className="tool-picker-item" key={row.hash_prefix} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>{row.label} — {row.hash_prefix}… {row.last_used ? `(used ${formatDateTime(row.last_used)})` : '(never used)'}</span>
            <button type="button" className="row-action" onClick={() => revoke(row.hash_prefix)} disabled={busy}>Revoke</button>
          </div>
        ))}
        {keys && !keys.length && <em>No API keys yet</em>}
      </div>
    </div>
  );
}

function CampaignScopedTools({ admin, campaignId, user, onAction }) {
  const campaign = String(campaignId || '');
  // Cards show counts only; clicking one opens a stacked manager modal
  // listing the entries (click = edit/delete via nested ActionModal) with
  // the Add button. Closing anything lands back on the campaign Detail.
  const [toolModal, setToolModal] = useState('');
  const rowsForCampaign = (rows) => (rows || []).filter((row) => String(row.campaign_id || '') === campaign);
  const statusNameMap = new Map([
    ...(admin?.lookups?.statuses || []),
    ...(admin?.lookups?.campaignStatuses || []),
  ].map((item) => [String(item.status || ''), item.status_name || item.status]));
  const statusLabel = (status) => `${status}${statusNameMap.get(String(status || '')) ? ` - ${statusNameMap.get(String(status || ''))}` : ''}`;
  const openTool = (entity, mode, row = {}) => onAction?.(entity, mode, { campaign_id: campaign, _campaignLocked: true, ...row });
  const tools = [
    {
      entity: 'campaignStatuses',
      title: 'Statuses',
      rows: rowsForCampaign(admin?.campaignStatuses),
      key: (row) => row.status,
      label: (row) => `${row.status} - ${row.status_name || 'Campaign status'}`,
    },
    {
      entity: 'campaignHotkeys',
      title: 'Hotkeys',
      rows: rowsForCampaign(admin?.campaignHotkeys),
      key: (row) => row.hotkey,
      label: (row) => `${row.hotkey} -> ${statusLabel(row.status)}`,
    },
    {
      entity: 'leadRecycle',
      title: 'Lead Recycle',
      rows: rowsForCampaign(admin?.leadRecycle),
      key: (row) => row.recycle_id,
      label: (row) => `${statusLabel(row.status)} / ${row.attempt_maximum || 0} tries`,
    },
    {
      entity: 'pauseCodes',
      title: 'Pause Codes',
      rows: rowsForCampaign(admin?.pauseCodes),
      key: (row) => row.pause_code,
      label: (row) => `${row.pause_code} - ${row.pause_code_name || 'Pause code'}`,
    },
    {
      entity: 'listMixes',
      title: 'List Mixes',
      rows: rowsForCampaign(admin?.listMixes),
      key: (row) => row.vcl_id,
      label: (row) => `${row.vcl_id} - ${row.vcl_name || row.status || 'List mix'}`,
    },
  ];

  if (!campaign) return null;

  return (
    <div className="campaign-tool-panel">
      <div className="campaign-tool-head">
        <div>
          <p className="eyebrow">Campaign Tools</p>
          <h3>{campaign}</h3>
        </div>
        <SlidersHorizontal size={20} aria-hidden="true" />
      </div>
      <div className="campaign-tool-grid">
        {tools.map((tool) => (
          <button
            type="button"
            className="campaign-tool-card tool-count-card"
            key={tool.entity}
            onClick={() => setToolModal(tool.entity)}
          >
            <span>{tool.title}</span>
            <strong>{formatNumber(tool.rows.length)}</strong>
          </button>
        ))}
      </div>
      {tools.filter((tool) => tool.entity === toolModal).map((tool) => {
        const canManage = userCan(user, tool.entity);
        return (
          <div className="modal-backdrop" role="presentation" key={tool.entity} {...backdropCloseProps(() => setToolModal(''))}>
            <section className="modal-panel" role="dialog" aria-modal="true" aria-label={tool.title}>
              <div className="modal-head">
                <div>
                  <p className="eyebrow">Campaign {campaign}</p>
                  <h2>{tool.title}</h2>
                </div>
                <button type="button" className="icon-button" onClick={() => setToolModal('')} aria-label="Close" title="Close">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="entity-form">
                <div className="campaign-tool-list">
                  {tool.rows.map((row) => (
                    <button
                      type="button"
                      className="tool-picker-item"
                      key={`${tool.entity}-${tool.key(row)}`}
                      onClick={() => canManage && openTool(tool.entity, 'edit', row)}
                      disabled={!canManage}
                    >
                      {tool.label(row)}
                    </button>
                  ))}
                  {!tool.rows.length && <em>None configured</em>}
                </div>
                {canManage && (
                  <div className="modal-actions">
                    <span className="modal-actions-spacer" />
                    <button type="button" className="primary-action" onClick={() => openTool(tool.entity, 'create')}>
                      <Plus size={17} aria-hidden="true" />
                      Add {entityLabel(tool.entity)}
                    </button>
                  </div>
                )}
              </div>
            </section>
          </div>
        );
      })}
    </div>
  );
}

// Mirrors the cross-links at the bottom of legacy admin.php campaign modify:
// lists within the campaign, live hopper view, real-time report, and the
// log-all-agents-out action. Delete lives on the modal's standard delete button.
// Stacked modal for the Detail page's Webform URLs / Call URLs pill buttons:
// three textareas + explicit Save that writes ONLY those columns (dedicated
// endpoint), then syncs the parent form state so the campaign's main Save
// doesn't resend stale values.
const CAMPAIGN_URL_MODALS = {
  webform: {
    title: 'Webform URLs',
    fields: [
      ['web_form_address', 'Web Form URL'],
      ['web_form_address_two', 'Web Form URL 2'],
      ['web_form_address_three', 'Web Form URL 3'],
    ],
  },
  callurls: {
    title: 'Call URLs',
    // Third element = vicidial_url_multi url_type: these three support the
    // legacy 'ALT' convention (type ALT in the field -> alternate URL rows).
    fields: [
      ['start_call_url', 'Start Call URL', 'start'],
      ['dispo_call_url', 'Dispo Call URL', 'dispo'],
      ['na_call_url', 'No Agent URL', 'noagent'],
    ],
  },
};

// Alternate URLs editor (legacy admin_url_multi.php): shown under a Call URL
// textarea whose value is the literal 'ALT'. Rows fire in rank order when
// the disposition matches url_statuses ('---ALL---' = any), the lead's list
// is in url_lists (blank = all lists) and talk time >= Min Talk Sec.
const ALT_URL_EMPTY = {
  url_id: null, active: 'Y', url_rank: '1', url_statuses: '---ALL---',
  url_lists: '', url_call_length: '0', url_description: '', url_address: '',
};

function AltUrlManager({ campaignId, urlType, showTalkSec, token, onLogout }) {
  const [entries, setEntries] = useState(null);
  const [draft, setDraft] = useState(ALT_URL_EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    apiFetch(`/admin/campaigns/${encodeURIComponent(campaignId)}/url-multi?url_type=${urlType}`, token)
      .then((payload) => setEntries(payload.entries || []))
      .catch((requestError) => {
        if (requestError.status === 401) onLogout();
        setEntries([]);
      });
  }, [campaignId, urlType, token, onLogout]);
  useEffect(load, [load]);

  async function saveDraft() {
    setBusy(true);
    setError('');
    try {
      const body = JSON.stringify({ ...draft, url_type: urlType });
      if (draft.url_id) {
        await apiFetch(`/admin/campaigns/${encodeURIComponent(campaignId)}/url-multi/${draft.url_id}`, token, { method: 'PUT', body });
      } else {
        await apiFetch(`/admin/campaigns/${encodeURIComponent(campaignId)}/url-multi`, token, { method: 'POST', body });
      }
      setDraft(ALT_URL_EMPTY);
      load();
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setError(requestError.message === 'url_address_required' ? 'URL is required (5+ characters)'
        : requestError.message === 'url_description_required' ? 'Description is required'
          : 'The alternate URL was not saved');
    } finally {
      setBusy(false);
    }
  }

  async function remove(entry) {
    try {
      await apiFetch(`/admin/campaigns/${encodeURIComponent(campaignId)}/url-multi/${entry.url_id}`, token, { method: 'DELETE' });
      if (draft.url_id === entry.url_id) setDraft(ALT_URL_EMPTY);
      load();
    } catch (requestError) {
      if (requestError.status === 401) onLogout();
    }
  }

  return (
    <div className="alt-url-manager">
      <p className="connection-summary">
        Alternate URLs ({entries ? entries.length : '...'}) — fired in rank order when the disposition matches
        Statuses ('---ALL---' = any), the lead's list is in Lists (blank = all lists)
        {showTalkSec ? ' and talk time reached Min Talk Sec' : ''}. Every matching URL fires.
      </p>
      {entries && entries.length > 0 && (
        <DataTable
          columns={[
            { key: 'url_rank', label: 'Rank' },
            { key: 'url_statuses', label: 'Statuses' },
            { key: 'url_lists', label: 'Lists', render: (row) => row.url_lists || 'ALL' },
            ...(showTalkSec ? [{ key: 'url_call_length', label: 'Min Talk Sec' }] : []),
            { key: 'url_description', label: 'Description' },
            { key: 'url_address', label: 'URL', render: (row) => <span className="alt-url-cell" title={row.url_address}>{row.url_address}</span> },
            { key: 'active', label: 'Active', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
            {
              key: 'actions',
              label: '',
              render: (row) => (
                <RowActions>
                  <ManageButton onClick={() => setDraft({
                    url_id: row.url_id, active: row.active, url_rank: String(row.url_rank),
                    url_statuses: row.url_statuses || '---ALL---', url_lists: row.url_lists || '',
                    url_call_length: String(row.url_call_length || 0),
                    url_description: row.url_description || '', url_address: row.url_address || '',
                  })}>Edit</ManageButton>
                  <ManageButton onClick={() => remove(row)} icon={Trash2}>Delete</ManageButton>
                </RowActions>
              ),
            },
          ]}
          rows={entries.map((row) => ({ ...row, id: row.url_id }))}
          emptyLabel="No alternate URLs defined yet"
        />
      )}
      <div className="entity-form alt-url-form">
        <div className="field-grid">
          <label>
            <span>Rank</span>
            <input type="number" value={draft.url_rank} onChange={(event) => setDraft((d) => ({ ...d, url_rank: event.target.value }))} />
          </label>
          <label>
            <span>Statuses (space-separated, or ---ALL---)</span>
            <input type="text" value={draft.url_statuses} onChange={(event) => setDraft((d) => ({ ...d, url_statuses: event.target.value }))} />
          </label>
          <label>
            <span>Lists (space-separated IDs, blank = all)</span>
            <input type="text" value={draft.url_lists} onChange={(event) => setDraft((d) => ({ ...d, url_lists: event.target.value }))} />
          </label>
          {showTalkSec && (
            <label>
              <span>Min Talk Sec</span>
              <input type="number" value={draft.url_call_length} onChange={(event) => setDraft((d) => ({ ...d, url_call_length: event.target.value }))} />
            </label>
          )}
          <label>
            <span>Description</span>
            <input type="text" value={draft.url_description} onChange={(event) => setDraft((d) => ({ ...d, url_description: event.target.value }))} />
          </label>
          <label>
            <span>Active</span>
            <select value={draft.active} onChange={(event) => setDraft((d) => ({ ...d, active: event.target.value }))}>
              <option value="Y">Active</option>
              <option value="N">Inactive</option>
            </select>
          </label>
          <label className="wide-field">
            <span>URL</span>
            <textarea value={draft.url_address} onChange={(event) => setDraft((d) => ({ ...d, url_address: event.target.value }))} />
          </label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <div className="row-action-group">
          {draft.url_id && (
            <button type="button" className="secondary-action compact-action" onClick={() => setDraft(ALT_URL_EMPTY)}>
              Cancel Edit
            </button>
          )}
          <button type="button" className="primary-action compact-action" disabled={busy} onClick={saveDraft}>
            <Save size={14} aria-hidden="true" />
            {busy ? 'Saving' : draft.url_id ? `Update #${draft.url_id}` : 'Add Alternate URL'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CampaignUrlModal({ kind, campaignId, urls, token, onLogout, onSaved, onClose }) {
  const config = CAMPAIGN_URL_MODALS[kind];
  const [values, setValues] = useState(() => Object.fromEntries(config.fields.map(([key]) => [key, urls?.[key] || ''])));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  async function save() {
    setSaving(true);
    setError('');
    try {
      const payload = await apiFetch(`/admin/campaigns/${encodeURIComponent(campaignId)}/urls`, token, {
        method: 'POST',
        body: JSON.stringify(values),
      });
      onSaved(payload.urls || values);
      onClose();
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setError(requestError.status === 403 ? 'Not permitted to change campaign URLs' : 'The URLs were not saved');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" {...backdropCloseProps(onClose)}>
      <section className="modal-panel detail-modal" role="dialog" aria-modal="true" aria-label={config.title}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">Campaign {campaignId}</p>
            <h2>{config.title}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close" title="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="entity-form">
          <div className="field-grid">
            {config.fields.map(([key, label, urlType]) => {
              // In ALT mode the single-URL box disappears entirely — only the
              // alternate-URL manager shows, so there's no confusion about
              // which one the dialer uses. "Turn ALT Off" clears the field
              // back to single-URL mode (remember to Save).
              const isAlt = Boolean(urlType) && String(values[key] || '').trim().toUpperCase() === 'ALT';
              return (
                <div key={key} className="wide-field url-field-block">
                  {!isAlt && (
                    <label className="wide-field">
                      <span>{label}</span>
                      <textarea
                        value={values[key]}
                        onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
                      />
                    </label>
                  )}
                  {!isAlt && urlType && (
                    <p className="field-hint">
                      Type ALT above (and Save) to use multiple alternate URLs by status/list instead of a single URL.
                    </p>
                  )}
                  {isAlt && (
                    <div className="alt-mode-head">
                      <span>{label}: <strong>ALT</strong> — using the alternate URLs below</span>
                      <button
                        type="button"
                        className="secondary-action compact-action"
                        onClick={() => setValues((current) => ({ ...current, [key]: '' }))}
                      >
                        Turn ALT Off
                      </button>
                    </div>
                  )}
                  {isAlt && (
                    <AltUrlManager
                      campaignId={campaignId}
                      urlType={urlType}
                      showTalkSec={urlType === 'dispo'}
                      token={token}
                      onLogout={onLogout}
                    />
                  )}
                </div>
              );
            })}
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <span className="modal-actions-spacer" />
            <button type="button" className="secondary-action" onClick={onClose}>Cancel</button>
            <button type="button" className="primary-action" disabled={saving} onClick={save}>
              <Save size={18} aria-hidden="true" />
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}

// Stacked modal on the campaign Detail page: every eligible status (system +
// this campaign's own, minus the never-dialable INCALL/QUEUE/CBHOLD) with a
// green Active / red Inactive toggle. Each click applies IMMEDIATELY via the
// dial-status endpoint — same pattern as the Basic page's list toggles,
// replacing the legacy pick-one-then-save add/remove selects.
function CampaignDialStatusModal({ admin, campaignId, current, token, onLogout, onApply, onClose }) {
  const [busyStatus, setBusyStatus] = useState('');
  const [error, setError] = useState('');
  const selected = new Set(current);
  const excluded = new Set(['INCALL', 'QUEUE', 'CBHOLD']);
  const entries = [];
  const seen = new Set();
  const push = (item, source) => {
    const value = String(item?.status || '');
    if (!value || seen.has(value) || excluded.has(value)) return;
    seen.add(value);
    entries.push({ status: value, name: item.status_name || source });
  };
  (admin?.lookups?.statuses || []).forEach((item) => push(item, 'System'));
  (admin?.lookups?.campaignStatuses || [])
    .filter((item) => String(item.campaign_id || '') === String(campaignId || ''))
    .forEach((item) => push(item, 'Campaign'));
  entries.sort((a, b) => a.status.localeCompare(b.status));

  async function toggle(entry) {
    const next = selected.has(entry.status) ? 'N' : 'Y';
    setBusyStatus(entry.status);
    setError('');
    try {
      const payload = await apiFetch(`/admin/campaigns/${encodeURIComponent(campaignId)}/dial-status`, token, {
        method: 'POST',
        body: JSON.stringify({ status: entry.status, active: next }),
      });
      onApply(payload.dial_statuses || []);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setError(requestError.status === 403 ? 'Not permitted to change dial statuses' : `${entry.status} update failed`);
    } finally {
      setBusyStatus('');
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" {...backdropCloseProps(onClose)}>
      <section className="modal-panel detail-modal" role="dialog" aria-modal="true" aria-label="Manage Dial Statuses">
        <div className="modal-head">
          <div>
            <p className="eyebrow">Dialing</p>
            <h2>Dial Statuses — {campaignId}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close" title="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className="connection-summary">
          Green statuses are dialed by the hopper. Every click applies immediately — no separate save.
        </p>
        {error && <p className="form-error">{error}</p>}
        <div className="dial-status-grid">
          {entries.map((entry) => {
            const active = selected.has(entry.status);
            return (
              <div className="list-toggle-row" key={entry.status}>
                <span className="tool-picker-item dial-status-label">{entry.status} - {entry.name}</span>
                <button
                  type="button"
                  className={active ? 'row-action list-toggle-active' : 'row-action list-toggle-inactive'}
                  disabled={busyStatus === entry.status}
                  onClick={() => toggle(entry)}
                  title={active ? 'Click to stop dialing this status' : 'Click to dial this status'}
                >
                  {busyStatus === entry.status ? '...' : active ? 'Active' : 'Inactive'}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

// `basic` trims the strip to the operational trio (Hopper List, Real-Time
// Report, Log All Agents Out) — the report deep-links only show on Detail.
const REPORT_MODAL_TITLES = {
  hopper: 'Hopper List',
  realtime: 'Real-Time Report',
  outbound: 'Outbound Calling Report',
  statuslist: 'Status List Report',
  leadstatuses: 'Lead Statuses in Campaign',
  callbacks: 'CallBack Holds',
  adminlog: 'Admin Changes',
};
function CampaignConnections({ admin, campaignId, user, token, onNavigate, onLogout, basic = false, urls, onUrlsSaved, extraActions }) {
  const campaign = String(campaignId || '');
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  const [logoutState, setLogoutState] = useState('');
  // Hopper List / Real-Time Report open stacked on TOP of the campaign
  // modal instead of navigating away from it. The hopper modal's campaign
  // picker lives in the modal head, so its selection is owned here.
  const [reportModal, setReportModal] = useState(''); // '' | key of REPORT_MODAL_TITLES
  const [hopperCampaign, setHopperCampaign] = useState('');
  const [urlModal, setUrlModal] = useState(''); // '' | 'webform' | 'callurls'

  // Every report pill opens stacked on TOP of the campaign modal; closing it
  // lands back on the campaign. Each pill is a real anchor to the report's
  // hash route so right/ctrl/middle-click still opens the full page.
  const reportPill = (kind, hash) => ({
    href: `#/${hash}`,
    className: 'row-action',
    onClick: (event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      setReportModal(kind);
    },
  });

  async function logoutAgents() {
    if (!confirmingLogout) {
      setConfirmingLogout(true);
      return;
    }
    setLogoutState('working');
    try {
      const payload = await apiFetch(`/admin/campaigns/${encodeURIComponent(campaign)}/logout-agents`, token, { method: 'POST' });
      setLogoutState(`Logged out ${payload.loggedOut} agent${payload.loggedOut === 1 ? '' : 's'}`);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setLogoutState(requestError.status === 403 ? 'Not permitted' : 'Logout failed');
    } finally {
      setConfirmingLogout(false);
    }
  }

  if (!campaign) return null;

  return (
    <div className="campaign-tool-panel campaign-connections">
      <div className="campaign-tool-head">
        <div>
          <p className="eyebrow">Connections</p>
          <h3>Hopper, reports and live activity</h3>
        </div>
        <Compass size={20} aria-hidden="true" />
      </div>
      <div className="connection-actions">
        <button type="button" className="row-action" onClick={() => { setHopperCampaign(campaign); setReportModal('hopper'); }}>
          <Database size={15} aria-hidden="true" />
          Hopper List
        </button>
        <a {...reportPill('realtime', 'reportRealtimeMain')}>
          <Radio size={15} aria-hidden="true" />
          Real-Time Report
        </a>
        {!basic && (
          <>
            <a {...reportPill('outbound', 'reportOutboundCalling')}>
              <PhoneCall size={15} aria-hidden="true" />
              Outbound Calling Report
            </a>
            <a {...reportPill('statuslist', 'reportCampaignStatusList')}>
              <Activity size={15} aria-hidden="true" />
              Status List Report
            </a>
            <a {...reportPill('leadstatuses', 'reportListCampaignStatuses')}>
              <Gauge size={15} aria-hidden="true" />
              Lead Statuses in Campaign
            </a>
            <a {...reportPill('callbacks', 'reportCallbackHolds')}>
              <Clock3 size={15} aria-hidden="true" />
              CallBack Holds
            </a>
            <a {...reportPill('adminlog', 'reportAdminLog')}>
              <ShieldCheck size={15} aria-hidden="true" />
              Admin Changes
            </a>
            <button type="button" className="row-action" onClick={() => setUrlModal('webform')}>
              <ExternalLink size={15} aria-hidden="true" />
              Webform URLs
            </button>
            <button type="button" className="row-action" onClick={() => setUrlModal('callurls')}>
              <PhoneCall size={15} aria-hidden="true" />
              Call URLs
            </button>
            {(extraActions || []).map((item) => (
              <button key={item.label} type="button" className="row-action" onClick={item.onClick}>
                <ArrowRightLeft size={15} aria-hidden="true" />
                {item.label}
              </button>
            ))}
          </>
        )}
        {userCan(user, 'campaigns') && (
          <button
            type="button"
            className={confirmingLogout ? 'danger-action confirming compact-action' : 'row-action'}
            disabled={logoutState === 'working'}
            onClick={logoutAgents}
          >
            <LogOut size={15} aria-hidden="true" />
            {logoutState === 'working' ? 'Logging out' : confirmingLogout ? 'Confirm Logout All?' : 'Log All Agents Out'}
          </button>
        )}
        {logoutState && logoutState !== 'working' && <span className="connection-status">{logoutState}</span>}
      </div>
      {reportModal && (
        <div className="modal-backdrop" role="presentation" {...backdropCloseProps(() => setReportModal(''))}>
          <section className="modal-panel detail-modal report-modal" role="dialog" aria-modal="true" aria-label={REPORT_MODAL_TITLES[reportModal]}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">Report</p>
                <h2>{REPORT_MODAL_TITLES[reportModal]}</h2>
                {reportModal === 'hopper' && (
                  <p className="action-copy">Live snapshot of leads currently loaded in the campaign's dialing hopper. Refreshes every 5 seconds.</p>
                )}
              </div>
              {reportModal === 'hopper' && (
                <label className="hero-filter">
                  <span>Campaign</span>
                  <select value={hopperCampaign} onChange={(event) => setHopperCampaign(event.target.value)}>
                    <option value="">Select a campaign...</option>
                    {(admin?.campaigns || []).map((row) => (
                      <option key={row.campaign_id} value={row.campaign_id}>{row.campaign_id} - {row.campaign_name || row.campaign_id}</option>
                    ))}
                  </select>
                </label>
              )}
              <button type="button" className="icon-button" onClick={() => setReportModal('')} aria-label="Close" title="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {reportModal === 'hopper' && <HopperListReportView token={token} embedded campaignId={hopperCampaign} />}
            {reportModal === 'realtime' && <RealtimeMainReportView token={token} user={user} />}
            {reportModal === 'outbound' && <OutboundCallingReportView token={token} onLogout={onLogout} />}
            {reportModal === 'statuslist' && <CampaignStatusListReportView token={token} onLogout={onLogout} />}
            {reportModal === 'leadstatuses' && <ListCampaignStatusesReportView token={token} onLogout={onLogout} initialCampaignId={campaign} />}
            {reportModal === 'callbacks' && <CallbackHoldsReportView token={token} onLogout={onLogout} initialScope="campaign" initialId={campaign} onNavigate={onNavigate} />}
            {reportModal === 'adminlog' && <AdminChangeLogReportView token={token} onLogout={onLogout} initialSection="CAMPAIGNS" initialRecord={campaign} />}
          </section>
        </div>
      )}
      {urlModal && (
        <CampaignUrlModal
          kind={urlModal}
          campaignId={campaign}
          urls={urls}
          token={token}
          onLogout={onLogout}
          onSaved={(next) => onUrlsSaved?.(next)}
          onClose={() => setUrlModal('')}
        />
      )}
    </div>
  );
}

// Bottom section of the Manage Campaign modal: the campaign's lists with
// per-list activate/deactivate toggles, plus a per-status lead breakdown
// that counts ACTIVE lists only (server enforces the active filter).
function CampaignListsPanel({ admin, campaignId, user, token, onSwitchAction, onLogout }) {
  const campaign = String(campaignId || '');
  // Local overrides so a toggle reflects immediately; admin.lists refreshes
  // on its own 30s cycle and will agree by then.
  const [activeOverride, setActiveOverride] = useState({});
  const [toggling, setToggling] = useState('');
  const [toggleError, setToggleError] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const lists = (admin?.lists || [])
    .filter((row) => String(row.campaign_id || '') === campaign)
    .map((row) => ({ ...row, active: activeOverride[String(row.list_id)] ?? row.active }))
    .sort((a, b) => Number(a.list_id) - Number(b.list_id)); // smallest list ID first
  const activeLists = lists.filter((row) => row.active === 'Y').length;
  const [breakdown, setBreakdown] = useState(null);
  const canToggle = userCan(user, 'lists');

  useEffect(() => {
    let cancelled = false;
    setBreakdown(null);
    if (!campaign) return undefined;
    apiFetch(`/admin/campaigns/${encodeURIComponent(campaign)}/lead-statuses`, token)
      .then((payload) => {
        if (!cancelled) setBreakdown(payload);
      })
      .catch((requestError) => {
        if (requestError.status === 401) onLogout();
        if (!cancelled) setBreakdown({ statuses: [], totalLeads: 0, error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [campaign, token, onLogout, refreshKey]);

  async function toggleActive(row) {
    const next = row.active === 'Y' ? 'N' : 'Y';
    setToggling(String(row.list_id));
    setToggleError('');
    try {
      await apiFetch(`/admin/lists/${encodeURIComponent(row.list_id)}/active`, token, {
        method: 'POST',
        body: JSON.stringify({ active: next }),
      });
      setActiveOverride((current) => ({ ...current, [String(row.list_id)]: next }));
      setRefreshKey((current) => current + 1); // re-pull the active-only breakdown
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setToggleError(requestError.status === 403 ? 'Not permitted to change lists' : `List ${row.list_id} update failed`);
    } finally {
      setToggling('');
    }
  }

  if (!campaign) return null;

  return (
    <div className="campaign-tool-panel campaign-connections">
      <div className="campaign-tool-head">
        <div>
          <p className="eyebrow">Leads</p>
          <h3>Lists and lead statuses</h3>
        </div>
        <Database size={20} aria-hidden="true" />
      </div>
      <div className="connection-lists">
        <p className="connection-summary">
          {lists.length
            ? `${formatNumber(lists.length)} list${lists.length === 1 ? '' : 's'} in this campaign (${formatNumber(activeLists)} active)`
            : 'No lists point at this campaign yet'}
        </p>
        {toggleError && <p className="form-error">{toggleError}</p>}
        {lists.slice(0, 20).map((row) => (
          <div className="list-toggle-row" key={row.list_id}>
            <button
              type="button"
              className="tool-picker-item"
              onClick={() => userCan(user, 'lists') && onSwitchAction('lists', 'edit', row)}
              disabled={!userCan(user, 'lists')}
            >
              {row.list_id} - {row.list_name || 'Unnamed list'} ({formatNumber(row.lead_count)} leads{row.active === 'Y' ? ', active' : ''})
            </button>
            {canToggle && (
              /* Button shows the list's CURRENT state (green ACTIVE / red
                 DEACTIVATED); clicking flips it. */
              <button
                type="button"
                className={row.active === 'Y' ? 'row-action list-toggle-active' : 'row-action list-toggle-inactive'}
                disabled={toggling === String(row.list_id)}
                onClick={() => toggleActive(row)}
                title={row.active === 'Y' ? 'Click to deactivate this list' : 'Click to activate this list'}
              >
                {toggling === String(row.list_id) ? '...' : row.active === 'Y' ? 'Active' : 'Deactivated'}
              </button>
            )}
          </div>
        ))}
      </div>
      {breakdown?.statuses?.length > 0 && (
        <>
          <p className="connection-summary">
            Lead statuses across the active lists ({formatNumber(breakdown.totalLeads)} leads)
          </p>
          <DataTable
            columns={[
              { key: 'status', label: 'Status' },
              { key: 'status_name', label: 'Name' },
              { key: 'leads', label: 'Leads', render: (row) => formatNumber(row.leads) },
              {
                key: 'pct',
                label: '%',
                render: (row) => (breakdown.totalLeads ? `${((row.leads / breakdown.totalLeads) * 100).toFixed(1)}%` : ''),
              },
            ]}
            rows={breakdown.statuses}
            emptyLabel="No leads"
          />
        </>
      )}
      {breakdown && !breakdown.statuses?.length && lists.length > 0 && (
        <p className="connection-summary">{breakdown.error ? 'Lead status counts unavailable' : 'No leads in the active lists yet'}</p>
      )}
    </div>
  );
}

const RANK_OPTIONS = ['9', '8', '7', '6', '5', '4', '3', '2', '1', '0', '-1', '-2', '-3', '-4', '-5', '-6', '-7', '-8', '-9'];
const GRADE_OPTIONS = ['10', '9', '8', '7', '6', '5', '4', '3', '2', '1'];

// Mirrors legacy user modify (ADD=3) connections: stats/status/time-sheet
// report links (legacy pages until built natively) and the per-user
// campaign / in-group rank grids.
function UserConnections({ admin, userId, token, onLogout, onNavigate }) {
  const targetUser = String(userId || '');
  const [ranks, setRanks] = useState(null);
  const [saveState, setSaveState] = useState('');

  useEffect(() => {
    let cancelled = false;
    setRanks(null);
    setSaveState('');
    if (!targetUser) return undefined;
    apiFetch(`/admin/users/${encodeURIComponent(targetUser)}/ranks`, token)
      .then((payload) => {
        if (!cancelled) setRanks({ campaigns: payload.campaigns || [], ingroups: payload.ingroups || [] });
      })
      .catch((requestError) => {
        if (requestError.status === 401) onLogout();
        if (!cancelled) setRanks({ campaigns: [], ingroups: [], error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [targetUser, token, onLogout]);

  const legacyLinks = [];

  function setCampaignRank(campaignId, key, value) {
    setRanks((current) => ({
      ...current,
      campaigns: current.campaigns.map((row) => (row.campaign_id === campaignId ? { ...row, [key]: value } : row)),
    }));
  }

  function setGroupRank(groupId, key, value) {
    setRanks((current) => ({
      ...current,
      ingroups: current.ingroups.map((row) => (row.group_id === groupId ? { ...row, [key]: value } : row)),
    }));
  }

  async function saveRanks() {
    setSaveState('working');
    try {
      await apiFetch(`/admin/users/${encodeURIComponent(targetUser)}/ranks`, token, {
        method: 'POST',
        body: JSON.stringify({ campaigns: ranks.campaigns, ingroups: ranks.ingroups }),
      });
      setSaveState('Ranks saved');
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setSaveState(requestError.status === 403 ? 'Not permitted' : 'Save failed');
    }
  }

  if (!targetUser) return null;

  const hasRankRows = Boolean(ranks && (ranks.campaigns.length || ranks.ingroups.length));

  return (
    <div className="campaign-tool-panel campaign-connections">
      <div className="campaign-tool-head">
        <div>
          <p className="eyebrow">Connections</p>
          <h3>Reports and rank grids</h3>
        </div>
        <Compass size={20} aria-hidden="true" />
      </div>
      <div className="connection-actions">
        {legacyLinks.map(([label, href]) => (
          <a key={label} className="row-action" href={href} target="_blank" rel="noreferrer">
            <ExternalLink size={15} aria-hidden="true" />
            {label}
          </a>
        ))}
        <button type="button" className="row-action" onClick={() => onNavigate('reportUserStats', { user: targetUser })}>
          <Gauge size={15} aria-hidden="true" />
          User Stats / Status / Time Sheet
        </button>
        <button type="button" className="row-action" onClick={() => onNavigate('reportUserLogins')}>
          <ShieldCheck size={15} aria-hidden="true" />
          Logins Summary
        </button>
        <button type="button" className="row-action" onClick={() => onNavigate('reportCallbackHolds', { scope: 'user', id: targetUser })}>
          <Clock3 size={15} aria-hidden="true" />
          CallBack Holds
        </button>
        <button type="button" className="row-action" onClick={() => onNavigate('reportAdminLog', { section: 'USERS', record: targetUser })}>
          <ShieldCheck size={15} aria-hidden="true" />
          Admin Changes
        </button>
      </div>
      {hasRankRows && (
        <div className="rank-grids">
          {ranks.campaigns.length > 0 && (
            <div className="rank-grid">
              <p className="connection-summary">Campaign ranks</p>
              {ranks.campaigns.map((row) => (
                <div className="rank-row" key={row.campaign_id}>
                  <span>{row.campaign_id}</span>
                  <label>
                    Rank
                    <select value={String(row.campaign_rank ?? '0')} onChange={(event) => setCampaignRank(row.campaign_id, 'campaign_rank', event.target.value)}>
                      {ensureOption(RANK_OPTIONS, row.campaign_rank).map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>
                    Grade
                    <select value={String(row.campaign_grade ?? '1')} onChange={(event) => setCampaignRank(row.campaign_id, 'campaign_grade', event.target.value)}>
                      {ensureOption(GRADE_OPTIONS, row.campaign_grade).map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          )}
          {ranks.ingroups.length > 0 && (
            <div className="rank-grid">
              <p className="connection-summary">In-group ranks</p>
              {ranks.ingroups.map((row) => (
                <div className="rank-row" key={row.group_id}>
                  <span>{row.group_id}</span>
                  <label>
                    Rank
                    <select value={String(row.group_rank ?? '0')} onChange={(event) => setGroupRank(row.group_id, 'group_rank', event.target.value)}>
                      {ensureOption(RANK_OPTIONS, row.group_rank).map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>
                    Grade
                    <select value={String(row.group_grade ?? '1')} onChange={(event) => setGroupRank(row.group_id, 'group_grade', event.target.value)}>
                      {ensureOption(GRADE_OPTIONS, row.group_grade).map((value) => <option key={value} value={value}>{value}</option>)}
                    </select>
                  </label>
                  <label>
                    Daily Limit
                    <input
                      type="number"
                      min="-1"
                      value={row.daily_limit ?? -1}
                      onChange={(event) => setGroupRank(row.group_id, 'daily_limit', event.target.value)}
                    />
                  </label>
                </div>
              ))}
            </div>
          )}
          <div className="connection-actions">
            <button type="button" className="row-action" disabled={saveState === 'working'} onClick={saveRanks}>
              <Save size={15} aria-hidden="true" />
              {saveState === 'working' ? 'Saving' : 'Save Ranks'}
            </button>
            {saveState && saveState !== 'working' && <span className="connection-status">{saveState}</span>}
          </div>
        </div>
      )}
      {ranks && !hasRankRows && (
        <p className="connection-summary">No campaign or in-group rank rows yet - they appear after the agent logs in, or when set here in legacy.</p>
      )}
    </div>
  );
}

// Mirrors legacy list modify (ADD=311) connections: status/timezone/owner/rank
// breakdowns, list download, reset of called-status, and clear-list. Delete
// uses the modal's standard delete button.
function ListConnections({ admin, listId, user, token, onLogout, onSaved, onNavigate }) {
  const list = String(listId || '');
  const [stats, setStats] = useState(null);
  const [actionState, setActionState] = useState('');
  const [confirming, setConfirming] = useState('');

  useEffect(() => {
    let cancelled = false;
    setStats(null);
    setActionState('');
    setConfirming('');
    if (!list) return undefined;
    apiFetch(`/admin/lists/${encodeURIComponent(list)}/stats`, token)
      .then((payload) => {
        if (!cancelled) setStats(payload);
      })
      .catch((requestError) => {
        if (requestError.status === 401) onLogout();
        if (!cancelled) setStats({ error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [list, token, onLogout]);

  async function runAction(kind) {
    if (confirming !== kind) {
      setConfirming(kind);
      return;
    }
    setConfirming('');
    setActionState('working');
    try {
      const payload = await apiFetch(`/admin/lists/${encodeURIComponent(list)}/${kind}`, token, { method: 'POST' });
      if (payload.data) onSaved(payload.data);
      setActionState(kind === 'clear' ? `Cleared ${formatNumber(payload.cleared)} leads` : `Reset ${formatNumber(payload.reset)} leads`);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setActionState(requestError.status === 403 ? 'Not permitted' : 'Action failed');
    }
  }

  async function download() {
    setActionState('working');
    try {
      const response = await fetch(`${API_BASE}/admin/lists/${encodeURIComponent(list)}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw Object.assign(new Error('download_failed'), { status: response.status });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `list_${list}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setActionState('Download started');
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setActionState(requestError.status === 403 ? 'Not permitted' : 'Download failed');
    }
  }

  if (!list) return null;

  const canClear = Number(user?.userLevel || 0) >= 9;
  const statusTotal = (stats?.statuses || []).reduce((sum, row) => sum + Number(row.total || 0), 0);

  return (
    <div className="campaign-tool-panel campaign-connections">
      <div className="campaign-tool-head">
        <div>
          <p className="eyebrow">Connections</p>
          <h3>List breakdowns and actions</h3>
        </div>
        <Database size={20} aria-hidden="true" />
      </div>
      {stats && !stats.error && (
        <div className="rank-grids">
          <div className="rank-grid">
            <p className="connection-summary">Statuses in this list ({formatNumber(statusTotal)} leads)</p>
            {(stats.statuses || []).slice(0, 12).map((row) => (
              <div className="rank-row" key={row.status}>
                <span>{row.status}</span>
                <label>Called {formatNumber(row.called)}</label>
                <label>Not Called {formatNumber(row.not_called)}</label>
                <label>Penetration {statusTotal ? Math.round((Number(row.called) / Number(row.total || 1)) * 100) : 0}%</label>
              </div>
            ))}
          </div>
          <div className="rank-grid">
            <p className="connection-summary">Time zones (GMT offset now: called / not called)</p>
            <div className="connection-actions">
              {(stats.timezones || []).slice(0, 14).map((row) => (
                <span className="connection-status" key={String(row.gmt_offset_now)}>
                  {row.gmt_offset_now}: {formatNumber(row.called)}/{formatNumber(row.not_called)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="connection-actions">
        {Boolean(user?.downloadLists || Number(user?.userLevel || 0) >= 9) && (
          <button type="button" className="row-action" disabled={actionState === 'working'} onClick={download}>
            <FileText size={15} aria-hidden="true" />
            Download List CSV
          </button>
        )}
        <button
          type="button"
          className={confirming === 'reset' ? 'danger-action confirming compact-action' : 'row-action'}
          disabled={actionState === 'working'}
          onClick={() => runAction('reset')}
        >
          <RefreshCcw size={15} aria-hidden="true" />
          {confirming === 'reset' ? 'Confirm Reset Called-Status?' : 'Reset Called Status'}
        </button>
        {canClear && (
          <button
            type="button"
            className={confirming === 'clear' ? 'danger-action confirming compact-action' : 'row-action'}
            disabled={actionState === 'working'}
            onClick={() => runAction('clear')}
          >
            <Trash2 size={15} aria-hidden="true" />
            {confirming === 'clear' ? 'Confirm Clear ALL Leads?' : 'Clear List'}
          </button>
        )}
        <button type="button" className="row-action" onClick={() => onNavigate('reportCallbackHolds', { scope: 'list', id: list })}>
          <Clock3 size={15} aria-hidden="true" />
          CallBack Holds
        </button>
        <button type="button" className="row-action" onClick={() => onNavigate('reportAdminLog', { section: 'LISTS', record: list })}>
          <ShieldCheck size={15} aria-hidden="true" />
          Admin Changes
        </button>
        {actionState && actionState !== 'working' && <span className="connection-status">{actionState}</span>}
      </div>
    </div>
  );
}

// Mirrors legacy in-group modify (ADD=3111) cross-references: agent rank
// grid, DIDs / call menus / campaigns pointing at this group.
function InboundGroupConnections({ admin, groupId, user, token, onLogout, onSwitchAction, onNavigate }) {
  const group = String(groupId || '');
  const [data, setData] = useState(null);
  const [saveState, setSaveState] = useState('');

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setSaveState('');
    if (!group) return undefined;
    apiFetch(`/admin/inbound/${encodeURIComponent(group)}/connections`, token)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((requestError) => {
        if (requestError.status === 401) onLogout();
        if (!cancelled) setData({ error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [group, token, onLogout]);

  function setAgent(agentUser, key, value) {
    setData((current) => ({
      ...current,
      agents: current.agents.map((row) => (row.user === agentUser ? { ...row, [key]: value } : row)),
    }));
  }

  async function saveRanks() {
    setSaveState('working');
    try {
      await apiFetch(`/admin/inbound/${encodeURIComponent(group)}/agent-ranks`, token, {
        method: 'POST',
        body: JSON.stringify({ agents: data.agents }),
      });
      setSaveState('Ranks saved');
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setSaveState(requestError.status === 403 ? 'Not permitted' : 'Save failed');
    }
  }

  if (!group || !data || data.error) return null;

  const referenceLists = [
    ['DIDs routing here', data.dids || [], (row) => `${row.did_pattern}${row.did_description ? ` - ${row.did_description}` : ''}${row.did_active === 'Y' ? '' : ' (inactive)'}`],
    ['Call menus routing here', data.callMenus || [], (row) => `${row.menu_id} (option ${row.option_value})`],
    ['Campaigns using this group', data.campaignsUsing || [], (row) => `${row.campaign_id} - ${row.campaign_name || ''}`],
    ['Campaigns allowing this group', data.campaignsAllowing || [], (row) => `${row.campaign_id} - ${row.campaign_name || ''}`],
  ];

  return (
    <div className="campaign-tool-panel campaign-connections">
      <div className="campaign-tool-head">
        <div>
          <p className="eyebrow">Connections</p>
          <h3>{formatNumber(data.liveAgents)} agent{data.liveAgents === 1 ? '' : 's'} live in this group right now</h3>
        </div>
        <Headphones size={20} aria-hidden="true" />
      </div>
      {!(data.campaignsAllowing || []).length && (
        <p className="connection-summary">Warning: not set as allowed in any campaign's closer/blended in-groups - agents cannot take calls from it.</p>
      )}
      {(data.agents || []).length > 0 && (
        <div className="rank-grid">
          <p className="connection-summary">Agent ranks for this in-group</p>
          {data.agents.slice(0, 30).map((row) => (
            <div className="rank-row" key={row.user}>
              <span>{row.user}{row.full_name ? ` - ${row.full_name}` : ''}</span>
              <label>
                Rank
                <select value={String(row.group_rank ?? '0')} onChange={(event) => setAgent(row.user, 'group_rank', event.target.value)}>
                  {ensureOption(RANK_OPTIONS, row.group_rank).map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Grade
                <select value={String(row.group_grade ?? '1')} onChange={(event) => setAgent(row.user, 'group_grade', event.target.value)}>
                  {ensureOption(GRADE_OPTIONS, row.group_grade).map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </label>
              <label>
                Daily Limit
                <input type="number" min="-1" value={row.daily_limit ?? -1} onChange={(event) => setAgent(row.user, 'daily_limit', event.target.value)} />
              </label>
              <label>Calls Today {formatNumber(row.calls_today)}</label>
            </div>
          ))}
          <div className="connection-actions">
            <button type="button" className="row-action" disabled={saveState === 'working'} onClick={saveRanks}>
              <Save size={15} aria-hidden="true" />
              {saveState === 'working' ? 'Saving' : 'Save Agent Ranks'}
            </button>
            {saveState && saveState !== 'working' && <span className="connection-status">{saveState}</span>}
          </div>
        </div>
      )}
      <div className="rank-grids">
        {referenceLists.map(([title, items, label]) => (
          <div className="connection-lists" key={title}>
            <p className="connection-summary">{title}{items.length ? ` (${formatNumber(items.length)})` : ': none'}</p>
            {items.slice(0, 8).map((row, index) => (
              <span className="connection-status" key={`${title}-${index}`}>{label(row)}</span>
            ))}
          </div>
        ))}
      </div>
      <div className="connection-actions">
        <a className="row-action" href={`/vicidial/AST_CLOSERstats_v2.php?group=${encodeURIComponent(group)}`} target="_blank" rel="noreferrer">
          <ExternalLink size={15} aria-hidden="true" />
          In-Group Report
        </a>
        <button type="button" className="row-action" onClick={() => onNavigate('reportAdminLog', { section: 'INGROUPS', record: group })}>
          <ShieldCheck size={15} aria-hidden="true" />
          Admin Changes
        </button>
      </div>
    </div>
  );
}

// Mirrors legacy script modify (ADD=3111111): preview plus campaigns /
// in-groups / list overrides / user-group overrides using the script.
function ScriptConnections({ scriptId, scriptText, token, onLogout, onNavigate }) {
  const script = String(scriptId || '');
  const [data, setData] = useState(null);
  const [previewOpen, setPreviewOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    if (!script) return undefined;
    apiFetch(`/admin/scripts/${encodeURIComponent(script)}/connections`, token)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((requestError) => {
        if (requestError.status === 401) onLogout();
        if (!cancelled) setData({ error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [script, token, onLogout]);

  if (!script || !data || data.error) return null;

  const referenceLists = [
    ['Campaigns using this script', data.campaigns || [], (row) => `${row.campaign_id} - ${row.campaign_name || ''}`],
    ['In-groups using this script', data.ingroups || [], (row) => `${row.group_id} - ${row.group_name || ''}`],
    ['List overrides using this script', data.lists || [], (row) => `${row.list_id} - ${row.list_name || ''}`],
    ['User group overrides using this script', data.userGroups || [], (row) => `${row.user_group} - ${row.group_name || ''}`],
  ];

  return (
    <div className="campaign-tool-panel campaign-connections">
      <div className="campaign-tool-head">
        <div>
          <p className="eyebrow">Connections</p>
          <h3>Where this script is used</h3>
        </div>
        <FileText size={20} aria-hidden="true" />
      </div>
      <div className="rank-grids">
        {referenceLists.map(([title, items, label]) => (
          <div className="connection-lists" key={title}>
            <p className="connection-summary">{title}{items.length ? ` (${formatNumber(items.length)})` : ': none'}</p>
            {items.slice(0, 8).map((row, index) => (
              <span className="connection-status" key={`${title}-${index}`}>{label(row)}</span>
            ))}
          </div>
        ))}
      </div>
      <div className="connection-actions">
        <button type="button" className="row-action" onClick={() => setPreviewOpen((open) => !open)}>
          <Search size={15} aria-hidden="true" />
          {previewOpen ? 'Hide Preview' : 'Preview Script'}
        </button>
        <button type="button" className="row-action" onClick={() => onNavigate('reportAdminLog', { section: 'SCRIPTS', record: script })}>
          <ShieldCheck size={15} aria-hidden="true" />
          Admin Changes
        </button>
      </div>
      {previewOpen && (
        <iframe
          className="script-preview-frame"
          title="Script preview"
          sandbox=""
          srcDoc={`<body style="font-family:sans-serif;background:#fff;color:#111;padding:12px">${scriptText || ''}</body>`}
        />
      )}
    </div>
  );
}

// Generic small cross-reference panel used by entities whose legacy modify
// page just lists "X USING THIS Y" tables plus an admin-changes link.
function ReferencePanel({ title, lists, legacyLinks, actions }) {
  return (
    <div className="campaign-tool-panel campaign-connections">
      <div className="campaign-tool-head">
        <div>
          <p className="eyebrow">Connections</p>
          <h3>{title}</h3>
        </div>
        <Compass size={20} aria-hidden="true" />
      </div>
      <div className="rank-grids">
        {lists.map(([listTitle, items, label]) => (
          <div className="connection-lists" key={listTitle}>
            <p className="connection-summary">{listTitle}{items.length ? ` (${formatNumber(items.length)})` : ': none'}</p>
            {items.slice(0, 8).map((row, index) => (
              <span className="connection-status" key={`${listTitle}-${index}`}>{label(row)}</span>
            ))}
          </div>
        ))}
      </div>
      {Boolean(legacyLinks?.length || actions?.length) && (
        <div className="connection-actions">
          {(legacyLinks || []).map(([label, href]) => (
            <a key={label} className="row-action" href={href} target="_blank" rel="noreferrer">
              <ExternalLink size={15} aria-hidden="true" />
              {label}
            </a>
          ))}
          {(actions || []).map(([label, onClick]) => (
            <button key={label} type="button" className="row-action" onClick={onClick}>
              <ShieldCheck size={15} aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function LeadFilterConnections({ filterId, token, onLogout, onNavigate }) {
  const filter = String(filterId || '');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    if (!filter) return undefined;
    apiFetch(`/admin/lead-filters/${encodeURIComponent(filter)}/connections`, token)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((requestError) => {
        if (requestError.status === 401) onLogout();
        if (!cancelled) setData({ error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [filter, token, onLogout]);

  const [testResult, setTestResult] = useState('');

  async function runFilterTest() {
    setTestResult('testing...');
    try {
      const payload = await apiFetch(`/admin/lead-filters/${encodeURIComponent(filter)}/test`, token);
      setTestResult(payload.empty_filter ? 'Filter SQL is empty' : `${Number(payload.matches).toLocaleString()} leads match this filter`);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setTestResult(requestError.message === 'filter_sql_invalid' ? 'Filter SQL is invalid' : 'Filter test failed');
    }
  }

  if (!filter || !data || data.error) return null;

  return (
    <>
      <ReferencePanel
        title="Where this filter is used"
        lists={[
          ['Campaigns using this filter', data.campaigns || [], (row) => `${row.campaign_id} - ${row.campaign_name || ''}`],
          ['Users using this filter', data.users || [], (row) => `${row.user} - ${row.full_name || ''}`],
        ]}
        actions={[
          ['Admin Changes', () => onNavigate('reportAdminLog', { section: 'FILTERS', record: filter })],
        ]}
      />
      <div className="connection-actions">
        <button type="button" className="row-action" onClick={runFilterTest}>Test Filter (count matching leads)</button>
        {testResult && <span className="connection-status">{testResult}</span>}
      </div>
    </>
  );
}

function UserGroupConnections({ groupId, token, user, onLogout, onSwitchAction, admin, onNavigate }) {
  const group = String(groupId || '');
  const [data, setData] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    if (!group) return undefined;
    apiFetch(`/admin/user-groups/${encodeURIComponent(group)}/connections`, token)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((requestError) => {
        if (requestError.status === 401) onLogout();
        if (!cancelled) setData({ error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [group, token, onLogout]);

  if (!group || !data || data.error) return null;

  const users = data.users || [];

  return (
    <div className="campaign-tool-panel campaign-connections">
      <div className="campaign-tool-head">
        <div>
          <p className="eyebrow">Connections</p>
          <h3>Users in this group</h3>
        </div>
        <Users size={20} aria-hidden="true" />
      </div>
      <div className="connection-lists">
        <p className="connection-summary">{users.length ? `${formatNumber(users.length)} user${users.length === 1 ? '' : 's'}` : 'No users in this group'}</p>
        {users.slice(0, 12).map((row) => {
          const userRow = (admin?.users || []).find((item) => item.user === row.user);
          return (
            <button
              type="button"
              className="tool-picker-item"
              key={row.user}
              disabled={!userCan(user, 'users') || !userRow}
              onClick={() => userRow && onSwitchAction('users', 'edit', userRow)}
            >
              {row.user} - {row.full_name || ''} (L{row.user_level}{row.active === 'Y' ? '' : ', inactive'})
            </button>
          );
        })}
      </div>
      <div className="connection-actions">
        <button type="button" className="row-action" onClick={() => onNavigate('reportCallbackHolds', { scope: 'user_group', id: group })}>
          <Clock3 size={15} aria-hidden="true" />
          CallBack Holds
        </button>
        <button type="button" className="row-action" onClick={() => onNavigate('reportAdminLog', { section: 'USERGROUPS', record: group })}>
          <ShieldCheck size={15} aria-hidden="true" />
          Admin Changes
        </button>
      </div>
    </div>
  );
}

// Phone delete needs the composite key (extension + server_ip), so it gets a
// dedicated panel instead of the generic modal delete button.
function PhoneConnections({ extension, serverIp, user, token, onLogout, onSaved, onClose, onNavigate }) {
  const ext = String(extension || '');
  const ip = String(serverIp || '');
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState('');

  async function deletePhone() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setState('working');
    try {
      const payload = await apiFetch(`/admin/phones/${encodeURIComponent(ext)}?server_ip=${encodeURIComponent(ip)}`, token, { method: 'DELETE' });
      onSaved(payload.data);
      onClose();
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setState(requestError.status === 403 ? 'Not permitted' : 'Delete failed');
      setConfirming(false);
    }
  }

  const canDeletePhone = Number(user?.userLevel || 0) >= 9 || Boolean(user?.astDeletePhones);
  if (!ext || !ip) return null;

  return (
    <div className="campaign-tool-panel campaign-connections">
      <div className="connection-actions">
        {canDeletePhone && (
          <button
            type="button"
            className={confirming ? 'danger-action confirming compact-action' : 'row-action'}
            disabled={state === 'working'}
            onClick={deletePhone}
          >
            <Trash2 size={15} aria-hidden="true" />
            {state === 'working' ? 'Deleting' : confirming ? `Confirm Delete ${ext}@${ip}?` : 'Delete Phone'}
          </button>
        )}
        <button type="button" className="row-action" onClick={() => onNavigate('reportAdminLog', { section: 'PHONES', record: ext })}>
          <ShieldCheck size={15} aria-hidden="true" />
          Admin Changes
        </button>
        {state && state !== 'working' && <span className="connection-status">{state}</span>}
      </div>
    </div>
  );
}

// Server delete needs the composite key (server_id + server_ip).
function ServerConnections({ serverId, serverIp, user, token, onLogout, onSaved, onClose, onNavigate }) {
  const id = String(serverId || '');
  const ip = String(serverIp || '');
  const [confirming, setConfirming] = useState(false);
  const [state, setState] = useState('');

  async function deleteServer() {
    if (!confirming) {
      setConfirming(true);
      return;
    }
    setState('working');
    try {
      const payload = await apiFetch(`/admin/servers/${encodeURIComponent(id)}?server_ip=${encodeURIComponent(ip)}`, token, { method: 'DELETE' });
      onSaved(payload.data);
      onClose();
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setState(requestError.status === 403 ? 'Not permitted' : 'Delete failed');
      setConfirming(false);
    }
  }

  const canDeleteServer = Number(user?.userLevel || 0) >= 9 || (Boolean(user?.astDeletePhones) && Boolean(user?.modifyServers));
  if (!id || !ip) return null;

  return (
    <div className="campaign-tool-panel campaign-connections">
      <div className="connection-actions">
        {canDeleteServer && (
          <button
            type="button"
            className={confirming ? 'danger-action confirming compact-action' : 'row-action'}
            disabled={state === 'working'}
            onClick={deleteServer}
          >
            <Trash2 size={15} aria-hidden="true" />
            {state === 'working' ? 'Deleting' : confirming ? `Confirm Delete ${id}@${ip}?` : 'Delete Server'}
          </button>
        )}
        <button type="button" className="row-action" onClick={() => onNavigate('reportAdminLog', { section: 'SERVERS', record: id })}>
          <ShieldCheck size={15} aria-hidden="true" />
          Admin Changes
        </button>
        {state && state !== 'working' && <span className="connection-status">{state}</span>}
      </div>
    </div>
  );
}

// Shared fetch hook for the simple connections endpoints.
function useConnections(path, token, onLogout) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    setData(null);
    if (!path) return undefined;
    apiFetch(path, token)
      .then((payload) => {
        if (!cancelled) setData(payload);
      })
      .catch((requestError) => {
        if (requestError.status === 401) onLogout();
        if (!cancelled) setData({ error: true });
      });
    return () => {
      cancelled = true;
    };
  }, [path, token, onLogout]);
  return data;
}

function DidConnections({ didId, token, onLogout, onNavigate }) {
  const id = String(didId || '');
  const data = useConnections(id ? `/admin/dids/${encodeURIComponent(id)}/connections` : '', token, onLogout);
  if (!id || !data || data.error) return null;
  return (
    <ReferencePanel
      title="Where this DID is used"
      lists={[
        ['Call menus routing to this DID', data.callMenus || [], (row) => `${row.menu_id} - ${row.menu_name || ''}`],
        ['Campaigns using as CallerID', data.campaigns || [], (row) => `${row.campaign_id} - ${row.campaign_name || ''}`],
        ['Campaign AC-CIDs using this DID', data.acCids || [], (row) => `${row.campaign_id} - ${row.campaign_name || ''}`],
        ['In-groups using as dial CID', data.ingroups || [], (row) => `${row.group_id} - ${row.group_name || ''}`],
        ['Lists using as CID override', data.lists || [], (row) => `${row.list_id} - ${row.list_name || ''}`],
      ]}
      actions={[
        ['Admin Changes', () => onNavigate('reportAdminLog', { section: 'DIDS', record: id })],
      ]}
    />
  );
}

function CallMenuConnections({ menuId, token, onLogout, onNavigate }) {
  const id = String(menuId || '');
  const data = useConnections(id ? `/admin/call-menus/${encodeURIComponent(id)}/connections` : '', token, onLogout);
  if (!id || !data || data.error) return null;
  return (
    <ReferencePanel
      title="Where this call menu is used"
      lists={[
        ['DIDs routing here', data.dids || [], (row) => `${row.did_pattern}${row.did_description ? ` - ${row.did_description}` : ''}`],
        ['Call menus routing here', data.callMenus || [], (row) => `${row.menu_id} - ${row.menu_name || ''}`],
        ['Campaigns using this menu', data.campaigns || [], (row) => `${row.campaign_id} - ${row.campaign_name || ''}`],
        ['In-groups using this menu', data.ingroups || [], (row) => `${row.group_id} - ${row.group_name || ''}`],
      ]}
      actions={[
        ['Admin Changes', () => onNavigate('reportAdminLog', { section: 'CALLMENUS', record: id })],
      ]}
    />
  );
}

// Audio prompt fields (legacy audio chooser): the field label is a clickable
// link that opens a filterable list of audio files (central store + asterisk
// sounds dir); picking one fills the free-text input with the extension-less
// sound name. Values stay hand-editable (pipe-separated lists etc).
// Module-level cache so opening several audio fields in one editor doesn't
// refetch; 60s TTL so files uploaded via the Audio Store show up without a
// full page reload.
let audioChoicesCache = null;
let audioChoicesCacheAt = 0;
const AUDIO_CHOICES_TTL_MS = 60000;

function AudioChooserField({ field, value, token, onChange }) {
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState(audioChoicesCache);
  const [filter, setFilter] = useState('');

  async function toggle(event) {
    event.preventDefault();
    const next = !open;
    setOpen(next);
    if (next && (!audioChoicesCache || Date.now() - audioChoicesCacheAt > AUDIO_CHOICES_TTL_MS)) {
      try {
        const payload = await apiFetch('/admin/audio-files', token);
        audioChoicesCache = payload.files || [];
        audioChoicesCacheAt = Date.now();
        setFiles(audioChoicesCache);
      } catch {
        setFiles([]);
      }
    }
  }

  const query = filter.trim().toLowerCase();
  const list = (files || []).filter((file) => !query || file.name.toLowerCase().includes(query));

  return (
    <label className={field.wide ? 'wide-field' : ''}>
      <span>
        <button type="button" className="audio-chooser-link" title="Open the audio file chooser" onClick={toggle}>
          {field.label} {'♪'}
        </button>
      </span>
      <input
        value={value ?? ''}
        disabled={field.disabled}
        onChange={(event) => onChange(event.target.value)}
      />
      {open && (
        <div className="audio-chooser-list">
          <input
            placeholder={`Filter ${formatNumber((files || []).length)} audio files`}
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <div className="audio-chooser-items">
            {files === null && <em>Loading audio files</em>}
            {files !== null && !list.length && <em>No matching audio files (upload via Media &amp; Tools / Audio Store)</em>}
            {list.slice(0, 200).map((file) => (
              <button
                type="button"
                key={file.name}
                onClick={() => {
                  onChange(file.name);
                  setOpen(false);
                }}
              >
                {file.name}{file.source === 'store' ? ' *' : ''}
              </button>
            ))}
            {list.length > 200 && <em>{formatNumber(list.length - 200)} more - keep typing to narrow down</em>}
          </div>
        </div>
      )}
    </label>
  );
}

// Sitewide modal behavior: clicking the dimmed area outside the panel closes
// the modal. mousedown + target check so a press that STARTS inside the panel
// (e.g. a text-selection drag that ends over the backdrop) never closes it.
function backdropCloseProps(onClose) {
  return {
    onMouseDown: (event) => {
      if (event.target === event.currentTarget) onClose();
    },
  };
}

function ActionModal({ action, admin, token, user, onClose, onSaved, onLogout, onSwitchAction, onNavigate }) {
  const [form, setForm] = useState(() => ({ ...actionDefaults(action.entity, admin), ...(action.row || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [dialStatusModal, setDialStatusModal] = useState(false);
  const [sectionModal, setSectionModal] = useState('');
  // Campaign-scoped tools (Statuses, Hotkeys, Lead Recycle, Pause Codes,
  // List Mixes) and the lists panel open their edit/create modal STACKED on
  // top of this one, so closing it lands back on the campaign instead of
  // replacing it. One level deep only — the nested modal switches normally.
  const [subAction, setSubAction] = useState(null);
  const stackAction = (entity, subMode, row = null) => setSubAction({ entity, mode: subMode, row });
  const mode = action.mode || 'create';
  const fields = actionFields(action.entity, mode, admin, form, user);
  const label = entityLabel(action.entity);
  const isEdit = mode === 'edit' || mode === 'editDetail';
  const isDetail = mode === 'editDetail';
  const isCopy = action.entity === 'campaignCopy';

  // Sections pulled OUT of the main Detail form into their own pill-button
  // modal (opened from the Connections strip). The fields keep editing the
  // same form state; the section modal's Save runs the normal campaign save
  // without closing the Detail modal.
  const PILL_SECTIONS = isDetail && action.entity === 'campaigns' ? ['Transfers and 3-Way Calls'] : [];
  const mainFields = [];
  const pillFields = {};
  let pillSection = null;
  for (const field of fields) {
    if (field.section) {
      pillSection = PILL_SECTIONS.includes(field.section) ? field.section : null;
      if (!pillSection) mainFields.push(field);
      continue;
    }
    if (pillSection) (pillFields[pillSection] = pillFields[pillSection] || []).push(field);
    else mainFields.push(field);
  }

  // Reset only when a different record/action is opened. Depending on `admin`
  // here wiped in-progress edits every time the 30s background refresh landed.
  useEffect(() => {
    setForm({ ...actionDefaults(action.entity, admin), ...(action.row || {}), pass: '' });
    setError('');
    setSubAction(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [action]);

  // closeAfter=false: used by the section pill modal's Save, which persists
  // the whole form but keeps the Detail modal open underneath.
  async function persist(closeAfter = true) {
    setSaving(true);
    setError('');

    const id = entityId(action.entity, form);
    const pathEntity = entityPath(action.entity);
    const path = isCopy
      ? '/admin/campaigns/copy'
      : isEdit
        ? `/admin/${pathEntity}/${encodeURIComponent(id)}`
        : `/admin/${pathEntity}`;
    const body = { ...form, _detailMode: isDetail };

    try {
      const payload = await apiFetch(path, token, {
        method: isEdit ? 'PUT' : 'POST',
        body: JSON.stringify(body),
      });
      onSaved(payload.data);
      if (closeAfter) onClose();
      return true;
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return false;
      }
      setError(requestError.status === 403 ? 'Your user does not have permission for this change' : 'The change was not saved');
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    await persist(true);
  }

  async function handleDelete() {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      return;
    }
    setDeleting(true);
    setError('');
    const id = entityId(action.entity, form);
    const pathEntity = entityPath(action.entity);
    // Campaign-scoped tool rows need the campaign on the DELETE URL — the
    // id alone (status/hotkey/pause code...) repeats across campaigns.
    const campaignQuery = CAMPAIGN_SCOPED_TOOL_ENTITIES.has(action.entity)
      ? `?campaign_id=${encodeURIComponent(form.campaign_id || '')}`
      : '';
    try {
      const payload = await apiFetch(`/admin/${pathEntity}/${encodeURIComponent(id)}${campaignQuery}`, token, { method: 'DELETE' });
      onSaved(payload.data);
      onClose();
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setError(requestError.status === 403 ? 'Your user does not have permission to delete this' : 'The delete failed');
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  }

  const isOwnUser = action.entity === 'users' && String(form.user || '') === String(user?.user || '');
  // Restricted managers (no Admin nav access) cannot delete users at all.
  const userDeleteBlocked = action.entity === 'users' && !hasAdminNav(user);
  const isOwnGroup = action.entity === 'userGroups' && String(form.user_group || '') === String(user?.userGroup || '');
  // Campaign BASIC is operational-only (read-only except Auto Dial Level),
  // so its Delete moved to the campaign DETAIL modal — the only entity where
  // Detail carries Delete, because Basic was the only delete path.
  const deleteMode = action.entity === 'campaigns' ? isDetail : !isDetail;
  const canDelete = isEdit && deleteMode && userCanDelete(user, action.entity) && !isOwnUser && !isOwnGroup && !userDeleteBlocked;

  // One renderer for every form field, shared by the main form and the
  // section pill modals so both edit the same form state identically.
  const renderField = (field) => (
    field.section ? (
      <div key={field.section} className="form-section">{field.section}</div>
    ) : field.type === 'audio' ? (
      <AudioChooserField
        key={field.key}
        field={field}
        value={form[field.key]}
        token={token}
        onChange={(nextValue) => setForm((current) => ({ ...current, [field.key]: nextValue }))}
      />
    ) : (
      <label key={field.key} className={field.wide ? 'wide-field' : ''}>
        <span>{field.label}</span>
        {field.type === 'statusList' ? (
          <div className="status-chip-list">
            {(field.statuses || []).map((status) => (
              <span key={status}>{status}</span>
            ))}
            {!(field.statuses || []).length && <em>No dial statuses selected</em>}
            {field.key === '_dial_status_list' && action.entity === 'campaigns' && (
              <button type="button" className="row-action" onClick={() => setDialStatusModal(true)}>
                <SlidersHorizontal size={14} aria-hidden="true" />
                Manage Dial Statuses
              </button>
            )}
          </div>
        ) : field.type === 'multiSelectText' ? (
          <select
            multiple
            value={field.values ? field.values(form[field.key]) : scopeValues(form[field.key], field.allValue)}
            disabled={field.disabled}
            onChange={(event) => {
              const values = Array.from(event.target.selectedOptions).map((option) => option.value);
              const nextValue = field.serialize ? field.serialize(values) : scopeText(values, field.allValue);
              setForm((current) => ({ ...current, [field.key]: nextValue }));
            }}
          >
            {(field.options || []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : field.type === 'checkboxGroupText' ? (
          <CheckboxTextGroup
            field={field}
            value={form[field.key]}
            onChange={(nextValue) => setForm((current) => ({ ...current, [field.key]: nextValue }))}
          />
        ) : field.type === 'select' ? (
          <select
            value={form[field.key] ?? ''}
            disabled={field.disabled}
            onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
          >
            {(field.options || []).map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        ) : field.type === 'textarea' ? (
          <textarea
            value={form[field.key] ?? ''}
            disabled={field.disabled}
            onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
          />
        ) : (
          <input
            type={field.type || 'text'}
            step={field.step}
            value={form[field.key] ?? ''}
            disabled={field.disabled}
            onChange={(event) => setForm((current) => ({ ...current, [field.key]: event.target.value }))}
          />
        )}
      </label>
    )
  );

  return (
    <div className="modal-backdrop" role="presentation" {...backdropCloseProps(onClose)}>
      <section className={`modal-panel ${isDetail ? 'detail-modal' : ''}`} role="dialog" aria-modal="true" aria-label={`${isEdit ? 'Manage' : 'Add'} ${label}`}>
        <div className="modal-head">
          <div>
            <p className="eyebrow">{isDetail ? 'Detail' : isEdit ? 'Basic' : isCopy ? 'Copy' : 'Create'}</p>
            <h2>{isEdit ? `Manage ${label}` : isCopy ? 'Copy Campaign' : `Add ${label}`}</h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close" title="Close">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {isDetail && action.entity === 'campaigns' && (
          <CampaignScopedTools
            admin={admin}
            campaignId={form.campaign_id}
            user={user}
            onAction={stackAction}
          />
        )}

        {isEdit && action.entity === 'dids' && (
          <DidConnections didId={form.did_id} token={token} onLogout={onLogout} onNavigate={onNavigate} />
        )}

        {isEdit && action.entity === 'callMenus' && (
          <CallMenuConnections menuId={form.menu_id} token={token} onLogout={onLogout} onNavigate={onNavigate} />
        )}

        {isEdit && action.entity === 'servers' && (
          <ServerConnections
            serverId={form.server_id}
            serverIp={form.server_ip}
            user={user}
            token={token}
            onLogout={onLogout}
            onSaved={onSaved}
            onClose={onClose}
            onNavigate={onNavigate}
          />
        )}

        {isEdit && action.entity === 'phones' && (
          <PhoneConnections
            extension={form.extension}
            serverIp={form.server_ip}
            user={user}
            token={token}
            onLogout={onLogout}
            onSaved={onSaved}
            onClose={onClose}
            onNavigate={onNavigate}
          />
        )}

        {isEdit && action.entity === 'userGroups' && (
          <UserGroupConnections
            groupId={form.user_group}
            token={token}
            user={user}
            admin={admin}
            onLogout={onLogout}
            onSwitchAction={onSwitchAction}
            onNavigate={onNavigate}
          />
        )}

        {isEdit && action.entity === 'users' && hasAdminNav(user)
          && form.user_group === admin?.apiUserGroup && admin?.apiUserGroup && (
          <ApiKeysPanel userId={form.user} token={token} onLogout={onLogout} />
        )}

        {isEdit && action.entity === 'leadFilters' && (
          <LeadFilterConnections
            filterId={form.lead_filter_id}
            token={token}
            onLogout={onLogout}
            onNavigate={onNavigate}
          />
        )}

        {isEdit && action.entity === 'scripts' && (
          <ScriptConnections
            scriptId={form.script_id}
            scriptText={form.script_text}
            token={token}
            onLogout={onLogout}
            onNavigate={onNavigate}
          />
        )}

        {isEdit && action.entity === 'inbound' && (
          <InboundGroupConnections
            admin={admin}
            groupId={form.group_id}
            user={user}
            token={token}
            onLogout={onLogout}
            onSwitchAction={onSwitchAction}
            onNavigate={onNavigate}
          />
        )}

        {isEdit && action.entity === 'lists' && (
          <>
            <ListConnections
              admin={admin}
              listId={form.list_id}
              user={user}
              token={token}
              onLogout={onLogout}
              onSaved={onSaved}
              onNavigate={onNavigate}
            />
            <ListCustomFieldsPanel listId={form.list_id} token={token} onLogout={onLogout} />
          </>
        )}

        {isEdit && action.entity === 'users' && (
          <UserConnections
            admin={admin}
            userId={form.user}
            token={token}
            onLogout={onLogout}
            onNavigate={onNavigate}
          />
        )}

        {isEdit && action.entity === 'campaigns' && (
          <CampaignConnections
            admin={admin}
            campaignId={form.campaign_id}
            user={user}
            token={token}
            onNavigate={onNavigate}
            onLogout={onLogout}
            basic={!isDetail}
            urls={form}
            onUrlsSaved={(next) => setForm((current) => ({ ...current, ...next }))}
            extraActions={PILL_SECTIONS.map((title) => ({
              label: title.replace(' and ', ' & '),
              onClick: () => setSectionModal(title),
            }))}
          />
        )}

        <form className="entity-form" onSubmit={submit}>
          <div className="field-grid">
            {mainFields.map(renderField)}
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            {canDelete && (
              <button
                type="button"
                className={confirmingDelete ? 'danger-action confirming' : 'danger-action'}
                disabled={deleting}
                onClick={handleDelete}
              >
                <Trash2 size={18} aria-hidden="true" />
                {deleting ? 'Deleting' : confirmingDelete ? 'Confirm Delete?' : 'Delete'}
              </button>
            )}
            <span className="modal-actions-spacer" />
            <button type="button" className="secondary-action" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-action" disabled={saving}>
              <Save size={18} aria-hidden="true" />
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </form>

        {isEdit && action.entity === 'campaigns' && (
          <CampaignListsPanel
            admin={admin}
            campaignId={form.campaign_id}
            user={user}
            token={token}
            onSwitchAction={stackAction}
            onLogout={onLogout}
          />
        )}
        {sectionModal && (
          <div className="modal-backdrop" role="presentation" {...backdropCloseProps(() => setSectionModal(''))}>
            <section className="modal-panel detail-modal" role="dialog" aria-modal="true" aria-label={sectionModal}>
              <div className="modal-head">
                <div>
                  <p className="eyebrow">Campaign {form.campaign_id}</p>
                  <h2>{sectionModal}</h2>
                </div>
                <button type="button" className="icon-button" onClick={() => setSectionModal('')} aria-label="Close" title="Close">
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              <div className="entity-form">
                <div className="field-grid">
                  {(pillFields[sectionModal] || []).map(renderField)}
                </div>
                {error && <p className="form-error">{error}</p>}
                <div className="modal-actions">
                  <span className="modal-actions-spacer" />
                  <button type="button" className="secondary-action" onClick={() => setSectionModal('')}>Cancel</button>
                  <button
                    type="button"
                    className="primary-action"
                    disabled={saving}
                    onClick={async () => {
                      if (await persist(false)) setSectionModal('');
                    }}
                  >
                    <Save size={18} aria-hidden="true" />
                    {saving ? 'Saving' : 'Save'}
                  </button>
                </div>
              </div>
            </section>
          </div>
        )}
        {dialStatusModal && (
          <CampaignDialStatusModal
            admin={admin}
            campaignId={form.campaign_id}
            current={campaignDialStatuses(form)}
            token={token}
            onLogout={onLogout}
            onApply={(next) => setForm((current) => ({
              ...current,
              dial_status_list: next,
              dial_statuses: next.length ? `${next.join(' ')} -` : '',
            }))}
            onClose={() => setDialStatusModal(false)}
          />
        )}
        {subAction && (
          <ActionModal
            action={subAction}
            admin={admin}
            token={token}
            user={user}
            onClose={() => setSubAction(null)}
            onSaved={onSaved}
            onLogout={onLogout}
            onSwitchAction={onSwitchAction}
            onNavigate={onNavigate}
          />
        )}
      </section>
    </div>
  );
}

function ManageButton({ onClick, children = 'Manage', icon: Icon = Pencil }) {
  return (
    <button type="button" className="row-action" onClick={onClick}>
      <Icon size={15} aria-hidden="true" />
      {children}
    </button>
  );
}

function RowActions({ children }) {
  return <div className="row-actions">{children}</div>;
}

function ActionBar({ entity, label, user, onAction, children, extraActions = null, canAdd = true }) {
  return (
    <div className="action-bar">
      <div>{children}</div>
      <div className="action-buttons">
        {extraActions}
        {canAdd && userCan(user, entity) && (
          <button type="button" className="primary-action compact-action" onClick={() => onAction(entity, 'create')}>
            <Plus size={17} aria-hidden="true" />
            Add {label}
          </button>
        )}
      </div>
    </div>
  );
}

function StatusPill({ ok, children }) {
  return <span className={`status-pill ${ok ? 'ok' : 'warn'}`}>{children}</span>;
}

function RangeControl({ value, onChange }) {
  const options = [
    { key: 'today', label: 'Today' },
    { key: '7d', label: '7 Days' },
    { key: '30d', label: '30 Days' },
  ];

  return (
    <div className="range-control" aria-label="Reporting range">
      <CalendarDays size={16} aria-hidden="true" />
      {options.map((option) => (
        <button
          type="button"
          key={option.key}
          className={option.key === value ? 'active' : ''}
          onClick={() => onChange(option.key)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function MetricCard({ icon: Icon, label, value, detail, accent }) {
  return (
    <article className="metric-card" style={{ '--accent': accent }}>
      <div className="metric-icon">
        <Icon size={20} aria-hidden="true" />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function ActivityChart({ data, rangeLabel }) {
  const rawMax = Math.max(...data.map((item) => item.calls), 1);
  const hourLabels = new Set(['0', '6', '12', '18', '23']);
  // Y axis uses a "nice" rounded scale (1/2/5 x 10^n steps, 4 divisions) so
  // the tick labels are round numbers and the gridlines land on them.
  const niceCeil = (value) => {
    const pow = 10 ** Math.floor(Math.log10(value));
    const unit = value / pow;
    return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 5 ? 5 : 10) * pow;
  };
  const tickStep = Math.max(1, niceCeil(rawMax / 4));
  const yMax = tickStep * 4;
  const yTicks = [4, 3, 2, 1, 0].map((n) => n * tickStep);
  // Points live in a 0-100 viewBox that stretches to fill the panel; the
  // stroke stays crisp via non-scaling-stroke. Plot area spans y=4..96 so
  // the line never sits on the border.
  const yFor = (calls) => 4 + (1 - calls / yMax) * 92;
  const stepX = data.length > 1 ? 100 / (data.length - 1) : 100;
  const points = data.map((item, index) => ({
    x: data.length > 1 ? index * stepX : 50,
    y: yFor(item.calls),
  }));
  const line = points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');
  const area = `0,96 ${line} 100,96`;

  return (
    <section className="panel chart-panel chart-panel-wide">
      <div className="panel-title">
        <div>
          <p className="eyebrow">{rangeLabel}</p>
          <h2>Call Flow</h2>
        </div>
        <Activity size={22} aria-hidden="true" />
      </div>
      <div className="line-chart" aria-label="Calls by range">
        <div className="line-chart-plot">
          <div className="line-chart-axis" aria-hidden="true">
            {yTicks.map((tick) => (
              <span key={tick}>{formatNumber(tick)}</span>
            ))}
          </div>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img">
            <defs>
              <linearGradient id="callflow-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="rgba(0, 217, 255, 0.3)" />
                <stop offset="100%" stopColor="rgba(0, 217, 255, 0)" />
              </linearGradient>
            </defs>
            {yTicks.map((tick) => (
              <line
                key={tick}
                x1="0"
                y1={yFor(tick)}
                x2="100"
                y2={yFor(tick)}
                stroke="rgba(0, 217, 255, 0.12)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            ))}
            <polygon points={area} fill="url(#callflow-fill)" />
            <polyline
              points={line}
              fill="none"
              stroke="var(--blue)"
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </div>
        <div className="line-chart-labels">
          {data.map((item, index) => {
            const label = item.label ?? String(item.hour ?? index);
            const showLabel = data.length <= 12 || hourLabels.has(label) || index === data.length - 1;
            return <span key={item.key || label}>{showLabel ? label : ''}</span>;
          })}
        </div>
      </div>
    </section>
  );
}

function BreakdownPanel({ eyebrow, title, icon: Icon, items, valueKey, labelKey, emptyLabel }) {
  const total = items.reduce((sum, item) => sum + Number(item[valueKey] || 0), 0);

  return (
    <section className="panel breakdown-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        <Icon size={22} aria-hidden="true" />
      </div>
      <div className="breakdown-list">
        {items.map((item) => {
          const value = Number(item[valueKey] || 0);
          const pct = percent(value, total);
          return (
            <div className="breakdown-row" key={item[labelKey] || item.status}>
              <div className="breakdown-copy">
                <strong>{item[labelKey] || item.status || 'Unknown'}</strong>
                <span>{formatNumber(value)} | {pct}%</span>
              </div>
              <div className="breakdown-track" aria-hidden="true">
                <div className="breakdown-fill" style={{ width: `${Math.max(4, pct)}%` }} />
              </div>
            </div>
          );
        })}
        {!items.length && <div className="empty-state">{emptyLabel}</div>}
      </div>
    </section>
  );
}

function DataTable({ columns, rows, emptyLabel }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id || row.key || index}>
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          ))}
          {!rows.length && (
            <tr>
              <td colSpan={columns.length} className="empty-row">{emptyLabel}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function Panel({ eyebrow, title, icon: Icon, children, className = '', headerActions = null }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-title">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {headerActions}
        {Icon && <Icon size={22} aria-hidden="true" />}
      </div>
      {children}
    </section>
  );
}

function CampaignPerformance({ rows }) {
  return (
    <Panel eyebrow="Performance" title="Campaign Throughput" icon={TrendingUp} className="performance-panel">
      <DataTable
        emptyLabel="No call activity in this range"
        rows={rows.map((row) => ({ ...row, id: row.campaign_id || 'unknown' }))}
        columns={[
          { key: 'campaign_id', label: 'Campaign', render: (row) => <strong>{row.campaign_id || 'Unknown'}</strong> },
          { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
          { key: 'users', label: 'Agents', render: (row) => formatNumber(row.users) },
          { key: 'talk_seconds', label: 'Talk Time', render: (row) => row.talk_time_label || formatSeconds(row.talk_seconds) },
          { key: 'avg_seconds', label: 'Avg', render: (row) => formatSeconds(row.avg_seconds) },
        ]}
      />
    </Panel>
  );
}

function CampaignTable({ campaigns }) {
  return (
    <Panel eyebrow="Campaigns" title="Dialing Surface" icon={Radio} className="table-panel">
      <DataTable
        emptyLabel="No campaigns returned"
        rows={campaigns.map((row) => ({ ...row, id: row.campaign_id }))}
        columns={[
          {
            key: 'campaign_id',
            label: 'Campaign',
            render: (campaign) => (
              <>
                <strong>{campaign.campaign_id}</strong>
                <span>{campaign.campaign_name || 'Unnamed'}</span>
              </>
            ),
          },
          { key: 'dial_method', label: 'Mode', render: (campaign) => campaign.dial_method || 'Manual' },
          { key: 'hopper_level', label: 'Hopper', render: (campaign) => campaign.hopper_level ?? 0 },
          { key: 'lead_order', label: 'Order', render: (campaign) => campaign.lead_order || 'Standard' },
          { key: 'active', label: 'Status', render: (campaign) => <StatusPill ok={campaign.active === 'Y'}>{campaign.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
        ]}
      />
    </Panel>
  );
}

const DASHBOARD_POLL_MS = 5000;

// Counts down to the next Mission Control auto-refresh; the anchor resets
// whenever a new dashboard payload lands (updatedAt changes).
function RefreshCountdown({ updatedAt, intervalMs = DASHBOARD_POLL_MS }) {
  const anchorRef = useRef(Date.now());
  const [, setTick] = useState(0);

  useEffect(() => {
    anchorRef.current = Date.now();
  }, [updatedAt]);

  useEffect(() => {
    const timer = window.setInterval(() => setTick((n) => n + 1), 500);
    return () => window.clearInterval(timer);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((intervalMs - (Date.now() - anchorRef.current)) / 1000));
  return (
    <span>
      <RefreshCcw size={16} aria-hidden="true" /> Refresh in {secondsLeft}s
    </span>
  );
}

function CommandView({ dashboard, admin, user, onAction }) {
  const metrics = dashboard?.metrics || {};
  const counts = admin?.counts || {};
  const rangeLabel = dashboard?.range?.label || 'Today';

  const metricCards = [
    {
      icon: Users,
      label: 'Agents Logged In',
      value: formatNumber(metrics.activeAgents),
      detail: `${formatNumber(metrics.pausedAgents)} paused`,
      accent: '#00d9ff',
    },
    {
      icon: PhoneCall,
      label: `Calls ${rangeLabel}`,
      value: formatNumber(metrics.callsToday),
      detail: `${formatNumber(metrics.outboundCalls)} outbound | ${formatNumber(metrics.inboundCalls)} inbound`,
      accent: '#2d7dff',
    },
    {
      icon: Timer,
      label: 'Talk Time',
      value: metrics.talkTimeLabel || '0m',
      detail: `${formatSeconds(metrics.averageSeconds)} avg call`,
      accent: '#7bb7ff',
    },
    {
      icon: Activity,
      label: 'Current Dials',
      value: formatNumber(metrics.currentCalls),
      detail: `${formatNumber(metrics.currentCallsLive)} connected`,
      accent: '#ffd166',
    },
    {
      icon: Users,
      label: 'Active Users',
      value: formatNumber(counts.activeUsers),
      detail: `${formatNumber(counts.users)} total users`,
      accent: '#73fbd3',
    },
    {
      icon: Database,
      label: 'Active Lists',
      value: formatNumber(counts.activeLists),
      detail: `${formatNumber(counts.lists)} total lists`,
      accent: '#a8c7ff',
    },
    {
      icon: BarChart3,
      label: 'Total Leads',
      value: formatNumber(metrics.leadsTotal),
      detail: `across ${formatNumber(counts.lists)} lists`,
      accent: '#00ffa8',
    },
  ];

  return (
    <>
      <section className="metric-grid command-metric-grid" aria-label="Operations metrics">
        {metricCards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </section>

      <section className="content-grid">
        <ActivityChart data={dashboard?.hourlyCalls || []} rangeLabel={rangeLabel} />
        <CampaignPerformance rows={dashboard?.campaignPerformance || []} />
        <CampaignTable campaigns={dashboard?.campaigns || []} />
      </section>

      {(!user?.navSections || user.navSections.includes('admin')) && (
        <section className="admin-grid command-servers-grid">
          <ServersPanel admin={admin} user={user} onAction={onAction} />
        </section>
      )}
    </>
  );
}

function ServersPanel({ admin, user, onAction }) {
  const servers = admin?.servers || [];
  const canManage = userCan(user, 'servers');

  return (
    <Panel eyebrow="Platform" title="System Servers" icon={Server} className="admin-wide-panel">
      <DataTable
        emptyLabel="No servers returned"
        rows={servers.map((row) => ({ ...row, id: row.server_id }))}
        columns={[
          {
            key: 'server_id',
            label: 'Server',
            render: (row) => (
              <>
                <strong>{row.server_id}</strong>
                <span>{row.server_description || row.server_ip}</span>
              </>
            ),
          },
          { key: 'channels_total', label: 'Channels', render: (row) => formatNumber(row.channels_total) },
          { key: 'sysload', label: 'Load', render: (row) => row.sysload ?? '0' },
          { key: 'cpu_idle_percent', label: 'CPU Load', render: (row) => (row.cpu_idle_percent !== null && row.cpu_idle_percent !== undefined && row.cpu_idle_percent !== '') ? `${Math.max(0, 100 - Number(row.cpu_idle_percent))}%` : 'Unknown' },
          {
            key: 'disk_usage',
            label: 'HD Usage',
            render: (row) => {
              // disk_usage is AST_update's "N pct|" string per df row; show the fullest partition.
              const pcts = String(row.disk_usage || '').split('|')
                .map((part) => Number(part.trim().split(' ')[1]))
                .filter((n) => Number.isFinite(n));
              if (!pcts.length) return 'Unknown';
              const worst = Math.max(...pcts);
              return worst >= 85 ? <StatusPill ok={false}>{worst}%</StatusPill> : `${worst}%`;
            },
          },
          {
            key: 'active',
            label: 'Status',
            render: (row) => {
              if (row.active !== 'Y') return <StatusPill ok={false}>Off</StatusPill>;
              // Heartbeat is written every few seconds on every role (AST_update
              // on telephony, genx-server-stats' re-touch loop elsewhere), so
              // 15s stale means the box is unreachable/unusable.
              const age = Number(row.heartbeat_age_sec);
              const down = !Number.isFinite(age) || age > 15;
              return down ? <StatusPill ok={false}>DOWN</StatusPill> : <StatusPill ok>Online</StatusPill>;
            },
          },
          ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction?.('servers', 'edit', row)} /> }] : []),
        ]}
      />
    </Panel>
  );
}

function CampaignsView({ admin, user, onAction }) {
  const campaigns = admin?.campaigns || [];
  const canManage = userCan(user, 'campaigns');
  const canDetail = Number(user?.userLevel || 0) >= 9 || Boolean(user?.campaignDetail);

  return (
    <>
      <ActionBar
        entity="campaigns"
        label="Campaign"
        user={user}
        onAction={onAction}
        extraActions={canManage ? (
          <button type="button" className="secondary-action compact-action" onClick={() => onAction('campaignCopy', 'copy')}>
            <Copy size={17} aria-hidden="true" />
            Copy Campaign
          </button>
        ) : null}
      >
        <p className="action-copy">Create campaigns or manage the dialing fields most admins touch every day.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Campaign Admin" title="Campaign Matrix" icon={Radio} className="admin-wide-panel">
          <DataTable
            emptyLabel="No campaigns configured"
            rows={campaigns.map((row) => ({ ...row, id: row.campaign_id }))}
            columns={[
              {
                key: 'campaign',
                label: 'Campaign',
                render: (row) => (
                  <>
                    <strong>{row.campaign_id}</strong>
                    <span>{row.campaign_name || row.campaign_description || 'Unnamed campaign'}</span>
                  </>
                ),
              },
              { key: 'dial_method', label: 'Dial Method', render: (row) => row.dial_method || 'Manual' },
              { key: 'auto_dial_level', label: 'Level', render: (row) => row.auto_dial_level || '0' },
              { key: 'lists', label: 'Lists', render: (row) => `${formatNumber(row.active_list_count)} / ${formatNumber(row.list_count)}` },
              { key: 'lead_count', label: 'Leads', render: (row) => formatNumber(row.lead_count) },
              { key: 'live_agents', label: 'Live', render: (row) => formatNumber(row.live_agents) },
              { key: 'recording', label: 'Recording', render: (row) => row.campaign_recording || 'Default' },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(canManage ? [{
                key: 'actions',
                label: 'Action',
                render: (row) => (
                  <RowActions>
                    <ManageButton onClick={() => onAction('campaigns', 'edit', row)}>Basic</ManageButton>
                    {canDetail && <ManageButton onClick={() => onAction('campaigns', 'editDetail', row)} icon={SlidersHorizontal}>Detail</ManageButton>}
                    <ManageButton onClick={() => onAction('campaignCopy', 'copy', { source_campaign_id: row.campaign_id, campaign_name: `${row.campaign_name || row.campaign_id} Copy` })} icon={Copy}>Copy</ManageButton>
                  </RowActions>
                ),
              }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function UsersView({ admin, user, onAction }) {
  const users = admin?.users || [];
  const canManage = userCan(user, 'users');
  // Inactive users are hidden by default; the header button reveals them.
  const [showInactive, setShowInactive] = useState(false);
  const visibleUsers = showInactive ? users : users.filter((row) => row.active === 'Y');
  const inactiveCount = users.filter((row) => row.active !== 'Y').length;

  return (
    <>
      <ActionBar entity="users" label="User" user={user} onAction={onAction} canAdd={hasAdminNav(user)}>
        <p className="action-copy">
          {hasAdminNav(user)
            ? 'Add operators and control the common dialer permission flags from GenX.'
            : 'Manage the day-to-day agent settings for your operators.'}
        </p>
      </ActionBar>
      <section className="admin-grid">
        <Panel
          eyebrow="User Admin"
          title="Users and Permissions"
          icon={Users}
          className="admin-wide-panel"
          headerActions={inactiveCount > 0 ? (
            <button type="button" className="secondary-action compact-action" onClick={() => setShowInactive((value) => !value)}>
              {showInactive ? 'Hide Inactive' : `Show Inactive (${formatNumber(inactiveCount)})`}
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No users returned"
            rows={visibleUsers.map((row) => ({ ...row, id: row.user }))}
            columns={[
              {
                key: 'user',
                label: 'User',
                render: (row) => (
                  <>
                    <strong>{row.user}</strong>
                    <span>{row.full_name || row.email || 'No profile label'}</span>
                  </>
                ),
              },
              { key: 'user_group', label: 'Group', render: (row) => row.user_group || 'Default' },
              { key: 'user_level', label: 'Level', render: (row) => row.user_level },
              { key: 'phone_login', label: 'Phone', render: (row) => row.phone_login || 'None' },
              { key: 'view_reports', label: 'Reports', render: (row) => <StatusPill ok={row.view_reports === '1'}>{row.view_reports === '1' ? 'Allowed' : 'No'}</StatusPill> },
              { key: 'modify', label: 'Modify', render: (row) => [row.modify_campaigns, row.modify_lists, row.modify_users].includes('1') ? 'Admin' : 'Limited' },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('users', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function ListsView({ admin, user, onAction }) {
  const lists = admin?.lists || [];
  const totalLeads = lists.reduce((sum, row) => sum + Number(row.lead_count || 0), 0);
  const canManage = userCan(user, 'lists');

  return (
    <>
      <ActionBar entity="lists" label="List" user={user} onAction={onAction}>
        <p className="action-copy">Create lead lists, assign campaigns, and control list status without opening classic admin.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Lead Admin" title="Lists and Lead Inventory" icon={Database} className="admin-wide-panel">
          <DataTable
            emptyLabel="No lists configured"
            rows={lists.map((row) => ({ ...row, id: row.list_id }))}
            columns={[
              {
                key: 'list',
                label: 'List',
                render: (row) => (
                  <>
                    <strong>{row.list_id}</strong>
                    <span>{row.list_name || row.list_description || 'Unnamed list'}</span>
                  </>
                ),
              },
              { key: 'campaign_id', label: 'Campaign', render: (row) => row.campaign_id },
              { key: 'lead_count', label: 'Leads', render: (row) => formatNumber(row.lead_count) },
              { key: 'new_leads', label: 'New', render: (row) => formatNumber(row.new_leads) },
              { key: 'called_leads', label: 'Called', render: (row) => formatNumber(row.called_leads) },
              { key: 'cache_count_dialable_new', label: 'Dialable Cache', render: (row) => formatNumber(row.cache_count_dialable_new) },
              { key: 'list_lastcalldate', label: 'Last Call', render: (row) => formatDateTime(row.list_lastcalldate) },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('lists', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel eyebrow="Inventory" title="Lead Share" icon={BarChart3}>
          <div className="breakdown-list">
            {lists.slice(0, 12).map((row) => {
              const pct = percent(row.lead_count, totalLeads);
              return (
                <div className="breakdown-row" key={row.list_id}>
                  <div className="breakdown-copy">
                    <strong>{row.list_id}</strong>
                    <span>{formatNumber(row.lead_count)} | {pct}%</span>
                  </div>
                  <div className="breakdown-track" aria-hidden="true">
                    <div className="breakdown-fill" style={{ width: `${Math.max(4, pct)}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </Panel>
      </section>
    </>
  );
}

function LeadLoaderView({ admin, user, token, onLoaded }) {
  const lists = admin?.lists || [];
  const canLoad = userCan(user, 'leadLoader');
  const [listId, setListId] = useState('');
  const [phoneCode, setPhoneCode] = useState('1');
  const [status, setStatus] = useState('NEW');
  const [duplicateMode, setDuplicateMode] = useState('LIST');
  const [csv, setCsv] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    if (!listId && lists.length) setListId(String(lists[0].list_id || ''));
  }, [listId, lists]);

  const selectedList = lists.find((item) => String(item.list_id) === String(listId));
  const previewRows = csv
    .split(/\r?\n/)
    .map((line) => line.split(',').map((item) => item.trim()))
    .filter((row) => row.some(Boolean))
    .slice(0, 6);

  async function loadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCsv(await file.text());
    setSummary(null);
    setError('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!canLoad) {
      setError('Your user is not allowed to load leads');
      return;
    }
    setLoading(true);
    setError('');
    setSummary(null);
    try {
      const payload = await apiFetch('/admin/lead-loader', token, {
        method: 'POST',
        body: JSON.stringify({
          list_id: listId,
          phone_code: phoneCode,
          status,
          duplicate_mode: duplicateMode,
          csv,
        }),
      });
      setSummary(payload.summary || null);
      if (payload.data) onLoaded(payload.data);
    } catch (loadError) {
      const messages = {
        list_required: 'Choose a list before loading leads',
        csv_required: 'Add a CSV file or paste CSV rows first',
        csv_header_and_rows_required: 'CSV needs a header row and at least one lead row',
        phone_number_header_required: 'CSV needs a phone_number column',
        campaign_not_allowed: 'Your user cannot load leads into that campaign',
        permission_denied: 'Your user is not allowed to load leads',
      };
      setError(messages[loadError.message] || 'Lead load failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <section className="metric-grid admin-metric-grid" aria-label="Lead loader metrics">
        <MetricCard icon={Database} label="Lists" value={formatNumber(lists.length)} detail="Available lead lists" accent="#00d9ff" />
        <MetricCard icon={Radio} label="Campaign" value={selectedList?.campaign_id || 'None'} detail={selectedList?.list_name || selectedList?.list_id || 'No list selected'} accent="#73fbd3" />
        <MetricCard icon={ShieldCheck} label="Load Access" value={canLoad ? 'Allowed' : 'No'} detail="load_leads permission" accent="#ffd166" />
      </section>

      <section className="admin-grid">
        <Panel eyebrow="Lead Admin" title="Lead Loader" icon={FileText} className="admin-wide-panel">
          <form className="entity-form lead-loader-form" onSubmit={submit}>
            <div className="field-grid">
              <label>
                <span>List</span>
                <select value={listId} onChange={(event) => setListId(event.target.value)}>
                  {lists.map((list) => (
                    <option key={list.list_id} value={list.list_id}>{list.list_id} - {list.list_name || list.campaign_id}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Duplicate Check</span>
                <select value={duplicateMode} onChange={(event) => setDuplicateMode(event.target.value)}>
                  <option value="LIST">List</option>
                  <option value="CAMPAIGN">Campaign</option>
                  <option value="SYSTEM">System</option>
                  <option value="NONE">None</option>
                </select>
              </label>
              <label>
                <span>Phone Code</span>
                <input value={phoneCode} onChange={(event) => setPhoneCode(event.target.value)} />
              </label>
              <label>
                <span>Status</span>
                <input value={status} onChange={(event) => setStatus(event.target.value.toUpperCase())} />
              </label>
              <label className="wide-field">
                <span>CSV File</span>
                <input type="file" accept=".csv,text/csv,text/plain" onChange={loadFile} />
              </label>
              <label className="wide-field">
                <span>CSV Rows</span>
                <textarea value={csv} onChange={(event) => { setCsv(event.target.value); setSummary(null); }} />
              </label>
            </div>
            {error && <p className="form-error">{error}</p>}
            <div className="modal-actions">
              <button type="submit" className="primary-action" disabled={loading || !canLoad}>
                <Save size={18} aria-hidden="true" />
                {loading ? 'Loading' : 'Load Leads'}
              </button>
            </div>
          </form>
        </Panel>

        <Panel eyebrow="Preview" title="CSV Preview" icon={BarChart3}>
          <div className="csv-preview">
            {previewRows.length ? previewRows.map((row, index) => (
              <div className="csv-preview-row" key={`${index}-${row.join('-')}`}>
                {row.slice(0, 8).map((cell, cellIndex) => <span key={`${cellIndex}-${cell}`}>{cell || '-'}</span>)}
              </div>
            )) : <div className="empty-state">No CSV rows loaded</div>}
          </div>
        </Panel>

        {summary && (
          <Panel eyebrow="Result" title="Load Summary" icon={Database} className="admin-wide-panel">
            <div className="quick-stack">
              <MetricCard icon={Database} label="Inserted" value={formatNumber(summary.inserted)} detail={`List ${summary.list_id}`} accent="#73fbd3" />
              <MetricCard icon={Gauge} label="Skipped" value={formatNumber(summary.skipped)} detail="Duplicate or invalid rows" accent="#ffd166" />
            </div>
            <DataTable
              emptyLabel="No skipped rows"
              rows={(summary.skipped_rows || []).map((row) => ({ ...row, id: `${row.row}-${row.reason}-${row.phone_number || ''}` }))}
              columns={[
                { key: 'row', label: 'Row', render: (row) => row.row },
                { key: 'reason', label: 'Reason', render: (row) => row.reason },
                { key: 'phone_number', label: 'Phone', render: (row) => row.phone_number || 'None' },
              ]}
            />
          </Panel>
        )}
      </section>
    </>
  );
}

// Per-list custom fields (admin_lists_custom.php port). Field defs live in
// vicidial_lists_fields; data in custom_<list_id> keyed by lead_id.
const CUSTOM_FIELD_TYPE_OPTIONS = ['TEXT', 'AREA', 'SELECT', 'MULTI', 'RADIO', 'CHECKBOX', 'DATE', 'TIME',
  'DISPLAY', 'HIDDEN', 'READONLY', 'HIDEBLOB', 'SOURCESELECT'];

const CUSTOM_FIELD_FORM_DEFAULTS = {
  field_label: '', field_name: '', field_description: '', field_type: 'TEXT', field_options: '',
  field_rank: '1', field_order: '0', field_size: '20', field_max: '30', field_default: '',
  field_required: 'N', name_position: 'LEFT', multi_position: 'HORIZONTAL', field_help: '', field_duplicate: 'N',
};

function parseCustomOptions(def) {
  return String(def.field_options || '').split('\n').map((line) => {
    if (!line.trim()) return null;
    if (def.field_type === 'SOURCESELECT') {
      const parts = line.split('|');
      const value = (parts[0] || '').replace(/^option=>/i, '').trim();
      return value ? { value, label: (parts[1] || value).trim() } : null;
    }
    const parts = line.split(',');
    if (parts.length < 2) return null;
    return { value: parts[0].trim(), label: parts.slice(1).join(',').trim() || parts[0].trim() };
  }).filter(Boolean);
}

function CustomFieldInput({ def, value, onChange, disabled }) {
  const type = def.field_type;
  if (type === 'AREA') {
    return <textarea rows={3} value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
  }
  if (['SELECT', 'SOURCESELECT', 'RADIO'].includes(type)) {
    const options = parseCustomOptions(def);
    return (
      <select value={value ?? ''} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
        <option value="">— none —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
    );
  }
  if (['MULTI', 'CHECKBOX'].includes(type)) {
    // Stored comma-joined, matching legacy vdc_form_display.php.
    const options = parseCustomOptions(def);
    const selected = new Set(String(value || '').split(',').map((item) => item.trim()).filter(Boolean));
    return (
      <div className="status-chip-list">
        {options.map((option) => {
          const on = selected.has(option.value);
          return (
            <button
              key={option.value}
              type="button"
              className={`check-option ${on ? 'selected' : ''}`}
              disabled={disabled}
              onClick={() => {
                const next = new Set(selected);
                if (on) next.delete(option.value);
                else next.add(option.value);
                onChange([...next].join(','));
              }}
            >
              {option.label}
            </button>
          );
        })}
        {!options.length && <em>No options defined</em>}
      </div>
    );
  }
  if (type === 'DATE') {
    return <input type="date" value={String(value ?? '').slice(0, 10)} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
  }
  if (type === 'TIME') {
    return <input type="time" value={String(value ?? '').slice(0, 8)} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
  }
  if (['DISPLAY', 'READONLY', 'SCRIPT', 'BUTTON', 'SWITCH'].includes(type)) {
    return <input value={value ?? ''} disabled />;
  }
  return <input value={value ?? ''} maxLength={Number(def.field_max) > 0 ? Number(def.field_max) : undefined} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}

// Custom-field definition editor shown in the list modal (legacy list FIELDS
// page). Adding/modifying/deleting a DB-backed field runs the same CREATE /
// ALTER / DROP on custom_<list_id> that legacy does.
function ListCustomFieldsPanel({ listId, token, onLogout }) {
  const list = String(listId || '');
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | field_id
  const [form, setForm] = useState(CUSTOM_FIELD_FORM_DEFAULTS);
  const [rerank, setRerank] = useState(false);
  const [state, setState] = useState('');
  const [confirming, setConfirming] = useState(0);
  const [copyOpen, setCopyOpen] = useState(false);
  const [copySource, setCopySource] = useState('');
  const [copyOption, setCopyOption] = useState('APPEND');
  const [copyConfirm, setCopyConfirm] = useState(false);

  const load = useCallback(() => {
    if (!list) return;
    apiFetch(`/admin/lists/${encodeURIComponent(list)}/custom-fields`, token)
      .then(setData)
      .catch((requestError) => {
        if (requestError.status === 401) onLogout();
        setData({ error: true });
      });
  }, [list, token, onLogout]);

  useEffect(() => {
    setData(null);
    setEditing(null);
    setState('');
    setConfirming(0);
    load();
  }, [load]);

  if (!list || !data || data.error) return null;

  const fields = data.fields || [];
  const needsOptions = ['SELECT', 'MULTI', 'RADIO', 'CHECKBOX', 'SOURCESELECT'].includes(form.field_type);

  function startEdit(row) {
    setEditing(row ? row.field_id : 'new');
    setState('');
    setForm(row ? {
      ...CUSTOM_FIELD_FORM_DEFAULTS,
      ...Object.fromEntries(Object.keys(CUSTOM_FIELD_FORM_DEFAULTS).map((key) => [key, String(row[key] ?? CUSTOM_FIELD_FORM_DEFAULTS[key])])),
    } : CUSTOM_FIELD_FORM_DEFAULTS);
  }

  async function saveField(event) {
    event.preventDefault();
    setState('working');
    try {
      const isNew = editing === 'new';
      const path = isNew
        ? `/admin/lists/${encodeURIComponent(list)}/custom-fields`
        : `/admin/lists/${encodeURIComponent(list)}/custom-fields/${encodeURIComponent(editing)}`;
      const payload = await apiFetch(path, token, {
        method: isNew ? 'POST' : 'PUT',
        body: JSON.stringify(rerank ? { ...form, field_rerank: 'YES' } : form),
      });
      setData(payload);
      setEditing(null);
      setState('Field saved');
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setState(requestError.status === 403 ? 'Not permitted (custom_fields_modify + level 8 required)'
        : requestError.status === 409 ? 'A field with that label already exists'
          : 'Save failed - check the label and options');
    }
  }

  async function deleteField(row) {
    if (confirming !== row.field_id) {
      setConfirming(row.field_id);
      return;
    }
    setConfirming(0);
    setState('working');
    try {
      const payload = await apiFetch(`/admin/lists/${encodeURIComponent(list)}/custom-fields/${encodeURIComponent(row.field_id)}`, token, { method: 'DELETE' });
      setData(payload);
      setState(`Field ${row.field_label} deleted (column dropped)`);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setState(requestError.status === 403 ? 'Not permitted' : 'Delete failed');
    }
  }

  return (
    <div className="campaign-tool-panel campaign-connections">
      <div className="campaign-tool-head">
        <div>
          <p className="eyebrow">Custom Fields</p>
          <h3>{fields.length ? `${formatNumber(fields.length)} field${fields.length === 1 ? '' : 's'} on custom_${list}` : 'No custom fields on this list yet'}</h3>
        </div>
        <SlidersHorizontal size={20} aria-hidden="true" />
      </div>
      {!data.customFieldsEnabled && (
        <p className="connection-summary">Custom Fields are disabled in System Settings (custom_fields_enabled) - agents will not see these until enabled.</p>
      )}
      <div className="connection-lists">
        {fields.map((row) => (
          <div className="rank-row" key={row.field_id}>
            <span>{row.field_rank}. <strong>{row.field_label}</strong> ({row.field_type}{row.field_required === 'Y' ? ', required' : ''}) {row.field_name || ''}</span>
            {data.canModify && (
              <>
                <button type="button" className="row-action" onClick={() => startEdit(row)}>
                  <Pencil size={14} aria-hidden="true" /> Edit
                </button>
                <button
                  type="button"
                  className={confirming === row.field_id ? 'danger-action confirming compact-action' : 'row-action'}
                  onClick={() => deleteField(row)}
                >
                  <Trash2 size={14} aria-hidden="true" />
                  {confirming === row.field_id ? 'Confirm Delete Field + Data?' : 'Delete'}
                </button>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="connection-actions">
        {data.canModify && editing === null && (
          <button type="button" className="row-action" onClick={() => startEdit(null)}>
            <Plus size={15} aria-hidden="true" /> Add Custom Field
          </button>
        )}
        {data.canModify && editing === null && (
          <button type="button" className="row-action" onClick={() => { setCopyOpen((open) => !open); setCopyConfirm(false); }}>
            <Compass size={15} aria-hidden="true" /> Copy Fields From List
          </button>
        )}
        {state && state !== 'working' && <span className="connection-status">{state}</span>}
      </div>
      {copyOpen && editing === null && (
        <form
          className="entity-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (copyOption === 'REPLACE' && !copyConfirm) {
              setCopyConfirm(true);
              return;
            }
            setCopyConfirm(false);
            setState('working');
            try {
              const payload = await apiFetch(`/admin/lists/${encodeURIComponent(list)}/custom-fields/copy`, token, {
                method: 'POST',
                body: JSON.stringify({ source_list_id: copySource, copy_option: copyOption }),
              });
              setData(payload);
              setCopyOpen(false);
              setState('Fields copied');
            } catch (requestError) {
              if (requestError.status === 401) {
                onLogout();
                return;
              }
              setState(requestError.status === 403 ? 'Not permitted' : 'Copy failed - check the source list has custom fields');
            }
          }}
        >
          <div className="field-grid">
            <label>
              <span>Source List ID</span>
              <input value={copySource} placeholder="Required" onChange={(event) => setCopySource(event.target.value)} />
            </label>
            <label>
              <span>Copy Option</span>
              <select value={copyOption} onChange={(event) => { setCopyOption(event.target.value); setCopyConfirm(false); }}>
                <option value="APPEND">APPEND (skip existing labels)</option>
                <option value="UPDATE">UPDATE (overwrite existing labels)</option>
                <option value="REPLACE">REPLACE (delete this list's fields first)</option>
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className={copyConfirm ? 'danger-action confirming' : 'primary-action'} disabled={state === 'working' || !copySource}>
              {state === 'working' ? 'Copying' : copyConfirm ? 'Confirm REPLACE (destroys current fields + data)?' : 'Copy Fields'}
            </button>
          </div>
        </form>
      )}
      {editing !== null && (
        <form className="entity-form" onSubmit={saveField}>
          <div className="field-grid">
            <label>
              <span>Field Label (column name)</span>
              <input value={form.field_label} disabled={editing !== 'new'} placeholder="letters, digits, underscore" onChange={(event) => setForm((c) => ({ ...c, field_label: event.target.value }))} />
            </label>
            <label>
              <span>Field Name (display)</span>
              <input value={form.field_name} onChange={(event) => setForm((c) => ({ ...c, field_name: event.target.value }))} />
            </label>
            <label>
              <span>Type</span>
              <select value={form.field_type} onChange={(event) => setForm((c) => ({ ...c, field_type: event.target.value }))}>
                {CUSTOM_FIELD_TYPE_OPTIONS.map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>Rank</span>
              <input type="number" value={form.field_rank} onChange={(event) => setForm((c) => ({ ...c, field_rank: event.target.value }))} />
            </label>
            <label>
              <span>Order</span>
              <input type="number" value={form.field_order} onChange={(event) => setForm((c) => ({ ...c, field_order: event.target.value }))} />
            </label>
            <label>
              <span>Required</span>
              <select value={form.field_required} onChange={(event) => setForm((c) => ({ ...c, field_required: event.target.value }))}>
                <option value="N">No</option>
                <option value="Y">Yes</option>
                <option value="INBOUND_ONLY">Inbound Only</option>
              </select>
            </label>
            <label>
              <span>Size (display)</span>
              <input type="number" value={form.field_size} onChange={(event) => setForm((c) => ({ ...c, field_size: event.target.value }))} />
            </label>
            <label>
              <span>Max (storage)</span>
              <input type="number" value={form.field_max} onChange={(event) => setForm((c) => ({ ...c, field_max: event.target.value }))} />
            </label>
            <label>
              <span>Default</span>
              <input value={form.field_default} onChange={(event) => setForm((c) => ({ ...c, field_default: event.target.value }))} />
            </label>
            <label>
              <span>Description</span>
              <input value={form.field_description} onChange={(event) => setForm((c) => ({ ...c, field_description: event.target.value }))} />
            </label>
            {needsOptions && (
              <label className="wide-field">
                <span>Options (one per line: value,label{form.field_type === 'SOURCESELECT' ? ' - or option=>value|label' : ''})</span>
                <textarea rows={4} value={form.field_options} onChange={(event) => setForm((c) => ({ ...c, field_options: event.target.value }))} />
              </label>
            )}
            <label className="wide-field">
              <span>Help Text</span>
              <input value={form.field_help} onChange={(event) => setForm((c) => ({ ...c, field_help: event.target.value }))} />
            </label>
          </div>
          <div className="modal-actions">
            <label className="check-option">
              <input type="checkbox" checked={rerank} onChange={(event) => setRerank(event.target.checked)} />
              <span>Shift colliding ranks down (legacy re-rank)</span>
            </label>
            <button type="submit" className="primary-action" disabled={state === 'working'}>
              <Save size={16} aria-hidden="true" />
              {state === 'working' ? 'Saving' : editing === 'new' ? 'Add Field' : 'Save Field'}
            </button>
            <button type="button" className="secondary-action" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}

// Legacy admin_search_lead.php + admin_modify_lead.php: search leads by
// phone / lead id / vendor code / name / email, then view and edit the full
// lead record with per-lead call history, callbacks and recordings.
const LEAD_SEARCH_TYPES = [
  ['phone', 'Phone Number'],
  ['lead_id', 'Lead ID'],
  ['vendor', 'Vendor Lead Code'],
  ['name', 'First / Last Name'],
  ['email', 'Email'],
];

const LEAD_EDIT_FIELDS = [
  ['status', 'Status'], ['vendor_lead_code', 'Vendor Lead Code'], ['source_id', 'Source ID'],
  ['title', 'Title'], ['first_name', 'First Name'], ['middle_initial', 'MI'], ['last_name', 'Last Name'],
  ['address1', 'Address 1'], ['address2', 'Address 2'], ['address3', 'Address 3'],
  ['city', 'City'], ['state', 'State'], ['province', 'Province'], ['postal_code', 'Postal Code'],
  ['country_code', 'Country'], ['gender', 'Gender'], ['date_of_birth', 'Date of Birth'],
  ['phone_code', 'Phone Code'], ['phone_number', 'Phone Number'], ['alt_phone', 'Alt Phone'],
  ['email', 'Email'], ['security_phrase', 'Security Phrase'], ['rank', 'Rank'], ['owner', 'Owner'],
];

function LeadSearchView({ admin, user, token, viewParams }) {
  const [searchType, setSearchType] = useState('phone');
  const [query, setQuery] = useState('');
  const [listFilter, setListFilter] = useState('');
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState(null);
  const [form, setForm] = useState(null);
  const [modifyLogs, setModifyLogs] = useState(false);
  const [modifyCloserLogs, setModifyCloserLogs] = useState(false);
  const [saveState, setSaveState] = useState('');
  const [error, setError] = useState('');
  const [custom, setCustom] = useState(null);
  const [customForm, setCustomForm] = useState({});
  const [customSaveState, setCustomSaveState] = useState('');

  const modifyLeads = Number(user?.modifyLeads || 0);
  // Legacy modify_leads semantics: 0 = no lead-page access, 5 = restricted
  // variant that may VIEW but never edit fields — that's why 5 is excluded
  // here despite being >= 1. Don't normalize this to a plain >= 1.
  const canEdit = Number(user?.userLevel || 0) >= 9 || (modifyLeads >= 1 && modifyLeads !== 5);
  // Legacy: only modify_leads level 3/4 may edit individual log row statuses.
  const canEditLogs = Number(user?.userLevel || 0) >= 9 || modifyLeads === 3 || modifyLeads === 4;
  const [logEdit, setLogEdit] = useState(null); // { key, value, state }
  const statuses = admin?.statuses || [];

  async function saveLogStatus(row) {
    setLogEdit((current) => ({ ...current, state: 'working' }));
    try {
      await apiFetch(`/admin/leads/${encodeURIComponent(detail.lead.lead_id)}/log-status`, token, {
        method: 'POST',
        body: JSON.stringify({
          log_table: row.log_table,
          log_id: row.log_id,
          old_status: row.status,
          new_status: logEdit.value,
        }),
      });
      setLogEdit(null);
      loadDetail(detail.lead.lead_id);
    } catch (requestError) {
      setLogEdit((current) => ({
        ...current,
        state: requestError.status === 403 ? 'Not permitted (modify_leads 3/4)' : 'Update failed',
      }));
    }
  }

  // Sequence guard: clicking View on lead A then quickly on lead B fires two
  // overlapping fetches; without the seq check A's slower response (or its
  // fire-and-forget custom-fields fetch) could land last and mix A's data
  // into B's editor — Save Custom Fields would then write A's values onto B.
  const detailSeq = useRef(0);
  const loadDetail = useCallback(async (leadId) => {
    const seq = ++detailSeq.current;
    setError('');
    setSaveState('');
    setCustom(null);
    setCustomForm({});
    setCustomSaveState('');
    try {
      const payload = await apiFetch(`/admin/leads/${encodeURIComponent(leadId)}`, token);
      if (seq !== detailSeq.current) return;
      setDetail(payload);
      setForm({ ...payload.lead });
      setModifyLogs(false);
      setModifyCloserLogs(false);
      apiFetch(`/admin/leads/${encodeURIComponent(leadId)}/custom`, token)
        .then((customPayload) => {
          if (seq !== detailSeq.current) return;
          setCustom(customPayload);
          setCustomForm({ ...(customPayload.values || {}) });
        })
        .catch(() => { if (seq === detailSeq.current) setCustom(null); });
    } catch (requestError) {
      if (seq !== detailSeq.current) return;
      setError(requestError.status === 404 ? 'Lead not found or not in your allowed lists' : 'The lead failed to load');
    }
  }, [token]);

  useEffect(() => {
    if (viewParams?.leadId) loadDetail(viewParams.leadId);
  }, [viewParams, loadDetail]);

  async function runSearch(event) {
    event.preventDefault();
    setSearching(true);
    setError('');
    setDetail(null);
    setForm(null);
    try {
      const params = new URLSearchParams({ type: searchType, q: query });
      if (listFilter) params.set('list_id', listFilter);
      const payload = await apiFetch(`/admin/leads/search?${params.toString()}`, token);
      setResults(payload.leads || []);
    } catch (requestError) {
      setError('The lead search failed');
    } finally {
      setSearching(false);
    }
  }

  async function saveLead() {
    setSaveState('working');
    try {
      const body = {};
      for (const [key] of LEAD_EDIT_FIELDS) body[key] = form[key] ?? '';
      body.comments = form.comments ?? '';
      if (modifyLogs) body.modify_logs = true;
      if (modifyCloserLogs) body.modify_closer_logs = true;
      const payload = await apiFetch(`/admin/leads/${encodeURIComponent(detail.lead.lead_id)}`, token, {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      setSaveState(payload.notes?.length ? `Saved - ${payload.notes.join('; ')}` : 'Lead saved');
      loadDetail(detail.lead.lead_id);
    } catch (requestError) {
      setSaveState(requestError.status === 403 ? 'Not permitted' : 'Save failed');
    }
  }

  const lead = detail?.lead;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Lists</p>
          <h2>Lead Search and Modify</h2>
          <p className="action-copy">Find any lead in your allowed lists, review its full call history and edit the record.</p>
        </div>
      </section>
      <Panel eyebrow="Search" title="Find a Lead" icon={Search} className="admin-wide-panel">
        <form className="entity-form report-filter-bar" onSubmit={runSearch}>
          <div className="field-grid">
            <label>
              <span>Search By</span>
              <select value={searchType} onChange={(event) => setSearchType(event.target.value)}>
                {LEAD_SEARCH_TYPES.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Search Value</span>
              <input value={query} placeholder="Required" onChange={(event) => setQuery(event.target.value)} />
            </label>
            <label>
              <span>List ID (optional)</span>
              <input value={listFilter} placeholder="All lists" onChange={(event) => setListFilter(event.target.value)} />
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={searching || !query}>
              <Search size={16} aria-hidden="true" />
              {searching ? 'Searching' : 'Search Leads'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {results && !detail && (
        <Panel eyebrow="Results" title={`Leads Found (${formatNumber(results.length)})`} icon={Database} className="admin-wide-panel">
          <DataTable
            emptyLabel="No leads matched the search in your allowed lists"
            rows={results.map((row) => ({ ...row, id: row.lead_id }))}
            columns={[
              { key: 'lead_id', label: 'Lead' },
              { key: 'name', label: 'Name', render: (row) => `${row.first_name || ''} ${row.last_name || ''}`.trim() || '—' },
              { key: 'phone_number', label: 'Phone' },
              { key: 'list_id', label: 'List' },
              { key: 'status', label: 'Status' },
              { key: 'entry_date', label: 'Entered', render: (row) => formatDateTime(row.entry_date) },
              { key: 'called_count', label: 'Calls' },
              { key: 'last_local_call_time', label: 'Last Call', render: (row) => formatDateTime(row.last_local_call_time) },
              { key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => loadDetail(row.lead_id)}>View</ManageButton> },
            ]}
          />
        </Panel>
      )}
      {lead && form && (
        <>
          <Panel
            eyebrow={`Lead ${lead.lead_id} - list ${lead.list_id}${detail.list ? ` (${detail.list.list_name || ''}, campaign ${detail.list.campaign_id || 'none'})` : ''}`}
            title={`${lead.first_name || ''} ${lead.last_name || ''}`.trim() || `Lead ${lead.lead_id}`}
            icon={Users}
            className="admin-wide-panel"
            headerActions={results ? (
              <button type="button" className="secondary-action compact-action" onClick={() => { setDetail(null); setForm(null); }}>
                Back to results
              </button>
            ) : null}
          >
            <p className="connection-summary">
              Entered {formatDateTime(lead.entry_date)} | Modified {formatDateTime(lead.modify_date)} | Called {formatNumber(lead.called_count)} times
              {lead.last_local_call_time ? ` | Last call ${formatDateTime(lead.last_local_call_time)}` : ''} | GMT {lead.gmt_offset_now} | Entry list {lead.entry_list_id}
              {lead.user ? ` | Last agent ${lead.user}` : ''}
            </p>
            <form
              className="entity-form"
              onSubmit={(event) => {
                event.preventDefault();
                saveLead();
              }}
            >
              <div className="field-grid">
                {LEAD_EDIT_FIELDS.map(([key, label]) => (
                  <label key={key}>
                    <span>{label}</span>
                    {key === 'status' ? (
                      <>
                        <input list="lead-status-options" value={form[key] ?? ''} disabled={!canEdit} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
                        <datalist id="lead-status-options">
                          {statuses.map((row) => (
                            <option key={row.status} value={row.status}>{row.status_name || row.status}</option>
                          ))}
                        </datalist>
                      </>
                    ) : (
                      <input value={form[key] ?? ''} disabled={!canEdit} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} />
                    )}
                  </label>
                ))}
                <label className="wide-field">
                  <span>Comments</span>
                  <textarea rows={3} value={form.comments ?? ''} disabled={!canEdit} onChange={(event) => setForm((current) => ({ ...current, comments: event.target.value }))} />
                </label>
              </div>
              {canEdit && (
                <div className="modal-actions">
                  <label className="check-option">
                    <input type="checkbox" checked={modifyLogs} onChange={(event) => setModifyLogs(event.target.checked)} />
                    <span>Also set latest outbound call log status</span>
                  </label>
                  <label className="check-option">
                    <input type="checkbox" checked={modifyCloserLogs} onChange={(event) => setModifyCloserLogs(event.target.checked)} />
                    <span>Also set latest inbound call log status</span>
                  </label>
                  <button type="submit" className="primary-action" disabled={saveState === 'working'}>
                    <Save size={16} aria-hidden="true" />
                    {saveState === 'working' ? 'Saving' : 'Save Lead'}
                  </button>
                  {saveState && saveState !== 'working' && <span className="connection-status">{saveState}</span>}
                </div>
              )}
              {!canEdit && <p className="connection-summary">Your user cannot modify leads (modify_leads setting).</p>}
            </form>
          </Panel>
          {custom && (custom.fields || []).length > 0 && (
            <Panel eyebrow={`custom_${custom.listId}`} title={`Custom Fields (${formatNumber(custom.fields.length)})`} icon={SlidersHorizontal} className="admin-wide-panel">
              <form
                className="entity-form"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setCustomSaveState('working');
                  try {
                    const payload = await apiFetch(`/admin/leads/${encodeURIComponent(lead.lead_id)}/custom`, token, {
                      method: 'PUT',
                      body: JSON.stringify(customForm),
                    });
                    setCustom(payload);
                    setCustomForm({ ...(payload.values || {}) });
                    setCustomSaveState('Custom fields saved');
                  } catch (requestError) {
                    setCustomSaveState(requestError.status === 403 ? 'Not permitted' : 'Save failed');
                  }
                }}
              >
                <div className="field-grid">
                  {custom.fields.map((def) => (
                    <label key={def.field_id} className={['AREA', 'MULTI', 'CHECKBOX'].includes(def.field_type) ? 'wide-field' : ''}>
                      <span>{def.field_name || def.field_label}{def.field_required === 'Y' ? ' *' : ''}</span>
                      <CustomFieldInput
                        def={def}
                        value={customForm[def.field_label]}
                        disabled={!canEdit}
                        onChange={(value) => setCustomForm((current) => ({ ...current, [def.field_label]: value }))}
                      />
                    </label>
                  ))}
                </div>
                {canEdit && (
                  <div className="modal-actions">
                    <button type="submit" className="primary-action" disabled={customSaveState === 'working'}>
                      <Save size={16} aria-hidden="true" />
                      {customSaveState === 'working' ? 'Saving' : 'Save Custom Fields'}
                    </button>
                    {customSaveState && customSaveState !== 'working' && <span className="connection-status">{customSaveState}</span>}
                  </div>
                )}
              </form>
            </Panel>
          )}
          <Panel eyebrow="History" title={`Calls (${formatNumber((detail.calls || []).length)})`} icon={PhoneCall} className="admin-wide-panel">
            <DataTable
              emptyLabel="No calls logged for this lead"
              rows={(detail.calls || []).map((row, index) => ({ ...row, id: `${row.log_table}-${row.log_id}-${index}` }))}
              columns={[
                { key: 'direction', label: 'Dir' },
                { key: 'call_date', label: 'Date', render: (row) => formatDateTime(row.call_date) },
                { key: 'length_in_sec', label: 'Seconds' },
                {
                  key: 'status',
                  label: 'Status',
                  render: (row) => {
                    if (!canEditLogs) return row.status;
                    if (logEdit?.key !== row.id) {
                      return (
                        <button type="button" className="row-action" onClick={() => setLogEdit({ key: row.id, value: row.status, state: '' })}>
                          {row.status}
                        </button>
                      );
                    }
                    return (
                      <span className="log-status-edit">
                        <input
                          list="lead-status-options"
                          value={logEdit.value}
                          style={{ width: '7em' }}
                          onChange={(event) => setLogEdit((current) => ({ ...current, value: event.target.value.toUpperCase() }))}
                        />
                        <button type="button" className="row-action" disabled={logEdit.state === 'working' || !logEdit.value || logEdit.value === row.status} onClick={() => saveLogStatus(row)}>
                          {logEdit.state === 'working' ? 'Saving' : 'Set'}
                        </button>
                        <button type="button" className="row-action" onClick={() => setLogEdit(null)}>×</button>
                        {logEdit.state && logEdit.state !== 'working' && <span className="connection-status">{logEdit.state}</span>}
                      </span>
                    );
                  },
                },
                { key: 'user', label: 'User' },
                { key: 'group_id', label: 'Campaign / Group' },
                { key: 'phone_number', label: 'Phone' },
                { key: 'term_reason', label: 'Hangup' },
              ]}
            />
          </Panel>
          <Panel eyebrow="History" title={`Callbacks (${formatNumber((detail.callbacks || []).length)})`} icon={Clock3} className="admin-wide-panel">
            <DataTable
              emptyLabel="No callback records for this lead"
              rows={(detail.callbacks || []).map((row) => ({ ...row, id: row.callback_id }))}
              columns={[
                { key: 'callback_time', label: 'Callback Time', render: (row) => formatDateTime(row.callback_time) },
                { key: 'entry_time', label: 'Entered', render: (row) => formatDateTime(row.entry_time) },
                { key: 'status', label: 'Status' },
                { key: 'user', label: 'User' },
                { key: 'recipient', label: 'Recipient' },
                { key: 'campaign_id', label: 'Campaign' },
                { key: 'comments', label: 'Comments' },
              ]}
            />
          </Panel>
          <Panel eyebrow="History" title={`Recordings (${formatNumber((detail.recordings || []).length)})`} icon={Activity} className="admin-wide-panel">
            <DataTable
              emptyLabel="No recordings for this lead"
              rows={(detail.recordings || []).map((row) => ({ ...row, id: row.recording_id }))}
              columns={[
                { key: 'start_time', label: 'Start', render: (row) => formatDateTime(row.start_time) },
                { key: 'length_in_sec', label: 'Seconds' },
                { key: 'filename', label: 'File' },
                { key: 'user', label: 'User' },
                {
                  key: 'location',
                  label: 'Listen',
                  render: (row) => (row.location ? <a className="row-action" href={row.location} target="_blank" rel="noreferrer"><ExternalLink size={14} aria-hidden="true" /> Open</a> : '—'),
                },
              ]}
            />
          </Panel>
        </>
      )}
    </>
  );
}

const DNC_SYSTEM_SCOPE = 'SYSTEM_INTERNAL';

function DncView({ admin, user, token }) {
  const canManage = userCan(user, 'dnc');
  const dncCampaigns = (admin?.campaigns || []).filter((row) => ['Y', 'AREACODE'].includes(row.use_campaign_dnc));
  const [scope, setScope] = useState(DNC_SYSTEM_SCOPE);
  const [action, setAction] = useState('add');
  const [numbers, setNumbers] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [searchPhone, setSearchPhone] = useState('');
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);

  async function submit(event) {
    event.preventDefault();
    if (!canManage) {
      setError('Your user is not allowed to manage the DNC list');
      return;
    }
    setSubmitting(true);
    setError('');
    setResult(null);
    try {
      const payload = await apiFetch('/admin/dnc', token, {
        method: 'POST',
        body: JSON.stringify({ scope, action, phone_numbers: numbers }),
      });
      setResult(payload.processed);
      setNumbers('');
    } catch (requestError) {
      const messages = {
        phone_numbers_required: 'Paste at least one phone number first',
        invalid_dnc_campaign: 'That campaign does not have campaign DNC enabled',
        dnc_campaign_not_allowed: 'Your user cannot manage DNC for that campaign',
        permission_denied: 'Your user is not allowed to manage the DNC list',
      };
      setError(messages[requestError.message] || 'DNC update failed');
    } finally {
      setSubmitting(false);
    }
  }

  async function runSearch(event) {
    event.preventDefault();
    setSearching(true);
    setSearchResults(null);
    try {
      const payload = await apiFetch(`/admin/dnc/search?phone=${encodeURIComponent(searchPhone.replace(/[^0-9]/g, ''))}`, token);
      setSearchResults(payload.entries || []);
    } catch (requestError) {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }

  return (
    <>
      <section className="metric-grid admin-metric-grid" aria-label="DNC metrics">
        <MetricCard icon={ShieldCheck} label="Campaign DNC Lists" value={formatNumber(dncCampaigns.length)} detail="Campaigns with DNC enabled" accent="#00d9ff" />
        <MetricCard icon={LockKeyhole} label="Delete Access" value={canManage ? 'Allowed' : 'No'} detail="delete_from_dnc permission" accent="#ffd166" />
      </section>
      <section className="admin-grid">
        <Panel eyebrow="Compliance" title="Add / Remove Numbers" icon={ShieldCheck} className="admin-wide-panel">
          <p className="action-copy">Paste one phone number per line. Choose the internal system list, or a specific campaign's DNC list.</p>
          <form className="entity-form" onSubmit={submit}>
            <div className="field-grid">
              <label>
                <span>Scope</span>
                <select value={scope} onChange={(event) => setScope(event.target.value)}>
                  <option value={DNC_SYSTEM_SCOPE}>SYSTEM_INTERNAL - Internal DNC list</option>
                  {dncCampaigns.map((row) => (
                    <option key={row.campaign_id} value={row.campaign_id}>{row.campaign_id} - {row.campaign_name}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Action</span>
                <select value={action} onChange={(event) => setAction(event.target.value)}>
                  <option value="add">Add to DNC</option>
                  <option value="delete">Remove from DNC</option>
                </select>
              </label>
              <label className="wide-field">
                <span>Phone Numbers (one per line)</span>
                <textarea rows={8} value={numbers} onChange={(event) => setNumbers(event.target.value)} placeholder={'18005551212\n18005551213'} />
              </label>
            </div>
            {error && <p className="form-error">{error}</p>}
            {result !== null && <p className="form-success">{result} number{result === 1 ? '' : 's'} processed</p>}
            <div className="modal-actions">
              <button type="submit" className="primary-action" disabled={submitting || !canManage}>
                <ShieldCheck size={18} aria-hidden="true" />
                {submitting ? 'Processing' : action === 'add' ? 'Add to DNC' : 'Remove from DNC'}
              </button>
            </div>
          </form>
        </Panel>
        <Panel eyebrow="Compliance" title="DNC Log Search" icon={Search}>
          <form className="entity-form" onSubmit={runSearch}>
            <div className="field-grid">
              <label>
                <span>Phone Number</span>
                <input value={searchPhone} onChange={(event) => setSearchPhone(event.target.value)} placeholder="18005551212" />
              </label>
            </div>
            <div className="modal-actions">
              <button type="submit" className="secondary-action" disabled={searching || searchPhone.replace(/[^0-9]/g, '').length < 3}>
                <Search size={16} aria-hidden="true" />
                {searching ? 'Searching' : 'Search'}
              </button>
            </div>
          </form>
          {searchResults && (
            <DataTable
              emptyLabel="No DNC log entries found for that number"
              rows={searchResults.map((row, index) => ({ ...row, id: index }))}
              columns={[
                { key: 'campaign_id', label: 'Campaign', render: (row) => (row.campaign_id === '-SYSINT-' ? 'SYSTEM' : row.campaign_id) },
                { key: 'action', label: 'Action', render: (row) => <StatusPill ok={row.action === 'add'}>{row.action.toUpperCase()}</StatusPill> },
                { key: 'action_date', label: 'Date', render: (row) => formatDateTime(row.action_date) },
                { key: 'user', label: 'User' },
              ]}
            />
          )}
        </Panel>
      </section>
    </>
  );
}

const INBOUND_HANDLING_TABS = [
  { key: 'ALL', label: 'All' },
  { key: 'PHONE', label: 'Phone' },
  { key: 'EMAIL', label: 'Email' },
];

function InboundView({ admin, user, onAction }) {
  const groups = admin?.inboundGroups || [];
  const canManage = userCan(user, 'inbound');
  const [handlingFilter, setHandlingFilter] = useState('ALL');
  const filteredGroups = handlingFilter === 'ALL'
    ? groups
    : groups.filter((row) => (row.group_handling || 'PHONE') === handlingFilter);

  return (
    <>
      <ActionBar entity="inbound" label="In-Group" user={user} onAction={onAction}>
        <p className="action-copy">Build inbound groups and tune queue basics from the GenX control layer.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Inbound Admin" title="Inbound Group Routing" icon={Headphones} className="admin-wide-panel">
          <div className="tab-row" role="tablist" aria-label="Filter by handling type">
            {INBOUND_HANDLING_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={handlingFilter === tab.key}
                className={handlingFilter === tab.key ? 'tab-pill active' : 'tab-pill'}
                onClick={() => setHandlingFilter(tab.key)}
              >
                {tab.label}
                {tab.key !== 'ALL' && (
                  <span className="tab-count">{groups.filter((row) => (row.group_handling || 'PHONE') === tab.key).length}</span>
                )}
              </button>
            ))}
          </div>
          <DataTable
            emptyLabel="No inbound groups configured"
            rows={filteredGroups.map((row) => ({ ...row, id: row.group_id }))}
            columns={[
              {
                key: 'group',
                label: 'Group',
                render: (row) => (
                  <>
                    <strong>{row.group_id}</strong>
                    <span>{row.group_name || row.group_color || 'Unnamed group'}</span>
                  </>
                ),
              },
              { key: 'group_handling', label: 'Handling', render: (row) => <StatusPill ok={(row.group_handling || 'PHONE') === 'PHONE'}>{row.group_handling || 'PHONE'}</StatusPill> },
              { key: 'next_agent_call', label: 'Routing', render: (row) => row.next_agent_call || 'Default' },
              { key: 'queue_priority', label: 'Priority', render: (row) => row.queue_priority ?? '0' },
              { key: 'drop_call_seconds', label: 'Drop Sec', render: (row) => row.drop_call_seconds ?? '0' },
              { key: 'drop_action', label: 'Drop Action', render: (row) => row.drop_action || 'HANGUP' },
              { key: 'no_agent_action', label: 'No Agent', render: (row) => row.no_agent_action || 'Default' },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('inbound', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function UserGroupsView({ admin, user, onAction }) {
  const groups = admin?.userGroups || [];
  const canManage = userCan(user, 'userGroups');

  return (
    <>
      <ActionBar entity="userGroups" label="Group" user={user} onAction={onAction}>
        <p className="action-copy">Control campaign access, report access, queue visibility, and manager scope from the GenX permission layer.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Access" title="User Groups" icon={ShieldCheck} className="admin-wide-panel">
          <DataTable
            emptyLabel="No user groups returned"
            rows={groups.map((row) => ({ ...row, id: row.user_group }))}
            columns={[
              {
                key: 'group',
                label: 'Group',
                render: (row) => (
                  <>
                    <strong>{row.user_group}</strong>
                    <span>{row.group_name || 'Unnamed group'}</span>
                  </>
                ),
              },
              { key: 'allowed_campaigns', label: 'Campaigns', render: (row) => row.allowed_campaigns || 'None' },
              { key: 'allowed_reports', label: 'Reports', render: (row) => row.allowed_reports || 'None' },
              { key: 'admin_viewable_groups', label: 'Admin Groups', render: (row) => row.admin_viewable_groups || 'None' },
              { key: 'allowed_queue_groups', label: 'Queues', render: (row) => row.allowed_queue_groups || 'None' },
              { key: 'shift_enforcement', label: 'Shift', render: (row) => row.shift_enforcement || 'OFF' },
              {
                key: 'genx_nav_sections',
                label: 'Nav Access',
                render: (row) => {
                  const sections = navSectionValues(row.genx_nav_sections);
                  return sections.length === NAV_SECTION_OPTIONS.length ? 'Full' : sections.join(', ');
                },
              },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('userGroups', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function DidsView({ admin, user, onAction }) {
  const dids = admin?.dids || [];
  const canManage = userCan(user, 'dids');

  return (
    <>
      <ActionBar entity="dids" label="DID" user={user} onAction={onAction}>
        <p className="action-copy">Route inbound numbers to groups, users, phones, menus, voicemail, and filtered fallback paths.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Inbound" title="DID Routing" icon={PhoneCall} className="admin-wide-panel">
          <DataTable
            emptyLabel="No DIDs returned"
            rows={dids.map((row) => ({ ...row, id: row.did_pattern }))}
            columns={[
              {
                key: 'did',
                label: 'DID',
                render: (row) => (
                  <>
                    <strong>{row.did_pattern}</strong>
                    <span>{row.did_description || row.did_carrier_description || 'No description'}</span>
                  </>
                ),
              },
              { key: 'did_route', label: 'Route', render: (row) => row.did_route || 'EXTEN' },
              { key: 'group_id', label: 'In-Group', render: (row) => row.group_id || 'None' },
              { key: 'extension', label: 'Extension', render: (row) => row.extension || row.phone || 'None' },
              { key: 'server_ip', label: 'Server', render: (row) => row.server_ip || 'Default' },
              { key: 'record_call', label: 'Record', render: (row) => <StatusPill ok={row.record_call === 'Y'}>{row.record_call === 'Y' ? 'On' : 'Off'}</StatusPill> },
              { key: 'did_active', label: 'Status', render: (row) => <StatusPill ok={row.did_active === 'Y'}>{row.did_active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('dids', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function PhonesView({ admin, user, onAction }) {
  const phones = admin?.phones || [];
  const canManage = userCan(user, 'phones');

  return (
    <>
      <ActionBar entity="phones" label="Phone" user={user} onAction={onAction}>
        <p className="action-copy">Manage phone endpoints, SIP settings, webphone toggles, and user-group ownership.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Platform" title="Phones and Webphones" icon={PhoneCall} className="admin-wide-panel">
          <DataTable
            emptyLabel="No phones returned"
            rows={phones.map((row) => ({ ...row, id: `${row.extension}-${row.server_ip}` }))}
            columns={[
              {
                key: 'extension',
                label: 'Extension',
                render: (row) => (
                  <>
                    <strong>{row.extension}</strong>
                    <span>{row.fullname || row.login || 'No owner label'}</span>
                  </>
                ),
              },
              { key: 'server_ip', label: 'Server', render: (row) => row.server_ip || 'Default' },
              { key: 'protocol', label: 'Protocol', render: (row) => row.protocol || row.phone_type || 'SIP' },
              { key: 'user_group', label: 'Group', render: (row) => row.user_group || 'Default' },
              { key: 'is_webphone', label: 'Webphone', render: (row) => <StatusPill ok={row.is_webphone === 'Y'}>{row.is_webphone === 'Y' ? 'Yes' : 'No'}</StatusPill> },
              { key: 'peer_status', label: 'Peer', render: (row) => row.peer_status || row.status || 'Unknown' },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('phones', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Aliases"
          title={`Phone Aliases (${formatNumber((admin?.phoneAliases || []).length)})`}
          icon={PhoneCall}
          headerActions={canManage ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('phoneAliases', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No phone aliases (multi-phone ring groups for one login)"
            rows={(admin?.phoneAliases || []).map((row) => ({ ...row, id: row.alias_id }))}
            columns={[
              { key: 'alias_id', label: 'Alias' },
              { key: 'alias_name', label: 'Name' },
              { key: 'logins_list', label: 'Phone Logins' },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('phoneAliases', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Aliases"
          title={`Group Aliases (${formatNumber((admin?.groupAliases || []).length)})`}
          icon={PhoneCall}
          headerActions={canManage ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('groupAliases', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No group aliases (outbound CallerID sets agents can choose)"
            rows={(admin?.groupAliases || []).map((row) => ({ ...row, id: row.group_alias_id }))}
            columns={[
              { key: 'group_alias_id', label: 'Alias' },
              { key: 'group_alias_name', label: 'Name' },
              { key: 'caller_id_number', label: 'CID Number' },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('groupAliases', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function ScriptsView({ admin, user, onAction }) {
  const scripts = admin?.scripts || [];
  const canManage = userCan(user, 'scripts');

  return (
    <>
      <ActionBar entity="scripts" label="Script" user={user} onAction={onAction}>
        <p className="action-copy">Manage agent scripts, prompt text, active state, color, and user-group ownership.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Agent Screen" title="Scripts and Agent Prompts" icon={FileText} className="admin-wide-panel">
          <DataTable
            emptyLabel="No scripts returned"
            rows={scripts.map((row) => ({ ...row, id: row.script_id }))}
            columns={[
              {
                key: 'script',
                label: 'Script',
                render: (row) => (
                  <>
                    <strong>{row.script_id}</strong>
                    <span>{row.script_name || row.script_comments || 'Unnamed script'}</span>
                  </>
                ),
              },
              { key: 'user_group', label: 'Group', render: (row) => row.user_group || '---ALL---' },
              { key: 'script_color', label: 'Color', render: (row) => row.script_color || 'white' },
              { key: 'script_text', label: 'Text', render: (row) => `${String(row.script_text || '').length} chars` },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('scripts', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function LeadFiltersView({ admin, user, onAction }) {
  const filters = admin?.leadFilters || [];
  const canManage = userCan(user, 'leadFilters');

  return (
    <>
      <ActionBar entity="leadFilters" label="Filter" user={user} onAction={onAction}>
        <p className="action-copy">Manage lead filter rules used by campaigns and manual dialing controls.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Lead Admin" title="Lead Filters" icon={SlidersHorizontal} className="admin-wide-panel">
          <DataTable
            emptyLabel="No lead filters returned"
            rows={filters.map((row) => ({ ...row, id: row.lead_filter_id }))}
            columns={[
              {
                key: 'filter',
                label: 'Filter',
                render: (row) => (
                  <>
                    <strong>{row.lead_filter_id}</strong>
                    <span>{row.lead_filter_name || row.lead_filter_comments || 'Unnamed filter'}</span>
                  </>
                ),
              },
              { key: 'user_group', label: 'Group', render: (row) => row.user_group || '---ALL---' },
              { key: 'lead_filter_sql', label: 'SQL', render: (row) => `${String(row.lead_filter_sql || '').length} chars` },
              { key: 'lead_filter_comments', label: 'Comments', render: (row) => row.lead_filter_comments || 'None' },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('leadFilters', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function FilterPhoneGroupsView({ admin, user, onAction }) {
  const groups = admin?.filterPhoneGroups || [];
  const canManage = userCan(user, 'filterPhoneGroups');

  return (
    <>
      <ActionBar entity="filterPhoneGroups" label="Filter Group" user={user} onAction={onAction}>
        <p className="action-copy">Manage phone-number filter groups used by DID and call menu filter routing.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Inbound Admin" title="Filter Phone Groups" icon={SlidersHorizontal} className="admin-wide-panel">
          <DataTable
            emptyLabel="No filter phone groups configured"
            rows={groups.map((row) => ({ ...row, id: row.filter_phone_group_id }))}
            columns={[
              {
                key: 'group',
                label: 'Group',
                render: (row) => (
                  <>
                    <strong>{row.filter_phone_group_id}</strong>
                    <span>{row.filter_phone_group_name || 'Unnamed group'}</span>
                  </>
                ),
              },
              { key: 'filter_phone_group_description', label: 'Description', render: (row) => row.filter_phone_group_description || 'None' },
              { key: 'user_group', label: 'Group', render: (row) => row.user_group || '---ALL---' },
              { key: 'phone_count', label: 'Numbers', render: (row) => formatNumber(row.phone_count || 0) },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('filterPhoneGroups', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function CallTimesView({ admin, user, onAction }) {
  const callTimes = admin?.callTimes || [];
  const canManage = userCan(user, 'callTimes');

  return (
    <>
      <ActionBar entity="callTimes" label="Call Time" user={user} onAction={onAction}>
        <p className="action-copy">Manage dialing windows, day-specific overrides, after-hours audio, state rules, and holiday blocks.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Schedule" title="Call Times" icon={Timer} className="admin-wide-panel">
          <DataTable
            emptyLabel="No call times returned"
            rows={callTimes.map((row) => ({ ...row, id: row.call_time_id }))}
            columns={[
              {
                key: 'call_time',
                label: 'Call Time',
                render: (row) => (
                  <>
                    <strong>{row.call_time_id}</strong>
                    <span>{row.call_time_name || row.call_time_comments || 'Unnamed call time'}</span>
                  </>
                ),
              },
              { key: 'default_window', label: 'Default', render: (row) => `${row.ct_default_start}-${row.ct_default_stop}` },
              { key: 'monday', label: 'Monday', render: (row) => `${row.ct_monday_start}-${row.ct_monday_stop}` },
              { key: 'user_group', label: 'Group', render: (row) => row.user_group || '---ALL---' },
              { key: 'ct_state_call_times', label: 'States', render: (row) => String(row.ct_state_call_times || '').trim() ? 'Configured' : 'None' },
              { key: 'ct_holidays', label: 'Holidays', render: (row) => String(row.ct_holidays || '').trim() ? 'Configured' : 'None' },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('callTimes', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Schedule"
          title={`State Call Times (${formatNumber((admin?.stateCallTimes || []).length)})`}
          icon={Timer}
          headerActions={userCan(user, 'stateCallTimes') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('stateCallTimes', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No state call times (per-state dialing window overrides)"
            rows={(admin?.stateCallTimes || []).map((row) => ({ ...row, id: row.state_call_time_id }))}
            columns={[
              { key: 'state_call_time_id', label: 'ID' },
              { key: 'state_call_time_state', label: 'State' },
              { key: 'state_call_time_name', label: 'Name' },
              { key: 'default_window', label: 'Default', render: (row) => `${row.sct_default_start}-${row.sct_default_stop}` },
              ...(userCan(user, 'stateCallTimes') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('stateCallTimes', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Schedule"
          title={`Holidays (${formatNumber((admin?.holidays || []).length)})`}
          icon={CalendarDays}
          headerActions={userCan(user, 'holidays') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('holidays', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No holidays (date-specific call time overrides)"
            rows={(admin?.holidays || []).map((row) => ({ ...row, id: row.holiday_id }))}
            columns={[
              { key: 'holiday_id', label: 'ID' },
              { key: 'holiday_name', label: 'Name' },
              { key: 'holiday_date', label: 'Date', render: (row) => String(row.holiday_date || '').slice(0, 10) },
              { key: 'holiday_status', label: 'Status', render: (row) => <StatusPill ok={row.holiday_status === 'ACTIVE'}>{row.holiday_status}</StatusPill> },
              ...(userCan(user, 'holidays') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('holidays', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function CallMenusView({ admin, user, onAction }) {
  const menus = admin?.callMenus || [];
  const menuOptions = admin?.callMenuOptions || [];
  const canManage = userCan(user, 'callMenus');
  const canManageOptions = userCan(user, 'callMenuOptions');

  return (
    <>
      <ActionBar entity="callMenus" label="Call Menu" user={user} onAction={onAction}>
        <p className="action-copy">Manage IVR call menus, prompt files, timeout handling, call-time checks, and DTMF logging.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Inbound" title="Call Menus" icon={Compass} className="admin-wide-panel">
          <DataTable
            emptyLabel="No call menus returned"
            rows={menus.map((row) => ({ ...row, id: row.menu_id }))}
            columns={[
              {
                key: 'menu',
                label: 'Menu',
                render: (row) => (
                  <>
                    <strong>{row.menu_id}</strong>
                    <span>{row.menu_name || row.menu_prompt || 'Unnamed call menu'}</span>
                  </>
                ),
              },
              { key: 'user_group', label: 'Group', render: (row) => row.user_group || '---ALL---' },
              { key: 'call_time_id', label: 'Call Time', render: (row) => row.call_time_id || 'None' },
              { key: 'menu_timeout', label: 'Timeout', render: (row) => `${row.menu_timeout || 0}s` },
              { key: 'dtmf_log', label: 'DTMF', render: (row) => <StatusPill ok={row.dtmf_log === '1'}>{row.dtmf_log === '1' ? 'On' : 'Off'}</StatusPill> },
              { key: 'answer_signal', label: 'Answer', render: (row) => row.answer_signal || 'Y' },
              ...(canManage ? [{
                key: 'actions',
                label: 'Action',
                render: (row) => (
                  <RowActions>
                    <ManageButton onClick={() => onAction('callMenus', 'edit', row)} />
                    {canManageOptions && <ManageButton icon={Plus} onClick={() => onAction('callMenuOptions', 'create', { menu_id: row.menu_id, _menuLocked: true })}>Option</ManageButton>}
                  </RowActions>
                ),
              }] : []),
            ]}
          />
        </Panel>
        <Panel eyebrow="DTMF" title="Call Menu Options" icon={SlidersHorizontal} className="admin-wide-panel">
          <DataTable
            emptyLabel="No call menu options returned"
            rows={menuOptions.map((row) => ({ ...row, id: `${row.menu_id}-${row.option_value}` }))}
            columns={[
              {
                key: 'option',
                label: 'Option',
                render: (row) => (
                  <>
                    <strong>{row.menu_id} / {row.option_value}</strong>
                    <span>{row.option_description || row.menu_name || 'Menu route'}</span>
                  </>
                ),
              },
              { key: 'option_route', label: 'Route', render: (row) => row.option_route || 'None' },
              { key: 'option_route_value', label: 'Target', render: (row) => row.option_route_value || 'None' },
              { key: 'option_route_value_context', label: 'Context', render: (row) => row.option_route_value_context ? 'Configured' : 'None' },
              ...(canManageOptions ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('callMenuOptions', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function ShiftsView({ admin, user, onAction }) {
  const shifts = admin?.shifts || [];
  const canManage = userCan(user, 'shifts');

  return (
    <>
      <ActionBar entity="shifts" label="Shift" user={user} onAction={onAction}>
        <p className="action-copy">Manage login shift windows used by user-group enforcement and reporting visibility.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Access" title="Shifts" icon={Clock3} className="admin-wide-panel">
          <DataTable
            emptyLabel="No shifts returned"
            rows={shifts.map((row) => ({ ...row, id: row.shift_id }))}
            columns={[
              {
                key: 'shift',
                label: 'Shift',
                render: (row) => (
                  <>
                    <strong>{row.shift_id}</strong>
                    <span>{row.shift_name || 'Unnamed shift'}</span>
                  </>
                ),
              },
              { key: 'window', label: 'Window', render: (row) => `${row.shift_start_time || '0900'} for ${row.shift_length || '16:00'}` },
              { key: 'shift_weekdays', label: 'Days', render: (row) => weekdayValues(row.shift_weekdays).map((value) => WEEKDAY_OPTIONS.find((option) => option.value === value)?.label?.slice(0, 3)).filter(Boolean).join(', ') || 'None' },
              { key: 'user_group', label: 'Group', render: (row) => row.user_group || '---ALL---' },
              { key: 'report_option', label: 'Reports', render: (row) => <StatusPill ok={row.report_option === 'Y'}>{row.report_option === 'Y' ? 'On' : 'Off'}</StatusPill> },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('shifts', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function StatusesView({ admin, user, onAction }) {
  const statuses = admin?.statuses || [];
  const canManageSystem = userCan(user, 'statuses');

  return (
    <>
      <ActionBar entity="statuses" label="System Status" user={user} onAction={onAction}>
        <p className="action-copy">Manage system disposition codes, reporting categories, callbacks, DNC, sale flags, and contact outcomes.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="System" title="System Statuses" icon={Gauge} className="admin-wide-panel">
          <DataTable
            emptyLabel="No system statuses returned"
            rows={statuses.map((row) => ({ ...row, id: row.status }))}
            columns={[
              {
                key: 'status',
                label: 'Status',
                render: (row) => (
                  <>
                    <strong>{row.status}</strong>
                    <span>{row.status_name || 'Unnamed status'}</span>
                  </>
                ),
              },
              { key: 'category', label: 'Category', render: (row) => row.category || 'UNDEFINED' },
              { key: 'selectable', label: 'Selectable', render: (row) => <StatusPill ok={row.selectable === 'Y'}>{row.selectable === 'Y' ? 'Yes' : 'No'}</StatusPill> },
              { key: 'sale', label: 'Sale', render: (row) => row.sale || 'N' },
              { key: 'dnc', label: 'DNC', render: (row) => row.dnc || 'N' },
              { key: 'callback', label: 'Callback', render: (row) => row.scheduled_callback || 'N' },
              ...(canManageSystem ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('statuses', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Grouping"
          title={`Status Groups (${formatNumber((admin?.statusGroups || []).length)})`}
          icon={Gauge}
          headerActions={userCan(user, 'statusGroups') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('statusGroups', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No status groups (per-list status set overrides)"
            rows={(admin?.statusGroups || []).map((row) => ({ ...row, id: row.status_group_id }))}
            columns={[
              { key: 'status_group_id', label: 'ID' },
              { key: 'status_group_notes', label: 'Notes' },
              { key: 'user_group', label: 'Group', render: (row) => row.user_group || '---ALL---' },
              ...(userCan(user, 'statusGroups') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('statusGroups', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Grouping"
          title={`Status Categories (${formatNumber((admin?.statusCategories || []).length)})`}
          icon={Gauge}
          headerActions={userCan(user, 'statusCategories') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('statusCategories', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No status categories"
            rows={(admin?.statusCategories || []).map((row) => ({ ...row, id: row.vsc_id }))}
            columns={[
              { key: 'vsc_id', label: 'ID' },
              { key: 'vsc_name', label: 'Name' },
              { key: 'tovdad_display', label: 'TimeOnVDAD', render: (row) => (row.tovdad_display === 'Y' ? 'Yes' : 'No') },
              { key: 'sale_category', label: 'Sale', render: (row) => (row.sale_category === 'Y' ? 'Yes' : 'No') },
              { key: 'dead_lead_category', label: 'Dead Lead', render: (row) => (row.dead_lead_category === 'Y' ? 'Yes' : 'No') },
              ...(userCan(user, 'statusCategories') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('statusCategories', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function CatalogPanels({ groups, query, emptyLabel, onNavigate, eyebrow = 'Reports' }) {
  const normalized = query.trim().toLowerCase();
  const filtered = groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => (
        !normalized
        || item.label.toLowerCase().includes(normalized)
        || item.href.toLowerCase().includes(normalized)
        || group.title.toLowerCase().includes(normalized)
      )),
    }))
    .filter((group) => group.items.length);

  if (!filtered.length) return <div className="empty-state">{emptyLabel}</div>;

  return (
    <section className="catalog-grid">
      {filtered.map((group) => (
        <Panel key={group.title} eyebrow={eyebrow} title={group.title} icon={ExternalLink}>
          <div className="link-list">
            {group.items.map((item) => (
              item.view ? (
                // Real link (hash route) so open-in-new-tab works; left click
                // stays in-app.
                <a
                  key={`${group.title}-${item.label}`}
                  href={`#/${item.view}`}
                  className="launch-link launch-link-native"
                  onClick={(event) => {
                    if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
                    event.preventDefault();
                    onNavigate?.(item.view);
                  }}
                >
                  <span>{item.label}</span>
                  <ShieldCheck size={15} aria-hidden="true" title="Native GenX screen" />
                </a>
              ) : (
                <a key={`${group.title}-${item.label}`} className="launch-link" href={item.href} target="_blank" rel="noreferrer">
                  <span>{item.label}</span>
                  <ExternalLink size={15} aria-hidden="true" />
                </a>
              )
            ))}
          </div>
        </Panel>
      ))}
    </section>
  );
}

function CatalogSearch({ value, onChange, placeholder }) {
  return (
    <div className="catalog-search">
      <Search size={17} aria-hidden="true" />
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </div>
  );
}

// The Reporting Center lists only native GenX report screens; the legacy
// report links live on the Admin Reports page (Admin nav section).
const NATIVE_REPORT_GROUPS = REPORT_GROUPS
  .map((group) => ({ ...group, items: group.items.filter((item) => item.view) }))
  .filter((group) => group.items.length);

// DISPLAY-SIDE convenience only — the server is the enforcing layer for
// every report route. Legacy vicidial_user_groups.allowed_reports stores
// legacy report NAMES, so native GenX screens are matched by fuzzy substring
// against label/href/group title (a value like 'call' intentionally matches
// several screens). A non-'all' scope that parses to zero values falls back
// to showing everything, mirroring how legacy treats an unset field. Don't
// "tighten" this into a security boundary or users lose links to screens the
// server would happily serve them.
function reportGroupsForUser(user) {
  const scope = user?.permissions?.allowedReports;
  if (Number(user?.userLevel || 0) >= 9 || scope?.all) return NATIVE_REPORT_GROUPS;
  if (!user?.viewReports) return [];
  const allowed = (scope?.values || []).map((value) => value.toLowerCase());
  if (!allowed.length) return NATIVE_REPORT_GROUPS;
  return NATIVE_REPORT_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => allowed.some((value) => (
        item.label.toLowerCase().includes(value)
        || item.href.toLowerCase().includes(value)
        || group.title.toLowerCase().includes(value)
      ))),
    }))
    .filter((group) => group.items.length);
}

// Admin Reports: the reviewed legacy report pages, external links only.
// Reached through the Admin nav section, so restricted groups never see it.
function AdminReportsView() {
  const [query, setQuery] = useState('');
  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Admin</p>
          <h2>Legacy Admin Reports</h2>
          <p className="action-copy">The original dialer report pages. Day-to-day reporting lives in the Reporting Center; these remain for side-by-side checks and the few tools without a native screen yet.</p>
        </div>
        <CatalogSearch value={query} onChange={setQuery} placeholder="Search legacy reports" />
      </section>
      <CatalogPanels groups={LEGACY_REPORT_GROUPS} query={query} emptyLabel="No legacy reports match that search" eyebrow="Legacy" />
    </>
  );
}

function ReportsView({ dashboard, admin, user, onNavigate }) {
  const [query, setQuery] = useState('');
  const metrics = dashboard?.metrics || {};
  const reportGroups = reportGroupsForUser(user);
  const visibleReportCount = reportGroups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      <section className="metric-grid admin-metric-grid" aria-label="Report metrics">
        <MetricCard icon={FileText} label="Reports" value={formatNumber(visibleReportCount)} detail="Native GenX reports" accent="#00d9ff" />
        <MetricCard icon={PhoneCall} label="Calls Today" value={formatNumber(metrics.callsToday)} detail={`${formatNumber(metrics.outboundCalls)} outbound | ${formatNumber(metrics.inboundCalls)} inbound`} accent="#73fbd3" />
        <MetricCard icon={Users} label="Users" value={formatNumber(admin?.counts?.users)} detail={`${formatNumber(admin?.counts?.activeUsers)} active`} accent="#a8c7ff" />
        <MetricCard icon={Activity} label="Recordings" value={formatNumber(metrics.recordingsToday)} detail="Current selected range" accent="#ffd166" />
      </section>


      <section className="report-hero">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Reporting Center</h2>
          <p className="action-copy">GenX report screens, built for this platform. Legacy report pages moved to Admin Reports under the Admin section.</p>
        </div>
        <CatalogSearch value={query} onChange={setQuery} placeholder="Search reports" />
      </section>

      <CatalogPanels groups={reportGroups} query={query} emptyLabel={user?.viewReports ? 'No reports match that search' : 'Your user is not allowed to view reports'} onNavigate={onNavigate} />
    </>
  );
}

// Custom Report Matrix: one page where the user assembles a report from a
// server-side dataset registry (dimensions x measures x filters), runs it,
// and can save the configuration under their own name (shared with their
// user group by default). The server compiles the SQL; this view only ever
// sends registry keys and filter values.
function CustomReportView({ token }) {
  const today = localDateStr();
  const [meta, setMeta] = useState(null);
  const [saved, setSaved] = useState([]);
  // These defaults are keys into CUSTOM_REPORT_DATASETS in server/index.js —
  // the server registry is the source of truth. Renaming a dataset/dimension/
  // measure key server-side silently breaks this initial state (empty picker
  // panels, first Run returns 400).
  const [datasetKey, setDatasetKey] = useState('outbound_calls');
  const [dims, setDims] = useState(['campaign_id']);
  const [measures, setMeasures] = useState(['calls', 'talk_sec']);
  const [filters, setFilters] = useState({});
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [beginTime, setBeginTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saveName, setSaveName] = useState('');
  const [shared, setShared] = useState(true);
  const [activeSavedId, setActiveSavedId] = useState(null);
  const [scheduleFor, setScheduleFor] = useState(null);
  const [schedules, setSchedules] = useState([]);
  // Wire formats dictated by vicidial_automated_reports (consumed by the
  // stock ADMIN_keepalive_ALL.pl scheduler): weekdays is a concatenated
  // digit string '0'=Sun..'6'=Sat ('12345' = Mon-Fri) and time is sent as
  // 4-digit HHMM (the ':' is stripped on submit). Storing anything else
  // creates schedule rows the cron runner silently never matches.
  const [scheduleForm, setScheduleForm] = useState({
    time: '07:00', weekdays: '12345', range: 'yesterday', email_to: '', email_from: '', email_subject: '', run_now: false,
  });

  const dataset = meta?.datasets?.find((item) => item.key === datasetKey) || null;

  const loadSaved = useCallback(() => {
    apiFetch('/reports/custom/saved', token).then((payload) => setSaved(payload.reports || [])).catch(() => {});
  }, [token]);

  useEffect(() => {
    apiFetch('/reports/custom/meta', token)
      .then(setMeta)
      .catch((requestError) => setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'Could not load report options'));
    loadSaved();
  }, [token, loadSaved]);

  function pickDataset(key) {
    const next = meta?.datasets?.find((item) => item.key === key);
    setDatasetKey(key);
    setDims(next?.dimensions?.length ? [next.dimensions[0].key] : []);
    setMeasures(next?.measures?.length ? [next.measures[0].key] : []);
    setFilters({});
    setResult(null);
    setActiveSavedId(null);
  }

  function toggleKey(list, setList, key) {
    setList(list.includes(key) ? list.filter((item) => item !== key) : [...list, key]);
  }

  // Saved configs are deliberately DATE-FREE: schedules apply named relative
  // ranges server-side (customFeedRange) and interactive users re-pick dates
  // on load. Persisting beginDate/endDate here would make every scheduled
  // feed email a permanently stale fixed range — this is not a lost field.
  function config() {
    return {
      dataset: datasetKey,
      dimensions: dims,
      measures,
      filters,
    };
  }

  async function run(event) {
    event?.preventDefault();
    setLoading(true);
    setError('');
    setNotice('');
    try {
      const payload = await apiFetch('/reports/custom/run', token, {
        method: 'POST',
        body: JSON.stringify({
          ...config(),
          begin_date: beginDate,
          end_date: endDate,
          begin_time: beginTime ? `${beginTime}:00` : '',
          end_time: endTime ? `${endTime}:59` : '',
        }),
      });
      setResult(payload);
    } catch (requestError) {
      setResult(null);
      // Surface the server's specific 400 reason: a saved report whose
      // dataset key was removed from the registry returns unknown_dataset,
      // which must not be masked as a missing-measure complaint.
      setError(requestError.status === 400
        ? (requestError.message === 'unknown_dataset'
          ? 'This report references a dataset that no longer exists - pick a dataset and re-save'
          : 'Pick at least one measure')
        : 'Report failed to run');
    } finally {
      setLoading(false);
    }
  }

  async function saveReport() {
    const name = saveName.trim();
    if (!name) {
      setError('Give the report a name before saving');
      return;
    }
    setError('');
    try {
      const payload = await apiFetch(
        activeSavedId ? `/reports/custom/saved/${activeSavedId}` : '/reports/custom/saved',
        token,
        { method: activeSavedId ? 'PUT' : 'POST', body: JSON.stringify({ name, shared, config: config() }) },
      );
      setActiveSavedId(payload.report_id || activeSavedId);
      setNotice(`Saved "${name}"`);
      loadSaved();
    } catch (requestError) {
      setError(requestError.status === 403 ? 'Only the owner can update this report' : 'Save failed');
    }
  }

  function loadReport(report) {
    setDatasetKey(report.config.dataset);
    setDims(report.config.dimensions || []);
    setMeasures(report.config.measures || []);
    setFilters(report.config.filters || {});
    setSaveName(report.report_name);
    setShared(report.shared !== 'N');
    setActiveSavedId(report.report_id);
    setResult(null);
    setNotice('');
  }

  async function deleteReport(report) {
    try {
      await apiFetch(`/reports/custom/saved/${report.report_id}`, token, { method: 'DELETE' });
      if (activeSavedId === report.report_id) setActiveSavedId(null);
      if (scheduleFor?.report_id === report.report_id) setScheduleFor(null);
      loadSaved();
    } catch (requestError) {
      setError(requestError.status === 403 ? 'Only the owner can delete this report' : 'Delete failed');
    }
  }

  function loadSchedules(reportId) {
    apiFetch(`/reports/custom/saved/${reportId}/schedules`, token)
      .then((payload) => setSchedules(payload.schedules || []))
      .catch(() => setSchedules([]));
  }

  function openSchedule(report) {
    setScheduleFor(report);
    setNotice('');
    setError('');
    loadSchedules(report.report_id);
  }

  async function submitSchedule(event) {
    event?.preventDefault();
    if (!scheduleFor) return;
    if (!scheduleForm.email_to.trim()) {
      setError('Enter at least one destination email');
      return;
    }
    setError('');
    try {
      const payload = await apiFetch(`/reports/custom/saved/${scheduleFor.report_id}/schedule`, token, {
        method: 'POST',
        body: JSON.stringify({
          ...scheduleForm,
          time: scheduleForm.time.replace(':', ''),
        }),
      });
      setNotice(`Scheduled as ${payload.schedule_id}${scheduleForm.run_now ? ' - a test email is being generated now' : ''}`);
      loadSchedules(scheduleFor.report_id);
    } catch (requestError) {
      setError(requestError.status === 403 ? 'Your user cannot manage automated reports' : 'Schedule failed');
    }
  }

  async function deleteSchedule(schedule) {
    try {
      // NAME COLLISION: schedule.report_id is a vicidial_automated_reports id
      // (string like 'GENXCR12X...'), while a saved report's report_id (as in
      // deleteReport/scheduleFor) is the numeric genx_saved_reports key. Two
      // different tables — never pass one where the other is expected.
      await apiFetch(`/admin/automated-reports/${schedule.report_id}`, token, { method: 'DELETE' });
      if (scheduleFor) loadSchedules(scheduleFor.report_id);
    } catch (requestError) {
      setError(requestError.status === 403 ? 'Your user cannot manage automated reports' : 'Schedule delete failed');
    }
  }

  function setFilterValue(key, value) {
    setFilters((current) => {
      const next = { ...current };
      const isEmpty = Array.isArray(value) ? !value.length : !String(value || '').trim();
      if (isEmpty) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  const tableColumns = (result?.columns || []).map((column) => ({ key: column.key, label: column.label }));

  return (
    <div className="log-report custom-report">
      <section className="admin-grid log-report-top">
        <Panel eyebrow="Custom Report" title="Report Setup" icon={SlidersHorizontal}>
          <form className="entity-form report-filter-bar" onSubmit={run}>
            <div className="field-grid">
              <label>
                <span>Dataset</span>
                <select value={datasetKey} onChange={(event) => pickDataset(event.target.value)}>
                  {(meta?.datasets || []).map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>Begin Date</span>
                <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
              </label>
              <label>
                <span>End Date</span>
                <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
              </label>
              <label>
                <span>Begin Time</span>
                <input type="time" value={beginTime} onChange={(event) => setBeginTime(event.target.value)} />
              </label>
              <label>
                <span>End Time</span>
                <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </label>
            </div>
            <div className="modal-actions">
              <button type="submit" className="primary-action" disabled={loading || !measures.length}>
                <Search size={16} aria-hidden="true" />
                {loading ? 'Loading' : 'Run Report'}
              </button>
            </div>
          </form>
        </Panel>
        <Panel eyebrow="Custom Report" title="Rows &amp; Values" icon={BarChart3}>
          <p className="action-copy">Group By (up to 3)</p>
          <div className="checkbox-grid">
            {(dataset?.dimensions || []).map((item) => (
              <label key={item.key} className="checkbox-inline">
                <input
                  type="checkbox"
                  checked={dims.includes(item.key)}
                  disabled={!dims.includes(item.key) && dims.length >= 3}
                  onChange={() => toggleKey(dims, setDims, item.key)}
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
          <p className="action-copy">Values</p>
          <div className="checkbox-grid">
            {(dataset?.measures || []).map((item) => (
              <label key={item.key} className="checkbox-inline">
                <input type="checkbox" checked={measures.includes(item.key)} onChange={() => toggleKey(measures, setMeasures, item.key)} />
                <span>{item.label}</span>
              </label>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Custom Report" title="Filters" icon={Search}>
          <div className="field-grid">
            {(dataset?.filters || []).map((item) => (
              <label key={item.key}>
                <span>{item.label}</span>
                {item.picker ? (
                  <select
                    multiple
                    value={Array.isArray(filters[item.key]) ? filters[item.key] : []}
                    onChange={(event) => setFilterValue(item.key, [...event.target.selectedOptions].map((option) => option.value))}
                  >
                    {(meta?.pickers?.[item.picker] || []).map((value) => (
                      <option key={value} value={value}>{value}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    placeholder="Comma-separated"
                    value={Array.isArray(filters[item.key]) ? filters[item.key].join(',') : (filters[item.key] || '')}
                    onChange={(event) => setFilterValue(item.key, event.target.value)}
                  />
                )}
              </label>
            ))}
          </div>
        </Panel>
      </section>

      {(error || notice) && <div className={error ? 'form-error' : 'connection-summary'}>{error || notice}</div>}

      <Panel
        eyebrow="Custom Report"
        title="Results"
        icon={FileText}
        headerActions={result?.rows?.length ? (
          <button
            type="button"
            className="row-action"
            onClick={() => downloadCsv(
              `custom_report_${datasetKey}_${beginDate}_${endDate}.csv`,
              tableColumns.map((column) => ({ label: column.label, value: (row) => row[column.key] })),
              result.rows,
            )}
          >
            Download CSV
          </button>
        ) : null}
      >
        {result?.truncated && <p className="action-copy">Results were capped - narrow the date range or add filters.</p>}
        <DataTable
          columns={tableColumns.length ? tableColumns : [{ key: 'empty', label: 'Results' }]}
          rows={result?.rows || []}
          emptyLabel={result ? 'No rows for that selection' : 'Choose options and press Run Report'}
        />
      </Panel>

      <section className="admin-grid" style={{ gridTemplateColumns: 'minmax(0, 2fr) minmax(0, 1fr)' }}>
        <Panel eyebrow="Custom Report" title="Saved Reports" icon={BookOpen}>
          <DataTable
            columns={[
              { key: 'report_name', label: 'Name' },
              { key: 'dataset', label: 'Dataset', render: (row) => meta?.datasets?.find((item) => item.key === row.config?.dataset)?.label || row.config?.dataset },
              { key: 'owner_user', label: 'Owner' },
              { key: 'shared', label: 'Shared', render: (row) => (row.shared === 'N' ? 'Private' : 'Group') },
              {
                key: 'actions',
                label: '',
                render: (row) => (
                  <span className="row-action-group">
                    <button type="button" className="row-action" onClick={() => loadReport(row)}>Load</button>
                    <button type="button" className="row-action" onClick={() => openSchedule(row)}>Schedule</button>
                    <button type="button" className="row-action danger" onClick={() => deleteReport(row)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  </span>
                ),
              },
            ]}
            rows={saved}
            emptyLabel="No saved reports yet"
          />
        </Panel>
        <Panel eyebrow="Custom Report" title={activeSavedId ? 'Update Saved Report' : 'Save This Report'} icon={Save}>
          <div className="entity-form">
            <div className="field-grid">
              <label>
                <span>Report Name</span>
                <input value={saveName} onChange={(event) => setSaveName(event.target.value)} placeholder="My daily campaign report" maxLength={80} />
              </label>
              <label className="checkbox-inline">
                <input type="checkbox" checked={shared} onChange={(event) => setShared(event.target.checked)} />
                <span>Share with my user group</span>
              </label>
            </div>
            <div className="modal-actions">
              <button type="button" className="primary-action" onClick={saveReport}>
                <Save size={16} aria-hidden="true" />
                {activeSavedId ? 'Update Report' : 'Save Report'}
              </button>
              {activeSavedId && (
                <button type="button" className="row-action" onClick={() => { setActiveSavedId(null); setNotice(''); }}>
                  Save As New
                </button>
              )}
            </div>
          </div>
        </Panel>
      </section>

      {scheduleFor && (
        <section className="admin-grid" style={{ gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 2fr)' }}>
          <Panel
            eyebrow="Custom Report"
            title={`Email Schedule: ${scheduleFor.report_name}`}
            icon={CalendarDays}
            headerActions={(
              <button type="button" className="row-action" onClick={() => setScheduleFor(null)}>Close</button>
            )}
          >
            <form className="entity-form" onSubmit={submitSchedule}>
              <div className="field-grid">
                <label>
                  <span>Send Time</span>
                  <input type="time" value={scheduleForm.time} onChange={(event) => setScheduleForm({ ...scheduleForm, time: event.target.value })} />
                </label>
                <label>
                  <span>Data Range</span>
                  <select value={scheduleForm.range} onChange={(event) => setScheduleForm({ ...scheduleForm, range: event.target.value })}>
                    <option value="yesterday">Yesterday</option>
                    <option value="today">Today (so far)</option>
                    <option value="last7days">Last 7 Days</option>
                    <option value="last30days">Last 30 Days</option>
                    <option value="month_to_date">Month To Date</option>
                    <option value="last_month">Last Month</option>
                  </select>
                </label>
                <label>
                  <span>Days of Week</span>
                  <div className="checkbox-grid" style={{ margin: 0 }}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((name, index) => (
                      <label key={name} className="checkbox-inline">
                        <input
                          type="checkbox"
                          checked={scheduleForm.weekdays.includes(String(index))}
                          onChange={() => setScheduleForm({
                            ...scheduleForm,
                            weekdays: scheduleForm.weekdays.includes(String(index))
                              ? scheduleForm.weekdays.replace(String(index), '')
                              : [...scheduleForm.weekdays, String(index)].sort().join(''),
                          })}
                        />
                        <span>{name}</span>
                      </label>
                    ))}
                  </div>
                </label>
                <label>
                  <span>Email To (comma-separated)</span>
                  <input value={scheduleForm.email_to} onChange={(event) => setScheduleForm({ ...scheduleForm, email_to: event.target.value })} placeholder="ops@example.com" />
                </label>
                <label>
                  <span>Email From (optional)</span>
                  <input value={scheduleForm.email_from} onChange={(event) => setScheduleForm({ ...scheduleForm, email_from: event.target.value })} placeholder="reports@yourdomain" />
                </label>
                <label>
                  <span>Subject (optional)</span>
                  <input value={scheduleForm.email_subject} onChange={(event) => setScheduleForm({ ...scheduleForm, email_subject: event.target.value })} maxLength={255} />
                </label>
                <label className="checkbox-inline">
                  <input type="checkbox" checked={scheduleForm.run_now} onChange={(event) => setScheduleForm({ ...scheduleForm, run_now: event.target.checked })} />
                  <span>Also send a test email now</span>
                </label>
              </div>
              <div className="modal-actions">
                <button type="submit" className="primary-action">
                  <CalendarDays size={16} aria-hidden="true" />
                  Create Schedule
                </button>
              </div>
            </form>
          </Panel>
          <Panel eyebrow="Custom Report" title="Existing Schedules" icon={Clock3}>
            <DataTable
              columns={[
                { key: 'report_id', label: 'ID' },
                { key: 'report_name', label: 'Name' },
                { key: 'report_times', label: 'Time' },
                { key: 'report_weekdays', label: 'Days' },
                { key: 'email_to', label: 'Email To' },
                { key: 'report_last_run', label: 'Last Run', render: (row) => row.report_last_run || 'Never' },
                { key: 'active', label: 'Active' },
                {
                  key: 'actions',
                  label: '',
                  render: (row) => (
                    <button type="button" className="row-action danger" onClick={() => deleteSchedule(row)}>
                      <Trash2 size={14} aria-hidden="true" />
                    </button>
                  ),
                },
              ]}
              rows={schedules}
              emptyLabel="No schedules for this report yet"
            />
            <p className="action-copy">Schedules run through Automated Reports (Media &amp; Tools) and email the report as a CSV attachment.</p>
          </Panel>
        </section>
      )}
    </div>
  );
}

function useLiveReport(path, token, intervalMs = 5000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!path) {
      setData(null);
      setError('');
      return undefined;
    }
    let cancelled = false;
    async function load() {
      try {
        const payload = await apiFetch(path, token);
        if (!cancelled) {
          setData(payload);
          setError('');
        }
      } catch (requestError) {
        // These views run as always-on wallboards, so on 401 (8h token
        // expired) say so explicitly instead of the generic message — the
        // hook has no onLogout to call and would otherwise poll a dead
        // session forever while showing frozen data.
        if (!cancelled) {
          setError(requestError.status === 403 ? 'Your user is not allowed to view reports'
            : requestError.status === 401 ? 'Session expired - log in again'
              : 'Live data unavailable');
        }
      }
    }
    load();
    const timer = window.setInterval(load, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [path, token, intervalMs]);

  return { data, error };
}

function RealtimeMainReportView({ token, user }) {
  const { data, error } = useLiveReport('/reports/realtime-main', token, 5000);
  const agents = data?.agents || [];
  const campaigns = data?.campaigns || [];
  // Tick the TIME column every second between the 5s data polls, like the
  // legacy Real-Time report's MM:SS column (time since last_call_time).
  const [nowTs, setNowTs] = useState(Date.now());
  const [fetchedAt, setFetchedAt] = useState(Date.now());
  useEffect(() => { setFetchedAt(Date.now()); }, [data]);
  useEffect(() => {
    const timer = window.setInterval(() => setNowTs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  function statusTime(row) {
    if (row.status_seconds === null || row.status_seconds === undefined) return '';
    const s = Math.max(0, Number(row.status_seconds) + Math.floor((nowTs - fetchedAt) / 1000));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }
  // Legacy blind_monitor gate: level >6 with agent API access (level 9 always).
  const canMonitor = Number(user?.userLevel || 0) >= 9
    || (Number(user?.userLevel || 0) > 6 && Boolean(user?.vdcAgentApiAccess));
  const [monitorPhone, setMonitorPhone] = useState(() => window.localStorage.getItem('genx-monitor-phone') || '');
  const [monitorState, setMonitorState] = useState('');

  function setPhone(value) {
    setMonitorPhone(value);
    window.localStorage.setItem('genx-monitor-phone', value);
  }

  async function monitor(row, mode) {
    setMonitorState('working');
    try {
      const payload = await apiFetch('/admin/blind-monitor', token, {
        method: 'POST',
        body: JSON.stringify({ session_id: row.conf_exten, server_ip: row.server_ip, phone_login: monitorPhone, mode }),
      });
      setMonitorState(`${mode === 'BARGE' ? 'Barging into' : 'Listening to'} ${payload.agent?.user || row.user} - your phone (${monitorPhone}) is ringing`);
    } catch (requestError) {
      setMonitorState(requestError.status === 403 ? 'Not permitted (needs level 7+ with Agent API Access)'
        : requestError.status === 404 ? 'Session or phone not found - check your phone login'
          : 'Monitor request failed');
    }
  }

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Real-Time</p>
          <h2>Real-Time Main</h2>
          <p className="action-copy">Live agent status and per-campaign dial activity. Refreshes every 5 seconds.</p>
        </div>
      </section>
      {error && <p className="form-error">{error}</p>}
      <section className="admin-grid">
        <Panel eyebrow="Live" title={`Live Agents (${formatNumber(agents.length)})`} icon={Headphones} className="admin-wide-panel">
          {canMonitor && (
            <div className="connection-actions">
              <label className="connection-summary" style={{ display: 'flex', alignItems: 'center', gap: '0.5em' }}>
                Monitor with phone login
                <input
                  value={monitorPhone}
                  placeholder="e.g. 9176"
                  style={{ width: '8em' }}
                  onChange={(event) => setPhone(event.target.value.trim())}
                />
              </label>
              {monitorState && monitorState !== 'working' && <span className="connection-status">{monitorState}</span>}
            </div>
          )}
          <DataTable
            emptyLabel="No agents currently logged in"
            rows={agents.map((row, index) => ({ ...row, id: index }))}
            columns={[
              { key: 'user', label: 'Agent', render: (row) => row.full_name || row.user },
              { key: 'campaign_id', label: 'Campaign' },
              { key: 'status', label: 'Status', render: (row) => <StatusPill ok={row.status === 'READY'}>{row.status}</StatusPill> },
              { key: 'status_seconds', label: 'Time', render: (row) => statusTime(row) },
              { key: 'pause_code', label: 'Pause Code', render: (row) => row.pause_code || 'None' },
              { key: 'calls_today', label: 'Calls Today', render: (row) => formatNumber(row.calls_today) },
              { key: 'server_ip', label: 'Server' },
              ...(canMonitor ? [{
                key: 'monitor',
                label: 'Monitor',
                render: (row) => (
                  <span className="log-status-edit">
                    <button
                      type="button"
                      className="row-action"
                      disabled={!monitorPhone || monitorState === 'working'}
                      title="Join the session muted"
                      onClick={() => monitor(row, 'LISTEN')}
                    >
                      Listen
                    </button>
                    <button
                      type="button"
                      className="row-action"
                      disabled={!monitorPhone || monitorState === 'working'}
                      title="Join the session with audio (barge-in)"
                      onClick={() => monitor(row, 'BARGE')}
                    >
                      Barge
                    </button>
                  </span>
                ),
              }] : []),
            ]}
          />
        </Panel>
        <Panel eyebrow="Live" title="Campaign Dial Activity" icon={Radio}>
          <DataTable
            emptyLabel="No active campaigns"
            rows={campaigns.map((row) => ({ ...row, id: row.campaign_id }))}
            columns={[
              { key: 'campaign_id', label: 'Campaign', render: (row) => (
                <>
                  <strong>{row.campaign_id}</strong>
                  <span>{row.campaign_name}</span>
                </>
              ) },
              { key: 'dial_method', label: 'Dial Method' },
              { key: 'live_agents', label: 'Agents', render: (row) => formatNumber(row.live_agents) },
              { key: 'auto_calls', label: 'Active Calls', render: (row) => formatNumber(row.auto_calls) },
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function CampaignSummaryReportView({ token }) {
  const { data, error } = useLiveReport('/reports/campaign-summary', token, 5000);
  const campaigns = data?.campaigns || [];

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Real-Time</p>
          <h2>Campaign Summary</h2>
          <p className="action-copy">Dial-pacing operations view: dial level, drops, and agent time breakdown per campaign. Refreshes every 5 seconds.</p>
        </div>
      </section>
      {error && <p className="form-error">{error}</p>}
      <section className="admin-grid">
        {campaigns.map((row) => (
          <Panel key={row.campaign_id} eyebrow={row.campaign_id} title={row.campaign_name || row.campaign_id} icon={Radio}>
            <div className="quick-stack">
              <MetricCard icon={Users} label="Live Agents" value={formatNumber(row.live_agents)} detail={`${row.dial_method || 'Unknown'} dial method`} accent="#00d9ff" />
              <MetricCard icon={Database} label="Dialable Leads" value={formatNumber(row.dialable_leads)} detail={`Hopper level ${row.hopper_level ?? 0}`} accent="#73fbd3" />
              <MetricCard icon={PhoneCall} label="Calls Today" value={formatNumber(row.calls_today)} detail={`${formatNumber(row.answers_today)} answered`} accent="#a8c7ff" />
              <MetricCard icon={Gauge} label="Drop Rate" value={`${row.drops_answers_today_pct || 0}%`} detail={`${formatNumber(row.drops_today)} drops today`} accent="#ffd166" />
            </div>
            <div className="breakdown-list">
              {[1, 2, 3, 4].map((n) => (
                row[`status_category_${n}`] ? (
                  <div className="breakdown-row" key={n}>
                    <div className="breakdown-copy">
                      <strong>{row[`status_category_${n}`]}</strong>
                      <span>{formatNumber(row[`status_category_count_${n}`])}</span>
                    </div>
                  </div>
                ) : null
              ))}
            </div>
          </Panel>
        ))}
        {!campaigns.length && <div className="empty-state">No active campaigns</div>}
      </section>
    </>
  );
}

const WHITEBOARD_REPORT_TYPES = [
  { value: 'DISPOSITION_TOTALS', label: 'Disposition Totals', labelKey: 'status' },
  { value: 'AGENT_PERFORMANCE_TOTALS', label: 'Agent Performance Totals', labelKey: 'user' },
  { value: 'TEAM_PERFORMANCE_TOTALS', label: 'Team Performance Totals', labelKey: 'user_group' },
  { value: 'INGROUP_PERFORMANCE_TOTALS', label: 'In-Group Performance Totals', labelKey: 'group_id' },
  { value: 'DID_PERFORMANCE_TOTALS', label: 'DID Performance Totals', labelKey: 'did_pattern' },
];

function WhiteboardReportView({ token }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [reportType, setReportType] = useState('DISPOSITION_TOTALS');
  const [items, setItems] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function runReport(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = await apiFetch(`/reports/whiteboard?begin_date=${beginDate}&end_date=${endDate}&report_type=${reportType}`, token);
      setItems(payload.items || []);
    } catch (requestError) {
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const typeMeta = WHITEBOARD_REPORT_TYPES.find((option) => option.value === reportType) || WHITEBOARD_REPORT_TYPES[0];
  const breakdownItems = (items || []).map((row) => ({
    ...row,
    label: String(row[typeMeta.labelKey] ?? '(none)'),
    calls: Number(row.calls || 0),
  }));

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Real-Time</p>
          <h2>Whiteboard</h2>
          <p className="action-copy">Ranked leaderboard reports over dispositions, agents, teams, in-groups and DIDs. Rate variants are these totals over your chosen date range.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Report Range and Type" icon={Search} className="admin-wide-panel">
        <ReportFilterBar beginDate={beginDate} endDate={endDate} onBeginDate={setBeginDate} onEndDate={setEndDate} onSubmit={runReport} loading={loading}>
          <label>
            <span>Report Type</span>
            <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
              {WHITEBOARD_REPORT_TYPES.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>
        </ReportFilterBar>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {items && (
        <BreakdownPanel
          eyebrow="Results"
          title={typeMeta.label}
          icon={BarChart3}
          items={breakdownItems}
          valueKey="calls"
          labelKey="label"
          emptyLabel="No results for that range"
        />
      )}
    </>
  );
}

function AgentMonitorLogReportView({ token }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [entries, setEntries] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function runReport(event) {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const payload = await apiFetch(`/reports/agent-monitor-log?begin_date=${beginDate}&end_date=${endDate}`, token);
      setEntries(payload.entries || []);
    } catch (requestError) {
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }

  const columns = [
    { key: 'monitor_start_time', label: 'Start', value: (row) => row.monitor_start_time, render: (row) => formatDateTime(row.monitor_start_time) },
    { key: 'manager_user', label: 'Manager', value: (row) => row.manager_user },
    { key: 'agent_user', label: 'Agent', value: (row) => row.agent_user },
    { key: 'campaign_id', label: 'Campaign', value: (row) => row.campaign_id },
    { key: 'monitor_type', label: 'Type', value: (row) => row.monitor_type },
    { key: 'agent_status', label: 'Agent Status', value: (row) => row.agent_status },
    { key: 'monitor_sec', label: 'Duration (sec)', value: (row) => row.monitor_sec, render: (row) => formatNumber(row.monitor_sec) },
    { key: 'lead_id', label: 'Lead ID', value: (row) => row.lead_id },
  ];

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Logs and QA</p>
          <h2>Agent Monitor Log</h2>
          <p className="action-copy">Audit trail of who monitored (listen/whisper/barge) which agent's calls, and when.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Report Range" icon={Search} className="admin-wide-panel">
        <ReportFilterBar beginDate={beginDate} endDate={endDate} onBeginDate={setBeginDate} onEndDate={setEndDate} onSubmit={runReport} loading={loading} />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {entries && (
        <Panel
          eyebrow="Results"
          title={`Monitor Sessions (${formatNumber(entries.length)})`}
          icon={FileText}
          className="admin-wide-panel"
          headerActions={(
            <button
              type="button"
              className="secondary-action compact-action"
              disabled={!entries.length}
              onClick={() => downloadCsv(`agent-monitor-log-${beginDate}-to-${endDate}.csv`, columns, entries)}
            >
              <FileText size={14} aria-hidden="true" /> Export CSV
            </button>
          )}
        >
          <DataTable
            emptyLabel="No monitor sessions found for that range"
            rows={entries.map((row, index) => ({ ...row, id: index }))}
            columns={columns.map((column) => ({ key: column.key, label: column.label, render: column.render || column.value }))}
          />
        </Panel>
      )}
    </>
  );
}

// `embedded` (campaign modal): the modal head already carries the title,
// description and campaign picker, so the standalone hero is skipped and the
// campaign comes in as a controlled prop.
function HopperListReportView({ token, initialCampaignId, embedded = false, campaignId: controlledCampaignId }) {
  const [localCampaignId, setLocalCampaignId] = useState(initialCampaignId || '');
  const campaignId = embedded ? String(controlledCampaignId || '') : localCampaignId;

  // Always fetch READY and HOLD together — no HCI in this build, so the
  // split doesn't matter; one total tells the story.
  const params = new URLSearchParams({ status: 'READY_AND_HOLD' });
  if (campaignId) params.set('campaign_id', campaignId);
  const { data, error } = useLiveReport(`/reports/hopper-list?${params.toString()}`, token, 5000);

  const campaigns = data?.campaigns || [];
  const entries = data?.entries;
  const totals = data?.totals;

  const columns = [
    { key: 'order', label: '#' },
    { key: 'priority', label: 'Priority' },
    { key: 'lead_id', label: 'Lead ID' },
    { key: 'list_id', label: 'List ID' },
    // Country code shown only when it isn't 1 (US) — '+52 55...' etc.
    { key: 'phone_number', label: 'Phone', render: (row) => (row.phone_code && String(row.phone_code) !== '1' ? `+${row.phone_code} ${row.phone_number}` : row.phone_number) },
    { key: 'state', label: 'State' },
    { key: 'status', label: 'Lead Status' },
    { key: 'called_count', label: 'Count' },
    { key: 'gmt_offset_now', label: 'GMT' },
    { key: 'rank', label: 'Rank' },
    { key: 'alt_dial', label: 'Alt' },
    { key: 'source', label: 'Source' },
    { key: 'vendor_lead_code', label: 'Vendor Lead Code' },
    { key: 'age_days', label: 'Age (days)', render: (row) => (row.age_days ?? '—') },
    {
      key: 'last_call_hours',
      label: 'Last Call',
      render: (row) => {
        if (row.last_call_hours == null) return 'Never';
        if (row.last_call_hours < 24) return `${row.last_call_hours} hrs ago`;
        return `${Math.floor(row.last_call_hours / 24)} days ago`;
      },
    },
  ];

  return (
    <>
      {!embedded && (
        <section className="report-hero">
          <div>
            <p className="eyebrow">Outbound and Lists</p>
            <h2>Hopper List</h2>
            <p className="action-copy">Live snapshot of leads currently loaded in a campaign's dialing hopper. Refreshes every 5 seconds.</p>
          </div>
          {/* Campaign picker lives in the hero — no separate Filters panel. */}
          <label className="hero-filter">
            <span>Campaign</span>
            <select value={campaignId} onChange={(event) => setLocalCampaignId(event.target.value)}>
              <option value="">Select a campaign...</option>
              {campaigns.map((campaign) => (
                <option key={campaign.campaign_id} value={campaign.campaign_id}>{campaign.campaign_id} - {campaign.campaign_name}</option>
              ))}
            </select>
          </label>
        </section>
      )}
      {error && <p className="form-error">{error}</p>}
      {!campaignId && <div className="empty-state">Pick a campaign (top right) to view its live hopper list</div>}
      {campaignId && totals && (
        <section className="quick-stack">
          <MetricCard icon={Database} label="Total In Hopper" value={formatNumber(totals.total)} detail={`Campaign ${campaignId}`} accent="#00d9ff" />
        </section>
      )}
      {campaignId && entries && (
        <Panel eyebrow="Results" title={`Hopper Entries (${formatNumber(entries.length)})`} icon={Database} className="admin-wide-panel hopper-table">
          <DataTable
            emptyLabel="No leads currently in the hopper for that campaign/status"
            rows={entries.map((row) => ({ ...row, id: row.hopper_id }))}
            columns={columns}
          />
        </Panel>
      )}
    </>
  );
}

function DropListsView({ admin, user, onAction }) {
  const dropLists = admin?.dropLists || [];
  const canManage = userCan(user, 'dropLists');

  return (
    <>
      <ActionBar entity="dropLists" label="Drop List" user={user} onAction={onAction}>
        <p className="action-copy">Scheduled jobs that move dropped/status-matched calls into a callback list for redial.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Lists" title={`Drop Lists (${formatNumber(dropLists.length)})`} icon={Database} className="admin-wide-panel">
          <DataTable
            emptyLabel="No drop lists configured"
            rows={dropLists.map((row) => ({ ...row, id: row.dl_id }))}
            columns={[
              { key: 'dl_id', label: 'ID' },
              { key: 'dl_name', label: 'Name' },
              { key: 'list_id', label: 'Dest List' },
              { key: 'drop_statuses', label: 'Statuses' },
              { key: 'dl_times', label: 'Run Times' },
              { key: 'last_run', label: 'Last Run', render: (row) => formatDateTime(row.last_run) },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('dropLists', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

// Audio Store panel (legacy vicidial/audio_store.php): upload, list, play,
// delete files in the sounds web directory + audio_store_details rows.
function AudioStorePanel({ user }) {
  const [store, setStore] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [playing, setPlaying] = useState('');
  const [open, setOpen] = useState(false);
  const audioRef = useRef(null);
  const audioUrlRef = useRef('');
  const token = window.localStorage.getItem(TOKEN_KEY) || '';

  // Stop any preview and release its blob URL. Revoking only in onended
  // (the old behavior) leaked the full .wav blob every time the user
  // stopped early or switched files, and playback survived unmount.
  const stopPlayback = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = '';
    }
  }, []);

  useEffect(() => stopPlayback, [stopPlayback]);

  const load = useCallback(() => {
    apiFetch('/admin/audio-store', token).then(setStore).catch(() => {});
  }, [token]);
  useEffect(load, [load]);

  const canEdit = Number(user?.userLevel || 0) >= 9 || Boolean(user?.modifyAudiostore);

  async function upload(file) {
    setBusy(true);
    setNote('');
    try {
      const response = await fetch(`${API_BASE}/admin/audio-store?filename=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' },
        body: file,
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'upload_failed');
      setNote(`Uploaded ${payload.name} (${formatNumber(payload.size)} bytes${payload.wav_asterisk_valid ? `, asterisk: ${payload.wav_asterisk_valid}` : ''})`);
      load();
    } catch (error) {
      setNote(error.message === 'level_8_required' ? 'User level 8+ required to upload' : `Upload failed: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function play(name) {
    stopPlayback();
    if (playing === name) { setPlaying(''); return; }
    try {
      const response = await fetch(`${API_BASE}/admin/audio-store/file/${encodeURIComponent(name)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('fetch_failed');
      const url = URL.createObjectURL(await response.blob());
      const audio = new Audio(url);
      audioRef.current = audio;
      audioUrlRef.current = url;
      setPlaying(name);
      audio.onended = () => { setPlaying(''); stopPlayback(); };
      audio.play();
    } catch {
      setNote('Playback failed (format may not be browser-playable)');
      setPlaying('');
    }
  }

  const storeInfo = store?.store;
  const notReady = storeInfo && (!storeInfo.configured || !storeInfo.exists);

  const body = (
    <>
      {storeInfo && !storeInfo.configured && (
        <p className="connection-summary">
          The central sound store has not been created yet (System Settings → Sounds Web Directory is empty).
          {canEdit ? ' Initialize it to generate the directory automatically.' : ' A level 9 admin can initialize it.'}
        </p>
      )}
      {storeInfo?.configured && !storeInfo.exists && (
        <p className="connection-summary">
          Waiting for the server to create the sounds directory — it is created automatically within a minute. Refresh shortly.
        </p>
      )}
      {storeInfo?.configured && storeInfo.exists && storeInfo.active === false && (
        <p className="connection-summary">
          Central Sound Control is INACTIVE in System Settings — uploads are stored but will not sync to dialer servers until it is set to 1.
        </p>
      )}
      {canEdit && notReady && !storeInfo?.override && (
        <div className="modal-actions">
          <button
            type="button"
            className="primary-action"
            disabled={busy || (storeInfo?.configured && !storeInfo?.exists)}
            onClick={async () => {
              setBusy(true);
              setNote('');
              try {
                const payload = await apiFetch('/admin/audio-store/init', token, { method: 'POST', body: '{}' });
                setNote(payload.store?.exists
                  ? 'Audio store directory created'
                  : 'Directory name generated — the server will create it within a minute');
                load();
              } catch { setNote('Initialize failed'); } finally { setBusy(false); }
            }}
          >
            Initialize Audio Store
          </button>
          <button type="button" className="row-action" onClick={load}>Refresh</button>
        </div>
      )}
      {canEdit && !notReady && (
        <div className="modal-actions">
          <input
            type="file"
            accept=".wav,.gsm,.mp3,.ogg,.ulaw,.sln"
            disabled={busy}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) upload(file);
              event.target.value = '';
            }}
          />
        </div>
      )}
      {note && <p className="connection-summary">{note}</p>}
      <DataTable
        emptyLabel={notReady ? 'Audio store not initialized' : 'No audio files uploaded'}
        rows={(store?.files || []).map((f) => ({ ...f, id: f.name }))}
        columns={[
          { key: 'name', label: 'File' },
          { key: 'format', label: 'Format' },
          { key: 'size', label: 'Bytes', render: (row) => formatNumber(row.size) },
          { key: 'audio_length', label: 'Seconds', render: (row) => (row.audio_length != null ? formatNumber(row.audio_length) : '') },
          { key: 'wav_format_details', label: 'Wav Details' },
          { key: 'wav_asterisk_valid', label: 'Asterisk', render: (row) => (row.wav_asterisk_valid ? <StatusPill ok={row.wav_asterisk_valid === 'GOOD' || row.wav_asterisk_valid === 'NA'}>{row.wav_asterisk_valid}</StatusPill> : null) },
          { key: 'actions',
            label: 'Action',
            render: (row) => (
              <span className="connection-actions">
                <button type="button" className="row-action" onClick={() => play(row.name)}>
                  {playing === row.name ? 'Stop' : 'Play'}
                </button>
                {canEdit && (
                  <button
                    type="button"
                    className="row-action"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await apiFetch(`/admin/audio-store/${encodeURIComponent(row.name)}`, token, { method: 'DELETE' });
                        setNote(`Deleted ${row.name}`);
                        load();
                      } catch { setNote('Delete failed'); }
                    }}
                  >
                    Delete
                  </button>
                )}
              </span>
            ) },
        ]}
      />
    </>
  );

  return (
    <>
      <Panel eyebrow="Audio" title={`Audio Store (${formatNumber(store?.files?.length || 0)})`} icon={Activity} className="admin-wide-panel">
        <p className="connection-summary">
          {notReady
            ? (canEdit ? 'Not initialized yet — open Manage Audio Store to set it up.' : 'Not initialized yet — a level 9 admin can set it up.')
            : `${formatNumber(store?.files?.length || 0)} file${store?.files?.length === 1 ? '' : 's'} in the central sound store.`}
        </p>
        <div className="modal-actions">
          <button type="button" className="secondary-action compact-action" onClick={() => setOpen(true)}>
            <Activity size={14} aria-hidden="true" /> Manage Audio Store
          </button>
        </div>
      </Panel>
      {open && (
        <div className="modal-backdrop" role="presentation" {...backdropCloseProps(() => setOpen(false))}>
          <section className="modal-panel detail-modal" role="dialog" aria-modal="true" aria-label="Manage Audio Store">
            <div className="modal-head">
              <div>
                <p className="eyebrow">Audio</p>
                <h2>{`Audio Store (${formatNumber(store?.files?.length || 0)})`}</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="Close" title="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            {body}
          </section>
        </div>
      )}
    </>
  );
}

function MediaToolsView({ admin, user, onAction }) {
  const ipLists = admin?.lookups?.ipLists || [];
  const cidGroups = admin?.lookups?.cidGroups || [];

  return (
    <>
      <AudioStorePanel user={user} />
      <section className="admin-grid media-tools-grid">
        <Panel
          eyebrow="Security"
          title={`IP Lists (${formatNumber(ipLists.length)})`}
          icon={ShieldCheck}
          headerActions={userCan(user, 'ipLists') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('ipLists', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No IP lists (login source restriction lists)"
            rows={ipLists.map((row) => ({ ...row, id: row.ip_list_id }))}
            columns={[
              { key: 'ip_list_id', label: 'ID' },
              { key: 'ip_list_name', label: 'Name' },
              { key: 'entry_count', label: 'Entries', render: (row) => formatNumber(row.entry_count) },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(userCan(user, 'ipLists') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('ipLists', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Telephony"
          title={`CID Groups (${formatNumber(cidGroups.length)})`}
          icon={PhoneCall}
          headerActions={userCan(user, 'cidGroups') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('cidGroups', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No CID groups (rotating outbound CallerID sets)"
            rows={cidGroups.map((row) => ({ ...row, id: row.cid_group_id }))}
            columns={[
              { key: 'cid_group_id', label: 'ID' },
              { key: 'cid_group_notes', label: 'Notes' },
              { key: 'cid_group_type', label: 'Type' },
              { key: 'cid_auto_rotate_minutes', label: 'Rotate Min', render: (row) => formatNumber(row.cid_auto_rotate_minutes) },
              ...(userCan(user, 'cidGroups') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('cidGroups', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Telephony"
          title={`Extension Groups (${formatNumber((admin?.extensionGroups || []).length)})`}
          icon={PhoneCall}
          className="admin-wide-panel"
          headerActions={userCan(user, 'extensionGroups') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('extensionGroups', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No extension group entries (used for external dial-out extension rotation)"
            rows={(admin?.extensionGroups || []).map((row) => ({ ...row, id: row.extension_id }))}
            columns={[
              { key: 'extension_group_id', label: 'Group ID' },
              { key: 'extension', label: 'Extension' },
              { key: 'rank', label: 'Rank' },
              { key: 'campaign_groups', label: 'Campaign Groups', render: (row) => row.campaign_groups || '—' },
              { key: 'call_count_today', label: 'Calls Today', render: (row) => formatNumber(row.call_count_today) },
              { key: 'last_call_time', label: 'Last Call', render: (row) => formatDateTime(row.last_call_time) },
              ...(userCan(user, 'extensionGroups') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('extensionGroups', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Routing"
          title={`Queue Groups (${formatNumber((admin?.queueGroups || []).length)})`}
          icon={Headphones}
          headerActions={userCan(user, 'queueGroups') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('queueGroups', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No queue groups (campaign/in-group bundles for permissions and stats)"
            rows={(admin?.queueGroups || []).map((row) => ({ ...row, id: row.queue_group }))}
            columns={[
              { key: 'queue_group', label: 'ID' },
              { key: 'queue_group_name', label: 'Name' },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(userCan(user, 'queueGroups') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('queueGroups', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Directory"
          title={`Contacts (${formatNumber((admin?.contacts || []).length)})`}
          icon={Users}
          headerActions={userCan(user, 'contacts') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('contacts', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No contacts (transfer directory entries)"
            rows={(admin?.contacts || []).map((row) => ({ ...row, id: row.contact_id }))}
            columns={[
              { key: 'name', label: 'Name', render: (row) => `${row.first_name} ${row.last_name}`.trim() },
              { key: 'office_num', label: 'Office' },
              { key: 'cell_num', label: 'Cell' },
              { key: 'department', label: 'Department' },
              ...(userCan(user, 'contacts') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('contacts', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Localization"
          title={`Languages (${formatNumber((admin?.languages || []).length)})`}
          icon={FileText}
          headerActions={userCan(user, 'languages') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('languages', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No languages (agent screen translations)"
            rows={(admin?.languages || []).map((row) => ({ ...row, id: row.language_id }))}
            columns={[
              { key: 'language_id', label: 'Language' },
              { key: 'language_code', label: 'Code' },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(userCan(user, 'languages') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('languages', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Voicemail"
          title={`Voicemail Boxes (${formatNumber((admin?.voicemailFull || []).length)})`}
          icon={Headphones}
          headerActions={userCan(user, 'voicemailBoxes') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('voicemailBoxes', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No voicemail boxes"
            rows={(admin?.voicemailFull || []).map((row) => ({ ...row, id: row.voicemail_id }))}
            columns={[
              { key: 'voicemail_id', label: 'Box' },
              { key: 'fullname', label: 'Name' },
              { key: 'messages', label: 'New', render: (row) => formatNumber(row.messages) },
              { key: 'old_messages', label: 'Old', render: (row) => formatNumber(row.old_messages) },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(userCan(user, 'voicemailBoxes') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('voicemailBoxes', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Voicemail"
          title={`VM Message Groups (${formatNumber((admin?.vmMessageGroups || []).length)})`}
          icon={Headphones}
          headerActions={userCan(user, 'vmMessageGroups') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('vmMessageGroups', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No VM message groups (rotating pre-recorded VM drops)"
            rows={(admin?.vmMessageGroups || []).map((row) => ({ ...row, id: row.leave_vm_message_group_id }))}
            columns={[
              { key: 'leave_vm_message_group_id', label: 'ID' },
              { key: 'leave_vm_message_group_notes', label: 'Notes' },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(userCan(user, 'vmMessageGroups') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('vmMessageGroups', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Audio"
          title={`Music On Hold (${formatNumber((admin?.mohFull || []).length)})`}
          icon={Radio}
          headerActions={userCan(user, 'moh') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('moh', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No music-on-hold groups (audio file upload is a follow-up; this manages the groups)"
            rows={(admin?.mohFull || []).map((row) => ({ ...row, id: row.moh_id }))}
            columns={[
              { key: 'moh_id', label: 'ID' },
              { key: 'moh_name', label: 'Name' },
              { key: 'file_count', label: 'Files', render: (row) => formatNumber(row.file_count) },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(userCan(user, 'moh') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('moh', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Audio"
          title={`TTS Prompts (${formatNumber((admin?.ttsPrompts || []).length)})`}
          icon={FileText}
          headerActions={userCan(user, 'tts') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('tts', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No TTS prompts"
            rows={(admin?.ttsPrompts || []).map((row) => ({ ...row, id: row.tts_id }))}
            columns={[
              { key: 'tts_id', label: 'ID' },
              { key: 'tts_name', label: 'Name' },
              { key: 'tts_voice', label: 'Voice' },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(userCan(user, 'tts') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('tts', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Reporting"
          title={`Automated Reports (${formatNumber((admin?.automatedReports || []).length)})`}
          icon={FileText}
          className="admin-wide-panel"
          headerActions={userCan(user, 'automatedReports') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('automatedReports', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No automated reports (scheduled email/FTP report jobs)"
            rows={(admin?.automatedReports || []).map((row) => ({ ...row, id: row.report_id }))}
            columns={[
              { key: 'report_id', label: 'ID' },
              { key: 'report_name', label: 'Name' },
              { key: 'report_destination', label: 'Destination' },
              { key: 'report_times', label: 'Times' },
              { key: 'report_last_run', label: 'Last Run', render: (row) => formatDateTime(row.report_last_run) },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(userCan(user, 'automatedReports') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('automatedReports', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Inbound"
          title={`Email Accounts (${formatNumber((admin?.emailAccounts || []).length)})`}
          icon={Mail}
          className="admin-wide-panel"
          headerActions={userCan(user, 'emailAccounts') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('emailAccounts', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No email accounts (inbound/outbound email in-group mailboxes)"
            rows={(admin?.emailAccounts || []).map((row) => ({ ...row, id: row.email_account_id }))}
            columns={[
              { key: 'email_account_id', label: 'ID' },
              { key: 'email_account_name', label: 'Name' },
              { key: 'email_account_type', label: 'Type' },
              { key: 'protocol', label: 'Protocol' },
              { key: 'email_account_server', label: 'Server' },
              { key: 'group_id', label: 'In-Group', render: (row) => row.group_id || '---' },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(userCan(user, 'emailAccounts') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('emailAccounts', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

// Sectioned editor for the single-row system_settings table. Fields and types
// come from the server (SHOW COLUMNS) so it tracks Vicidial schema upgrades.
function SystemSettingsView({ user, token, onLogout }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({});
  const [filter, setFilter] = useState('');
  const [saveState, setSaveState] = useState('');

  useEffect(() => {
    let cancelled = false;
    apiFetch('/admin/system-settings', token)
      .then((payload) => {
        if (cancelled) return;
        setData(payload);
        setForm(payload.settings || {});
      })
      .catch((requestError) => {
        if (requestError.status === 401) onLogout();
        if (!cancelled) setData({ error: requestError.status === 403 ? 'Level 9 required' : 'Failed to load' });
      });
    return () => {
      cancelled = true;
    };
  }, [token, onLogout]);

  if (!data) return <div className="loading-band">Loading system settings</div>;
  if (data.error) return <div className="alert">{data.error}</div>;

  const enumMatch = (type) => {
    const match = /^enum\((.+)\)$/.exec(type);
    if (!match) return null;
    return match[1].split(',').map((option) => option.replace(/^'|'$/g, ''));
  };

  const changed = Object.fromEntries(
    Object.entries(form).filter(([key, value]) => String(value ?? '') !== String(data.settings?.[key] ?? '')),
  );
  const changedCount = Object.keys(changed).length;

  async function save() {
    setSaveState('working');
    try {
      const payload = await apiFetch('/admin/system-settings', token, {
        method: 'PUT',
        body: JSON.stringify({ changes: changed }),
      });
      setData((current) => ({ ...current, settings: { ...current.settings, ...changed } }));
      setSaveState(`Saved ${payload.updated.length} setting${payload.updated.length === 1 ? '' : 's'}`);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setSaveState(requestError.status === 403 ? 'Not permitted' : 'Save failed');
    }
  }

  const query = filter.trim().toLowerCase();
  const fields = (data.columns || []).filter((column) => !query || column.field.toLowerCase().includes(query));
  const groups = new Map();
  for (const column of fields) {
    const prefix = column.field.split('_')[0];
    if (!groups.has(prefix)) groups.set(prefix, []);
    groups.get(prefix).push(column);
  }

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">System</p>
          <h2>System Settings</h2>
          <p className="action-copy">{formatNumber((data.columns || []).length)} settings on this install. Only changed fields are saved.</p>
        </div>
        <div className="strip-items">
          <input
            type="text"
            className="catalog-search"
            placeholder="Filter settings..."
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          />
          <button type="button" className="primary-action" disabled={!changedCount || saveState === 'working'} onClick={save}>
            <Save size={16} aria-hidden="true" />
            {saveState === 'working' ? 'Saving' : `Save ${changedCount ? `(${changedCount})` : ''}`}
          </button>
          {saveState && saveState !== 'working' && <span className="connection-status">{saveState}</span>}
        </div>
      </section>
      <section className="admin-grid media-tools-grid">
        {Array.from(groups.entries()).map(([prefix, columns]) => (
          <Panel key={prefix} eyebrow="Settings" title={`${prefix} (${columns.length})`} icon={SlidersHorizontal}>
            <div className="field-grid">
              {columns.map((column) => {
                const options = enumMatch(column.type);
                const isNumber = /int\(|decimal|float|double/.test(column.type);
                return (
                  <label key={column.field}>
                    <span>{column.field}</span>
                    {options ? (
                      <select value={String(form[column.field] ?? '')} onChange={(event) => setForm((current) => ({ ...current, [column.field]: event.target.value }))}>
                        {ensureOption(options, form[column.field]).map((value) => <option key={value} value={value}>{value}</option>)}
                      </select>
                    ) : (
                      <input
                        type={isNumber ? 'number' : 'text'}
                        value={String(form[column.field] ?? '')}
                        onChange={(event) => setForm((current) => ({ ...current, [column.field]: event.target.value }))}
                      />
                    )}
                  </label>
                );
              })}
            </div>
          </Panel>
        ))}
      </section>
    </>
  );
}

function DisplayView({ admin, user, onAction }) {
  return (
    <>
      <section className="admin-grid media-tools-grid">
        <Panel
          eyebrow="Configuration"
          title={`Settings Containers (${formatNumber((admin?.settingsContainers || []).length)})`}
          icon={Database}
          className="admin-wide-panel"
          headerActions={userCan(user, 'settingsContainers') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('settingsContainers', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No settings containers (free-form config blocks used across features)"
            rows={(admin?.settingsContainers || []).map((row) => ({ ...row, id: row.container_id }))}
            columns={[
              { key: 'container_id', label: 'ID' },
              { key: 'container_type', label: 'Type' },
              { key: 'container_notes', label: 'Notes' },
              { key: 'entry_size', label: 'Entry Size', render: (row) => `${formatNumber(String(row.container_entry || '').length)} chars` },
              ...(userCan(user, 'settingsContainers') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('settingsContainers', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function RemoteAgentsView({ admin, user, onAction }) {
  const remoteAgents = admin?.remoteAgents || [];
  const canManage = userCan(user, 'remoteAgents');

  return (
    <>
      <ActionBar entity="remoteAgents" label="Remote Agent" user={user} onAction={onAction}>
        <p className="action-copy">Off-system agents dialed at an external number: ACD calls route out to their phone with no agent screen.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Users" title={`Remote Agents (${formatNumber(remoteAgents.length)})`} icon={Headphones} className="admin-wide-panel">
          <DataTable
            emptyLabel="No remote agents configured"
            rows={remoteAgents.map((row) => ({ ...row, id: row.remote_agent_id }))}
            columns={[
              { key: 'remote_agent_id', label: 'ID' },
              { key: 'user_start', label: 'User Start' },
              { key: 'number_of_lines', label: 'Lines', render: (row) => formatNumber(row.number_of_lines) },
              { key: 'server_ip', label: 'Server' },
              { key: 'conf_exten', label: 'Extension' },
              { key: 'campaign_id', label: 'Campaign' },
              { key: 'status', label: 'Status', render: (row) => <StatusPill ok={row.status === 'ACTIVE'}>{row.status}</StatusPill> },
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('remoteAgents', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

const LIST_STATUS_ROLLUPS = [
  ['human_answered', 'Human Answered'],
  ['sale', 'Sales'],
  ['dnc', 'DNC'],
  ['customer_contact', 'Customer Contact'],
  ['not_interested', 'Not Interested'],
  ['unworkable', 'Unworkable'],
  ['scheduled_callback', 'Scheduled Callbacks'],
  ['completed', 'Completed'],
];

function ListStatusesReportView({ token, onLogout }) {
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Each picker toggle fires load(); the seq guard drops out-of-order
  // responses so a slow query for an old selection can't overwrite the data
  // for the current one.
  const loadSeq = useRef(0);
  const load = useCallback(async (listIds) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError('');
    try {
      const query = listIds.length ? `?list_ids=${encodeURIComponent(listIds.join(','))}` : '';
      const payload = await apiFetch(`/reports/list-statuses${query}`, token);
      if (seq !== loadSeq.current) return;
      setData(payload);
    } catch (requestError) {
      if (seq !== loadSeq.current) return;
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([]);
  }, [load]);

  const lists = data?.lists || [];
  const entries = data?.entries;
  const flagMap = new Map((data?.statusFlags || []).map((row) => [String(row.status), row]));

  const perList = new Map();
  for (const row of entries || []) {
    const key = String(row.list_id);
    if (!perList.has(key)) perList.set(key, { statuses: [], total: 0, rollups: Object.fromEntries(LIST_STATUS_ROLLUPS.map(([flag]) => [flag, 0])) });
    const bucket = perList.get(key);
    bucket.statuses.push(row);
    bucket.total += Number(row.leads || 0);
    const flags = flagMap.get(String(row.status));
    if (flags) {
      for (const [flag] of LIST_STATUS_ROLLUPS) {
        if (flags[flag] === 'Y') bucket.rollups[flag] += Number(row.leads || 0);
      }
    }
  }

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Outbound and Lists</p>
          <h2>List Statuses</h2>
          <p className="action-copy">Status breakdown and outcome rollups for selected lists.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Lists" icon={Search} className="admin-wide-panel">
        <div className="connection-actions">
          {lists.map((row) => {
            const id = String(row.list_id);
            const isSelected = selected.includes(id);
            return (
              <button
                type="button"
                key={id}
                className={isSelected ? 'row-action tool-picker-item selected' : 'row-action'}
                onClick={() => {
                  const next = isSelected ? selected.filter((item) => item !== id) : [...selected, id];
                  setSelected(next);
                  load(next);
                }}
              >
                {row.list_id} - {row.list_name || ''}{isSelected ? ' ✓' : ''}
              </button>
            );
          })}
          {!lists.length && <span className="connection-summary">No lists available</span>}
        </div>
        {error && <p className="form-error">{error}</p>}
        {loading && <p className="connection-summary">Loading...</p>}
      </Panel>
      {entries && selected.length > 0 && (
        <section className="admin-grid media-tools-grid">
          {selected.map((listId) => {
            const bucket = perList.get(listId) || { statuses: [], total: 0, rollups: {} };
            const listMeta = lists.find((row) => String(row.list_id) === listId);
            return (
              <Panel key={listId} eyebrow={`List ${listId}`} title={`${listMeta?.list_name || listId} (${formatNumber(bucket.total)} leads)`} icon={Database}>
                <div className="connection-actions">
                  {LIST_STATUS_ROLLUPS.map(([flag, label]) => (
                    <span className="connection-status" key={flag}>{label}: {formatNumber(bucket.rollups[flag] || 0)}</span>
                  ))}
                </div>
                <DataTable
                  emptyLabel="No leads in this list"
                  rows={bucket.statuses.map((row) => ({ ...row, id: `${row.list_id}-${row.status}` }))}
                  columns={[
                    { key: 'status', label: 'Status' },
                    { key: 'status_name', label: 'Name', render: (row) => flagMap.get(String(row.status))?.status_name || '' },
                    { key: 'leads', label: 'Leads', render: (row) => formatNumber(row.leads) },
                    { key: 'pct', label: '%', render: (row) => `${bucket.total ? Math.round((Number(row.leads) / bucket.total) * 100) : 0}%` },
                  ]}
                />
              </Panel>
            );
          })}
        </section>
      )}
    </>
  );
}

// Shared campaign multi-select toggle row used by the campaign-driven reports.
function CampaignTogglePicker({ campaigns, selected, onChange, emptyLabel = 'No campaigns available' }) {
  return (
    <div className="connection-actions">
      {campaigns.map((row) => {
        const id = String(row.campaign_id);
        const isSelected = selected.includes(id);
        return (
          <button
            type="button"
            key={id}
            className={isSelected ? 'row-action tool-picker-item selected' : 'row-action'}
            onClick={() => onChange(isSelected ? selected.filter((item) => item !== id) : [...selected, id])}
          >
            {id}{row.campaign_name ? ` - ${row.campaign_name}` : ''}{isSelected ? ' ✓' : ''}
          </button>
        );
      })}
      {!campaigns.length && <span className="connection-summary">{emptyLabel}</span>}
    </div>
  );
}

// Native AST_LISTS_campaign_stats.php: list summary, status-flag rollups and
// status-category counts for every list in the selected campaigns.
function ListCampaignStatusesReportView({ token, onLogout, initialCampaignId }) {
  const [selected, setSelected] = useState(initialCampaignId ? [String(initialCampaignId)] : []);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Same out-of-order-response guard as ListStatusesReportView: every picker
  // toggle refires load(), so only the newest request may write state.
  const loadSeq = useRef(0);
  const load = useCallback(async (campaignIds) => {
    const seq = ++loadSeq.current;
    setLoading(true);
    setError('');
    try {
      const query = campaignIds.length ? `?campaigns=${encodeURIComponent(campaignIds.join(','))}` : '';
      const payload = await apiFetch(`/reports/list-campaign-statuses${query}`, token);
      if (seq !== loadSeq.current) return;
      setData(payload);
    } catch (requestError) {
      if (seq !== loadSeq.current) return;
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      if (seq === loadSeq.current) setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    const initial = initialCampaignId ? [String(initialCampaignId)] : [];
    setSelected(initial);
    load(initial);
  }, [load, initialCampaignId]);

  const campaigns = data?.campaigns || [];
  const lists = data?.lists;
  const entries = data?.entries || [];
  const flagMap = new Map((data?.statusFlags || []).map((row) => [String(row.status), row]));

  const perList = new Map();
  let totalLeads = 0;
  const flagTotals = Object.fromEntries(LIST_STATUS_ROLLUPS.map(([flag]) => [flag, 0]));
  const categoryTotals = new Map();
  for (const row of entries) {
    const key = String(row.list_id);
    if (!perList.has(key)) perList.set(key, { statuses: [], total: 0, rollups: Object.fromEntries(LIST_STATUS_ROLLUPS.map(([flag]) => [flag, 0])) });
    const bucket = perList.get(key);
    const leads = Number(row.leads || 0);
    bucket.statuses.push(row);
    bucket.total += leads;
    totalLeads += leads;
    const flags = flagMap.get(String(row.status));
    if (flags) {
      for (const [flag] of LIST_STATUS_ROLLUPS) {
        if (flags[flag] === 'Y') {
          bucket.rollups[flag] += leads;
          flagTotals[flag] += leads;
        }
      }
      if (flags.category && flags.category !== 'UNDEFINED') {
        categoryTotals.set(flags.category, (categoryTotals.get(flags.category) || 0) + leads);
      }
    }
  }

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Outbound and Lists</p>
          <h2>List Campaign Statuses</h2>
          <p className="action-copy">Lead totals, status flags and category rollups for every list in the selected campaigns.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Campaigns" icon={Search} className="admin-wide-panel">
        <CampaignTogglePicker
          campaigns={campaigns}
          selected={selected}
          onChange={(next) => {
            setSelected(next);
            load(next);
          }}
        />
        {error && <p className="form-error">{error}</p>}
        {loading && <p className="connection-summary">Loading...</p>}
      </Panel>
      {lists && selected.length > 0 && (
        <section className="admin-grid media-tools-grid">
          <Panel eyebrow="Summary" title={`List ID Summary (${formatNumber(totalLeads)} leads)`} icon={Database}>
            <DataTable
              emptyLabel="No lists in the selected campaigns"
              rows={lists.map((row) => ({ ...row, id: String(row.list_id) }))}
              columns={[
                { key: 'list_id', label: 'List' },
                { key: 'list_name', label: 'Name' },
                { key: 'campaign_id', label: 'Campaign' },
                { key: 'leads', label: 'Leads', render: (row) => formatNumber(perList.get(String(row.list_id))?.total || 0) },
                { key: 'active', label: 'Active', render: (row) => (row.active === 'Y' ? 'ACTIVE' : 'INACTIVE') },
              ]}
            />
          </Panel>
          <Panel eyebrow="Summary" title="Status Flags and Categories" icon={Activity}>
            <DataTable
              emptyLabel="No leads"
              rows={LIST_STATUS_ROLLUPS.map(([flag, label]) => ({ id: flag, label, count: flagTotals[flag] }))}
              columns={[
                { key: 'label', label: 'Status Flag' },
                { key: 'count', label: 'Leads', render: (row) => formatNumber(row.count) },
                { key: 'pct', label: '%', render: (row) => `${totalLeads ? ((row.count / totalLeads) * 100).toFixed(2) : '0.00'}%` },
              ]}
            />
            <DataTable
              emptyLabel="No status categories defined"
              rows={(data?.categories || []).map((row) => ({ id: row.vsc_id, ...row }))}
              columns={[
                { key: 'vsc_name', label: 'Status Category', render: (row) => row.vsc_name || row.vsc_id },
                { key: 'count', label: 'Leads', render: (row) => formatNumber(categoryTotals.get(row.vsc_id) || 0) },
              ]}
            />
          </Panel>
          {[...perList.keys()].map((listId) => {
            const bucket = perList.get(listId);
            const listMeta = (lists || []).find((row) => String(row.list_id) === listId);
            return (
              <Panel key={listId} eyebrow={`List ${listId}`} title={`${listMeta?.list_name || listId} (${formatNumber(bucket.total)} leads)`} icon={Database}>
                <div className="connection-actions">
                  {LIST_STATUS_ROLLUPS.map(([flag, label]) => (
                    <span className="connection-status" key={flag}>{label}: {formatNumber(bucket.rollups[flag] || 0)}</span>
                  ))}
                </div>
                <DataTable
                  emptyLabel="No leads in this list"
                  rows={bucket.statuses.map((row) => ({ ...row, id: `${row.list_id}-${row.status}` }))}
                  columns={[
                    { key: 'status', label: 'Status' },
                    { key: 'status_name', label: 'Name', render: (row) => flagMap.get(String(row.status))?.status_name || '' },
                    { key: 'leads', label: 'Leads', render: (row) => formatNumber(row.leads) },
                    { key: 'pct', label: '%', render: (row) => `${bucket.total ? Math.round((Number(row.leads) / bucket.total) * 100) : 0}%` },
                  ]}
                />
              </Panel>
            );
          })}
        </section>
      )}
    </>
  );
}

// Native AST_campaign_status_list_report.php: per campaign and list, call
// dispositions with duration/handle time plus status-flag percentages.
function CampaignStatusListReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (campaignIds, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const query = `?begin_date=${begin}&end_date=${end}${campaignIds.length ? `&campaigns=${encodeURIComponent(campaignIds.join(','))}` : ''}`;
      const payload = await apiFetch(`/reports/campaign-status-list${query}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], today, today);
  }, [load, today]);

  const campaigns = data?.campaigns || [];
  const results = data?.results;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Outbound and Lists</p>
          <h2>Campaign Status List</h2>
          <p className="action-copy">Call dispositions per list for the selected campaigns and date range.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Campaigns and Dates" icon={Search} className="admin-wide-panel">
        <ReportFilterBar
          beginDate={beginDate}
          endDate={endDate}
          onBeginDate={setBeginDate}
          onEndDate={setEndDate}
          loading={loading}
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, beginDate, endDate);
          }}
        />
        <CampaignTogglePicker campaigns={campaigns} selected={selected} onChange={setSelected} />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {results && results.map((campaign) => {
        const flagMap = new Map((campaign.statuses || []).map((row) => [String(row.status), row]));
        return (
          <section className="admin-grid media-tools-grid" key={campaign.campaign_id}>
            {(campaign.lists || []).map((list) => {
              const totals = { calls: 0, duration: 0, handle_time: 0 };
              const rollups = Object.fromEntries(LIST_STATUS_ROLLUPS.map(([flag]) => [flag, 0]));
              for (const dispo of list.dispositions) {
                totals.calls += Number(dispo.calls || 0);
                totals.duration += Number(dispo.duration || 0);
                totals.handle_time += Number(dispo.handle_time || 0);
                const flags = flagMap.get(String(dispo.status));
                if (flags) {
                  for (const [flag] of LIST_STATUS_ROLLUPS) {
                    if (flags[flag] === 'Y') rollups[flag] += Number(dispo.calls || 0);
                  }
                }
              }
              return (
                <Panel
                  key={`${campaign.campaign_id}-${list.list_id}`}
                  eyebrow={`Campaign ${campaign.campaign_id} / List ${list.list_id} (${list.active === 'Y' ? 'ACTIVE' : 'INACTIVE'})`}
                  title={`${list.list_name || list.list_id} (${formatNumber(totals.calls)} calls)`}
                  icon={PhoneCall}
                >
                  <div className="connection-actions">
                    {LIST_STATUS_ROLLUPS.map(([flag, label]) => (
                      <span className="connection-status" key={flag}>
                        {label}: {formatNumber(rollups[flag])} ({totals.calls ? ((rollups[flag] / totals.calls) * 100).toFixed(2) : '0.00'}%)
                      </span>
                    ))}
                  </div>
                  <DataTable
                    emptyLabel="No calls for this list in the date range"
                    rows={list.dispositions.map((row) => ({ ...row, id: `${list.list_id}-${row.status}` }))}
                    columns={[
                      { key: 'status', label: 'Disposition', render: (row) => `${row.status}${flagMap.get(String(row.status))?.status_name ? ` - ${flagMap.get(String(row.status)).status_name}` : ''}` },
                      { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                      { key: 'duration', label: 'Duration', render: (row) => formatSeconds(row.duration) },
                      { key: 'handle_time', label: 'Handle Time', render: (row) => formatSeconds(row.handle_time) },
                    ]}
                  />
                  <p className="connection-summary">
                    Totals: {formatNumber(totals.calls)} calls, {formatSeconds(totals.duration)} duration, {formatSeconds(totals.handle_time)} handle time
                  </p>
                </Panel>
              );
            })}
            {!(campaign.lists || []).length && (
              <Panel eyebrow={`Campaign ${campaign.campaign_id}`} title="No lists" icon={PhoneCall}>
                <p className="connection-summary">This campaign has no lists.</p>
              </Panel>
            )}
          </section>
        );
      })}
    </>
  );
}

// Native AST_dialer_inventory_report.php: dialable-lead inventory per list with
// live campaign/list modes and stored snapshot mode.
const DIALER_INVENTORY_COLUMNS = [
  { key: 'list_id', label: 'List' },
  { key: 'list_name', label: 'Name' },
  { key: 'campaign_id', label: 'Campaign' },
  { key: 'last_call_date', label: 'Last Call', render: (row) => row.last_call_date || 'Not called' },
  { key: 'start_inv', label: 'Start Inv', render: (row) => formatNumber(row.start_inv) },
  { key: 'dialable', label: 'Dialable', render: (row) => formatNumber(row.dialable) },
  { key: 'dialable_nofilter', label: 'No Filter', render: (row) => formatNumber(row.dialable_nofilter) },
  { key: 'oneoff', label: '1-Off', render: (row) => formatNumber(row.oneoff) },
  { key: 'inactive_dialable', label: 'Inactive', render: (row) => formatNumber(row.inactive_dialable) },
  { key: 'average_calls', label: 'Avg Calls' },
  { key: 'penetration', label: 'Penetration', render: (row) => `${Number(row.penetration || 0).toFixed(2)}%` },
];

function DialerInventoryReportView({ token, onLogout }) {
  const [reportType, setReportType] = useState('CAMPAIGNS');
  const [selected, setSelected] = useState([]);
  const [listId, setListId] = useState('');
  const [snapshotTime, setSnapshotTime] = useState('');
  const [override24, setOverride24] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (query) => {
    setLoading(true);
    setError('');
    try {
      const payload = await apiFetch(`/reports/dialer-inventory${query}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      if (requestError.status === 404) setError('That list is not enabled for the inventory report');
      else setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('');
  }, [load]);

  const run = (event) => {
    event.preventDefault();
    const params = new URLSearchParams({ submit: '1', report_type: reportType });
    if (override24) params.set('override_24hours', '1');
    if (reportType === 'CAMPAIGNS') params.set('campaigns', selected.join(','));
    if (reportType === 'LIST') params.set('list_id', listId);
    if (reportType === 'SNAPSHOT') params.set('snapshot_time', snapshotTime);
    load(`?${params.toString()}`);
  };

  const campaigns = data?.campaigns || [];
  const pickerLists = data?.lists || [];
  const snapshots = data?.snapshots || [];
  const entries = data?.entries;
  const totals = (entries || []).reduce((sum, row) => ({
    start_inv: sum.start_inv + Number(row.start_inv || 0),
    dialable: sum.dialable + Number(row.dialable || 0),
    dialable_nofilter: sum.dialable_nofilter + Number(row.dialable_nofilter || 0),
    oneoff: sum.oneoff + Number(row.oneoff || 0),
    inactive_dialable: sum.inactive_dialable + Number(row.inactive_dialable || 0),
  }), { start_inv: 0, dialable: 0, dialable_nofilter: 0, oneoff: 0, inactive_dialable: 0 });

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Outbound and Lists</p>
          <h2>Dialer Inventory</h2>
          <p className="action-copy">Dialable-lead inventory per list. Only lists with Inventory Report enabled are included.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Inventory Source" icon={Search} className="admin-wide-panel">
        <form className="entity-form report-filter-bar" onSubmit={run}>
          <div className="field-grid">
            <label>
              <span>Report Type</span>
              <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
                <option value="CAMPAIGNS">Campaigns (live)</option>
                <option value="LIST">Single List (live)</option>
                <option value="SNAPSHOT">Snapshot</option>
              </select>
            </label>
            {reportType === 'LIST' && (
              <label>
                <span>List</span>
                <select value={listId} onChange={(event) => setListId(event.target.value)}>
                  <option value="">Select a list</option>
                  {pickerLists.map((row) => (
                    <option key={row.list_id} value={row.list_id}>{row.list_id} - {row.list_name || ''}</option>
                  ))}
                </select>
              </label>
            )}
            {reportType === 'SNAPSHOT' && (
              <label>
                <span>Snapshot Time</span>
                <select value={snapshotTime} onChange={(event) => setSnapshotTime(event.target.value)}>
                  <option value="">Select a snapshot</option>
                  {snapshots.map((time) => (
                    <option key={time} value={time}>{time}</option>
                  ))}
                </select>
              </label>
            )}
            {reportType !== 'SNAPSHOT' && (
              <label className="checkbox-field">
                <input type="checkbox" checked={override24} onChange={(event) => setOverride24(event.target.checked)} />
                <span>Override call times (24 hours)</span>
              </label>
            )}
          </div>
          {reportType === 'CAMPAIGNS' && (
            <CampaignTogglePicker
              campaigns={campaigns}
              selected={selected}
              onChange={setSelected}
              emptyLabel="No campaigns have inventory-report lists"
            />
          )}
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {entries && (
        <Panel eyebrow="Inventory" title={data?.reportType === 'SNAPSHOT' ? `Snapshot ${data?.snapshotTime || ''}` : 'Dialable Inventory'} icon={Database} className="admin-wide-panel">
          <DataTable
            emptyLabel="No inventory rows. Enable Inventory Report on lists, or take snapshots."
            rows={entries.map((row) => ({ ...row, id: `${row.campaign_id}-${row.list_id}` }))}
            columns={DIALER_INVENTORY_COLUMNS}
          />
          {entries.length > 0 && (
            <p className="connection-summary">
              Totals: {formatNumber(totals.start_inv)} start inventory, {formatNumber(totals.dialable)} dialable,
              {' '}{formatNumber(totals.dialable_nofilter)} without filter, {formatNumber(totals.oneoff)} one-off,
              {' '}{formatNumber(totals.inactive_dialable)} inactive-status dialable
            </p>
          )}
        </Panel>
      )}
      {data?.statusMatrix && (
        <Panel eyebrow="List Detail" title="Status / Called Count Breakdown" icon={Activity} className="admin-wide-panel">
          <DataTable
            emptyLabel="No leads in this list"
            rows={data.statusMatrix.map((row) => ({ ...row, id: `${row.status}-${row.called_count}` }))}
            columns={[
              { key: 'status', label: 'Status' },
              { key: 'called_count', label: 'Called Count' },
              { key: 'leads', label: 'Leads', render: (row) => formatNumber(row.leads) },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

// Native AST_VDADstats.php: campaign-level outbound calling stats with the
// legacy TOTALS / HUMAN ANSWERS / DROPS / breakdown sections.
function OutboundCallingReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (campaignIds, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const query = `?begin_date=${begin}&end_date=${end}${campaignIds.length ? `&campaigns=${encodeURIComponent(campaignIds.join(','))}` : ''}`;
      const payload = await apiFetch(`/reports/outbound-calling${query}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], today, today);
  }, [load, today]);

  const campaigns = data?.campaigns || [];
  const s = data?.sections;
  const totalCalls = Number(s?.totals?.calls || 0);
  const stat = (label, value, detail = null) => ({ id: label, label, value, detail });
  const summaryRows = s ? [
    stat('Total calls placed', formatNumber(totalCalls)),
    stat('Average call length', `${totalCalls ? Math.round(Number(s.totals.seconds) / totalCalls) : 0}s`),
    stat('Human answered (with agent)', formatNumber(s.haAgent.calls), `avg ${Number(s.haAgent.calls) ? Math.round(Number(s.haAgent.seconds) / Number(s.haAgent.calls)) : 0}s`),
    stat('Human answered (all)', formatNumber(s.haAll.calls)),
    stat('Answering machines (with agent)', formatNumber(s.amCalls.calls)),
    stat('Drops', formatNumber(s.drops.calls), `${totalCalls ? ((Number(s.drops.calls) / totalCalls) * 100).toFixed(2) : '0.00'}% of dialed`),
    stat('No answer / abandon dial statuses', formatNumber(s.naStats.calls)),
    stat('Busy / disconnect / no answer', formatNumber(s.bdnStats.calls)),
    stat('Agent login time', formatSeconds(s.agentSeconds)),
    ...(s.inboundAnswered ? [stat('Inbound calls answered', formatNumber(s.inboundAnswered.calls))] : []),
    ...(s.inbound ? [
      stat(`Rollover in-group calls (${s.inbound.groups.join(', ')})`, formatNumber(s.inbound.totals.calls),
        `queue ${formatSeconds(s.inbound.totals.queue_seconds)}, talk ${formatSeconds(s.inbound.totals.talk_seconds)}`),
    ] : []),
  ] : [];

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Outbound and Lists</p>
          <h2>Outbound Calling</h2>
          <p className="action-copy">Legacy VDAD outbound stats: totals, human answers, drops and breakdowns.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Campaigns and Dates" icon={Search} className="admin-wide-panel">
        <ReportFilterBar
          beginDate={beginDate}
          endDate={endDate}
          onBeginDate={setBeginDate}
          onEndDate={setEndDate}
          loading={loading}
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, beginDate, endDate);
          }}
        />
        <CampaignTogglePicker campaigns={campaigns} selected={selected} onChange={setSelected} />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <section className="admin-grid media-tools-grid">
          <Panel eyebrow="Totals" title="Outbound Summary" icon={PhoneCall}>
            <DataTable
              emptyLabel="No data"
              rows={summaryRows}
              columns={[
                { key: 'label', label: 'Stat' },
                { key: 'value', label: 'Value' },
                { key: 'detail', label: '', render: (row) => row.detail || '' },
              ]}
            />
          </Panel>
          <Panel eyebrow="Breakdown" title="Outbound Statuses" icon={Activity}>
            <DataTable
              emptyLabel="No outbound calls in the date range"
              rows={(s.statusBreakdown || []).map((row) => ({ ...row, id: row.status }))}
              columns={[
                { key: 'status', label: 'Status', render: (row) => `${row.status}${row.status_name ? ` - ${row.status_name}` : ''}` },
                { key: 'category', label: 'Category', render: (row) => (row.category && row.category !== 'UNDEFINED' ? row.category : '') },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'seconds', label: 'Time', render: (row) => formatSeconds(row.seconds) },
                { key: 'pct', label: '%', render: (row) => `${totalCalls ? ((Number(row.calls) / totalCalls) * 100).toFixed(2) : '0.00'}%` },
              ]}
            />
          </Panel>
          {s.inbound && (
            <Panel eyebrow="Breakdown" title="Rollover In-Group Statuses" icon={Activity}>
              <DataTable
                emptyLabel="No rollover inbound calls"
                rows={(s.inbound.breakdown || []).map((row) => ({ ...row, id: row.status }))}
                columns={[
                  { key: 'status', label: 'Status' },
                  { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                  { key: 'seconds', label: 'Time', render: (row) => formatSeconds(row.seconds) },
                ]}
              />
            </Panel>
          )}
          <Panel eyebrow="Breakdown" title="Calls per List" icon={Database}>
            <DataTable
              emptyLabel="No outbound calls in the date range"
              rows={(s.listBreakdown || []).map((row) => ({ ...row, id: String(row.list_id) }))}
              columns={[
                { key: 'list_id', label: 'List' },
                { key: 'list_name', label: 'Name' },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
              ]}
            />
          </Panel>
          <Panel eyebrow="Breakdown" title="Hangup / Term Reasons" icon={Activity}>
            <DataTable
              emptyLabel="No outbound calls in the date range"
              rows={(s.termReasons || []).map((row) => ({ ...row, id: row.term_reason || 'NONE' }))}
              columns={[
                { key: 'term_reason', label: 'Term Reason', render: (row) => row.term_reason || 'NONE' },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
              ]}
            />
          </Panel>
          <Panel eyebrow="Breakdown" title="Carrier Dial Statuses" icon={Activity}>
            <DataTable
              emptyLabel="No carrier log entries in the date range"
              rows={(s.carrierBreakdown || []).map((row) => ({ ...row, id: row.dialstatus || 'NONE' }))}
              columns={[
                { key: 'dialstatus', label: 'Dial Status', render: (row) => row.dialstatus || 'NONE' },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
              ]}
            />
          </Panel>
        </section>
      )}
    </>
  );
}

// Native AST_OUTBOUNDsummary_interval.php: per-interval calling breakdown with
// the legacy column set (system/agent release, sales, DNC, NA%, drop%, times).
function OutboundIntervalReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [interval, setIntervalLen] = useState('1800');
  const [includeRollover, setIncludeRollover] = useState(false);
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (campaignIds, begin, end, intervalLen, rollover) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end, interval: intervalLen });
      if (rollover) params.set('include_rollover', '1');
      if (campaignIds.length) params.set('campaigns', campaignIds.join(','));
      const payload = await apiFetch(`/reports/outbound-interval?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], today, today, '1800', false);
  }, [load, today]);

  const campaigns = data?.campaigns || [];
  const results = data?.results;
  // Prefer the server-rendered bucket_label (MySQL formats it in the dialer's
  // local time): formatting the epoch with the browser's timezone shifts
  // every interval for admins outside the server's zone. The Date fallback
  // only covers rows from a pre-label server build.
  const bucketLabel = (row) => row.bucket_label
    || new Date(Number(row.bucket) * 1000).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Outbound and Lists</p>
          <h2>Outbound Interval Summary</h2>
          <p className="action-copy">Per-interval outbound calling breakdown for the selected campaigns.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Campaigns, Dates and Interval" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, beginDate, endDate, interval, includeRollover);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              <span>Interval</span>
              <select value={interval} onChange={(event) => setIntervalLen(event.target.value)}>
                <option value="900">15 minutes</option>
                <option value="1800">30 minutes</option>
                <option value="3600">60 minutes</option>
              </select>
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={includeRollover} onChange={(event) => setIncludeRollover(event.target.checked)} />
              <span>Include rollover in-group calls</span>
            </label>
          </div>
          <CampaignTogglePicker campaigns={campaigns} selected={selected} onChange={setSelected} />
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {results && results.map((campaign) => {
        const totals = campaign.buckets.reduce((sum, row) => ({
          calls: sum.calls + row.calls,
          calls_in: sum.calls_in + row.calls_in,
          drops: sum.drops + row.drops,
          system_release: sum.system_release + row.system_release,
          sale_calls: sum.sale_calls + row.sale_calls,
          dnc_calls: sum.dnc_calls + row.dnc_calls,
          na_calls: sum.na_calls + row.na_calls,
          login_seconds: sum.login_seconds + row.login_seconds,
          pause_seconds: sum.pause_seconds + row.pause_seconds,
        }), { calls: 0, calls_in: 0, drops: 0, system_release: 0, sale_calls: 0, dnc_calls: 0, na_calls: 0, login_seconds: 0, pause_seconds: 0 });
        return (
          <Panel
            key={campaign.campaign_id}
            eyebrow={`Campaign ${campaign.campaign_id}`}
            title={`${campaign.campaign_name || campaign.campaign_id} — ${formatNumber(totals.calls)} calls`}
            icon={PhoneCall}
            className="admin-wide-panel"
          >
            <DataTable
              emptyLabel="No calls for this campaign in the date range"
              rows={campaign.buckets.map((row) => ({ ...row, id: String(row.bucket) }))}
              columns={[
                { key: 'bucket', label: 'Interval', render: (row) => bucketLabel(row) },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'system_release', label: 'System Release', render: (row) => formatNumber(row.system_release) },
                { key: 'agent_release', label: 'Agent Release', render: (row) => formatNumber(row.calls - row.system_release) },
                { key: 'sale_calls', label: 'Sales', render: (row) => formatNumber(row.sale_calls) },
                { key: 'dnc_calls', label: 'DNC', render: (row) => formatNumber(row.dnc_calls) },
                { key: 'na_pct', label: 'NA %', render: (row) => `${row.calls ? ((row.na_calls / row.calls) * 100).toFixed(2) : '0.00'}%` },
                { key: 'drop_pct', label: 'Drop %', render: (row) => `${row.calls ? ((row.drops / row.calls) * 100).toFixed(2) : '0.00'}%` },
                { key: 'login_seconds', label: 'Agent Login', render: (row) => formatSeconds(row.login_seconds) },
                { key: 'pause_seconds', label: 'Agent Pause', render: (row) => formatSeconds(row.pause_seconds) },
              ]}
            />
            <p className="connection-summary">
              Totals: {formatNumber(totals.calls)} calls ({formatNumber(totals.calls_in)} inbound rollover),
              {' '}{formatNumber(totals.system_release)} system / {formatNumber(totals.calls - totals.system_release)} agent release,
              {' '}{formatNumber(totals.sale_calls)} sales, {formatNumber(totals.dnc_calls)} DNC,
              {' '}drop {totals.calls ? ((totals.drops / totals.calls) * 100).toFixed(2) : '0.00'}%,
              {' '}login {formatSeconds(totals.login_seconds)}, pause {formatSeconds(totals.pause_seconds)}
            </p>
          </Panel>
        );
      })}
    </>
  );
}

// Native AST_source_vlc_status_report.php: leads by vendor_lead_code/source_id
// crossed with disposition for the selected campaigns and entry-date range.
function LeadSourceReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [groupBy, setGroupBy] = useState('vendor_lead_code');
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (campaignIds, begin, end, groupColumn) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end, group_by: groupColumn });
      if (campaignIds.length) params.set('campaigns', campaignIds.join(','));
      const payload = await apiFetch(`/reports/lead-source?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], today, today, 'vendor_lead_code');
  }, [load, today]);

  const campaigns = data?.campaigns || [];
  const results = data?.results;
  const groupLabel = (data?.groupBy || groupBy).replace(/_/g, ' ').toUpperCase();

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Outbound and Lists</p>
          <h2>Lead Source</h2>
          <p className="action-copy">Lead dispositions grouped by vendor lead code or source ID for leads entered in the date range.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Campaigns, Dates and Grouping" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, beginDate, endDate, groupBy);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              <span>Group By</span>
              <select value={groupBy} onChange={(event) => setGroupBy(event.target.value)}>
                <option value="vendor_lead_code">Vendor Lead Code</option>
                <option value="source_id">Source ID</option>
              </select>
            </label>
          </div>
          <CampaignTogglePicker campaigns={campaigns} selected={selected} onChange={setSelected} />
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {results && results.map((campaign) => {
        const nameMap = new Map((campaign.statuses || []).map((row) => [String(row.status), row.status_name]));
        const perSource = new Map();
        for (const row of campaign.entries) {
          const key = String(row.source ?? '') || '(NONE)';
          if (!perSource.has(key)) perSource.set(key, { rows: [], total: 0 });
          const bucket = perSource.get(key);
          bucket.rows.push(row);
          bucket.total += Number(row.leads || 0);
        }
        return (
          <section className="admin-grid media-tools-grid" key={campaign.campaign_id}>
            {[...perSource.entries()].map(([source, bucket]) => (
              <Panel
                key={`${campaign.campaign_id}-${source}`}
                eyebrow={`Campaign ${campaign.campaign_id}`}
                title={`${groupLabel}: ${source} (${formatNumber(bucket.total)} leads)`}
                icon={Database}
              >
                <DataTable
                  emptyLabel="No leads"
                  rows={bucket.rows.map((row) => ({ ...row, id: `${source}-${row.status}` }))}
                  columns={[
                    { key: 'status', label: 'Disposition', render: (row) => nameMap.get(String(row.status)) || row.status },
                    { key: 'leads', label: 'Leads', render: (row) => formatNumber(row.leads) },
                    { key: 'pct', label: '%', render: (row) => `${bucket.total ? ((Number(row.leads) / bucket.total) * 100).toFixed(2) : '0.00'}%` },
                  ]}
                />
              </Panel>
            ))}
            {!perSource.size && (
              <Panel eyebrow={`Campaign ${campaign.campaign_id}`} title="No leads entered in the date range" icon={Database}>
                <p className="connection-summary">No leads with an entry date in the selected range.</p>
              </Panel>
            )}
          </section>
        );
      })}
    </>
  );
}

// Native AST_CLOSERstats_v2.php (PHONE in-groups): per-group inbound stats,
// status breakdown and hourly distribution.
function InboundSummaryReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (groupIds, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (groupIds.length) params.set('groups', groupIds.join(','));
      const payload = await apiFetch(`/reports/inbound-summary?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], today, today);
  }, [load, today]);

  const groups = (data?.groups || []).map((row) => ({ campaign_id: row.group_id, campaign_name: row.group_name }));
  const s = data?.sections;
  const totals = (s?.perGroup || []).reduce((sum, row) => ({
    calls: sum.calls + Number(row.calls || 0),
    seconds: sum.seconds + Number(row.seconds || 0),
    answered: sum.answered + Number(row.answered || 0),
    answered_queue_seconds: sum.answered_queue_seconds + Number(row.answered_queue_seconds || 0),
    drops: sum.drops + Number(row.drops || 0),
    drops_5s: sum.drops_5s + Number(row.drops_5s || 0),
    drops_10s: sum.drops_10s + Number(row.drops_10s || 0),
  }), { calls: 0, seconds: 0, answered: 0, answered_queue_seconds: 0, drops: 0, drops_5s: 0, drops_10s: 0 });

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Inbound</p>
          <h2>Inbound Summary (v2)</h2>
          <p className="action-copy">Answer and drop statistics for the selected inbound groups.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="In-Groups and Dates" icon={Search} className="admin-wide-panel">
        <ReportFilterBar
          beginDate={beginDate}
          endDate={endDate}
          onBeginDate={setBeginDate}
          onEndDate={setEndDate}
          loading={loading}
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, beginDate, endDate);
          }}
        />
        <CampaignTogglePicker campaigns={groups} selected={selected} onChange={setSelected} emptyLabel="No inbound groups available" />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <>
          <Panel eyebrow="Summary" title="Inbound Totals" icon={PhoneCall} className="admin-wide-panel">
            <div className="connection-actions">
              <span className="connection-status">Offered (IVR starts): {formatNumber(s.offered)}</span>
              <span className="connection-status">Calls in queue log: {formatNumber(totals.calls)}</span>
              <span className="connection-status">Answered: {formatNumber(totals.answered)} ({totals.calls ? ((totals.answered / totals.calls) * 100).toFixed(2) : '0.00'}%)</span>
              <span className="connection-status">Avg answer queue: {totals.answered ? Math.round(totals.answered_queue_seconds / totals.answered) : 0}s</span>
              <span className="connection-status">Drops: {formatNumber(totals.drops)} ({totals.calls ? ((totals.drops / totals.calls) * 100).toFixed(2) : '0.00'}%)</span>
              <span className="connection-status">Drops ≥5s: {formatNumber(totals.drops_5s)}</span>
              <span className="connection-status">Drops ≥10s: {formatNumber(totals.drops_10s)}</span>
              <span className="connection-status">Avg call length: {totals.calls ? Math.round(totals.seconds / totals.calls) : 0}s</span>
            </div>
            <DataTable
              emptyLabel="No inbound calls in the date range"
              rows={(s.perGroup || []).map((row) => ({ ...row, id: row.group_id }))}
              columns={[
                { key: 'group_id', label: 'In-Group' },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'answered', label: 'Answered', render: (row) => formatNumber(row.answered) },
                { key: 'answer_pct', label: 'Answer %', render: (row) => `${row.calls ? ((row.answered / row.calls) * 100).toFixed(2) : '0.00'}%` },
                { key: 'avg_queue', label: 'Avg Queue', render: (row) => `${row.answered ? Math.round(row.answered_queue_seconds / row.answered) : 0}s` },
                { key: 'drops', label: 'Drops', render: (row) => formatNumber(row.drops) },
                { key: 'drop_pct', label: 'Drop %', render: (row) => `${row.calls ? ((row.drops / row.calls) * 100).toFixed(2) : '0.00'}%` },
                { key: 'avg_len', label: 'Avg Length', render: (row) => `${row.calls ? Math.round(row.seconds / row.calls) : 0}s` },
              ]}
            />
          </Panel>
          <section className="admin-grid media-tools-grid">
            <Panel eyebrow="Breakdown" title="Inbound Statuses" icon={Activity}>
              <DataTable
                emptyLabel="No inbound calls in the date range"
                rows={(s.statusBreakdown || []).map((row) => ({ ...row, id: row.status }))}
                columns={[
                  { key: 'status', label: 'Status' },
                  { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                  { key: 'seconds', label: 'Time', render: (row) => formatSeconds(row.seconds) },
                ]}
              />
            </Panel>
            <Panel eyebrow="Breakdown" title="Hourly Distribution" icon={Activity}>
              <DataTable
                emptyLabel="No inbound calls in the date range"
                rows={(s.hourly || []).map((row) => ({ ...row, id: row.hour_slot }))}
                columns={[
                  { key: 'hour_slot', label: 'Hour' },
                  { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                  { key: 'answered', label: 'Answered', render: (row) => formatNumber(row.answered) },
                  { key: 'drops', label: 'Drops', render: (row) => formatNumber(row.drops) },
                ]}
              />
            </Panel>
          </section>
        </>
      )}
    </>
  );
}

const SERVICE_LEVEL_BUCKETS = [
  ['q0', 'Immediate'],
  ['q20', '1-20s'],
  ['q40', '21-40s'],
  ['q60', '41-60s'],
  ['q80', '61-80s'],
  ['q100', '81-100s'],
  ['q120', '101-120s'],
  ['q121', '>120s'],
];

function slotLabel(slot) {
  const minutes = Number(slot) * 15;
  const hh = String(Math.floor(minutes / 60)).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

// Native AST_CLOSER_service_level.php: queue-time histogram per quarter hour
// plus per-day drop/hold/calltime totals for one in-group.
function ServiceLevelReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [groupId, setGroupId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (group, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (group) params.set('group', group);
      const payload = await apiFetch(`/reports/service-level?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Not allowed to view this report or in-group' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('', today, today);
  }, [load, today]);

  const groups = data?.groups || [];
  const s = data?.sections;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Inbound</p>
          <h2>Service Level</h2>
          <p className="action-copy">Queue answer-speed histogram per quarter hour for one inbound group.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="In-Group and Dates" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(groupId, beginDate, endDate);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              <span>In-Group</span>
              <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                <option value="">Select an in-group</option>
                {groups.map((row) => (
                  <option key={row.group_id} value={row.group_id}>{row.group_id} - {row.group_name || ''}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <>
          <Panel eyebrow="Per Day" title={`Daily Totals — ${s.groupId}`} icon={PhoneCall} className="admin-wide-panel">
            <DataTable
              emptyLabel="No inbound calls in the date range"
              rows={(s.days || []).map((row) => ({ ...row, id: String(row.day) }))}
              columns={[
                { key: 'day', label: 'Date', render: (row) => String(row.day).slice(0, 10) },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'drops', label: 'Drops', render: (row) => formatNumber(row.drops) },
                { key: 'drop_pct', label: 'Drop %', render: (row) => `${row.calls ? ((row.drops / row.calls) * 100).toFixed(2) : '0.00'}%` },
                { key: 'avg_drop', label: 'Avg Drop', render: (row) => `${row.drops ? Math.round(row.drops_sec / row.drops) : 0}s` },
                { key: 'holds', label: 'Holds', render: (row) => formatNumber(row.holds) },
                { key: 'hold_pct', label: 'Hold %', render: (row) => `${row.calls ? ((row.holds / row.calls) * 100).toFixed(2) : '0.00'}%` },
                { key: 'avg_hold', label: 'Avg Hold', render: (row) => `${row.holds ? Math.round(row.hold_sec / row.holds) : 0}s` },
                { key: 'total_calltime', label: 'Calltime', render: (row) => formatSeconds(row.calls_sec) },
                { key: 'avg_calltime', label: 'Avg Call', render: (row) => `${row.calls ? Math.round(row.calls_sec / row.calls) : 0}s` },
              ]}
            />
          </Panel>
          <Panel eyebrow="Intervals" title="Answer Speed per Quarter Hour" icon={Activity} className="admin-wide-panel">
            <DataTable
              emptyLabel="No inbound calls in the date range"
              rows={(s.slots || []).map((row) => ({ ...row, id: String(row.slot) }))}
              columns={[
                { key: 'slot', label: 'Time', render: (row) => slotLabel(row.slot) },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'drops', label: 'Drops', render: (row) => formatNumber(row.drops) },
                ...SERVICE_LEVEL_BUCKETS.map(([key, label]) => ({ key, label, render: (row) => formatNumber(row[key]) })),
                { key: 'queue_max', label: 'Max Queue', render: (row) => `${row.queue_max}s` },
              ]}
            />
          </Panel>
        </>
      )}
    </>
  );
}

// Native AST_CLOSERsummary_hourly.php: per in-group hour-of-day breakdown.
function InboundHourlyReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (groupIds, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (groupIds.length) params.set('groups', groupIds.join(','));
      const payload = await apiFetch(`/reports/inbound-hourly?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], today, today);
  }, [load, today]);

  const groups = (data?.groups || []).map((row) => ({ campaign_id: row.group_id, campaign_name: row.group_name }));
  const results = data?.results;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Inbound</p>
          <h2>Hourly Summary</h2>
          <p className="action-copy">Hour-of-day inbound answer, talk and queue stats per in-group.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="In-Groups and Dates" icon={Search} className="admin-wide-panel">
        <ReportFilterBar
          beginDate={beginDate}
          endDate={endDate}
          onBeginDate={setBeginDate}
          onEndDate={setEndDate}
          loading={loading}
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, beginDate, endDate);
          }}
        />
        <CampaignTogglePicker campaigns={groups} selected={selected} onChange={setSelected} emptyLabel="No inbound groups available" />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {results && results.map((group) => {
        const totals = group.hours.reduce((sum, row) => ({
          calls: sum.calls + Number(row.calls || 0),
          answered: sum.answered + Number(row.answered || 0),
          drops: sum.drops + Number(row.drops || 0),
          talk_sec: sum.talk_sec + Number(row.talk_sec || 0),
          queue_sec: sum.queue_sec + Number(row.queue_sec || 0),
          queue_max: Math.max(sum.queue_max, Number(row.queue_max || 0)),
        }), { calls: 0, answered: 0, drops: 0, talk_sec: 0, queue_sec: 0, queue_max: 0 });
        return (
          <Panel
            key={group.group_id}
            eyebrow={`In-Group ${group.group_id}`}
            title={`${group.group_name || group.group_id} — ${formatNumber(totals.calls)} calls`}
            icon={PhoneCall}
            className="admin-wide-panel"
          >
            <DataTable
              emptyLabel="No inbound calls in the date range"
              rows={group.hours.map((row) => ({ ...row, id: String(row.hour) }))}
              columns={[
                { key: 'hour', label: 'Hour', render: (row) => `${String(row.hour).padStart(2, '0')}:00` },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'answered', label: 'Answered', render: (row) => formatNumber(row.answered) },
                { key: 'talk_sec', label: 'Total Talk', render: (row) => formatSeconds(row.talk_sec) },
                { key: 'avg_talk', label: 'Avg Talk', render: (row) => `${row.answered ? Math.round(row.talk_sec / row.answered) : 0}s` },
                { key: 'queue_sec', label: 'Queue Time', render: (row) => formatSeconds(row.queue_sec) },
                { key: 'avg_queue', label: 'Avg Queue', render: (row) => `${row.calls ? Math.round(row.queue_sec / row.calls) : 0}s` },
                { key: 'queue_max', label: 'Max Queue', render: (row) => `${row.queue_max}s` },
                { key: 'drops', label: 'Abandon', render: (row) => formatNumber(row.drops) },
              ]}
            />
            <p className="connection-summary">
              Totals: {formatNumber(totals.calls)} calls, {formatNumber(totals.answered)} answered,
              {' '}talk {formatSeconds(totals.talk_sec)}, queue {formatSeconds(totals.queue_sec)} (max {totals.queue_max}s),
              {' '}{formatNumber(totals.drops)} abandoned
            </p>
          </Panel>
        );
      })}
    </>
  );
}

// Native AST_inbound_daily_report.php: per-day (or per-hour) inbound totals
// for the selected in-groups with status and term-reason breakdowns.
function InboundDailyReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [hourly, setHourly] = useState(false);
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (groupIds, begin, end, byHour) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (byHour) params.set('hourly', '1');
      if (groupIds.length) params.set('groups', groupIds.join(','));
      const payload = await apiFetch(`/reports/inbound-daily?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], today, today, false);
  }, [load, today]);

  const groups = (data?.groups || []).map((row) => ({ campaign_id: row.group_id, campaign_name: row.group_name }));
  const s = data?.sections;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Inbound</p>
          <h2>Daily Summary</h2>
          <p className="action-copy">Per-day inbound totals for the selected in-groups.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="In-Groups and Dates" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, beginDate, endDate, hourly);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label className="checkbox-field">
              <input type="checkbox" checked={hourly} onChange={(event) => setHourly(event.target.checked)} />
              <span>Hourly breakdown</span>
            </label>
          </div>
          <CampaignTogglePicker campaigns={groups} selected={selected} onChange={setSelected} emptyLabel="No inbound groups available" />
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <>
          <Panel eyebrow="Summary" title={data?.hourly ? 'Hourly Totals' : 'Daily Totals'} icon={PhoneCall} className="admin-wide-panel">
            <DataTable
              emptyLabel="No inbound calls in the date range"
              rows={(s.slots || []).map((row) => ({ ...row, id: String(row.slot) }))}
              columns={[
                { key: 'slot', label: data?.hourly ? 'Hour' : 'Date', render: (row) => String(row.slot).slice(0, data?.hourly ? 16 : 10) },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'answered', label: 'Answered', render: (row) => formatNumber(row.answered) },
                { key: 'answer_pct', label: 'Answer %', render: (row) => `${row.calls ? ((row.answered / row.calls) * 100).toFixed(2) : '0.00'}%` },
                { key: 'asa', label: 'Avg Speed Answer', render: (row) => `${row.answered ? Math.round(row.answer_queue_sec / row.answered) : 0}s` },
                { key: 'drops', label: 'Drops', render: (row) => formatNumber(row.drops) },
                { key: 'drop_pct', label: 'Drop %', render: (row) => `${row.calls ? ((row.drops / row.calls) * 100).toFixed(2) : '0.00'}%` },
                { key: 'agents', label: 'Agents', render: (row) => formatNumber(row.agents) },
                { key: 'calls_sec', label: 'Calltime', render: (row) => formatSeconds(row.calls_sec) },
                { key: 'queue_max', label: 'Max Queue', render: (row) => `${row.queue_max}s` },
              ]}
            />
          </Panel>
          <section className="admin-grid media-tools-grid">
            <Panel eyebrow="Breakdown" title="Statuses" icon={Activity}>
              <DataTable
                emptyLabel="No inbound calls in the date range"
                rows={(s.statusBreakdown || []).map((row) => ({ ...row, id: row.status }))}
                columns={[
                  { key: 'status', label: 'Status' },
                  { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                ]}
              />
            </Panel>
            <Panel eyebrow="Breakdown" title="Term Reasons" icon={Activity}>
              <DataTable
                emptyLabel="No inbound calls in the date range"
                rows={(s.termReasons || []).map((row) => ({ ...row, id: row.term_reason || 'NONE' }))}
                columns={[
                  { key: 'term_reason', label: 'Term Reason', render: (row) => row.term_reason || 'NONE' },
                  { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                ]}
              />
            </Panel>
          </section>
        </>
      )}
    </>
  );
}

// DID multi-select toggle row (patterns instead of campaign ids).
function DidTogglePicker({ dids, selected, onChange }) {
  return (
    <div className="connection-actions">
      {dids.map((row) => {
        const id = String(row.did_id);
        const isSelected = selected.includes(id);
        return (
          <button
            type="button"
            key={id}
            className={isSelected ? 'row-action tool-picker-item selected' : 'row-action'}
            onClick={() => onChange(isSelected ? selected.filter((item) => item !== id) : [...selected, id])}
          >
            {row.did_pattern}{row.did_description ? ` - ${row.did_description}` : ''}{isSelected ? ' ✓' : ''}
          </button>
        );
      })}
      {!dids.length && <span className="connection-summary">No DIDs available</span>}
    </div>
  );
}

// Native merge of AST_DIDstats.php / AST_DIDstats_v2.php.
function DidStatsReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (didIds, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (didIds.length) params.set('dids', didIds.join(','));
      const payload = await apiFetch(`/reports/did-stats?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], today, today);
  }, [load, today]);

  const dids = data?.dids || [];
  const s = data?.sections;
  const answeredMap = new Map((s?.answered || []).map((row) => [String(row.did_id), row]));
  const callsMap = new Map((s?.perDid || []).map((row) => [String(row.did_id), Number(row.calls || 0)]));

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Inbound</p>
          <h2>DID Report</h2>
          <p className="action-copy">Per-DID call volume, answers and talk time with route, extension and hourly breakdowns.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="DIDs and Dates" icon={Search} className="admin-wide-panel">
        <ReportFilterBar
          beginDate={beginDate}
          endDate={endDate}
          onBeginDate={setBeginDate}
          onEndDate={setEndDate}
          loading={loading}
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, beginDate, endDate);
          }}
        />
        <DidTogglePicker dids={dids} selected={selected} onChange={setSelected} />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <>
          <Panel eyebrow="Summary" title="Per-DID Totals" icon={PhoneCall} className="admin-wide-panel">
            <DataTable
              emptyLabel="No DID calls in the date range"
              rows={(s.meta || []).map((row) => ({ ...row, id: String(row.did_id) }))}
              columns={[
                { key: 'did_pattern', label: 'DID' },
                { key: 'did_description', label: 'Description' },
                { key: 'did_route', label: 'Route' },
                { key: 'did_carrier_description', label: 'Carrier' },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(callsMap.get(String(row.did_id)) || 0) },
                { key: 'answered', label: 'Answered', render: (row) => formatNumber(answeredMap.get(String(row.did_id))?.answered || 0) },
                { key: 'talk', label: 'Talk Time', render: (row) => formatSeconds(answeredMap.get(String(row.did_id))?.talk_sec || 0) },
              ]}
            />
          </Panel>
          <section className="admin-grid media-tools-grid">
            <Panel eyebrow="Breakdown" title="Routes" icon={Activity}>
              <DataTable
                emptyLabel="No DID calls in the date range"
                rows={(s.routes || []).map((row) => ({ ...row, id: `${row.did_id}-${row.did_route}` }))}
                columns={[
                  { key: 'did_id', label: 'DID', render: (row) => (s.meta || []).find((m) => String(m.did_id) === String(row.did_id))?.did_pattern || row.did_id },
                  { key: 'did_route', label: 'Route' },
                  { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                ]}
              />
            </Panel>
            <Panel eyebrow="Breakdown" title="Route Extensions" icon={Activity}>
              <DataTable
                emptyLabel="No DID calls in the date range"
                rows={(s.extensions || []).map((row) => ({ ...row, id: `${row.did_id}-${row.extension}` }))}
                columns={[
                  { key: 'did_id', label: 'DID', render: (row) => (s.meta || []).find((m) => String(m.did_id) === String(row.did_id))?.did_pattern || row.did_id },
                  { key: 'extension', label: 'Extension' },
                  { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                ]}
              />
            </Panel>
            <Panel eyebrow="Breakdown" title="Hourly Volume" icon={Activity}>
              <DataTable
                emptyLabel="No DID calls in the date range"
                rows={(s.hourly || []).map((row) => ({ ...row, id: row.hour_slot }))}
                columns={[
                  { key: 'hour_slot', label: 'Hour' },
                  { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                ]}
              />
            </Panel>
          </section>
        </>
      )}
    </>
  );
}

// Native AST_DIDdetail.php: raw DID log rows with CSV download.
const DID_DETAIL_COLUMNS = [
  { key: 'call_date', label: 'Date', render: (row) => formatDateTime(row.call_date) },
  { key: 'did_pattern', label: 'DID' },
  { key: 'caller_id_number', label: 'Caller ID' },
  { key: 'caller_id_name', label: 'Caller Name' },
  { key: 'did_route', label: 'Route' },
  { key: 'extension', label: 'Extension' },
  { key: 'server_ip', label: 'Server' },
  { key: 'channel', label: 'Channel' },
];

function DidDetailReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (didIds, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (didIds.length) params.set('dids', didIds.join(','));
      const payload = await apiFetch(`/reports/did-detail?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], today, today);
  }, [load, today]);

  const dids = data?.dids || [];
  const entries = data?.entries;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Inbound</p>
          <h2>DID Detail</h2>
          <p className="action-copy">Individual inbound DID log entries for the selected DIDs.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="DIDs and Dates" icon={Search} className="admin-wide-panel">
        <ReportFilterBar
          beginDate={beginDate}
          endDate={endDate}
          onBeginDate={setBeginDate}
          onEndDate={setEndDate}
          loading={loading}
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, beginDate, endDate);
          }}
        />
        <DidTogglePicker dids={dids} selected={selected} onChange={setSelected} />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {entries && (
        <Panel eyebrow="Detail" title={`DID Log (${formatNumber(entries.length)} rows${entries.length === 2000 ? ', capped' : ''})`} icon={Database} className="admin-wide-panel">
          <div className="modal-actions">
            <button
              type="button"
              className="secondary-action"
              disabled={!entries.length}
              onClick={() => downloadCsv(
                `did_detail_${beginDate}_${endDate}.csv`,
                DID_DETAIL_COLUMNS.map((column) => ({ label: column.label, value: (row) => row[column.key] })),
                entries,
              )}
            >
              Download CSV
            </button>
          </div>
          <DataTable
            emptyLabel="No DID calls in the date range"
            rows={entries.map((row, index) => ({ ...row, id: `${row.uniqueid}-${index}` }))}
            columns={DID_DETAIL_COLUMNS}
          />
        </Panel>
      )}
    </>
  );
}

// Native AST_IVRstats.php (in-group mode): IVR activity summaries from
// live_inbound_log for the selected in-groups.
function IvrReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (groupIds, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (groupIds.length) params.set('groups', groupIds.join(','));
      const payload = await apiFetch(`/reports/ivr?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], today, today);
  }, [load, today]);

  const groups = (data?.groups || []).map((row) => ({ campaign_id: row.group_id, campaign_name: row.group_name }));
  const s = data?.sections;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Inbound</p>
          <h2>IVR Report</h2>
          <p className="action-copy">IVR activity from the live inbound log for the selected in-groups.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="In-Groups and Dates" icon={Search} className="admin-wide-panel">
        <ReportFilterBar
          beginDate={beginDate}
          endDate={endDate}
          onBeginDate={setBeginDate}
          onEndDate={setEndDate}
          loading={loading}
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, beginDate, endDate);
          }}
        />
        <CampaignTogglePicker campaigns={groups} selected={selected} onChange={setSelected} emptyLabel="No inbound groups available" />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <>
          <Panel eyebrow="Summary" title="IVR Totals" icon={PhoneCall} className="admin-wide-panel">
            <div className="connection-actions">
              <span className="connection-status">Unique calls: {formatNumber(s.totals.calls)}</span>
              <span className="connection-status">IVR events: {formatNumber(s.totals.events)}</span>
            </div>
            <DataTable
              emptyLabel="No IVR activity in the date range"
              rows={(s.perGroup || []).map((row) => ({ ...row, id: row.group_id }))}
              columns={[
                { key: 'group_id', label: 'In-Group' },
                { key: 'calls', label: 'Unique Calls', render: (row) => formatNumber(row.calls) },
                { key: 'events', label: 'Events', render: (row) => formatNumber(row.events) },
              ]}
            />
          </Panel>
          <section className="admin-grid media-tools-grid">
            <Panel eyebrow="Breakdown" title="Extensions" icon={Activity}>
              <DataTable
                emptyLabel="No IVR activity in the date range"
                rows={(s.perExtension || []).map((row) => ({ ...row, id: row.extension || 'NONE' }))}
                columns={[
                  { key: 'extension', label: 'Extension' },
                  { key: 'calls', label: 'Unique Calls', render: (row) => formatNumber(row.calls) },
                  { key: 'events', label: 'Events', render: (row) => formatNumber(row.events) },
                ]}
              />
            </Panel>
            <Panel eyebrow="Breakdown" title="Events" icon={Activity}>
              <DataTable
                emptyLabel="No IVR activity in the date range"
                rows={(s.perEvent || []).map((row) => ({ ...row, id: row.event || 'NONE' }))}
                columns={[
                  { key: 'event', label: 'Event' },
                  { key: 'events', label: 'Count', render: (row) => formatNumber(row.events) },
                ]}
              />
            </Panel>
          </section>
        </>
      )}
    </>
  );
}

// Native AST_inbound_forecasting.php with the Erlang B/C math server-side.
function InboundForecastingReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [erlangType, setErlangType] = useState('C');
  const [dropPercent, setDropPercent] = useState('3');
  const [retryRate, setRetryRate] = useState('0');
  const [targetPqueue, setTargetPqueue] = useState('0');
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (groupIds, options) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        begin_date: options.begin, end_date: options.end, erlang_type: options.type,
        drop_percent: options.drop, retry_rate: options.retry, target_pqueue: options.pqueue,
      });
      if (groupIds.length) params.set('groups', groupIds.join(','));
      const payload = await apiFetch(`/reports/inbound-forecasting?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], { begin: today, end: today, type: 'C', drop: '3', retry: '0', pqueue: '0' });
  }, [load, today]);

  const groups = (data?.groups || []).map((row) => ({ campaign_id: row.group_id, campaign_name: row.group_name }));
  const s = data?.sections;
  const isB = data?.erlangType === 'B';

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Inbound</p>
          <h2>Forecasting</h2>
          <p className="action-copy">Erlang staffing estimates from historical inbound volume for the selected in-groups.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="In-Groups, Dates and Erlang Options" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, { begin: beginDate, end: endDate, type: erlangType, drop: dropPercent, retry: retryRate, pqueue: targetPqueue });
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              <span>Erlang Model</span>
              <select value={erlangType} onChange={(event) => setErlangType(event.target.value)}>
                <option value="C">Erlang C (queueing)</option>
                <option value="B">Erlang B (blocking)</option>
              </select>
            </label>
            {erlangType === 'B' && (
              <>
                <label>
                  <span>Desired Drop Rate %</span>
                  <input type="number" min="0" max="100" step="0.1" value={dropPercent} onChange={(event) => setDropPercent(event.target.value)} />
                </label>
                <label>
                  <span>Retry Rate %</span>
                  <input type="number" min="0" max="100" step="1" value={retryRate} onChange={(event) => setRetryRate(event.target.value)} />
                </label>
              </>
            )}
            {erlangType === 'C' && (
              <label>
                <span>Target Queue Probability %</span>
                <input type="number" min="0" max="100" step="1" value={targetPqueue} onChange={(event) => setTargetPqueue(event.target.value)} />
              </label>
            )}
          </div>
          <CampaignTogglePicker campaigns={groups} selected={selected} onChange={setSelected} emptyLabel="No inbound groups available" />
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <>
          <Panel eyebrow="Summary" title="Forecast Summary" icon={Activity} className="admin-wide-panel">
            <div className="connection-actions">
              <span className="connection-status">Total calls: {formatNumber(s.totals.calls)}</span>
              <span className="connection-status">Total drops: {formatNumber(s.totals.drops)}</span>
              <span className="connection-status">Blocking/drop rate: {s.totals.blocking}%</span>
              <span className="connection-status">Sale rate: {s.totals.sale_rate}%</span>
              <span className="connection-status">Avg call: {s.totals.avg_call_length}s</span>
              <span className="connection-status">Avg talk: {s.totals.avg_talk_sec}s</span>
              <span className="connection-status">Avg wrapup: {s.totals.avg_dispo_sec}s</span>
              <span className="connection-status">Erlangs: {s.totals.erlangs}</span>
              {isB
                ? <span className="connection-status">Grade of service: {(s.totals.gos * 100).toFixed(2)}%</span>
                : (
                  <>
                    <span className="connection-status">Queue probability: {(s.totals.pqueue * 100).toFixed(2)}%</span>
                    <span className="connection-status">Avg speed of answer: {Math.round(s.totals.asa)}s</span>
                  </>
                )}
              <span className="connection-status">Estimated agents: {s.totals.est_agents}</span>
              <span className="connection-status">Recommended agents: {s.totals.rec_agents}</span>
            </div>
          </Panel>
          <Panel eyebrow="Hourly" title="Per-Hour Forecast" icon={PhoneCall} className="admin-wide-panel">
            <DataTable
              emptyLabel="No inbound calls in the date range"
              rows={(s.hours || []).map((row) => ({ ...row, id: row.hour }))}
              columns={[
                { key: 'hour', label: 'Hour', render: (row) => `${row.hour}:00` },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'sales', label: 'Sales', render: (row) => formatNumber(row.sales) },
                { key: 'secs', label: 'Total Time', render: (row) => formatSeconds(row.secs) },
                { key: 'avg_secs', label: 'Avg Time', render: (row) => `${row.avg_secs}s` },
                { key: 'dropped_hours', label: 'Dropped Hrs' },
                { key: 'blocking', label: 'Blocking %', render: (row) => `${row.blocking}%` },
                { key: 'erlangs', label: 'Erlangs' },
                ...(isB
                  ? [{ key: 'gos', label: 'GoS %', render: (row) => `${(row.gos * 100).toFixed(2)}%` }]
                  : [
                    { key: 'pqueue', label: 'Queue Prob %', render: (row) => `${(row.pqueue * 100).toFixed(2)}%` },
                    { key: 'asa', label: 'Avg Answer', render: (row) => `${Math.round(row.asa)}s` },
                  ]),
                { key: 'rec_agents', label: 'Rec Agents' },
                { key: 'est_agents', label: 'Est Agents' },
                { key: 'calls_per_agent', label: 'Calls/Agent' },
              ]}
            />
          </Panel>
        </>
      )}
    </>
  );
}

// Native AST_agent_time_detail.php: per-agent time totals with pause-code and
// park breakdowns.
function AgentTimeDetailReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [campaignId, setCampaignId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (campaign, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (campaign) params.set('campaign', campaign);
      const payload = await apiFetch(`/reports/agent-time-detail?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Not allowed to view this report or campaign' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('', today, today);
  }, [load, today]);

  const campaigns = data?.campaigns || [];
  const s = data?.sections;
  const loginMap = new Map((s?.logins || []).map((row) => [String(row.user), Number(row.login_sec || 0)]));
  const parkMap = new Map((s?.parks || []).map((row) => [String(row.user), row]));
  const pauseNameMap = new Map((s?.pauseCodes || []).map((row) => [String(row.pause_code), row.pause_code_name]));

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Agents and Teams</p>
          <h2>Agent Time Detail</h2>
          <p className="action-copy">Per-agent login, wait, talk, dead, wrapup, pause and park time.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Campaign and Dates" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(campaignId, beginDate, endDate);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              <span>Campaign</span>
              <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
                <option value="">All campaigns</option>
                {campaigns.map((row) => (
                  <option key={row.campaign_id} value={row.campaign_id}>{row.campaign_id}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <>
          <Panel eyebrow="Agents" title="Time Totals" icon={Users} className="admin-wide-panel">
            <DataTable
              emptyLabel="No agent activity in the date range"
              rows={(s.agents || []).map((row) => ({ ...row, id: row.user }))}
              columns={[
                { key: 'user', label: 'User' },
                { key: 'full_name', label: 'Name' },
                { key: 'user_group', label: 'Group' },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'login', label: 'Timeclock', render: (row) => formatSeconds(loginMap.get(String(row.user)) || 0) },
                { key: 'wait_sec', label: 'Wait', render: (row) => formatSeconds(row.wait_sec) },
                { key: 'talk_sec', label: 'Talk', render: (row) => formatSeconds(row.talk_sec) },
                { key: 'dead_sec', label: 'Dead', render: (row) => formatSeconds(row.dead_sec) },
                { key: 'dispo_sec', label: 'Wrapup', render: (row) => formatSeconds(row.dispo_sec) },
                { key: 'pause_sec', label: 'Pause', render: (row) => formatSeconds(row.pause_sec) },
                { key: 'park', label: 'Park', render: (row) => formatSeconds(parkMap.get(String(row.user))?.parked_sec || 0) },
              ]}
            />
          </Panel>
          <Panel eyebrow="Pause Codes" title="Pause Time by Code" icon={Activity} className="admin-wide-panel">
            <DataTable
              emptyLabel="No paused agent time in the date range"
              rows={(s.pauses || []).map((row) => ({ ...row, id: `${row.user}-${row.sub_status || 'NONE'}` }))}
              columns={[
                { key: 'user', label: 'User' },
                { key: 'sub_status', label: 'Pause Code', render: (row) => `${row.sub_status || '(none)'}${pauseNameMap.get(String(row.sub_status)) ? ` - ${pauseNameMap.get(String(row.sub_status))}` : ''}` },
                { key: 'pause_sec', label: 'Pause Time', render: (row) => formatSeconds(row.pause_sec) },
              ]}
            />
          </Panel>
        </>
      )}
    </>
  );
}

// Shared filter bar (dates + campaign select) for the agent reports.
function AgentReportFilterBar({ beginDate, endDate, setBeginDate, setEndDate, campaignId, setCampaignId, campaigns, campaignLabel, loading, onSubmit }) {
  return (
    <form className="entity-form report-filter-bar" onSubmit={onSubmit}>
      <div className="field-grid">
        <label>
          <span>Begin Date</span>
          <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
        </label>
        <label>
          <span>End Date</span>
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <label>
          <span>Campaign</span>
          <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
            <option value="">{campaignLabel}</option>
            {campaigns.map((row) => (
              <option key={row.campaign_id} value={row.campaign_id}>{row.campaign_id}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="modal-actions">
        <button type="submit" className="primary-action" disabled={loading}>
          <Search size={16} aria-hidden="true" />
          {loading ? 'Loading' : 'Run Report'}
        </button>
      </div>
    </form>
  );
}

// Builds user rows + status columns from a flat user/status/calls list.
function buildStatusMatrix(entries, nameKey = 'full_name') {
  const statusSet = new Set();
  const users = new Map();
  for (const row of entries || []) {
    const status = String(row.status || '');
    statusSet.add(status);
    const key = String(row.user);
    if (!users.has(key)) users.set(key, { user: key, name: row[nameKey] || '', counts: {}, total: 0 });
    const bucket = users.get(key);
    bucket.counts[status] = (bucket.counts[status] || 0) + Number(row.calls || 0);
    bucket.total += Number(row.calls || 0);
  }
  // Visible status COLUMNS are capped at 20 (alphabetical) to keep the
  // matrix renderable, but each user's Total/HA still counts ALL statuses —
  // so row totals can legitimately exceed the sum of the visible cells on
  // systems with more than 20 statuses in range. Not a data bug.
  return { statuses: [...statusSet].sort().slice(0, 20), users: [...users.values()] };
}

// Native AST_agent_status_detail.php: user x status matrix from agent_log.
function AgentStatusDetailReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [campaignId, setCampaignId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (campaign, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (campaign) params.set('campaign', campaign);
      const payload = await apiFetch(`/reports/agent-status-detail?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Not allowed to view this report or campaign' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('', today, today);
  }, [load, today]);

  const matrix = buildStatusMatrix(data?.entries);
  const haSet = new Set(data?.humanAnswered || []);

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Agents and Teams</p>
          <h2>Agent Status Detail</h2>
          <p className="action-copy">Dispositions set by each agent in the date range.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Campaign and Dates" icon={Search} className="admin-wide-panel">
        <AgentReportFilterBar
          beginDate={beginDate} endDate={endDate} setBeginDate={setBeginDate} setEndDate={setEndDate}
          campaignId={campaignId} setCampaignId={setCampaignId} campaigns={data?.campaigns || []}
          campaignLabel="All campaigns" loading={loading}
          onSubmit={(event) => {
            event.preventDefault();
            load(campaignId, beginDate, endDate);
          }}
        />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {data && (
        <Panel eyebrow="Matrix" title="Agent Statuses" icon={Users} className="admin-wide-panel">
          <DataTable
            emptyLabel="No agent dispositions in the date range"
            rows={matrix.users.map((row) => ({ ...row, id: row.user }))}
            columns={[
              { key: 'user', label: 'User' },
              { key: 'name', label: 'Name' },
              { key: 'total', label: 'Total', render: (row) => formatNumber(row.total) },
              { key: 'ha', label: 'HA', render: (row) => formatNumber(Object.entries(row.counts).reduce((sum, [status, calls]) => sum + (haSet.has(status) ? calls : 0), 0)) },
              ...matrix.statuses.map((status) => ({
                key: `st-${status}`, label: status, render: (row) => formatNumber(row.counts[status] || 0),
              })),
            ]}
          />
        </Panel>
      )}
    </>
  );
}

// Native AST_agent_performance_detail.php core: per-agent times + status matrix.
function AgentPerformanceReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [campaignId, setCampaignId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (campaign, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (campaign) params.set('campaign', campaign);
      const payload = await apiFetch(`/reports/agent-performance?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Not allowed to view this report or campaign' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('', today, today);
  }, [load, today]);

  const s = data?.sections;
  const matrix = buildStatusMatrix(s?.statuses, 'none');
  const haSet = new Set(s?.humanAnswered || []);
  const statusByUser = new Map(matrix.users.map((row) => [row.user, row]));

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Agents and Teams</p>
          <h2>Agent Performance Detail</h2>
          <p className="action-copy">Per-agent call counts, time breakdown and dispositions.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Campaign and Dates" icon={Search} className="admin-wide-panel">
        <AgentReportFilterBar
          beginDate={beginDate} endDate={endDate} setBeginDate={setBeginDate} setEndDate={setEndDate}
          campaignId={campaignId} setCampaignId={setCampaignId} campaigns={data?.campaigns || []}
          campaignLabel="All campaigns" loading={loading}
          onSubmit={(event) => {
            event.preventDefault();
            load(campaignId, beginDate, endDate);
          }}
        />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <>
          <Panel eyebrow="Agents" title="Performance Totals" icon={Users} className="admin-wide-panel">
            <DataTable
              emptyLabel="No agent activity in the date range"
              rows={(s.agents || []).map((row) => ({ ...row, id: row.user }))}
              columns={[
                { key: 'user', label: 'User' },
                { key: 'full_name', label: 'Name' },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'ha', label: 'HA', render: (row) => {
                  const counts = statusByUser.get(String(row.user))?.counts || {};
                  return formatNumber(Object.entries(counts).reduce((sum, [status, calls]) => sum + (haSet.has(status) ? calls : 0), 0));
                } },
                { key: 'pause_sec', label: 'Pause', render: (row) => formatSeconds(row.pause_sec) },
                { key: 'wait_sec', label: 'Wait', render: (row) => formatSeconds(row.wait_sec) },
                { key: 'talk_sec', label: 'Talk', render: (row) => formatSeconds(row.talk_sec) },
                { key: 'dispo_sec', label: 'Wrapup', render: (row) => formatSeconds(row.dispo_sec) },
                { key: 'dead_sec', label: 'Dead', render: (row) => formatSeconds(row.dead_sec) },
                { key: 'avg_talk', label: 'Avg Talk', render: (row) => `${row.calls ? Math.round(row.talk_sec / row.calls) : 0}s` },
              ]}
            />
          </Panel>
          <Panel eyebrow="Matrix" title="Dispositions" icon={Activity} className="admin-wide-panel">
            <DataTable
              emptyLabel="No agent dispositions in the date range"
              rows={matrix.users.map((row) => ({ ...row, id: row.user }))}
              columns={[
                { key: 'user', label: 'User' },
                { key: 'total', label: 'Total', render: (row) => formatNumber(row.total) },
                ...matrix.statuses.map((status) => ({
                  key: `st-${status}`, label: status, render: (row) => formatNumber(row.counts[status] || 0),
                })),
              ]}
            />
          </Panel>
        </>
      )}
    </>
  );
}

// Native AST_agent_disposition.php: one campaign, outbound-log agent stats.
function AgentDispositionReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [campaignId, setCampaignId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (campaign, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (campaign) params.set('campaign', campaign);
      const payload = await apiFetch(`/reports/agent-disposition?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Not allowed to view this report or campaign' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('', today, today);
  }, [load, today]);

  const s = data?.sections;
  const matrix = buildStatusMatrix(s?.statuses, 'none');
  const statusByUser = new Map(matrix.users.map((row) => [row.user, row]));

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Agents and Teams</p>
          <h2>Agent Disposition</h2>
          <p className="action-copy">Per-agent outbound calls and dispositions for one campaign.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Campaign and Dates" icon={Search} className="admin-wide-panel">
        <AgentReportFilterBar
          beginDate={beginDate} endDate={endDate} setBeginDate={setBeginDate} setEndDate={setEndDate}
          campaignId={campaignId} setCampaignId={setCampaignId} campaigns={data?.campaigns || []}
          campaignLabel="Select a campaign" loading={loading}
          onSubmit={(event) => {
            event.preventDefault();
            load(campaignId, beginDate, endDate);
          }}
        />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <Panel eyebrow="Agents" title="Calls and Dispositions" icon={Users} className="admin-wide-panel">
          <DataTable
            emptyLabel="No outbound calls for this campaign in the date range"
            rows={(s.agents || []).map((row) => ({ ...row, id: row.user }))}
            columns={[
              { key: 'user', label: 'User' },
              { key: 'full_name', label: 'Name' },
              { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
              { key: 'talk_sec', label: 'Talk Time', render: (row) => formatSeconds(row.talk_sec) },
              { key: 'avg_sec', label: 'Avg', render: (row) => `${Math.round(Number(row.avg_sec || 0))}s` },
              ...matrix.statuses.map((status) => ({
                key: `st-${status}`, label: status,
                render: (row) => formatNumber(statusByUser.get(String(row.user))?.counts[status] || 0),
              })),
            ]}
          />
        </Panel>
      )}
    </>
  );
}

// Native AST_team_performance_detail.php: per user-group and per-agent totals.
function TeamPerformanceReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [campaignId, setCampaignId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (campaign, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (campaign) params.set('campaign', campaign);
      const payload = await apiFetch(`/reports/team-performance?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Not allowed to view this report or campaign' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('', today, today);
  }, [load, today]);

  const teams = new Map();
  for (const row of data?.agents || []) {
    const key = String(row.user_group || '(none)');
    if (!teams.has(key)) teams.set(key, []);
    teams.get(key).push(row);
  }

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Agents and Teams</p>
          <h2>Team Performance</h2>
          <p className="action-copy">Per user-group agent totals with sales and time breakdown.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Campaign and Dates" icon={Search} className="admin-wide-panel">
        <AgentReportFilterBar
          beginDate={beginDate} endDate={endDate} setBeginDate={setBeginDate} setEndDate={setEndDate}
          campaignId={campaignId} setCampaignId={setCampaignId} campaigns={data?.campaigns || []}
          campaignLabel="All campaigns" loading={loading}
          onSubmit={(event) => {
            event.preventDefault();
            load(campaignId, beginDate, endDate);
          }}
        />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {data && ![...teams.keys()].length && (
        <Panel eyebrow="Teams" title="No agent activity" icon={Users} className="admin-wide-panel">
          <p className="connection-summary">No agent activity in the date range.</p>
        </Panel>
      )}
      {[...teams.entries()].map(([team, agents]) => {
        const totals = agents.reduce((sum, row) => ({
          calls: sum.calls + Number(row.calls || 0),
          sales: sum.sales + Number(row.sales || 0),
          talk_sec: sum.talk_sec + Number(row.talk_sec || 0),
          pause_sec: sum.pause_sec + Number(row.pause_sec || 0),
        }), { calls: 0, sales: 0, talk_sec: 0, pause_sec: 0 });
        return (
          <Panel
            key={team}
            eyebrow={`Team ${team}`}
            title={`${team} — ${agents.length} agents, ${formatNumber(totals.calls)} calls, ${formatNumber(totals.sales)} sales`}
            icon={Users}
            className="admin-wide-panel"
          >
            <DataTable
              emptyLabel="No agents"
              rows={agents.map((row) => ({ ...row, id: row.user }))}
              columns={[
                { key: 'user', label: 'User' },
                { key: 'full_name', label: 'Name' },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'sales', label: 'Sales', render: (row) => formatNumber(row.sales) },
                { key: 'conv', label: 'Conv %', render: (row) => `${row.calls ? ((row.sales / row.calls) * 100).toFixed(2) : '0.00'}%` },
                { key: 'pause_sec', label: 'Pause', render: (row) => formatSeconds(row.pause_sec) },
                { key: 'wait_sec', label: 'Wait', render: (row) => formatSeconds(row.wait_sec) },
                { key: 'talk_sec', label: 'Talk', render: (row) => formatSeconds(row.talk_sec) },
                { key: 'dispo_sec', label: 'Wrapup', render: (row) => formatSeconds(row.dispo_sec) },
                { key: 'dead_sec', label: 'Dead', render: (row) => formatSeconds(row.dead_sec) },
              ]}
            />
          </Panel>
        );
      })}
    </>
  );
}

// Native merge of AST_agent_days_detail.php + AST_agent_days_time.php: one
// agent per-day rollups with a per-day event drilldown.
function AgentDaysReportView({ token, onLogout }) {
  const today = localDateStr();
  const monthAgo = localDateStr(new Date(Date.now() - 29 * 86400000));
  const [beginDate, setBeginDate] = useState(monthAgo);
  const [endDate, setEndDate] = useState(today);
  const [userId, setUserId] = useState('');
  const [detailDay, setDetailDay] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Range the displayed table was loaded with. The per-day Events drilldown
  // must re-query with THIS range, not the live date inputs — the user may
  // have edited the pickers without clicking Run Report.
  const loadedRangeRef = useRef({ begin: '', end: '' });
  const load = useCallback(async (user, begin, end, day) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (user) params.set('user', user);
      if (day) params.set('day', day);
      const payload = await apiFetch(`/reports/agent-days?${params.toString()}`, token);
      setData(payload);
      loadedRangeRef.current = { begin, end };
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Not allowed to view this agent' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('', monthAgo, today, '');
  }, [load, monthAgo, today]);

  const users = data?.users || [];
  const s = data?.sections;
  const statusByDay = new Map();
  for (const row of s?.dayStatuses || []) {
    const key = String(row.day);
    if (!statusByDay.has(key)) statusByDay.set(key, []);
    statusByDay.get(key).push(row);
  }
  const haSet = new Set(s?.humanAnswered || []);

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Agents and Teams</p>
          <h2>Single Agent Daily</h2>
          <p className="action-copy">Per-day activity for one agent, with a per-day event drilldown.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Agent and Dates" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            setDetailDay('');
            load(userId, beginDate, endDate, '');
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              <span>Agent</span>
              <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                <option value="">Select an agent</option>
                {users.map((row) => (
                  <option key={row.user} value={row.user}>{row.user} - {row.full_name || ''}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <Panel eyebrow={`Agent ${s.userId}`} title="Daily Totals" icon={Users} className="admin-wide-panel">
          <DataTable
            emptyLabel="No activity for this agent in the date range"
            rows={(s.days || []).map((row) => ({ ...row, id: row.day }))}
            columns={[
              { key: 'day', label: 'Date' },
              { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
              { key: 'ha', label: 'HA', render: (row) => formatNumber((statusByDay.get(String(row.day)) || []).reduce((sum, entry) => sum + (haSet.has(String(entry.status)) ? Number(entry.calls) : 0), 0)) },
              { key: 'pause_sec', label: 'Pause', render: (row) => formatSeconds(row.pause_sec) },
              { key: 'wait_sec', label: 'Wait', render: (row) => formatSeconds(row.wait_sec) },
              { key: 'talk_sec', label: 'Talk', render: (row) => formatSeconds(row.talk_sec) },
              { key: 'dispo_sec', label: 'Wrapup', render: (row) => formatSeconds(row.dispo_sec) },
              { key: 'dead_sec', label: 'Dead', render: (row) => formatSeconds(row.dead_sec) },
              { key: 'statuses', label: 'Statuses', render: (row) => (statusByDay.get(String(row.day)) || []).map((entry) => `${entry.status}:${entry.calls}`).join(' ') },
              { key: 'drill', label: '', render: (row) => (
                <button
                  type="button"
                  className="row-action"
                  onClick={() => {
                    setDetailDay(row.day);
                    load(s.userId, loadedRangeRef.current.begin, loadedRangeRef.current.end, row.day);
                  }}
                >
                  Events
                </button>
              ) },
            ]}
          />
        </Panel>
      )}
      {s?.events && (
        <Panel eyebrow={`Agent ${s.userId}`} title={`Events on ${s.detailDay}`} icon={Activity} className="admin-wide-panel">
          <DataTable
            emptyLabel="No events on this day"
            rows={s.events.map((row, index) => ({ ...row, id: `${row.event_time}-${index}` }))}
            columns={[
              { key: 'event_time', label: 'Time', render: (row) => formatDateTime(row.event_time) },
              { key: 'campaign_id', label: 'Campaign' },
              { key: 'lead_id', label: 'Lead' },
              { key: 'status', label: 'Status' },
              { key: 'sub_status', label: 'Pause Code' },
              { key: 'pause_sec', label: 'Pause', render: (row) => `${row.pause_sec}s` },
              { key: 'wait_sec', label: 'Wait', render: (row) => `${row.wait_sec}s` },
              { key: 'talk_sec', label: 'Talk', render: (row) => `${row.talk_sec}s` },
              { key: 'dispo_sec', label: 'Wrapup', render: (row) => `${row.dispo_sec}s` },
              { key: 'dead_sec', label: 'Dead', render: (row) => `${row.dead_sec}s` },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

// Native AST_usergroup_login_report.php: last login details per user in group.
function UserGroupLoginReportView({ token, onLogout }) {
  const [groupId, setGroupId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (group) => {
    setLoading(true);
    setError('');
    try {
      const query = group ? `?user_group=${encodeURIComponent(group)}` : '';
      const payload = await apiFetch(`/reports/usergroup-login${query}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Not allowed to view this user group' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('');
  }, [load]);

  const userGroups = data?.userGroups || [];
  const entries = data?.entries;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Agents and Teams</p>
          <h2>User Group Login Report</h2>
          <p className="action-copy">First/last agent-screen logins and last login details per user.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="User Group" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(groupId);
          }}
        >
          <div className="field-grid">
            <label>
              <span>User Group</span>
              <select value={groupId} onChange={(event) => setGroupId(event.target.value)}>
                <option value="">Select a user group</option>
                {userGroups.map((row) => (
                  <option key={row.user_group} value={row.user_group}>{row.user_group} - {row.group_name || ''}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {entries && (
        <Panel eyebrow="Logins" title={`Users in ${groupId}`} icon={Users} className="admin-wide-panel">
          <DataTable
            emptyLabel="No users in this group"
            rows={entries.map((row) => ({ ...row, id: row.user }))}
            columns={[
              { key: 'user', label: 'User' },
              { key: 'full_name', label: 'Name' },
              { key: 'first_login', label: 'First Login', render: (row) => (row.first_login ? formatDateTime(row.first_login) : 'never') },
              { key: 'last_login', label: 'Last Login', render: (row) => (row.last_login ? formatDateTime(row.last_login) : 'never') },
              { key: 'campaign_id', label: 'Campaign' },
              { key: 'phone_login', label: 'Phone' },
              { key: 'extension', label: 'Extension' },
              { key: 'computer_ip', label: 'Computer IP' },
              { key: 'server_ip', label: 'Server' },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

// Native user_logins_report.php: daily login and failed-login history.
// Native user_stats.php + user_status.php + AST_agent_time_sheet.php in one
// view: live status, per-status call totals, pause codes, time sheet,
// login/logout events, park log and in-group changes for one user.
function UserStatsReportView({ token, onLogout, initialUser, adminUser }) {
  const today = localDateStr();
  const [userId, setUserId] = useState(initialUser || '');
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState(null);
  // The user whose data is actually displayed. Supervisor actions MUST target
  // this, never the userId input state: changing the dropdown without
  // clicking Run Report would otherwise send Emergency Logout / Pause to an
  // agent whose data was never even loaded.
  const [loadedUser, setLoadedUser] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (user, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (user) params.set('user', user);
      const payload = await apiFetch(`/reports/user-stats?${params.toString()}`, token);
      setData(payload);
      setLoadedUser(user || '');
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 404 ? 'User not found or not in your viewable groups' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    setUserId(initialUser || '');
    load(initialUser || '', today, today);
  }, [load, initialUser, today]);

  const users = data?.users || [];
  const live = data?.live;
  const outTotals = (data?.outbound || []).reduce((acc, row) => ({ calls: acc.calls + Number(row.calls || 0), seconds: acc.seconds + Number(row.seconds || 0) }), { calls: 0, seconds: 0 });
  const inTotals = (data?.inbound || []).reduce((acc, row) => ({ calls: acc.calls + Number(row.calls || 0), seconds: acc.seconds + Number(row.seconds || 0) }), { calls: 0, seconds: 0 });

  // Supervisor action gates mirror the server: emergency logout needs
  // modify_users, pause/resume needs level 7+ w/ Agent API access, timeclock
  // corrections need modify_timeclock_log (level 9 always allowed).
  const level = Number(adminUser?.userLevel || 0);
  const canForceLogout = level >= 9 || Boolean(adminUser?.modifyUsers);
  const canExternalPause = level >= 9 || (level > 6 && Boolean(adminUser?.vdcAgentApiAccess));
  const canTimeclock = level >= 9 || Boolean(adminUser?.modifyTimeclockLog);
  const [actionState, setActionState] = useState('');
  const [confirmLogout, setConfirmLogout] = useState(false);

  async function supervisorAction(path, body, label) {
    if (!loadedUser) return;
    setActionState('working');
    try {
      const payload = await apiFetch(`/admin/users/${encodeURIComponent(loadedUser)}/${path}`, token, {
        method: 'POST',
        body: JSON.stringify(body || {}),
      });
      setActionState(`${label} done${payload.status ? ` (${payload.status})` : ''}`);
      load(loadedUser, beginDate, endDate);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setActionState(requestError.status === 403 ? `${label}: not permitted`
        : requestError.status === 404 ? `${label}: agent not logged in`
          : requestError.status === 409 ? `${label}: wrong timeclock state`
            : `${label} failed`);
    }
  }

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Agents and Teams</p>
          <h2>User Stats</h2>
          <p className="action-copy">Live status, calls, pause codes, time sheet and login history for one user.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="User and Dates" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(userId, beginDate, endDate);
          }}
        >
          <div className="field-grid">
            <label>
              <span>User</span>
              <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                <option value="">Pick a user</option>
                {userId && !users.some((row) => row.user === userId) && <option value={userId}>{userId}</option>}
                {users.map((row) => (
                  <option key={row.user} value={row.user}>{row.user} - {row.full_name}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading || !userId}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {data?.info && (
        <>
          <Panel eyebrow={`${data.info.user} - ${data.info.full_name || ''}`} title="Live Status" icon={Radio} className="admin-wide-panel">
            {live ? (
              <p className="connection-summary">
                <StatusPill ok={live.status !== 'PAUSED'}>{live.status}{live.pause_code ? ` (${live.pause_code})` : ''}</StatusPill>
                {' '}Campaign {live.campaign_id} | Session {live.conf_exten} on {live.server_ip} | {live.extension}
                {Number(live.lead_id) > 0 ? ` | On lead ${live.lead_id}` : ''} | Calls today: {formatNumber(live.calls_today)}
                {live.closer_campaigns?.trim() ? ` | In-groups: ${live.closer_campaigns.trim()}` : ''}
                {live.last_state_change ? ` | State since ${formatDateTime(live.last_state_change)}` : ''}
              </p>
            ) : (
              <p className="connection-summary">Not logged into the agent screen right now.</p>
            )}
            {data.timeclockStatus && (
              <p className="connection-summary">
                Timeclock: {data.timeclockStatus.status} since {formatDateTime(data.timeclockStatus.event_date)} ({data.timeclockStatus.ip_address})
              </p>
            )}
            <div className="connection-actions">
              {live && canExternalPause && (
                <>
                  <button type="button" className="row-action" disabled={actionState === 'working'} onClick={() => supervisorAction('external-pause', { action: 'PAUSE' }, 'Pause agent')}>
                    <Timer size={15} aria-hidden="true" /> Pause Agent
                  </button>
                  <button type="button" className="row-action" disabled={actionState === 'working'} onClick={() => supervisorAction('external-pause', { action: 'RESUME' }, 'Resume agent')}>
                    <Radio size={15} aria-hidden="true" /> Resume Agent
                  </button>
                </>
              )}
              {live && canForceLogout && (
                <button
                  type="button"
                  className={confirmLogout ? 'danger-action confirming compact-action' : 'row-action'}
                  disabled={actionState === 'working'}
                  onClick={() => {
                    if (!confirmLogout) {
                      setConfirmLogout(true);
                      return;
                    }
                    setConfirmLogout(false);
                    supervisorAction('emergency-logout', {}, 'Emergency logout');
                  }}
                >
                  <LogOut size={15} aria-hidden="true" />
                  {confirmLogout ? 'Confirm Emergency Logout?' : 'Emergency Logout'}
                </button>
              )}
              {canTimeclock && (
                <>
                  <button type="button" className="row-action" disabled={actionState === 'working'} onClick={() => supervisorAction('timeclock', { action: 'IN' }, 'Timeclock in')}>
                    <Clock3 size={15} aria-hidden="true" /> Clock User In
                  </button>
                  <button type="button" className="row-action" disabled={actionState === 'working'} onClick={() => supervisorAction('timeclock', { action: 'OUT' }, 'Timeclock out')}>
                    <Clock3 size={15} aria-hidden="true" /> Clock User Out
                  </button>
                </>
              )}
              {actionState && actionState !== 'working' && <span className="connection-status">{actionState}</span>}
            </div>
          </Panel>
          <Panel eyebrow="Calls" title={`Outbound (${formatNumber(outTotals.calls)} calls, ${formatSeconds(outTotals.seconds)})`} icon={PhoneCall}>
            <DataTable
              emptyLabel="No outbound calls in the range"
              rows={(data.outbound || []).map((row) => ({ ...row, id: row.status }))}
              columns={[
                { key: 'status', label: 'Status' },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'seconds', label: 'Talk Time', render: (row) => formatSeconds(row.seconds) },
              ]}
            />
          </Panel>
          <Panel eyebrow="Calls" title={`Inbound (${formatNumber(inTotals.calls)} calls, ${formatSeconds(inTotals.seconds)})`} icon={Headphones}>
            <DataTable
              emptyLabel="No inbound calls in the range"
              rows={(data.inbound || []).map((row) => ({ ...row, id: row.status }))}
              columns={[
                { key: 'status', label: 'Status' },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'seconds', label: 'Talk Time', render: (row) => formatSeconds(row.seconds) },
              ]}
            />
          </Panel>
          <Panel eyebrow="Pauses" title={`Pause Codes (${formatNumber((data.pauses || []).length)})`} icon={Timer}>
            <DataTable
              emptyLabel="No pause-code segments in the range"
              rows={(data.pauses || []).map((row) => ({ ...row, id: row.sub_status }))}
              columns={[
                { key: 'sub_status', label: 'Code' },
                { key: 'pause_code_name', label: 'Name', render: (row) => row.pause_code_name || '—' },
                { key: 'segments', label: 'Segments', render: (row) => formatNumber(row.segments) },
                { key: 'pause_seconds', label: 'Total', render: (row) => formatSeconds(row.pause_seconds) },
              ]}
            />
          </Panel>
          <Panel eyebrow="Timeclock" title="Time Sheet" icon={Clock3}>
            <DataTable
              emptyLabel="No timeclock activity in the range"
              rows={(data.timesheet || []).map((row) => ({ ...row, id: row.day }))}
              columns={[
                { key: 'day', label: 'Day', render: (row) => String(row.day).slice(0, 10) },
                { key: 'logins', label: 'Logins', render: (row) => formatNumber(row.logins) },
                { key: 'logouts', label: 'Logouts', render: (row) => formatNumber(row.logouts) },
                { key: 'login_seconds', label: 'Logged In', render: (row) => formatSeconds(row.login_seconds) },
              ]}
            />
            <p className="connection-summary">
              Range total: {formatSeconds((data.timesheet || []).reduce((acc, row) => acc + Number(row.login_seconds || 0), 0))}
            </p>
          </Panel>
          <Panel eyebrow="Sessions" title={`Agent Login / Logout Events (${formatNumber((data.loginEvents || []).length)})`} icon={ShieldCheck} className="admin-wide-panel">
            <DataTable
              emptyLabel="No agent screen sessions in the range"
              rows={(data.loginEvents || []).map((row, index) => ({ ...row, id: `${row.event_date}-${index}` }))}
              columns={[
                { key: 'event', label: 'Event' },
                { key: 'event_date', label: 'Date', render: (row) => formatDateTime(row.event_date) },
                { key: 'campaign_id', label: 'Campaign' },
                { key: 'extension', label: 'Extension' },
                { key: 'phone_login', label: 'Phone' },
                { key: 'computer_ip', label: 'Computer IP' },
                { key: 'server_ip', label: 'Server' },
              ]}
            />
          </Panel>
          <Panel eyebrow="Timeclock" title={`Timeclock Events (${formatNumber((data.timeclockRows || []).length)})`} icon={Clock3}>
            <DataTable
              emptyLabel="No timeclock events in the range"
              rows={(data.timeclockRows || []).map((row, index) => ({ ...row, id: `${row.event_date}-${index}` }))}
              columns={[
                { key: 'event', label: 'Event' },
                { key: 'event_date', label: 'Date', render: (row) => formatDateTime(row.event_date) },
                { key: 'login_sec', label: 'Session', render: (row) => (Number(row.login_sec) > 0 ? formatSeconds(row.login_sec) : '—') },
                { key: 'ip_address', label: 'IP' },
                { key: 'manager_user', label: 'By Manager', render: (row) => row.manager_user || '—' },
              ]}
            />
          </Panel>
          <Panel eyebrow="Calls" title={`Park Log (${formatNumber((data.parks || []).length)})`} icon={PhoneCall}>
            <DataTable
              emptyLabel="No parked calls in the range"
              rows={(data.parks || []).map((row, index) => ({ ...row, id: `${row.parked_time}-${index}` }))}
              columns={[
                { key: 'parked_time', label: 'Time', render: (row) => formatDateTime(row.parked_time) },
                { key: 'status', label: 'Status' },
                { key: 'lead_id', label: 'Lead' },
                { key: 'parked_sec', label: 'Held', render: (row) => formatSeconds(row.parked_sec) },
              ]}
            />
          </Panel>
          <Panel eyebrow="Sessions" title={`In-Group Changes (${formatNumber((data.closerChanges || []).length)})`} icon={Headphones}>
            <DataTable
              emptyLabel="No in-group selection changes in the range"
              rows={(data.closerChanges || []).map((row, index) => ({ ...row, id: `${row.event_date}-${index}` }))}
              columns={[
                { key: 'event_date', label: 'Date', render: (row) => formatDateTime(row.event_date) },
                { key: 'campaign_id', label: 'Campaign' },
                { key: 'blended', label: 'Blended' },
                { key: 'closer_campaigns', label: 'In-Groups' },
                { key: 'manager_change', label: 'By Manager' },
              ]}
            />
          </Panel>
        </>
      )}
    </>
  );
}

function UserLoginsReportView({ token, onLogout }) {
  const [userId, setUserId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (user) => {
    setLoading(true);
    setError('');
    try {
      const query = user ? `?user=${encodeURIComponent(user)}` : '';
      const payload = await apiFetch(`/reports/user-logins${query}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Not allowed to view this report' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('');
  }, [load]);

  const users = data?.users || [];
  const entries = data?.entries || [];

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Agents and Teams</p>
          <h2>User Logins</h2>
          <p className="action-copy">Daily login and failed-login history per user.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="User" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(userId);
          }}
        >
          <div className="field-grid">
            <label>
              <span>User</span>
              <select value={userId} onChange={(event) => setUserId(event.target.value)}>
                <option value="">All users</option>
                {users.map((row) => (
                  <option key={row.user} value={row.user}>{row.user} - {row.full_name || ''}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      <Panel eyebrow="History" title="Login Days" icon={ShieldCheck} className="admin-wide-panel">
        <DataTable
          emptyLabel="No login history"
          rows={entries.map((row, index) => ({ ...row, id: `${row.user}-${row.login_day}-${index}` }))}
          columns={[
            { key: 'user', label: 'User' },
            { key: 'full_name', label: 'Name' },
            { key: 'login_day', label: 'Day', render: (row) => (row.login_day === 'TODAY' ? 'TODAY' : String(row.login_day || '').slice(0, 10)) },
            { key: 'last_login_date', label: 'Last Login', render: (row) => formatDateTime(row.last_login_date) },
            { key: 'last_ip', label: 'Last IP' },
            { key: 'failed_login_attempts_today', label: 'Failed (day)' },
            { key: 'failed_login_count_today', label: 'Failed Total' },
            { key: 'failed_last_ip_today', label: 'Failed IP' },
            { key: 'failed_last_type_today', label: 'Failed Type' },
          ]}
        />
      </Panel>
    </>
  );
}

// Native AST_performance_comparison_report.php: agent stats across the legacy
// trailing windows.
function PerformanceComparisonReportView({ token, onLogout }) {
  const today = localDateStr();
  const [endDate, setEndDate] = useState(today);
  const [campaignId, setCampaignId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (campaign, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ end_date: end });
      if (campaign) params.set('campaign', campaign);
      const payload = await apiFetch(`/reports/performance-comparison?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Not allowed to view this report or campaign' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('', today);
  }, [load, today]);

  const windows = data?.windows || [];

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Agents and Teams</p>
          <h2>Performance Comparison</h2>
          <p className="action-copy">Agent calls, sales and time compared over trailing 1/2/3/5/10/30-day windows.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Campaign and End Date" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(campaignId, endDate);
          }}
        >
          <div className="field-grid">
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              <span>Campaign</span>
              <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
                <option value="">All campaigns</option>
                {(data?.campaigns || []).map((row) => (
                  <option key={row.campaign_id} value={row.campaign_id}>{row.campaign_id}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      <section className="admin-grid media-tools-grid">
        {windows.map((window) => (
          <Panel
            key={window.daysBack}
            eyebrow={window.daysBack === 0 ? 'Today' : `Last ${window.daysBack + 1} days`}
            title={`${window.beginDay} to ${data.endDate}`}
            icon={Users}
          >
            <DataTable
              emptyLabel="No agent activity in this window"
              rows={(window.agents || []).map((row) => ({ ...row, id: row.user }))}
              columns={[
                { key: 'user', label: 'User' },
                { key: 'full_name', label: 'Name' },
                { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
                { key: 'sales', label: 'Sales', render: (row) => formatNumber(row.sales) },
                { key: 'conv', label: 'Conv %', render: (row) => `${row.calls ? ((row.sales / row.calls) * 100).toFixed(2) : '0.00'}%` },
                { key: 'sph', label: 'SPH', render: (row) => {
                  const hours = (Number(row.talk_sec) + Number(row.pause_sec) + Number(row.wait_sec) + Number(row.dispo_sec) + Number(row.dead_sec)) / 3600;
                  return hours ? (row.sales / hours).toFixed(2) : '0.00';
                } },
                { key: 'time', label: 'Time', render: (row) => formatSeconds(Number(row.talk_sec) + Number(row.pause_sec) + Number(row.wait_sec) + Number(row.dispo_sec) + Number(row.dead_sec)) },
              ]}
            />
          </Panel>
        ))}
      </section>
    </>
  );
}

// Native AST_user_group_hourly_detail.php: distinct agents per group per hour.
function UserGroupHourlyReportView({ token, onLogout }) {
  const today = localDateStr();
  const [date, setDate] = useState(today);
  const [campaignId, setCampaignId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (campaign, day) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ date: day });
      if (campaign) params.set('campaign', campaign);
      const payload = await apiFetch(`/reports/usergroup-hourly?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Not allowed to view this report or campaign' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('', today);
  }, [load, today]);

  const s = data?.sections;
  const groups = [...new Set((s?.hourly || []).map((row) => String(row.user_group || '(none)')))].sort();
  const hours = [...new Set((s?.hourly || []).map((row) => String(row.hour)))].sort();
  const cell = new Map((s?.hourly || []).map((row) => [`${row.hour}|${row.user_group}`, Number(row.agents || 0)]));

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Agents and Teams</p>
          <h2>User Group Hourly</h2>
          <p className="action-copy">Distinct agents active per user group per hour of one day.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Date and Campaign" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(campaignId, date);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Date</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label>
              <span>Campaign</span>
              <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
                <option value="">All campaigns</option>
                {(data?.campaigns || []).map((row) => (
                  <option key={row.campaign_id} value={row.campaign_id}>{row.campaign_id}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <Panel eyebrow="Hourly" title={`Agents per Group — ${data.date} (${formatNumber(s.grand)} distinct agents)`} icon={Users} className="admin-wide-panel">
          <DataTable
            emptyLabel="No agent activity on this day"
            rows={hours.map((hour) => ({ id: hour, hour }))}
            columns={[
              { key: 'hour', label: 'Hour', render: (row) => `${row.hour}:00` },
              ...groups.map((group) => ({
                key: `g-${group}`, label: group,
                render: (row) => formatNumber(cell.get(`${row.hour}|${group}`) || 0),
              })),
            ]}
          />
          <div className="connection-actions">
            {(s.totals || []).map((row) => (
              <span className="connection-status" key={row.user_group}>{row.user_group}: {formatNumber(row.agents)} agents</span>
            ))}
          </div>
        </Panel>
      )}
    </>
  );
}

// Native exports hub: Export Calls, Export Leads, Callbacks Export as CSV
// downloads (ports of call_report_export.php, lead_report_export.php,
// callbacks_export.php).
function ExportsReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [campaignsSel, setCampaignsSel] = useState([]);
  const [groupsSel, setGroupsSel] = useState([]);
  const [pickers, setPickers] = useState({ campaigns: [], groups: [] });
  const [status, setStatus] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const payload = await apiFetch('/reports/export-calls?picker=1', token);
        setPickers({ campaigns: payload.campaigns || [], groups: payload.groups || [] });
      } catch (requestError) {
        if (requestError.status === 401) onLogout?.();
      }
    })();
  }, [token, onLogout]);

  const download = async (path, filename) => {
    setStatus('working');
    try {
      const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw Object.assign(new Error('download_failed'), { status: response.status });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setStatus('Download started');
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setStatus(requestError.status === 403 ? 'Not permitted' : requestError.status === 400 ? 'Select at least one campaign' : 'Download failed');
    }
  };

  const dateQuery = `begin_date=${beginDate}&end_date=${endDate}`;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Exports</p>
          <h2>Data Exports</h2>
          <p className="action-copy">CSV exports of calls, leads and callbacks. Lead and phone fields follow your data-visibility permissions.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Date Range and Scope" icon={Search} className="admin-wide-panel">
        <div className="field-grid">
          <label>
            <span>Begin Date</span>
            <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
          </label>
          <label>
            <span>End Date</span>
            <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </label>
        </div>
        <p className="connection-summary">Campaigns (used by call + lead exports):</p>
        <CampaignTogglePicker campaigns={pickers.campaigns} selected={campaignsSel} onChange={setCampaignsSel} />
        <p className="connection-summary">In-groups (adds inbound calls to the call export):</p>
        <CampaignTogglePicker
          campaigns={pickers.groups.map((row) => ({ campaign_id: row.group_id, campaign_name: row.group_name }))}
          selected={groupsSel}
          onChange={setGroupsSel}
          emptyLabel="No inbound groups available"
        />
        {status && <p className="connection-summary">{status}</p>}
      </Panel>
      <section className="admin-grid media-tools-grid">
        <Panel eyebrow="Export" title="Export Calls" icon={PhoneCall}>
          <p className="connection-summary">Outbound log calls for the selected campaigns plus inbound calls for the selected in-groups, with full lead details per row.</p>
          <div className="modal-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => download(
                `/reports/export-calls?${dateQuery}&campaigns=${encodeURIComponent(campaignsSel.join(','))}&groups=${encodeURIComponent(groupsSel.join(','))}`,
                `calls_export_${beginDate}_${endDate}.csv`,
              )}
            >
              Download Calls CSV
            </button>
          </div>
        </Panel>
        <Panel eyebrow="Export" title="Export Leads" icon={Database}>
          <p className="connection-summary">Leads entered in the date range for the selected campaigns' lists. Requires the list-download permission.</p>
          <div className="modal-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => download(
                `/reports/export-leads?${dateQuery}&campaigns=${encodeURIComponent(campaignsSel.join(','))}`,
                `leads_export_${beginDate}_${endDate}.csv`,
              )}
            >
              Download Leads CSV
            </button>
          </div>
        </Panel>
        <Panel eyebrow="Export" title="Export Calls by Carrier" icon={PhoneCall}>
          <p className="connection-summary">Outbound calls with carrier-log and dial-log columns (hangup cause, dialstatus, SIP causes) joined per call. Select at least one campaign.</p>
          <div className="modal-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => download(
                `/reports/export-calls-carrier?${dateQuery}&campaigns=${encodeURIComponent(campaignsSel.join(','))}`,
                `calls_carrier_export_${beginDate}_${endDate}.csv`,
              )}
            >
              Download Carrier CSV
            </button>
          </div>
        </Panel>
        <Panel eyebrow="Export" title="Callbacks Export" icon={Activity}>
          <p className="connection-summary">Scheduled callbacks with callback time in the date range for your allowed campaigns.</p>
          <div className="modal-actions">
            <button
              type="button"
              className="primary-action"
              onClick={() => download(
                `/reports/export-callbacks?${dateQuery}`,
                `callbacks_export_${beginDate}_${endDate}.csv`,
              )}
            >
              Download Callbacks CSV
            </button>
          </div>
        </Panel>
      </section>
    </>
  );
}

// Native called_counts_multilist_report.php: leads with call activity per list.
function CalledCountsReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (listIds, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (listIds.length) params.set('list_ids', listIds.join(','));
      const payload = await apiFetch(`/reports/called-counts?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], today, today);
  }, [load, today]);

  const lists = data?.lists || [];
  const entries = data?.entries;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Exports</p>
          <h2>Called Counts by List</h2>
          <p className="action-copy">Leads with call activity in the date range per selected list.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Lists and Dates" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, beginDate, endDate);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </div>
          <div className="connection-actions">
            {lists.map((row) => {
              const id = String(row.list_id);
              const isSelected = selected.includes(id);
              return (
                <button
                  type="button"
                  key={id}
                  className={isSelected ? 'row-action tool-picker-item selected' : 'row-action'}
                  onClick={() => setSelected(isSelected ? selected.filter((item) => item !== id) : [...selected, id])}
                >
                  {row.list_id} - {row.list_name || ''}{isSelected ? ' ✓' : ''}
                </button>
              );
            })}
            {!lists.length && <span className="connection-summary">No lists available</span>}
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {entries && (
        <Panel eyebrow="Counts" title="Called Counts" icon={Database} className="admin-wide-panel">
          <DataTable
            emptyLabel="No lists selected"
            rows={entries.map((row) => ({ ...row, id: String(row.list_id) }))}
            columns={[
              { key: 'list_id', label: 'List' },
              { key: 'list_name', label: 'Name' },
              { key: 'campaign_id', label: 'Campaign' },
              { key: 'leads', label: 'Total Leads', render: (row) => formatNumber(row.leads) },
              { key: 'outbound_called_leads', label: 'Out Called Leads', render: (row) => formatNumber(row.outbound_called_leads) },
              { key: 'outbound_calls', label: 'Out Calls', render: (row) => formatNumber(row.outbound_calls) },
              { key: 'inbound_called_leads', label: 'In Called Leads', render: (row) => formatNumber(row.inbound_called_leads) },
              { key: 'inbound_calls', label: 'In Calls', render: (row) => formatNumber(row.inbound_calls) },
              { key: 'pct', label: 'Penetration', render: (row) => `${row.leads ? ((row.outbound_called_leads / row.leads) * 100).toFixed(2) : '0.00'}%` },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

// Native AST_admin_report.php: administration change log.
function AdminChangeLogReportView({ token, onLogout, initialSection, initialRecord }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [section, setSection] = useState(initialSection || '');
  const [record, setRecord] = useState(initialRecord || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (begin, end, sectionFilter, recordFilter) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (sectionFilter) params.set('section', sectionFilter);
      if (recordFilter) params.set('record', recordFilter);
      const payload = await apiFetch(`/reports/admin-log?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    setSection(initialSection || '');
    setRecord(initialRecord || '');
    load(today, today, initialSection || '', initialRecord || '');
  }, [load, today, initialSection, initialRecord]);

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Logs and QA</p>
          <h2>Administration Change Log</h2>
          <p className="action-copy">Every admin modification recorded in the change log.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Dates and Section" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(beginDate, endDate, section, record);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              <span>Section</span>
              <select value={section} onChange={(event) => setSection(event.target.value)}>
                <option value="">All sections</option>
                {section && !(data?.sections || []).includes(section) && <option value={section}>{section}</option>}
                {(data?.sections || []).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
            <label>
              <span>Record ID</span>
              <input value={record} placeholder="All records" onChange={(event) => setRecord(event.target.value)} />
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      <Panel eyebrow="Changes" title={`Admin Log (${formatNumber((data?.entries || []).length)} rows)`} icon={ShieldCheck} className="admin-wide-panel">
        <DataTable
          emptyLabel="No admin changes in the date range"
          rows={(data?.entries || []).map((row) => ({ ...row, id: row.admin_log_id }))}
          columns={[
            { key: 'event_date', label: 'Date', render: (row) => formatDateTime(row.event_date) },
            { key: 'user', label: 'User' },
            { key: 'ip_address', label: 'IP' },
            { key: 'event_section', label: 'Section' },
            { key: 'event_type', label: 'Type' },
            { key: 'record_id', label: 'Record' },
            { key: 'event_code', label: 'Event' },
          ]}
        />
      </Panel>
    </>
  );
}

// Legacy admin.php callbacks-on-hold pages (ADD=8/81/811/8111 → ADD=82):
// ACTIVE/LIVE callbacks scoped by user, campaign, list or user group, with
// the bulk "deactivate older than a month/week" actions (SUB=89/899).
const CALLBACK_HOLD_SCOPE_OPTIONS = [
  ['campaign', 'Campaign'],
  ['user', 'User'],
  ['list', 'List'],
  ['user_group', 'User Group'],
];

function CallbackHoldsReportView({ token, onLogout, initialScope, initialId, onNavigate }) {
  const [scope, setScope] = useState(initialScope || 'campaign');
  const [holdId, setHoldId] = useState(initialId || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState('');
  const [actionState, setActionState] = useState('');

  // The scope/id the displayed listing was loaded for. The bulk-deactivate
  // action MUST use this, not the live form state: editing the ID field or
  // flipping the Scope select without clicking Show Callbacks would
  // otherwise mass-deactivate callbacks the admin never looked at.
  const [loadedTarget, setLoadedTarget] = useState(null);
  const load = useCallback(async (scopeValue, idValue) => {
    if (!idValue) {
      setData(null);
      setLoadedTarget(null);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ scope: scopeValue, id: idValue });
      const payload = await apiFetch(`/reports/callback-holds?${params.toString()}`, token);
      setData(payload);
      setLoadedTarget({ scope: scopeValue, id: idValue });
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError('The callback listings failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    setScope(initialScope || 'campaign');
    setHoldId(initialId || '');
    setConfirming('');
    setActionState('');
    load(initialScope || 'campaign', initialId || '');
  }, [load, initialScope, initialId]);

  async function deactivate(window) {
    if (!loadedTarget) return;
    if (confirming !== window) {
      setConfirming(window);
      return;
    }
    setConfirming('');
    setActionState('working');
    try {
      const payload = await apiFetch('/reports/callback-holds/deactivate', token, {
        method: 'POST',
        body: JSON.stringify({ scope: loadedTarget.scope, id: loadedTarget.id, window }),
      });
      setActionState(`${formatNumber(payload.deactivated)} callback${payload.deactivated === 1 ? '' : 's'} made INACTIVE`);
      load(loadedTarget.scope, loadedTarget.id);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setActionState(requestError.status === 403 ? 'Not permitted' : 'Deactivate failed');
    }
  }

  const entries = data?.entries || [];
  const scopeLabel = (CALLBACK_HOLD_SCOPE_OPTIONS.find(([value]) => value === scope) || [])[1] || 'Campaign';

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Outbound and Lists</p>
          <h2>CallBack Holds</h2>
          <p className="action-copy">ACTIVE and LIVE callbacks on hold for a campaign, user, list or user group.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Scope" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            setConfirming('');
            setActionState('');
            load(scope, holdId);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Scope</span>
              <select value={scope} onChange={(event) => setScope(event.target.value)}>
                {CALLBACK_HOLD_SCOPE_OPTIONS.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
            <label>
              <span>{scopeLabel} ID</span>
              <input value={holdId} placeholder="Required" onChange={(event) => setHoldId(event.target.value)} />
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading || !holdId}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Show Callbacks'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      <Panel eyebrow="Callbacks" title={`Callback Hold Listings (${formatNumber(entries.length)})`} icon={Clock3} className="admin-wide-panel">
        <DataTable
          emptyLabel={holdId ? 'No ACTIVE or LIVE callbacks for this selection' : 'Pick a scope and ID to list callbacks on hold'}
          rows={entries.map((row) => ({ ...row, id: row.callback_id }))}
          columns={[
            {
              key: 'lead_id',
              label: 'Lead',
              render: (row) => (
                <button type="button" className="row-action" onClick={() => onNavigate?.('leadSearch', { leadId: row.lead_id })}>
                  {row.lead_id}
                </button>
              ),
            },
            { key: 'list_id', label: 'List' },
            { key: 'campaign_id', label: 'Campaign' },
            { key: 'entry_time', label: 'Entry Date', render: (row) => formatDateTime(row.entry_time) },
            { key: 'callback_time', label: 'Callback Date', render: (row) => formatDateTime(row.callback_time) },
            { key: 'user', label: 'User' },
            { key: 'recipient', label: 'Recipient' },
            { key: 'status', label: 'Status' },
            { key: 'user_group', label: 'Group' },
          ]}
        />
        {data?.canDeactivate && holdId && (
          <div className="connection-actions">
            <button
              type="button"
              className={confirming === 'month' ? 'danger-action confirming compact-action' : 'row-action'}
              disabled={actionState === 'working'}
              onClick={() => deactivate('month')}
            >
              {confirming === 'month' ? 'Confirm Deactivate?' : 'Remove LIVE Callbacks older than one month'}
            </button>
            <button
              type="button"
              className={confirming === 'week' ? 'danger-action confirming compact-action' : 'row-action'}
              disabled={actionState === 'working'}
              onClick={() => deactivate('week')}
            >
              {confirming === 'week' ? 'Confirm Deactivate?' : 'Remove LIVE Callbacks older than one week'}
            </button>
            {actionState && actionState !== 'working' && <span className="connection-status">{actionState}</span>}
          </div>
        )}
      </Panel>
    </>
  );
}

// Native AST_dial_log_report.php: raw dial-log rows.
function DialLogReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [serverIp, setServerIp] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (begin, end, server) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (server) params.set('server_ip', server);
      const payload = await apiFetch(`/reports/dial-log?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load(today, today, '');
  }, [load, today]);

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Logs and QA</p>
          <h2>Dial Log</h2>
          <p className="action-copy">Raw outbound dial attempts with SIP hangup causes.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Dates and Server" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(beginDate, endDate, serverIp);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              <span>Server</span>
              <select value={serverIp} onChange={(event) => setServerIp(event.target.value)}>
                <option value="">All servers</option>
                {(data?.servers || []).map((row) => (
                  <option key={row.server_ip} value={row.server_ip}>{row.server_ip} - {row.server_description || ''}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      <Panel eyebrow="Log" title={`Dial Attempts (${formatNumber((data?.entries || []).length)} rows${(data?.entries || []).length === 2000 ? ', capped' : ''})`} icon={Activity} className="admin-wide-panel">
        <DataTable
          emptyLabel="No dial-log entries in the date range"
          rows={(data?.entries || []).map((row, index) => ({ ...row, id: `${row.caller_code}-${index}` }))}
          columns={[
            { key: 'call_date', label: 'Date', render: (row) => formatDateTime(row.call_date) },
            { key: 'caller_code', label: 'Caller Code' },
            { key: 'lead_id', label: 'Lead' },
            { key: 'server_ip', label: 'Server' },
            { key: 'extension', label: 'Extension' },
            { key: 'outbound_cid', label: 'Outbound CID' },
            { key: 'sip_hangup_cause', label: 'SIP Cause' },
            { key: 'sip_hangup_reason', label: 'SIP Reason' },
          ]}
        />
      </Panel>
    </>
  );
}

function TimeclockReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [userFilter, setUserFilter] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (begin, end, userText) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (userText) params.set('user', userText);
      const payload = await apiFetch(`/reports/timeclock?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) { onLogout?.(); return; }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => { load(today, today, ''); }, [load, today]);

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Time Clock</p>
          <h2>User Timeclock Report</h2>
          <p className="action-copy">Time clock login/logout events and total clocked time per user.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Dates and User" icon={Search} className="admin-wide-panel">
        <form className="entity-form report-filter-bar" onSubmit={(event) => { event.preventDefault(); load(beginDate, endDate, userFilter); }}>
          <div className="field-grid">
            <label><span>Begin Date</span><input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} /></label>
            <label><span>End Date</span><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label>
            <label><span>User (blank = all)</span><input type="text" value={userFilter} onChange={(event) => setUserFilter(event.target.value)} /></label>
          </div>
          <div className="modal-actions"><button type="submit" className="primary-action" disabled={loading}><Search size={16} aria-hidden="true" />{loading ? 'Loading' : 'Run Report'}</button></div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      <Panel eyebrow="Summary" title="Clocked Time by User" icon={Clock3} className="admin-wide-panel">
        <DataTable
          emptyLabel="No timeclock activity in the date range"
          rows={(data?.summary || []).map((row, index) => ({ ...row, id: `${row.user}-${index}` }))}
          columns={[
            { key: 'user', label: 'User' },
            { key: 'user_group', label: 'Group' },
            { key: 'logins', label: 'Logins', render: (row) => formatNumber(row.logins) },
            { key: 'total_sec', label: 'Total Time', render: (row) => formatSeconds(row.total_sec) },
          ]}
        />
      </Panel>
      <Panel eyebrow="Detail" title={`Events (${formatNumber((data?.entries || []).length)} rows${(data?.entries || []).length === 2000 ? ', capped' : ''})`} icon={History} className="admin-wide-panel">
        <DataTable
          emptyLabel="No timeclock events in the date range"
          rows={(data?.entries || []).map((row) => ({ ...row, id: row.timeclock_id }))}
          columns={[
            { key: 'event_date', label: 'Date', render: (row) => formatDateTime(row.event_date) },
            { key: 'user', label: 'User' },
            { key: 'event', label: 'Event' },
            // 65000s (~18h) is the legacy vicidial threshold for a bogus
            // timeclock session (missed punch-out) — such LOGOUT rows show a
            // blank Session on purpose, matching the stock timeclock report.
            { key: 'login_sec', label: 'Session', render: (row) => (row.event === 'LOGOUT' && row.login_sec < 65000 ? formatSeconds(row.login_sec) : '') },
            { key: 'ip_address', label: 'IP' },
            { key: 'manager_user', label: 'Manager', render: (row) => row.manager_user || '' },
          ]}
        />
      </Panel>
    </>
  );
}

function TimeclockStatusReportView({ token, onLogout }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const payload = await apiFetch('/reports/timeclock-status', token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) { onLogout?.(); return; }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => { load(); }, [load]);

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">Time Clock</p>
          <h2>Timeclock Status</h2>
          <p className="action-copy">Current clocked-in / clocked-out status per user, from each user's latest event.</p>
        </div>
        <button type="button" className="primary-action" onClick={load} disabled={loading}><RefreshCcw size={16} aria-hidden="true" />{loading ? 'Loading' : 'Refresh'}</button>
      </section>
      {error && <p className="form-error">{error}</p>}
      <Panel eyebrow="Summary" title="By User Group" icon={Users} className="admin-wide-panel">
        <DataTable
          emptyLabel="No timeclock data"
          rows={(data?.groups || []).map((row, index) => ({ ...row, id: `${row.user_group}-${index}` }))}
          columns={[
            { key: 'user_group', label: 'Group' },
            { key: 'logged_in', label: 'Clocked In', render: (row) => formatNumber(row.logged_in) },
            { key: 'logged_out', label: 'Clocked Out', render: (row) => formatNumber(row.logged_out) },
          ]}
        />
      </Panel>
      <Panel eyebrow="Detail" title="User Status" icon={Clock3} className="admin-wide-panel">
        <DataTable
          emptyLabel="No timeclock data"
          rows={(data?.users || []).map((row, index) => ({ ...row, id: `${row.user}-${index}` }))}
          columns={[
            { key: 'user', label: 'User', render: (row) => (<><strong>{row.user}</strong><span>{row.full_name || ''}</span></>) },
            { key: 'user_group', label: 'Group' },
            { key: 'event', label: 'Status', render: (row) => <StatusPill ok={row.event === 'LOGIN'}>{row.event === 'LOGIN' ? 'Clocked In' : 'Clocked Out'}</StatusPill> },
            { key: 'event_date', label: 'Since', render: (row) => formatDateTime(row.event_date) },
          ]}
        />
      </Panel>
    </>
  );
}

// Generic Logs-and-QA raw-log viewer: date range + optional text filter,
// summary panels and a capped detail table, driven by a config object.
function LogReportView({ token, onLogout, config }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [beginTime, setBeginTime] = useState('00:00');
  const [endTime, setEndTime] = useState('23:59');
  const [filterValue, setFilterValue] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (begin, end, filter, bTime, eTime) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (config.datetime && bTime) params.set('begin_time', bTime);
      if (config.datetime && eTime) params.set('end_time', eTime);
      if (config.filter && filter) params.set(config.filter.param, filter);
      const payload = await apiFetch(`${config.endpoint}?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout, config]);

  useEffect(() => {
    load(today, today, '', '00:00', '23:59');
  }, [load, today]);

  return (
    <div className="log-report">
      <section className="report-hero">
        <div>
          <p className="eyebrow">Logs and QA</p>
          <h2>{config.title}</h2>
          <p className="action-copy">{config.description}</p>
        </div>
      </section>
      <section className="admin-grid log-report-top">
      <Panel eyebrow="Filters" title="Date Range" icon={Search}>
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(beginDate, endDate, filterValue, beginTime, endTime);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            {config.datetime && (
              <label>
                <span>Begin Time</span>
                <input type="time" value={beginTime} onChange={(event) => setBeginTime(event.target.value)} />
              </label>
            )}
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            {config.datetime && (
              <label>
                <span>End Time</span>
                <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </label>
            )}
            {config.filter && (
              <label>
                <span>{config.filter.label}</span>
                <input type="text" value={filterValue} onChange={(event) => setFilterValue(event.target.value)} placeholder="optional" />
              </label>
            )}
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {data && (config.summaries || []).map((summary) => (
        <Panel key={summary.key} eyebrow="Summary" title={summary.title} icon={Activity}>
          <DataTable
            emptyLabel="No entries in the date range"
            rows={(data[summary.key] || []).map((row, index) => ({ ...row, id: `${summary.key}-${index}` }))}
            columns={summary.columns}
          />
        </Panel>
      ))}
      </section>
      {data && config.entriesKey && (
        <Panel
          eyebrow="Log"
          title={`${config.title} (${formatNumber((data[config.entriesKey] || []).length)} rows${(data[config.entriesKey] || []).length === 2000 ? ', capped' : ''})`}
          icon={Database}
          className="admin-wide-panel"
        >
          <DataTable
            emptyLabel="No entries in the date range"
            rows={(data[config.entriesKey] || []).map((row, index) => ({ ...row, id: `row-${index}` }))}
            columns={config.columns}
          />
        </Panel>
      )}
    </div>
  );
}

const LOG_REPORT_CONFIGS = {
  reportCarrierLog: {
    title: 'Carrier Log',
    description: 'Raw carrier-log entries with dialstatus, hangup causes and SIP error reasons.',
    endpoint: '/reports/carrier-log',
    datetime: true,
    filter: { param: 'dialstatus', label: 'Dialstatus' },
    entriesKey: 'entries',
    summaries: [
      {
        key: 'statuses',
        title: 'Dial Status Breakdown',
        columns: [
          { key: 'hangup_cause', label: 'Hangup Cause', render: (row) => String(row.hangup_cause ?? 'NONE') },
          { key: 'dialstatus', label: 'Dial Status', render: (row) => row.dialstatus || 'NONE' },
          { key: 'calls', label: 'Count', render: (row) => formatNumber(row.calls) },
        ],
      },
      {
        key: 'sipCauses',
        title: 'SIP Error Reason Breakdown',
        columns: [
          { key: 'sip_hangup_cause', label: 'SIP Code', render: (row) => String(row.sip_hangup_cause ?? 'NONE') },
          { key: 'sip_hangup_reason', label: 'SIP Hangup Reason' },
          { key: 'calls', label: 'Count', render: (row) => formatNumber(row.calls) },
        ],
      },
    ],
    columns: [
      { key: 'call_date', label: 'Date', render: (row) => formatDateTime(row.call_date) },
      { key: 'lead_id', label: 'Lead' },
      { key: 'dialstatus', label: 'Dialstatus' },
      { key: 'hangup_cause', label: 'Hangup' },
      { key: 'sip_hangup_cause', label: 'SIP Cause' },
      { key: 'sip_hangup_reason', label: 'SIP Reason' },
      { key: 'server_ip', label: 'Server' },
      { key: 'caller_code', label: 'Caller Code' },
    ],
  },
  reportHangupCause: {
    title: 'Hangup Cause',
    description: 'Hangup cause and SIP cause distribution from the carrier log.',
    endpoint: '/reports/hangup-cause',
    datetime: true,
    entriesKey: null,
    summaries: [
      {
        key: 'causes',
        title: 'Hangup Causes',
        columns: [
          { key: 'hangup_cause', label: 'Cause', render: (row) => String(row.hangup_cause ?? 'NONE') },
          { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
        ],
      },
      {
        key: 'sipCauses',
        title: 'SIP Causes',
        columns: [
          { key: 'sip_hangup_cause', label: 'SIP Cause', render: (row) => String(row.sip_hangup_cause ?? 'NONE') },
          { key: 'sip_hangup_reason', label: 'Reason' },
          { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
        ],
      },
      {
        key: 'statuses',
        title: 'Dialstatus x Cause',
        columns: [
          { key: 'dialstatus', label: 'Dialstatus', render: (row) => row.dialstatus || 'NONE' },
          { key: 'hangup_cause', label: 'Cause', render: (row) => String(row.hangup_cause ?? 'NONE') },
          { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
        ],
      },
    ],
    columns: [],
  },
  reportSipEvent: {
    title: 'SIP Event Log',
    description: 'SIP signaling events recorded per call.',
    endpoint: '/reports/sip-event',
    filter: { param: 'sip_event', label: 'SIP Event' },
    entriesKey: 'entries',
    summaries: [{
      key: 'summary',
      title: 'Event Summary',
      columns: [
        { key: 'sip_event', label: 'Event' },
        { key: 'events', label: 'Count', render: (row) => formatNumber(row.events) },
      ],
    }],
    columns: [
      { key: 'event_date', label: 'Date', render: (row) => formatDateTime(row.event_date) },
      { key: 'sip_event', label: 'Event' },
      { key: 'caller_code', label: 'Caller Code' },
      { key: 'server_ip', label: 'Server' },
      { key: 'channel', label: 'Channel' },
      { key: 'sip_call_id', label: 'SIP Call ID' },
    ],
  },
  reportAmdLog: {
    title: 'AMD Log',
    description: 'Answering machine detection results per call.',
    endpoint: '/reports/amd-log',
    entriesKey: 'entries',
    summaries: [
      {
        key: 'statusSummary',
        title: 'AMD Status Summary',
        columns: [
          { key: 'amd_status', label: 'Status', render: (row) => row.amd_status || 'NONE' },
          { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
        ],
      },
      {
        key: 'causeSummary',
        title: 'AMD Cause Summary',
        columns: [
          { key: 'amd_cause', label: 'Cause', render: (row) => row.amd_cause || 'NONE' },
          { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
        ],
      },
    ],
    columns: [
      { key: 'call_date', label: 'Date', render: (row) => formatDateTime(row.call_date) },
      { key: 'lead_id', label: 'Lead' },
      { key: 'amd_status', label: 'Status' },
      { key: 'amd_cause', label: 'Cause' },
      { key: 'amd_response', label: 'Response' },
      { key: 'server_ip', label: 'Server' },
    ],
  },
  reportRecordingAccess: {
    title: 'Recording Access Log',
    description: 'Who listened to or downloaded recordings.',
    endpoint: '/reports/recording-access',
    filter: { param: 'user', label: 'User' },
    entriesKey: 'entries',
    summaries: [],
    columns: [
      { key: 'access_datetime', label: 'Accessed', render: (row) => formatDateTime(row.access_datetime) },
      { key: 'user', label: 'User' },
      { key: 'full_name', label: 'Name' },
      { key: 'user_group', label: 'Group' },
      { key: 'recording_id', label: 'Recording' },
      { key: 'lead_id', label: 'Lead' },
      { key: 'start_time', label: 'Recorded', render: (row) => formatDateTime(row.start_time) },
      { key: 'access_result', label: 'Result' },
      { key: 'ip', label: 'IP' },
    ],
  },
  reportAgentDebugLog: {
    title: 'Agent Debug Log',
    description: 'Agent-screen AJAX activity with script timings.',
    endpoint: '/reports/agent-debug-log',
    filter: { param: 'user', label: 'User' },
    entriesKey: 'entries',
    summaries: [{
      key: 'summary',
      title: 'Action Summary',
      columns: [
        { key: 'action', label: 'Action', render: (row) => row.action || 'NONE' },
        { key: 'events', label: 'Events', render: (row) => formatNumber(row.events) },
        { key: 'avg_run_time', label: 'Avg Run', render: (row) => `${Number(row.avg_run_time || 0).toFixed(3)}s` },
      ],
    }],
    columns: [
      { key: 'db_time', label: 'Time', render: (row) => formatDateTime(row.db_time) },
      { key: 'user', label: 'User' },
      { key: 'action', label: 'Action' },
      { key: 'stage', label: 'Stage' },
      { key: 'lead_id', label: 'Lead' },
      { key: 'php_script', label: 'Script' },
      { key: 'run_time', label: 'Run Time' },
    ],
  },
  reportThreewayPressLog: {
    title: '3-Way Press Log',
    description: '3-way call press events with results.',
    endpoint: '/reports/threeway-press-log',
    filter: { param: 'user', label: 'User' },
    entriesKey: 'entries',
    summaries: [{
      key: 'summary',
      title: 'Result Summary',
      columns: [
        { key: 'result', label: 'Result', render: (row) => row.result || 'NONE' },
        { key: 'events', label: 'Events', render: (row) => formatNumber(row.events) },
      ],
    }],
    columns: [
      { key: 'call_date', label: 'Date', render: (row) => formatDateTime(row.call_date) },
      { key: 'user', label: 'User' },
      { key: 'lead_id', label: 'Lead' },
      { key: 'phone_number', label: 'Phone' },
      { key: 'dialstring', label: 'Dialstring' },
      { key: 'outbound_cid', label: 'CID' },
      { key: 'result', label: 'Result' },
      { key: 'call_transfer', label: 'Transfer' },
    ],
  },
  reportWebserverUrl: {
    title: 'Webserver URL Report',
    description: 'Agent login URLs and API URLs used, counted per webserver.',
    endpoint: '/reports/webserver-url',
    entriesKey: null,
    summaries: [
      {
        key: 'loginUrls',
        title: 'Agent Login URLs',
        columns: [
          { key: 'webserver', label: 'Webserver' },
          { key: 'login_url', label: 'Login URL' },
          { key: 'hits', label: 'Logins', render: (row) => formatNumber(row.hits) },
        ],
      },
      {
        key: 'apiUrls',
        title: 'API URLs',
        columns: [
          { key: 'webserver', label: 'Webserver' },
          { key: 'api_url', label: 'API URL' },
          { key: 'hits', label: 'Calls', render: (row) => formatNumber(row.hits) },
        ],
      },
    ],
    columns: [],
  },
  reportUrlLog: {
    title: 'URL Log',
    description: 'Outbound webhook/URL posts made per call.',
    endpoint: '/reports/url-log',
    filter: { param: 'url_type', label: 'URL Type' },
    entriesKey: 'entries',
    summaries: [{
      key: 'summary',
      title: 'URL Type Summary',
      columns: [
        { key: 'url_type', label: 'Type' },
        { key: 'hits', label: 'Hits', render: (row) => formatNumber(row.hits) },
        { key: 'avg_response', label: 'Avg Response', render: (row) => `${Number(row.avg_response || 0).toFixed(3)}s` },
      ],
    }],
    columns: [
      { key: 'url_date', label: 'Date', render: (row) => formatDateTime(row.url_date) },
      { key: 'url_type', label: 'Type' },
      { key: 'uniqueid', label: 'Unique ID' },
      { key: 'response_sec', label: 'Response Sec' },
      { key: 'url', label: 'URL' },
      { key: 'url_response', label: 'Response' },
    ],
  },
  reportApiLog: {
    title: 'API Log',
    description: 'API calls made against this system.',
    endpoint: '/reports/api-log',
    filter: { param: 'function', label: 'Function' },
    entriesKey: 'entries',
    summaries: [{
      key: 'summary',
      title: 'Function / Result Summary',
      columns: [
        { key: 'api_function', label: 'Function' },
        { key: 'result', label: 'Result' },
        { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
      ],
    }],
    columns: [
      { key: 'api_date', label: 'Date', render: (row) => formatDateTime(row.api_date) },
      { key: 'user', label: 'User' },
      { key: 'api_function', label: 'Function' },
      { key: 'value', label: 'Value' },
      { key: 'result', label: 'Result' },
      { key: 'result_reason', label: 'Reason' },
      { key: 'source', label: 'Source' },
      { key: 'run_time', label: 'Run Time' },
    ],
  },
};

// Native AST_server_performance.php: per-server load/CPU aggregates + series.
function ServerPerformanceReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [serverIp, setServerIp] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (server, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (server) params.set('server_ip', server);
      const payload = await apiFetch(`/reports/server-performance?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('', today, today);
  }, [load, today]);

  const s = data?.sections;
  const num = (value, digits = 2) => Number(value || 0).toFixed(digits);

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">System</p>
          <h2>Server Performance</h2>
          <p className="action-copy">Load, CPU, channels and client stats logged per server.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Server and Dates" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(serverIp, beginDate, endDate);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              <span>Server</span>
              <select value={serverIp} onChange={(event) => setServerIp(event.target.value)}>
                <option value="">Select a server</option>
                {(data?.servers || []).map((row) => (
                  <option key={row.server_ip} value={row.server_ip}>{row.server_ip} - {row.server_description || ''}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <>
          <Panel eyebrow="Summary" title={`Server ${s.serverIp}`} icon={Activity} className="admin-wide-panel">
            <div className="connection-actions">
              <span className="connection-status">Avg load: {num(s.summary.avg_load)}</span>
              <span className="connection-status">Max load: {num(s.summary.max_load)}</span>
              <span className="connection-status">Avg channels: {num(s.summary.avg_channels, 1)}</span>
              <span className="connection-status">Max channels: {formatNumber(s.summary.max_channels || 0)}</span>
              <span className="connection-status">Max processes: {formatNumber(s.summary.max_processes || 0)}</span>
              <span className="connection-status">CPU user/system/idle: {num(s.summary.avg_cpu_user, 1)}% / {num(s.summary.avg_cpu_system, 1)}% / {num(s.summary.avg_cpu_idle, 1)}%</span>
              <span className="connection-status">Avg clients: {num(s.summary.avg_clients, 1)} (max {formatNumber(s.summary.max_clients || 0)})</span>
            </div>
          </Panel>
          <Panel eyebrow="Series" title={`Samples (${formatNumber(s.series.length)} rows${s.series.length === 1000 ? ', capped' : ''})`} icon={Database} className="admin-wide-panel">
            <DataTable
              emptyLabel="No performance samples in the date range"
              rows={s.series.map((row, index) => ({ ...row, id: `${row.start_time}-${index}` }))}
              columns={[
                { key: 'start_time', label: 'Time', render: (row) => formatDateTime(row.start_time) },
                { key: 'sysload', label: 'Load' },
                { key: 'channels_total', label: 'Channels' },
                { key: 'trunks_total', label: 'Trunks' },
                { key: 'clients_total', label: 'Clients' },
                { key: 'live_recordings', label: 'Recordings' },
                { key: 'cpu_user_percent', label: 'CPU U%' },
                { key: 'cpu_system_percent', label: 'CPU S%' },
                { key: 'cpu_idle_percent', label: 'CPU I%' },
                { key: 'freeram', label: 'Free RAM' },
              ]}
            />
          </Panel>
        </>
      )}
    </>
  );
}

// Native phone_stats.php: call_log stats for one phone extension.
function PhoneStatsReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [phoneKey, setPhoneKey] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (key, begin, end) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end });
      if (key) {
        const [extension, serverIp] = key.split('__');
        params.set('extension', extension);
        params.set('server_ip', serverIp);
      }
      const payload = await apiFetch(`/reports/phone-stats?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('', today, today);
  }, [load, today]);

  const s = data?.sections;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">System</p>
          <h2>Phone Stats</h2>
          <p className="action-copy">Call counts and time per channel group for one phone.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Phone and Dates" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(phoneKey, beginDate, endDate);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              <span>Phone</span>
              <select value={phoneKey} onChange={(event) => setPhoneKey(event.target.value)}>
                <option value="">Select a phone</option>
                {(data?.phones || []).map((row) => (
                  <option key={`${row.extension}__${row.server_ip}`} value={`${row.extension}__${row.server_ip}`}>
                    {row.extension} @ {row.server_ip} {row.fullname ? `- ${row.fullname}` : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {s && (
        <Panel eyebrow={`Phone ${s.extension}`} title={`Call Stats (${formatNumber(s.totals.calls)} calls, ${formatSeconds(s.totals.seconds)})`} icon={PhoneCall} className="admin-wide-panel">
          <DataTable
            emptyLabel="No calls for this phone in the date range"
            rows={(s.byGroup || []).map((row) => ({ ...row, id: row.channel_group || 'NONE' }))}
            columns={[
              { key: 'channel_group', label: 'Channel Group', render: (row) => row.channel_group || '(none)' },
              { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
              { key: 'seconds', label: 'Time', render: (row) => formatSeconds(row.seconds) },
              { key: 'avg', label: 'Avg', render: (row) => `${row.calls ? Math.round(row.seconds / row.calls) : 0}s` },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

// Native process_report.php: keepalive process run history per serial_id.
function ProcessReportView({ token, onLogout }) {
  const [serialId, setSerialId] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (serial) => {
    setLoading(true);
    setError('');
    try {
      const query = serial ? `?serial_id=${encodeURIComponent(serial)}` : '';
      const payload = await apiFetch(`/reports/process-report${query}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load('');
  }, [load]);

  const s = data?.sections;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">System</p>
          <h2>Process Report</h2>
          <p className="action-copy">Background process run history.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Process Serial" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(serialId);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Serial ID</span>
              <select value={serialId} onChange={(event) => setSerialId(event.target.value)}>
                <option value="">Select a process serial</option>
                {(data?.serials || []).map((item) => (
                  <option key={item} value={item}>{item}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
        {!((data?.serials || []).length) && <p className="connection-summary">No process log entries recorded yet.</p>}
      </Panel>
      {s && (
        <Panel eyebrow={`Serial ${s.serialId}`} title={`Runs (${formatNumber(s.stats.runs || 0)}, total ${formatSeconds(s.stats.total_sec || 0)})`} icon={Activity} className="admin-wide-panel">
          <DataTable
            emptyLabel="No runs for this serial"
            rows={(s.entries || []).map((row, index) => ({ ...row, id: `${row.run_time}-${index}` }))}
            columns={[
              { key: 'run_time', label: 'Run Time', render: (row) => formatDateTime(row.run_time) },
              { key: 'run_sec', label: 'Seconds' },
              { key: 'server_ip', label: 'Server' },
              { key: 'script', label: 'Script' },
              { key: 'process', label: 'Process' },
              { key: 'output_lines', label: 'Output Lines' },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

// Native sph_report.php: sales per hour from vicidial_agent_sph.
function SphReportView({ token, onLogout }) {
  const today = localDateStr();
  const [beginDate, setBeginDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [shift, setShift] = useState('ALL');
  const [selected, setSelected] = useState([]);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (campaignIds, begin, end, shiftValue) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ begin_date: begin, end_date: end, shift: shiftValue });
      if (campaignIds.length) params.set('campaigns', campaignIds.join(','));
      const payload = await apiFetch(`/reports/sph?${params.toString()}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load([], today, today, 'ALL');
  }, [load, today]);

  const entries = data?.entries;

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">System</p>
          <h2>SPH Report</h2>
          <p className="action-copy">Sales-per-hour stats from the nightly agent SPH rollup.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="Campaigns, Dates and Shift" icon={Search} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => {
            event.preventDefault();
            load(selected, beginDate, endDate, shift);
          }}
        >
          <div className="field-grid">
            <label>
              <span>Begin Date</span>
              <input type="date" value={beginDate} onChange={(event) => setBeginDate(event.target.value)} />
            </label>
            <label>
              <span>End Date</span>
              <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </label>
            <label>
              <span>Shift</span>
              <select value={shift} onChange={(event) => setShift(event.target.value)}>
                <option value="ALL">ALL</option>
                <option value="AM">AM</option>
                <option value="PM">PM</option>
              </select>
            </label>
          </div>
          <CampaignTogglePicker campaigns={data?.campaigns || []} selected={selected} onChange={setSelected} />
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={loading}>
              <Search size={16} aria-hidden="true" />
              {loading ? 'Loading' : 'Run Report'}
            </button>
          </div>
        </form>
        {error && <p className="form-error">{error}</p>}
      </Panel>
      {entries && (
        <Panel eyebrow="SPH" title={`Agent Sales per Hour (${formatNumber(entries.length)} rows)`} icon={Users} className="admin-wide-panel">
          <DataTable
            emptyLabel="No SPH rollup rows for the selection (the nightly SPH process may not have run)"
            rows={entries.map((row, index) => ({ ...row, id: `${row.user}-${row.campaign_group_id}-${index}` }))}
            columns={[
              { key: 'user', label: 'User' },
              { key: 'full_name', label: 'Name' },
              { key: 'role', label: 'Role' },
              { key: 'campaign_group_id', label: 'Campaign/Group' },
              { key: 'login_sec', label: 'Login', render: (row) => formatSeconds(row.login_sec) },
              { key: 'calls', label: 'Calls', render: (row) => formatNumber(row.calls) },
              { key: 'sales', label: 'Sales', render: (row) => formatNumber(row.sales) },
              { key: 'sph', label: 'SPH', render: (row) => Number(row.sph || 0).toFixed(2) },
            ]}
          />
        </Panel>
      )}
    </>
  );
}

// Native admin.php ADD=999992/999993: maximum system stats.
const MAX_STATS_COLUMNS = [
  { key: 'stats_date', label: 'Date', render: (row) => String(row.stats_date || '').slice(0, 10) },
  { key: 'stats_type', label: 'Type' },
  { key: 'campaign_id', label: 'Campaign/Group' },
  { key: 'max_channels', label: 'Max Channels' },
  { key: 'max_calls', label: 'Max Calls' },
  { key: 'max_inbound', label: 'Max Inbound' },
  { key: 'max_outbound', label: 'Max Outbound' },
  { key: 'max_agents', label: 'Max Agents' },
  { key: 'max_remote_agents', label: 'Max Remote' },
  { key: 'total_calls', label: 'Total Calls', render: (row) => formatNumber(row.total_calls) },
];

function MaxStatsReportView({ token, onLogout }) {
  const today = localDateStr();
  const monthAgo = localDateStr(new Date(Date.now() - 29 * 86400000));
  const [beginDate, setBeginDate] = useState(monthAgo);
  const [endDate, setEndDate] = useState(today);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (begin, end) => {
    setLoading(true);
    setError('');
    try {
      const payload = await apiFetch(`/reports/max-stats?begin_date=${begin}&end_date=${end}`, token);
      setData(payload);
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout?.();
        return;
      }
      setError(requestError.status === 403 ? 'Your user is not allowed to view reports' : 'The report failed to load');
    } finally {
      setLoading(false);
    }
  }, [token, onLogout]);

  useEffect(() => {
    load(monthAgo, today);
  }, [load, monthAgo, today]);

  return (
    <>
      <section className="report-hero">
        <div>
          <p className="eyebrow">System</p>
          <h2>Maximum System Stats</h2>
          <p className="action-copy">Peak channels, calls and agents for the current period and closed history.</p>
        </div>
      </section>
      <Panel eyebrow="Filters" title="History Range" icon={Search} className="admin-wide-panel">
        <ReportFilterBar
          beginDate={beginDate}
          endDate={endDate}
          onBeginDate={setBeginDate}
          onEndDate={setEndDate}
          loading={loading}
          onSubmit={(event) => {
            event.preventDefault();
            load(beginDate, endDate);
          }}
        />
        {error && <p className="form-error">{error}</p>}
      </Panel>
      <Panel eyebrow="Current" title="Open Period" icon={Activity} className="admin-wide-panel">
        <DataTable
          emptyLabel="No open max-stats rows"
          rows={(data?.open || []).map((row, index) => ({ ...row, id: `open-${index}` }))}
          columns={MAX_STATS_COLUMNS}
        />
      </Panel>
      <Panel eyebrow="History" title="Closed Periods" icon={Database} className="admin-wide-panel">
        <DataTable
          emptyLabel="No closed max-stats rows in the range"
          rows={(data?.history || []).map((row, index) => ({ ...row, id: `hist-${index}` }))}
          columns={MAX_STATS_COLUMNS}
        />
      </Panel>
    </>
  );
}

// ============================================================================
// Standalone agent app, served at <base>/agent — the genx equivalent of
// /agc/vicidial.php. Agents authenticate with phone + user credentials (legacy
// login form) and never see the admin console.
// ============================================================================
const AGENT_TOKEN_KEY = 'genx-agent-token';

function AgentLoginPage({ onAuthed }) {
  const [form, setForm] = useState({ phone_login: '', phone_pass: '', user: '', pass: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Phone fields stay hidden unless the user record has no phone_login set
  // (mirrors the legacy agc campaign-login form).
  const [needPhone, setNeedPhone] = useState(false);
  // Campaign chooser lives on the login form like legacy; the list comes from
  // /agent/auth which scopes to the user group's allowed campaigns.
  const [campaignId, setCampaignId] = useState('');
  const [campaigns, setCampaigns] = useState(null);
  const [needPunch, setNeedPunch] = useState(false);
  const authedRef = useRef(null);

  const setField = (key) => (event) => setForm((current) => ({ ...current, [key]: event.target.value }));

  const AUTH_ERRORS = {
    invalid_phone_credentials: 'Invalid phone login or password',
    invalid_user_credentials: 'Invalid user login or password',
    all_fields_required: 'User login and password are required',
    phone_login_required: 'No phone set on this user — enter phone credentials',
  };

  // Auth once per set of credentials; reused between Refresh and Submit.
  async function ensureAuth() {
    const key = JSON.stringify(form);
    if (authedRef.current?.key === key) return authedRef.current.payload;
    const payload = await apiFetch('/agent/auth', '', { method: 'POST', body: JSON.stringify(form) });
    authedRef.current = { key, payload };
    setCampaigns(payload.campaigns || []);
    return payload;
  }

  async function refreshCampaigns() {
    setBusy(true);
    setError('');
    try {
      await ensureAuth();
    } catch (requestError) {
      if (requestError.message === 'phone_login_required') setNeedPhone(true);
      setError(AUTH_ERRORS[requestError.message] || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const payload = await ensureAuth();
      window.localStorage.setItem(AGENT_TOKEN_KEY, payload.token);
      // Re-attach directly when a live session already exists.
      if (payload.live) {
        onAuthed({ ...payload, userPass: form.pass });
        return;
      }
      if (!campaignId) {
        setError('Please select a campaign');
        return;
      }
      const login = await apiFetch('/agent/login', payload.token, {
        method: 'POST',
        body: JSON.stringify({ campaign_id: campaignId }),
      });
      // userPass rides along in memory only — legacy merges it into script
      // iframe URLs (--A--pass--B--) for the life of the session.
      onAuthed({ ...payload, live: login.live, webphoneUrl: login.webphoneUrl, pauseCodes: login.pauseCodes, userPass: form.pass });
    } catch (requestError) {
      if (requestError.message === 'phone_login_required') setNeedPhone(true);
      if (requestError.message === 'timeclock_required') setNeedPunch(true);
      const map = {
        ...AUTH_ERRORS,
        already_logged_in: 'This user already has a live agent session',
        no_conference_available: 'No free conference on that phone server',
        campaign_not_allowed: 'Campaign not allowed for your user group',
        timeclock_required: 'Your user group requires a timeclock punch-in first',
      };
      setError(map[requestError.message] || 'Login failed');
    } finally {
      setBusy(false);
    }
  }

  // Forced timeclock: punch in with the already-authed token, then retry.
  async function punchIn() {
    setBusy(true);
    setError('');
    try {
      const payload = await ensureAuth();
      await apiFetch('/agent/timeclock', payload.token, { method: 'POST', body: JSON.stringify({ action: 'in' }) });
      setNeedPunch(false);
      setError('Punched in — press Submit to log in');
    } catch (requestError) {
      setError(requestError.message === 'already_punched_in' ? 'Already punched in — press Submit' : 'Timeclock punch failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel" aria-label="Agent login">
        <div className="brand-lock">
          <div className="brand-mark">GX</div>
          <div>
            <p className="eyebrow">GenX</p>
            <h1>Agent Login</h1>
          </div>
        </div>
        <form className="login-form" onSubmit={submit}>
          <label>
            <span>User Login</span>
            <input type="text" value={form.user} onChange={setField('user')} autoComplete="off" />
          </label>
          <label>
            <span>User Password</span>
            <input type="password" value={form.pass} onChange={setField('pass')} autoComplete="off" />
          </label>
          {needPhone && (
            <>
              <label>
                <span>Phone Login</span>
                <input type="text" value={form.phone_login} onChange={setField('phone_login')} autoComplete="off" />
              </label>
              <label>
                <span>Phone Password</span>
                <input type="password" value={form.phone_pass} onChange={setField('phone_pass')} autoComplete="off" />
              </label>
            </>
          )}
          <label>
            <span>Campaign</span>
            <select
              value={campaignId}
              onChange={(event) => setCampaignId(event.target.value)}
              onFocus={() => { if (campaigns === null && form.user && form.pass) refreshCampaigns(); }}
            >
              <option value="">-- PLEASE SELECT A CAMPAIGN --</option>
              {(campaigns || []).map((row) => (
                <option key={row.campaign_id} value={row.campaign_id}>
                  {row.campaign_id} - {row.campaign_name || ''}
                </option>
              ))}
            </select>
          </label>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={busy}>
              {busy ? 'Working...' : 'Submit'}
            </button>
            <button type="button" className="secondary-action" disabled={busy || !form.user || !form.pass} onClick={refreshCampaigns}>
              Refresh Campaign List
            </button>
            {needPunch && (
              <button type="button" className="secondary-action" disabled={busy} onClick={punchIn}>
                Punch In to Timeclock
              </button>
            )}
          </div>
        </form>
      </section>
    </main>
  );
}

// Campaign pick + live console (phase 1: status/ready/pause/pause codes/logout).
// WebAudio chimes for call/chat alerts — no audio assets needed.
function agentChime(kind) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    agentChime.ctx = agentChime.ctx || new Ctx();
    const ctx = agentChime.ctx;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    const seq = kind === 'call' ? [[880, 0, 0.16], [1174, 0.2, 0.22]] : [[659, 0, 0.12], [880, 0.14, 0.12]];
    seq.forEach(([freq, at, dur]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + dur);
      osc.start(ctx.currentTime + at);
      osc.stop(ctx.currentTime + at + dur + 0.05);
    });
  } catch { /* audio unavailable */ }
}

function AgentConsole({ token, authInfo, onExit }) {
  const [campaigns, setCampaigns] = useState(authInfo?.campaigns || []);
  const [campaignId, setCampaignId] = useState('');
  const [live, setLive] = useState(authInfo?.live || null);
  const [lead, setLead] = useState(null);
  const [pauseCodes, setPauseCodes] = useState(authInfo?.pauseCodes || []);
  const [dispoStatuses, setDispoStatuses] = useState([]);
  const [dispoPick, setDispoPick] = useState('');
  const [callbackTime, setCallbackTime] = useState('');
  const [dispoComments, setDispoComments] = useState('');
  const [manualNumber, setManualNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [webphoneUrl, setWebphoneUrl] = useState(authInfo?.webphoneUrl || null);
  const [showPhone, setShowPhone] = useState(false);
  const [dayStats, setDayStats] = useState(null);
  const [pauseModal, setPauseModal] = useState(false);
  const [dialModal, setDialModal] = useState(false);
  const [viewLeadId, setViewLeadId] = useState(null);
  const [chatInfo, setChatInfo] = useState(null);
  const [chatThread, setChatThread] = useState(null);
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatText, setChatText] = useState('');
  const [chatManagers, setChatManagers] = useState(null);
  const [chatTo, setChatTo] = useState('');
  const chatScrollRef = useRef(null);
  const [lastNote, setLastNote] = useState(null);
  const [soundOn, setSoundOn] = useState(() => window.localStorage.getItem('genx-agent-sound') !== '0');
  const prevStatusRef = useRef('');
  const prevUnreadRef = useRef(0);
  const launchFiredRef = useRef('');
  const [sidePanel, setSidePanel] = useState('');
  const [xferOptions, setXferOptions] = useState(null);
  const [callLog, setCallLog] = useState(null);
  const [callLogDate, setCallLogDate] = useState(() => localDateStr());
  const [leadInfo, setLeadInfo] = useState(null);
  const [vmExten, setVmExten] = useState('');
  const [ingroupOptions, setIngroupOptions] = useState(null);
  const [webForms, setWebForms] = useState(null);
  const [dispoHotkeys, setDispoHotkeys] = useState([]);
  const [inboundInfo, setInboundInfo] = useState(null);
  const [previewInfo, setPreviewInfo] = useState(null);
  const [dialableLeads, setDialableLeads] = useState(null);
  const [dialFail, setDialFail] = useState(null);
  const [customFields, setCustomFields] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [altPhones, setAltPhones] = useState(null);
  const [showAltPhones, setShowAltPhones] = useState(false);
  const [agentMuted, setAgentMuted] = useState(false);
  const [custMuted, setCustMuted] = useState(false);
  const [recMuted, setRecMuted] = useState(false);
  const threewayHungupRef = useRef(false);
  // Legacy screen chrome: MAIN/SCRIPT/FORM tabs, header clock, DTMF box.
  const [mainTab, setMainTab] = useState('main');
  const [dtmfDigits, setDtmfDigits] = useState('');
  const [xferOpen, setXferOpen] = useState(false);
  const [queueCalls, setQueueCalls] = useState(0);
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = window.setInterval(() => setClock(new Date()), 1000);
    return () => window.clearInterval(t);
  }, []);
  const [ingroupPicks, setIngroupPicks] = useState([]);
  const [ingroupBlended, setIngroupBlended] = useState(false);
  const [scriptData, setScriptData] = useState(null);
  const [editLead, setEditLead] = useState(null);
  const [customerGone, setCustomerGone] = useState(0);
  const [xferGroup, setXferGroup] = useState('');
  const [xferExten, setXferExten] = useState('');
  const [threewayNumber, setThreewayNumber] = useState('');
  const [threewayChannel, setThreewayChannel] = useState('');
  const [parked, setParked] = useState(false);
  const [agentsView, setAgentsView] = useState(null);
  const [queueView, setQueueView] = useState(null);
  const [callbacks, setCallbacks] = useState(null);
  // Legacy webphone_call_seconds: after the webphone iframe loads and
  // registers, ring it into the conference once (auto-answer picks up).
  const webphoneCalledRef = useRef(false);

  const callWebphone = useCallback(() => {
    apiFetch('/agent/webphone-call', token, { method: 'POST', body: '{}' }).catch(() => {});
  }, [token]);

  const refresh = useCallback(async () => {
    try {
      const payload = await apiFetch('/agent/status', token);
      setLive(payload.live);
      setLead(payload.lead || null);
      setLastNote(payload.lastNote || null);
      if (payload.externalAction) {
        setMessage(payload.externalAction === 'PAUSED_BY_MANAGER'
          ? 'A supervisor paused you'
          : 'A supervisor set you Available');
      }
      if (payload.pauseCodes) setPauseCodes(payload.pauseCodes);
      setWebphoneUrl((prev) => {
        if (!payload.live) return null;
        return payload.webphoneUrl && payload.webphoneUrl !== prev ? payload.webphoneUrl : prev;
      });
      // Dead-call detection: count consecutive polls with no customer leg.
      if (payload.live?.status === 'INCALL' && payload.customerChannels === 0) {
        setCustomerGone((n) => n + 1);
      } else {
        setCustomerGone(0);
      }
      setInboundInfo(payload.inbound || null);
      if (payload.dialableLeads !== undefined) setDialableLeads(payload.dialableLeads);
      setDialFail(payload.dialFail || null);
      if (!payload.live || !Number(payload.live.preview_lead_id)) setPreviewInfo(null);
      setIsRecording(Boolean(payload.recording));
      if (payload.queueCalls !== undefined) setQueueCalls(Number(payload.queueCalls || 0));
      if (!payload.live || payload.live.status !== 'INCALL') {
        setAgentMuted(false);
        setCustMuted(false);
        setRecMuted(false);
        threewayHungupRef.current = false;
      }
    } catch (requestError) {
      if (requestError.status === 401) onExit();
    }
  }, [token, onExit]);

  // Load the dispo grid + web forms once the agent is on (or has just had) a lead.
  useEffect(() => {
    if (!live || !Number(live.lead_id)) return;
    apiFetch('/agent/dispo-statuses', token)
      .then((payload) => {
        setDispoStatuses(payload.statuses || []);
        setDispoHotkeys(payload.hotkeys || []);
      })
      .catch(() => {});
    if (!webForms) apiFetch('/agent/web-forms', token).then(setWebForms).catch(() => {});
  }, [live && Number(live.lead_id) ? 1 : 0, token]);

  // Legacy merge fields (--A--field--B--) used by scripts and web forms.
  // escapeHtml is set when the result is rendered as HTML (script iframe):
  // lead fields are customer-supplied data, so markup in them must render as
  // text, not execute. URL consumers (web forms) get the raw values.
  const mergeFields = useCallback((text, { escapeHtml = false } = {}) => String(text || '').replace(/--A--(\w+)--B--/g, (m, field) => {
    const merge = {
      ...(lead || {}),
      user: authInfo?.user?.user || '',
      pass: authInfo?.userPass || '',
      phone_login: authInfo?.phone?.login || '',
      campaign: live?.campaign_id || '',
      group: inboundInfo?.group_id || live?.campaign_id || '',
      channel_group: inboundInfo?.group_id || live?.campaign_id || '',
      session_id: live?.conf_exten || '',
      server_ip: live?.server_ip || '',
      uniqueid: live?.uniqueid || '',
      fronter: '',
      closer: authInfo?.user?.user || '',
      SQLdate: localSqlNow(),
      epoch: String(Math.floor(Date.now() / 1000)),
      script_width: '100%',
      script_height: '400',
    };
    const value = merge[field] != null ? String(merge[field]) : '';
    return escapeHtml
      ? value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
      : value;
  }), [lead, live, authInfo, inboundInfo]);

  // Dispo hotkeys: with the dispo grid open, pressing a mapped key submits.
  useEffect(() => {
    if (!dispoHotkeys.length || !lead || live?.status === 'INCALL') return undefined;
    const onKey = (event) => {
      if (/input|textarea|select/i.test(event.target?.tagName || '')) return;
      const hit = dispoHotkeys.find((h) => String(h.hotkey) === event.key);
      if (!hit) return;
      event.preventDefault();
      // Same busy gate as the buttons (disabled={busy}): without it a quick
      // double-press fires two dispo POSTs for the same lead.
      if (busy) return;
      act('/agent/dispo', { status: hit.status, lead_id: lead.lead_id, comments: dispoComments }).then((payload) => {
        if (payload) {
          setLead(null);
          setDispoPick('');
          // Clear per-call note state exactly like the manual Save button —
          // a leftover comment must not attach to the NEXT call's dispo.
          setCallbackTime('');
          setDispoComments('');
          setMessage(`Dispositioned ${hit.status} (hotkey ${hit.hotkey}) — paused`);
        }
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dispoHotkeys, lead ? lead.lead_id : 0, live?.status, dispoComments, busy]);

  useEffect(() => {
    if (!live) return undefined;
    const timer = window.setInterval(refresh, 2000);
    return () => window.clearInterval(timer);
  }, [live ? 1 : 0, refresh]);

  const act = async (path, body) => {
    setBusy(true);
    setMessage('');
    try {
      const payload = await apiFetch(path, token, { method: 'POST', body: JSON.stringify(body || {}) });
      if (payload.live !== undefined) setLive(payload.live);
      if (payload.pauseCodes) setPauseCodes(payload.pauseCodes);
      if (!payload.live) {
        setWebphoneUrl(null);
        webphoneCalledRef.current = false;
      } else if (payload.webphoneUrl) setWebphoneUrl(payload.webphoneUrl);
      return payload;
    } catch (requestError) {
      if (requestError.status === 401) {
        onExit();
        return null;
      }
      const map = {
        already_logged_in: 'This user already has a live agent session',
        no_conference_available: 'No free conference on that phone server',
        campaign_not_allowed: 'Campaign not allowed for your user group',
        phone_not_found: 'Phone not found or inactive',
        customer_channel_not_found: 'No live customer channel found (call may have ended)',
        channel_not_found: '3-way leg not found (may have already hung up)',
        no_parked_call: 'No parked call to grab',
        not_on_call: 'No customer call in progress',
        hopper_empty: 'No leads in the hopper for this campaign',
        alt_number_missing: 'Lead has no usable alternate number',
        recording_disabled: 'Recording is disabled for this campaign',
        not_recording: 'No active recording found',
        no_preview_lead: 'No previewed lead to skip',
      };
      setMessage(map[requestError.message] || 'Action failed');
      return null;
    } finally {
      setBusy(false);
    }
  };

  // customer_3way_hangup detection: customer channel gone while the 3-way leg
  // is up — tag the user_call_log row once (legacy customer_3way_hangup_process).
  useEffect(() => {
    if (!threewayChannel || customerGone < 2 || threewayHungupRef.current) return;
    threewayHungupRef.current = true;
    apiFetch('/agent/threeway-customer-hungup', token, {
      method: 'POST',
      body: JSON.stringify({ seconds: live ? Math.max(0, Math.floor(Date.now() / 1000) - Number(live.state_epoch || 0)) : 0 }),
    }).then(() => setMessage('Customer left during the 3-way call (logged)')).catch(() => {});
  }, [threewayChannel, customerGone, token]);

  // Transfer options load once per call (user-group agent_xfer flags + groups).
  useEffect(() => {
    if (!live || live.status !== 'INCALL') {
      setThreewayChannel('');
      setParked(false);
    }
    if (!live || xferOptions) return;
    if (live.status !== 'INCALL' && !xferOpen) return;
    apiFetch('/agent/xfer-options', token)
      .then((p) => {
        setXferOptions(p);
        if (p.defaultGroup) setXferGroup(p.defaultGroup);
      })
      .catch(() => {});
  }, [live && live.status === 'INCALL' ? 1 : 0, xferOpen, token]);

  // One-shot loads for the in-groups chooser and script tab.
  useEffect(() => {
    if (!live || sidePanel !== 'ingroups') return;
    apiFetch('/agent/ingroup-options', token)
      .then((p) => {
        setIngroupOptions(p);
        setIngroupPicks(p.selected || []);
        setIngroupBlended(Boolean(p.blended));
      })
      .catch(() => {});
  }, [live ? 1 : 0, sidePanel === 'ingroups' ? 1 : 0, token]);

  useEffect(() => {
    if (!live || mainTab !== 'script' || scriptData) return;
    apiFetch('/agent/script', token).then(setScriptData).catch(() => {});
  }, [live ? 1 : 0, mainTab === 'script' ? 1 : 0, token]);

  // Script and transfer options are cached per campaign login. Drop them when
  // the agent logs out (live goes null) so re-logging into a different
  // campaign in the same console can't show the previous campaign's script
  // or offer its transfer in-groups.
  useEffect(() => {
    if (!live) {
      setScriptData(null);
      setXferOptions(null);
    }
  }, [live ? 1 : 0]);

  // FORM tab: load custom fields whenever the tab opens on a lead.
  useEffect(() => {
    if (!live || mainTab !== 'form' || !lead) return;
    apiFetch(`/agent/custom-fields?lead_id=${lead.lead_id}`, token).then(setCustomFields).catch(() => {});
  }, [live ? 1 : 0, mainTab === 'form' ? 1 : 0, lead ? lead.lead_id : 0, token]);

  // MAIN tab: the customer form is always visible and editable (legacy).
  useEffect(() => {
    if (!lead) { setEditLead(null); return; }
    setEditLead({
      title: lead.title || '', first_name: lead.first_name || '', middle_initial: lead.middle_initial || '',
      last_name: lead.last_name || '', address1: lead.address1 || '', address2: lead.address2 || '',
      address3: lead.address3 || '', city: lead.city || '', state: lead.state || '',
      postal_code: lead.postal_code || '', province: lead.province || '', vendor_lead_code: lead.vendor_lead_code || '',
      gender: lead.gender || 'U', phone_number: lead.phone_number || '', phone_code: lead.phone_code || '',
      alt_phone: lead.alt_phone || '', security_phrase: lead.security_phrase || '', email: lead.email || '',
      comments: lead.comments || '',
    });
  }, [lead ? lead.lead_id : 0]);

  // Side panels (legacy AGENTSview / CALLSINQUEUEview / CalLBacKLisT): poll
  // the open panel every 4s while the agent is logged in.
  useEffect(() => {
    if (!live || !sidePanel) return undefined;
    const paths = {
      agents: ['/agent/agents-view', setAgentsView],
      queue: ['/agent/calls-in-queue', setQueueView],
      callbacks: ['/agent/callbacks', setCallbacks],
      calllog: [`/agent/call-log?date=${callLogDate}`, setCallLog],
      leadinfo: [`/agent/lead-info${viewLeadId || lead ? `?lead_id=${viewLeadId || lead.lead_id}` : ''}`, setLeadInfo],
    };
    if (!paths[sidePanel]) return undefined;
    const [path, setter] = paths[sidePanel];
    let cancelled = false;
    const load = () => apiFetch(path, token).then((p) => { if (!cancelled) setter(p); }).catch(() => {});
    load();
    const timer = window.setInterval(load, 4000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [live ? 1 : 0, sidePanel, token, callLogDate, lead ? lead.lead_id : 0, viewLeadId]);

  // Dashboard data: day stats every 30s (re-pull after each dispo), plus a
  // callbacks snapshot for the "Callbacks Due" card while idle.
  useEffect(() => {
    if (!live) { setDayStats(null); return undefined; }
    const load = () => apiFetch('/agent/day-stats', token).then(setDayStats).catch(() => {});
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [live ? 1 : 0, lead ? lead.lead_id : 0, token]);

  useEffect(() => {
    if (!live || lead) return;
    apiFetch('/agent/callbacks', token).then(setCallbacks).catch(() => {});
  }, [live ? 1 : 0, lead ? 1 : 0, token]);

  // Team chat: poll threads (+ selected thread messages) while the dashboard
  // is visible; auto-select the most recent thread.
  useEffect(() => {
    if (!live || lead || sidePanel) return undefined;
    let cancelled = false;
    const load = () => {
      const query = chatThread ? `?chat_id=${chatThread.id}&subid=${chatThread.subid}` : '';
      apiFetch(`/agent/chat${query}`, token)
        .then((payload) => {
          if (cancelled) return;
          setChatInfo(payload);
          if (payload.messages) setChatMsgs(payload.messages);
          if (!chatThread && payload.threads?.length) {
            setChatThread({ id: payload.threads[0].manager_chat_id, subid: payload.threads[0].manager_chat_subid });
          }
        })
        .catch(() => {});
    };
    load();
    const timer = window.setInterval(load, 4000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [live ? 1 : 0, lead ? 1 : 0, sidePanel, chatThread ? `${chatThread.id}-${chatThread.subid}` : '', token]);

  useEffect(() => {
    if (!chatInfo?.enabled || chatManagers || chatInfo.threads?.length) return;
    apiFetch('/agent/chat-managers', token).then((p) => setChatManagers(p.managers || [])).catch(() => {});
  }, [chatInfo?.enabled ? 1 : 0, chatInfo?.threads?.length || 0, token]);

  useEffect(() => {
    const el = chatScrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMsgs.length]);

  const sendChat = async () => {
    const msg = chatText.trim();
    if (!msg) return;
    const body = chatThread
      ? { message: msg, manager_chat_id: chatThread.id, manager_chat_subid: chatThread.subid }
      : { message: msg, manager: chatTo };
    try {
      const payload = await apiFetch('/agent/chat', token, { method: 'POST', body: JSON.stringify(body) });
      setChatText('');
      if (payload.manager_chat_id && !chatThread) {
        setChatThread({ id: payload.manager_chat_id, subid: payload.manager_chat_subid || 1 });
      }
    } catch (requestError) {
      setMessage(requestError.message === 'replies_disabled' ? 'This chat does not allow replies' : 'Chat send failed');
    }
  };

  // Alerts: chime + desktop notification when a call connects or chat arrives.
  useEffect(() => {
    const status = live?.status || '';
    if (status === 'INCALL' && prevStatusRef.current !== 'INCALL') {
      if (soundOn) agentChime('call');
      if (document.hidden && window.Notification?.permission === 'granted') {
        try {
          new Notification('GenX Agent — call connected', {
            body: lead ? `${lead.first_name || ''} ${lead.last_name || ''} ${lead.phone_number || ''}`.trim() : 'Live call',
          });
        } catch { /* notifications unavailable */ }
      }
    }
    prevStatusRef.current = status;
  }, [live?.status]);

  useEffect(() => {
    const unread = (chatInfo?.threads || []).reduce((n, t) => n + Number(t.unread || 0), 0);
    if (unread > prevUnreadRef.current) {
      if (soundOn) agentChime('chat');
      if (document.hidden && window.Notification?.permission === 'granted') {
        try { new Notification('GenX Agent — new chat message'); } catch { /* ignore */ }
      }
    }
    prevUnreadRef.current = unread;
  }, [chatInfo]);

  // Browser tab title reflects call state / unread chat.
  useEffect(() => {
    const unread = (chatInfo?.threads || []).reduce((n, t) => n + Number(t.unread || 0), 0);
    document.title = live?.status === 'INCALL' ? '● ON CALL — GenX Agent' : unread > 0 ? `(${unread}) GenX Agent` : 'GenX Agent';
  }, [live?.status, chatInfo]);

  // Legacy get_call_launch: auto-open script/form/web form when a call
  // connects; PREVIEW_* variants fire when the preview lead attaches.
  useEffect(() => {
    if (!live || !lead) { launchFiredRef.current = ''; return; }
    const launch = campaigns.find((c) => c.campaign_id === live.campaign_id)?.get_call_launch || 'NONE';
    if (launch === 'NONE') return;
    const isPreviewLaunch = /^PREVIEW_/.test(launch);
    const inPreview = Number(live.preview_lead_id) > 0 && live.status !== 'INCALL';
    if (!(isPreviewLaunch ? inPreview : live.status === 'INCALL')) return;
    const base = launch.replace('PREVIEW_', '');
    const wantsWebform = /^WEBFORM/.test(base);
    if (wantsWebform && !webForms) return; // wait until web forms are loaded
    const key = `${lead.lead_id}-${isPreviewLaunch ? 'P' : 'C'}`;
    if (launchFiredRef.current === key) return;
    launchFiredRef.current = key;
    if (base === 'SCRIPT' || base === 'SCRIPTTWO') setMainTab('script');
    else if (base === 'FORM') setMainTab('form');
    else if (wantsWebform) {
      const wanted = base === 'WEBFORMTWO' ? 'Web Form 2' : base === 'WEBFORMTHREE' ? 'Web Form 3' : 'Web Form';
      const form = (webForms.forms || []).find((f) => f.label === wanted);
      if (form) window.open(mergeFields(form.url), webForms.target || '_blank');
    }
  }, [live?.status, lead ? lead.lead_id : 0, Number(live?.preview_lead_id || 0) > 0 ? 1 : 0, webForms ? 1 : 0]);

  // KNOWN LIMITATION: mixes client Date.now() with the server-written
  // state_epoch, so workstation clock skew shifts the call/pause timers (a
  // fast clock inflates them; the Math.max hides slow clocks). A proper fix
  // needs a server-time offset captured at login — until then treat these
  // timers as approximate.
  const stateSeconds = live ? Math.max(0, Math.floor(Date.now() / 1000) - Number(live.state_epoch || 0)) : 0;

  // Pause-code time limits (seconds): drive the countdown on the Paused badge.
  const pauseCodeRow = live && live.pause_code ? pauseCodes.find((r) => r.pause_code === live.pause_code) : null;
  const pauseLimit = Number(pauseCodeRow?.time_limit || 0);
  const pauseRemain = live && live.status === 'PAUSED' && pauseLimit > 0 ? pauseLimit - stateSeconds : null;

  // Campaign dial method drives which controls make sense: RATIO/ADAPT_* are
  // auto-dial (agent goes Available, dialer feeds calls); MANUAL/INBOUND_MAN
  // use Dial Next (legacy manual/preview dialing).
  const dialMethod = campaigns.find((c) => c.campaign_id === live?.campaign_id)?.dial_method || '';
  const autoDial = ['RATIO', 'ADAPT_AVERAGE', 'ADAPT_HARD_LIMIT', 'ADAPT_TAPERED'].includes(dialMethod);

  const dialNextLead = async () => {
    const payload = await act('/agent/dial-next', {});
    if (payload?.preview) {
      setPreviewInfo({ allowSkip: payload.allowSkip, prevStatus: payload.prevStatus });
      setMessage('Previewing lead — Dial or Skip');
    } else if (payload) setMessage('Dialing next lead');
  };

  const dialManualNumber = async () => {
    const digits = manualNumber.replace(/[^0-9]/g, '');
    const payload = await act('/agent/manual-dial', { phone_number: digits });
    if (payload) {
      setManualNumber('');
      setDialModal(false);
      setMessage(`Dialing ${digits}`);
    }
  };

  return (
    <main className="app-shell agent-shell">
      {/* Legacy agc top line: logged-in summary + LOGOUT */}
      {/* Agent status bar: identity + registered/status + session info + logout */}
      <header className={`agb-topbar state-${live ? (live.status === 'INCALL' ? 'incall' : live.status === 'READY' ? 'ready' : 'paused') : 'off'}`}>
        <div className="agn-id">
          <div className="agn-avatar">
            {(() => {
              const n = authInfo?.user?.fullName || authInfo?.user?.user || live?.user || 'A';
              const parts = String(n).trim().split(/\s+/);
              return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : String(n).slice(0, 2)).toUpperCase();
            })()}
          </div>
          <div>
            <h1>{authInfo?.user?.user || live?.user || 'Agent'}</h1>
            <p className="agn-sub">
              {live ? `Campaign ${live.campaign_id}${dialMethod ? ` (${dialMethod})` : ''} · Phone ${String(live.extension).split('/').pop()}` : 'GenX Agent Console'}
            </p>
          </div>
        </div>
        <div className="agb-status-group">
          <span className="agb-reg">
            <span className={live ? 'agb-dot on' : 'agb-dot'} /> {live ? 'Registered' : 'Off Session'}
          </span>
          {live && (
            <span
              className={`agb-badge ${live.status === 'INCALL' ? 'incall' : live.status === 'READY' ? 'ready' : `paused clickable${pauseRemain != null && pauseRemain < 0 ? ' over' : ''}`}`}
              title={live.status === 'PAUSED' ? 'Change pause reason' : undefined}
              onClick={live.status === 'PAUSED' ? () => setPauseModal(true) : undefined}
            >
              {live.status === 'INCALL'
                ? `On Call ${formatSeconds(stateSeconds)}`
                : live.status === 'READY'
                  ? 'Available'
                  : pauseRemain != null
                    ? `Paused · ${live.pause_code} · ${pauseRemain >= 0 ? `${formatSeconds(pauseRemain)} left` : `over by ${formatSeconds(-pauseRemain)}`}`
                    : `Paused${live.pause_code ? ` · ${live.pause_code}` : ''} ${formatSeconds(stateSeconds)}`}
            </span>
          )}
          {live && live.status !== 'INCALL' && (
            live.status === 'READY' ? (
              <button type="button" className="agb-act warn" disabled={busy} onClick={() => setPauseModal(true)}>
                <Pause size={14} aria-hidden="true" /> Pause
              </button>
            ) : (
              <button type="button" className="agb-act call" disabled={busy} onClick={() => act('/agent/ready')}>
                <Play size={14} aria-hidden="true" /> Go Available
              </button>
            )
          )}
          <span className="agb-session">
            {live ? `Session ${live.conf_exten} · ${clock.toLocaleTimeString()}` : clock.toLocaleTimeString()}
          </span>
          <button
            type="button"
            className="row-action"
            title={soundOn ? 'Mute alert sounds' : 'Enable alert sounds'}
            onClick={() => {
              const next = !soundOn;
              setSoundOn(next);
              window.localStorage.setItem('genx-agent-sound', next ? '1' : '0');
              if (next) {
                agentChime('chat');
                if (window.Notification && Notification.permission === 'default') {
                  Notification.requestPermission().catch(() => {});
                }
              }
              apiFetch('/agent/alert-control', token, { method: 'POST', body: JSON.stringify({ enabled: next }) }).catch(() => {});
            }}
          >
            {soundOn ? <Volume2 size={14} aria-hidden="true" /> : <VolumeX size={14} aria-hidden="true" />}
          </button>
          <button
            type="button"
            className="row-action"
            disabled={busy || live?.status === 'INCALL'}
            onClick={async () => {
              if (live) {
                const payload = await act('/agent/logout');
                if (payload) onExit();
              } else onExit();
            }}
          >
            <LogOut size={14} aria-hidden="true" /> Logout
          </button>
        </div>
      </header>
      {/* Call action bar: only shown when there are call controls to use */}
      {live && (live.status === 'INCALL' || (Number(live.preview_lead_id) > 0 && lead)) && (
        <div className="agb-callbar">
          <div className="agb-chips">
            {live.status === 'INCALL' && (
              <span className="agb-state incall">Live call — {formatSeconds(stateSeconds)}</span>
            )}
            {isRecording && <span className="agb-chip rec">● REC</span>}
          </div>
          {Number(live.preview_lead_id) > 0 && live.status !== 'INCALL' && lead && (
            <>
              <button type="button" className="agb-act call" disabled={busy} onClick={async () => { const p = await act('/agent/manual-dial', { lead_id: lead.lead_id }); if (p) { setPreviewInfo(null); setMessage('Dialing previewed lead'); } }}>
                Dial Lead
              </button>
              {(previewInfo?.allowSkip ?? true) && (
                <button type="button" className="agb-act" disabled={busy} onClick={async () => { const p = await act('/agent/preview-skip', { prev_status: previewInfo?.prevStatus || 'NEW' }); if (p) { setPreviewInfo(null); setLead(null); setMessage('Lead skipped'); } }}>
                  Skip
                </button>
              )}
            </>
          )}
          {live.status === 'INCALL' && (
            <>
              <button type="button" className="agb-act hangup" disabled={busy} onClick={() => act('/agent/hangup')}>
                <PhoneOff size={15} aria-hidden="true" /> Hangup
              </button>
              <button type="button" className={parked ? 'agb-act warn' : 'agb-act'} disabled={busy} onClick={async () => { const p = await act('/agent/park', { grab: parked }); if (p) setParked(!parked); }}>
                {parked ? <Play size={15} aria-hidden="true" /> : <Pause size={15} aria-hidden="true" />} {parked ? 'Unpark' : 'Hold'}
              </button>
              <button type="button" className={xferOpen ? 'agb-act xfer on' : 'agb-act xfer'} onClick={() => setXferOpen((v) => !v)}>
                <ArrowRightLeft size={15} aria-hidden="true" /> Transfer
              </button>
              <button type="button" className={agentMuted ? 'agb-act warn' : 'agb-act'} disabled={busy} onClick={async () => { const p = await act('/agent/conf-control', { action: agentMuted ? 'unmute' : 'mute', target: 'agent' }); if (p) setAgentMuted(!agentMuted); }}>
                {agentMuted ? <MicOff size={15} aria-hidden="true" /> : <Mic size={15} aria-hidden="true" />} {agentMuted ? 'Unmute' : 'Mute'}
              </button>
              <button type="button" className={isRecording ? 'agb-act warn' : 'agb-act'} disabled={busy} onClick={async () => { const p = await act('/agent/recording', { action: isRecording ? 'stop' : 'start' }); if (p) setMessage(isRecording ? 'Recording stopped' : 'Recording started'); }}>
                <CircleDot size={15} aria-hidden="true" /> {isRecording ? 'Stop Rec' : 'Record'}
              </button>
              <span className="agb-dtmf">
                <input
                  type="text"
                  placeholder="DTMF"
                  value={dtmfDigits}
                  maxLength={20}
                  onChange={(event) => setDtmfDigits(event.target.value.replace(/[^0-9*#]/g, ''))}
                />
                <button type="button" className="agb-act" disabled={busy || !dtmfDigits} onClick={async () => { const p = await act('/agent/send-dtmf', { digits: dtmfDigits }); if (p) setDtmfDigits(''); }}>
                  <Hash size={14} aria-hidden="true" /> Send
                </button>
              </span>
            </>
          )}
        </div>
      )}
      {message && <p className="agn-msg">{message}</p>}
      <div className="agent-layout">
      {live && (
        <nav className="agn-rail" aria-label="Agent panels">
          {[
            ['', 'Home', LayoutDashboard, 0],
            ['agents', 'Agents', Users, 0],
            ['queue', 'Queue', PhoneCall, queueCalls],
            ['callbacks', 'Callbacks', Clock3, callbacks ? callbacks.liveCount : 0],
            ['calllog', 'Call Log', History, 0],
          ].map(([key, label, Icon, badge]) => (
            <button
              type="button"
              key={label}
              className={(sidePanel || '') === key ? 'agn-rail-btn active' : 'agn-rail-btn'}
              onClick={() => {
                if (key === '') setViewLeadId(null);
                setSidePanel(key === '' ? '' : (sidePanel === key ? '' : key));
              }}
            >
              <Icon size={18} aria-hidden="true" />
              <span>{label}</span>
              {Number(badge) > 0 && <em className="agn-rail-badge">{badge}</em>}
            </button>
          ))}
          <span className="agn-rail-sep" aria-hidden="true" />
          {!autoDial && live.status !== 'INCALL' && !Number(live.lead_id) && (
            <button type="button" className="agn-rail-btn dial" disabled={busy} onClick={dialNextLead}>
              <PhoneForwarded size={18} aria-hidden="true" />
              <span>Dial Next</span>
            </button>
          )}
          <button type="button" className="agn-rail-btn dial" disabled={busy} onClick={() => setDialModal(true)}>
            <Phone size={18} aria-hidden="true" />
            <span>Manual Dial</span>
          </button>
        </nav>
      )}
      <div className="agent-body">
        {!live && (
          <div className="agn-hero">
            <div className="agn-hero-icon"><Headphones size={30} aria-hidden="true" /></div>
            <h2>Ready to take calls?</h2>
            <p className="agn-sub">Pick your campaign to join the floor.</p>
            <form
              className="agn-hero-form"
              onSubmit={async (event) => {
                event.preventDefault();
                if (window.Notification && Notification.permission === 'default') {
                  Notification.requestPermission().catch(() => {});
                }
                const payload = await act('/agent/login', { campaign_id: campaignId });
                if (payload) {
                  setMessage(payload.webphoneUrl
                    ? 'Logged in — webphone loading, allow microphone access'
                    : 'Logged in — your phone should be ringing');
                }
              }}
            >
              <select value={campaignId} onChange={(event) => setCampaignId(event.target.value)}>
                <option value="">Select a campaign</option>
                {campaigns.map((row) => (
                  <option key={row.campaign_id} value={row.campaign_id}>{row.campaign_id} - {row.campaign_name || ''} ({row.dial_method})</option>
                ))}
              </select>
              <button type="submit" className="primary-action" disabled={busy || !campaignId}>
                <Headphones size={16} aria-hidden="true" />
                {busy ? 'Logging in' : 'Login to Campaign'}
              </button>
            </form>
          </div>
        )}
        {live && !lead && !sidePanel && (
          <div className="agn-dash">
            <div className="agn-greet">
              <h2>
                {clock.getHours() < 12 ? 'Good morning' : clock.getHours() < 18 ? 'Good afternoon' : 'Good evening'},{' '}
                {authInfo?.user?.fullName || live.user}
              </h2>
            </div>
            <div className="agn-tiles">
              {[
                ['Calls Today', formatNumber(dayStats?.calls ?? live.calls_today), PhoneCall, 'c1'],
                ['Sales Today', formatNumber(dayStats?.sales || 0), TrendingUp, 'c7'],
                ['Talk Time', formatSeconds(dayStats?.talkSec || 0), Timer, 'c2'],
                ['Wait Time', formatSeconds(dayStats?.waitSec || 0), Clock3, 'c3'],
                ['Pause Time', formatSeconds(dayStats?.pauseSec || 0), Pause, 'c4'],
                ['Dialable Leads', dialableLeads != null ? formatNumber(dialableLeads) : '—', Database, 'c5'],
                ['Calls in Queue', formatNumber(queueCalls), Users, 'c6'],
              ].map(([label, value, Icon, tone]) => (
                <div key={label} className={`agn-tile ${tone}`}>
                  <span className="agn-tile-ico"><Icon size={18} aria-hidden="true" /></span>
                  <strong>{value}</strong>
                  <span className="agn-tile-label">{label}</span>
                </div>
              ))}
            </div>
            <div className="agn-duo">
              <div className="agn-card agn-chat">
                <p className="agr-title">
                  <MessageSquare size={14} aria-hidden="true" /> Team Chat
                  {Boolean(chatInfo?.threads?.reduce((n, t) => n + Number(t.unread || 0), 0)) && (
                    <em className="agn-rail-badge agn-chat-unread">
                      {chatInfo.threads.reduce((n, t) => n + Number(t.unread || 0), 0)}
                    </em>
                  )}
                </p>
                {chatInfo && !chatInfo.enabled && (
                  <p className="agn-dim">Chat is disabled in system settings.</p>
                )}
                {chatInfo?.enabled && (
                  <>
                    {Boolean(chatInfo.threads?.length) && (
                      <div className="agn-chat-threads">
                        {chatInfo.threads.map((t) => (
                          <button
                            type="button"
                            key={`${t.manager_chat_id}-${t.manager_chat_subid}`}
                            className={chatThread && chatThread.id === t.manager_chat_id && chatThread.subid === t.manager_chat_subid ? 'agn-chip link on' : 'agn-chip link'}
                            onClick={() => setChatThread({ id: t.manager_chat_id, subid: t.manager_chat_subid })}
                          >
                            {t.manager_name || t.manager || `Chat #${t.manager_chat_id}`}
                            {Number(t.unread) > 0 && <em className="agn-rail-badge agn-chat-unread">{t.unread}</em>}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="agn-chat-msgs" ref={chatScrollRef}>
                      {chatMsgs.map((m, i) => (
                        <div key={i} className={m.message_posted_by === (authInfo?.user?.user || live.user) ? 'agn-bubble own' : 'agn-bubble'}>
                          <span className="agn-bubble-meta">{m.posted_name || m.message_posted_by} · {formatDateTime(m.message_date)}</span>
                          {m.message}
                        </div>
                      ))}
                      {!chatMsgs.length && (
                        <p className="agn-dim">
                          {chatInfo.threads?.length ? 'No messages yet.' : 'No chats yet — message a manager below.'}
                        </p>
                      )}
                    </div>
                    <div className="agn-chat-input">
                      {!chatThread && (
                        <select value={chatTo} onChange={(event) => setChatTo(event.target.value)}>
                          <option value="">To manager…</option>
                          {(chatManagers || []).map((m) => (
                            <option key={m.user} value={m.user}>{m.full_name || m.user}</option>
                          ))}
                        </select>
                      )}
                      <input
                        type="text"
                        placeholder="Type a message…"
                        value={chatText}
                        maxLength={2000}
                        onChange={(event) => setChatText(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') sendChat(); }}
                      />
                      <button
                        type="button"
                        className="agb-act xfer"
                        disabled={busy || !chatText.trim() || (!chatThread && !chatTo)}
                        onClick={sendChat}
                      >
                        Send
                      </button>
                    </div>
                  </>
                )}
              </div>
              <div className="agn-card">
                <p className="agr-title"><Clock3 size={14} aria-hidden="true" /> Callbacks Due</p>
                {(callbacks?.callbacks || []).filter((c) => c.status === 'LIVE').slice(0, 5).map((c) => (
                  <div key={c.callback_id} className="agn-row agn-row3">
                    <span>{`${c.first_name || ''} ${c.last_name || ''}`.trim() || `Lead ${c.lead_id}`}</span>
                    <span className="agn-dim">{formatDateTime(c.callback_time)}</span>
                    <button
                      type="button"
                      className="row-action"
                      disabled={busy}
                      onClick={async () => {
                        const p = await act('/agent/manual-dial', { lead_id: c.lead_id, callback_id: c.callback_id });
                        if (p) setMessage(`Dialing callback lead ${c.lead_id}`);
                      }}
                    >
                      Dial
                    </button>
                  </div>
                ))}
                {!(callbacks?.callbacks || []).some((c) => c.status === 'LIVE') && (
                  <p className="agn-dim">No callbacks due — you're all caught up.</p>
                )}
              </div>
              <div className="agn-card">
                <p className="agr-title"><Activity size={14} aria-hidden="true" /> Recent Activity</p>
                {(dayStats?.recent || []).map((r, i) => (
                  <button
                    type="button"
                    key={i}
                    className="agn-row agn-row3 agn-rowlink"
                    title="Open this lead"
                    onClick={() => { setViewLeadId(r.lead_id); setSidePanel('leadinfo'); }}
                  >
                    <span>{`${r.first_name || ''} ${r.last_name || ''}`.trim() || `Lead ${r.lead_id}`}</span>
                    <span className="agn-pill">{r.status || 'LIVE'}</span>
                    <span className="agn-dim">{formatSeconds(Number(r.talk_sec || 0))} · {formatDateTime(r.event_time)}</span>
                  </button>
                ))}
                {!(dayStats?.recent || []).length && (
                  <p className="agn-dim">No calls yet today — hit Dial Next to get rolling.</p>
                )}
              </div>
            </div>
          </div>
        )}
        {live && sidePanel === 'agents' && (
          <Panel eyebrow="Live" title="Agents View" icon={Users} className="admin-wide-panel">
            {agentsView && !agentsView.enabled && <p className="connection-summary">Agent status view not enabled for your user group</p>}
            {agentsView?.enabled && (
              <table className="data-table">
                <thead><tr><th>Agent</th><th>Status</th><th>Campaign</th><th>Time</th></tr></thead>
                <tbody>
                  {(agentsView.agents || []).map((a) => (
                    <tr key={a.user}>
                      <td>{a.user} {a.full_name}</td>
                      <td>{a.status}</td>
                      <td>{a.campaign_id}</td>
                      <td>{formatSeconds(Math.max(0, Math.floor(Date.now() / 1000) - Number(a.state_epoch || 0)))}</td>
                    </tr>
                  ))}
                  {!(agentsView.agents || []).length && <tr><td colSpan={4}>No agents logged in</td></tr>}
                </tbody>
              </table>
            )}
          </Panel>
        )}
        {live && sidePanel === 'queue' && (
          <Panel eyebrow="Live" title="Calls in Queue" icon={PhoneCall} className="admin-wide-panel">
            {queueView && !queueView.enabled && <p className="connection-summary">Calls-in-queue view disabled for this campaign</p>}
            {queueView?.enabled && (
              <table className="data-table">
                <thead><tr><th>Group</th><th>Phone</th><th>Type</th><th>Waiting</th><th /></tr></thead>
                <tbody>
                  {(queueView.calls || []).map((c) => (
                    <tr key={c.auto_call_id}>
                      <td>{c.campaign_id}</td>
                      <td>{c.phone_number}</td>
                      <td>{c.call_type}</td>
                      <td>{formatSeconds(Math.max(0, Math.floor(Date.now() / 1000) - Number(c.call_epoch || 0)))}</td>
                      <td>
                        <button
                          type="button"
                          className="row-action"
                          disabled={busy}
                          onClick={async () => {
                            const payload = await act('/agent/queue-grab', { auto_call_id: c.auto_call_id });
                            if (payload) setMessage(`Grabbed queued call ${c.auto_call_id}`);
                          }}
                        >
                          Grab
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!(queueView.calls || []).length && <tr><td colSpan={5}>No calls waiting</td></tr>}
                </tbody>
              </table>
            )}
          </Panel>
        )}
        {live && sidePanel === 'callbacks' && (
          <Panel eyebrow="Scheduled" title={`My Callbacks${callbacks ? ` — ${callbacks.liveCount} due` : ''}`} icon={Clock3} className="admin-wide-panel">
            <table className="data-table">
              <thead><tr><th>Callback Time</th><th>Name</th><th>Phone</th><th>Status</th><th>For</th><th>Comments</th><th /></tr></thead>
              <tbody>
                {(callbacks?.callbacks || []).map((c) => (
                  <tr key={c.callback_id}>
                    <td>{formatDateTime(c.callback_time)}</td>
                    <td>{c.first_name} {c.last_name}</td>
                    <td>{c.phone_number}</td>
                    <td>{c.status}</td>
                    <td>{c.recipient === 'ANYONE' ? 'Anyone' : 'Me'}</td>
                    <td>{c.comments}</td>
                    <td>
                      {live.status !== 'INCALL' && !Number(live.lead_id) && (
                        <button
                          type="button"
                          className="row-action"
                          disabled={busy}
                          onClick={async () => {
                            const payload = await act('/agent/manual-dial', { lead_id: c.lead_id, callback_id: c.callback_id });
                            if (payload) setMessage(`Dialing callback lead ${c.lead_id}`);
                          }}
                        >
                          Dial
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {!(callbacks?.callbacks || []).length && <tr><td colSpan={6}>No scheduled callbacks</td></tr>}
              </tbody>
            </table>
          </Panel>
        )}
        {live && sidePanel === 'calllog' && (
          <Panel eyebrow="History" title="My Call Log" icon={Clock3} className="admin-wide-panel">
            {callLog && !callLog.enabled && <p className="connection-summary">Call log view not enabled (user group flag or campaign call log days)</p>}
            {callLog?.enabled && (
              <>
                <div className="field-grid">
                  <label>
                    <span>Date</span>
                    <input type="date" value={callLogDate} onChange={(event) => setCallLogDate(event.target.value)} />
                  </label>
                </div>
                <table className="data-table">
                  <thead><tr><th>Date/Time</th><th>Dir</th><th>Length</th><th>Status</th><th>Phone</th><th>Name</th><th>Campaign</th></tr></thead>
                  <tbody>
                    {(callLog.rows || []).map((r, idx) => (
                      <tr key={idx}>
                        <td>{formatDateTime(r.call_date)}</td>
                        <td>{r.direction}</td>
                        <td>{formatSeconds(Number(r.length_in_sec || 0))}</td>
                        <td>{r.status}</td>
                        <td>{r.phone_number}</td>
                        <td>{r.full_name}</td>
                        <td>{r.campaign_id}</td>
                      </tr>
                    ))}
                    {!(callLog.rows || []).length && <tr><td colSpan={7}>No calls on {callLog.date}</td></tr>}
                  </tbody>
                </table>
              </>
            )}
          </Panel>
        )}
        {live && sidePanel === 'leadinfo' && leadInfo?.lead && (
          <Panel eyebrow={`Lead ${leadInfo.lead.lead_id}`} title="Lead Info & Call History" icon={Users} className="admin-wide-panel">
            <div className="connection-actions">
              <span className="connection-status">Status: {leadInfo.lead.status}</span>
              <span className="connection-status">Called: {leadInfo.lead.called_count}x</span>
              <span className="connection-status">Entered: {formatDateTime(leadInfo.lead.entry_date)}</span>
              {leadInfo.callback && <span className="connection-status">Callback {leadInfo.callback.status}: {formatDateTime(leadInfo.callback.callback_time)}</span>}
              {live.status !== 'INCALL' && !Number(live.lead_id) && (
                <button
                  type="button"
                  className="agb-act call"
                  disabled={busy}
                  onClick={async () => {
                    const payload = await act('/agent/manual-dial', { lead_id: leadInfo.lead.lead_id });
                    if (payload) {
                      setSidePanel('');
                      setViewLeadId(null);
                      setMessage(`Dialing lead ${leadInfo.lead.lead_id}`);
                    }
                  }}
                >
                  <Phone size={14} aria-hidden="true" /> Dial This Lead
                </button>
              )}
            </div>
            <table className="data-table">
              <thead><tr><th>Date/Time</th><th>Dir</th><th>Length</th><th>Status</th><th>Agent</th><th>Campaign</th></tr></thead>
              <tbody>
                {(leadInfo.history || []).map((r, idx) => (
                  <tr key={idx}>
                    <td>{formatDateTime(r.call_date)}</td>
                    <td>{r.direction}</td>
                    <td>{formatSeconds(Number(r.length_in_sec || 0))}</td>
                    <td>{r.status}</td>
                    <td>{r.user}</td>
                    <td>{r.campaign_id}</td>
                  </tr>
                ))}
                {!(leadInfo.history || []).length && <tr><td colSpan={6}>No prior calls</td></tr>}
              </tbody>
            </table>
          </Panel>
        )}
        {live && sidePanel === 'ingroups' && ingroupOptions && (
          <Panel eyebrow="Inbound" title="In-Group Selection" icon={Headphones} className="admin-wide-panel">
            {!ingroupOptions.enabled && <p className="connection-summary">In-group choice not enabled (campaign closers or user setting)</p>}
            {ingroupOptions.enabled && (
              <>
                <div className="connection-actions">
                  {(ingroupOptions.groups || []).map((g) => (
                    <button
                      type="button"
                      key={g.group_id}
                      className={ingroupPicks.includes(g.group_id) ? 'row-action tool-picker-item selected' : 'row-action'}
                      onClick={() => setIngroupPicks((cur) => (cur.includes(g.group_id) ? cur.filter((x) => x !== g.group_id) : [...cur, g.group_id]))}
                    >
                      {g.group_id}{g.group_name ? ` - ${g.group_name}` : ''}
                    </button>
                  ))}
                  {!(ingroupOptions.groups || []).length && <span className="connection-summary">No in-groups allowed for this user + campaign</span>}
                </div>
                <div className="modal-actions">
                  <label className="checkbox-field">
                    <input type="checkbox" checked={ingroupBlended} onChange={(event) => setIngroupBlended(event.target.checked)} />
                    <span>Blended (outbound autodial while waiting)</span>
                  </label>
                  <button
                    type="button"
                    className="primary-action"
                    disabled={busy}
                    onClick={async () => {
                      const payload = await act('/agent/select-ingroups', { groups: ingroupPicks, blended: ingroupBlended });
                      if (payload) setMessage(`In-groups set: ${(payload.selected || []).join(', ') || 'none'}`);
                    }}
                  >
                    Save In-Groups
                  </button>
                </div>
              </>
            )}
          </Panel>
        )}
        {live && lead && (
          <div className="agn-lead">
            <div className="agn-lead-head">
              <div className="agn-lead-ava">
                {(`${(lead.first_name || '')[0] || ''}${(lead.last_name || '')[0] || ''}`.toUpperCase()) || '?'}
              </div>
              <div className="agn-lead-who">
                <h2>{`${lead.title || ''} ${lead.first_name || ''} ${lead.last_name || ''}`.replace(/\s+/g, ' ').trim() || 'Unknown Caller'}</h2>
                <p className="agn-lead-num">
                  <PhoneCall size={14} aria-hidden="true" /> {lead.phone_code ? `+${lead.phone_code} ` : ''}{lead.phone_number}
                </p>
              </div>
              <div className="agn-lead-chips">
                {inboundInfo && (
                  <span className="agn-chip in">
                    Inbound {inboundInfo.group_id}{inboundInfo.group_name ? ` (${inboundInfo.group_name})` : ''} · waited {formatSeconds(Number(inboundInfo.queue_seconds || 0))}
                  </span>
                )}
                <span className="agn-chip">Lead #{lead.lead_id}</span>
                <span className="agn-chip">List {lead.list_id}</span>
                <span className="agn-chip">Status {lead.status}</span>
                <span className="agn-chip">Called {lead.called_count}x</span>
                {(lead.city || lead.state) && (
                  <span className="agn-chip">{[lead.city, lead.state].filter(Boolean).join(', ')}</span>
                )}
                {lead.gmt_offset_now != null && (
                  <span className="agn-chip time">
                    <Clock3 size={11} aria-hidden="true" /> Local {new Date(Date.now() + new Date().getTimezoneOffset() * 60000 + Number(lead.gmt_offset_now) * 3600000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
                {(webForms?.forms || []).map((f) => (
                  <button
                    type="button"
                    key={f.label}
                    className="agn-chip link"
                    onClick={() => window.open(mergeFields(f.url), webForms.target || '_blank')}
                  >
                    <ExternalLink size={11} aria-hidden="true" /> {f.label}
                  </button>
                ))}
              </div>
            </div>
            {lastNote && (
              <p className="agn-lastnote">
                <History size={13} aria-hidden="true" /> Last note ({formatDateTime(lastNote.date)}): {lastNote.note}
              </p>
            )}
            {dialFail && (
              <p className="form-error">
                Call failed: {dialFail.dialstatus}{dialFail.sip_hangup_reason ? ` — ${dialFail.sip_hangup_reason}` : ''} — hang up and disposition
              </p>
            )}
            {!dialFail && customerGone >= 2 && live.status === 'INCALL' && (
              <p className="form-error">No customer channel in your session — the caller may have hung up</p>
            )}
            <div className="agc-tabs">
              {[['main', 'Contact'], ['script', 'Script'], ['form', 'Form']].map(([key, label]) => (
                <button
                  type="button"
                  key={key}
                  className={mainTab === key ? 'agc-tab active' : 'agc-tab'}
                  onClick={() => setMainTab(key)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className={sidePanel === 'leadinfo' ? 'agc-tab active' : 'agc-tab'}
                onClick={() => {
                  setViewLeadId(null);
                  setSidePanel((c) => (c === 'leadinfo' ? '' : 'leadinfo'));
                }}
              >
                History
              </button>
            </div>
            {mainTab === 'script' && (
              <div className="agn-script">
                {scriptData && !scriptData.script && <p className="connection-summary">No script assigned to this campaign</p>}
                {scriptData?.script && (
                  <iframe
                    title="Campaign script"
                    style={{ width: '100%', height: 420, border: 0, background: '#fff', borderRadius: 8 }}
                    sandbox="allow-scripts"
                    srcDoc={mergeFields(scriptData.script.script_text, { escapeHtml: true })}
                  />
                )}
              </div>
            )}
            {showAltPhones && altPhones && (
              <table className="data-table">
                <thead><tr><th>#</th><th>Phone</th><th>Note</th><th>Active</th><th /></tr></thead>
                <tbody>
                  {(altPhones.phones || []).map((p) => (
                    <tr key={p.alt_phone_id}>
                      <td>{p.alt_phone_count}</td>
                      <td>{p.phone_code} {p.phone_number}</td>
                      <td>{p.alt_phone_note}</td>
                      <td>
                        <button
                          type="button"
                          className="row-action"
                          disabled={busy}
                          onClick={async () => {
                            const next = p.active === 'Y' ? 'N' : 'Y';
                            try {
                              await apiFetch('/agent/alt-phone-status', token, { method: 'POST', body: JSON.stringify({ alt_phone_id: p.alt_phone_id, active: next }) });
                              setAltPhones((cur) => ({ ...cur, phones: cur.phones.map((x) => (x.alt_phone_id === p.alt_phone_id ? { ...x, active: next } : x)) }));
                            } catch { setMessage('Alt phone update failed'); }
                          }}
                        >
                          {p.active === 'Y' ? 'Active' : 'Inactive'}
                        </button>
                      </td>
                      <td>
                        {live.status !== 'INCALL' && p.active === 'Y' && (
                          <button
                            type="button"
                            className="row-action"
                            disabled={busy}
                            onClick={async () => {
                              const payload = await act('/agent/manual-dial', { lead_id: lead.lead_id, alt_phone_id: p.alt_phone_id });
                              if (payload) setMessage(`Dialing alt phone #${p.alt_phone_count}`);
                            }}
                          >
                            Dial
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!(altPhones.phones || []).length && <tr><td colSpan={5}>No alternate phone entries for this lead</td></tr>}
                </tbody>
              </table>
            )}
            {mainTab === 'form' && customFields && (
              <div className="entity-form">
                {!customFields.fields?.length && <p className="connection-summary">No custom fields defined for list {customFields.listId}</p>}
                {Boolean(customFields.fields?.length) && (
                  <>
                    <div className="field-grid">
                      {customFields.fields.map((f) => (
                        <label key={f.label}>
                          <span>{f.description || f.label}{f.required ? ' *' : ''}</span>
                          {['SELECT', 'MULTI', 'RADIO', 'SWITCH'].includes(f.type) ? (
                            <select
                              value={f.value}
                              disabled={f.readonly}
                              onChange={(event) => setCustomFields((cur) => ({
                                ...cur,
                                fields: cur.fields.map((x) => (x.label === f.label ? { ...x, value: event.target.value } : x)),
                              }))}
                            >
                              <option value="">--</option>
                              {f.options.map((opt) => {
                                const [val, text] = opt.split(',');
                                return <option key={val} value={val}>{text || val}</option>;
                              })}
                            </select>
                          ) : f.type === 'AREA' ? (
                            <textarea
                              value={f.value}
                              rows={3}
                              disabled={f.readonly}
                              onChange={(event) => setCustomFields((cur) => ({
                                ...cur,
                                fields: cur.fields.map((x) => (x.label === f.label ? { ...x, value: event.target.value } : x)),
                              }))}
                            />
                          ) : (
                            <input
                              type={f.type === 'DATE' ? 'date' : f.type === 'TIME' ? 'time' : 'text'}
                              value={f.value}
                              maxLength={f.max || 255}
                              disabled={f.readonly}
                              onChange={(event) => setCustomFields((cur) => ({
                                ...cur,
                                fields: cur.fields.map((x) => (x.label === f.label ? { ...x, value: event.target.value } : x)),
                              }))}
                            />
                          )}
                        </label>
                      ))}
                    </div>
                    <div className="modal-actions">
                      <button
                        type="button"
                        className="primary-action"
                        disabled={busy}
                        onClick={async () => {
                          const values = Object.fromEntries(customFields.fields.filter((f) => !f.readonly).map((f) => [f.label, f.value]));
                          try {
                            await apiFetch('/agent/custom-fields', token, {
                              method: 'PUT',
                              body: JSON.stringify({ lead_id: lead.lead_id, values }),
                            });
                            setMessage('Custom fields saved');
                          } catch { setMessage('Custom fields save failed'); }
                        }}
                      >
                        Save Form
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
            {mainTab === 'main' && editLead && (
              <div className="entity-form agc-custform">
                <p className="connection-summary">Customer Information:</p>
                <div className="field-grid">
                  {[['title', 'Title'], ['first_name', 'First'], ['middle_initial', 'MI'], ['last_name', 'Last'],
                    ['address1', 'Address1'], ['address2', 'Address2'], ['address3', 'Address3'],
                    ['city', 'City'], ['state', 'State'], ['postal_code', 'PostCode'],
                    ['province', 'Province'], ['vendor_lead_code', 'Vendor ID'],
                    ['phone_number', 'Phone'], ['phone_code', 'DialCode'], ['alt_phone', 'Alt. Phone'],
                    ['security_phrase', 'Show'], ['email', 'Email']].map(([key, label]) => (
                      <label key={key}>
                        <span>{label}</span>
                        <input
                          type="text"
                          value={editLead[key] ?? ''}
                          onChange={(event) => setEditLead((cur) => ({ ...cur, [key]: event.target.value }))}
                        />
                      </label>
                  ))}
                  <label>
                    <span>Gender</span>
                    <select value={editLead.gender || 'U'} onChange={(event) => setEditLead((cur) => ({ ...cur, gender: event.target.value }))}>
                      <option value="U">U - Undefined</option>
                      <option value="M">M - Male</option>
                      <option value="F">F - Female</option>
                    </select>
                  </label>
                </div>
                <label className="agc-comments">
                  <span>Comments</span>
                  <textarea
                    rows={2}
                    value={editLead.comments ?? ''}
                    onChange={(event) => setEditLead((cur) => ({ ...cur, comments: event.target.value }))}
                  />
                </label>
                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-action compact-action"
                    disabled={busy}
                    onClick={async () => {
                      try {
                        await apiFetch('/agent/lead', token, { method: 'PUT', body: JSON.stringify(editLead) });
                        setMessage('Customer information saved');
                        refresh();
                      } catch { setMessage('Lead update failed'); }
                    }}
                  >
                    Save Customer Info
                  </button>
                  <button type="button" className="row-action" onClick={() => setSidePanel((c) => (c === 'leadinfo' ? '' : 'leadinfo'))}>
                    Lead Info
                  </button>
                  <button
                    type="button"
                    className="row-action"
                    onClick={() => {
                      const next = !showAltPhones;
                      setShowAltPhones(next);
                      if (next) apiFetch(`/agent/alt-phones?lead_id=${lead.lead_id}`, token).then(setAltPhones).catch(() => {});
                    }}
                  >
                    Alt Phones
                  </button>
                </div>
              </div>
            )}
            <div className="modal-actions">
              {lead.alt_phone && (
                <button
                  type="button"
                  className="row-action"
                  disabled={busy}
                  onClick={async () => {
                    const payload = await act('/agent/manual-dial', { lead_id: lead.lead_id, alt_dial: 'ALT' });
                    if (payload) setMessage(`Dialing ALT ${lead.alt_phone}`);
                  }}
                >
                  Dial Alt
                </button>
              )}
              {lead.address3 && /\d{5}/.test(lead.address3) && (
                <button
                  type="button"
                  className="row-action"
                  disabled={busy}
                  onClick={async () => {
                    const payload = await act('/agent/manual-dial', { lead_id: lead.lead_id, alt_dial: 'ADDR3' });
                    if (payload) setMessage('Dialing address3 number');
                  }}
                >
                  Dial Addr3
                </button>
              )}
            </div>
            {xferOpen && xferOptions && (
              <div className="entity-form">
                <div className="field-grid">
                  {xferOptions.flags?.blind && (
                    <label>
                      <span>Transfer to In-Group</span>
                      <select value={xferGroup} onChange={(event) => setXferGroup(event.target.value)}>
                        <option value="">Select group</option>
                        {(xferOptions.groups || []).map((g) => (
                          <option key={g.group_id} value={g.group_id}>{g.group_id} - {g.group_name || ''}</option>
                        ))}
                      </select>
                    </label>
                  )}
                  {xferOptions.flags?.blind && (
                    <label>
                      <span>Or Dialplan Exten</span>
                      <input type="text" value={xferExten} onChange={(event) => setXferExten(event.target.value)} placeholder="e.g. 8500" />
                    </label>
                  )}
                  {xferOptions.flags?.dialWithCustomer && (
                    <label>
                      <span>3-Way Number</span>
                      <input type="tel" value={threewayNumber} onChange={(event) => setThreewayNumber(event.target.value)} placeholder="3rd party number" />
                    </label>
                  )}
                </div>
                <div className="modal-actions">
                  {xferOptions.flags?.blind && (
                    <button
                      type="button"
                      className="secondary-action"
                      disabled={busy || (!xferGroup && !xferExten)}
                      onClick={async () => {
                        const payload = await act('/agent/xfer-blind', xferGroup ? { group_id: xferGroup } : { exten: xferExten });
                        if (payload) setMessage(`Customer transferred to ${payload.transferredTo} — disposition the call`);
                      }}
                    >
                      Blind Transfer
                    </button>
                  )}
                  {xferOptions.flags?.dialWithCustomer && !threewayChannel && (
                    <button
                      type="button"
                      className="secondary-action"
                      disabled={busy || threewayNumber.replace(/[^0-9]/g, '').length < 3}
                      onClick={async () => {
                        const payload = await act('/agent/threeway-dial', { phone_number: threewayNumber.replace(/[^0-9]/g, '') });
                        if (payload) {
                          setThreewayChannel(payload.threewayChannelPrefix || '');
                          setMessage('Dialing 3rd party into your conference');
                        }
                      }}
                    >
                      Dial 3-Way
                    </button>
                  )}
                  {threewayChannel && (
                    <button
                      type="button"
                      className="danger-action"
                      disabled={busy}
                      onClick={async () => {
                        const payload = await act('/agent/threeway-hangup', { channel_prefix: threewayChannel });
                        if (payload) {
                          setThreewayChannel('');
                          setMessage('3-way leg hung up');
                        }
                      }}
                    >
                      Hangup 3-Way Leg
                    </button>
                  )}
                  {xferOptions.flags?.park && (
                    <button
                      type="button"
                      className="secondary-action"
                      disabled={busy}
                      onClick={async () => {
                        const payload = await act('/agent/park', { grab: parked });
                        if (payload) {
                          setParked(!parked);
                          setMessage(parked ? 'Customer back in conference' : 'Customer parked on hold');
                        }
                      }}
                    >
                      {parked ? 'Grab Parked Call' : 'Park Customer'}
                    </button>
                  )}
                  {xferOptions.flags?.vmTransfer && (
                    <>
                      <input
                        type="text"
                        value={vmExten}
                        placeholder="VM extension"
                        style={{ maxWidth: 140 }}
                        onChange={(event) => setVmExten(event.target.value)}
                      />
                      <button
                        type="button"
                        className="secondary-action"
                        disabled={busy || !vmExten.trim()}
                        onClick={async () => {
                          const payload = await act('/agent/xfer-vmail', { extension: vmExten.trim() });
                          if (payload) setMessage(`Customer sent to voicemail ${vmExten.trim()} — disposition the call`);
                        }}
                      >
                        To Voicemail
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      {/* Right rail: disposition radios + note */}
      <div className="agent-right">
      {live && lead && (
        <div className="agr-card">
          <p className="agr-title"><Pencil size={14} aria-hidden="true" /> Update Disposition</p>
          <div className="agr-radios">
            {dispoStatuses.map((row) => {
              const hk = dispoHotkeys.find((h) => h.status === row.status);
              return (
                <label key={row.status} className="agr-radio">
                  <input
                    type="radio"
                    name="agent-dispo"
                    checked={dispoPick === row.status}
                    onChange={() => setDispoPick(row.status)}
                  />
                  <span>{row.status_name || row.status}{hk ? ` [${hk.hotkey}]` : ''}</span>
                </label>
              );
            })}
            {!dispoStatuses.length && <span className="connection-summary">No selectable statuses</span>}
          </div>
          {dispoPick === 'CALLBK' && (
            <>
              <div className="agn-cbpresets">
                {[['+1 Hour', 3600000], ['+4 Hours', 14400000], ['Tomorrow 9 AM', 'tomorrow9'], ['Next Week', 604800000]].map(([label, offset]) => (
                  <button
                    type="button"
                    key={label}
                    className="row-action"
                    onClick={() => {
                      const d = new Date();
                      if (offset === 'tomorrow9') { d.setDate(d.getDate() + 1); d.setHours(9, 0, 0, 0); }
                      else d.setTime(d.getTime() + offset);
                      setCallbackTime(new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16));
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="agr-note">
                <span>Callback Date/Time</span>
                <input type="datetime-local" value={callbackTime} onChange={(event) => setCallbackTime(event.target.value)} />
              </label>
            </>
          )}
          <label className="agr-note">
            <span>Add a note:</span>
            <textarea rows={2} value={dispoComments} onChange={(event) => setDispoComments(event.target.value)} maxLength={255} placeholder="Enter a note..." />
          </label>
          <button
            type="button"
            className="primary-action"
            disabled={busy || !dispoPick || (dispoPick === 'CALLBK' && !callbackTime)}
            onClick={async () => {
              const payload = await act('/agent/dispo', {
                status: dispoPick,
                lead_id: lead.lead_id,
                callback_datetime: callbackTime,
                comments: dispoComments,
              });
              if (payload) {
                setLead(null);
                setDispoPick('');
                setCallbackTime('');
                setDispoComments('');
                setMessage(`Dispositioned ${dispoPick} — paused`);
              }
            }}
          >
            Save Disposition
          </button>
        </div>
      )}
      </div>
      </div>
      {/* Floating softphone widget (CRM style): header pill + collapsible iframe.
          The iframe stays mounted while minimized so SIP/audio persist. */}
      {live && webphoneUrl && (
        <div className={showPhone ? 'agn-phone' : 'agn-phone min'}>
          <div className="agn-phone-head">
            <span className="agb-dot on" aria-hidden="true" />
            <span className="agn-phone-title">
              <Phone size={13} aria-hidden="true" /> Phone · {String(live.extension).split('/').pop()}
            </span>
            <button type="button" className="row-action" onClick={callWebphone}>Ring</button>
            <button type="button" className="row-action" onClick={() => setShowPhone((v) => !v)}>
              {showPhone ? 'Hide' : 'Open'}
            </button>
          </div>
          <iframe
            src={webphoneUrl}
            id="webphone"
            name="webphone"
            title="Webphone"
            scrolling="auto"
            allow="microphone *; speaker-selection *; autoplay *;"
            onLoad={() => {
              if (!webphoneCalledRef.current) {
                webphoneCalledRef.current = true;
                // Give the webphone a moment to register before ringing it.
                window.setTimeout(callWebphone, 2000);
              }
            }}
          />
        </div>
      )}
      {/* Pause modal: pick a pause reason (legacy pause-code panel) */}
      {pauseModal && live && (
        <div className="modal-backdrop" role="presentation" {...backdropCloseProps(() => setPauseModal(false))}>
          <section
            className="modal-panel agn-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Pause"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Take a break</p>
                <h2>Why are you pausing?</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setPauseModal(false)} aria-label="Close" title="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="agn-pausegrid">
              {pauseCodes.map((row) => (
                <button
                  key={row.pause_code}
                  type="button"
                  className="agn-pausebtn"
                  disabled={busy}
                  onClick={async () => {
                    const paused = live.status === 'PAUSED' ? { ok: true } : await act('/agent/pause');
                    if (paused) {
                      await act('/agent/pause-code', { pause_code: row.pause_code });
                      setPauseModal(false);
                      setMessage(`Paused — ${row.pause_code_name || row.pause_code}`);
                    }
                  }}
                >
                  {row.pause_code_name || row.pause_code}
                </button>
              ))}
              <button
                type="button"
                className="agn-pausebtn plain"
                disabled={busy}
                onClick={async () => {
                  const paused = live.status === 'PAUSED' ? { ok: true } : await act('/agent/pause');
                  if (paused) {
                    setPauseModal(false);
                    setMessage('Paused');
                  }
                }}
              >
                {pauseCodes.length ? 'Pause without a reason' : 'Pause'}
              </button>
            </div>
          </section>
        </div>
      )}
      {/* Manual dial modal (legacy MANUAL DIAL popup) */}
      {dialModal && live && (
        <div className="modal-backdrop" role="presentation" {...backdropCloseProps(() => setDialModal(false))}>
          <section
            className="modal-panel agn-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Manual dial"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-head">
              <div>
                <p className="eyebrow">Manual Dial</p>
                <h2>Place a Call</h2>
              </div>
              <button type="button" className="icon-button" onClick={() => setDialModal(false)} aria-label="Close" title="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <div className="agn-dialform">
              <input
                autoFocus
                type="tel"
                placeholder="Phone number…"
                value={manualNumber}
                onChange={(event) => setManualNumber(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && manualNumber.replace(/[^0-9]/g, '').length >= 5) dialManualNumber();
                }}
              />
              <p className="agn-dim">
                Dials through campaign {live.campaign_id} — dial prefix and caller ID come from the campaign settings.
              </p>
              <div className="modal-actions">
                <button
                  type="button"
                  className="primary-action"
                  disabled={busy || manualNumber.replace(/[^0-9]/g, '').length < 5}
                  onClick={dialManualNumber}
                >
                  <Phone size={16} aria-hidden="true" /> Dial Number
                </button>
              </div>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}

// Root of the standalone agent app (served at <base>/agent).
function AgentApp() {
  const [state, setState] = useState({ checking: true, token: '', authInfo: null });

  useEffect(() => {
    const stored = window.localStorage.getItem(AGENT_TOKEN_KEY) || '';
    if (!stored) {
      setState({ checking: false, token: '', authInfo: null });
      return;
    }
    apiFetch('/agent/setup', stored)
      .then((payload) => setState({
        checking: false,
        token: stored,
        authInfo: {
          campaigns: payload.campaigns || [],
          live: payload.live,
          user: payload.user || null,
          phone: payload.phone || null,
          userPass: payload.userPass || '',
        },
      }))
      .catch(() => {
        window.localStorage.removeItem(AGENT_TOKEN_KEY);
        setState({ checking: false, token: '', authInfo: null });
      });
  }, []);

  const exit = () => {
    window.localStorage.removeItem(AGENT_TOKEN_KEY);
    setState({ checking: false, token: '', authInfo: null });
  };

  if (state.checking) return null;
  if (!state.token) {
    return (
      <AgentLoginPage
        onAuthed={(payload) => setState({
          checking: false,
          token: payload.token,
          authInfo: {
            campaigns: payload.campaigns || [],
            live: payload.live,
            user: payload.user,
            phone: payload.phone,
            webphoneUrl: payload.webphoneUrl || null,
            pauseCodes: payload.pauseCodes || [],
            userPass: payload.userPass || '',
          },
        })}
      />
    );
  }
  return <AgentConsole token={state.token} authInfo={state.authInfo} onExit={exit} />;
}

function RecordingsView({ admin, token }) {
  const recordings = admin?.recordings || [];
  const [transcripts, setTranscripts] = useState([]);
  const [transcriptQuery, setTranscriptQuery] = useState('');
  const [transcriptsLoading, setTranscriptsLoading] = useState(false);
  const [transcriptsError, setTranscriptsError] = useState('');
  const [openTranscript, setOpenTranscript] = useState(null);

  const loadTranscripts = useCallback(async (query) => {
    setTranscriptsLoading(true);
    setTranscriptsError('');
    try {
      const params = new URLSearchParams();
      if (query) params.set('q', query);
      const payload = await apiFetch(`/reports/transcripts?${params.toString()}`, token);
      setTranscripts(payload?.transcripts || []);
    } catch (requestError) {
      setTranscriptsError('Transcripts failed to load');
    } finally {
      setTranscriptsLoading(false);
    }
  }, [token]);

  useEffect(() => { loadTranscripts(''); }, [loadTranscripts]);

  const viewTranscript = useCallback(async (row) => {
    try {
      const payload = await apiFetch(`/reports/transcripts?id=${row.transcript_id}`, token);
      setOpenTranscript(payload?.transcript || null);
    } catch (requestError) {
      setTranscriptsError('The transcript could not be loaded');
    }
  }, [token]);

  return (
    <section className="admin-grid">
      <Panel eyebrow="Recordings" title="Recent Recording Log" icon={Activity} className="admin-wide-panel">
        <DataTable
          emptyLabel="No recordings returned"
          rows={recordings.map((row) => ({ ...row, id: row.recording_id }))}
          columns={[
            { key: 'recording_id', label: 'ID', render: (row) => <strong>{row.recording_id}</strong> },
            { key: 'start_time', label: 'Started', render: (row) => formatDateTime(row.start_time) },
            { key: 'length_in_sec', label: 'Length', render: (row) => formatSeconds(row.length_in_sec) },
            {
              key: 'filename',
              label: 'File',
              render: (row) => (
                <>
                  <strong>{row.filename || 'Recording'}</strong>
                  <span>{row.vicidial_id || row.server_ip || 'No call id'}</span>
                </>
              ),
            },
            { key: 'user', label: 'User', render: (row) => row.user || 'System' },
            { key: 'lead_id', label: 'Lead', render: (row) => row.lead_id || 'None' },
          ]}
        />
      </Panel>
      <Panel eyebrow="QA" title={`Transcripts (${formatNumber(transcripts.length)})`} icon={FileText} className="admin-wide-panel">
        <form
          className="entity-form report-filter-bar"
          onSubmit={(event) => { event.preventDefault(); loadTranscripts(transcriptQuery.trim()); }}
        >
          <div className="field-grid">
            <label>
              <span>Search transcripts (blank = latest)</span>
              <input
                type="text"
                value={transcriptQuery}
                placeholder="e.g. cancel OR refund"
                onChange={(event) => setTranscriptQuery(event.target.value)}
              />
            </label>
          </div>
          <div className="modal-actions">
            <button type="submit" className="primary-action" disabled={transcriptsLoading}>
              <Search size={16} aria-hidden="true" />
              {transcriptsLoading ? 'Loading' : 'Search'}
            </button>
          </div>
        </form>
        {transcriptsError && <p className="form-error">{transcriptsError}</p>}
        <DataTable
          emptyLabel="No transcripts yet - the worker processes new recordings automatically"
          rows={transcripts.map((row) => ({ ...row, id: row.transcript_id }))}
          columns={[
            { key: 'transcript_id', label: 'ID', render: (row) => <strong>{row.transcript_id}</strong> },
            {
              key: 'filename',
              label: 'File',
              render: (row) => (
                <>
                  <strong>{row.filename}</strong>
                  <span>{row.source === 'INBOX' ? 'Inbox drop' : `Recording ${row.recording_id}`}</span>
                </>
              ),
            },
            { key: 'user', label: 'User', render: (row) => row.user || '' },
            { key: 'length_in_sec', label: 'Length', render: (row) => formatSeconds(row.length_in_sec) },
            { key: 'language', label: 'Lang', render: (row) => (row.language || '').toUpperCase() },
            { key: 'channels', label: 'Audio', render: (row) => (Number(row.channels) >= 2 ? 'Stereo' : 'Mono') },
            {
              key: 'status',
              label: 'Status',
              render: (row) => (
                <span className={`status-pill ${row.status === 'DONE' ? 'pill-active' : (row.status === 'ERROR' ? 'pill-alert' : 'pill-muted')}`}>
                  {row.status}
                </span>
              ),
            },
            { key: 'process_seconds', label: 'Proc', render: (row) => (row.process_seconds > 0 ? `${Math.round(row.process_seconds)}s` : '') },
            {
              key: 'actions',
              label: 'Action',
              render: (row) => (row.status === 'DONE' ? (
                <button type="button" className="secondary-action compact-action" onClick={() => viewTranscript(row)}>
                  <FileText size={15} aria-hidden="true" />
                  View
                </button>
              ) : (row.status === 'ERROR' ? <span title={row.error}>{(row.error || '').slice(0, 30)}</span> : null)),
            },
          ]}
        />
      </Panel>
      {openTranscript && (
        <div className="modal-backdrop" role="presentation" {...backdropCloseProps(() => setOpenTranscript(null))}>
          <div className="modal-panel detail-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">Transcript</p>
                <h3>{openTranscript.filename}</h3>
              </div>
              <button type="button" className="icon-action" onClick={() => setOpenTranscript(null)} aria-label="Close">
                <X size={18} aria-hidden="true" />
              </button>
            </div>
            <p className="action-copy">
              {Number(openTranscript.channels) >= 2 ? 'Stereo: customer right channel, agent left channel.' : 'Mono recording - single mixed channel.'}
              {' '}Model {openTranscript.model}, language {(openTranscript.language || '').toUpperCase() || 'unknown'},
              {' '}processed in {Math.round(openTranscript.process_seconds || 0)}s.
            </p>
            <div className="transcript-body">
              {(openTranscript.segments || []).length ? (openTranscript.segments || []).map((segment, index) => (
                <p key={index} className="transcript-line">
                  <span className="transcript-time">{formatSeconds(Math.round(segment.start))}</span>
                  {segment.speaker && (
                    <strong className={segment.speaker === 'CUSTOMER' ? 'transcript-customer' : 'transcript-agent'}>
                      {segment.speaker}
                    </strong>
                  )}
                  <span>{segment.text}</span>
                </p>
              )) : <p>{openTranscript.transcript || 'No speech detected'}</p>}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SystemView({ admin, user, onAction }) {
  const carriers = admin?.carriers || [];
  const canManageCarriers = userCan(user, 'carriers');

  return (
    <>
      <ActionBar
        entity="servers"
        label="Server"
        user={user}
        onAction={onAction}
        extraActions={canManageCarriers ? (
          <button type="button" className="secondary-action compact-action" onClick={() => onAction('carriers', 'create')}>
            <Plus size={17} aria-hidden="true" />
            Add Carrier
          </button>
        ) : null}
      >
        <p className="action-copy">Manage system servers, conference settings, websocket endpoints, and carrier routing records.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Telephony" title="Carriers" icon={PhoneCall} className="admin-wide-panel">
          <DataTable
            emptyLabel="No carriers returned"
            rows={carriers.map((row) => ({ ...row, id: row.carrier_id }))}
            columns={[
              {
                key: 'carrier_id',
                label: 'Carrier',
                render: (row) => (
                  <>
                    <strong>{row.carrier_id}</strong>
                    <span>{row.carrier_name || row.carrier_description || 'Carrier'}</span>
                  </>
                ),
              },
              { key: 'protocol', label: 'Protocol', render: (row) => row.protocol || 'SIP' },
              { key: 'server_ip', label: 'Server', render: (row) => row.server_ip || 'Default' },
              { key: 'user_group', label: 'Group', render: (row) => row.user_group || '---ALL---' },
              { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
              ...(canManageCarriers ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('carriers', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel
          eyebrow="Telephony"
          title={`Conf Templates (${formatNumber((admin?.confTemplates || []).length)})`}
          icon={FileText}
          headerActions={userCan(user, 'confTemplates') ? (
            <button type="button" className="secondary-action compact-action" onClick={() => onAction('confTemplates', 'create')}>
              <Plus size={14} aria-hidden="true" /> Add
            </button>
          ) : null}
        >
          <DataTable
            emptyLabel="No conf templates (phone/carrier config templates)"
            rows={(admin?.confTemplates || []).map((row) => ({ ...row, id: row.template_id }))}
            columns={[
              { key: 'template_id', label: 'ID' },
              { key: 'template_name', label: 'Name' },
              { key: 'user_group', label: 'Group', render: (row) => row.user_group || '---ALL---' },
              { key: 'size', label: 'Contents', render: (row) => `${formatNumber(String(row.template_contents || '').length)} chars` },
              ...(userCan(user, 'confTemplates') ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('confTemplates', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function AdminPage({ activeView, viewParams, dashboard, admin, user, token, onAction, onSaved, onNavigate }) {
  if (activeView === 'command') return <CommandView dashboard={dashboard} admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'campaigns') return <CampaignsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'users') return <UsersView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'userGroups') return <UserGroupsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'remoteAgents') return <RemoteAgentsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'dropLists') return <DropListsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'mediaTools') return <MediaToolsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'display') return <DisplayView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'systemSettings') return <SystemSettingsView user={user} token={token} onLogout={() => onNavigate('command')} />;
  if (activeView === 'lists') return <ListsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'leadSearch') return <LeadSearchView admin={admin} user={user} token={token} viewParams={viewParams} />;
  if (activeView === 'leadLoader') return <LeadLoaderView admin={admin} user={user} token={token} onLoaded={onSaved} />;
  if (activeView === 'dnc') return <DncView admin={admin} user={user} token={token} />;
  if (activeView === 'inbound') return <InboundView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'dids') return <DidsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'callMenus') return <CallMenusView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'filterPhoneGroups') return <FilterPhoneGroupsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'phones') return <PhonesView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'scripts') return <ScriptsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'leadFilters') return <LeadFiltersView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'callTimes') return <CallTimesView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'shifts') return <ShiftsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'statuses') return <StatusesView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'reports') return <ReportsView dashboard={dashboard} admin={admin} user={user} onNavigate={onNavigate} />;
  if (activeView === 'reportAgentMonitorLog') return <AgentMonitorLogReportView admin={admin} user={user} token={token} />;
  if (activeView === 'reportRealtimeMain') return <RealtimeMainReportView token={token} user={user} />;
  if (activeView === 'reportCampaignSummary') return <CampaignSummaryReportView token={token} />;
  if (activeView === 'reportWhiteboard') return <WhiteboardReportView token={token} />;
  if (activeView === 'reportHopperList') return <HopperListReportView token={token} initialCampaignId={viewParams?.campaignId} />;
  if (activeView === 'reportListStatuses') return <ListStatusesReportView token={token} />;
  if (activeView === 'reportListCampaignStatuses') return <ListCampaignStatusesReportView token={token} initialCampaignId={viewParams?.campaignId} />;
  if (activeView === 'reportCallbackHolds') return <CallbackHoldsReportView token={token} initialScope={viewParams?.scope} initialId={viewParams?.id} onNavigate={onNavigate} />;
  if (activeView === 'reportCampaignStatusList') return <CampaignStatusListReportView token={token} />;
  if (activeView === 'reportDialerInventory') return <DialerInventoryReportView token={token} />;
  if (activeView === 'reportOutboundCalling') return <OutboundCallingReportView token={token} />;
  if (activeView === 'reportOutboundInterval') return <OutboundIntervalReportView token={token} />;
  if (activeView === 'reportLeadSource') return <LeadSourceReportView token={token} />;
  if (activeView === 'reportInboundSummary') return <InboundSummaryReportView token={token} />;
  if (activeView === 'reportServiceLevel') return <ServiceLevelReportView token={token} />;
  if (activeView === 'reportInboundHourly') return <InboundHourlyReportView token={token} />;
  if (activeView === 'reportInboundDaily') return <InboundDailyReportView token={token} />;
  if (activeView === 'reportDidStats') return <DidStatsReportView token={token} />;
  if (activeView === 'reportDidDetail') return <DidDetailReportView token={token} />;
  if (activeView === 'reportIvr') return <IvrReportView token={token} />;
  if (activeView === 'reportForecasting') return <InboundForecastingReportView token={token} />;
  if (activeView === 'reportAgentTimeDetail') return <AgentTimeDetailReportView token={token} />;
  if (activeView === 'reportAgentStatusDetail') return <AgentStatusDetailReportView token={token} />;
  if (activeView === 'reportAgentPerformance') return <AgentPerformanceReportView token={token} />;
  if (activeView === 'reportAgentDisposition') return <AgentDispositionReportView token={token} />;
  if (activeView === 'reportTeamPerformance') return <TeamPerformanceReportView token={token} />;
  if (activeView === 'reportAgentDays') return <AgentDaysReportView token={token} />;
  if (activeView === 'reportUserGroupLogin') return <UserGroupLoginReportView token={token} />;
  if (activeView === 'reportUserLogins') return <UserLoginsReportView token={token} />;
  if (activeView === 'reportUserStats') return <UserStatsReportView token={token} initialUser={viewParams?.user} adminUser={user} />;
  if (activeView === 'reportPerformanceComparison') return <PerformanceComparisonReportView token={token} />;
  if (activeView === 'reportUserGroupHourly') return <UserGroupHourlyReportView token={token} />;
  if (activeView === 'reportExports') return <ExportsReportView token={token} />;
  if (activeView === 'reportCalledCounts') return <CalledCountsReportView token={token} />;
  if (activeView === 'reportAdminLog') return <AdminChangeLogReportView token={token} initialSection={viewParams?.section} initialRecord={viewParams?.record} />;
  if (activeView === 'reportDialLog') return <DialLogReportView token={token} />;
  if (activeView === 'reportCustom') return <CustomReportView token={token} />;
  if (activeView === 'reportTimeclock') return <TimeclockReportView token={token} />;
  if (activeView === 'reportTimeclockStatus') return <TimeclockStatusReportView token={token} />;
  if (LOG_REPORT_CONFIGS[activeView]) return <LogReportView token={token} config={LOG_REPORT_CONFIGS[activeView]} />;
  if (activeView === 'reportServerPerformance') return <ServerPerformanceReportView token={token} />;
  if (activeView === 'reportPhoneStats') return <PhoneStatsReportView token={token} />;
  if (activeView === 'reportProcess') return <ProcessReportView token={token} />;
  if (activeView === 'reportSph') return <SphReportView token={token} />;
  if (activeView === 'reportMaxStats') return <MaxStatsReportView token={token} />;
  if (activeView === 'recordings') return <RecordingsView admin={admin} token={token} />;
  if (activeView === 'adminReports') return <AdminReportsView />;
  if (activeView === 'system') return <SystemView admin={admin} user={user} onAction={onAction} />;
  return <CommandView dashboard={dashboard} admin={admin} />;
}

// Hash routing (#/viewKey): nav entries are real links, so middle/right-click
// "open in new tab" works and a fresh tab restores the view from the URL.
// Unknown keys simply land on the Command view.
function viewFromHash() {
  const key = window.location.hash.replace(/^#\/?/, '');
  return /^[a-zA-Z][\w-]*$/.test(key) ? key : 'command';
}

function AdminShell({ token, user, onLogout }) {
  const [activeView, setActiveView] = useState(viewFromHash);
  // Legacy-style cross-page links carry ids (campaign_id etc.); viewParams is
  // the payload for the view being navigated to, cleared on plain nav clicks.
  const [viewParams, setViewParams] = useState(null);
  const [range, setRange] = useState('today');
  const [dashboardState, setDashboardState] = useState({ loading: true, error: '', data: null });
  const [adminState, setAdminState] = useState({ loading: true, error: '', data: null });
  const [action, setAction] = useState(null);

  const loadDashboard = useCallback(async () => {
    try {
      const payload = await apiFetch(`/dashboard?range=${encodeURIComponent(range)}`, token);
      setDashboardState({ loading: false, error: '', data: payload.data });
    } catch (error) {
      if (error.status === 401) {
        onLogout();
        return;
      }
      setDashboardState((current) => ({ ...current, loading: false, error: 'Dashboard data is temporarily unavailable' }));
    }
  }, [onLogout, range, token]);

  const loadAdmin = useCallback(async () => {
    try {
      const payload = await apiFetch('/admin', token);
      setAdminState({ loading: false, error: '', data: payload.data });
    } catch (error) {
      if (error.status === 401) {
        onLogout();
        return;
      }
      setAdminState((current) => ({ ...current, loading: false, error: 'Admin data is temporarily unavailable' }));
    }
  }, [onLogout, token]);

  const refreshAll = useCallback(() => {
    loadDashboard();
    loadAdmin();
  }, [loadAdmin, loadDashboard]);

  const openAction = useCallback((entity, mode, row = null) => {
    setAction({ entity, mode, row });
  }, []);

  const navigateTo = useCallback((view, params = null) => {
    setViewParams(params);
    setActiveView(view);
    setAction(null);
    // Keep the URL in sync so refresh/share/new-tab lands on the same view
    // (and browser back/forward walks the view history).
    if (viewFromHash() !== view) window.location.hash = `#/${view}`;
  }, []);

  // Browser back/forward (and manual hash edits) drive the view too. The ref
  // avoids clearing viewParams on the echo hashchange navigateTo just caused.
  const activeViewRef = useRef(activeView);
  useEffect(() => {
    activeViewRef.current = activeView;
  }, [activeView]);
  useEffect(() => {
    const onHashChange = () => {
      const view = viewFromHash();
      if (view === activeViewRef.current) return;
      setViewParams(null);
      setAction(null);
      setActiveView(view);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const handleSaved = useCallback((nextAdminData) => {
    setAdminState({ loading: false, error: '', data: nextAdminData });
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Mission Control tiles poll fast so live dialing is visible; the heavier
  // admin catalog stays on the slower cycle.
  useEffect(() => {
    const timer = window.setInterval(loadDashboard, DASHBOARD_POLL_MS);
    return () => window.clearInterval(timer);
  }, [loadDashboard]);

  useEffect(() => {
    const timer = window.setInterval(loadAdmin, 30000);
    return () => window.clearInterval(timer);
  }, [loadAdmin]);

  // Report views (reportHopperList etc.) live under the Reports nav entry:
  // highlight Reports in the sidebar and show its heading for all of them.
  const navView = activeView.startsWith('report') && activeView !== 'reports' ? 'reports' : activeView;
  // GenX nav gating: the login payload carries the user group's allowed
  // sections; missing/empty means full nav.
  const allowedNavSections = new Set(
    user?.navSections?.length ? user.navSections : NAV_SECTION_OPTIONS.map((option) => option.value),
  );
  const activeMeta = NAV_ITEMS.find((item) => item.key === activeView)
    || NAV_ITEMS.find((item) => item.key === navView)
    || NAV_ITEMS[0];
  const system = dashboardState.data?.system || {};
  const updatedAt = activeView === 'command' ? dashboardState.data?.generatedAt : adminState.data?.generatedAt;
  const isLoading = dashboardState.loading || adminState.loading;
  const error = dashboardState.error || adminState.error;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-lock">
          <div className="brand-mark">GX</div>
          <div>
            <p className="eyebrow">GenX Contact Center</p>
            <h1>Mission Control</h1>
          </div>
        </div>
        <div className="topbar-actions">
          {user && (
            <span className="user-pill">
              <ShieldCheck size={14} aria-hidden="true" />
              {user.fullName || user.user} | L{user.userLevel}
            </span>
          )}
          <StatusPill ok={system.dbOnline}>
            <Server size={14} aria-hidden="true" />
            {system.dbOnline ? 'DB Online' : 'DB Offline'}
          </StatusPill>
          <button type="button" className="icon-button" onClick={refreshAll} aria-label="Refresh" title="Refresh">
            <RefreshCcw size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={onLogout} aria-label="Sign out" title="Sign out">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="shell-body">
        <nav className="side-nav" aria-label="GenX admin navigation">
          {NAV_GROUPS.filter((group) => !group.section || allowedNavSections.has(group.section)).map((group) => (
            <div className="nav-group" key={group.title || 'top'}>
              {group.title && <p className="nav-group-title">{group.title}</p>}
              {group.keys.map((key) => {
                // Item-level gating on top of the section gating: global
                // status definitions are admin-only (campaign statuses live
                // on the individual campaigns).
                if (ADMIN_ONLY_NAV_KEYS.has(key) && !hasAdminNav(user)) return null;
                const item = NAV_ITEMS.find((navItem) => navItem.key === key);
                if (!item) return null;
                const Icon = item.icon;
                return (
                  // Real link so middle/right-click "open in new tab" works;
                  // left click stays in-app via navigateTo.
                  <a
                    href={`#/${key}`}
                    key={key}
                    className={key === navView ? 'active' : ''}
                    onClick={(event) => {
                      if (event.ctrlKey || event.metaKey || event.shiftKey || event.button !== 0) return;
                      event.preventDefault();
                      navigateTo(key);
                    }}
                  >
                    <Icon size={16} aria-hidden="true" />
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </div>
          ))}
        </nav>

        <div className="shell-main">
          <section className="workspace-strip">
            <div>
              <p className="eyebrow">{activeMeta.eyebrow}</p>
              <h2>{activeMeta.title}</h2>
            </div>
            <div className="strip-items">
              {activeView === 'command' && <RangeControl value={range} onChange={setRange} />}
              {activeView === 'command' && <RefreshCountdown updatedAt={updatedAt} />}
              {activeView === 'command' && (
                <a href="/genxapi/" target="_blank" rel="noreferrer">
                  <FileText size={16} aria-hidden="true" /> API Docs
                </a>
              )}
              {activeView === 'command' && (
                <a href="/genxguide/" target="_blank" rel="noreferrer">
                  <BookOpen size={16} aria-hidden="true" /> User Guide
                </a>
              )}
              <span><Clock3 size={16} aria-hidden="true" /> Updated {formatTime(updatedAt)}</span>
              <span><Database size={16} aria-hidden="true" /> {system.database || 'asterisk'}</span>
              <span><Sparkles size={16} aria-hidden="true" /> GenX UI v0.3</span>
            </div>
          </section>

          {error && <div className="alert">{error}</div>}
          {isLoading && <div className="loading-band">Loading live dialer data</div>}

          <AdminPage
            activeView={activeView}
            viewParams={viewParams}
            dashboard={dashboardState.data}
            admin={adminState.data}
            user={user}
            token={token}
            onAction={openAction}
            onSaved={handleSaved}
            onNavigate={navigateTo}
          />

          <footer className="footer-line">
            <span><Search size={14} aria-hidden="true" /> GenX admin app connected to the dialer data layer</span>
          </footer>
        </div>
      </div>

      {action && (
        <ActionModal
          action={action}
          admin={adminState.data}
          token={token}
          user={user}
          onClose={() => setAction(null)}
          onSaved={handleSaved}
          onLogout={onLogout}
          onSwitchAction={openAction}
          onNavigate={navigateTo}
        />
      )}
    </main>
  );
}

function App() {
  const [auth, setAuth] = useState({
    checking: true,
    token: '',
    user: null,
  });

  useEffect(() => {
    const storedToken = window.localStorage.getItem(TOKEN_KEY) || '';
    if (!storedToken) {
      setAuth({ checking: false, token: '', user: null });
      return;
    }

    apiFetch('/session', storedToken)
      .then((payload) => setAuth({ checking: false, token: storedToken, user: payload.user }))
      .catch(() => {
        window.localStorage.removeItem(TOKEN_KEY);
        setAuth({ checking: false, token: '', user: null });
      });
  }, []);

  function login(nextToken, user) {
    if (nextToken) {
      window.localStorage.setItem(TOKEN_KEY, nextToken);
    }
    setAuth({ checking: false, token: nextToken, user: user || null });
  }

  function logout() {
    if (auth.token) {
      apiFetch('/logout', auth.token, { method: 'POST' }).catch(() => {});
    }
    window.localStorage.removeItem(TOKEN_KEY);
    setAuth({ checking: false, token: '', user: null });
  }

  if (auth.checking) {
    return (
      <main className="login-shell">
        <section className="login-panel" aria-label="Checking access">
          <div className="brand-lock">
            <div className="brand-mark">GX</div>
            <div>
              <p className="eyebrow">GenX</p>
              <h1>Checking Access</h1>
            </div>
          </div>
        </section>
      </main>
    );
  }

  if (!auth.token || !auth.user) {
    return <Login onLogin={login} />;
  }

  return <AdminShell token={auth.token} user={auth.user} onLogout={logout} />;
}

// <base>/agent serves the standalone agent screen (genx analog of
// /agc/vicidial.php); everything else is the admin console.
const IS_AGENT_APP = /\/agent\/?$/.test(window.location.pathname);
createRoot(document.getElementById('root')).render(IS_AGENT_APP ? <AgentApp /> : <App />);
