// Conciliation Manager — dashboard, Tarion intake queue and data import. Managers only (enforced by RLS).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '@/cm/api';
import type { CmCase, CmCycle, CmIntake } from '@/cm/api';
import { readWorkbook, importSheet, type SheetData, type SheetPreview } from '@/cm/sheetimport';
import '@/cm/cm.css';

const stagePill = (s: string) => s === 'Scheduled' ? 'b' : s === 'Awaiting CAR' ? 'a' : s === 'CAR Received' ? 'p' : 'g';
type Tab = 'dashboard' | 'intake' | 'import';

export default function ConciliationPage() {
  const nav = useNavigate();
  const [member, setMember] = useState<{ company_id: string; role: string } | null | undefined>(undefined);
  const [cases, setCases] = useState<CmCase[]>([]);
  const [cycles, setCycles] = useState<CmCycle[]>([]);
  const [intake, setIntake] = useState<CmIntake[]>([]);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [prop, setProp] = useState<'freehold' | 'common_elements'>('freehold');
  const [stage, setStage] = useState('Active');
  const [community, setCommunity] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [nc, setNc] = useState({ case_number: '', homeowner: '', address: '', enrolment: '', form_type: '', insp: '' });
  const [sheet, setSheet] = useState<{ data: SheetData; preview: SheetPreview } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.loadDashboard(); setCases(d.cases); setCycles(d.cycles);
      setIntake(await api.loadIntake()); setErr('');
    } catch (e) { setErr((e as Error).message); }
  }, []);
  useEffect(() => { api.myMembership().then(m => { setMember(m); if (m) load(); }); }, [load]);

  const run = async (label: string, fn: () => Promise<string | void>) => {
    setBusy(label); setErr(''); setMsg('');
    try { const m = await fn(); if (m) setMsg(m); await load(); } catch (e) { setErr((e as Error).message); }
    setBusy('');
  };

  const scoped = useMemo(() => cases.filter(c => c.property_type === prop), [cases, prop]);
  const ids = useMemo(() => new Set(scoped.map(c => c.id)), [scoped]);
  const byId = useMemo(() => new Map(cases.map(c => [c.id, c])), [cases]);
  const live = useMemo(() => cycles.filter(v => ids.has(v.case_id)), [cycles, ids]);
  const attention = useMemo(() => api.buildAttention(scoped, live), [scoped, live]);
  const stats = useMemo(() => {
    const s = { open: 0, scheduled: 0, awaiting: 0, car: 0, overdue: 0, dueSoon: 0, unscheduled: 0, pendingAmt: 0, rb04: 0, exposure: 0 };
    for (const v of live) {
      if (v.stage === 'Closed' || byId.get(v.case_id)?.is_closed) continue;
      if (!v.superseded) {
        s.open++;
        if (v.stage === 'Scheduled') s.scheduled++; else if (v.stage === 'Awaiting CAR') s.awaiting++;
        else { s.car++; if (v.days_left !== null && v.days_left < 0) s.overdue++; else if (v.days_left !== null && v.days_left <= 7) s.dueSoon++; }
      }
      s.unscheduled += v.unscheduled; s.pendingAmt += Number(v.pending_amt); s.rb04 += v.rb04; s.exposure += Number(v.internal_estimate_amt);
    }
    return s;
  }, [live, byId]);
  const communities = useMemo(() => [...new Set(scoped.map(c => c.community).filter(Boolean))].sort(), [scoped]);
  const rows = useMemo(() => live.filter(v => {
    const c = byId.get(v.case_id)!;
    const closed = v.stage === 'Closed' || c.is_closed;
    if (stage === 'Active' ? (closed || v.superseded) : stage === 'Closed' ? !closed : v.stage !== stage || c.is_closed) return false;
    if (community && c.community !== community) return false;
    const t = q.trim().toLowerCase();
    return !t || [c.case_number, c.homeowner, c.address, c.lot, c.enrolment].some(x => x.toLowerCase().includes(t));
  }).sort((a, b) => (a.days_left ?? a.days_to_insp ?? 9999) - (b.days_left ?? b.days_to_insp ?? 9999)), [live, byId, stage, community, q]);
  const pendingIntake = intake.filter(i => i.status === 'pending');

  if (member === undefined) return <div className="cm">Loading…</div>;
  if (member === null) return (
    <div className="cm"><h1>Conciliation Manager</h1>
      <div className="card" style={{ marginTop: 14, maxWidth: 640 }}>
        <h2>Not enabled for this account</h2>
        <p className="sub">The Conciliation Manager is a manager-only add-on. Your sign-in has not been added to a company's Conciliation Manager team yet, or the database migration has not been applied.</p>
      </div></div>);

  return (
    <div className="cm">
      <div className="row">
        <div><h1>Conciliation Manager</h1><div className="sub">Tarion conciliations — inspections, CAR clocks, cash settlements</div></div>
        <div className="sp" />
        <div className="seg">
          <button className={prop === 'freehold' ? 'on' : ''} onClick={() => setProp('freehold')}>Freehold</button>
          <button className={prop === 'common_elements' ? 'on' : ''} onClick={() => setProp('common_elements')}>Common elements</button>
        </div>
        <button onClick={() => run('sync', async () => { const r = await api.runTarionSync(); return `Tarion sync: ${r.checked} checked` + (r.errors?.length ? ` — ${r.errors.length} error(s): ${r.errors[0]}` : ''); })} disabled={!!busy}>{busy === 'sync' ? 'Syncing…' : 'Sync Tarion'}</button>
        <button className="pri" onClick={() => setNewOpen(v => !v)}>New case</button>
      </div>
      {err && <div className="err">{err}</div>}
      {msg && <div className="ok">{msg}</div>}
      {newOpen && (
        <div className="card" style={{ marginTop: 12 }}>
          <h2>New conciliation case</h2>
          <div className="grid fields">
            <label>Tarion case #<input value={nc.case_number} onChange={e => setNc({ ...nc, case_number: e.target.value })} /></label>
            <label>Homeowner<input value={nc.homeowner} onChange={e => setNc({ ...nc, homeowner: e.target.value })} /></label>
            <label>Address<input value={nc.address} onChange={e => setNc({ ...nc, address: e.target.value })} /></label>
            <label>Enrolment #<input value={nc.enrolment} onChange={e => setNc({ ...nc, enrolment: e.target.value })} /></label>
            <label>Form type<input value={nc.form_type} onChange={e => setNc({ ...nc, form_type: e.target.value })} /></label>
            <label>Inspection date<input type="date" value={nc.insp} onChange={e => setNc({ ...nc, insp: e.target.value })} /></label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="pri" disabled={!nc.case_number.trim() || !!busy} onClick={() => run('new', async () => {
              const { insp, ...f } = nc; const id = await api.createCase(member.company_id, { ...f, case_number: f.case_number.trim(), property_type: prop }, insp || undefined);
              await api.linkWarrantyData(member.company_id).catch(() => null); nav(`/warranty/conciliation/${id}`);
            })}>Create case</button>
            <span className="sub">Owner, lot and community fill in automatically when the enrolment # matches a home already imported.</span>
          </div>
        </div>)}

      <div className="tabs">
        <button className={tab === 'dashboard' ? 'on' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
        <button className={tab === 'intake' ? 'on' : ''} onClick={() => setTab('intake')}>Tarion intake{pendingIntake.length ? ` (${pendingIntake.length})` : ''}</button>
        <button className={tab === 'import' ? 'on' : ''} onClick={() => setTab('import')}>Import &amp; merge data</button>
      </div>

      {tab === 'dashboard' && <>
        <div className="grid stats">
          <div className="card stat"><div className="n">{stats.open}</div><div className="l">Open inspections</div></div>
          <div className="card stat"><div className="n">{stats.scheduled}</div><div className="l">Scheduled</div></div>
          <div className="card stat a"><div className="n">{stats.awaiting}</div><div className="l">Awaiting CAR</div></div>
          <div className="card stat p"><div className="n">{stats.car}</div><div className="l">CAR received</div></div>
          <div className="card stat r"><div className="n">{stats.overdue}</div><div className="l">30-day overdue</div></div>
          <div className="card stat a"><div className="n">{stats.unscheduled}</div><div className="l">Warranted, unscheduled</div></div>
          <div className="card stat g"><div className="n">${api.money(stats.pendingAmt)}</div><div className="l">Cash awaiting signature</div></div>
          <div className="card stat"><div className="n">${api.money(stats.exposure)}</div><div className="l">Internal estimate</div></div>
        </div>
        <div className="grid two" style={{ marginTop: 14, alignItems: 'start' }}>
          <div className="card">
            <h2>Needs attention ({attention.length})</h2>
            <div className="grid" style={{ gap: 8 }}>
              {attention.slice(0, 12).map((a, i) => (
                <div key={i} className={`att s${a.sev}`} onClick={() => nav(`/warranty/conciliation/${a.caseId}?tab=${a.tab}`)}>
                  <div><b>{a.label}</b><span className="sub">{a.detail}</span></div></div>))}
              {!attention.length && <div className="sub">Nothing needs attention right now.</div>}
            </div>
          </div>
          <div className="card">
            <div className="row" style={{ marginBottom: 10 }}>
              <h2 style={{ margin: 0 }}>Inspections</h2><div className="sp" />
              <input placeholder="Search case, owner, address, lot…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 220 }} />
              <select value={community} onChange={e => setCommunity(e.target.value)}><option value="">All communities</option>{communities.map(c => <option key={c}>{c}</option>)}</select>
              <select value={stage} onChange={e => setStage(e.target.value)}>{['Active', 'Scheduled', 'Awaiting CAR', 'CAR Received', 'Closed'].map(s => <option key={s}>{s}</option>)}</select>
            </div>
            <div className="scroll"><table>
              <thead><tr><th>Case</th><th>Home</th><th>Cycle</th><th>Stage</th><th>Clock</th><th className="num">Open</th></tr></thead>
              <tbody>{rows.slice(0, 200).map(v => { const c = byId.get(v.case_id)!; return (
                <tr key={v.id} className="click" onClick={() => nav(`/warranty/conciliation/${c.id}`)}>
                  <td><b>{c.case_number}</b><div className="sub">{c.community}{c.lot ? ` · Lot ${c.lot}` : ''}</div></td>
                  <td>{c.homeowner || '—'}<div className="sub">{c.address}</div></td>
                  <td>{v.seq} of {v.of_total}<div className="sub">{v.type}</div></td>
                  <td><span className={`pill ${stagePill(v.stage)}`}>{v.stage}</span></td>
                  <td>{v.stage === 'CAR Received' && v.days_left !== null
                    ? <span className={`pill ${v.days_left < 0 ? 'r' : v.days_left <= 7 ? 'a' : ''}`}>{v.days_left < 0 ? `${-v.days_left}d overdue` : `${v.days_left}d left`}</span>
                    : v.stage === 'Scheduled' ? api.fmtDate(v.inspection_date) : v.stage === 'Awaiting CAR' ? `Inspected ${api.fmtDate(v.inspection_date)}` : '—'}</td>
                  <td className="num">{v.open_items}/{v.total}</td>
                </tr>); })}
                {!rows.length && <tr><td colSpan={6} className="sub">No inspections match.</td></tr>}</tbody>
            </table></div>
          </div>
        </div>
      </>}

      {tab === 'intake' && (
        <div className="card">
          <h2>Tarion intake</h2>
          <p className="sub">Every document the Tarion sync finds is checked against your cases. When the system is sure (new case, same letter again, a moved inspection date) it applies it. When it is not sure, it waits here.</p>
          <div className="scroll"><table>
            <thead><tr><th>Received</th><th>Case #</th><th>Decision</th><th>Why</th><th></th></tr></thead>
            <tbody>{intake.map(i => (
              <tr key={i.id}>
                <td>{api.fmtDate(i.created_at)}</td><td><b>{i.case_number}</b></td>
                <td><span className={`pill ${i.status === 'pending' ? 'a' : i.status === 'applied' ? 'g' : ''}`}>{i.status === 'pending' ? 'Needs review' : i.proposed_action.replace(/_/g, ' ')}</span></td>
                <td className="sub">{i.reason || (i.auto_applied ? 'Applied automatically' : '')}</td>
                <td className="num">{i.status === 'pending' ? <>
                  <button className="pri" disabled={!!busy} onClick={() => run('intake', async () => { await api.resolveIntake(i.id, 'apply'); })}>Apply</button>{' '}
                  <button disabled={!!busy} onClick={() => run('intake', async () => { await api.resolveIntake(i.id, 'reject'); })}>Dismiss</button></>
                  : i.case_id && <button onClick={() => nav(`/warranty/conciliation/${i.case_id}`)}>Open</button>}</td>
              </tr>))}
              {!intake.length && <tr><td colSpan={5} className="sub">Nothing has come in yet. Use Sync Tarion once the API credentials are set.</td></tr>}</tbody>
          </table></div>
        </div>)}

      {tab === 'import' && (
        <div className="grid two" style={{ alignItems: 'start' }}>
          <div className="card">
            <h2>1 · Bring over the Google Sheet</h2>
            <p className="sub">In the Conciliation Manager spreadsheet choose File → Download → Microsoft Excel (.xlsx), then pick that file here. Cases already in the system are skipped, so it is safe to run again.</p>
            <input ref={fileRef} type="file" accept=".xlsx" style={{ display: 'none' }} onChange={async e => {
              const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
              try { setSheet(readWorkbook(await f.arrayBuffer())); setErr(''); } catch (x) { setErr('Could not read that file: ' + (x as Error).message); }
            }} />
            <button onClick={() => fileRef.current?.click()}>Choose .xlsx file</button>
            {sheet && <div style={{ marginTop: 12 }}>
              {sheet.preview.missing.length > 0
                ? <div className="err">This file has no {sheet.preview.missing.join(' / ')} tab — is it the Conciliation Manager sheet?</div>
                : <>
                  <div className="note">{sheet.preview.cases} cases · {sheet.preview.cycles} cycles · {sheet.preview.items} items · {sheet.preview.comms} log entries · {sheet.preview.batches} settlement batches</div>
                  <button className="pri" style={{ marginTop: 10 }} disabled={!!busy} onClick={() => run('sheet', async () => {
                    const r = await importSheet(member.company_id, sheet.data, setBusy);
                    await api.linkWarrantyData(member.company_id).catch(() => null); setSheet(null);
                    return `Imported ${r.cases} case(s), ${r.cycles} cycle(s), ${r.items} item(s), ${r.comms} log entries; ${r.skipped} already present.` + (r.errors.length ? ` ${r.errors.length} problem(s): ${r.errors.slice(0, 3).join(' | ')}` : '');
                  })}>{busy ? busy : 'Import into the database'}</button></>}
            </div>}
          </div>
          <div className="card">
            <h2>2 · Merge with homes, owners and trades already loaded</h2>
            <p className="sub">Matches each conciliation case to the home from your QDEF owner import by enrolment number, and fills in owner name, email, phone, lot, community and possession date where they are blank. Nothing you typed is overwritten.</p>
            <button className="pri" disabled={!!busy} onClick={() => run('link', async () => {
              const r = await api.linkWarrantyData(member.company_id);
              return r.skipped ? `Skipped: ${r.skipped}` : `${r.linked} case(s) linked to a home.` + (r.unmatched?.length ? ` No matching enrolment for: ${r.unmatched.slice(0, 15).join(', ')}${r.unmatched.length > 15 ? '…' : ''}` : '');
            })}>{busy === 'link' ? 'Matching…' : 'Match cases to homes'}</button>
            <p className="sub" style={{ marginTop: 14 }}>Keep the home list current with the existing importers — they update in place, so re-running them picks up new enrolments and owners:</p>
            <div className="row">
              <button onClick={() => nav('/warranty/qdef-import')}>Owners &amp; enrolments</button>
              <button onClick={() => nav('/warranty/trades-import')}>Trades</button>
              <button onClick={() => nav('/warranty/deficiency-import')}>Deficiencies</button>
            </div>
          </div>
        </div>)}
    </div>);
}
