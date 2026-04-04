import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import {
  Plus, Search, SlidersHorizontal,
  ChevronRight, MapPin, Calendar, Hammer,
} from 'lucide-react';

type Stage = 'Sell' | 'Define' | 'Plan' | 'Build' | 'Buy' | 'Bill' | 'Closed';
type Status = 'active' | 'blocked' | 'on-hold' | 'complete';

interface Project {
  id: string;
  name: string;
  city: string | null;
  address: string | null;
  value: number;
  stage: string;
  status: string;
  type: string;
  completion_pct: number;
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  clients?: { first_name: string; last_name: string } | null;
}

const STAGES = ['Sell', 'Define', 'Plan', 'Build', 'Buy', 'Bill', 'Closed'];

const STAGE_BADGE: Record<string, string> = {
  Sell:   'forge-badge--info',
  Define: 'forge-badge--neutral',
  Plan:   'forge-badge--neutral',
  Build:  'forge-badge--gold',
  Buy:    'forge-badge--gold',
  Bill:   'forge-badge--success',
  Closed: 'forge-badge--neutral',
};

const STATUS_BADGE: Record<string, string> = {
  active:    'forge-badge--success',
  blocked:   'forge-badge--danger',
  'on-hold': 'forge-badge--warning',
  complete:  'forge-badge--neutral',
};

const STAGE_COLOR: Record<string, string> = {
  Sell:   '#60A5FA',
  Define: '#8C8680',
  Plan:   '#8C8680',
  Build:  '#8A7600',
  Buy:    '#8A7600',
  Bill:   '#2D7A50',
  Closed: '#C8C2B4',
};

function formatValue(v: number) {
  return '$' + v.toLocaleString('en-CA');
}

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ProgressBar({ pct, status }: { pct: number; status: string }) {
  const color = status === 'blocked' ? '#B53D3D' : pct >= 90 ? '#2D7A50' : pct >= 50 ? '#8A7600' : '#8C8680';
  return (
    <div style={{ background: 'var(--color-mist)', borderRadius: 100, height: 5, width: 80, overflow: 'hidden' }}>
      <div style={{ height: '100%', width: `${pct}%`, borderRadius: 100, background: color }} />
    </div>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
      background: 'rgba(252,226,5,0.18)',
      border: '1px solid rgba(252,226,5,0.40)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, fontWeight: 700, color: '#8A7600',
    }}>{initials}</div>
  );
}

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects]   = useState<Project[]>([]);
  const [loading, setLoading]     = useState(true);
  const [activeStage, setActiveStage] = useState<string>('All');
  const [search, setSearch]       = useState('');

  useEffect(() => {
    fetchProjects();
  }, []);

  async function fetchProjects() {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('id, name, city, address, value, stage, status, type, completion_pct, start_date, end_date, created_at, clients(first_name, last_name)')
      .order('created_at', { ascending: false });
    if (data) setProjects(data as Project[]);
    setLoading(false);
  }

  const filtered = projects.filter(p => {
    const matchStage  = activeStage === 'All' || p.stage === activeStage;
    const clientName  = p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : '';
    const matchSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      clientName.toLowerCase().includes(search.toLowerCase()) ||
      (p.city ?? '').toLowerCase().includes(search.toLowerCase());
    return matchStage && matchSearch;
  });

  const totalValue    = projects.reduce((s, p) => s + p.value, 0);
  const activeCount   = projects.filter(p => p.status === 'active').length;
  const blockedCount  = projects.filter(p => p.status === 'blocked').length;
  const avgPct        = projects.length > 0
    ? Math.round(projects.reduce((s, p) => s + p.completion_pct, 0) / projects.length)
    : 0;

  const stageGroups = STAGES.map(s => ({
    stage: s,
    count: projects.filter(p => p.stage === s).length,
  }));

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1300, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p className="forge-label" style={{ marginBottom: 4 }}>Projects</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>All Projects</h1>
          <p className="forge-subtitle" style={{ marginTop: 2 }}>
            {projects.length} projects · {activeCount} active · {blockedCount} blocked · {formatValue(totalValue)} total
          </p>
        </div>
        <button className="forge-button forge-button--primary">
          <Plus size={13} /> New Project
        </button>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total Portfolio', value: formatValue(totalValue), sub: `${projects.length} projects`,  color: 'var(--color-text)'    },
          { label: 'Active',          value: String(activeCount),     sub: 'in progress',                  color: 'var(--color-success)' },
          { label: 'Blocked',         value: String(blockedCount),    sub: 'need attention',               color: 'var(--color-danger)'  },
          { label: 'Avg. Completion', value: avgPct + '%',            sub: 'across all projects',          color: '#8A7600'              },
        ].map(kpi => (
          <div key={kpi.label} className="forge-card" style={{ padding: '16px 18px' }}>
            <p className="forge-label" style={{ marginBottom: 8 }}>{kpi.label}</p>
            <p style={{ fontSize: 24, fontWeight: 800, color: kpi.color, letterSpacing: '-0.03em', lineHeight: 1, fontFamily: 'var(--font-mono)' }}>
              {kpi.value}
            </p>
            <p style={{ fontSize: 11, color: 'var(--color-muted)', marginTop: 4 }}>{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Stage filter bar */}
      <div className="forge-card" style={{ marginBottom: 16, overflow: 'hidden' }}>
        <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)' }}>
          <button
            onClick={() => setActiveStage('All')}
            style={{
              padding: '11px 16px', fontSize: 12,
              fontWeight: activeStage === 'All' ? 700 : 400,
              color: activeStage === 'All' ? '#8A7600' : 'var(--color-muted)',
              background: activeStage === 'All' ? 'rgba(252,226,5,0.06)' : 'transparent',
              borderTop: 'none', borderLeft: 'none',
              borderBottom: activeStage === 'All' ? '2px solid #FCE205' : '2px solid transparent',
              borderRight: '1px solid var(--color-border)',
              cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
            }}
          >
            All <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>{projects.length}</span>
          </button>
          {stageGroups.map(g => (
            <button
              key={g.stage}
              onClick={() => setActiveStage(activeStage === g.stage ? 'All' : g.stage)}
              style={{
                padding: '11px 14px', fontSize: 12,
                fontWeight: activeStage === g.stage ? 700 : 400,
                color: activeStage === g.stage ? STAGE_COLOR[g.stage] : 'var(--color-muted)',
                background: activeStage === g.stage ? 'rgba(252,226,5,0.04)' : 'transparent',
                borderTop: 'none', borderLeft: 'none',
                borderBottom: activeStage === g.stage ? `2px solid ${STAGE_COLOR[g.stage]}` : '2px solid transparent',
                borderRight: '1px solid var(--color-border)',
                cursor: 'pointer', transition: 'all 0.12s', whiteSpace: 'nowrap',
              }}
            >
              {g.stage} <span style={{ marginLeft: 4, fontSize: 10, opacity: 0.6 }}>{g.count}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input
            className="forge-input"
            placeholder="Search projects, clients..."
            style={{ paddingLeft: 30 }}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button className="forge-icon-button"><SlidersHorizontal size={14} /></button>
        {activeStage !== 'All' && (
          <button className="forge-button forge-button--ghost forge-button--sm" onClick={() => setActiveStage('All')}>
            Clear filter ×
          </button>
        )}
        <span className="forge-subtitle" style={{ marginLeft: 'auto' }}>{filtered.length} results</span>
      </div>

      {/* Table */}
      <div className="forge-card">
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--color-muted)' }}>
            Loading projects...
          </div>
        ) : (
          <table className="forge-table">
            <thead>
              <tr>
                <th>Project</th>
                <th>Client</th>
                <th>Type</th>
                <th>Value</th>
                <th>Stage</th>
                <th>Status</th>
                <th>Progress</th>
                <th>Timeline</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-muted)' }}>
                    {loading ? 'Loading...' : 'No projects found'}
                  </td>
                </tr>
              ) : (
                filtered.map(p => (
                  <tr
                    key={p.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => navigate(`/forge/projects/${p.id}`)}
                  >
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                          background: 'rgba(252,226,5,0.15)',
                          border: '1px solid rgba(252,226,5,0.30)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                          <Hammer size={13} color="#8A7600" strokeWidth={2} />
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, fontSize: 12 }}>{p.name}</p>
                          <p style={{ fontSize: 10, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                            <MapPin size={9} /> {p.city ?? '—'}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>
                      {p.clients ? `${p.clients.first_name} ${p.clients.last_name}` : '—'}
                    </td>
                    <td>
                      <span className="forge-badge forge-badge--neutral">{p.type}</span>
                    </td>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700 }}>
                        {formatValue(p.value)}
                      </span>
                    </td>
                    <td>
                      <span className={`forge-badge ${STAGE_BADGE[p.stage] ?? 'forge-badge--neutral'}`}>{p.stage}</span>
                    </td>
                    <td>
                      <span className={`forge-badge ${STATUS_BADGE[p.status] ?? 'forge-badge--neutral'}`}>{p.status}</span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <ProgressBar pct={p.completion_pct} status={p.status} />
                        <span style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', width: 32 }}>
                          {p.completion_pct}%
                        </span>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <Calendar size={10} color="var(--color-muted)" />
                        <span style={{ fontSize: 11, color: 'var(--color-text-sub)' }}>
                          {formatDate(p.start_date)} → {formatDate(p.end_date)}
                        </span>
                      </div>
                    </td>
                    <td><ChevronRight size={13} color="var(--color-muted)" /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}