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

const NAV_ITEMS = [
  { key: 'command', label: 'Command', eyebrow: 'Live Operations', title: 'VICIdial command layer', icon: LayoutDashboard },
  { key: 'campaigns', label: 'Campaigns', eyebrow: 'Admin', title: 'Campaign Control', icon: Radio },
  { key: 'users', label: 'Users', eyebrow: 'Admin', title: 'Users and Permissions', icon: Users },
  { key: 'lists', label: 'Lists', eyebrow: 'Admin', title: 'Lists and Lead Inventory', icon: Database },
  { key: 'inbound', label: 'Inbound', eyebrow: 'Admin', title: 'Inbound Groups', icon: Headphones },
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
  if (entity === 'lists') return Boolean(user?.modifyLists);
  if (entity === 'inbound') return Boolean(user?.modifyIngroups);
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

function lookupOptions(items, valueKey, labelKey) {
  return (items || []).map((item) => ({
    value: String(item[valueKey] || ''),
    label: `${item[valueKey]}${item[labelKey] && item[labelKey] !== item[valueKey] ? ` - ${item[labelKey]}` : ''}`,
  })).filter((item) => item.value);
}

function actionDefaults(entity, admin) {
  const campaign = admin?.lookups?.campaigns?.[0]?.campaign_id || '';
  const group = admin?.lookups?.userGroups?.[0]?.user_group || 'ADMIN';
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
      campaign_script: '',
      campaign_script_two: '',
      get_call_launch: 'NONE',
      scheduled_callbacks: 'N',
      lead_filter_id: 'NONE',
      drop_call_seconds: '5',
      drop_action: 'AUDIO',
      safe_harbor_exten: '8307',
      display_dialable_count: 'Y',
      wrapup_seconds: '0',
      wrapup_message: 'Wrapup Call',
      use_internal_dnc: 'Y',
      omit_phone_code: 'N',
      available_only_ratio_tally: 'N',
      adaptive_dropped_percentage: '3',
      adaptive_maximum_level: '3.0',
      adaptive_intensity: '0',
      adaptive_dl_diff_target: '0',
      concurrent_transfers: 'AUTO',
      auto_alt_dial: 'NONE',
      auto_alt_dial_statuses: ' B N NA DC -',
      agent_pause_codes_active: 'N',
      dial_statuses: ' NEW -',
      no_hopper_leads_logins: 'N',
      use_auto_hopper: 'Y',
      list_order_mix: 'DISABLED',
      campaign_allow_inbound: 'N',
      manual_dial_list_id: '998',
      default_xfer_group: '---NONE---',
      queue_priority: '50',
      drop_inbound_group: '---NONE---',
      display_queue_count: 'Y',
      manual_dial_filter: 'NONE',
      agent_clipboard_copy: 'NONE',
      use_campaign_dnc: 'N',
      three_way_call_cid: 'CAMPAIGN',
      three_way_dial_prefix: '',
      web_form_target: 'vdcwebform',
      web_form_address: '',
      web_form_address_two: '',
      web_form_address_three: '',
      start_call_url: '',
      dispo_call_url: '',
      na_call_url: '',
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

function actionFields(entity, mode, admin) {
  const callTimeOptions = lookupOptions(admin?.lookups?.callTimes, 'call_time_id', 'call_time_name');
  const campaignOptions = lookupOptions(admin?.lookups?.campaigns, 'campaign_id', 'campaign_name');
  const userGroupOptions = lookupOptions(admin?.lookups?.userGroups, 'user_group', 'group_name');
  const scriptOptions = [{ value: '', label: 'NONE' }, ...lookupOptions(admin?.lookups?.scripts, 'script_id', 'script_name')];
  const leadFilterOptions = [{ value: 'NONE', label: 'NONE' }, ...lookupOptions(admin?.lookups?.leadFilters, 'lead_filter_id', 'lead_filter_name')];
  const inboundOptions = [{ value: '---NONE---', label: '---NONE---' }, ...lookupOptions(admin?.lookups?.inboundGroups, 'group_id', 'group_name')];
  const listOptions = [{ value: '998', label: '998' }, ...lookupOptions(admin?.lookups?.lists, 'list_id', 'list_name')];

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
      { key: 'auto_dial_level', label: 'Dial Level', type: 'number', step: '0.1' },
      { key: 'hopper_level', label: 'Hopper Level', type: 'number' },
      { key: 'lead_order', label: 'Lead Order' },
      { key: 'local_call_time', label: 'Call Time', type: callTimeOptions.length ? 'select' : 'text', options: callTimeOptions },
      { key: 'campaign_recording', label: 'Recording', type: 'select', options: enumOptions(['NEVER', 'ONDEMAND', 'ALLCALLS', 'ALLFORCE']) },
      { key: 'campaign_allow_inbound', label: 'Allow Inbound', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
    ];

    if (mode !== 'editDetail') return basicFields;

    return [
      { section: 'Basic Campaign' },
      ...basicFields.map((field) => ({ ...field, disabled: field.key === 'campaign_id' || field.disabled })),
      { section: 'Dialing and Hopper' },
      { key: 'dial_status_a', label: 'Dial Status A' },
      { key: 'dial_status_b', label: 'Dial Status B' },
      { key: 'dial_status_c', label: 'Dial Status C' },
      { key: 'dial_status_d', label: 'Dial Status D' },
      { key: 'dial_status_e', label: 'Dial Status E' },
      { key: 'dial_statuses', label: 'Dial Statuses', wide: true },
      { key: 'allow_closers', label: 'Allow Closers', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'next_agent_call', label: 'Next Agent Call' },
      { key: 'dial_timeout', label: 'Dial Timeout', type: 'number' },
      { key: 'dial_prefix', label: 'Dial Prefix' },
      { key: 'campaign_cid', label: 'Campaign CID' },
      { key: 'available_only_ratio_tally', label: 'Available Only Tally', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'adaptive_dropped_percentage', label: 'Adaptive Drop %', type: 'number', step: '0.1' },
      { key: 'adaptive_maximum_level', label: 'Adaptive Max Level', type: 'number', step: '0.1' },
      { key: 'adaptive_intensity', label: 'Adaptive Intensity', type: 'number', step: '0.1' },
      { key: 'adaptive_dl_diff_target', label: 'DL Diff Target', type: 'number' },
      { key: 'concurrent_transfers', label: 'Concurrent Transfers' },
      { key: 'no_hopper_leads_logins', label: 'No Hopper Leads Logins', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'use_auto_hopper', label: 'Use Auto Hopper', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'auto_alt_dial', label: 'Auto Alt Dial', type: 'select', options: enumOptions(['NONE', 'ALT_ONLY', 'ADDR3_ONLY', 'ALT_AND_ADDR3', 'ALT_AND_EXTENDED', 'ALT_AND_ADDR3_AND_EXTENDED', 'EXTENDED_ONLY', 'MULTI_LEAD']) },
      { key: 'auto_alt_dial_statuses', label: 'Auto Alt Statuses', wide: true },
      { section: 'Routing and Inbound' },
      { key: 'manual_dial_list_id', label: 'Manual Dial List', type: listOptions.length ? 'select' : 'text', options: listOptions },
      { key: 'default_xfer_group', label: 'Default Xfer Group', type: inboundOptions.length ? 'select' : 'text', options: inboundOptions },
      { key: 'queue_priority', label: 'Queue Priority', type: 'number' },
      { key: 'drop_call_seconds', label: 'Drop Seconds', type: 'number' },
      { key: 'drop_action', label: 'Drop Action', type: 'select', options: enumOptions(['HANGUP', 'MESSAGE', 'VOICEMAIL', 'IN_GROUP', 'AUDIO', 'CALLMENU', 'VMAIL_NO_INST']) },
      { key: 'drop_inbound_group', label: 'Drop Inbound Group', type: inboundOptions.length ? 'select' : 'text', options: inboundOptions },
      { key: 'safe_harbor_exten', label: 'Safe Harbor Exten' },
      { key: 'use_internal_dnc', label: 'Internal DNC', type: 'select', options: enumOptions(['Y', 'N', 'AREACODE']) },
      { key: 'use_campaign_dnc', label: 'Campaign DNC', type: 'select', options: enumOptions(['Y', 'N', 'AREACODE']) },
      { key: 'omit_phone_code', label: 'Omit Phone Code', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_pause_codes_active', label: 'Pause Codes Active', type: 'select', options: enumOptions(['Y', 'N', 'FORCE']) },
      { section: 'Recording, Scripts, and Forms' },
      { key: 'campaign_rec_filename', label: 'Recording Filename' },
      { key: 'campaign_script', label: 'Script', type: scriptOptions.length ? 'select' : 'text', options: scriptOptions },
      { key: 'campaign_script_two', label: 'Second Script', type: scriptOptions.length ? 'select' : 'text', options: scriptOptions },
      { key: 'get_call_launch', label: 'Call Launch', type: 'select', options: enumOptions(['NONE', 'SCRIPT', 'SCRIPTTWO', 'WEBFORM', 'WEBFORMTWO', 'WEBFORMTHREE', 'FORM', 'PREVIEW_WEBFORM', 'PREVIEW_WEBFORMTWO', 'PREVIEW_WEBFORMTHREE', 'PREVIEW_SCRIPT', 'PREVIEW_SCRIPTTWO', 'PREVIEW_FORM']) },
      { key: 'web_form_target', label: 'Web Form Target' },
      { key: 'web_form_address', label: 'Web Form URL', type: 'textarea', wide: true },
      { key: 'web_form_address_two', label: 'Web Form URL 2', type: 'textarea', wide: true },
      { key: 'web_form_address_three', label: 'Web Form URL 3', type: 'textarea', wide: true },
      { key: 'start_call_url', label: 'Start Call URL', type: 'textarea', wide: true },
      { key: 'dispo_call_url', label: 'Dispo Call URL', type: 'textarea', wide: true },
      { key: 'na_call_url', label: 'No Agent URL', type: 'textarea', wide: true },
      { section: 'Lead Control and Callbacks' },
      { key: 'lead_filter_id', label: 'Lead Filter', type: leadFilterOptions.length ? 'select' : 'text', options: leadFilterOptions },
      { key: 'list_order_mix', label: 'List Mix' },
      { key: 'display_dialable_count', label: 'Display Dialable Count', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'display_leads_count', label: 'Display Leads Count', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'lead_order_randomize', label: 'Lead Order Randomize', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'lead_order_secondary', label: 'Secondary Lead Order', type: 'select', options: enumOptions(['LEAD_ASCEND', 'LEAD_DESCEND', 'CALLTIME_ASCEND', 'CALLTIME_DESCEND', 'VENDOR_ASCEND', 'VENDOR_DESCEND']) },
      { key: 'scheduled_callbacks', label: 'Scheduled Callbacks', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'scheduled_callbacks_alert', label: 'Callback Alert' },
      { key: 'callback_days_limit', label: 'Callback Days Limit', type: 'number' },
      { key: 'callback_hours_block', label: 'Callback Hours Block', type: 'number' },
      { key: 'callback_list_calltime', label: 'Callback List Calltime', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'callback_active_limit', label: 'Callback Active Limit', type: 'number' },
      { key: 'callback_active_limit_override', label: 'Callback Limit Override', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
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
      { key: 'manual_dial_filter', label: 'Manual Dial Filter' },
      { key: 'manual_dial_search_filter', label: 'Manual Search Filter' },
      { key: 'manual_dial_timeout', label: 'Manual Dial Timeout' },
      { key: 'manual_dial_hopper_check', label: 'Manual Hopper Check', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'manual_auto_next', label: 'Manual Auto Next', type: 'number' },
      { key: 'manual_auto_show', label: 'Manual Auto Show', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'agent_clipboard_copy', label: 'Clipboard Copy Field' },
      { key: 'agent_lead_search', label: 'Agent Lead Search', type: 'select', options: enumOptions(['ENABLED', 'LIVE_CALL_INBOUND', 'LIVE_CALL_INBOUND_AND_MANUAL', 'DISABLED']) },
      { key: 'agent_hide_hangup', label: 'Hide Hangup', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'ready_max_logout', label: 'Ready Max Logout', type: 'number' },
      { key: 'max_logged_in_agents', label: 'Max Logged-In Agents', type: 'number' },
      { section: 'Compliance and Enhancements' },
      { key: 'user_group', label: 'User Group', type: userGroupOptions.length ? 'select' : 'text', options: [{ value: '---ALL---', label: '---ALL---' }, ...userGroupOptions] },
      { key: 'per_call_notes', label: 'Per Call Notes', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'my_callback_option', label: 'My Callback Option', type: 'select', options: enumOptions(['CHECKED', 'UNCHECKED']) },
      { key: 'allow_emails', label: 'Allow Emails', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'allow_chats', label: 'Allow Chats', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'max_inbound_calls', label: 'Max Inbound Calls', type: 'number' },
      { key: 'hide_call_log_info', label: 'Hide Call Log Info' },
      { key: 'show_previous_callback', label: 'Show Previous Callback', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'clear_script', label: 'Clear Script', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'status_display_ingroup', label: 'Status Display Ingroup', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
      { key: 'mute_recordings', label: 'Mute Recordings', type: 'select', options: yesNoOptions('Y', 'N', 'Yes', 'No') },
      { key: 'amd_type', label: 'AMD Type', type: 'select', options: enumOptions(['AMD', 'CPD', 'KHOMP', 'ViciAMD']) },
      { key: 'transfer_button_launch', label: 'Transfer Button Launch' },
      { key: 'shared_dial_rank', label: 'Shared Dial Rank', type: 'number' },
      { key: 'call_limit_24hour_method', label: '24h Limit Method', type: 'select', options: enumOptions(['DISABLED', 'PHONE_NUMBER', 'LEAD']) },
      { key: 'call_limit_24hour_scope', label: '24h Limit Scope', type: 'select', options: enumOptions(['SYSTEM_WIDE', 'CAMPAIGN_LISTS']) },
      { key: 'call_limit_24hour', label: '24h Limit', type: 'number' },
      { key: 'call_limit_24hour_override', label: '24h Limit Override' },
      { key: 'show_confetti', label: 'Confetti', type: 'select', options: enumOptions(['DISABLED', 'SALES', 'CALLBACKS', 'SALES_AND_CALLBACKS']) },
      { key: 'dead_stop_recording', label: 'Dead Stop Recording' },
      { key: 'daily_phone_number_call_limit', label: 'Daily Phone Limit', type: 'number' },
      { key: 'call_log_days', label: 'Call Log Days', type: 'number' },
      { key: 'hangup_again_link', label: 'Hangup Again Link', type: 'select', options: enumOptions(['ENABLED', 'DISABLED']) },
    ];
  }

  if (entity === 'users') {
    return [
      { key: 'user', label: 'User ID', disabled: mode === 'edit' },
      { key: 'pass', label: mode === 'edit' ? 'New Password' : 'Password', type: 'password' },
      { key: 'full_name', label: 'Full Name' },
      { key: 'user_level', label: 'Level', type: 'number' },
      { key: 'user_group', label: 'User Group', type: userGroupOptions.length ? 'select' : 'text', options: userGroupOptions },
      { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
      { key: 'email', label: 'Email' },
      { key: 'phone_login', label: 'Phone Login' },
      { key: 'campaign_detail', label: 'Campaign Detail', type: 'select', options: flagOptions() },
      { key: 'view_reports', label: 'Reports', type: 'select', options: flagOptions() },
      { key: 'export_reports', label: 'Export Reports', type: 'select', options: flagOptions() },
      { key: 'modify_campaigns', label: 'Campaign Admin', type: 'select', options: flagOptions() },
      { key: 'modify_lists', label: 'List Admin', type: 'select', options: flagOptions() },
      { key: 'modify_users', label: 'User Admin', type: 'select', options: flagOptions() },
      { key: 'modify_ingroups', label: 'Inbound Admin', type: 'select', options: flagOptions() },
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

  return [
    { key: 'group_id', label: 'Group ID', disabled: mode === 'edit' },
    { key: 'group_name', label: 'Group Name' },
    { key: 'group_color', label: 'Color' },
    { key: 'active', label: 'Status', type: 'select', options: yesNoOptions() },
    { key: 'next_agent_call', label: 'Routing' },
    { key: 'queue_priority', label: 'Priority', type: 'number' },
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
    lists: 'List',
    inbound: 'Inbound Group',
  }[entity] || 'Record';
}

function entityId(entity, row) {
  return {
    campaigns: row.campaign_id,
    campaignCopy: row.campaign_id,
    users: row.user,
    lists: row.list_id,
    inbound: row.group_id,
  }[entity];
}

function ActionModal({ action, admin, token, onClose, onSaved, onLogout }) {
  const [form, setForm] = useState(() => ({ ...actionDefaults(action.entity, admin), ...(action.row || {}) }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const mode = action.mode || 'create';
  const fields = actionFields(action.entity, mode, admin);
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
    const path = isCopy
      ? '/admin/campaigns/copy'
      : isEdit
        ? `/admin/${action.entity}/${encodeURIComponent(id)}`
        : `/admin/${action.entity}`;
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
                  {field.type === 'select' ? (
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
    { icon: Database, label: 'Lists', value: counts.activeLists, detail: `${formatNumber(counts.lists)} total`, accent: '#a8c7ff' },
    { icon: Headphones, label: 'Inbound', value: counts.activeInboundGroups, detail: `${formatNumber(counts.inboundGroups)} total`, accent: '#ffd166' },
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
        <MetricCard icon={SlidersHorizontal} label="Native Forms" value="4" detail="Campaigns, users, lists, inbound" accent="#a8c7ff" />
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
  if (activeView === 'lists') return <ListsView admin={admin} user={user} onAction={onAction} />;
  if (activeView === 'inbound') return <InboundView admin={admin} user={user} onAction={onAction} />;
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
