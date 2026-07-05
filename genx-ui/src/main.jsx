import React, { useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  BarChart3,
  CalendarDays,
  Clock3,
  Database,
  Gauge,
  Headphones,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  PhoneCall,
  RefreshCcw,
  Radio,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Timer,
  TrendingUp,
  Users,
} from 'lucide-react';
import './styles.css';

const API_BASE = `${import.meta.env.BASE_URL}api`;
const TOKEN_KEY = 'genx-ui-access-token';

const NAV_ITEMS = [
  { key: 'command', label: 'Command', eyebrow: 'Live Operations', title: 'VICIdial command layer', icon: LayoutDashboard },
  { key: 'campaigns', label: 'Campaigns', eyebrow: 'Admin', title: 'Campaign Control', icon: Radio },
  { key: 'users', label: 'Users', eyebrow: 'Admin', title: 'Users and Permissions', icon: Users },
  { key: 'lists', label: 'Lists', eyebrow: 'Admin', title: 'Lists and Lead Inventory', icon: Database },
  { key: 'inbound', label: 'Inbound', eyebrow: 'Admin', title: 'Inbound Groups', icon: Headphones },
  { key: 'recordings', label: 'Recordings', eyebrow: 'Reports', title: 'Recent Recordings', icon: Activity },
  { key: 'system', label: 'System', eyebrow: 'Platform', title: 'Servers and Carriers', icon: Server },
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

function CampaignsView({ admin }) {
  const campaigns = admin?.campaigns || [];
  const totalLeads = campaigns.reduce((sum, row) => sum + Number(row.lead_count || 0), 0);

  return (
    <>
      <AdminSummary admin={admin} />
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
            ]}
          />
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

function UsersView({ admin }) {
  const users = admin?.users || [];

  return (
    <>
      <AdminSummary admin={admin} />
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

function ListsView({ admin }) {
  const lists = admin?.lists || [];
  const totalLeads = lists.reduce((sum, row) => sum + Number(row.lead_count || 0), 0);

  return (
    <>
      <AdminSummary admin={admin} />
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

function InboundView({ admin }) {
  const groups = admin?.inboundGroups || [];

  return (
    <>
      <AdminSummary admin={admin} />
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

function AdminPage({ activeView, dashboard, admin }) {
  if (activeView === 'command') return <CommandView dashboard={dashboard} />;
  if (activeView === 'campaigns') return <CampaignsView admin={admin} />;
  if (activeView === 'users') return <UsersView admin={admin} />;
  if (activeView === 'lists') return <ListsView admin={admin} />;
  if (activeView === 'inbound') return <InboundView admin={admin} />;
  if (activeView === 'recordings') return <RecordingsView admin={admin} />;
  if (activeView === 'system') return <SystemView admin={admin} />;
  return <CommandView dashboard={dashboard} />;
}

function AdminShell({ token, user, onLogout }) {
  const [activeView, setActiveView] = useState('command');
  const [range, setRange] = useState('today');
  const [dashboardState, setDashboardState] = useState({ loading: true, error: '', data: null });
  const [adminState, setAdminState] = useState({ loading: true, error: '', data: null });

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

      <AdminPage activeView={activeView} dashboard={dashboardState.data} admin={adminState.data} />

      <footer className="footer-line">
        <span><Search size={14} aria-hidden="true" /> GenX admin app connected to VICIdial data layer</span>
      </footer>
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
