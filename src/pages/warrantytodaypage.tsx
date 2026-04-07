import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const today = new Date();

function daysUntil(dateStr: string) {
  return Math.ceil((new Date(dateStr).getTime() - today.getTime()) / 86400000);
}

function riskColor(days: number) {
  if (days <= 3)  return { text: '#FF3B3B', bg: 'rgba(255,59,59,0.10)',  border: 'rgba(255,59,59,0.25)'  };
  if (days <= 7)  return { text: '#FF8C00', bg: 'rgba(255,140,0,0.10)',  border: 'rgba(255,140,0,0.25)'  };
  if (days <= 14) return { text: '#D97706', bg: 'rgba(217,119,6,0.08)',  border: 'rgba(217,119,6,0.20)' };
  return           { text: '#16A34A', bg: 'rgba(22,163,74,0.08)',  border: 'rgba(22,163,74,0.18)'  };
}

function brpBar(brpStart: string, brpEnd: string) {
  const start   = new Date(brpStart).getTime();
  const end     = new Date(brpEnd).getTime();
  const now     = today.getTime();
  const pct     = Math.min(100, Math.max(0, ((now - start) / (end - start)) * 100));
  const days    = daysUntil(brpEnd);
  const color   = pct > 90 ? '#FF3B3B' : pct > 75 ? '#FF8C00' : '#16A34A';
  return { pct, days, color };
}

const PERIOD_LABELS: Record<string, string> = {
  initial: 'Initial', mid_year: 'Mid-Year', year_end: 'Year-End',
  second_year: '2nd Year', msd: 'MSD',
};
const STATUS_LABELS: Record<string, string> = {
  in_brp: 'In BRP', rfc_eligible: 'RFC Eligible', car_issued: 'CAR Issued',
  open: 'Open', resolved: 'Resolved',
};

const MOCK_CASES = [
  {
    id:'1', lot:'Lot 45', address:'123 Rideau Crest Dr', community:'Rideau Forest Ph2',
    homeowner:'Marcus & Diana Chen', enrollment:'H1892341',
    period_type:'year_end', status:'in_brp',
    brp_start:'2026-01-15', brp_end:'2026-05-15',
    items_total:12, items_done:7, items_outstanding:5,
    risk:'critical', tech:'Mike R.',
    evidence_score: 42,
    next_action:'Access log missing on 2 items',
  },
  {
    id:'2', lot:'Lot 12', address:'88 Stonehaven Ave', community:'Rideau Forest Ph2',
    homeowner:'Priya Sharma', enrollment:'H1890012',
    period_type:'initial', status:'in_brp',
    brp_start:'2026-02-10', brp_end:'2026-06-10',
    items_total:6, items_done:6, items_outstanding:0,
    risk:'good', tech:'Sarah L.',
    evidence_score: 95,
    next_action:'All items complete — ready to close',
  },
  {
    id:'3', lot:'Lot 78', address:'204 Maple Leaf Way', community:'Westpark Manors',
    homeowner:'Robert & Anne Patel', enrollment:'H1901234',
    period_type:'second_year', status:'rfc_eligible',
    brp_start:'2025-09-01', brp_end:'2026-01-01',
    items_total:9, items_done:4, items_outstanding:5,
    risk:'critical', tech: null,
    evidence_score: 28,
    next_action:'BRP expired — RFC eligible — conciliation risk',
  },
  {
    id:'4', lot:'Unit 302', address:'45 Waterfront Blvd #302', community:'Harbour Gate Condos',
    homeowner:'Jean-Pierre Leclair', enrollment:'H1885567',
    period_type:'msd', status:'car_issued',
    brp_start:'2025-06-01', brp_end:'2025-09-01',
    items_total:3, items_done:0, items_outstanding:3,
    risk:'critical', tech:'Dave K.',
    evidence_score: 55,
    next_action:'CAR issued — post-CAR deadline Apr 12',
  },
  {
    id:'5', lot:'Lot 23', address:'67 Crimson Oak Blvd', community:'Westpark Manors',
    homeowner:'Sandra Thompson', enrollment:'H1897723',
    period_type:'year_end', status:'in_brp',
    brp_start:'2026-02-28', brp_end:'2026-06-28',
    items_total:4, items_done:1, items_outstanding:3,
    risk:'warning', tech:'Mike R.',
    evidence_score: 67,
    next_action:'Schedule inspection — windows',
  },
];

const MOCK_PO_APPROVALS = [
  { id:'po1', tech:'Mike R.',  lot:'Lot 45',   trade:'Drywall Pro Inc.',    scope:'Patch & paint master bedroom', amount:1240, submitted:'2h ago',  urgent:true  },
  { id:'po2', tech:'Dave K.',  lot:'Unit 302', trade:'Structural Plus Ltd.', scope:'Beam assessment & report',     amount:3800, submitted:'4h ago',  urgent:true  },
  { id:'po3', tech:'Sarah L.', lot:'Lot 67',   trade:'GlassTech Windows',   scope:'Replace bedroom window seal',  amount:680,  submitted:'1d ago',  urgent:false },
];

const MOCK_DEADLINES = [
  { label:'Unit 302 — Post-CAR Due',  date:'2026-04-12', type:'car'  },
  { label:'Lot 78 — RFC Window',      date:'2026-04-20', type:'rfc'  },
  { label:'Lot 45 — BRP Expires',     date:'2026-05-15', type:'brp'  },
  { label:'Lot 12 — BRP Expires',     date:'2026-06-10', type:'brp'  },
  { label:'Lot 23 — BRP Expires',     date:'2026-06-28', type:'brp'  },
];

const TYPE_COLORS: Record<string, string> = { brp:'#1E5FA4', car:'#7C3AED', rfc:'#D97706' };

export default function WarrantyTodayPage() {
  const navigate = useNavigate();
  const [caseFilter, setCaseFilter] = useState<'all'|'critical'|'warning'|'good'>('all');

  const dateStr = today.toLocaleDateString('en-CA', {
    weekday:'long', month:'long', day:'numeric', year:'numeric',
  });

  const critical    = MOCK_CASES.filter(c => c.risk==='critical').length;
  const warning     = MOCK_CASES.filter(c => c.risk==='warning').length;
  const rfcCount    = MOCK_CASES.filter(c => c.status==='rfc_eligible').length;
  const lowEvidence = MOCK_CASES.filter(c => c.evidence_score < 60).length;
  const filtered    = MOCK_CASES.filter(c => caseFilter==='all' || c.risk===caseFilter);

  return (
    <div style={{ padding:'20px 28px', maxWidth:1440, margin:'0 auto', color:'var(--color-text)', fontFamily:'var(--font-body)' }}>

      {/* ── DATE + SYNC STATUS ── */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:20, fontWeight:800, letterSpacing:'-0.02em', color:'var(--color-text)', marginBottom:2 }}>
            Command Centre
          </h1>
          <p style={{ fontSize:12, color:'var(--color-muted)' }}>{dateStr}</p>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:7, background:'rgba(22,163,74,0.08)', border:'1px solid rgba(22,163,74,0.18)' }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#16A34A', boxShadow:'0 0 6px rgba(22,163,74,0.8)' }} />
            <span style={{ fontSize:11, color:'#16A34A', fontWeight:600 }}>Synced today 6:00 AM</span>
          </div>
        </div>
      </div>

      {/* ── STAT ROW ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Active Cases',      value:MOCK_CASES.length,  color:'var(--color-text)', sub:'across 3 communities',  click:() => navigate('/warranty/communities') },
          { label:'Critical Risk',     value:critical,            color:'#FF3B3B',            sub:'action required today', click:() => setCaseFilter('critical') },
          { label:'Warning',           value:warning,             color:'#FF8C00',            sub:'due within 14 days',    click:() => setCaseFilter('warning')  },
          { label:'RFC Eligible',      value:rfcCount,            color:'#D97706',            sub:'conciliation risk',     click:() => setCaseFilter('all')      },
          { label:'Low Evidence',      value:lowEvidence,         color:'#7C3AED',            sub:'chargeability risk',    click:() => setCaseFilter('all')      },
        ].map(s => (
          <div
            key={s.label}
            onClick={s.click}
            style={{ padding:'14px 16px', borderRadius:10, background:'var(--color-panel)', border:'1px solid var(--color-border)', cursor:'pointer', transition:'all 0.12s' }}
            onMouseEnter={e => e.currentTarget.style.borderColor='rgba(252,226,5,0.3)'}
            onMouseLeave={e => e.currentTarget.style.borderColor='var(--color-border)'}
          >
            <p style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.09em', color:'var(--color-muted)', marginBottom:6 }}>{s.label}</p>
            <p style={{ fontSize:28, fontWeight:900, color:s.color, fontFamily:'var(--font-mono)', letterSpacing:'-0.03em', lineHeight:1 }}>{s.value}</p>
            <p style={{ fontSize:10, color:'var(--color-muted)', marginTop:4 }}>{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ── PO APPROVALS BANNER ── */}
      {MOCK_PO_APPROVALS.length > 0 && (
        <div style={{ marginBottom:20, padding:'14px 18px', borderRadius:10, background:'var(--color-panel)', border:'1px solid var(--color-border)' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'#FF3B3B', boxShadow:'0 0 8px rgba(255,59,59,0.7)' }} />
              <p style={{ fontSize:13, fontWeight:700, color:'var(--color-text)' }}>
                PO Approvals Pending
              </p>
              <span style={{ fontSize:10, fontWeight:800, padding:'2px 8px', borderRadius:100, background:'rgba(255,59,59,0.10)', color:'#FF3B3B', border:'1px solid rgba(255,59,59,0.2)' }}>
                {MOCK_PO_APPROVALS.length} waiting
              </span>
            </div>
            <button
              onClick={() => navigate('/warranty/po-requests')}
              style={{ padding:'6px 14px', borderRadius:7, fontSize:11, fontWeight:700, background:'rgba(252,226,5,0.10)', border:'1px solid rgba(252,226,5,0.25)', color:'#8A7600', cursor:'pointer', fontFamily:'var(--font-body)' }}
            >
              Review All →
            </button>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
            {MOCK_PO_APPROVALS.map(po => (
              <div key={po.id} style={{ padding:'12px 14px', borderRadius:8, background:'var(--color-mist)', border:`1px solid ${po.urgent ? 'rgba(255,59,59,0.2)' : 'var(--color-border)'}`, cursor:'pointer' }}
                onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(252,226,5,0.3)'}
                onMouseLeave={e=>e.currentTarget.style.borderColor=po.urgent?'rgba(255,59,59,0.2)':'var(--color-border)'}
              >
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                  <span style={{ fontSize:12, fontWeight:700, color:'var(--color-text)' }}>{po.lot}</span>
                  <span style={{ fontSize:11, fontWeight:800, color:'#16A34A', fontFamily:'var(--font-mono)' }}>${po.amount.toLocaleString()}</span>
                </div>
                <p style={{ fontSize:11, color:'var(--color-muted)', marginBottom:4 }}>{po.trade}</p>
                <p style={{ fontSize:10, color:'var(--color-muted)', marginBottom:8 }}>{po.scope}</p>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                  <span style={{ fontSize:9, color:'var(--color-muted)' }}>Submitted by {po.tech} · {po.submitted}</span>
                  <div style={{ display:'flex', gap:5 }}>
                    <button style={{ padding:'3px 10px', borderRadius:5, fontSize:10, fontWeight:700, background:'rgba(22,163,74,0.12)', border:'1px solid rgba(22,163,74,0.25)', color:'#16A34A', cursor:'pointer', fontFamily:'var(--font-body)' }}>✓ Approve</button>
                    <button style={{ padding:'3px 10px', borderRadius:5, fontSize:10, fontWeight:600, background:'var(--color-mist)', border:'1px solid var(--color-border)', color:'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}>✕</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── MAIN TWO COLUMNS ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 320px', gap:16 }}>

        {/* LEFT — CASES */}
        <div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
            <div style={{ display:'flex', gap:6 }}>
              {[
                { id:'all',      label:'All Cases',   count:MOCK_CASES.length },
                { id:'critical', label:'🔴 Critical',  count:critical         },
                { id:'warning',  label:'🟡 Warning',   count:warning          },
                { id:'good',     label:'🟢 On Track',  count:MOCK_CASES.filter(c=>c.risk==='good').length },
              ].map(f => (
                <button key={f.id} onClick={() => setCaseFilter(f.id as any)} style={{ padding:'5px 12px', borderRadius:6, fontSize:11, fontWeight:caseFilter===f.id?700:400, background:caseFilter===f.id?'rgba(252,226,5,0.10)':'transparent', border:caseFilter===f.id?'1px solid rgba(252,226,5,0.25)':'1px solid var(--color-border)', color:caseFilter===f.id?'#8A7600':'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}>
                  {f.label} <span style={{ opacity:0.6, marginLeft:4 }}>{f.count}</span>
                </button>
              ))}
            </div>
            <button
              onClick={() => navigate('/warranty/communities')}
              style={{ padding:'5px 12px', borderRadius:6, fontSize:11, fontWeight:600, background:'var(--color-mist)', border:'1px solid var(--color-border)', color:'var(--color-muted)', cursor:'pointer', fontFamily:'var(--font-body)' }}
            >
              View Portfolio →
            </button>
          </div>

          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filtered.map(c => {
              const brp         = brpBar(c.brp_start, c.brp_end);
              const risk        = riskColor(brp.days);
              const periodLabel = PERIOD_LABELS[c.period_type] ?? c.period_type;
              const statusLabel = STATUS_LABELS[c.status]      ?? c.status;
              const evScore     = c.evidence_score;
              const evColor     = evScore >= 80 ? '#16A34A' : evScore >= 60 ? '#D97706' : '#FF3B3B';

              return (
                <div
                  key={c.id}
                  onClick={() => navigate(`/warranty/cases/${c.id}`)}
                  style={{ padding:'16px 18px', borderRadius:12, background:'var(--color-panel)', border:`1px solid ${c.risk==='critical'?'rgba(255,59,59,0.18)':c.risk==='warning'?'rgba(255,140,0,0.12)':'var(--color-border)'}`, cursor:'pointer', transition:'all 0.12s' }}
                  onMouseEnter={e=>e.currentTarget.style.background='var(--color-panel-raised)'}
                  onMouseLeave={e=>e.currentTarget.style.background='var(--color-panel)'}
                >
                  {/* Header */}
                  <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
                    <div style={{ flex:1 }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                        <span style={{ fontSize:13, fontWeight:800, color:'var(--color-text)' }}>{c.lot}</span>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:100, background:'var(--color-mist)', color:'var(--color-muted)', border:'1px solid var(--color-border)', textTransform:'uppercase', letterSpacing:'0.07em' }}>{periodLabel}</span>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:100, background:risk.bg, color:risk.text, border:`1px solid ${risk.border}`, textTransform:'uppercase', letterSpacing:'0.07em' }}>{statusLabel}</span>
                      </div>
                      <p style={{ fontSize:11, color:'var(--color-muted)', marginBottom:1 }}>{c.address} · {c.community}</p>
                      <p style={{ fontSize:11, color:'var(--color-muted)' }}>{c.homeowner} · <span style={{ fontFamily:'var(--font-mono)', fontSize:10 }}>{c.enrollment}</span></p>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0, marginLeft:16 }}>
                      <p style={{ fontSize:24, fontWeight:900, color:risk.text, fontFamily:'var(--font-mono)', lineHeight:1, letterSpacing:'-0.03em' }}>{brp.days > 0 ? brp.days : 0}</p>
                      <p style={{ fontSize:9, color:'var(--color-muted)', textTransform:'uppercase', letterSpacing:'0.08em', marginTop:2 }}>{brp.days > 0 ? 'days left' : 'EXPIRED'}</p>
                      <p style={{ fontSize:9, color:'var(--color-muted)', marginTop:1 }}>BRP</p>
                    </div>
                  </div>

                  {/* BRP Bar */}
                  <div style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                      <span style={{ fontSize:9, color:'var(--color-muted)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Builder Repair Period</span>
                      <span style={{ fontSize:9, color:'var(--color-muted)', fontFamily:'var(--font-mono)' }}>
                        {new Date(c.brp_start).toLocaleDateString('en-CA',{month:'short',day:'numeric'})} → {new Date(c.brp_end).toLocaleDateString('en-CA',{month:'short',day:'numeric',year:'numeric'})}
                      </span>
                    </div>
                    <div style={{ height:4, borderRadius:100, background:'var(--color-mist)', overflow:'hidden' }}>
                      <div style={{ height:'100%', width:`${brp.pct}%`, borderRadius:100, background:brp.color, boxShadow:`0 0 6px ${brp.color}50` }} />
                    </div>
                  </div>

                  {/* Footer row */}
                  <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                    {/* Items */}
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <div style={{ display:'flex', gap:2 }}>
                        {Array.from({ length:c.items_total }).map((_,i) => (
                          <div key={i} style={{ width:6, height:6, borderRadius:1, background:i<c.items_done?'#16A34A':'var(--color-mist)', border:'1px solid var(--color-border)' }} />
                        ))}
                      </div>
                      <span style={{ fontSize:10, color:'var(--color-muted)', fontFamily:'var(--font-mono)' }}>{c.items_done}/{c.items_total}</span>
                      {c.items_outstanding > 0 && <span style={{ fontSize:10, color:risk.text, fontWeight:700 }}>{c.items_outstanding} outstanding</span>}
                    </div>

                    {/* Evidence score */}
                    <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                      <div style={{ width:36, height:4, borderRadius:100, background:'var(--color-mist)', overflow:'hidden' }}>
                        <div style={{ height:'100%', width:`${evScore}%`, background:evColor, borderRadius:100 }} />
                      </div>
                      <span style={{ fontSize:9, color:evColor, fontWeight:700 }}>{evScore}% evidence</span>
                    </div>

                    {c.tech && (
                      <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                        <div style={{ width:16, height:16, borderRadius:'50%', background:'rgba(252,226,5,0.12)', border:'1px solid rgba(252,226,5,0.3)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:8, fontWeight:800, color:'#8A7600' }}>
                          {c.tech.charAt(0)}
                        </div>
                        <span style={{ fontSize:10, color:'var(--color-muted)' }}>{c.tech}</span>
                      </div>
                    )}

                    <div style={{ flex:1 }} />

                    {/* Next action */}
                    <div style={{ padding:'3px 10px', borderRadius:5, background:risk.bg, border:`1px solid ${risk.border}`, fontSize:10, color:risk.text, fontWeight:600 }}>
                      {c.next_action}
                    </div>

                    {/* Open case button */}
                    <div style={{ padding:'4px 10px', borderRadius:5, background:'rgba(252,226,5,0.08)', border:'1px solid rgba(252,226,5,0.2)', fontSize:10, color:'#8A7600', fontWeight:700 }}>
                      Open Case →
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT — DEADLINES */}
        <div>
          <p style={{ fontSize:12, fontWeight:700, color:'var(--color-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>
            Tarion Deadlines
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:24 }}>
            {MOCK_DEADLINES
              .sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime())
              .map(d => {
                const days = daysUntil(d.date);
                const r    = riskColor(days);
                return (
                  <div key={d.label} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', borderRadius:8, background:'var(--color-panel)', border:`1px solid ${days<=7?r.border:'var(--color-border)'}` }}>
                    <span style={{ fontSize:9, fontWeight:800, padding:'2px 7px', borderRadius:4, background:`${TYPE_COLORS[d.type]}12`, color:TYPE_COLORS[d.type], border:`1px solid ${TYPE_COLORS[d.type]}25`, textTransform:'uppercase', letterSpacing:'0.08em', flexShrink:0 }}>{d.type.toUpperCase()}</span>
                    <span style={{ fontSize:11, color:'var(--color-muted)', flex:1 }}>{d.label}</span>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <p style={{ fontSize:14, fontWeight:900, color:r.text, fontFamily:'var(--font-mono)', lineHeight:1 }}>{days}d</p>
                      <p style={{ fontSize:9, color:'var(--color-muted)' }}>{new Date(d.date).toLocaleDateString('en-CA',{month:'short',day:'numeric'})}</p>
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Evidence health summary */}
          <p style={{ fontSize:12, fontWeight:700, color:'var(--color-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:12 }}>
            Evidence Health
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
            {MOCK_CASES.filter(c => c.evidence_score < 80).sort((a,b) => a.evidence_score - b.evidence_score).map(c => {
              const evColor = c.evidence_score >= 60 ? '#D97706' : '#FF3B3B';
              return (
                <div key={c.id} onClick={() => navigate(`/warranty/cases/${c.id}`)} style={{ padding:'10px 12px', borderRadius:8, background:'var(--color-panel)', border:'1px solid var(--color-border)', cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='rgba(252,226,5,0.3)'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='var(--color-border)'}
                >
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:'var(--color-text)' }}>{c.lot}</span>
                    <span style={{ fontSize:12, fontWeight:900, color:evColor, fontFamily:'var(--font-mono)' }}>{c.evidence_score}%</span>
                  </div>
                  <div style={{ height:3, borderRadius:100, background:'var(--color-mist)', overflow:'hidden', marginBottom:5 }}>
                    <div style={{ height:'100%', width:`${c.evidence_score}%`, background:evColor, borderRadius:100 }} />
                  </div>
                  <p style={{ fontSize:10, color:'var(--color-muted)' }}>
                    {c.evidence_score < 60 ? '⚠️ High chargeability risk — add evidence before conciliation' : 'Add access logs and photos'}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}