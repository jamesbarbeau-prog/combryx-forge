// Community dashboard: Tarion form calendar (deadline timeline + stage cards) and every home in the community.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { FORMS, FORM_BY_ID, currentForm, stagesFor, parseDay, addDays, daysBetween, fmtDay, type FormCase, type FormId, type StageInfo } from '@/lib/warrantyclock';

interface Row { lot_id: string; lot_number: string; address: string | null; owner: string | null; enrollment: string | null; model: string | null; start_date: string | null; forms: FormCase[]; conciliations: number }
interface Enriched extends Row { start: Date | null; stage: FormId | 'pre' | 'msd' | null; stages: StageInfo[]; open: number; total: number; nextBrp: StageInfo | null }
const FILTERS: { id: string; label: string }[] = [{ id: 'pre', label: 'Before Initial' }, ...FORMS.map(f => ({ id: f.id, label: f.short })), { id: 'msd', label: '3–7 year' }];
const MONTH = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export default function CommunityPage() {
  const { projectId } = useParams();
  const nav = useNavigate();
  const [name, setName] = useState('');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState('');
  const [stageF, setStageF] = useState<string>('');
  const [month, setMonth] = useState<string>('');
  const [metric, setMetric] = useState<'brp' | 'submit'>('brp');
  const [q, setQ] = useState('');
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) return;
    setRows(null); setErr(''); setStageF(''); setMonth('');
    supabase.from('warranty_communities').select('name').eq('id', projectId).maybeSingle().then(({ data }) => setName(data?.name ?? ''));
    supabase.rpc('community_overview', { p_community: projectId }).then(({ data, error }) => { if (error) setErr(error.message); else setRows((data ?? []) as Row[]); });
  }, [projectId]);

  const today = useMemo(() => new Date(), []);
  const homes: Enriched[] = useMemo(() => (rows ?? []).map(r => {
    const start = parseDay(r.start_date);
    const stages = stagesFor(start, r.forms, today);
    const open = r.forms.reduce((n, c) => n + c.open, 0), total = r.forms.reduce((n, c) => n + c.items, 0);
    // the repair period that matters now: the soonest one still running, otherwise the most recent one that lapsed with items still open
    const live = stages.filter(s => s.state === 'brp').sort((a, b) => a.daysLeft - b.daysLeft)[0]
      ?? stages.filter(s => s.state === 'expired' && s.open > 0).sort((a, b) => b.daysLeft - a.daysLeft)[0] ?? null;
    return { ...r, start, stage: currentForm(start, today), stages, open, total, nextBrp: live };
  }), [rows, today]);

  // Timeline: 3 months back to 9 months ahead
  const months = useMemo(() => Array.from({ length: 13 }, (_, i) => { const d = new Date(today.getFullYear(), today.getMonth() - 3 + i, 1); return { key: MONTH(d), label: d.toLocaleDateString('en-CA', { month: 'short' }), year: d.getFullYear(), isNow: i === 3 }; }), [today]);
  const series = useMemo(() => {
    const m = new Map<string, Record<FormId, number>>(); months.forEach(x => m.set(x.key, { initial: 0, mid_year: 0, year_end: 0, second_year: 0 }));
    for (const h of homes) for (const s of h.stages) {
      const when = metric === 'brp' ? s.brpEnd : s.submit;
      if (metric === 'brp' && s.state === 'done') continue;
      if (metric === 'brp' && when < today && s.open === 0) continue;
      const b = m.get(MONTH(when)); if (b) b[s.id]++;
    }
    return m;
  }, [homes, months, metric, today]);

  const kpi = useMemo(() => {
    let due30 = 0, expired = 0, items = 0, cases = 0;
    for (const h of homes) {
      items += h.open; cases += h.forms.filter(c => !c.closed).length;
      if (h.nextBrp) { if (h.nextBrp.daysLeft < 0) expired++; else if (h.nextBrp.daysLeft <= 30) due30++; }
    }
    return { due30, expired, items, cases };
  }, [homes]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; homes.forEach(h => { const k = h.stage ?? 'none'; c[k] = (c[k] ?? 0) + 1; }); return c; }, [homes]);

  const shown = useMemo(() => homes.filter(h => {
    if (stageF && h.stage !== stageF) return false;
    if (month && !h.stages.some(s => MONTH(metric === 'brp' ? s.brpEnd : s.submit) === month)) return false;
    const t = q.trim().toLowerCase();
    return !t || t.split(/\s+/).every(w => `${h.address} ${h.lot_number} ${h.owner} ${h.enrollment}`.toLowerCase().includes(w));
  }).sort((a, b) => (a.nextBrp?.daysLeft ?? 9999) - (b.nextBrp?.daysLeft ?? 9999) || (a.address ?? '').localeCompare(b.address ?? '')), [homes, stageF, month, q, metric]);

  const max = Math.max(1, ...[...series.values()].map(v => v.initial + v.mid_year + v.year_end + v.second_year));
  const W = 780, H = 250, L = 34, B = 34, T = 14, bw = (W - L - 10) / months.length;
  const nowIdx = months.findIndex(m => m.isNow);

  if (err) return <div className="cp"><div className="cp-err">{err}</div></div>;
  return (
    <div className="cp">
      <style>{CSS}</style>
      <div className="cp-head">
        <div><div className="cp-eyebrow">Community overview</div><h1>{name || 'Community'}</h1></div>
        <div className="cp-sub">{rows ? `${homes.length} homes · calendar from each home’s possession date` : 'Loading…'}</div>
      </div>

      <div className="cp-kpis">
        {[{ l: 'Homes', n: homes.length, h: 'in this community' }, { l: 'Open cases', n: kpi.cases, h: 'across all forms' }, { l: 'Open items', n: kpi.items, h: 'still outstanding', c: '#1E5FC8' },
          { l: 'Repair period ends ≤ 30 days', n: kpi.due30, h: 'homes', c: '#D97706' }, { l: 'Repair period passed', n: kpi.expired, h: 'with items still open', c: '#D64B3A' }].map(k => (
          <div className="cp-kpi" key={k.l}><div className="l">{k.l}</div><div className="n" style={{ color: k.c ?? '#0B132B' }}>{rows ? k.n.toLocaleString() : '—'}</div><div className="h">{k.h}</div></div>))}
      </div>

      <div className="cp-card">
        <div className="cp-row"><div><h2>Deadline timeline</h2><div className="cp-sub">{metric === 'brp' ? 'Builder repair periods ending, by month' : 'Forms submitted to the builder, by month'} — click a month to list those homes</div></div><div style={{ flex: 1 }} />
          <div className="cp-seg"><button className={metric === 'brp' ? 'on' : ''} onClick={() => { setMetric('brp'); setMonth(''); }}>Repair deadlines</button><button className={metric === 'submit' ? 'on' : ''} onClick={() => { setMetric('submit'); setMonth(''); }}>Form submissions</button></div></div>
        <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block', marginTop: 8 }} role="img" aria-label="Deadline timeline">
          {[0, 0.25, 0.5, 0.75, 1].map(f => { const y = T + (H - T - B) * (1 - f); return <g key={f}><line x1={L} x2={W} y1={y} y2={y} stroke="#E8EDF5" /><text x={L - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#7B8AA0">{Math.round(max * f)}</text></g>; })}
          {months.map((m, i) => {
            const v = series.get(m.key)!; let y = H - B; const x = L + i * bw + 5, w = bw - 10, sel = month === m.key;
            const total = v.initial + v.mid_year + v.year_end + v.second_year;
            return (
              <g key={m.key} style={{ cursor: total ? 'pointer' : 'default' }} onClick={() => total && setMonth(sel ? '' : m.key)} onMouseEnter={() => setHover(m.key)} onMouseLeave={() => setHover(null)} opacity={month && !sel ? 0.45 : 1}>
                <rect x={x - 3} y={T} width={w + 6} height={H - T - B} fill={hover === m.key || sel ? 'rgba(37,99,235,0.06)' : 'transparent'} rx="6" />
                {FORMS.map(f => { const n = v[f.id]; if (!n) return null; const h = (n / max) * (H - T - B - 6); y -= h; return <rect key={f.id} x={x} y={y} width={w} height={Math.max(h - 1.5, 1)} fill={f.color} rx="2"><title>{`${f.short}: ${n}`}</title></rect>; })}
                {total > 0 && <text x={x + w / 2} y={y - 5} textAnchor="middle" fontSize="11" fontWeight="700" fill="#0F172A">{total}</text>}
                <text x={x + w / 2} y={H - 16} textAnchor="middle" fontSize="11" fontWeight={m.isNow ? 800 : 500} fill={m.isNow ? '#1D4ED8' : '#475569'}>{m.label}</text>
                {(m.label === 'Jan' || i === 0) && <text x={x + w / 2} y={H - 3} textAnchor="middle" fontSize="9.5" fill="#7B8AA0">{m.year}</text>}
              </g>);
          })}
          {nowIdx >= 0 && <g><line x1={L + nowIdx * bw + bw / 2} x2={L + nowIdx * bw + bw / 2} y1={T} y2={H - B} stroke="#F2B134" strokeWidth="2" strokeDasharray="4 3" /><text x={L + nowIdx * bw + bw / 2} y={T + 2} textAnchor="middle" fontSize="9.5" fontWeight="800" fill="#B45309">TODAY</text></g>}
        </svg>
        <div className="cp-legend">{FORMS.map(f => <span key={f.id}><i style={{ background: f.color }} />{f.short}</span>)}</div>
      </div>

      <div className="cp-stages">
        {FILTERS.map(s => {
          const f = FORM_BY_ID[s.id as FormId]; const on = stageF === s.id; const n = counts[s.id] ?? 0;
          const atRisk = homes.filter(h => h.stage === s.id && h.nextBrp && h.nextBrp.daysLeft <= 30 && h.nextBrp.daysLeft >= 0).length;
          const past = homes.filter(h => h.stage === s.id && h.nextBrp && h.nextBrp.daysLeft < 0).length;
          const items = homes.filter(h => h.stage === s.id).reduce((a, h) => a + h.open, 0);
          return (
            <button key={s.id} className={`cp-stage${on ? ' on' : ''}`} onClick={() => setStageF(on ? '' : s.id)} style={{ borderTopColor: f?.color ?? '#94A3B8' }}>
              <div className="t">{s.label}</div><div className="n">{n}</div><div className="h">homes at this stage</div>
              <div className="m"><span>{items.toLocaleString()} open items</span>{atRisk > 0 && <b style={{ color: '#B45309' }}>{atRisk} ending ≤30d</b>}{past > 0 && <b style={{ color: '#D64B3A' }}>{past} past</b>}</div>
            </button>);
        })}
      </div>

      <div className="cp-card">
        <div className="cp-row"><h2>Homes{shown.length !== homes.length ? ` (${shown.length} of ${homes.length})` : ` (${homes.length})`}</h2><div style={{ flex: 1 }} />
          {(stageF || month) && <button className="cp-clear" onClick={() => { setStageF(''); setMonth(''); }}>Clear filters ✕</button>}
          <input placeholder="Filter this community…" value={q} onChange={e => setQ(e.target.value)} /></div>
        <div className="cp-scroll"><table>
          <thead><tr><th>Home</th><th>Owner</th><th>Enrolment</th><th>At</th><th>Next repair deadline</th><th className="r">Open / items</th><th className="r">Cases</th></tr></thead>
          <tbody>{shown.slice(0, 300).map(h => (
            <tr key={h.lot_id} onClick={() => nav(`/warranty/lots/${h.lot_id}`)}>
              <td><b>{(h.address ?? '').replace(/, Ottawa.*$/i, '') || `Lot ${h.lot_number}`}</b><div className="s">Lot {h.lot_number}{h.model ? ` · ${h.model}` : ''}</div></td>
              <td>{h.owner || <span className="s">No purchaser on file</span>}</td>
              <td className="mono">{h.enrollment || '—'}</td>
              <td>{h.stage ? <span className="pill" style={{ background: (FORM_BY_ID[h.stage as FormId]?.color ?? '#94A3B8') + '26', color: '#0F172A' }}>{FILTERS.find(f => f.id === h.stage)?.label}</span> : <span className="s">No start date</span>}</td>
              <td>{h.nextBrp ? <span className={`pill ${h.nextBrp.daysLeft < 0 ? 'r' : h.nextBrp.daysLeft <= 30 ? 'a' : ''}`}>{h.nextBrp.daysLeft < 0 ? `${-h.nextBrp.daysLeft}d past` : `${h.nextBrp.daysLeft}d left`}</span> : null}{h.nextBrp && <div className="s">{FORM_BY_ID[h.nextBrp.id].short} · {fmtDay(h.nextBrp.brpEnd)}{h.nextBrp.fromTarion ? '' : ' (calc.)'}</div>}</td>
              <td className="r">{h.open}<span className="s"> / {h.total}</span></td>
              <td className="r">{h.forms.length}{h.conciliations ? <span className="pill a" style={{ marginLeft: 6 }}>{h.conciliations} concil.</span> : null}</td>
            </tr>))}
            {rows && !shown.length && <tr><td colSpan={7} className="s" style={{ padding: 18 }}>No homes match.</td></tr>}
          </tbody></table></div>
        {shown.length > 300 && <div className="cp-sub" style={{ padding: '8px 4px' }}>Showing the first 300 — use the filter above to narrow.</div>}
      </div>
    </div>);
}

const CSS = `
.cp{max-width:1480px;margin:0 auto;padding:22px 28px 60px;font-family:var(--font-body)}
.cp h1{margin:2px 0 0;font:800 26px var(--font-body);color:#0B132B;letter-spacing:-.01em}.cp h2{margin:0;font:800 15px var(--font-body);color:#0B132B}
.cp-head{display:flex;align-items:flex-end;gap:16px;margin-bottom:16px}.cp-head>div:last-child{margin-left:auto}
.cp-eyebrow{font:800 11px var(--font-body);letter-spacing:.18em;text-transform:uppercase;color:#2563EB}
.cp-sub{font-size:12.5px;color:#475569}.cp-err{padding:14px;background:#FEF2F2;border:1px solid #FECACA;border-radius:10px;color:#991B1B}
.cp-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:14px}
.cp-kpi{position:relative;background:#fff;border:1px solid #DDE5F1;border-radius:14px;padding:15px 17px 13px;box-shadow:0 1px 2px rgba(11,19,43,.04);overflow:hidden}
.cp-kpi::before{content:'';position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,#2563EB,#7AAEF0)}
.cp-kpi .l{font:700 11.5px var(--font-body);color:#475569}.cp-kpi .n{font:800 30px var(--font-body);margin-top:4px;font-variant-numeric:tabular-nums}.cp-kpi .h{font-size:11.5px;color:#7B8AA0}
.cp-card{background:#fff;border:1px solid #DDE5F1;border-radius:16px;padding:18px 20px;box-shadow:0 1px 2px rgba(11,19,43,.04);margin-bottom:14px}
.cp-row{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.cp-seg{display:flex;background:#EEF2F8;border-radius:10px;padding:3px}.cp-seg button{border:0;background:transparent;padding:6px 12px;border-radius:8px;font:700 12px var(--font-body);color:#475569;cursor:pointer}.cp-seg button.on{background:#fff;color:#1D4ED8;box-shadow:0 1px 3px rgba(11,19,43,.12)}
.cp-legend{display:flex;gap:16px;margin-top:4px;font-size:12px;color:#475569}.cp-legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:6px;vertical-align:-1px}
.cp-stages{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;margin-bottom:14px}
.cp-stage{text-align:left;font-family:var(--font-body);background:#fff;border:1px solid #DDE5F1;border-top:5px solid #94A3B8;border-radius:14px;padding:13px 15px;cursor:pointer;transition:transform .12s,box-shadow .12s}
.cp-stage:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(11,19,43,.12)}.cp-stage.on{outline:2px solid #2563EB;outline-offset:1px}
.cp-stage .t{font:800 12.5px var(--font-body);color:#0B132B}.cp-stage .n{font:800 28px var(--font-body);color:#0B132B;margin-top:2px}.cp-stage .h{font-size:11px;color:#7B8AA0}
.cp-stage .m{display:flex;flex-direction:column;gap:2px;margin-top:8px;font-size:11.5px;color:#475569}
.cp input{height:34px;border:1px solid #CBD5E1;border-radius:9px;padding:0 11px;font:500 13px var(--font-body);width:240px}
.cp-clear{border:1px solid #CBD5E1;background:#fff;border-radius:9px;padding:6px 11px;font:700 12px var(--font-body);cursor:pointer}
.cp-scroll{overflow:auto;margin-top:10px;max-height:640px}.cp table{width:100%;border-collapse:collapse;font-size:13px}
.cp th{position:sticky;top:0;background:#F8FAFD;text-align:left;font:800 11px var(--font-body);letter-spacing:.06em;text-transform:uppercase;color:#475569;padding:9px 10px;border-bottom:1px solid #DDE5F1}
.cp td{padding:9px 10px;border-bottom:1px solid #EDF1F8;vertical-align:top}.cp tbody tr{cursor:pointer}.cp tbody tr:hover{background:#F4F8FF}
.cp .r{text-align:right}.cp .s{font-size:11.5px;color:#7B8AA0;font-weight:500}.cp .mono{font-family:'JetBrains Mono',monospace;font-size:12px}
.cp .pill{display:inline-block;padding:2px 9px;border-radius:999px;font:700 11.5px var(--font-body);background:#EEF2F8;color:#334155}.cp .pill.a{background:#FEF3C7;color:#92400E}.cp .pill.r{background:#FDE4E0;color:#B42318}
@media(max-width:1100px){.cp-kpis{grid-template-columns:repeat(2,1fr)}.cp-stages{grid-template-columns:repeat(3,1fr)}}
@media(max-width:640px){.cp{padding:14px}.cp-stages{grid-template-columns:repeat(2,1fr)}}
`;
