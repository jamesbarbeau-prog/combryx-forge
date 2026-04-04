import { useState } from 'react';
import {
  Plus, Search, SlidersHorizontal, Briefcase,
  ChevronRight, MapPin, Calendar, User,
} from 'lucide-react';

type Stage = 'Lead' | 'Qualified' | 'Quoted' | 'Proposed' | 'Won' | 'Lost';

interface Opportunity {
  id: string;
  name: string;
  client: string;
  location: string;
  value: number;
  stage: Stage;
  probability: number;
  pm: string;
  due: string;
  type: string;
}

const OPPORTUNITIES: Opportunity[] = [
  { id: 'OPP-018', name: 'Bayview Kitchen & Bath Reno',  client: 'R. Fontaine', location: 'Toronto, ON',     value: 94000,  stage: 'Proposed',  probability: 75,  pm: 'KT', due: 'Apr 15', type: 'Residential' },
  { id: 'OPP-017', name: 'Thornhill Master Addition',    client: 'H. Lam',      location: 'Thornhill, ON',   value: 142000, stage: 'Quoted',    probability: 60,  pm: 'MR', due: 'Apr 20', type: 'Residential' },
  { id: 'OPP-016', name: 'Markham Office Fitout',        client: 'P. Dubois',   location: 'Markham, ON',     value: 210000, stage: 'Qualified', probability: 40,  pm: 'AS', due: 'May 01', type: 'Commercial'  },
  { id: 'OPP-015', name: 'Scarborough Exterior Refresh', client: 'C. Osei',     location: 'Scarborough, ON', value: 38000,  stage: 'Lead',      probability: 20,  pm: 'KT', due: 'May 10', type: 'Residential' },
  { id: 'OPP-014', name: 'Richmond Hill Basement',       client: 'A. Patel',    location: 'Richmond Hill',   value: 67000,  stage: 'Won',       probability: 100, pm: 'MR', due: 'Closed', type: 'Residential' },
  { id: 'OPP-013', name: 'Vaughan Commercial Build',     client: 'M. Russo',    location: 'Vaughan, ON',     value: 380000, stage: 'Proposed',  probability: 65,  pm: 'AS', due: 'Apr 30', type: 'Commercial'  },
  { id: 'OPP-012', name: 'Etobicoke Full Reno',          client: 'S. Kim',      location: 'Etobicoke, ON',   value: 155000, stage: 'Lost',      probability: 0,   pm: 'KT', due: 'Closed', type: 'Residential' },
];

const STAGES: Stage[] = ['Lead', 'Qualified', 'Quoted', 'Proposed', 'Won', 'Lost'];

const STAGE_STYLE: Record<Stage, { badge: string; bar: string }> = {
  Lead:      { badge: 'forge-badge--neutral', bar: '#9B9490'                },
  Qualified: { badge: 'forge-badge--info',    bar: 'var(--color-info)'      },
  Quoted:    { badge: 'forge-badge--gold',    bar: 'var(--color-gold)'      },
  Proposed:  { badge: 'forge-badge--warning', bar: 'var(--color-warning)'   },
  Won:       { badge: 'forge-badge--success', bar: 'var(--color-success)'   },
  Lost:      { badge: 'forge-badge--danger',  bar: 'var(--color-danger)'    },
};

function formatValue(v: number) {
  return '$' + v.toLocaleString('en-CA');
}

function ProbabilityBar({ pct, stage }: { pct: number; stage: Stage }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ background: 'var(--color-mist)', borderRadius: 100, height: 4, width: 64, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, borderRadius: 100, background: STAGE_STYLE[stage].bar }} />
      </div>
      <span style={{ fontSize: 11, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)', width: 30 }}>{pct}%</span>
    </div>
  );
}

function Avatar({ initials }: { initials: string }) {
  return (
    <div style={{
      width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
      background: 'var(--color-gold-tint)', border: '1px solid var(--color-gold-soft)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 9, fontWeight: 700, color: '#7A5E1A',
    }}>{initials}</div>
  );
}

export default function OpportunitiesPage() {
  const [activeStage, setActiveStage] = useState<Stage | 'All'>('All');
  const [search, setSearch] = useState('');

  const filtered = OPPORTUNITIES.filter(o => {
    const matchStage = activeStage === 'All' || o.stage === activeStage;
    const matchSearch =
      o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.client.toLowerCase().includes(search.toLowerCase());
    return matchStage && matchSearch;
  });

  const pipelineTotal = OPPORTUNITIES
    .filter(o => o.stage !== 'Lost')
    .reduce((sum, o) => sum + o.value, 0);

  const stageGroups = STAGES.map(s => ({
    stage: s,
    count: OPPORTUNITIES.filter(o => o.stage === s).length,
    value: OPPORTUNITIES.filter(o => o.stage === s).reduce((sum, o) => sum + o.value, 0),
  }));

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1300, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <p className="forge-label" style={{ marginBottom: 4 }}>CRM</p>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em' }}>Opportunities</h1>
          <p className="forge-subtitle" style={{ marginTop: 2 }}>
            {OPPORTUNITIES.filter(o => o.stage !== 'Lost' && o.stage !== 'Won').length} active
            · Pipeline value {formatValue(pipelineTotal)}
          </p>
        </div>
        <button className="forge-button forge-button--primary">
          <Plus size={13} /> New Opportunity
        </button>
      </div>

      {/* Pipeline summary bar */}
      <div className="forge-card" style={{ marginBottom: 20, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)' }}>
          {stageGroups.map((g, i) => {
            const isActive = activeStage === g.stage;
            return (
              <button
                key={g.stage}
                onClick={() => setActiveStage(isActive ? 'All' : g.stage)}
                style={{
                  padding: '14px 16px',
                  borderTop: 'none',
                  borderBottom: 'none',
                  borderLeft: 'none',
                  borderRight: i < 5 ? '1px solid var(--color-border)' : 'none',
                  background: isActive ? 'var(--color-gold-tint)' : 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.12s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="forge-label">{g.stage}</span>
                  <span className={`forge-badge ${STAGE_STYLE[g.stage].badge}`} style={{ fontSize: 9 }}>{g.count}</span>
                </div>
                <p style={{
                  fontSize: 15, fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  color: isActive ? 'var(--color-gold)' : 'var(--color-text)',
                  letterSpacing: '-0.02em',
                }}>
                  {g.value > 0 ? formatValue(g.value) : '—'}
                </p>
                <div style={{ marginTop: 8, height: 3, background: 'var(--color-mist)', borderRadius: 100 }}>
                  <div style={{
                    height: '100%', borderRadius: 100,
                    background: STAGE_STYLE[g.stage].bar,
                    width: g.count > 0 ? '100%' : '0%',
                    opacity: isActive ? 1 : 0.4,
                  }} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-muted)' }} />
          <input
            className="forge-input"
            placeholder="Search opportunities..."
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
        <table className="forge-table">
          <thead>
            <tr>
              <th>Opportunity</th>
              <th>Client</th>
              <th>Type</th>
              <th>Value</th>
              <th>Stage</th>
              <th>Probability</th>
              <th>Due</th>
              <th>PM</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px 0', color: 'var(--color-muted)' }}>
                  No opportunities match your filter
                </td>
              </tr>
            ) : (
              filtered.map(o => (
                <tr key={o.id} style={{ cursor: 'pointer' }}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{
                        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
                        background: 'var(--color-gold-tint)',
                        border: '1px solid var(--color-gold-soft)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                      }}>
                        <Briefcase size={13} color="#C89B3C" />
                      </div>
                      <div>
                        <p style={{ fontWeight: 600, fontSize: 12 }}>{o.name}</p>
                        <p style={{ fontSize: 10, color: 'var(--color-muted)', display: 'flex', alignItems: 'center', gap: 3, marginTop: 2 }}>
                          <MapPin size={9} /> {o.location}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <User size={11} color="var(--color-muted)" />
                      <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{o.client}</span>
                    </div>
                  </td>
                  <td>
                    <span className="forge-badge forge-badge--neutral">{o.type}</span>
                  </td>
                  <td>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, fontWeight: 700 }}>
                      {formatValue(o.value)}
                    </span>
                  </td>
                  <td>
                    <span className={`forge-badge ${STAGE_STYLE[o.stage].badge}`}>{o.stage}</span>
                  </td>
                  <td>
                    <ProbabilityBar pct={o.probability} stage={o.stage} />
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <Calendar size={11} color="var(--color-muted)" />
                      <span style={{ fontSize: 12, color: 'var(--color-text-sub)' }}>{o.due}</span>
                    </div>
                  </td>
                  <td><Avatar initials={o.pm} /></td>
                  <td><ChevronRight size={13} color="var(--color-muted)" /></td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}