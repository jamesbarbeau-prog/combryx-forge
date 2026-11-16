// Portfolio view: repair-deadline exposure, open items by form, community workload and a deadline heatmap.
// Built from the same per-home calendar the community pages use, so every number can be traced to a home.
import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { FORMS, stagesFor, parseDay, type FormCase, type FormId, type StageInfo } from '@/lib/warrantyclock';

interface Row { lot_id: string; start_date: string | null; forms: FormCase[] }
interface Comm { id: string; name: string; lots: number; homes: { open: number; stages: StageInfo[]; nextBrp: StageInfo | null }[] }

export const RAMP: Record<FormId, string> = { initial: '#1F3A5A', mid_year: '#3F7CAC', year_end: '#B8903F', second_year: '#A9C4DB' };
const MONTH = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export interface Portfolio { comms: Comm[]; due30: number; passed: number; openItems: number; ready: boolean }

export function usePortfolio(): Portfolio {
  const [comms, setComms] = useState<Comm[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let live = true;
    (async () => {
      const { data: counts } = await supabase.rpc('community_counts');
      const list = (counts ?? []) as { community_id: string; name: string; lots: number }[];
      const today = new Date();
      const out = await Promise.all(list.map(async c => {
        const { data } = await supabase.rpc('community_overview', { p_community: c.community_id });
        const homes = ((data ?? []) as Row[]).map(r => {
          const stages = stagesFor(parseDay(r.start_date), r.forms, today);
          const open = r.forms.reduce((n, f) => n + f.open, 0);
          const nextBrp = stages.filter(s => s.state === 'brp').sort((a, b) => a.daysLeft - b.daysLeft)[0]
            ?? stages.filter(s => s.state === 'expired' && s.open > 0).sort((a, b) => b.daysLeft - a.daysLeft)[0] ?? null;
          return { open, stages, nextBrp };
        });
        return { id: c.community_id, name: c.name, lots: c.lots, homes } as Comm;
      }));
      if (live) { setComms(out); setReady(true); }
    })();
    return () => { live = false; };
  }, []);
  return useMemo(() => {
    let due30 = 0, passed = 0, openItems = 0;
    for (const c of comms) for (const h of c.homes) {
      openItems += h.open;
      if (h.nextBrp) { if (h.nextBrp.daysLeft < 0) passed++; else if (h.nextBrp.daysLeft <= 30) due30++; }
    }
    return { comms, due30, passed, openItems, ready };
  }, [comms, ready]);
}

function Panel({ title, sub, children, right }: { title: string; sub?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="pf-panel">
      <header><div><h3>{title}</h3>{sub && <p>{sub}</p>}</div>{right}</header>
      {children}
    </section>
  );
}

export default function PortfolioCharts({ pf }: { pf: Portfolio }) {
  const nav = useNavigate();
  const today = useMemo(() => new Date(), []);
  const [hover, setHover] = useState<string | null>(null);
  const [off, setOff] = useState<FormId[]>([]);
  const [hs, setHs] = useState<string | null>(null);

  const months = useMemo(() => Array.from({ length: 13 }, (_, i) => {
    const d = new Date(today.getFullYear(), today.getMonth() - 3 + i, 1);
    return { key: MONTH(d), label: d.toLocaleDateString('en-CA', { month: 'short' }), year: d.getFullYear(), isNow: i === 3 };
  }), [today]);

  // exposure: repair periods still running, or lapsed with items open, by month of their end date
  const { series, heat, byForm, perComm } = useMemo(() => {
    const series = new Map<string, Record<FormId, number>>(); months.forEach(m => series.set(m.key, { initial: 0, mid_year: 0, year_end: 0, second_year: 0 }));
    const heat = new Map<string, Map<string, number>>();
    const byForm: Record<FormId, number> = { initial: 0, mid_year: 0, year_end: 0, second_year: 0 };
    const perComm: { id: string; name: string; per100: number; items: number; homes: number }[] = [];
    for (const c of pf.comms) {
      const hm = new Map<string, number>(); heat.set(c.id, hm);
      let items = 0;
      for (const h of c.homes) {
        items += h.open;
        for (const s of h.stages) {
          byForm[s.id] += s.open;
          if (s.state === 'done' || (s.brpEnd < today && s.open === 0)) continue;
          const k = MONTH(s.brpEnd);
          const b = series.get(k); if (b) b[s.id]++;
          hm.set(k, (hm.get(k) ?? 0) + 1);
        }
      }
      perComm.push({ id: c.id, name: c.name, per100: c.homes.length ? (items / c.homes.length) * 100 : 0, items, homes: c.homes.length });
    }
    return { series, heat, byForm, perComm: perComm.sort((a, b) => b.per100 - a.per100) };
  }, [pf.comms, months, today]);

  const shown = FORMS.filter(f => !off.includes(f.id));
  const totals = months.map(m => shown.reduce((a, f) => a + series.get(m.key)![f.id], 0));
  const max = Math.max(4, ...totals);
  const W = 760, H = 250, L = 32, B = 32, T = 16, bw = (W - L - 8) / months.length;
  const gridMax = Math.ceil(max / 4) * 4;
  const yOf = (n: number) => T + (H - T - B) * (1 - n / gridMax);
  const avg = perComm.length ? perComm.reduce((a, c) => a + c.items, 0) / Math.max(1, perComm.reduce((a, c) => a + c.homes, 0)) * 100 : 0;
  const maxPer = Math.max(1, ...perComm.map(c => c.per100));
  const heatMonths = months.slice(3, 12);
  const heatMax = Math.max(1, ...[...heat.values()].flatMap(m => [...m.values()]));
  const itemTotal = FORMS.reduce((a, f) => a + byForm[f.id], 0);

  // donut geometry
  const R = 62, SW = 22, CIRC = 2 * Math.PI * R;
  let acc = 0;

  const empty = !pf.ready;
  return (
    <div className="pf">
      <style>{CSS}</style>
      <div className="pf-row two">
        <Panel title="Repair deadline exposure" sub="Builder repair periods ending, by month and form"
          right={<div className="pf-legend">{FORMS.map(f => <button key={f.id} className={off.includes(f.id) ? 'off' : ''} onClick={() => setOff(o => o.includes(f.id) ? o.filter(x => x !== f.id) : [...o, f.id])}><i style={{ background: RAMP[f.id] }} />{f.short}</button>)}</div>}>
          <div style={{ position: 'relative' }}>
            {hover && (() => {
              const i = months.findIndex(m => m.key === hover); if (i < 0) return null; const v = series.get(hover)!;
              return <div className="pf-tip" style={{ left: `${((L + i * bw + bw / 2) / W) * 100}%` }}><b>{months[i].label} {months[i].year}</b>
                {FORMS.map(f => <div key={f.id}><i style={{ background: RAMP[f.id] }} />{f.short}<span>{v[f.id]}</span></div>)}<div className="t">Total<span>{FORMS.reduce((a, f) => a + v[f.id], 0)}</span></div></div>;
            })()}
            <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Repair deadlines by month" style={{ width: '100%', height: 'auto', display: 'block' }}>
              {[0, 0.25, 0.5, 0.75, 1].map(f => { const y = yOf(gridMax * f); return <g key={f}><line x1={L} x2={W} y1={y} y2={y} stroke="#DDD6C9" /><text x={L - 6} y={y + 4} textAnchor="end" fontSize="10" fill="#6C7280">{Math.round(gridMax * f)}</text></g>; })}
              {months.map((m, i) => {
                const v = series.get(m.key)!; const x = L + i * bw + 5, w = bw - 10; let y = H - B;
                return (
                  <g key={m.key} onMouseEnter={() => setHover(m.key)} onMouseLeave={() => setHover(null)}>
                    <rect x={x - 3} y={T} width={w + 6} height={H - T - B} fill={hover === m.key ? 'rgba(63,106,143,0.08)' : 'transparent'} rx="4" />
                    {shown.map(f => { const n = v[f.id]; if (!n) return null; const h = (H - T - B) * (n / gridMax); y -= h; return <rect key={f.id} x={x} y={y} width={w} height={Math.max(h - 2, 1)} fill={RAMP[f.id]} rx="2" />; })}
                    <text x={x + w / 2} y={H - 15} textAnchor="middle" fontSize="11" fontWeight={m.isNow ? 800 : 500} fill={m.isNow ? '#2F5576' : '#485163'}>{m.label}</text>
                    {(m.label === 'Jan' || i === 0) && <text x={x + w / 2} y={H - 3} textAnchor="middle" fontSize="9.5" fill="#6C7280">{m.year}</text>}
                  </g>);
              })}
              <polyline fill="none" stroke="#1F2A3C" strokeWidth="1.6" points={totals.map((t, i) => `${L + i * bw + bw / 2},${yOf(t)}`).join(' ')} />
              {totals.map((t, i) => <circle key={i} cx={L + i * bw + bw / 2} cy={yOf(t)} r="3" fill="#F8F6F1" stroke="#1F2A3C" strokeWidth="1.6" />)}
              <line x1={L + 3 * bw + bw / 2} x2={L + 3 * bw + bw / 2} y1={T} y2={H - B} stroke="#B08D4F" strokeWidth="1.5" strokeDasharray="4 3" />
              <text x={L + 3 * bw + bw / 2 + 5} y={T + 9} fontSize="10" fontWeight="700" fill="#8A6A2E">Today</text>
            </svg>
            {empty && <div className="pf-load">Loading deadlines…</div>}
          </div>
          <div className="pf-note"><i /> Line is the total across the forms shown. Hover a month for the breakdown.</div>
        </Panel>

        <Panel title="Open items by form" sub="Items still outstanding, by the form they came from">
          <div className="pf-donut">
            <svg viewBox="0 0 160 160" width="150" height="150" role="img" aria-label="Open items by form">
              <circle cx="80" cy="80" r={R} fill="none" stroke="#E6E0D5" strokeWidth={SW} />
              {FORMS.map(f => { const frac = itemTotal ? byForm[f.id] / itemTotal : 0; const len = frac * CIRC; const el = <circle key={f.id} cx="80" cy="80" r={R} fill="none" stroke={RAMP[f.id]} strokeWidth={hs === f.id ? SW + 4 : SW} strokeDasharray={`${Math.max(len - 2, 0)} ${CIRC}`} strokeDashoffset={-acc} transform="rotate(-90 80 80)" onMouseEnter={() => setHs(f.id)} onMouseLeave={() => setHs(null)} style={{ transition: 'stroke-width .12s' }} />; acc += len; return el; })}
              <text x="80" y="78" textAnchor="middle" fontSize="22" fontWeight="800" fill="#1F2A3C">{itemTotal.toLocaleString()}</text>
              <text x="80" y="95" textAnchor="middle" fontSize="11" fill="#485163">open items</text>
            </svg>
            <ul>{FORMS.map(f => <li key={f.id} className={hs === f.id ? 'on' : ''} onMouseEnter={() => setHs(f.id)} onMouseLeave={() => setHs(null)}><i style={{ background: RAMP[f.id] }} />{f.short}<b>{itemTotal ? Math.round((byForm[f.id] / itemTotal) * 100) : 0}%</b><span>{byForm[f.id].toLocaleString()}</span></li>)}</ul>
          </div>
        </Panel>
      </div>

      <div className="pf-row two b">
        <Panel title="Community workload" sub="Open items per 100 homes. Select a community to open it.">
          <div className="pf-bars">
            {perComm.map(c => (
              <button key={c.id} onClick={() => nav(`/warranty/communities/${c.id}`)} title={`${c.items.toLocaleString()} open items across ${c.homes} homes`}>
                <span className="nm">{c.name}</span>
                <span className="track"><span className="bar" style={{ width: `${(c.per100 / maxPer) * 100}%`, background: c.per100 > avg * 1.15 ? '#B8903F' : '#3F7CAC' }} /><span className="avg" style={{ left: `${(avg / maxPer) * 100}%` }} /></span>
                <span className="v">{Math.round(c.per100)}</span>
              </button>
            ))}
            {!perComm.length && <div className="pf-load static">{empty ? 'Loading…' : 'No data'}</div>}
          </div>
          <div className="pf-note"><i className="dash" /> Portfolio average {Math.round(avg)}. Brass bars are more than 15% above it.</div>
        </Panel>

        <Panel title="Deadline heatmap" sub="Repair periods ending, by community and month. Darker means more homes.">
          <div className="pf-heat" style={{ gridTemplateColumns: `128px repeat(${heatMonths.length}, minmax(0,1fr))` }}>
            <span />{heatMonths.map(m => <span key={m.key} className="hm">{m.label}</span>)}
            {pf.comms.map(c => (
              <div key={c.id} style={{ display: 'contents' }}>
                <button className="rn" onClick={() => nav(`/warranty/communities/${c.id}`)}>{c.name}</button>
                {heatMonths.map(m => { const n = heat.get(c.id)?.get(m.key) ?? 0; const a = n ? 0.16 + 0.84 * (n / heatMax) : 0; return <span key={m.key} className="cell" title={`${c.name}, ${m.label} ${m.year}: ${n}`} style={{ background: n ? `rgba(31,58,90,${a})` : '#EFEBE2', color: a > 0.5 ? '#F8F6F1' : '#1F2A3C' }}>{n || ''}</span>; })}
              </div>
            ))}
          </div>
        </Panel>
      </div>
    </div>
  );
}

const CSS = `
.pf{margin-top:22px;display:flex;flex-direction:column;gap:16px}
.pf-row{display:grid;gap:16px}.pf-row.two{grid-template-columns:minmax(0,1.7fr) minmax(0,1fr)}.pf-row.two.b{grid-template-columns:minmax(0,1fr) minmax(0,1.2fr)}
@media(max-width:1100px){.pf-row.two,.pf-row.two.b{grid-template-columns:1fr}}
.pf-panel{background:#F8F6F1;border:1px solid #D9D2C5;border-radius:10px;padding:16px 18px 14px;box-shadow:0 1px 1px rgba(60,48,28,.05),0 2px 6px rgba(60,48,28,.04)}
.pf-panel header{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px;flex-wrap:wrap}.pf-panel h3{margin:0;font:800 15px var(--font-body);color:#1F2A3C}.pf-panel p{margin:2px 0 0;font:500 12.5px var(--font-body);color:#485163}
.pf-legend{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}.pf-legend button{display:inline-flex;align-items:center;gap:6px;border:1px solid #D2CABB;background:#FBFAF7;border-radius:999px;padding:3px 10px;font:600 12px var(--font-body);color:#2F394A;cursor:pointer}
.pf-legend button.off{opacity:.45;text-decoration:line-through}.pf-legend i{width:9px;height:9px;border-radius:2px;display:inline-block}
.pf-tip{position:absolute;top:4px;transform:translateX(-50%);z-index:5;background:#FBFAF7;color:#1F2A3C;border:1px solid #C6BDAC;border-radius:8px;padding:9px 12px;font:600 12px var(--font-body);min-width:140px;pointer-events:none;box-shadow:0 8px 22px rgba(40,32,18,.18)}
.pf-tip b{display:block;margin-bottom:5px}.pf-tip div{display:flex;align-items:center;gap:7px;padding:1px 0}.pf-tip div span{margin-left:auto;font-variant-numeric:tabular-nums}.pf-tip i{width:8px;height:8px;border-radius:2px}.pf-tip .t{border-top:1px solid #DDD6C9;margin-top:4px;padding-top:4px}
.pf-note{display:flex;align-items:center;gap:8px;margin-top:6px;font:500 12px var(--font-body);color:#6C7280}.pf-note i{width:16px;height:0;border-top:2px solid #1F2A3C}.pf-note i.dash{border-top:2px dashed #B08D4F}
.pf-load{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:600 13px var(--font-body);color:#6C7280}.pf-load.static{position:static;padding:14px 0}
.pf-donut{display:flex;align-items:center;gap:18px;flex-wrap:wrap}.pf-donut ul{list-style:none;margin:0;padding:0;flex:1;min-width:170px}
.pf-donut li{white-space:nowrap;display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:6px;font:600 13px var(--font-body);color:#1F2A3C}.pf-donut li.on{background:#EFEBE2}.pf-donut li i{width:10px;height:10px;border-radius:3px}.pf-donut li b{margin-left:auto}.pf-donut li span{width:48px;text-align:right;color:#485163;font-variant-numeric:tabular-nums}
.pf-bars{display:flex;flex-direction:column;gap:2px}.pf-bars button{display:grid;grid-template-columns:140px 1fr 40px;align-items:center;gap:10px;border:0;background:transparent;padding:5px 6px;border-radius:6px;cursor:pointer;text-align:left;font-family:var(--font-body)}
.pf-bars button:hover{background:#EFEBE2}.pf-bars .nm{font:600 13px var(--font-body);color:#1F2A3C;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pf-bars .v{font:700 13px var(--font-body);color:#1F2A3C;text-align:right;font-variant-numeric:tabular-nums}
.pf-bars .track{position:relative;height:12px;background:#E6E0D5;border-radius:3px;display:block}.pf-bars .bar{position:absolute;left:0;top:0;bottom:0;border-radius:3px}.pf-bars .avg{position:absolute;top:-3px;bottom:-3px;border-left:2px dashed #B08D4F}
.pf-heat{display:grid;gap:3px;align-items:center}.pf-heat .hm{font:700 11px var(--font-body);color:#6C7280;text-align:center}
.pf-heat .rn{border:0;background:transparent;text-align:left;font:600 12.5px var(--font-body);color:#1F2A3C;padding:0;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.pf-heat .rn:hover{color:#2F5576;text-decoration:underline}
.pf-heat .cell{height:26px;border-radius:3px;display:flex;align-items:center;justify-content:center;font:700 11.5px var(--font-body);font-variant-numeric:tabular-nums}
`;
