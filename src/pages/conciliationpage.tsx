// Conciliation Manager — dashboard, Tarion intake queue and team. Managers only (enforced by RLS).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import * as api from '@/cm/api';
import { importTrackerWorkbook } from '@/cm/trackerimport';
import type { CmCase, CmCycle, CmIntake } from '@/cm/api';
import { GuardianSignatureIcon } from '@/components/icons/GuardianSignatureIcons';
import { Donut, Columns, HBars } from '@/components/charts';
import '@/cm/cm.css';

const stagePill = (s: string) => s === 'Scheduled' ? 'b' : s === 'Awaiting CAR' ? 'a' : s === 'CAR Received' ? 'p' : 'g';
type Tab = 'dashboard' | 'intake' | 'team';

export default function ConciliationPage() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [member, setMember] = useState<{ company_id: string; role: string } | null | undefined>(undefined);
  const [cases, setCases] = useState<CmCase[]>([]);
  const [cycles, setCycles] = useState<CmCycle[]>([]);
  const [intake, setIntake] = useState<CmIntake[]>([]);
  const [tab, setTab] = useState<Tab>('dashboard');
  const [prop, setProp] = useState<'freehold' | 'common_elements'>('freehold');
  const [stage, setStage] = useState(sp.get('stage') || 'Active');
  const [community, setCommunity] = useState(sp.get('community') || '');
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const [nc, setNc] = useState({ case_number: '', homeowner: '', address: '', enrolment: '', form_type: '', insp: '' });
  const [team, setTeam] = useState<{ user_id: string; email: string; role: string }[]>([]);
  const [invite, setInvite] = useState({ email: '', role: 'coordinator' });
  const [wsName, setWsName] = useState('');

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
  const stageData = [
    { label: 'Scheduled', value: stats.scheduled, color: '#2a78d6' },
    { label: 'Awaiting CAR', value: stats.awaiting, color: '#eb6834' },
    { label: 'CAR received', value: stats.car, color: '#1baf7a' },
  ];
  const clockData = useMemo(() => {
    const b = [0, 0, 0, 0];
    for (const v of live) {
      if (v.superseded || v.stage !== 'CAR Received' || v.days_left === null || byId.get(v.case_id)?.is_closed) continue;
      b[v.days_left < 0 ? 0 : v.days_left <= 7 ? 1 : v.days_left <= 14 ? 2 : 3]++;
    }
    return [
      { label: 'Overdue', value: b[0], color: '#A5402F' },
      { label: '0–7 days', value: b[1], color: '#9A6A16' },
      { label: '8–14 days', value: b[2], color: '#2a78d6' },
      { label: '15–30 days', value: b[3], color: '#2a78d6' },
    ];
  }, [live, byId]);
  const byCommunity = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of live) {
      const c = byId.get(v.case_id);
      if (!c || c.is_closed || v.superseded || v.stage === 'Closed' || !v.open_items) continue;
      m.set(c.community || 'No community', (m.get(c.community || 'No community') ?? 0) + v.open_items);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }));
  }, [live, byId]);

  if (member === undefined) return <div className="cm">Loading…</div>;
  if (member === null) return (
    <div className="cm"><div className="row"><GuardianSignatureIcon name="resolution" size={40} /><h1>Conciliation Manager</h1></div>
      <div className="card" style={{ marginTop: 14, maxWidth: 640 }}>
        <h2>Set up your workspace</h2>
        <p className="sub">Your company's cases, inspections, items and cash settlements live in a private workspace that only your team can see. You become its first manager and can add teammates afterwards.</p>
        {err && <div className="err">{err}</div>}
        <div className="row" style={{ marginTop: 12 }}>
          <input placeholder="Company name" value={wsName} onChange={e => setWsName(e.target.value)} />
          <button className="pri" disabled={!wsName.trim() || !!busy} onClick={async () => {
            setBusy('ws'); setErr('');
            try { await api.createWorkspace(wsName.trim()); const m = await api.myMembership(); setMember(m); if (m) await load(); } catch (e) { setErr((e as Error).message); }
            setBusy('');
          }}>Create workspace</button>
        </div>
      </div></div>);

  return (
    <div className="cm">
      <div className="row">
        <div className="tile"><GuardianSignatureIcon name="resolution" size={34} /></div><div><h1>Conciliation</h1><div className="sub">Inspections, CAR clocks and cash settlements</div></div>
        <div className="sp" />
        <div className="seg">
          <button className={prop === 'freehold' ? 'on' : ''} onClick={() => setProp('freehold')}>Freehold</button>
          <button className={prop === 'common_elements' ? 'on' : ''} onClick={() => setProp('common_elements')}>Common elements</button>
        </div>
        <button onClick={() => run('sync', async () => { const r = await api.runTarionSync(); return `Tarion sync: ${r.checked} checked` + (r.errors?.length ? ` — ${r.errors.length} error(s): ${r.errors[0]}` : ''); })} disabled={!!busy}>{busy === 'sync' ? 'Syncing…' : 'Sync Tarion'}</button>
        <label className="btn" style={{ cursor: busy ? 'default' : 'pointer' }} title="Load cases, cycles, items and comms from your Apps Script tracker (.xlsx). Safe to re-run — existing cases are skipped.">
          {busy === 'import' ? (msg || 'Importing…') : 'Import tracker'}
          <input type="file" accept=".xlsx" hidden disabled={!!busy} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; if (!f) return;
            run('import', async () => { const r = await importTrackerWorkbook(f, member.company_id, s => setMsg(s));
              return `Imported ${r.cases} cases, ${r.cycles} cycles, ${r.items} items, ${r.comms} comms (${r.skipped} already existed). ${r.linked} linked to homes${r.unmatched.length ? `; no home match for ${r.unmatched.length}` : ''}.`; }); }} />
        </label>
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
            <span className="sub">Owner, lot and community fill in automatically when the enrolment # matches a home in the Warranty module.</span>
          </div>
        </div>)}

      <div className="tabs">
        <button className={tab === 'dashboard' ? 'on' : ''} onClick={() => setTab('dashboard')}>Dashboard</button>
        <button className={tab === 'intake' ? 'on' : ''} onClick={() => setTab('intake')}>Tarion intake{pendingIntake.length ? ` (${pendingIntake.length})` : ''}</button>
        <button className={tab === 'team' ? 'on' : ''} onClick={() => { setTab('team'); api.listMembers(member.company_id).then(setTeam).catch(e => setErr(e.message)); }}>Team</button>
      </div>

      {tab === 'dashboard' && <>
        <div className="grid stats">
          <div className="card stat"><div className="l">Open inspections</div><div className="n">{stats.open}</div><div className="h">{stats.scheduled} scheduled</div></div>
          <div className="card stat r"><div className="l">30-day overdue</div><div className="n">{stats.overdue}</div><div className="h">{stats.dueSoon} more due within 7 days</div></div>
          <div className="card stat a"><div className="l">Warranted, unscheduled</div><div className="n">{stats.unscheduled}</div><div className="h">items without a repair date</div></div>
          <div className="card stat g"><div className="l">Cash awaiting signature</div><div className="n">${api.money(stats.pendingAmt)}</div><div className="h">${api.money(stats.exposure)} internal estimate</div></div>
        </div>
        <div className="grid charts" style={{ marginTop: 14 }}>
          <div className="card"><h2>Inspections by stage</h2><Donut data={stageData} centerLabel="open" /></div>
          <div className="card"><h2>30-day clock</h2><div className="sub" style={{ marginBottom: 12 }}>CAR received, by days left to repair</div><Columns data={clockData} height={128} /></div>
          <div className="card"><h2>Open items by community</h2><div className="sub" style={{ marginBottom: 12 }}>Items still to resolve</div><HBars data={byCommunity} empty="No open items." /></div>
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

      {tab === 'team' && (
        <div className="card" style={{ maxWidth: 640 }}>
          <h2>Team</h2>
          <p className="sub">Managers can change anything. Coordinators and viewers can read every case. People must sign up first, then you add them here by email.</p>
          <table><thead><tr><th>Email</th><th>Role</th></tr></thead>
            <tbody>{team.map(m => <tr key={m.user_id}><td>{m.email}</td><td>{m.role}</td></tr>)}</tbody></table>
          <div className="row" style={{ marginTop: 12 }}>
            <input placeholder="teammate@company.com" value={invite.email} onChange={e => setInvite({ ...invite, email: e.target.value })} />
            <select value={invite.role} onChange={e => setInvite({ ...invite, role: e.target.value })}><option>coordinator</option><option>viewer</option><option>manager</option></select>
            <button className="pri" disabled={!invite.email.trim() || !!busy} onClick={() => run('team', async () => {
              await api.addMember(member.company_id, invite.email.trim(), invite.role); setInvite({ ...invite, email: '' }); setTeam(await api.listMembers(member.company_id));
              return 'Teammate added.';
            })}>Add</button>
          </div>
        </div>)}
    </div>);
}
