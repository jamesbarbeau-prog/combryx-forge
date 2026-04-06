import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const today = new Date();

function daysUntil(dateStr: string) {
  const d = new Date(dateStr);
  return Math.ceil((d.getTime() - today.getTime()) / 86400000);
}

function riskColor(days: number) {
  if (days <= 3)  return { text: '#FF3B3B', bg: 'rgba(255,59,59,0.12)',  border: 'rgba(255,59,59,0.3)'  };
  if (days <= 7)  return { text: '#FF8C00', bg: 'rgba(255,140,0,0.12)',  border: 'rgba(255,140,0,0.3)'  };
  if (days <= 14) return { text: '#D97706', bg: 'rgba(217,119,6,0.10)',  border: 'rgba(217,119,6,0.25)' };
  return           { text: '#16A34A', bg: 'rgba(22,163,74,0.08)',  border: 'rgba(22,163,74,0.2)'  };
}

function brpBar(brpStart: string, brpEnd: string) {
  const start   = new Date(brpStart).getTime();
  const end     = new Date(brpEnd).getTime();
  const now     = today.getTime();
  const total   = end - start;
  const elapsed = now - start;
  const pct     = Math.min(100, Math.max(0, (elapsed / total) * 100));
  const days    = daysUntil(brpEnd);
  const color   = pct > 90 ? '#FF3B3B' : pct > 75 ? '#FF8C00' : '#16A34A';
  return { pct, days, color };
}

const MOCK_CASES = [
  {
    id: '1', lot: 'Lot 45', address: '123 Rideau Crest Dr', community: 'Rideau Forest Ph2',
    homeowner: 'Marcus & Diana Chen', enrollment: 'H1892341', case_number: 'T-998821',
    period_type: 'year_end', status: 'in_brp',
    brp_start: '2026-01-15', brp_end: '2026-05-15',
    items_total: 12, items_done: 7, items_outstanding: 5,
    risk: 'critical', tech: 'Mike R.',
    next_action: 'Access log missing on 2 items',
  },
  {
    id: '2', lot: 'Lot 12', address: '88 Stonehaven Ave', community: 'Rideau Forest Ph2',
    homeowner: 'Priya Sharma', enrollment: 'H1890012', case_number: 'T-991003',
    period_type: 'initial', status: 'in_brp',
    brp_start: '2026-02-10', brp_end: '2026-06-10',
    items_total: 6, items_done: 6, items_outstanding: 0,
    risk: 'good', tech: 'Sarah L.',
    next_action: 'All items complete — ready to close',
  },
  {
    id: '3', lot: 'Lot 78', address: '204 Maple Leaf Way', community: 'Westpark Manors',
    homeowner: 'Robert & Anne Patel', enrollment: 'H1901234', case_number: 'T-994512',
    period_type: 'second_year', status: 'rfc_eligible',
    brp_start: '2025-09-01', brp_end: '2026-01-01',
    items_total: 9, items_done: 4, items_outstanding: 5,
    risk: 'critical', tech: null,
    next_action: 'BRP expired — RFC eligible — conciliation risk',
  },
  {
    id: '4', lot: 'Unit 302', address: '45 Waterfront Blvd #302', community: 'Harbour Gate Condos',
    homeowner: 'Jean-Pierre Leclair', enrollment: 'H1885567', case_number: 'T-987766',
    period_type: 'msd', status: 'car_issued',
    brp_start: '2025-06-01', brp_end: '2025-09-01',
    items_total: 3, items_done: 0, items_outstanding: 3,
    risk: 'critical', tech: 'Dave K.',
    next_action: 'CAR issued — post-CAR deadline Apr 12',
  },
  {
    id: '5', lot: 'Lot 23', address: '67 Crimson Oak Blvd', community: 'Westpark Manors',
    homeowner: 'Sandra Thompson', enrollment: 'H1897723', case_number: 'T-996341',
    period_type: 'year_end', status: 'in_brp',
    brp_start: '2026-02-28', brp_end: '2026-06-28',
    items_total: 4, items_done: 1, items_outstanding: 3,
    risk: 'warning', tech: 'Mike R.',
    next_action: 'Schedule inspection — windows',
  },
];

const MOCK_WORKORDERS = [
  { id: 'w1', tech: 'Mike R.',  time: '8:00 AM',  lot: 'Lot 45',    address: '123 Rideau Crest Dr',       items: 3, type: 'repair',     status: 'en_route'  },
  { id: 'w2', tech: 'Sarah L.', time: '9:30 AM',  lot: 'Lot 12',    address: '88 Stonehaven Ave',          items: 1, type: 'inspection', status: 'scheduled' },
  { id: 'w3', tech: 'Dave K.',  time: '11:00 AM', lot: 'Unit 302',  address: '45 Waterfront Blvd #302',   items: 2, type: 'repair',     status: 'scheduled' },
  { id: 'w4', tech: 'Mike R.',  time: '1:30 PM',  lot: 'Lot 23',    address: '67 Crimson Oak Blvd',        items: 2, type: 'inspection', status: 'scheduled' },
  { id: 'w5', tech: 'Sarah L.', time: '3:00 PM',  lot: 'Lot 67',    address: '11 Cedar Grove Ct',          items: 4, type: 'repair',     status: 'scheduled' },
];

const MOCK_PENDING = [
  { id: 'p1', type: 'po_approval', label: 'PO Request',         desc: 'Lot 45 — Drywall repair $1,240',              urgent: true  },
  { id: 'p2', type: 'list_pull',   label: 'New List Available', desc: 'H1892341 — Year-End list ready in BuilderLink', urgent: true  },
  { id: 'p3', type: 'settlement',  label: 'Settlement Ready',   desc: 'Lot 78 — $4,200 offer ready to send',          urgent: false },
  { id: 'p4', type: 'signature',   label: 'Signature Required', desc: 'Lot 12 — Homeowner sign-off pending',           urgent: false },
];

const PERIOD_LABELS: Record<string, string> = {
  initial: 'Initial', mid_year: 'Mid-Year', year_end: 'Year-End',
  second_year: '2nd Year', msd: 'MSD',
};

const STATUS_LABELS: Record<string, string> = {
  in_brp: 'In BRP', rfc_eligible: 'RFC Eligible', car_issued: 'CAR Issued',
  open: 'Open', resolved: 'Resolved',
};

export default function WarrantyTodayPage() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState<'all' | 'critical' | 'warning' | 'good'>('all');

  const dateStr = today.toLocaleDateString('en-CA', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });

  const critical = MOCK_CASES.filter(c => c.risk === 'critical').length;
  const warning  = MOCK_CASES.filter(c => c.risk === 'warning').length;
  const rfcCount = MOCK_CASES.filter(c => c.status === 'rfc_eligible').length;
  const carCount = MOCK_CASES.filter(c => c.status === 'car_issued').length;
  const filtered = MOCK_CASES.filter(c => filter === 'all' || c.risk === filter);

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--color-canvas)',
      fontFamily: 'var(--font-body)',
      color: 'var(--color-text)',
    }}>
      <div style={{ padding: '20px 28px', maxWidth: 1440, margin: '0 auto' }}>

        {/* ── STAT ROW ── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { label: 'Active Cases',   value: MOCK_CASES.length,     color: 'var(--color-text)', sub: 'across 3 communities'  },
            { label: 'Critical Risk',  value: critical,               color: '#FF3B3B',            sub: 'action required today' },
            { label: 'Warning',        value: warning,                color: '#FF8C00',            sub: 'due within 14 days'    },
            { label: 'RFC Eligible',   value: rfcCount,               color: '#D97706',            sub: 'conciliation risk'     },
            { label: 'CAR Issued',     value: carCount,               color: '#7C3AED',            sub: '30-day clock running'  },
            { label: "Today's Visits", value: MOCK_WORKORDERS.length, color: '#16A34A',            sub: '3 techs dispatched'    },
          ].map(s => (
            <div key={s.label} style={{
              padding: '14px 16px', borderRadius: 10,
              background: 'var(--color-panel)',
              border: '1px solid var(--color-border)',
            }}>
              <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--color-muted)', marginBottom: 6 }}>{s.label}</p>
              <p style={{ fontSize: 26, fontWeight: 900, color: s.color, fontFamily: 'var(--font-mono)', letterSpacing: '-0.03em', lineHeight: 1 }}>{s.value}</p>
              <p style={{ fontSize: 10, color: 'var(--color-muted)', marginTop: 4 }}>{s.sub}</p>
            </div>
          ))}
        </div>

        {/* ── PENDING ACTIONS ── */}
        {MOCK_PENDING.length > 0 && (
          <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
            {MOCK_PENDING.map(p => (
              <div key={p.id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 14px', borderRadius: 8,
                background: p.urgent ? 'rgba(255,59,59,0.06)' : 'var(--color-mist)',
                border: `1px solid ${p.urgent ? 'rgba(255,59,59,0.25)' : 'var(--color-border)'}`,
                cursor: 'pointer',
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: p.urgent ? '#FF3B3B' : '#D97706',
                  flexShrink: 0,
                  boxShadow: p.urgent ? '0 0 8px rgba(255,59,59,0.6)' : 'none',
                }} />
                <div>
                  <span style={{ fontSize: 10, fontWeight: 800, color: p.urgent ? '#FF3B3B' : '#D97706', textTransform: 'uppercase', letterSpacing: '0.08em', marginRight: 6 }}>{p.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--color-muted)' }}>{p.desc}</span>
                </div>
                <span style={{ fontSize: 11, color: 'var(--color-muted)', marginLeft: 4 }}>→</span>
              </div>
            ))}
          </div>
        )}

        {/* ── MAIN TWO COLUMNS ── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 16 }}>

          {/* LEFT — CASES */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 6 }}>
                {[
                  { id: 'all',      label: 'All Cases',  count: MOCK_CASES.length },
                  { id: 'critical', label: '🔴 Critical', count: critical          },
                  { id: 'warning',  label: '🟡 Warning',  count: warning           },
                  { id: 'good',     label: '🟢 On Track', count: MOCK_CASES.filter(c => c.risk === 'good').length },
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setFilter(f.id as any)}
                    style={{
                      padding: '5px 12px', borderRadius: 6, fontSize: 11,
                      fontWeight: filter === f.id ? 700 : 400,
                      background: filter === f.id ? 'rgba(252,226,5,0.10)' : 'transparent',
                      border: filter === f.id ? '1px solid rgba(252,226,5,0.25)' : '1px solid var(--color-border)',
                      color: filter === f.id ? '#8A7600' : 'var(--color-muted)',
                      cursor: 'pointer', fontFamily: 'var(--font-body)',
                    }}
                  >
                    {f.label} <span style={{ opacity: 0.6, marginLeft: 4 }}>{f.count}</span>
                  </button>
                ))}
              </div>
              <button style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                background: 'var(--color-mist)', border: '1px solid var(--color-border)',
                color: 'var(--color-muted)', cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}>
                + New Case
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {filtered.map(c => {
                const brp         = brpBar(c.brp_start, c.brp_end);
                const risk        = riskColor(brp.days);
                const periodLabel = PERIOD_LABELS[c.period_type] ?? c.period_type;
                const statusLabel = STATUS_LABELS[c.status]      ?? c.status;
                return (
                  <div
                    key={c.id}
                    onClick={() => navigate(`/warranty/cases/${c.id}`)}
                    style={{
                      padding: '16px 18px', borderRadius: 12,
                      background: 'var(--color-panel)',
                      border: `1px solid ${c.risk === 'critical' ? 'rgba(255,59,59,0.2)' : c.risk === 'warning' ? 'rgba(255,140,0,0.15)' : 'var(--color-border)'}`,
                      cursor: 'pointer', transition: 'all 0.12s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'var(--color-panel-raised)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'var(--color-panel)'; }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--color-text)' }}>{c.lot}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: 'var(--color-mist)', color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.07em', border: '1px solid var(--color-border)' }}>{periodLabel}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 100, background: risk.bg, color: risk.text, border: `1px solid ${risk.border}`, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{statusLabel}</span>
                        </div>
                        <p style={{ fontSize: 11, color: 'var(--color-muted)', marginBottom: 1 }}>{c.address} · {c.community}</p>
                        <p style={{ fontSize: 11, color: 'var(--color-muted)' }}>{c.homeowner} · <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>{c.enrollment}</span></p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 16 }}>
                        <p style={{ fontSize: 22, fontWeight: 900, color: risk.text, fontFamily: 'var(--font-mono)', lineHeight: 1, letterSpacing: '-0.03em' }}>
                          {brp.days > 0 ? brp.days : 0}
                        </p>
                        <p style={{ fontSize: 9, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
                          {brp.days > 0 ? 'days left' : 'EXPIRED'}
                        </p>
                        <p style={{ fontSize: 9, color: 'var(--color-muted)', marginTop: 1 }}>BRP</p>
                      </div>
                    </div>

                    <div style={{ marginBottom: 10 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontSize: 9, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Builder Repair Period</span>
                        <span style={{ fontSize: 9, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                          {new Date(c.brp_start).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} → {new Date(c.brp_end).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                      </div>
                      <div style={{ height: 4, borderRadius: 100, background: 'var(--color-mist)', overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${brp.pct}%`, borderRadius: 100,
                          background: brp.color, transition: 'width 0.3s ease',
                          boxShadow: `0 0 8px ${brp.color}60`,
                        }} />
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ display: 'flex', gap: 2 }}>
                          {Array.from({ length: c.items_total }).map((_, i) => (
                            <div key={i} style={{
                              width: 6, height: 6, borderRadius: 1,
                              background: i < c.items_done ? '#16A34A' : 'var(--color-mist)',
                              border: '1px solid var(--color-border)',
                            }} />
                          ))}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>
                          {c.items_done}/{c.items_total}
                        </span>
                        {c.items_outstanding > 0 && (
                          <span style={{ fontSize: 10, color: risk.text, fontWeight: 700 }}>
                            {c.items_outstanding} outstanding
                          </span>
                        )}
                      </div>
                      {c.tech && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(252,226,5,0.12)', border: '1px solid rgba(252,226,5,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 800, color: '#8A7600' }}>
                            {c.tech.charAt(0)}
                          </div>
                          <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{c.tech}</span>
                        </div>
                      )}
                      <div style={{ flex: 1 }} />
                      <div style={{ padding: '3px 10px', borderRadius: 5, background: risk.bg, border: `1px solid ${risk.border}`, fontSize: 10, color: risk.text, fontWeight: 600 }}>
                        {c.next_action}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* RIGHT — SCHEDULE + DEADLINES */}
          <div>
            <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Today's Schedule</p>
              <button style={{
                padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 700,
                background: 'rgba(252,226,5,0.08)', border: '1px solid rgba(252,226,5,0.2)',
                color: '#8A7600', cursor: 'pointer', fontFamily: 'var(--font-body)',
              }}>+ Add Visit</button>
            </div>

            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {[['Mike R.', '#FCE205'], ['Sarah L.', '#16A34A'], ['Dave K.', '#7C3AED']].map(([t, color]) => (
                <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: color as string }} />
                  <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{t}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {MOCK_WORKORDERS.map(w => {
                const techColors: Record<string, string> = { 'Mike R.': '#FCE205', 'Sarah L.': '#16A34A', 'Dave K.': '#7C3AED' };
                const color = techColors[w.tech] ?? '#FCE205';
                return (
                  <div key={w.id} style={{
                    display: 'flex', gap: 10, alignItems: 'flex-start',
                    padding: '11px 14px', borderRadius: 9,
                    background: 'var(--color-panel)',
                    border: '1px solid var(--color-border)',
                    cursor: 'pointer',
                  }}>
                    <div style={{ flexShrink: 0, textAlign: 'right', width: 52 }}>
                      <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--color-muted)', fontFamily: 'var(--font-mono)' }}>{w.time}</p>
                    </div>
                    <div style={{ width: 2, borderRadius: 100, background: color, alignSelf: 'stretch', flexShrink: 0, opacity: 0.8 }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-text)' }}>{w.lot}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4,
                          background: w.status === 'en_route' ? 'rgba(22,163,74,0.12)' : 'var(--color-mist)',
                          color: w.status === 'en_route' ? '#16A34A' : 'var(--color-muted)',
                          textTransform: 'uppercase', letterSpacing: '0.07em',
                          border: `1px solid ${w.status === 'en_route' ? 'rgba(22,163,74,0.25)' : 'var(--color-border)'}`,
                        }}>
                          {w.status === 'en_route' ? '● En Route' : w.type}
                        </span>
                      </div>
                      <p style={{ fontSize: 10, color: 'var(--color-muted)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.address}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', background: `${color}15`, border: `1px solid ${color}35`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 7, fontWeight: 800, color }}>
                          {w.tech.charAt(0)}
                        </div>
                        <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{w.tech}</span>
                        <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>·</span>
                        <span style={{ fontSize: 10, color: 'var(--color-muted)' }}>{w.items} item{w.items > 1 ? 's' : ''}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div style={{ marginTop: 20 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--color-muted)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 12 }}>Upcoming Deadlines</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {[
                  { label: 'Lot 45 — BRP Expires',   date: '2026-05-15', type: 'brp' },
                  { label: 'Unit 302 — Post-CAR Due', date: '2026-04-12', type: 'car' },
                  { label: 'Lot 23 — BRP Expires',   date: '2026-06-28', type: 'brp' },
                  { label: 'Lot 12 — BRP Expires',   date: '2026-06-10', type: 'brp' },
                  { label: 'Lot 78 — RFC Deadline',  date: '2026-04-20', type: 'rfc' },
                ].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).map(d => {
                  const days = daysUntil(d.date);
                  const r    = riskColor(days);
                  const typeColors: Record<string, string> = { brp: '#1E5FA4', car: '#7C3AED', rfc: '#D97706' };
                  return (
                    <div key={d.label} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 12px', borderRadius: 7,
                      background: 'var(--color-panel)',
                      border: `1px solid ${days <= 7 ? r.border : 'var(--color-border)'}`,
                    }}>
                      <span style={{
                        fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4,
                        background: `${typeColors[d.type]}15`, color: typeColors[d.type],
                        textTransform: 'uppercase', letterSpacing: '0.08em', flexShrink: 0,
                        border: `1px solid ${typeColors[d.type]}25`,
                      }}>{d.type.toUpperCase()}</span>
                      <span style={{ fontSize: 10, color: 'var(--color-muted)', flex: 1 }}>{d.label}</span>
                      <div style={{ textAlign: 'right', flexShrink: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 900, color: r.text, fontFamily: 'var(--font-mono)', lineHeight: 1 }}>{days}d</p>
                        <p style={{ fontSize: 9, color: 'var(--color-muted)' }}>{new Date(d.date).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}