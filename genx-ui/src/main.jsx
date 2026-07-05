import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity,
  BarChart3,
  Clock3,
  Database,
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
  Users,
} from 'lucide-react';
import './styles.css';

const API_BASE = `${import.meta.env.BASE_URL}api`;
const TOKEN_KEY = 'genx-ui-access-token';

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

function durationLabel(value) {
  if (!value) return 'No recent call';
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
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
  const [accessCode, setAccessCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const payload = await apiFetch('/login', '', {
        method: 'POST',
        body: JSON.stringify({ accessCode }),
      });
      onLogin(payload.token || '');
    } catch (_error) {
      setError('Access code was not accepted');
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
          <label htmlFor="access-code">Access code</label>
          <div className="input-row">
            <LockKeyhole size={18} aria-hidden="true" />
            <input
              id="access-code"
              type="password"
              value={accessCode}
              onChange={(event) => setAccessCode(event.target.value)}
              autoComplete="current-password"
              autoFocus
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

function HourlyChart({ data }) {
  const max = Math.max(...data.map((item) => item.calls), 1);
  const labels = new Set([0, 6, 12, 18, 23]);

  return (
    <section className="panel chart-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Today</p>
          <h2>Call Flow</h2>
        </div>
        <BarChart3 size={22} aria-hidden="true" />
      </div>
      <div className="bar-chart" aria-label="Calls by hour">
        {data.map((item) => (
          <div className="bar-column" key={item.hour}>
            <div className="bar-track">
              <div
                className="bar-fill"
                style={{ height: `${Math.max(4, (item.calls / max) * 100)}%` }}
                title={`${item.calls} calls`}
              />
            </div>
            <span>{labels.has(item.hour) ? item.hour : ''}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function CampaignTable({ campaigns }) {
  return (
    <section className="panel table-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Campaigns</p>
          <h2>Dialing Surface</h2>
        </div>
        <Radio size={22} aria-hidden="true" />
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Mode</th>
              <th>Hopper</th>
              <th>Order</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {campaigns.map((campaign) => (
              <tr key={campaign.campaign_id}>
                <td>
                  <strong>{campaign.campaign_id}</strong>
                  <span>{campaign.campaign_name || 'Unnamed'}</span>
                </td>
                <td>{campaign.dial_method || 'Manual'}</td>
                <td>{campaign.hopper_level ?? 0}</td>
                <td>{campaign.lead_order || 'Standard'}</td>
                <td>
                  <StatusPill ok={campaign.active === 'Y'}>
                    {campaign.active === 'Y' ? 'Active' : 'Off'}
                  </StatusPill>
                </td>
              </tr>
            ))}
            {!campaigns.length && (
              <tr>
                <td colSpan="5" className="empty-row">No campaigns returned</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AgentList({ agents }) {
  return (
    <section className="panel agent-panel">
      <div className="panel-title">
        <div>
          <p className="eyebrow">Live Agents</p>
          <h2>Floor State</h2>
        </div>
        <Headphones size={22} aria-hidden="true" />
      </div>
      <div className="agent-list">
        {agents.map((agent) => (
          <article className="agent-row" key={`${agent.user}-${agent.campaign_id}`}>
            <div className="agent-avatar">{String(agent.user || '?').slice(0, 2).toUpperCase()}</div>
            <div className="agent-copy">
              <strong>{agent.user}</strong>
              <span>{agent.campaign_id || 'No campaign'} · {durationLabel(agent.last_call_time)}</span>
            </div>
            <StatusPill ok={agent.status !== 'PAUSED'}>
              {agent.status || agent.pause_code || 'Ready'}
            </StatusPill>
          </article>
        ))}
        {!agents.length && <div className="empty-state">No agents are live right now</div>}
      </div>
    </section>
  );
}

function Dashboard({ token, onLogout }) {
  const [state, setState] = useState({
    loading: true,
    error: '',
    data: null,
  });

  const load = useCallback(async () => {
    try {
      const payload = await apiFetch('/dashboard', token);
      setState({ loading: false, error: '', data: payload.data });
    } catch (error) {
      if (error.status === 401) {
        onLogout();
        return;
      }
      setState((current) => ({
        ...current,
        loading: false,
        error: 'Dashboard data is temporarily unavailable',
      }));
    }
  }, [onLogout, token]);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 30000);
    return () => window.clearInterval(timer);
  }, [load]);

  const metrics = state.data?.metrics || {};
  const system = state.data?.system || {};
  const updatedLabel = state.data?.generatedAt ? formatTime(state.data.generatedAt) : 'Loading';

  const metricCards = useMemo(() => ([
    {
      icon: Users,
      label: 'Agents Live',
      value: formatNumber(metrics.activeAgents),
      detail: `${formatNumber(metrics.pausedAgents)} paused`,
      accent: '#0f9f8f',
    },
    {
      icon: PhoneCall,
      label: 'Calls Today',
      value: formatNumber(metrics.callsToday),
      detail: `${formatNumber(metrics.currentCalls)} in motion`,
      accent: '#d45d3f',
    },
    {
      icon: LayoutDashboard,
      label: 'Campaigns',
      value: formatNumber(metrics.campaignsActive),
      detail: `${formatNumber(metrics.campaignsTotal)} configured`,
      accent: '#6c7a20',
    },
    {
      icon: Database,
      label: 'Lead Pool',
      value: formatNumber(metrics.leadsTotal),
      detail: `${formatNumber(metrics.listsActive)} active lists`,
      accent: '#8061a8',
    },
    {
      icon: Activity,
      label: 'Inbound Groups',
      value: formatNumber(metrics.inboundGroupsActive),
      detail: `${formatNumber(metrics.recordingsToday)} recordings today`,
      accent: '#c08426',
    },
  ]), [metrics]);

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
          <StatusPill ok={system.dbOnline}>
            <Server size={14} aria-hidden="true" />
            {system.dbOnline ? 'DB Online' : 'DB Offline'}
          </StatusPill>
          <button type="button" className="icon-button" onClick={load} aria-label="Refresh dashboard" title="Refresh dashboard">
            <RefreshCcw size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-button" onClick={onLogout} aria-label="Sign out" title="Sign out">
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </header>

      <section className="workspace-strip">
        <div>
          <p className="eyebrow">Live Operations</p>
          <h2>VICIdial command layer</h2>
        </div>
        <div className="strip-items">
          <span><Clock3 size={16} aria-hidden="true" /> Updated {updatedLabel}</span>
          <span><Database size={16} aria-hidden="true" /> {system.database || 'asterisk'}</span>
          <span><Sparkles size={16} aria-hidden="true" /> GenX UI v0.1</span>
        </div>
      </section>

      {state.error && <div className="alert">{state.error}</div>}
      {state.loading && <div className="loading-band">Loading live VICIdial data</div>}

      <section className="metric-grid" aria-label="Operations metrics">
        {metricCards.map((card) => (
          <MetricCard key={card.label} {...card} />
        ))}
      </section>

      <section className="content-grid">
        <HourlyChart data={state.data?.hourlyCalls || []} />
        <AgentList agents={state.data?.agents || []} />
        <CampaignTable campaigns={state.data?.campaigns || []} />
      </section>

      <footer className="footer-line">
        <span><Search size={14} aria-hidden="true" /> Reporting app connected to VICIdial data layer</span>
      </footer>
    </main>
  );
}

function App() {
  const [token, setToken] = useState(() => window.localStorage.getItem(TOKEN_KEY) || '');
  const [needsLogin, setNeedsLogin] = useState(true);

  useEffect(() => {
    apiFetch('/health', '')
      .then((payload) => {
        setNeedsLogin(Boolean(payload.authRequired));
        if (!payload.authRequired) {
          setToken('');
        }
      })
      .catch(() => setNeedsLogin(true));
  }, []);

  function login(nextToken) {
    if (nextToken) {
      window.localStorage.setItem(TOKEN_KEY, nextToken);
    }
    setToken(nextToken);
    setNeedsLogin(false);
  }

  function logout() {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setNeedsLogin(true);
  }

  if (needsLogin && !token) {
    return <Login onLogin={login} />;
  }

  return <Dashboard token={token} onLogout={logout} />;
}

createRoot(document.getElementById('root')).render(<App />);
