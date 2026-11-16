// Dashboard — warranty overview: KPIs, Tarion intake status, conciliation performance by community, action queue.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import * as api from '@/cm/api';
import { Donut } from '@/components/charts';
import PortfolioCharts, { usePortfolio } from '@/components/portfoliocharts';

interface Import { id: string; case_id: string | null; tarion_case_number: string; form_code: string | null; owner_name: string | null; address: string | null; status: string; items_count: number; created_at: string }

const safe = async <T,>(p: PromiseLike<T>, fallback: T): Promise<T> => { try { return await p; } catch { return fallback; } };
const count = async (q: PromiseLike<{ count: number | null; error: unknown }>) => { const r = await safe(q, { count: null, error: true }); return r.error ? null : (r.count ?? 0); };
const C = { sched: '#3F7CAC', await: '#B8903F', car: '#A9C4DB', over: '#A5402F' };

export default function WarrantyTodayPage() {
  const nav = useNavigate();
  const [cm, setCm] = useState<{ cases: api.CmCase[]; cycles: api.CmCycle[] } | null>(null);
  const [imports, setImports] = useState<Import[]>([]);
  const [lastRun, setLastRun] = useState<string | null>(null);
  const [openCases, setOpenCases] = useState<number | null>(null);
  const [pos, setPos] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const pf = usePortfolio();
  const [syncing, setSyncing] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    const [d, imp, run, oc, po] = await Promise.all([
      safe(api.loadDashboard(), null),
      safe(supabase.from('tarion_form_imports').select('id, case_id, tarion_case_number, form_code, owner_name, address, status, items_count, created_at').order('created_at', { ascending: false }).limit(200).then(r => r.data as Import[] | null), null),
      safe(supabase.from('cm_sync_runs').select('finished_at').order('finished_at', { ascending: false }).limit(1).then(r => (r.data?.[0]?.finished_at as string | undefined) ?? null), null),
      count(supabase.from('cases').select('id', { count: 'exact', head: true }).in('status', ['open', 'in_progress']).is('deleted_at', null)),
      count(supabase.from('purchase_orders').select('id', { count: 'exact', head: true }).in('status', ['pending', 'pending_approval', 'submitted'])),
    ]);
    setCm(d); setImports(imp ?? []); setLastRun(run); setOpenCases(oc); setPos(po); setLoaded(true);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function syncNow() {
    setSyncing(true); setMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke('tarion-sync', { body: { mode: 'forms' } });
      if (error) throw new Error(error.message);
      const f = data?.forms?.results ?? {};
      const errs: string[] = data?.errors ?? [];
      setMsg(errs.length ? { ok: false, text: errs[0] } : { ok: true, text: `Checked Tarion: ${f.new_forms ?? 0} new form(s), ${f.created ?? 0} imported.` });
      await load();
    } catch (e) { setMsg({ ok: false, text: (e as Error).message }); }
    setSyncing(false);
  }

  const byId = useMemo(() => new Map((cm?.cases ?? []).map(c => [c.id, c])), [cm]);
  const live = useMemo(() => (cm?.cycles ?? []).filter(v => !v.superseded && v.stage !== 'Closed' && !byId.get(v.case_id)?.is_closed), [cm, byId]);
  const attention = useMemo(() => cm ? api.buildAttention(cm.cases, cm.cycles) : [], [cm]);
  const upcoming = live.filter(v => v.stage === 'Scheduled' && v.days_to_insp !== null && v.days_to_insp >= 0).length;
  const overdue = live.filter(v => v.stage === 'CAR Received' && v.days_left !== null && v.days_left < 0).length;
  const cashSoon = attention.filter(a => a.tab === 'cash' && a.days <= 7).length;
  const forms7 = imports.filter(r => Date.now() - new Date(r.created_at).getTime() < 7 * 864e5).length;
  const review = imports.filter(r => r.status === 'needs_review').length;
  const imported = imports.filter(r => r.status === 'imported').length;
  const lastSeen = lastRun ?? imports[0]?.created_at ?? null;

  const communities = useMemo(() => {
    const m = new Map<string, { name: string; cases: Set<string>; sched: number; wait: number; car: number; over: number }>();
    for (const v of live) {
      const c = byId.get(v.case_id); if (!c) continue;
      const k = c.community || 'No community';
      const r = m.get(k) ?? { name: k, cases: new Set<string>(), sched: 0, wait: 0, car: 0, over: 0 };
      r.cases.add(c.id);
      if (v.stage === 'Scheduled') r.sched++; else if (v.stage === 'Awaiting CAR') r.wait++;
      else if (v.days_left !== null && v.days_left < 0) r.over++; else r.car++;
      m.set(k, r);
    }
    return [...m.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [live, byId]);

  const go = (community: string, stage = 'Active') => nav(`/warranty/conciliation?community=${encodeURIComponent(community)}&stage=${encodeURIComponent(stage)}`);
  const stageOf = (label: string) => label === 'Scheduled' ? 'Scheduled' : label === 'Awaiting CAR' ? 'Awaiting CAR' : 'CAR Received';

  const kpis: { n: number | null; l: string; link?: string; to?: string; tone?: string }[] = [
    { n: openCases, l: 'Open warranty cases', to: '/warranty/cases' },
    { n: cm ? new Set(live.map(v => v.case_id)).size : null, l: 'Active conciliations', to: '/warranty/conciliation' },
    { n: pf.ready ? pf.due30 : null, l: 'Repair periods ending within 30 days', to: '/warranty/communities' },
    { n: pf.ready ? pf.passed : null, l: 'Repair period passed, items still open', to: '/warranty/communities', tone: pf.passed ? 'r' : '' },
    { n: cm ? upcoming : null, l: 'Upcoming inspections', link: 'see the list', to: '/warranty/conciliation?stage=Scheduled' },
    { n: cm ? cashSoon : null, l: 'Cash offers due within 7 days', to: '/warranty/conciliation' },
    { n: cm ? overdue : null, l: 'Overdue 30-day clocks', to: '/warranty/conciliation?stage=CAR%20Received', tone: overdue ? 'r' : '' },
    { n: pos, l: 'PO approvals waiting', to: '/warranty/po-requests' },
  ];

  return (
    <div className="bgp">
      <style>{`
        .bgp { max-width: 1480px; margin: 0 auto; padding: 30px 28px 70px; font-family: var(--font-body); color: #1F2A3C; }
        .bgp .eyebrow { font-size: 11.5px; font-weight: 700; letter-spacing: 0.16em; color: #8A6A2E; text-transform: uppercase; }
        .bgp h1 { font-size: 30px; font-weight: 800; letter-spacing: -0.035em; line-height: 1.1; margin-top: 8px; }
        .bgp h2 { font-size: 20px; font-weight: 800; letter-spacing: -0.02em; }
        .bgp .sub { color: #485163; font-size: 14px; }
        .bgp-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-top: 24px; }
        .bgp-kpi { position: relative; background: #F8F6F1; border-radius: 10px; padding: 24px 22px 20px; border: 1px solid #DDD6C9; overflow: hidden; text-align: left; font-family: inherit; color: inherit; cursor: pointer;
          box-shadow: 0 1px 1px rgba(60,48,28,.05), 0 2px 6px rgba(60,48,28,.04); transition: transform .15s, box-shadow .15s; }
        .bgp-kpi::before { content: ''; position: absolute; left: 0; right: 0; top: 0; height: 3px; background: #B08D4F; }
        .bgp-kpi:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(60,48,28,.10); }
        .bgp-kpi:focus-visible { outline: 2px solid #C9A96A; outline-offset: 2px; }
        .bgp-kpi .n { font-size: 36px; font-weight: 800; letter-spacing: -0.04em; line-height: 1; }
        .bgp-kpi.r .n { color: #A5402F; }
        .bgp-kpi .l { font-size: 14.5px; color: #485163; margin-top: 10px; line-height: 1.3; }
        .bgp-kpi .k { display: block; font-size: 13.5px; font-weight: 600; color: #2F5576; margin-top: 4px; }
        .bgp-banner { margin-top: 22px; background: #F8F6F1; border-radius: 10px; border: 1px solid #DDD6C9; border-left: 6px solid #B08D4F; padding: 20px 24px; display: flex; align-items: center; gap: 18px; flex-wrap: wrap;
          box-shadow: 0 1px 1px rgba(60,48,28,.05), 0 2px 6px rgba(60,48,28,.04); }
        .bgp-chip { font-size: 14px; padding: 9px 16px; border-radius: 999px; border: 1px solid #D9D2C5; background: #F1EDE4; color: #485163; white-space: nowrap; }
        .bgp-chip b { color: #1F2A3C; margin-right: 3px; }
        .bgp-btn { display: inline-flex; align-items: center; gap: 8px; border: 0; border-radius: 8px; background: #3F6A8F; color: #fff; font: 700 14.5px var(--font-body); padding: 14px 22px; cursor: pointer; box-shadow: 0 1px 2px rgba(40,32,18,.2); }
        .bgp-btn:hover { background: #2F5576; }
        .bgp-btn:disabled { opacity: .65; cursor: default; }
        .bgp-btn:focus-visible { outline: 2px solid #C9A96A; outline-offset: 2px; }
        .bgp-comms { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px; margin-top: 20px; }
        .bgp-comm { background: #F8F6F1; border-radius: 10px; border: 1px solid #DDD6C9; padding: 22px 24px 18px; box-shadow: 0 1px 1px rgba(60,48,28,.05), 0 2px 6px rgba(60,48,28,.04); }
        .bgp-mini { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 16px; }
        .bgp-mini button { text-align: left; border: 1px solid #D9D2C5; background: #F1EDE4; border-radius: 8px; padding: 12px 14px; cursor: pointer; font-family: inherit; color: inherit; }
        .bgp-mini button:hover { border-color: #3F6A8F; background: #EFEBE2; }
        .bgp-mini .n { font-size: 26px; font-weight: 800; letter-spacing: -0.03em; line-height: 1.1; }
        .bgp-mini .l { font-size: 12.5px; color: #485163; margin-top: 2px; }
        .bgp-two { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 20px; margin-top: 34px; align-items: start; }
        @media (max-width: 1100px) { .bgp-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
        @media (max-width: 960px) { .bgp-two { grid-template-columns: 1fr; } .bgp { padding: 22px 14px 56px; } .bgp h1 { font-size: 30px; } .bgp-comms { grid-template-columns: 1fr; } }
        .bgp-card { background: #F8F6F1; border: 1px solid #DDD6C9; border-radius: 10px; padding: 20px 22px 12px; box-shadow: 0 1px 1px rgba(60,48,28,.05), 0 2px 6px rgba(60,48,28,.04); }
        .bgp-card h3 { font-size: 18px; font-weight: 800; letter-spacing: -0.01em; }
        .bgp-row { display: flex; align-items: center; gap: 12px; padding: 12px 8px; border: 0; border-top: 1px solid #EFEBE2; cursor: pointer; border-radius: 8px; width: 100%; text-align: left; background: transparent; font-family: inherit; color: inherit; }
        .bgp-row:first-of-type { border-top: 0; }
        .bgp-row:hover { background: #EFEBE2; }
        .bgp-row:focus-visible { outline: 2px solid #3F6A8F; }
        .bgp-pill { font-size: 11.5px; font-weight: 700; padding: 3px 10px; border-radius: 99px; white-space: nowrap; }
      `}</style>

      <div className="eyebrow">Warranty overview</div>
      <h1>Warranty portfolio</h1>
      <div className="sub" style={{ marginTop: 8 }}>Community performance, upcoming work, deadlines and new forms from Tarion.</div>

      <div className="bgp-kpis">
        {kpis.map(k => (
          <button key={k.l} className={`bgp-kpi${k.tone ? ' ' + k.tone : ''}`} onClick={() => k.to && nav(k.to)}>
            <div className="n">{k.n ?? '—'}</div>
            <div className="l">{k.l}</div>
            {k.link && <span className="k">{k.link} ›</span>}
          </button>
        ))}
      </div>

      <PortfolioCharts pf={pf} />

      <div className="bgp-banner">
        <div style={{ flex: 1, minWidth: 260 }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em' }}>Tarion updates</div>
          <div className="sub" style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 9 }}>
            <span style={{ width: 13, height: 13, borderRadius: '50%', background: lastSeen ? '#4A7A55' : '#C6BDAC', boxShadow: lastSeen ? '0 0 0 4px rgba(74,122,85,0.18)' : 'none', flexShrink: 0 }} />
            {lastSeen ? `BuilderLink last checked ${format(new Date(lastSeen), "MMM d, yyyy h:mm a")} · ${forms7} new form${forms7 === 1 ? '' : 's'} in the last 7 days.` : (loaded ? 'No Tarion check has run yet.' : 'Loading…')}
          </div>
          {msg && <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: msg.ok ? '#4A7A55' : '#A5402F' }}>{msg.text}</div>}
        </div>
        <span className="bgp-chip"><b>{review}</b>awaiting review</span>
        <span className="bgp-chip"><b>{imported}</b>imported</span>
        <button className="bgp-btn" onClick={syncNow} disabled={syncing}><RefreshCw size={16} style={syncing ? { animation: 'spin .8s linear infinite' } : undefined} />{syncing ? 'Checking Tarion…' : 'Check Tarion now'}</button>
      </div>

      <h2 style={{ marginTop: 40 }}>Conciliation by community</h2>
      <div className="sub" style={{ marginTop: 6 }}>Select a community or a stage to see its conciliations and current workload.</div>

      <div className="bgp-comms">
        {communities.map(c => {
          const data = [
            { label: 'Scheduled', value: c.sched, color: C.sched },
            { label: 'Awaiting CAR', value: c.wait, color: C.await },
            { label: 'CAR received', value: c.car, color: C.car },
            { label: 'Overdue', value: c.over, color: C.over },
          ].filter(d => d.value > 0);
          return (
            <section key={c.name} className="bgp-comm">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
                <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em' }}>{c.name}</div>
                <div className="sub" style={{ fontSize: 13.5 }}>{c.cases.size} case{c.cases.size === 1 ? '' : 's'}</div>
              </div>
              <Donut data={data} size={132} thickness={20} centerLabel="cases" onSlice={l => go(c.name, l === 'Overdue' ? 'CAR Received' : stageOf(l))} />
              <div className="bgp-mini">
                <button onClick={() => go(c.name, 'Scheduled')}><div className="n">{c.sched}</div><div className="l">Upcoming</div></button>
                <button onClick={() => go(c.name, 'Awaiting CAR')}><div className="n">{c.wait}</div><div className="l">Awaiting CAR</div></button>
                <button onClick={() => go(c.name, 'CAR Received')}><div className="n" style={c.over ? { color: '#C23B2B' } : undefined}>{c.over}</div><div className="l">Overdue</div></button>
              </div>
            </section>
          );
        })}
        {!communities.length && <div className="bgp-card" style={{ gridColumn: '1 / -1' }}><div className="sub">{loaded ? 'No active conciliations yet. They appear here as Tarion schedules inspections.' : 'Loading…'}</div></div>}
      </div>

      <div className="bgp-two">
        <section className="bgp-card">
          <h3>Needs attention</h3>
          <div className="sub" style={{ fontSize: 13, margin: '2px 0 8px' }}>Deadlines and cash offers across every conciliation.</div>
          {attention.slice(0, 8).map((a, i) => (
            <button key={i} className="bgp-row" onClick={() => nav(`/warranty/conciliation/${a.caseId}?tab=${a.tab}`)}>
              <AlertTriangle size={17} color={a.sev >= 3 ? '#A5402F' : a.sev === 2 ? '#9A6A16' : '#3F6A8F'} style={{ flexShrink: 0 }} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{a.label}</div>
                <div className="sub" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.detail}</div>
              </div>
            </button>
          ))}
          {!attention.length && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '14px 6px 18px' }}>
              <CheckCircle2 size={18} color="#4A7A55" />
              <div className="sub" style={{ fontSize: 13 }}>{loaded ? 'Nothing is overdue. New inspections and CAR deadlines appear here as they come in.' : 'Loading…'}</div>
            </div>
          )}
        </section>

        <section className="bgp-card">
          <h3>Latest forms from Tarion</h3>
          <div className="sub" style={{ fontSize: 13, margin: '2px 0 8px' }}>The newest warranty forms BuilderLink sent us.</div>
          {imports.slice(0, 7).map(r => (
            <button key={r.id} className="bgp-row" onClick={() => nav(r.case_id ? `/warranty/cases/${r.case_id}` : '/warranty/settings')}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{r.owner_name || r.tarion_case_number} <span className="sub" style={{ fontSize: 12.5, fontWeight: 500 }}>· {r.form_code}</span></div>
                <div className="sub" style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.address} · {r.items_count} item{r.items_count === 1 ? '' : 's'}</div>
              </div>
              <span className="bgp-pill" style={r.status === 'imported' ? { background: '#ECFDF3', color: '#4A7A55' } : { background: '#F6ECD3', color: '#B45309' }}>{r.status === 'imported' ? 'Imported' : 'Needs review'}</span>
            </button>
          ))}
          {!imports.length && <div className="sub" style={{ padding: '10px 6px 18px', fontSize: 13 }}>{loaded ? 'No forms yet. Press Check Tarion now above.' : 'Loading…'}</div>}
        </section>
      </div>
    </div>
  );
}
