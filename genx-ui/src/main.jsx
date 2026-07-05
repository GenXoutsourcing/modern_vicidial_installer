import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  BarChart3,
  CalendarDays,
  Clock3,
  Compass,
  Copy,
  Database,
  ExternalLink,
  FileText,
  Gauge,
  Headphones,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Pencil,
  PhoneCall,
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
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { LEGACY_ADMIN_GROUPS, REPORT_GROUPS } from './catalog';
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
const INBOUND_QUEUE_NO_DIAL_OPTIONS = ['DISABLED', 'ENABLED', 'ALL_SERVERS', 'ENABLED_WITH_CHAT', 'ALL_SERVERS_WITH_CHAT'];
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
  { key: 'command', label: 'Command', eyebrow: 'Live Operations', title: 'VICIdial command layer', icon: LayoutDashboard },
  { key: 'campaigns', label: 'Campaigns', eyebrow: 'Admin', title: 'Campaign Control', icon: Radio },
  { key: 'users', label: 'Users', eyebrow: 'Admin', title: 'Users and Permissions', icon: Users },
  { key: 'userGroups', label: 'Groups', eyebrow: 'Access', title: 'User Groups and Scope', icon: ShieldCheck },
  { key: 'lists', label: 'Lists', eyebrow: 'Admin', title: 'Lists and Lead Inventory', icon: Database },
  { key: 'inbound', label: 'Inbound', eyebrow: 'Admin', title: 'Inbound Groups', icon: Headphones },
  { key: 'dids', label: 'DIDs', eyebrow: 'Inbound', title: 'DID Routing', icon: PhoneCall },
  { key: 'callMenus', label: 'Call Menus', eyebrow: 'Inbound', title: 'Call Menu Routing', icon: Compass },
  { key: 'phones', label: 'Phones', eyebrow: 'Platform', title: 'Phones and Webphones', icon: PhoneCall },
  { key: 'scripts', label: 'Scripts', eyebrow: 'Admin', title: 'Scripts and Agent Prompts', icon: FileText },
  { key: 'leadFilters', label: 'Filters', eyebrow: 'Admin', title: 'Lead Filters', icon: SlidersHorizontal },
  { key: 'callTimes', label: 'Call Times', eyebrow: 'Admin', title: 'Call Times', icon: Timer },
  { key: 'shifts', label: 'Shifts', eyebrow: 'Access', title: 'Shifts and Login Windows', icon: Clock3 },
  { key: 'statuses', label: 'Statuses', eyebrow: 'Admin', title: 'Statuses and Outcomes', icon: Gauge },
  { key: 'reports', label: 'Reports', eyebrow: 'Reporting', title: 'Reporting Center', icon: FileText },
  { key: 'recordings', label: 'Recordings', eyebrow: 'Reports', title: 'Recent Recordings', icon: Activity },
  { key: 'system', label: 'System', eyebrow: 'Platform', title: 'Servers and Carriers', icon: Server },
  { key: 'map', label: 'Map', eyebrow: 'Coverage', title: 'VICIdial Page Map', icon: Compass },
];

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
    } catch (_error) {
      setError('VICIdial credentials or user level were not accepted');
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
            <p className="eyebrow">GenX</p>
            <h1>Command Center</h1>
          </div>
        </div>
        <form onSubmit={submit} className="login-form">
          <label htmlFor="vicidial-user">VICIdial user</label>
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
  if (entity === 'users') return Boolean(user?.modifyUsers);
  if (entity === 'userGroups') return Boolean(user?.modifyUsergroups);
  if (entity === 'lists') return Boolean(user?.modifyLists);
  if (entity === 'inbound') return Boolean(user?.modifyIngroups);
  if (entity === 'dids') return Boolean(user?.modifyInboundDids);
  if (entity === 'callMenus') return Boolean(user?.modifyIngroups);
  if (entity === 'phones') return Boolean(user?.modifyPhones);
  if (entity === 'scripts') return Boolean(user?.modifyScripts);
  if (entity === 'leadFilters') return Boolean(user?.modifyFilters);
  if (entity === 'callTimes') return Boolean(user?.modifyCallTimes);
  if (entity === 'shifts') return Boolean(user?.modifyCallTimes);
  if (entity === 'statuses') return Boolean(user?.modifyStatuses);
  if (entity === 'campaignStatuses') return Boolean(user?.modifyStatuses || user?.modifyCampaigns);
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

function scopeText(values, allValue, suffix = ' -') {
  if (allValue && values.includes(allValue)) return allValue;
  const cleanValues = values.filter(Boolean);
  return cleanValues.length ? `${cleanValues.join(' ')}${suffix}` : allValue || '';
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
      list_order_mix: 'DISABLED',
      campaign_allow_inbound: 'N',
      manual_dial_list_id: '998',
      default_xfer_group: '---NONE---',
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
      per_call_notes: 'DISABLED',
      my_callback_option: 'UNCHECKED',
      agent_lead_search: 'DISABLED',
      callback_days_limit: '0',
      callback_hours_block: '0',
      callback_list_calltime: 'DISABLED',
      user_group: '---ALL---',
      pause_after_each_call: 'N',
      pause_after_next_call: 'DISABLED',
      owner_populate: 'DISABLED',
      allow_emails: 'N',
      allow_chats: 'N',
      max_inbound_calls: '0',
      hide_call_log_info: 'N',
      wrapup_bypass: 'ENABLED',
      callback_active_limit: '0',
      callback_active_limit_override: 'N',
      show_previous_callback: 'ENABLED',
      clear_script: 'DISABLED',
      manual_dial_search_filter: 'NONE',
      status_display_ingroup: 'ENABLED',
      manual_dial_timeout: '',
      manual_dial_hopper_check: 'N',
      manual_auto_next: '0',
      manual_auto_show: 'N',
      ready_max_logout: '0',
      callback_display_days: '0',
      scheduled_callbacks_alert: 'NONE',
      scheduled_callbacks_email_alert: 'N',
      scheduled_callbacks_count: 'LIVE',
      scheduled_callbacks_force_dial: 'N',
      scheduled_callbacks_auto_reschedule: 'NONE',
      next_dial_my_callbacks: 'DISABLED',
      callback_dnc: 'DISABLED',
      mute_recordings: 'N',
      amd_type: 'AMD',
      transfer_button_launch: 'NONE',
      shared_dial_rank: '99',
      call_limit_24hour_method: 'DISABLED',
      call_limit_24hour_scope: 'SYSTEM_WIDE',
      call_limit_24hour: '0',
      call_limit_24hour_override: 'DISABLED',
      agent_hide_hangup: 'N',
      max_logged_in_agents: '0',
      show_confetti: 'DISABLED',
      dead_stop_recording: 'DISABLED',
      daily_phone_number_call_limit: '0',
      call_log_days: '0',
      hangup_again_link: 'ENABLED',
    };
  }

  if (entity === 'campaignCopy') {
    return {
      campaign_id: '',
      campaign_name: '',
      source_campaign_id: campaign,
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
    };
  }

  if (entity === 'userGroups') {
    return {
      user_group: '',
      group_name: '',
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
      allowed_custom_reports: 'ALL REPORTS',
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
      filter_action: 'DISABLED',
      filter_extension: '',
      filter_group_id: inboundGroup,
      filter_campaign_id: campaign,
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
      protocol: 'SIP',
      local_gmt: '-5.00',
      outbound_cid: '',
      email: '',
      template_id: '',
      phone_context: 'default',
      phone_ring_timeout: '60',
      conf_secret: '',
      is_webphone: 'N',
      user_group: group,
      webphone_dialpad: 'Y',
      webphone_auto_answer: 'N',
      webphone_dialbox: 'Y',
      webphone_mute: 'Y',
      webphone_volume: '50',
      webphone_debug: 'N',
      webphone_settings: '',
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
    next_agent_call: 'longest_wait_time',
    queue_priority: '0',
    drop_call_seconds: '360',
    drop_action: 'MESSAGE',
    call_time_id: callTime,
    play_welcome_message: 'ALWAYS',
    no_agent_action: 'MESSAGE',
    group_handling: 'PHONE',
  };
}

function actionFields(entity, mode, admin, form = {}) {
  const callTimeOptions = lookupOptions(admin?.lookups?.callTimes, 'call_time_id', 'call_time_name');
  const campaignOptions = lookupOptions(admin?.lookups?.campaigns, 'campaign_id', 'campaign_name');
  const userGroupOptions = lookupOptions(admin?.lookups?.userGroups, 'user_group', 'group_name');
  const userGroupAllOptions = withCurrentOption([{ value: '---ALL---', label: '---ALL---' }, ...userGroupOptions], form?.user_group);
  const scriptOptions = [{ value: '', label: 'NONE' }, ...lookupOptions(admin?.lookups?.scripts, 'script_id', 'script_name')];
  const leadFilterOptions = [{ value: 'NONE', label: 'NONE' }, ...lookupOptions(admin?.lookups?.leadFilters, 'lead_filter_id', 'lead_filter_name')];
  const inboundOptions = [{ value: '---NONE---', label: '---NONE---' }, ...lookupOptions(admin?.lookups?.inboundGroups, 'group_id', 'group_name')];
  const inboundStrictOptions = lookupOptions(admin?.lookups?.inboundGroups, 'group_id', 'group_name');
  const serverOptions = lookupOptions(admin?.lookups?.servers, 'server_ip', 'server_description');
  const listOptions = [{ value: '998', label: '998' }, ...lookupOptions(admin?.lookups?.lists, 'list_id', 'list_name')];
  const userOptions = lookupOptions(admin?.lookups?.users, 'user', 'full_name');
  const phoneOptions = uniqueOptions(lookupOptions(admin?.lookups?.phones, 'extension', 'label'));
  const callMenuOptions = [{ value: '', label: 'NONE' }, ...lookupOptions(admin?.lookups?.callMenus, 'menu_id', 'menu_name')];
  const shiftScopeOptions = [{ value: '---ALL---', label: '---ALL---' }, ...lookupOptions(admin?.lookups?.shifts, 'shift_id', 'shift_name')];
  const phoneCodeOptions = withCurrentOption(lookupOptions(admin?.lookups?.phoneCodes, 'country_code', 'country'), form?.phone_code);
  const phoneContextOptions = withCurrentOption(lookupOptions(admin?.lookups?.phoneContexts, 'phone_context', 'phone_context'), form?.phone_context || form?.exten_context);
  const campaignScopeOptions = [{ value: '-ALL-CAMPAIGNS-', label: '-ALL-CAMPAIGNS-' }, ...campaignOptions];
  const userGroupScopeOptions = [{ value: '---ALL---', label: '---ALL---' }, ...userGroupOptions];
  const inboundScopeOptions = [{ value: '---ALL---', label: '---ALL---' }, ...inboundStrictOptions];
  const callTimeScopeOptions = [{ value: '---ALL---', label: '---ALL---' }, ...callTimeOptions];
  const reportScopeOptions = [{ value: 'ALL REPORTS', label: 'ALL REPORTS' }, { value: 'NONE', label: 'NONE' }, ...reportOptions()];
  const manualFilterOptions = withCurrentOption(leadFilterOptions, form?.manual_dial_filter);
  const manualSearchFilterOptions = withCurrentOption(leadFilterOptions, form?.manual_dial_search_filter);
  const clipboardFieldOptions = withCurrentOption(enumOptions(['NONE', ...LEAD_FIELD_OPTIONS.filter((field) => field !== 'DISABLED')]), form?.agent_clipboard_copy);
  const legacyCampaignHref = () => `/vicidial/admin.php?ADD=31&campaign_id=${encodeURIComponent(form?.campaign_id || '')}`;
  const legacyCallTimeHref = () => `/vicidial/admin.php?ADD=311111111&call_time_id=${encodeURIComponent(form?.call_time_id || '')}`;
  const legacyCallMenuHref = () => `/vicidial/admin.php?ADD=1511&menu_id=${encodeURIComponent(form?.menu_id || '')}`;
  const currentStatuses = campaignDialStatuses(form);
  const statusNameMap = new Map([
    ...(admin?.lookups?.statuses || []),
    ...(admin?.lookups?.campaignStatuses || []),
  ].map((item) => [String(item.status || ''), item.status_name || item.status]));
  const addDialStatusOptions = statusOptionsForCampaign(admin, form?.campaign_id, currentStatuses);
  const removeDialStatusOptions = [
    { value: '', label: '- NONE -' },
    ...currentStatuses.map((status) => ({
      value: status,
      label: `${status} - ${statusNameMap.get(status) || 'Campaign dial status'}`,
    })),
  ];

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

    if (mode !== 'editDetail') return basicFields;

    return [
      { section: 'Basic Campaign' },
      ...basicFields.map((field) => ({ ...field, disabled: field.key === 'campaign_id' || field.disabled })),
      { section: 'Dialing and Hopper' },
      { key: '_dial_status_list', label: 'Current Dial Statuses', type: 'statusList', statuses: currentStatuses, wide: true },
      { key: 'add_dial_status', label: 'Add A Dial Status to Call', type: 'select', options: addDialStatusOptions },
      { key: 'remove_dial_status', label: 'Remove Dial Status', type: 'select', options: removeDialStatusOptions },
      { key: 'allow_closers', label: 'Allow Closers', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'next_agent_call', label: 'Next Agent Call', type: 'select', options: enumOptions(ensureOption(NEXT_AGENT_CALL_OPTIONS, form?.next_agent_call)) },
      { key: 'dial_timeout', label: 'Dial Timeout', type: 'number' },
      { key: 'dial_prefix', label: 'Dial Prefix' },
      { key: 'campaign_cid', label: 'Campaign CID' },
      { key: 'available_only_ratio_tally', label: 'Available Only Tally', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'available_only_tally_threshold', label: 'Available Tally Threshold', type: 'select', options: enumOptions(ensureOption(TALLY_THRESHOLD_OPTIONS, form?.available_only_tally_threshold)) },
      { key: 'available_only_tally_threshold_agents', label: 'Available Threshold Agents', type: 'select', options: enumOptions(ensureOption(TALLY_AGENT_OPTIONS, form?.available_only_tally_threshold_agents)) },
      { key: 'dial_level_threshold', label: 'Dial Level Threshold', type: 'select', options: enumOptions(ensureOption(TALLY_THRESHOLD_OPTIONS, form?.dial_level_threshold)) },
      { key: 'dial_level_threshold_agents', label: 'Dial Threshold Agents', type: 'select', options: enumOptions(ensureOption(TALLY_AGENT_OPTIONS, form?.dial_level_threshold_agents)) },
      { key: 'adaptive_dropped_percentage', label: 'Adaptive Drop %', type: 'select', options: dropPercentOptions(form?.adaptive_dropped_percentage) },
      { key: 'adaptive_maximum_level', label: 'Adaptive Max Level', type: 'number', step: '0.1' },
      { key: 'adaptive_intensity', label: 'Adaptive Intensity', type: 'select', options: labeledNumberOptions(40, -40, (value) => `${value} - ${value < 0 ? 'Less Intense' : value > 0 ? 'More Intense' : 'Balanced'}`, form?.adaptive_intensity) },
      { key: 'adaptive_dl_diff_target', label: 'DL Diff Target', type: 'select', options: labeledNumberOptions(40, -40, (value) => `${value} - ${Math.abs(value)} ${value < 0 ? 'Agents Waiting' : value > 0 ? 'Calls Waiting' : 'Balanced'}`, form?.adaptive_dl_diff_target) },
      { key: 'dl_diff_target_method', label: 'DL Diff Target Method', type: 'select', options: enumOptions(ensureOption(['ADAPT_CALC_ONLY', 'CALLS_PLACED'], form?.dl_diff_target_method)) },
      { key: 'concurrent_transfers', label: 'Concurrent Transfers', type: 'select', options: enumOptions(ensureOption(CONCURRENT_TRANSFER_OPTIONS, form?.concurrent_transfers)) },
      { key: 'no_hopper_leads_logins', label: 'No Hopper Leads Logins', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'use_auto_hopper', label: 'Use Auto Hopper', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'auto_hopper_multi', label: 'Auto Hopper Multiplier', type: 'select', options: autoHopperMultiOptions(form?.auto_hopper_multi) },
      { key: 'auto_trim_hopper', label: 'Auto Trim Hopper', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'hopper_vlc_dup_check', label: 'Hopper VLC Dup Check', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
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
      { key: 'safe_harbor_exten', label: 'Safe Harbor Exten' },
      { key: 'safe_harbor_audio', label: 'Safe Harbor Audio', chooser: legacyCampaignHref, chooserLabel: 'Audio chooser' },
      { key: 'safe_harbor_audio_field', label: 'Safe Harbor Audio Field', type: 'select', options: enumOptions(ensureOption(LEAD_FIELD_OPTIONS, form?.safe_harbor_audio_field)) },
      { key: 'voicemail_ext', label: 'Voicemail', chooser: legacyCampaignHref, chooserLabel: 'Voicemail chooser' },
      { key: 'park_file_name', label: 'Park Music-on-Hold', chooser: legacyCampaignHref, chooserLabel: 'MOH chooser' },
      { key: 'use_internal_dnc', label: 'Internal DNC', type: 'select', options: enumOptions(['Y', 'N', 'AREACODE']) },
      { key: 'use_campaign_dnc', label: 'Campaign DNC', type: 'select', options: enumOptions(['Y', 'N', 'AREACODE']) },
      { key: 'use_custom_cid', label: 'Custom CallerID', type: 'select', options: enumOptions(ensureOption(CUSTOM_CID_OPTIONS, form?.use_custom_cid)) },
      { key: 'agent_search_method', label: 'Agent Search Override', type: 'select', options: [{ value: '', label: 'DISABLED' }, ...enumOptions(AGENT_SEARCH_OPTIONS.filter(Boolean))] },
      { key: 'agent_hangup_route', label: 'Agent Hangup Route', type: 'select', options: enumOptions(ensureOption(AGENT_HANGUP_ROUTE_OPTIONS, form?.agent_hangup_route)) },
      { key: 'agent_hangup_value', label: 'Agent Hangup Value', chooser: legacyCampaignHref, chooserLabel: 'Route chooser' },
      { key: 'ivr_park_call', label: 'Park Call IVR', type: 'select', options: enumOptions(ensureOption(PARK_CALL_IVR_OPTIONS, form?.ivr_park_call)) },
      { key: 'ivr_park_call_agi', label: 'Park IVR AGI' },
      { key: 'omit_phone_code', label: 'Omit Phone Code', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_pause_codes_active', label: 'Pause Codes Active', type: 'select', options: enumOptions(['Y', 'N', 'FORCE']) },
      { section: 'Recording, Scripts, and Forms' },
      { key: 'campaign_rec_exten', label: 'Recording Extension' },
      { key: 'campaign_rec_filename', label: 'Recording Filename', chooser: legacyCampaignHref, chooserLabel: 'Legacy recording tools' },
      { key: 'allcalls_delay', label: 'All Calls Delay', type: 'number' },
      { key: 'routing_initiated_recordings', label: 'Routing Initiated Recording', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'campaign_script', label: 'Script', type: scriptOptions.length ? 'select' : 'text', options: scriptOptions },
      { key: 'campaign_script_two', label: 'Second Script', type: scriptOptions.length ? 'select' : 'text', options: scriptOptions },
      { key: 'get_call_launch', label: 'Call Launch', type: 'select', options: enumOptions(['NONE', 'SCRIPT', 'SCRIPTTWO', 'WEBFORM', 'WEBFORMTWO', 'WEBFORMTHREE', 'FORM', 'PREVIEW_WEBFORM', 'PREVIEW_WEBFORMTWO', 'PREVIEW_WEBFORMTHREE', 'PREVIEW_SCRIPT', 'PREVIEW_SCRIPTTWO', 'PREVIEW_FORM']) },
      { key: 'timer_action', label: 'Timer Action', type: 'select', options: enumOptions(ensureOption(TIMER_ACTION_OPTIONS, form?.timer_action)) },
      { key: 'timer_action_message', label: 'Timer Message' },
      { key: 'timer_action_seconds', label: 'Timer Seconds', type: 'number' },
      { key: 'timer_action_destination', label: 'Timer Destination' },
      { key: 'web_form_target', label: 'Web Form Target' },
      { key: 'web_form_address', label: 'Web Form URL', type: 'textarea', wide: true },
      { key: 'web_form_address_two', label: 'Web Form URL 2', type: 'textarea', wide: true },
      { key: 'web_form_address_three', label: 'Web Form URL 3', type: 'textarea', wide: true },
      { key: 'start_call_url', label: 'Start Call URL', type: 'textarea', wide: true },
      { key: 'dispo_call_url', label: 'Dispo Call URL', type: 'textarea', wide: true },
      { key: 'na_call_url', label: 'No Agent URL', type: 'textarea', wide: true },
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
      { key: 'callback_days_limit', label: 'Callback Days Limit', type: 'number' },
      { key: 'callback_hours_block', label: 'Callback Hours Block', type: 'number' },
      { key: 'callback_list_calltime', label: 'Callback List Calltime', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'callback_active_limit', label: 'Callback Active Limit', type: 'number' },
      { key: 'callback_active_limit_override', label: 'Callback Limit Override', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'my_callback_option', label: 'My Callback Option', type: 'select', options: enumOptions(['CHECKED', 'UNCHECKED']) },
      { key: 'show_previous_callback', label: 'Show Previous Callback', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'next_dial_my_callbacks', label: 'Next Dial My Callbacks', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'callback_dnc', label: 'Callback DNC', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { section: 'Agent Screen and Limits' },
      { key: 'wrapup_seconds', label: 'Wrapup Seconds', type: 'number' },
      { key: 'wrapup_message', label: 'Wrapup Message' },
      { key: 'wrapup_bypass', label: 'Wrapup Bypass', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'pause_after_each_call', label: 'Pause After Each Call', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'pause_after_next_call', label: 'Pause After Next Call', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'owner_populate', label: 'Owner Populate', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
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
      { key: 'agent_hide_hangup', label: 'Hide Hangup', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'ready_max_logout', label: 'Ready Max Logout', type: 'number' },
      { key: 'max_logged_in_agents', label: 'Max Logged-In Agents', type: 'number' },
      { section: 'Compliance and Enhancements' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'per_call_notes', label: 'Per Call Notes', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'allow_emails', label: 'Allow Emails', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'allow_chats', label: 'Allow Chats', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'max_inbound_calls', label: 'Max Inbound Calls', type: 'number' },
      { key: 'hide_call_log_info', label: 'Hide Call Log Info', type: 'select', options: enumOptions(ensureOption(HIDE_CALL_LOG_OPTIONS, form?.hide_call_log_info)) },
      { key: 'clear_script', label: 'Clear Script', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'status_display_ingroup', label: 'Status Display Ingroup', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'mute_recordings', label: 'Mute Recordings', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'amd_type', label: 'AMD Type', type: 'select', options: enumOptions(['AMD', 'CPD', 'KHOMP', 'ViciAMD']) },
      { key: 'transfer_button_launch', label: 'Transfer Button Launch', type: 'select', options: enumOptions(ensureOption(TRANSFER_BUTTON_LAUNCH_OPTIONS, form?.transfer_button_launch)) },
      { key: 'shared_dial_rank', label: 'Shared Dial Rank', type: 'select', options: numberRangeOptions(0, 99, 1, form?.shared_dial_rank) },
      { key: 'call_limit_24hour_method', label: '24h Limit Method', type: 'select', options: enumOptions(['DISABLED', 'PHONE_NUMBER', 'LEAD']) },
      { key: 'call_limit_24hour_scope', label: '24h Limit Scope', type: 'select', options: enumOptions(['SYSTEM_WIDE', 'CAMPAIGN_LISTS']) },
      { key: 'call_limit_24hour', label: '24h Limit', type: 'number' },
      { key: 'call_limit_24hour_override', label: '24h Limit Override', type: 'select', options: enumOptions(ensureOption(['DISABLED', 'ENABLED'], form?.call_limit_24hour_override)) },
      { key: 'show_confetti', label: 'Confetti', type: 'select', options: enumOptions(['DISABLED', 'SALES', 'CALLBACKS', 'SALES_AND_CALLBACKS']) },
      { key: 'dead_stop_recording', label: 'Dead Stop Recording', type: 'select', options: enumOptions(ensureOption(DEAD_STOP_RECORDING_OPTIONS, form?.dead_stop_recording)) },
      { key: 'daily_phone_number_call_limit', label: 'Daily Phone Limit', type: 'number' },
      { key: 'call_log_days', label: 'Call Log Days', type: 'number' },
      { key: 'hangup_again_link', label: 'Hangup Again Link', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
    ];
  }

  if (entity === 'statuses' || entity === 'campaignStatuses') {
    return [
      ...(entity === 'campaignStatuses' ? [{ key: 'campaign_id', label: 'Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions, disabled: mode === 'edit' }] : []),
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
    return [
      { key: 'user', label: 'User ID', disabled: mode === 'edit' },
      { key: 'pass', label: mode === 'edit' ? 'New Password' : 'Password', type: 'password' },
      { key: 'full_name', label: 'Full Name' },
      { key: 'user_level', label: 'Level', type: 'select', options: enumOptions(ensureOption(USER_LEVEL_OPTIONS, form?.user_level)) },
      { key: 'user_group', label: 'User Group', type: userGroupOptions.length ? 'select' : 'text', options: userGroupOptions },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'email', label: 'Email' },
      { key: 'phone_login', label: 'Phone Login', type: phoneOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...phoneOptions], form?.phone_login) },
      { key: 'campaign_detail', label: 'Campaign Detail', type: 'select', options: flagOptions() },
      { key: 'view_reports', label: 'Reports', type: 'select', options: flagOptions() },
      { key: 'export_reports', label: 'Export Reports', type: 'select', options: flagOptions() },
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
      { key: 'access_recordings', label: 'Recordings Access', type: 'select', options: flagOptions() },
      { key: 'alter_admin_interface_options', label: 'Admin UI Options', type: 'select', options: flagOptions() },
      { key: 'modify_settings_containers', label: 'Settings Containers', type: 'select', options: enumOptions(['0', '1', '2', '3', '4', '5', '6']) },
    ];
  }

  if (entity === 'lists') {
    return [
      { key: 'list_id', label: 'List ID', disabled: mode === 'edit' },
      { key: 'list_name', label: 'List Name' },
      { key: 'campaign_id', label: 'Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'list_description', label: 'Description', wide: true },
      { key: 'local_call_time', label: 'Call Time', type: callTimeOptions.length ? 'select' : 'text', options: [{ value: 'campaign', label: 'campaign' }, ...callTimeOptions] },
      { key: 'expiration_date', label: 'Expiration', type: 'date' },
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
      { key: 'forced_timeclock_login', label: 'Forced Timeclock', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'shift_enforcement', label: 'Shift Enforcement', type: 'select', options: enumOptions(['OFF', 'START', 'ALL']) },
      { key: 'agent_status_view_time', label: 'Status View Time', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_call_log_view', label: 'Agent Call Log', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'allowed_custom_reports', label: 'Custom Reports', type: 'multiSelectText', options: reportScopeOptions, values: reportScopeValues, serialize: reportScopeText, wide: true },
      { key: 'reports_header_override', label: 'Reports Header Override' },
      { key: 'admin_home_url', label: 'Admin Home URL', wide: true },
    ];
  }

  if (entity === 'dids') {
    return [
      { key: 'did_pattern', label: 'DID Pattern', disabled: mode === 'edit' },
      { key: 'did_description', label: 'Description' },
      { key: 'did_active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'did_route', label: 'DID Route', type: 'select', options: enumOptions(['EXTEN', 'VOICEMAIL', 'PHONE', 'USER', 'IN_GROUP', 'CALLMENU']) },
      { key: 'group_id', label: 'In-Group', type: inboundStrictOptions.length ? 'select' : 'text', options: inboundStrictOptions },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'extension', label: 'Extension' },
      { key: 'exten_context', label: 'Context', type: phoneContextOptions.length ? 'select' : 'text', options: phoneContextOptions },
      { key: 'server_ip', label: 'Server', type: serverOptions.length ? 'select' : 'text', options: serverOptions },
      { key: 'phone', label: 'Phone', type: phoneOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...phoneOptions], form?.phone) },
      { key: 'user', label: 'User', type: userOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...userOptions], form?.user) },
      { key: 'voicemail_ext', label: 'Voicemail Ext', chooser: '/vicidial/admin.php?ADD=170000000000', chooserLabel: 'Voicemail chooser' },
      { key: 'record_call', label: 'Record Call', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'inbound_route_answer', label: 'Answer Route', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'call_handle_method', label: 'Call Handle Method', type: 'select', options: enumOptions(['CID', 'CIDLOOKUP', 'CIDLOOKUPRL', 'ANI', 'DID']) },
      { key: 'agent_search_method', label: 'Agent Search', type: 'select', options: enumOptions(['LB', 'LO', 'SO', 'RANDOM', 'CLOSER', 'STICKY']) },
      { section: 'Fallback and Filters' },
      { key: 'user_unavailable_action', label: 'User Unavailable', type: 'select', options: enumOptions(['VOICEMAIL', 'IN_GROUP', 'EXTEN', 'PHONE', 'HANGUP']) },
      { key: 'user_route_settings_ingroup', label: 'Unavailable In-Group', type: inboundOptions.length ? 'select' : 'text', options: inboundOptions },
      { key: 'campaign_id', label: 'Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions },
      { key: 'list_id', label: 'List ID', type: listOptions.length ? 'select' : 'text', options: withCurrentOption([{ value: '', label: 'NONE' }, ...listOptions], form?.list_id) },
      { key: 'phone_code', label: 'Phone Code', type: phoneCodeOptions.length ? 'select' : 'text', options: phoneCodeOptions },
      { key: 'menu_id', label: 'Call Menu', type: callMenuOptions.length > 1 ? 'select' : 'text', options: withCurrentOption(callMenuOptions, form?.menu_id) },
      { key: 'filter_inbound_number', label: 'Filter Inbound Number' },
      { key: 'filter_action', label: 'Filter Action', type: 'select', options: enumOptions(['DISABLED', 'EXTEN', 'VOICEMAIL', 'PHONE', 'IN_GROUP', 'CALLMENU']) },
      { key: 'filter_extension', label: 'Filter Extension', chooser: '/vicidial/admin.php?ADD=170000000000', chooserLabel: 'Voicemail chooser' },
      { key: 'filter_group_id', label: 'Filter In-Group', type: inboundOptions.length ? 'select' : 'text', options: inboundOptions },
      { key: 'filter_campaign_id', label: 'Filter Campaign', type: campaignOptions.length ? 'select' : 'text', options: campaignOptions },
      { key: 'filter_menu_id', label: 'Filter Menu', type: callMenuOptions.length > 1 ? 'select' : 'text', options: withCurrentOption(callMenuOptions, form?.filter_menu_id) },
      { key: 'did_carrier_description', label: 'Carrier Description' },
      { key: 'alter_cid_name', label: 'Alter CID Name' },
    ];
  }

  if (entity === 'phones') {
    return [
      { key: 'extension', label: 'Extension', disabled: mode === 'edit' },
      { key: 'server_ip', label: 'Server', type: serverOptions.length ? 'select' : 'text', options: serverOptions, disabled: mode === 'edit' },
      { key: 'fullname', label: 'Full Name' },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'status', label: 'Phone Status', type: 'select', options: enumOptions(ensureOption(['ACTIVE', 'SUSPENDED', 'CLOSED', 'PENDING'], form?.status)) },
      { key: 'protocol', label: 'Protocol', type: 'select', options: enumOptions(['SIP', 'Zap', 'IAX2', 'EXTERNAL']) },
      { key: 'phone_type', label: 'Phone Type', type: 'select', options: enumOptions(['SIP', 'Zap', 'IAX2', 'EXTERNAL']) },
      { key: 'login', label: 'Login' },
      { key: 'pass', label: mode === 'edit' ? 'New Phone Password' : 'Phone Password', type: 'password' },
      { key: 'dialplan_number', label: 'Dialplan Number' },
      { key: 'voicemail_id', label: 'Voicemail ID' },
      { key: 'phone_ip', label: 'Phone IP' },
      { key: 'computer_ip', label: 'Computer IP' },
      { key: 'local_gmt', label: 'Local GMT', type: 'select', options: enumOptions(ensureOption(GMT_OPTIONS, form?.local_gmt)) },
      { key: 'outbound_cid', label: 'Outbound CID' },
      { key: 'email', label: 'Email' },
      { key: 'template_id', label: 'Template ID' },
      { key: 'phone_context', label: 'Phone Context', type: phoneContextOptions.length ? 'select' : 'text', options: phoneContextOptions },
      { key: 'phone_ring_timeout', label: 'Ring Timeout', type: 'number' },
      { key: 'conf_secret', label: 'Conf Secret' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { section: 'Webphone' },
      { key: 'is_webphone', label: 'Webphone', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'webphone_auto_answer', label: 'Auto Answer', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'webphone_dialpad', label: 'Dialpad', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'webphone_dialbox', label: 'Dialbox', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'webphone_mute', label: 'Mute Control', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'webphone_volume', label: 'Volume', type: 'number' },
      { key: 'webphone_debug', label: 'Debug', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'webphone_settings', label: 'Webphone Settings', type: 'textarea', wide: true },
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

  if (entity === 'callTimes') {
    return [
      { key: 'call_time_id', label: 'Call Time ID', disabled: mode === 'edit' },
      { key: 'call_time_name', label: 'Call Time Name' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { key: 'call_time_comments', label: 'Comments', wide: true },
      { section: 'Default Hours' },
      { key: 'ct_default_start', label: 'Default Start', type: 'number' },
      { key: 'ct_default_stop', label: 'Default Stop', type: 'number' },
      { key: 'default_afterhours_filename_override', label: 'Default Afterhours Audio', wide: true, chooser: legacyCallTimeHref, chooserLabel: 'Audio chooser' },
      { section: 'Daily Hours' },
      { key: 'ct_sunday_start', label: 'Sunday Start', type: 'number' },
      { key: 'ct_sunday_stop', label: 'Sunday Stop', type: 'number' },
      { key: 'sunday_afterhours_filename_override', label: 'Sunday Audio', chooser: legacyCallTimeHref, chooserLabel: 'Audio chooser' },
      { key: 'ct_monday_start', label: 'Monday Start', type: 'number' },
      { key: 'ct_monday_stop', label: 'Monday Stop', type: 'number' },
      { key: 'monday_afterhours_filename_override', label: 'Monday Audio', chooser: legacyCallTimeHref, chooserLabel: 'Audio chooser' },
      { key: 'ct_tuesday_start', label: 'Tuesday Start', type: 'number' },
      { key: 'ct_tuesday_stop', label: 'Tuesday Stop', type: 'number' },
      { key: 'tuesday_afterhours_filename_override', label: 'Tuesday Audio', chooser: legacyCallTimeHref, chooserLabel: 'Audio chooser' },
      { key: 'ct_wednesday_start', label: 'Wednesday Start', type: 'number' },
      { key: 'ct_wednesday_stop', label: 'Wednesday Stop', type: 'number' },
      { key: 'wednesday_afterhours_filename_override', label: 'Wednesday Audio', chooser: legacyCallTimeHref, chooserLabel: 'Audio chooser' },
      { key: 'ct_thursday_start', label: 'Thursday Start', type: 'number' },
      { key: 'ct_thursday_stop', label: 'Thursday Stop', type: 'number' },
      { key: 'thursday_afterhours_filename_override', label: 'Thursday Audio', chooser: legacyCallTimeHref, chooserLabel: 'Audio chooser' },
      { key: 'ct_friday_start', label: 'Friday Start', type: 'number' },
      { key: 'ct_friday_stop', label: 'Friday Stop', type: 'number' },
      { key: 'friday_afterhours_filename_override', label: 'Friday Audio', chooser: legacyCallTimeHref, chooserLabel: 'Audio chooser' },
      { key: 'ct_saturday_start', label: 'Saturday Start', type: 'number' },
      { key: 'ct_saturday_stop', label: 'Saturday Stop', type: 'number' },
      { key: 'saturday_afterhours_filename_override', label: 'Saturday Audio', chooser: legacyCallTimeHref, chooserLabel: 'Audio chooser' },
      { section: 'States and Holidays' },
      { key: 'ct_state_call_times', label: 'State Call Times', type: 'textarea', wide: true },
      { key: 'ct_holidays', label: 'Holidays', type: 'textarea', wide: true },
    ];
  }

  if (entity === 'callMenus') {
    return [
      { key: 'menu_id', label: 'Menu ID', disabled: mode === 'edit' },
      { key: 'menu_name', label: 'Menu Name' },
      { key: 'user_group', label: 'User Group', type: userGroupAllOptions.length ? 'select' : 'text', options: userGroupAllOptions },
      { section: 'Prompts and Timing' },
      { key: 'menu_prompt', label: 'Menu Prompt', chooser: legacyCallMenuHref, chooserLabel: 'Audio chooser' },
      { key: 'menu_timeout', label: 'Timeout Seconds', type: 'number' },
      { key: 'menu_timeout_prompt', label: 'Timeout Prompt', chooser: legacyCallMenuHref, chooserLabel: 'Audio chooser' },
      { key: 'menu_invalid_prompt', label: 'Invalid Prompt', chooser: legacyCallMenuHref, chooserLabel: 'Audio chooser' },
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
      { key: 'custom_dialplan_entry', label: 'Custom Dialplan Entry', type: 'textarea', wide: true },
      { key: 'qualify_sql', label: 'Qualify SQL', type: 'textarea', wide: true },
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
    { key: 'group_id', label: 'Group ID', disabled: mode === 'edit' },
    { key: 'group_name', label: 'Group Name' },
    { key: 'group_color', label: 'Color', type: 'select', options: enumOptions(ensureOption(ADMIN_COLOR_OPTIONS, form?.group_color)) },
    { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
    { key: 'next_agent_call', label: 'Routing', type: 'select', options: enumOptions(ensureOption(NEXT_AGENT_CALL_OPTIONS, form?.next_agent_call)) },
    { key: 'queue_priority', label: 'Priority', type: 'select', options: labeledNumberOptions(99, -99, (value) => `${value} - ${value < 0 ? 'Lower' : value > 0 ? 'Higher' : 'Even'}`, form?.queue_priority) },
    { key: 'drop_call_seconds', label: 'Drop Seconds', type: 'number' },
    { key: 'drop_action', label: 'Drop Action', type: 'select', options: ['HANGUP', 'MESSAGE', 'VOICEMAIL', 'IN_GROUP', 'CALLMENU', 'VMAIL_NO_INST'].map((value) => ({ value, label: value })) },
    { key: 'call_time_id', label: 'Call Time', type: callTimeOptions.length ? 'select' : 'text', options: callTimeOptions },
    { key: 'play_welcome_message', label: 'Welcome', type: 'select', options: ['ALWAYS', 'NEVER', 'IF_WAIT_ONLY', 'YES_UNLESS_NODELAY'].map((value) => ({ value, label: value })) },
    { key: 'no_agent_action', label: 'No Agent', type: 'select', options: ['CALLMENU', 'INGROUP', 'DID', 'MESSAGE', 'EXTENSION', 'VOICEMAIL', 'VMAIL_NO_INST'].map((value) => ({ value, label: value })) },
    { key: 'group_handling', label: 'Handling', type: 'select', options: ['PHONE', 'EMAIL', 'CHAT'].map((value) => ({ value, label: value })) },
  ];
}

function entityLabel(entity) {
  return {
    campaigns: 'Campaign',
    campaignCopy: 'Campaign Copy',
    users: 'User',
    userGroups: 'User Group',
    lists: 'List',
    inbound: 'Inbound Group',
    dids: 'DID',
    callMenus: 'Call Menu',
    phones: 'Phone',
    scripts: 'Script',
    leadFilters: 'Lead Filter',
    callTimes: 'Call Time',
    shifts: 'Shift',
    statuses: 'System Status',
    campaignStatuses: 'Campaign Status',
  }[entity] || 'Record';
}

function entityId(entity, row) {
  return {
    campaigns: row.campaign_id,
    campaignCopy: row.campaign_id,
    users: row.user,
    userGroups: row.user_group,
    lists: row.list_id,
    inbound: row.group_id,
    dids: row.did_pattern,
    callMenus: row.menu_id,
    phones: `${row.extension}__${row.server_ip}`,
    scripts: row.script_id,
    leadFilters: row.lead_filter_id,
    callTimes: row.call_time_id,
    shifts: row.shift_id,
    statuses: row.status,
    campaignStatuses: row.status,
  }[entity];
}

function entityPath(entity) {
  return {
    userGroups: 'user-groups',
    leadFilters: 'lead-filters',
    callTimes: 'call-times',
    callMenus: 'call-menus',
    campaignStatuses: 'campaign-statuses',
  }[entity] || entity;
}

function ActionModal({ action, admin, token, onClose, onSaved, onLogout }) {
  const [form, setForm] = useState(() => ({ ...actionDefaults(action.entity, admin), ...(action.row || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mode = action.mode || 'create';
  const fields = actionFields(action.entity, mode, admin, form);
  const label = entityLabel(action.entity);
  const isEdit = mode === 'edit' || mode === 'editDetail';
  const isDetail = mode === 'editDetail';
  const isCopy = action.entity === 'campaignCopy';

  useEffect(() => {
    setForm({ ...actionDefaults(action.entity, admin), ...(action.row || {}), pass: '' });
    setError('');
  }, [action, admin]);

  async function submit(event) {
    event.preventDefault();
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
      onClose();
    } catch (requestError) {
      if (requestError.status === 401) {
        onLogout();
        return;
      }
      setError(requestError.status === 403 ? 'Your VICIdial user does not have permission for this change' : 'The change was not saved');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation">
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

        <form className="entity-form" onSubmit={submit}>
          <div className="field-grid">
            {fields.map((field) => (
              field.section ? (
                <div key={field.section} className="form-section">{field.section}</div>
              ) : (
                <label key={field.key} className={field.wide ? 'wide-field' : ''}>
                  <span>{field.label}</span>
                  {field.type === 'statusList' ? (
                    <div className="status-chip-list">
                      {(field.statuses || []).map((status) => (
                        <span key={status}>{status}</span>
                      ))}
                      {!(field.statuses || []).length && <em>No dial statuses selected</em>}
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
                  {field.chooser && (
                    <a
                      className="field-link"
                      href={typeof field.chooser === 'function' ? field.chooser(form) : field.chooser}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <ExternalLink size={13} aria-hidden="true" />
                      {field.chooserLabel || 'Open chooser'}
                    </a>
                  )}
                </label>
              )
            ))}
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="secondary-action" onClick={onClose}>Cancel</button>
            <button type="submit" className="primary-action" disabled={saving}>
              <Save size={18} aria-hidden="true" />
              {saving ? 'Saving' : 'Save'}
            </button>
          </div>
        </form>
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

function ActionBar({ entity, label, user, onAction, children, extraActions = null }) {
  return (
    <div className="action-bar">
      <div>{children}</div>
      <div className="action-buttons">
        {extraActions}
        {userCan(user, entity) && (
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
  const max = Math.max(...data.map((item) => item.calls), 1);
  const hourLabels = new Set(['0', '6', '12', '18', '23']);

  return (
    <section className="panel chart-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">{rangeLabel}</p>
          <h2>Call Flow</h2>
        </div>
        <BarChart3 size={22} aria-hidden="true" />
      </div>
      <div className="bar-chart" style={{ '--bar-count': Math.max(data.length, 1) }} aria-label="Calls by range">
        {data.map((item, index) => {
          const label = item.label ?? String(item.hour ?? index);
          const showLabel = data.length <= 12 || hourLabels.has(label) || index === data.length - 1;
          return (
            <div className="bar-column" key={item.key || label}>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ height: `${Math.max(4, (item.calls / max) * 100)}%` }}
                  title={`${item.calls} calls`}
                />
              </div>
              <span>{showLabel ? label : ''}</span>
            </div>
          );
        })}
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

function Panel({ eyebrow, title, icon: Icon, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-title">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h2>{title}</h2>
        </div>
        {Icon && <Icon size={22} aria-hidden="true" />}
      </div>
      {children}
    </section>
  );
}

function AgentList({ agents }) {
  return (
    <Panel eyebrow="Live Agents" title="Floor State" icon={Headphones} className="agent-panel">
      <div className="agent-list">
        {agents.map((agent) => (
          <article className="agent-row" key={`${agent.user}-${agent.campaign_id}`}>
            <div className="agent-avatar">{String(agent.user || '?').slice(0, 2).toUpperCase()}</div>
            <div className="agent-copy">
              <strong>{agent.user}</strong>
              <span>{agent.campaign_id || 'No campaign'} | {durationLabel(agent.last_call_time)}</span>
            </div>
            <StatusPill ok={agent.status !== 'PAUSED'}>
              {agent.status || agent.pause_code || 'Ready'}
            </StatusPill>
          </article>
        ))}
        {!agents.length && <div className="empty-state">No agents are live right now</div>}
      </div>
    </Panel>
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

function CommandView({ dashboard }) {
  const metrics = dashboard?.metrics || {};
  const rangeLabel = dashboard?.range?.label || 'Today';

  const metricCards = [
    {
      icon: Users,
      label: 'Agents Live',
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
      icon: LayoutDashboard,
      label: 'Campaigns',
      value: formatNumber(metrics.campaignsActive),
      detail: `${formatNumber(metrics.campaignsTotal)} configured`,
      accent: '#73fbd3',
    },
    {
      icon: Database,
      label: 'Lead Pool',
      value: formatNumber(metrics.leadsTotal),
      detail: `${formatNumber(metrics.listsActive)} active lists`,
      accent: '#a8c7ff',
    },
    {
      icon: Activity,
      label: 'Inbound Groups',
      value: formatNumber(metrics.inboundGroupsActive),
      detail: `${formatNumber(metrics.recordingsToday)} recordings today`,
      accent: '#ffd166',
    },
  ];

  return (
    <>
      <section className="metric-grid" aria-label="Operations metrics">
        {metricCards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </section>

      <section className="content-grid">
        <ActivityChart data={dashboard?.hourlyCalls || []} rangeLabel={rangeLabel} />
        <AgentList agents={dashboard?.agents || []} />
        <CampaignPerformance rows={dashboard?.campaignPerformance || []} />
        <BreakdownPanel
          eyebrow="Call Outcomes"
          title="Status Mix"
          icon={Gauge}
          items={dashboard?.statusBreakdown || []}
          valueKey="calls"
          labelKey="status"
          emptyLabel="No call statuses in this range"
        />
        <BreakdownPanel
          eyebrow="Lead Inventory"
          title="Lead Status"
          icon={Activity}
          items={dashboard?.leadStatusBreakdown || []}
          valueKey="leads"
          labelKey="status"
          emptyLabel="No leads returned"
        />
        <CampaignTable campaigns={dashboard?.campaigns || []} />
      </section>
    </>
  );
}

function AdminSummary({ admin }) {
  const counts = admin?.counts || {};
  const cards = [
    { icon: Radio, label: 'Campaigns', value: counts.activeCampaigns, detail: `${formatNumber(counts.campaigns)} total`, accent: '#00d9ff' },
    { icon: Users, label: 'Users', value: counts.activeUsers, detail: `${formatNumber(counts.users)} total`, accent: '#73fbd3' },
    { icon: ShieldCheck, label: 'Groups', value: counts.userGroups, detail: 'Permission scopes', accent: '#ff8bd1' },
    { icon: Database, label: 'Lists', value: counts.activeLists, detail: `${formatNumber(counts.lists)} total`, accent: '#a8c7ff' },
    { icon: Headphones, label: 'Inbound', value: counts.activeInboundGroups, detail: `${formatNumber(counts.inboundGroups)} total`, accent: '#ffd166' },
    { icon: PhoneCall, label: 'DIDs', value: counts.activeDids, detail: `${formatNumber(counts.dids)} total`, accent: '#00ffa8' },
    { icon: PhoneCall, label: 'Phones', value: counts.activePhones, detail: `${formatNumber(counts.phones)} total`, accent: '#b9f2ff' },
    { icon: FileText, label: 'Scripts', value: counts.activeScripts, detail: `${formatNumber(counts.scripts)} total`, accent: '#c7a8ff' },
    { icon: SlidersHorizontal, label: 'Filters', value: counts.leadFilters, detail: 'Lead filter rules', accent: '#ffdf7b' },
    { icon: Timer, label: 'Call Times', value: counts.callTimes, detail: 'Dialing windows', accent: '#ff9f7b' },
    { icon: Server, label: 'Servers', value: counts.activeServers, detail: `${formatNumber(counts.servers)} total`, accent: '#7bb7ff' },
    { icon: PhoneCall, label: 'Carriers', value: counts.activeCarriers, detail: `${formatNumber(counts.carriers)} total`, accent: '#2d7dff' },
  ];

  return (
    <section className="metric-grid admin-metric-grid" aria-label="Admin metrics">
      {cards.map((card) => (
        <MetricCard key={card.label} {...card} />
      ))}
    </section>
  );
}

function CampaignsView({ admin, user, onAction }) {
  const campaigns = admin?.campaigns || [];
  const totalLeads = campaigns.reduce((sum, row) => sum + Number(row.lead_count || 0), 0);
  const canManage = userCan(user, 'campaigns');
  const canDetail = Number(user?.userLevel || 0) >= 9 || Boolean(user?.campaignDetail);

  return (
    <>
      <AdminSummary admin={admin} />
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
        <Panel eyebrow="Campaign Tools" title="Classic Subsections" icon={SlidersHorizontal}>
          <div className="tool-grid">
            {[
              ['Statuses', 'status_count', 'ADD=32'],
              ['HotKeys', 'hotkey_count', 'ADD=33'],
              ['Lead Recycle', 'recycle_count', 'ADD=35'],
              ['Auto Alt Dial', 'auto_alt_dial', 'ADD=36'],
              ['List Mix', 'mix_count', 'ADD=39'],
              ['Pause Codes', 'pause_count', 'ADD=37'],
              ['Presets', 'enable_xfer_presets', 'ADD=301'],
              ['AC-CID', 'use_custom_cid', 'ADD=302'],
            ].map(([label, key, legacyAdd]) => (
              <div className="tool-tile" key={label}>
                <span>{label}</span>
                <strong>{formatNumber(typeof campaigns[0]?.[key] === 'number' ? campaigns.reduce((sum, row) => sum + Number(row[key] || 0), 0) : campaigns.filter((row) => row[key] && row[key] !== 'N' && row[key] !== 'NONE' && row[key] !== 'DISABLED').length)}</strong>
                <a href={`/vicidial/admin.php?${legacyAdd}`} target="_blank" rel="noreferrer">Open legacy</a>
              </div>
            ))}
          </div>
        </Panel>
        <Panel eyebrow="Inventory" title="Lead Distribution" icon={Database}>
          <div className="breakdown-list">
            {campaigns.slice(0, 10).map((row) => {
              const pct = percent(row.lead_count, totalLeads);
              return (
                <div className="breakdown-row" key={row.campaign_id}>
                  <div className="breakdown-copy">
                    <strong>{row.campaign_id}</strong>
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

function UsersView({ admin, user, onAction }) {
  const users = admin?.users || [];
  const canManage = userCan(user, 'users');

  return (
    <>
      <AdminSummary admin={admin} />
      <ActionBar entity="users" label="User" user={user} onAction={onAction}>
        <p className="action-copy">Add operators and control the common VICIdial permission flags from GenX.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="User Admin" title="Users and Permissions" icon={Users} className="admin-wide-panel">
          <DataTable
            emptyLabel="No users returned"
            rows={users.map((row) => ({ ...row, id: row.user }))}
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
        <Panel eyebrow="Access" title="Permission Mix" icon={ShieldCheck}>
          <div className="quick-stack">
            <MetricCard icon={ShieldCheck} label="Report Access" value={formatNumber(users.filter((row) => row.view_reports === '1').length)} detail="Users can view reports" accent="#00d9ff" />
            <MetricCard icon={Radio} label="Campaign Editors" value={formatNumber(users.filter((row) => row.modify_campaigns === '1').length)} detail="Can modify campaigns" accent="#73fbd3" />
          </div>
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
      <AdminSummary admin={admin} />
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

function InboundView({ admin, user, onAction }) {
  const groups = admin?.inboundGroups || [];
  const canManage = userCan(user, 'inbound');

  return (
    <>
      <AdminSummary admin={admin} />
      <ActionBar entity="inbound" label="In-Group" user={user} onAction={onAction}>
        <p className="action-copy">Build inbound groups and tune queue basics from the GenX control layer.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Inbound Admin" title="Inbound Group Routing" icon={Headphones} className="admin-wide-panel">
          <DataTable
            emptyLabel="No inbound groups configured"
            rows={groups.map((row) => ({ ...row, id: row.group_id }))}
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
        <Panel eyebrow="Queue" title="Routing Health" icon={Gauge}>
          <div className="quick-stack">
            <MetricCard icon={Headphones} label="Active Groups" value={formatNumber(groups.filter((row) => row.active === 'Y').length)} detail={`${formatNumber(groups.length)} configured`} accent="#00d9ff" />
            <MetricCard icon={Timer} label="Drop Rules" value={formatNumber(groups.filter((row) => Number(row.drop_call_seconds || 0) > 0).length)} detail="Groups with drop timing" accent="#ffd166" />
          </div>
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
      <AdminSummary admin={admin} />
      <ActionBar entity="userGroups" label="Group" user={user} onAction={onAction}>
        <p className="action-copy">Control campaign access, report access, queue visibility, and manager scope from the GenX permission layer.</p>
      </ActionBar>
      <section className="admin-grid">
        <Panel eyebrow="Access" title="User Groups and Scope" icon={ShieldCheck} className="admin-wide-panel">
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
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('userGroups', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel eyebrow="Scope" title="Access Snapshot" icon={ShieldCheck}>
          <div className="quick-stack">
            <MetricCard icon={Radio} label="All Campaign Groups" value={formatNumber(groups.filter((row) => String(row.allowed_campaigns || '').includes('ALL')).length)} detail="Groups with broad campaign scope" accent="#00d9ff" />
            <MetricCard icon={FileText} label="All Report Groups" value={formatNumber(groups.filter((row) => String(row.allowed_reports || '').toUpperCase().includes('ALL')).length)} detail="Groups with broad report scope" accent="#73fbd3" />
          </div>
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
      <AdminSummary admin={admin} />
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
        <Panel eyebrow="Routing" title="DID Mix" icon={Gauge}>
          <div className="quick-stack">
            <MetricCard icon={PhoneCall} label="Active DIDs" value={formatNumber(dids.filter((row) => row.did_active === 'Y').length)} detail={`${formatNumber(dids.length)} configured`} accent="#00d9ff" />
            <MetricCard icon={Headphones} label="Group Routes" value={formatNumber(dids.filter((row) => row.did_route === 'IN_GROUP').length)} detail="Route into inbound groups" accent="#73fbd3" />
          </div>
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
      <AdminSummary admin={admin} />
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
        <Panel eyebrow="Endpoints" title="Phone Mix" icon={Activity}>
          <div className="quick-stack">
            <MetricCard icon={PhoneCall} label="Active Phones" value={formatNumber(phones.filter((row) => row.active === 'Y').length)} detail={`${formatNumber(phones.length)} configured`} accent="#00d9ff" />
            <MetricCard icon={Headphones} label="Webphones" value={formatNumber(phones.filter((row) => row.is_webphone === 'Y').length)} detail="Browser phone endpoints" accent="#73fbd3" />
          </div>
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
      <AdminSummary admin={admin} />
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
        <Panel eyebrow="Usage" title="Script Mix" icon={Activity}>
          <div className="quick-stack">
            <MetricCard icon={FileText} label="Active Scripts" value={formatNumber(scripts.filter((row) => row.active === 'Y').length)} detail={`${formatNumber(scripts.length)} configured`} accent="#00d9ff" />
            <MetricCard icon={ShieldCheck} label="Scoped Scripts" value={formatNumber(scripts.filter((row) => row.user_group && row.user_group !== '---ALL---').length)} detail="Assigned to a group" accent="#73fbd3" />
          </div>
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
      <AdminSummary admin={admin} />
      <ActionBar entity="leadFilters" label="Filter" user={user} onAction={onAction}>
        <p className="action-copy">Manage VICIdial lead filter rules used by campaigns and manual dialing controls.</p>
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
        <Panel eyebrow="Rules" title="Filter Mix" icon={Database}>
          <div className="quick-stack">
            <MetricCard icon={SlidersHorizontal} label="Lead Filters" value={formatNumber(filters.length)} detail="Configured filters" accent="#00d9ff" />
            <MetricCard icon={ShieldCheck} label="Scoped Filters" value={formatNumber(filters.filter((row) => row.user_group && row.user_group !== '---ALL---').length)} detail="Assigned to a group" accent="#73fbd3" />
          </div>
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
      <AdminSummary admin={admin} />
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
        <Panel eyebrow="Windows" title="Call Time Mix" icon={Clock3}>
          <div className="quick-stack">
            <MetricCard icon={Timer} label="Call Times" value={formatNumber(callTimes.length)} detail="Configured windows" accent="#00d9ff" />
            <MetricCard icon={CalendarDays} label="Holiday Rules" value={formatNumber(callTimes.filter((row) => String(row.ct_holidays || '').trim()).length)} detail="Call times with holidays" accent="#73fbd3" />
          </div>
        </Panel>
      </section>
    </>
  );
}

function CallMenusView({ admin, user, onAction }) {
  const menus = admin?.callMenus || [];
  const canManage = userCan(user, 'callMenus');

  return (
    <>
      <AdminSummary admin={admin} />
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
              ...(canManage ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('callMenus', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
        <Panel eyebrow="Routing" title="Call Menu Mix" icon={PhoneCall}>
          <div className="quick-stack">
            <MetricCard icon={Compass} label="Call Menus" value={formatNumber(menus.length)} detail="Configured menus" accent="#00d9ff" />
            <MetricCard icon={Clock3} label="Time Checked" value={formatNumber(menus.filter((row) => row.menu_time_check === '1').length)} detail="Menus with call-time logic" accent="#73fbd3" />
          </div>
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
      <AdminSummary admin={admin} />
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
        <Panel eyebrow="Coverage" title="Shift Mix" icon={CalendarDays}>
          <div className="quick-stack">
            <MetricCard icon={Clock3} label="Shifts" value={formatNumber(shifts.length)} detail="Configured windows" accent="#00d9ff" />
            <MetricCard icon={ShieldCheck} label="Scoped Shifts" value={formatNumber(shifts.filter((row) => row.user_group && row.user_group !== '---ALL---').length)} detail="Assigned to a group" accent="#73fbd3" />
          </div>
        </Panel>
      </section>
    </>
  );
}

function StatusesView({ admin, user, onAction }) {
  const statuses = admin?.statuses || [];
  const campaignStatuses = admin?.campaignStatuses || [];
  const canManageSystem = userCan(user, 'statuses');
  const canManageCampaign = userCan(user, 'campaignStatuses');

  return (
    <>
      <AdminSummary admin={admin} />
      <ActionBar
        entity="statuses"
        label="System Status"
        user={user}
        onAction={onAction}
        extraActions={canManageCampaign ? (
          <button type="button" className="secondary-action compact-action" onClick={() => onAction('campaignStatuses', 'create')}>
            <Plus size={17} aria-hidden="true" />
            Add Campaign Status
          </button>
        ) : null}
      >
        <p className="action-copy">Manage system and campaign disposition codes, reporting categories, callbacks, DNC, sale flags, and contact outcomes.</p>
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
        <Panel eyebrow="Campaign" title="Campaign Statuses" icon={Radio} className="admin-wide-panel">
          <DataTable
            emptyLabel="No campaign statuses returned"
            rows={campaignStatuses.map((row) => ({ ...row, id: `${row.campaign_id}-${row.status}` }))}
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
              { key: 'campaign_id', label: 'Campaign', render: (row) => row.campaign_id },
              { key: 'category', label: 'Category', render: (row) => row.category || 'UNDEFINED' },
              { key: 'selectable', label: 'Selectable', render: (row) => <StatusPill ok={row.selectable === 'Y'}>{row.selectable === 'Y' ? 'Yes' : 'No'}</StatusPill> },
              { key: 'sale', label: 'Sale', render: (row) => row.sale || 'N' },
              { key: 'dnc', label: 'DNC', render: (row) => row.dnc || 'N' },
              ...(canManageCampaign ? [{ key: 'actions', label: 'Action', render: (row) => <ManageButton onClick={() => onAction('campaignStatuses', 'edit', row)} /> }] : []),
            ]}
          />
        </Panel>
      </section>
    </>
  );
}

function CatalogPanels({ groups, query, emptyLabel }) {
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
        <Panel key={group.title} eyebrow="VICIdial" title={group.title} icon={ExternalLink}>
          <div className="link-list">
            {group.items.map((item) => (
              <a key={`${group.title}-${item.label}`} className="launch-link" href={item.href} target="_blank" rel="noreferrer">
                <span>{item.label}</span>
                <ExternalLink size={15} aria-hidden="true" />
              </a>
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

function reportGroupsForUser(user) {
  const scope = user?.permissions?.allowedReports;
  if (Number(user?.userLevel || 0) >= 9 || scope?.all) return REPORT_GROUPS;
  if (!user?.viewReports) return [];
  const allowed = (scope?.values || []).map((value) => value.toLowerCase());
  if (!allowed.length) return REPORT_GROUPS;
  return REPORT_GROUPS
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

function ReportsView({ dashboard, admin, user }) {
  const [query, setQuery] = useState('');
  const metrics = dashboard?.metrics || {};
  const reportGroups = reportGroupsForUser(user);
  const visibleReportCount = reportGroups.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      <section className="metric-grid admin-metric-grid" aria-label="Report metrics">
        <MetricCard icon={FileText} label="Report Links" value={formatNumber(visibleReportCount)} detail="Reviewed VICIdial report entries" accent="#00d9ff" />
        <MetricCard icon={PhoneCall} label="Calls Today" value={formatNumber(metrics.callsToday)} detail={`${formatNumber(metrics.outboundCalls)} outbound | ${formatNumber(metrics.inboundCalls)} inbound`} accent="#73fbd3" />
        <MetricCard icon={Users} label="Users" value={formatNumber(admin?.counts?.users)} detail={`${formatNumber(admin?.counts?.activeUsers)} active`} accent="#a8c7ff" />
        <MetricCard icon={Activity} label="Recordings" value={formatNumber(metrics.recordingsToday)} detail="Current selected range" accent="#ffd166" />
      </section>

      <section className="report-hero">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Reporting Center</h2>
          <p className="action-copy">Native GenX dashboards live here first; reviewed VICIdial report tools stay reachable while we rebuild each report experience.</p>
        </div>
        <CatalogSearch value={query} onChange={setQuery} placeholder="Search reports" />
      </section>

      <CatalogPanels groups={reportGroups} query={query} emptyLabel={user?.viewReports ? 'No reports match that search' : 'Your VICIdial user is not allowed to view reports'} />
    </>
  );
}

function MapView() {
  const [query, setQuery] = useState('');
  const pageCount = LEGACY_ADMIN_GROUPS.reduce((sum, group) => sum + group.items.length, 0);

  return (
    <>
      <section className="metric-grid admin-metric-grid" aria-label="VICIdial route coverage">
        <MetricCard icon={Compass} label="Route Groups" value={formatNumber(LEGACY_ADMIN_GROUPS.length)} detail="Admin areas reviewed" accent="#00d9ff" />
        <MetricCard icon={ExternalLink} label="Page Entrypoints" value={formatNumber(pageCount)} detail="Accessible from GenX" accent="#73fbd3" />
        <MetricCard icon={SlidersHorizontal} label="Native Forms" value="13" detail="Campaigns, users, groups, lists, inbound, DIDs, call menus, phones, scripts, filters, call times, shifts, statuses" accent="#a8c7ff" />
        <MetricCard icon={ShieldCheck} label="Auth Layer" value="VICIdial" detail="GenX session required first" accent="#ffd166" />
      </section>

      <section className="report-hero">
        <div>
          <p className="eyebrow">Coverage</p>
          <h2>VICIdial Page Map</h2>
          <p className="action-copy">This is the coverage checklist for converting the classic admin surface into native GenX pages.</p>
        </div>
        <CatalogSearch value={query} onChange={setQuery} placeholder="Search admin pages" />
      </section>

      <CatalogPanels groups={LEGACY_ADMIN_GROUPS} query={query} emptyLabel="No admin pages match that search" />
    </>
  );
}

function RecordingsView({ admin }) {
  const recordings = admin?.recordings || [];

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
      <Panel eyebrow="Audio" title="Recording Totals" icon={Timer}>
        <div className="quick-stack">
          <MetricCard icon={Activity} label="Recent Files" value={formatNumber(recordings.length)} detail="Latest rows shown" accent="#00d9ff" />
          <MetricCard icon={Timer} label="Captured Time" value={formatSeconds(recordings.reduce((sum, row) => sum + Number(row.length_in_sec || 0), 0))} detail="Across visible recordings" accent="#73fbd3" />
        </div>
      </Panel>
    </section>
  );
}

function SystemView({ admin }) {
  const servers = admin?.servers || [];
  const carriers = admin?.carriers || [];

  return (
    <section className="admin-grid">
      <Panel eyebrow="Platform" title="VICIdial Servers" icon={Server} className="admin-wide-panel">
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
            { key: 'asterisk_version', label: 'Asterisk', render: (row) => row.asterisk_version || 'Unknown' },
            { key: 'channels_total', label: 'Channels', render: (row) => formatNumber(row.channels_total) },
            { key: 'sysload', label: 'Load', render: (row) => row.sysload ?? '0' },
            { key: 'cpu_idle_percent', label: 'CPU Idle', render: (row) => row.cpu_idle_percent ? `${row.cpu_idle_percent}%` : 'Unknown' },
            { key: 'conf_engine', label: 'Conf', render: (row) => row.conf_engine || 'Default' },
            { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
          ]}
        />
      </Panel>
      <Panel eyebrow="Telephony" title="Carriers" icon={PhoneCall}>
        <DataTable
          emptyLabel="No carriers returned"
          rows={carriers.map((row) => ({ ...row, id: row.carrier_id }))}
          columns={[
            { key: 'carrier_id', label: 'Carrier', render: (row) => <strong>{row.carrier_id}</strong> },
            { key: 'protocol', label: 'Protocol', render: (row) => row.protocol || 'SIP' },
            { key: 'server_ip', label: 'Server', render: (row) => row.server_ip || 'Default' },
            { key: 'active', label: 'Status', render: (row) => <StatusPill ok={row.active === 'Y'}>{row.active === 'Y' ? 'Active' : 'Off'}</StatusPill> },
          ]}
        />
      </Panel>
    </section>
  );
}

function AdminPage({ activeView, dashboard, admin, user, onAction }) {
  if (activeView === 'command') return <CommandView dashboard={dashboard} />;
  if (activeView === 'campaigns') return <CampaignsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'users') return <UsersView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'userGroups') return <UserGroupsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'lists') return <ListsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'inbound') return <InboundView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'dids') return <DidsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'callMenus') return <CallMenusView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'phones') return <PhonesView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'scripts') return <ScriptsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'leadFilters') return <LeadFiltersView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'callTimes') return <CallTimesView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'shifts') return <ShiftsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'statuses') return <StatusesView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'reports') return <ReportsView dashboard={dashboard} admin={admin} user={user} />;
  if (activeView === 'recordings') return <RecordingsView admin={admin} />;
  if (activeView === 'system') return <SystemView admin={admin} />;
  if (activeView === 'map') return <MapView />;
  return <CommandView dashboard={dashboard} />;
}

function AdminShell({ token, user, onLogout }) {
  const [activeView, setActiveView] = useState('command');
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

  const handleSaved = useCallback((nextAdminData) => {
    setAdminState({ loading: false, error: '', data: nextAdminData });
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const timer = window.setInterval(refreshAll, 30000);
    return () => window.clearInterval(timer);
  }, [refreshAll]);

  const activeMeta = NAV_ITEMS.find((item) => item.key === activeView) || NAV_ITEMS[0];
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
            <p className="eyebrow">GenX</p>
            <h1>Command Center</h1>
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

      <nav className="admin-nav" aria-label="GenX admin navigation">
        {NAV_ITEMS.map(({ key, label, icon: Icon }) => (
          <button
            type="button"
            key={key}
            className={key === activeView ? 'active' : ''}
            onClick={() => setActiveView(key)}
          >
            <Icon size={17} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </nav>

      <section className="workspace-strip">
        <div>
          <p className="eyebrow">{activeMeta.eyebrow}</p>
          <h2>{activeMeta.title}</h2>
        </div>
        <div className="strip-items">
          {activeView === 'command' && <RangeControl value={range} onChange={setRange} />}
          <span><Clock3 size={16} aria-hidden="true" /> Updated {formatTime(updatedAt)}</span>
          <span><Database size={16} aria-hidden="true" /> {system.database || 'asterisk'}</span>
          <span><Sparkles size={16} aria-hidden="true" /> GenX UI v0.3</span>
        </div>
      </section>

      {error && <div className="alert">{error}</div>}
      {isLoading && <div className="loading-band">Loading live VICIdial data</div>}

      <AdminPage
        activeView={activeView}
        dashboard={dashboardState.data}
        admin={adminState.data}
        user={user}
        onAction={openAction}
      />

      <footer className="footer-line">
        <span><Search size={14} aria-hidden="true" /> GenX admin app connected to VICIdial data layer</span>
      </footer>

      {action && (
        <ActionModal
          action={action}
          admin={adminState.data}
          token={token}
          onClose={() => setAction(null)}
          onSaved={handleSaved}
          onLogout={onLogout}
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

createRoot(document.getElementById('root')).render(<App />);
