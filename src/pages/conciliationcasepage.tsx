// Conciliation Manager — case folder (overview, items, cycles, cash, activity).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import * as api from '@/cm/api';
import type { CmBatch, CmCase, CmComm, CmCycle, CmItem } from '@/cm/api';
import '@/cm/cm.css';

const CYCLE_TYPES = ['Re-inspection: Heat', 'Re-inspection: Cooling', 'Under Investigation', 'Re-inspection: Further Investigation', 'Re-inspection: Other'];
const OUTCOMES = ['Warranted', 'Partially Warranted', 'Not Warranted', 'Not Assessed', 'Under Investigation'];
const STATUSES = ['Open', 'Repair Scheduled', 'Cash Offer Made', 'Closed', 'Repaired - Pre-Inspection'];
const outPill = (o: string) => o === 'Warranted' ? 'r' : o === 'Partially Warranted' ? 'a' : o === 'Not Warranted' ? 'g' : o === 'Under Investigation' ? 'p' : '';
const stagePill = (s: string) => s === 'Scheduled' ? 'b' : s === 'Awaiting CAR' ? 'a' : s === 'CAR Received' ? 'p' : 'g';
type Tab = 'overview' | 'items' | 'cycles' | 'cash' | 'activity';

export default function ConciliationCasePage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as Tab) || 'overview';
  const [c, setC] = useState<CmCase | null>(null);
  const [cycles, setCycles] = useState<CmCycle[]>([]);
  const [items, setItems] = useState<CmItem[]>([]);
  const [comms, setComms] = useState<CmComm[]>([]);
  const [batches, setBatches] = useState<CmBatch[]>([]);
  const [hist, setHist] = useState<Awaited<ReturnType<typeof api.homeHistory>>>(null);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [cycleFilter, setCycleFilter] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [car, setCar] = useState<{ cycleId: string; date: string; out: Record<number, string> } | null>(null);
  const [nc, setNc] = useState({ type: CYCLE_TYPES[0], date: '' });
  const [offer, setOffer] = useState({ base: '', negotiated: '' });

  const load = useCallback(async () => {
    try {
      const d = await api.loadCase(id);
      setC(d.case); setCycles(d.cycles); setItems(d.items); setComms(d.comms); setBatches(d.batches);
      api.homeHistory(id).then(setHist).catch(() => setHist(null));
    } catch (e) { setErr((e as Error).message); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await fn(); await load(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const shown = useMemo(() => items.filter(i => !cycleFilter || i.cycle_id === cycleFilter || i.investigation_cycle_id === cycleFilter), [items, cycleFilter]);
  const selIds = [...sel].filter(x => items.some(i => i.id === x));
  const cycleLabel = (cid: string | null) => { const v = cycles.find(x => x.id === cid); return v ? `${v.seq}` : '—'; };
  const pendingAll = items.filter(i => i.offer_amount > 0).length > 0 && items.filter(i => i.offer_amount > 0).every(i => i.resolution_status === 'Pending');
  const mult = 1.30 * 1.15 * 1.13;

  if (!c) return <div className="cm">{err ? <div className="err">{err}</div> : 'Loading…'}</div>;
  const field = (label: string, key: keyof CmCase, type = 'text') => (
    <label>{label}<input type={type} defaultValue={(c[key] as string) ?? ''} key={`${key}-${c[key]}`}
      onBlur={e => { if (e.target.value !== ((c[key] as string) ?? '')) run(() => api.saveCase(c.id, { [key]: e.target.value || (type === 'date' ? null : '') } as Partial<CmCase>)); }} /></label>);

  return (
    <div className="cm">
      <div className="row">
        <button onClick={() => nav('/warranty/conciliation')}>← All cases</button>
        <div><h1>{c.homeowner || 'Case'} <span className="sub" style={{ fontWeight: 500 }}>· #{c.case_number}</span></h1>
          <div className="sub">{c.address}{c.community ? ` · ${c.community}` : ''}{c.lot ? ` · Lot ${c.lot}` : ''}</div></div>
        <div className="sp" />
        <span className={`pill ${c.property_type === 'freehold' ? 'b' : 'p'}`}>{c.property_type === 'freehold' ? 'Freehold' : 'Common elements'}</span>
        {c.is_closed ? <span className="pill g">Closed{c.closure_reason ? ` — ${c.closure_reason}` : ''}</span>
          : <button className="danger" disabled={busy} onClick={() => { const r = window.prompt('Closure reason'); if (r) run(() => api.closeCase(c.id, r)); }}>Close case</button>}
      </div>
      {err && <div className="err">{err}</div>}
      <div className="tabs">
        {(['overview', 'items', 'cycles', 'cash', 'activity'] as Tab[]).map(t => (
          <button key={t} className={tab === t ? 'on' : ''} onClick={() => setSp({ tab: t })}>
            {t === 'items' ? `Items (${items.length})` : t === 'cycles' ? `Inspections (${cycles.length})` : t[0].toUpperCase() + t.slice(1)}</button>))}
      </div>

      {tab === 'overview' && <div className="grid two" style={{ alignItems: 'start' }}>
        <div className="card"><h2>Home &amp; owner</h2>
          <div className="grid fields">
            {field('Homeowner', 'homeowner')}{field('Address', 'address')}{field('Owner email', 'owner_email')}{field('Owner phone', 'owner_phone')}
            {field('Enrolment #', 'enrolment')}{field('Lot', 'lot')}{field('Community', 'community')}{field('Possession date', 'possession_date', 'date')}
            {field('Form type', 'form_type')}{field('Box folder link', 'box_link')}
          </div>
          <div className="note" style={{ marginTop: 12 }}>{hist?.linked
            ? `Linked to the home file: ${hist.warranty_cases ?? 0} warranty case(s), ${hist.warranty_items ?? 0} deficiency item(s), ${hist.work_orders ?? 0} work order(s) on this lot.`
            : 'Not linked to an imported home yet — add the enrolment # and use Import & merge data → Match cases to homes.'}
            {c.lot_id && <> <a href={`/warranty/lots/${c.lot_id}`} style={{ fontWeight: 700 }}>Open home</a></>}
            {c.box_link && <> · <a href={c.box_link} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Box folder</a></>}
            {c.np_url && <> · <a href={c.np_url} target="_blank" rel="noreferrer" style={{ fontWeight: 700 }}>Tarion NP letter</a></>}</div>
        </div>
        <div className="card"><h2>Team &amp; notes</h2>
          <div className="grid fields">{field('Supervisor', 'supervisor')}{field('Supervisor email', 'supervisor_email')}{field('Coordinator email', 'coordinator_email')}{field('Tarion inspector', 'inspector')}</div>
          <label style={{ marginTop: 10 }}>Notes<textarea rows={4} defaultValue={c.notes} key={c.notes} onBlur={e => { if (e.target.value !== c.notes) run(() => api.saveCase(c.id, { notes: e.target.value })); }} /></label>
          {!c.is_closed && !c.claim_booked_on && <div className="row" style={{ marginTop: 12 }}>
            <input type="date" id="claimdate" /><button disabled={busy} onClick={() => { const v = (document.getElementById('claimdate') as HTMLInputElement).value; if (v) run(() => api.bookClaim(c.id, v)); }}>Book claim inspection</button></div>}
          {c.claim_booked_on && <div className="sub" style={{ marginTop: 10 }}>Claim inspection booked {api.fmtDate(c.claim_booked_on)}{c.claim_outcome ? ` · outcome: ${c.claim_outcome}` : ''}</div>}
        </div>
      </div>}

      {tab === 'items' && <div className="card">
        <div className="row" style={{ marginBottom: 10 }}>
          <h2 style={{ margin: 0 }}>Items</h2><div className="sp" />
          <select value={cycleFilter} onChange={e => setCycleFilter(e.target.value)}><option value="">All inspections</option>{cycles.map(v => <option key={v.id} value={v.id}>Cycle {v.seq} — {v.type}</option>)}</select>
        </div>
        <div className="scroll"><table>
          <thead><tr><th></th><th>#</th><th>Description</th><th>Cycle</th><th>Tarion</th><th>Status</th><th>Trade</th><th className="num">Estimate</th><th className="num">Offer</th><th>Scheduled</th></tr></thead>
          <tbody>{shown.map(i => { const locked = i.resolution_status === 'Settled'; const pend = i.resolution_status === 'Pending'; return (
            <tr key={i.id} style={locked ? { opacity: .65 } : undefined}>
              <td><input type="checkbox" disabled={locked} checked={sel.has(i.id)} onChange={e => { const n = new Set(sel); if (e.target.checked) n.add(i.id); else n.delete(i.id); setSel(n); }} /></td>
              <td><b>{i.item_number}</b></td>
              <td style={{ minWidth: 260 }}>{i.description}{i.car_notes && i.car_notes !== i.description && <div className="sub">CAR: {i.car_notes.slice(0, 220)}</div>}{i.cpg && <div className="sub">CPG {i.cpg}</div>}</td>
              <td>{cycleLabel(i.cycle_id)}</td>
              <td>{i.car_outcome ? <span className={`pill ${outPill(i.car_outcome)}`}>{i.car_outcome}</span> : <span className="sub">—</span>}</td>
              <td>{locked ? <span className="pill g">Settled · locked</span> : pend ? <span className="pill a">Awaiting signature</span>
                : <select value={i.status} disabled={busy} onChange={e => run(() => api.saveItem(i.id, { status: e.target.value }))}>{[...new Set([i.status, ...STATUSES])].map(s => <option key={s}>{s}</option>)}</select>}</td>
              <td><input style={{ width: 110 }} disabled={locked} defaultValue={i.trade} key={i.trade} onBlur={e => { if (e.target.value !== i.trade) run(() => api.saveItem(i.id, { trade: e.target.value })); }} /></td>
              <td className="num"><input style={{ width: 84, textAlign: 'right' }} disabled={locked || pend} defaultValue={i.internal_estimate || ''} key={`e${i.internal_estimate}`} onBlur={e => { const v = Number(e.target.value) || 0; if (v !== Number(i.internal_estimate)) run(() => api.saveItem(i.id, { internal_estimate: v })); }} /></td>
              <td className="num"><input style={{ width: 84, textAlign: 'right' }} disabled={locked || pend} defaultValue={i.offer_amount || ''} key={`o${i.offer_amount}`} onBlur={e => { const v = Number(e.target.value) || 0; if (v !== Number(i.offer_amount)) run(() => api.saveItem(i.id, { offer_amount: v })); }} /></td>
              <td><input type="date" disabled={locked || pend} defaultValue={i.scheduled_on ?? ''} key={`s${i.scheduled_on}`} onBlur={e => { if ((e.target.value || null) !== i.scheduled_on) run(() => api.saveItem(i.id, { scheduled_on: e.target.value || null, ...(e.target.value ? { status: 'Repair Scheduled' } : {}) })); }} /></td>
            </tr>); })}
            {!shown.length && <tr><td colSpan={10} className="sub">No items on this case yet.</td></tr>}</tbody>
        </table></div>
        {selIds.length > 0 && <div className="bar row">
          <b>{selIds.length} selected</b><div className="sp" />
          <button disabled={busy} onClick={() => run(async () => { await api.routeToRepair(selIds, null); setSel(new Set()); })}>Route to repair</button>
          <select value={nc.type} onChange={e => setNc({ ...nc, type: e.target.value })}>{CYCLE_TYPES.map(t => <option key={t}>{t}</option>)}</select>
          <input type="date" value={nc.date} onChange={e => setNc({ ...nc, date: e.target.value })} />
          <button disabled={busy || (nc.type !== 'Under Investigation' && !nc.date)} onClick={() => run(async () => { await api.addCycle(c.id, nc.type, nc.date || null, selIds); setSel(new Set()); })}>Book re-inspection</button>
          <button disabled={busy} onClick={() => setSp({ tab: 'cash' })}>Cash offer →</button>
        </div>}
      </div>}

      {tab === 'cycles' && <div className="grid" style={{ gap: 12 }}>
        {cycles.map(v => <div className="card" key={v.id}>
          <div className="row">
            <h2 style={{ margin: 0 }}>Cycle {v.seq} — {v.type}</h2><span className={`pill ${stagePill(v.stage)}`}>{v.stage}</span>
            {v.superseded && <span className="pill">Superseded by a later inspection</span>}
            {v.stage === 'CAR Received' && v.days_left !== null && <span className={`pill ${v.days_left < 0 ? 'r' : v.days_left <= 7 ? 'a' : 'b'}`}>{v.days_left < 0 ? `${-v.days_left} days overdue` : `${v.days_left} days left of 30`}</span>}
            <div className="sp" /><span className="sub">{v.open_items} open of {v.total} · {v.warranted} warranted · {v.unscheduled} unscheduled</span>
          </div>
          <div className="grid fields" style={{ marginTop: 12 }}>
            <label>Inspection date<input type="date" defaultValue={v.inspection_date ?? ''} key={`i${v.inspection_date}`} onBlur={e => { if ((e.target.value || null) !== v.inspection_date) run(() => api.saveCycle(v.id, { inspection_date: e.target.value || null })); }} /></label>
            <label>Time<input defaultValue={v.inspection_time} key={`t${v.inspection_time}`} onBlur={e => { if (e.target.value !== v.inspection_time) run(() => api.saveCycle(v.id, { inspection_time: e.target.value })); }} /></label>
            <label>CAR received<input type="date" defaultValue={v.car_received_on ?? ''} key={`c${v.car_received_on}`} onBlur={e => { if ((e.target.value || null) !== v.car_received_on) run(() => api.saveCycle(v.id, { car_received_on: e.target.value || null })); }} /></label>
            <label>Response due<input disabled value={v.car_due ?? ''} /></label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button disabled={busy} onClick={() => setCar({ cycleId: v.id, date: new Date().toISOString().slice(0, 10), out: Object.fromEntries(items.filter(i => i.cycle_id === v.id).map(i => [i.item_number, i.car_outcome || 'Warranted'])) })}>Record CAR outcomes</button>
            {v.car_received_on && <button className="danger" disabled={busy} onClick={() => { if (window.confirm('Undo this CAR? Outcomes are cleared and the 30-day clock is removed.')) run(() => api.resetCar(v.id)); }}>Reset CAR (wrong home)</button>}
            {!v.offer_prepared_on && v.stage === 'Scheduled' && <button disabled={busy} onClick={() => run(() => api.markOfferPrepared(v.id))}>Mark cash offer prepared</button>}
            {!v.closed_on ? <button disabled={busy} onClick={() => run(() => api.saveCycle(v.id, { closed_on: new Date().toISOString().slice(0, 10) }))}>Close cycle</button>
              : <button disabled={busy} onClick={() => run(() => api.saveCycle(v.id, { closed_on: null }))}>Re-open</button>}
          </div>
          {car?.cycleId === v.id && <div style={{ marginTop: 12 }}>
            <div className="row"><label>Report date<input type="date" value={car.date} onChange={e => setCar({ ...car, date: e.target.value })} /></label>
              <span className="sub">Not Warranted items are closed automatically. The 30-day clock starts from the report date.</span></div>
            <table style={{ marginTop: 8 }}><tbody>{items.filter(i => i.cycle_id === v.id).map(i => <tr key={i.id}><td><b>#{i.item_number}</b></td><td>{i.description.slice(0, 120)}</td>
              <td><select value={car.out[i.item_number]} onChange={e => setCar({ ...car, out: { ...car.out, [i.item_number]: e.target.value } })}>{OUTCOMES.map(o => <option key={o}>{o}</option>)}</select></td></tr>)}</tbody></table>
            <div className="row" style={{ marginTop: 10 }}><button className="pri" disabled={busy} onClick={() => run(async () => { await api.applyCar(c.id, v.id, car.date, Object.entries(car.out).map(([num, outcome]) => ({ num: Number(num), outcome }))); setCar(null); })}>Apply CAR</button><button onClick={() => setCar(null)}>Cancel</button></div>
          </div>}
        </div>)}
      </div>}

      {tab === 'cash' && <div className="grid two" style={{ alignItems: 'start' }}>
        <div className="card"><h2>New cash offer</h2>
          <p className="sub">Partial offer: tick items on the Items tab ({selIds.length} selected), enter the base estimate, and the offer is base × 1.30 × 1.15 × 1.13 unless you enter a negotiated total. The items move to “awaiting signature”.</p>
          <div className="grid fields">
            <label>Base estimate ($)<input value={offer.base} onChange={e => setOffer({ ...offer, base: e.target.value })} /></label>
            <label>Negotiated total (optional)<input value={offer.negotiated} onChange={e => setOffer({ ...offer, negotiated: e.target.value })} /></label>
            <label>Calculated offer<input disabled value={Number(offer.base) > 0 ? '$' + api.money(Number(offer.base) * mult) : ''} /></label>
          </div>
          <div className="row" style={{ marginTop: 12 }}>
            <button className="pri" disabled={busy || !selIds.length || !(Number(offer.base) > 0)} onClick={() => run(async () => { await api.createBatch(c.id, selIds, Number(offer.base), offer.negotiated ? Number(offer.negotiated) : null); setSel(new Set()); setOffer({ base: '', negotiated: '' }); })}>Offer on {selIds.length} selected item(s)</button>
            <button disabled={busy} onClick={() => run(() => api.fullRelease(c.id))}>Full &amp; Final from item offers</button>
          </div>
          {pendingAll && <div className="note" style={{ marginTop: 12 }}>Every priced item is awaiting signature — this is a clean whole-case offer.
            <div className="row" style={{ marginTop: 8 }}>
              <button className="pri" disabled={busy} onClick={() => { if (window.confirm('Accept the Full & Final settlement? This locks every priced item and closes the case.')) run(() => api.resolveCaseCash(c.id, 'accepted')); }}>Accepted — close case</button>
              <button disabled={busy} onClick={() => run(() => api.resolveCaseCash(c.id, 'declined'))}>Declined</button></div></div>}
        </div>
        <div className="card"><h2>Offers &amp; releases</h2>
          <div className="scroll"><table>
            <thead><tr><th>Date</th><th>Type</th><th>Items</th><th className="num">Total</th><th>Decision</th><th></th></tr></thead>
            <tbody>{batches.map(b => <tr key={b.id}>
              <td>{api.fmtDate(b.created_at)}</td><td>{b.kind === 'full' ? 'Full & Final' : 'Partial'}</td><td>#{b.item_numbers}</td><td className="num">${api.money(b.final_total)}</td>
              <td><span className={`pill ${b.decision === 'ACCEPTED' ? 'g' : b.decision === 'DECLINED' ? 'r' : 'a'}`}>{b.decision}</span>{b.signed_release_ref && <div className="sub">{b.signed_release_ref}</div>}</td>
              <td className="num">{b.decision === 'OFFERED' && <>
                <button disabled={busy} onClick={() => { const ref = window.prompt('Signed release link or reference'); if (ref) run(() => api.decideBatch(b.id, 'ACCEPTED', ref)); }}>Accept</button>{' '}
                <button disabled={busy} onClick={() => run(() => api.decideBatch(b.id, 'DECLINED', ''))}>Decline</button></>}</td></tr>)}
              {!batches.length && <tr><td colSpan={6} className="sub">No offers yet.</td></tr>}</tbody>
          </table></div>
        </div>
      </div>}

      {tab === 'activity' && <div className="card">
        <div className="row" style={{ marginBottom: 12 }}><input style={{ flex: 1 }} placeholder="Add a note to the case file…" value={note} onChange={e => setNote(e.target.value)} />
          <button className="pri" disabled={busy || !note.trim()} onClick={() => run(async () => { await api.addNote(c, 'Internal Note', note.trim()); setNote(''); })}>Add note</button></div>
        <table><tbody>{comms.map(m => <tr key={m.id}><td style={{ whiteSpace: 'nowrap' }} className="sub">{new Date(m.occurred_at).toLocaleString('en-CA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
          <td><span className="pill">{m.type}</span></td><td>{m.summary}<div className="sub">{m.by_name}</div></td></tr>)}
          {!comms.length && <tr><td className="sub">No activity yet.</td></tr>}</tbody></table>
      </div>}
    </div>);
}
