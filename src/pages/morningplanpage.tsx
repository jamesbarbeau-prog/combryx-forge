// Coordinator's morning plan: every outstanding item that already has a trade but no booking, grouped by community and trade,
// ranked by the soonest builder repair period (BRP). Book a whole run (several homes, one trade) in one go.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CalendarDays, Check, ChevronDown, ChevronUp, Copy, Mail, RefreshCw, Sunrise } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCompanyId } from '@/lib/company';
import { TEST_MAIL, tradeLink } from '@/components/sendworkorder';

interface Lot { lot_id: string; lot_number: string | null; address: string | null; items: number; brp_end: string | null; brp_src: string; period: string | null; case_id: string; case_number: string | null; emergency: boolean; days_left: number | null; oldest_days: number; tier: number }
interface Group { community_id: string; community: string | null; trade: string; items: number; lot_count: number; min_rank: number; min_days: number | null; top_tier: number; overdue_lots: number; lots: Lot[] }
interface Plan { as_of: string; summary: { items: number; lots: number; groups: number; overdue_lots: number; due30_lots: number; no_brp_lots: number; emergency_lots: number }; communities: { id: string; name: string; items: number }[]; groups: Group[] }
interface Made { lot: Lot; token: string; when: string; count: number }

const TIERS: Record<number, { label: string; color: string; bg: string }> = {
  0: { label: 'Emergency', color: '#8F2F20', bg: 'rgba(165,64,47,.14)' },
  1: { label: 'BRP ends within 30 days', color: '#9A6A16', bg: 'rgba(217,119,6,.14)' },
  2: { label: 'BRP lapsed in the last 60 days', color: '#A5402F', bg: 'rgba(165,64,47,.1)' },
  3: { label: 'BRP more than 30 days out', color: '#3F6A8F', bg: 'rgba(63,106,143,.1)' },
  4: { label: 'BRP lapsed over 60 days ago', color: '#6C7280', bg: 'rgba(108,114,128,.12)' },
  5: { label: 'No BRP date yet', color: '#6C7280', bg: 'rgba(108,114,128,.1)' },
};
const WINDOWS = ['8:00 am – 12:00 pm', '12:00 pm – 4:00 pm', 'Any time that day', 'First thing in the morning'];
const isInHouse = (t: string) => /^(claridge technician|inspector)/i.test(t);
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const nextBusiness = (from: Date, n = 1) => { const d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; } return d; };
const addBusiness = (iso0: string, n: number) => { const [y, m, dd] = iso0.split('-').map(Number); let d = new Date(y, m - 1, dd); while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() + 1); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0 && d.getDay() !== 6) n--; } return d; };
const dayLabel = (d: Date) => d.toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' });
const street = (a: string | null) => (a ?? '').replace(/,\s*Ottawa.*$/i, '');
const gkey = (g: Group) => `${g.community_id}|${g.trade}`;
const brpText = (l: Lot) => l.brp_end == null ? 'No BRP date' : l.days_left! >= 0 ? `${l.days_left}d left${l.brp_src === 'calc' ? ' (calc.)' : ''}` : `${-l.days_left!}d past${l.brp_src === 'calc' ? ' (calc.)' : ''}`;

export default function MorningPlanPage() {
  const nav = useNavigate();
  const [scope, setScope] = useState<'trades' | 'internal' | 'all'>('trades');
  const [community, setCommunity] = useState('');
  const [max, setMax] = useState(40);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [err, setErr] = useState(''); const [loading, setLoading] = useState(true);
  const [start, setStart] = useState(() => iso(nextBusiness(new Date())));
  const [cap, setCap] = useState(6);
  const [win, setWin] = useState(WINDOWS[0]);
  const [open, setOpen] = useState<string | null>(null);
  const [unticked, setUnticked] = useState<Record<string, Set<string>>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [made, setMade] = useState<Record<string, Made[]>>({});
  const [booked, setBooked] = useState<Record<string, Group>>({});
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    const { data, error } = await supabase.rpc('plan_trade_work', { p_scope: scope, p_community: community || null, p_max_groups: max });
    if (error) setErr(error.message); else setPlan(data as Plan);
    setLoading(false);
  }, [scope, community, max]);
  useEffect(() => { load(); }, [load]);

  const selected = (g: Group) => g.lots.filter(l => !unticked[gkey(g)]?.has(l.lot_id));
  const toggle = (g: Group, id: string) => setUnticked(u => { const s = new Set(u[gkey(g)] ?? []); s.has(id) ? s.delete(id) : s.add(id); return { ...u, [gkey(g)]: s }; });
  const dateFor = (idx: number) => addBusiness(start, Math.floor(idx / Math.max(cap, 1)));

  async function unbookedItems(lotId: string, trade: string) {
    const { data, error } = await supabase.from('warranty_items')
      .select('id,item_number,room,description,warranty_decision,cases!inner(lot_id,status)')
      .eq('trade_required', trade).eq('status', 'outstanding').is('deleted_at', null).eq('cases.lot_id', lotId).in('cases.status', ['open', 'in_progress']).limit(500);
    if (error) throw new Error(error.message);
    const items = ((data ?? []) as unknown as { id: string; item_number: string | number; room: string | null; description: string; warranty_decision: string | null }[]).filter(i => i.warranty_decision !== 'not_warranty');
    const taken = new Set<string>();
    for (let i = 0; i < items.length; i += 100) {
      const { data: w } = await supabase.from('work_order_items').select('warranty_item_id, work_orders!inner(status)').in('warranty_item_id', items.slice(i, i + 100).map(x => x.id));
      for (const r of (w ?? []) as unknown as { warranty_item_id: string; work_orders: { status: string | null } }[]) if (!['cancelled', 'complete', 'no_show'].includes(r.work_orders?.status ?? '')) taken.add(r.warranty_item_id);
    }
    return items.filter(i => !taken.has(i.id));
  }

  async function book(g: Group) {
    const lots = selected(g); if (!lots.length) return;
    setBusy(gkey(g)); setErr('');
    const out: Made[] = [];
    try {
      const companyId = await getCompanyId();
      const { data: t } = await supabase.from('trades').select('email').eq('trade_name', g.trade).maybeSingle();
      const email = (t as { email: string | null } | null)?.email ?? null;
      const runId = crypto.randomUUID(); const runLabel = `${g.community ?? 'Community'}: ${g.trade}, ${lots.length} home${lots.length === 1 ? '' : 's'}`;
      for (let idx = 0; idx < lots.length; idx++) {
        const lot = lots[idx]; const day = dateFor(idx);
        const items = await unbookedItems(lot.lot_id, g.trade); if (!items.length) continue;
        const proposed = new Date(`${iso(day)}T08:00`).toISOString();
        const address = lot.address || (lot.lot_number ? `Lot ${lot.lot_number}` : 'Address not on file');
        const { data: wo, error } = await supabase.from('work_orders').insert({
          company_id: companyId, case_id: lot.case_id, lot_id: lot.lot_id,
          issue: items.length === 1 ? `${g.trade}: ${items[0].description}`.slice(0, 120) : `${g.trade}: ${items.length} items`,
          description: items.map(i => `#${i.item_number} ${i.room ? i.room + ': ' : ''}${i.description}`).join('\n'), address,
          call_type: 'Warranty', priority: lot.tier === 0 ? 'urgent' : lot.tier <= 2 ? 'high' : 'normal', items_total: items.length,
          custom_fields: { item_ids: items.map(i => i.id), trade: g.trade, run_id: runId, run_label: runLabel, from: 'morning_plan' },
          audience: isInHouse(g.trade) ? 'tech' : 'trade', recipient_name: g.trade, recipient_email: email,
          proposed_at: proposed, proposed_window: win, portal_sent_at: new Date().toISOString(), status: 'sent',
        }).select('id,portal_token').single();
        if (error || !wo) throw new Error(`${address}: ${error?.message ?? 'could not create the work order'}`);
        const { error: e2 } = await supabase.from('work_order_items').insert(items.map(i => ({ company_id: companyId, work_order_id: wo.id, warranty_item_id: i.id })));
        if (e2) throw new Error(`${address}: ${e2.message}`);
        out.push({ lot, token: wo.portal_token, when: `${dayLabel(day)}, ${win}`, count: items.length });
      }
    } catch (e) { setErr((e as Error).message); }
    if (out.length) { setMade(m => ({ ...m, [gkey(g)]: out })); setBooked(b => ({ ...b, [gkey(g)]: g })); load(); }
    setBusy(null);
  }

  function mailAll(g: Group, rows: Made[]) {
    const subject = `Work orders: ${g.community ?? ''} (${rows.length} home${rows.length === 1 ? '' : 's'})`;
    const body = `Hello,\n\nWe have warranty repairs for you at ${g.community ?? 'our community'}. Open each work order to see the proposed time, and accept it or ask for another:\n\n` +
      rows.map(r => `${street(r.lot.address) || 'Lot ' + r.lot.lot_number} — ${r.when} (${r.count} item${r.count === 1 ? '' : 's'})\n${tradeLink({ portal_token: r.token })}`).join('\n\n') + '\n\nThank you.';
    return `mailto:${encodeURIComponent(TEST_MAIL)}?subject=${encodeURIComponent('[TEST] ' + subject)}&body=${encodeURIComponent(`TEST MODE. This would go to the trade on file\n\n` + body)}`;
  }
  async function copyAll(g: Group, rows: Made[]) {
    const text = rows.map(r => `${street(r.lot.address) || 'Lot ' + r.lot.lot_number} — ${r.when}\n${tradeLink({ portal_token: r.token })}`).join('\n\n');
    try { await navigator.clipboard.writeText(text); } catch { window.prompt('Copy these links', text); }
    setCopied(gkey(g)); setTimeout(() => setCopied(''), 1500);
  }

  const s = plan?.summary;
  const today = useMemo(() => new Date().toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }), []);
  const groups = plan?.groups ?? [];

  return (
    <div className="mp">
      <style>{CSS}</style>
      <header className="mp-h">
        <div>
          <h1><Sunrise size={22} /> Morning plan</h1>
          <p>{today}. Everything with a trade on it and no booking yet, grouped by community and trade, soonest BRP first.</p>
        </div>
        <button className="mp-btn" onClick={load} disabled={loading}><RefreshCw size={14} className={loading ? 'mp-spin' : ''} /> Refresh</button>
      </header>

      {TEST_MAIL && <div className="mp-test">Test mode. Booking creates the work orders but sends nothing. Email drafts open addressed to {TEST_MAIL}, never to the trade.</div>}

      <div className="mp-tiles">
        <Tile n={s?.items} l="Items waiting for a booking" />
        <Tile n={s?.lots} l="Homes" />
        <Tile n={s?.emergency_lots} l="Emergency" tone="r" />
        <Tile n={s?.due30_lots} l="BRP ends in 30 days" tone="a" />
        <Tile n={s?.overdue_lots} l="BRP already lapsed" tone="r" />
        <Tile n={s?.no_brp_lots} l="No BRP date yet" />
      </div>

      <div className="mp-bar">
        <div className="mp-seg" role="tablist" aria-label="Who the items are assigned to">
          {([['trades', 'Trades'], ['internal', 'In-house'], ['all', 'Everyone']] as const).map(([k, l]) => <button key={k} className={scope === k ? 'on' : ''} onClick={() => { setScope(k); setMax(40); }}>{l}</button>)}
        </div>
        <select value={community} onChange={e => { setCommunity(e.target.value); setMax(40); }} aria-label="Community">
          <option value="">All communities</option>
          {(plan?.communities ?? []).map(c => <option key={c.id} value={c.id}>{c.name} ({c.items})</option>)}
        </select>
        <label className="mp-f"><CalendarDays size={14} /> First day <input type="date" value={start} onChange={e => setStart(e.target.value)} /></label>
        <label className="mp-f">Homes per day <input type="number" min={1} max={30} value={cap} onChange={e => setCap(Math.max(1, Number(e.target.value) || 1))} /></label>
        <select value={win} onChange={e => setWin(e.target.value)} aria-label="Time window">{WINDOWS.map(w => <option key={w}>{w}</option>)}</select>
      </div>

      {err && <div className="mp-err">{err}</div>}
      {loading && !plan && <div className="mp-empty">Working out the plan…</div>}
      {plan && !groups.length && <div className="mp-empty">Nothing is waiting. Every item with a trade already has a booking.</div>}

      {Object.keys(booked).length > 0 && (
        <div className="mp-list" style={{ marginBottom: 14 }}>
          {Object.entries(booked).map(([k, g]) => { const rows = made[k] ?? []; return (
            <section key={k} className="mp-card" style={{ borderLeftColor: '#4A7A55' }}>
              <div className="mp-done" style={{ marginTop: 0, borderTop: 'none', paddingTop: 0 }}>
                <div className="mp-ok"><Check size={14} /> Booked: {rows.length} work order{rows.length === 1 ? '' : 's'} for {g.community ?? 'community'} / {g.trade}. Nothing has been emailed yet.</div>
                <div className="mp-acts">
                  <button className="mp-btn" onClick={() => copyAll(g, rows)}>{copied === k ? <Check size={14} /> : <Copy size={14} />} {copied === k ? 'Copied' : 'Copy all links'}</button>
                  <a className="mp-btn" href={mailAll(g, rows)}><Mail size={14} /> Email draft with all links</a>
                  <button className="mp-link" onClick={() => setBooked(b => { const n = { ...b }; delete n[k]; return n; })}>Dismiss</button>
                </div>
              </div>
            </section>); })}
        </div>
      )}

      <div className="mp-list">
        {groups.map(g => {
          const k = gkey(g); const t = TIERS[g.top_tier]; const sel = selected(g); const isOpen = open === k; const done = made[k];
          const first = sel.length ? dateFor(0) : null, last = sel.length ? dateFor(sel.length - 1) : null;
          return (
            <section key={k} className="mp-card" style={{ borderLeftColor: t.color }}>
              <div className="mp-top" onClick={() => setOpen(isOpen ? null : k)}>
                <div className="mp-who">
                  <div className="mp-comm">{g.community ?? 'No community'}</div>
                  <div className="mp-trade">{g.trade}{isInHouse(g.trade) && <span className="mp-tag">In-house</span>}</div>
                </div>
                <div className="mp-nums"><b>{g.lot_count}</b> home{g.lot_count === 1 ? '' : 's'} · <b>{g.items}</b> item{g.items === 1 ? '' : 's'}</div>
                <span className="mp-pill" style={{ color: t.color, background: t.bg }}>{t.label}</span>
                {isOpen ? <ChevronUp size={17} /> : <ChevronDown size={17} />}
              </div>
              <div className="mp-sub">
                {g.lots.slice(0, 4).map(l => street(l.address) || `Lot ${l.lot_number}`).join(' · ')}{g.lots.length > 4 ? ` · +${g.lots.length - 4} more` : ''}
              </div>

              {isOpen && (
                <div className="mp-lots">
                  {g.lots.map(l => {
                    const idx = sel.findIndex(x => x.lot_id === l.lot_id); const on = idx >= 0; const lt = TIERS[l.tier];
                    return (
                      <label key={l.lot_id} className={`mp-lot${on ? '' : ' off'}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(g, l.lot_id)} />
                        <span className="mp-addr">{street(l.address) || `Lot ${l.lot_number}`}{l.lot_number ? <em> · Lot {l.lot_number}</em> : null}{l.case_number ? <em> · {l.case_number}</em> : null}</span>
                        <span className="mp-it">{l.items} item{l.items === 1 ? '' : 's'}</span>
                        <span className="mp-pill sm" style={{ color: lt.color, background: lt.bg }}>{l.emergency ? 'Emergency' : brpText(l)}</span>
                        <span className="mp-day">{on ? dayLabel(dateFor(idx)) : ''}</span>
                      </label>
                    );
                  })}
                </div>
              )}

              {done ? (
                <div className="mp-done">
                  <div className="mp-ok"><Check size={14} /> {done.length} work order{done.length === 1 ? '' : 's'} created for {g.trade}. Nothing has been emailed.</div>
                  <div className="mp-acts">
                    <button className="mp-btn" onClick={() => copyAll(g, done)}>{copied === k ? <Check size={14} /> : <Copy size={14} />} {copied === k ? 'Copied' : 'Copy all links'}</button>
                    <a className="mp-btn" href={mailAll(g, done)}><Mail size={14} /> Email draft with all links</a>
                  </div>
                </div>
              ) : (
                <div className="mp-foot">
                  <span>{sel.length ? `${sel.length} home${sel.length === 1 ? '' : 's'} · ${sel.reduce((n, l) => n + l.items, 0)} items · ${first && last && iso(first) === iso(last) ? dayLabel(first) : `${first ? dayLabel(first) : ''} to ${last ? dayLabel(last) : ''}`}` : 'No homes ticked'}</span>
                  {!isOpen && <button className="mp-link" onClick={() => setOpen(k)}>Choose homes</button>}
                  <button className="mp-btn primary" disabled={!sel.length || busy === k} onClick={() => book(g)}>{busy === k ? 'Booking…' : `Book ${sel.length === g.lots.length ? 'all ' : ''}${sel.length} home${sel.length === 1 ? '' : 's'}`}</button>
                </div>
              )}
            </section>
          );
        })}
      </div>

      {plan && plan.summary.groups > groups.length && (
        <div className="mp-more"><button className="mp-btn" onClick={() => setMax(m => m + 40)}>Show more ({plan.summary.groups - groups.length} more community and trade groups)</button></div>
      )}
      <p className="mp-note">Order: emergencies, BRPs ending in the next 30 days, BRPs that lapsed in the last 60 days, then the rest. "(calc.)" means the BRP date is worked out from the home's warranty start until Tarion's own date is synced. <button className="mp-link" onClick={() => nav('/warranty/work-orders')}>See all work orders</button></p>
    </div>
  );
}

function Tile({ n, l, tone }: { n: number | undefined; l: string; tone?: 'r' | 'a' }) {
  return <div className={`mp-tile${tone ? ' ' + tone : ''}`}><b>{n == null ? '–' : n.toLocaleString('en-CA')}</b><span>{l}</span></div>;
}

const CSS = `
.mp{padding:24px 28px 60px;max-width:1100px;font-family:var(--font-body);color:var(--color-text)}
.mp-h{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px}
.mp-h h1{margin:0;font-size:24px;font-weight:800;color:var(--color-navy);display:flex;align-items:center;gap:9px}
.mp-h p{margin:4px 0 0;font-size:13.5px;color:var(--color-text-sub)}
.mp-test{background:#FFF4D6;border:1px solid #E0C36A;color:#5B4A10;border-radius:9px;padding:8px 12px;font-size:12.5px;margin-bottom:12px}
.mp-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:10px;margin-bottom:14px}
.mp-tile{background:var(--color-panel);border:1px solid var(--color-border);border-radius:11px;padding:11px 13px;display:flex;flex-direction:column;gap:2px}
.mp-tile b{font-size:22px;font-weight:800;color:var(--color-navy)}.mp-tile span{font-size:11.5px;color:var(--color-text-sub)}
.mp-tile.r b{color:#A5402F}.mp-tile.a b{color:#9A6A16}
.mp-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:14px}
.mp-bar select,.mp-bar input{height:36px;border-radius:8px;border:1px solid var(--color-border-hard,#C9BFA9);background:#fff;padding:0 10px;font:600 13px var(--font-body);color:#1F2A3C}
.mp-bar input[type=number]{width:62px}
.mp-f{display:flex;align-items:center;gap:6px;font-size:12.5px;color:var(--color-text-sub);font-weight:600}
.mp-seg{display:flex;border:1px solid var(--color-border-hard,#C9BFA9);border-radius:9px;overflow:hidden}
.mp-seg button{height:36px;padding:0 14px;border:none;background:#fff;font:700 13px var(--font-body);cursor:pointer;color:#485163}
.mp-seg button.on{background:#1B2A41;color:#fff}
.mp-btn{height:36px;border-radius:8px;border:1px solid var(--color-border-hard,#C9BFA9);background:#fff;font:700 13px var(--font-body);padding:0 14px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;color:#1F2A3C;text-decoration:none}
.mp-btn.primary{background:#1B2A41;color:#fff;border-color:#1B2A41}.mp-btn:disabled{opacity:.5;cursor:default}
.mp-link{background:none;border:none;color:#2F5576;font:700 12.5px var(--font-body);cursor:pointer;padding:0;text-decoration:underline}
.mp-err{background:rgba(165,64,47,.1);border:1px solid rgba(165,64,47,.3);color:#8F2F20;border-radius:9px;padding:9px 12px;font-size:13px;margin-bottom:12px}
.mp-empty{background:var(--color-panel);border:1px solid var(--color-border);border-radius:11px;padding:36px;text-align:center;color:var(--color-text-sub);font-size:14px}
.mp-list{display:grid;gap:12px}
.mp-card{background:var(--color-panel);border:1px solid var(--color-border);border-left:5px solid #8D96A6;border-radius:12px;padding:14px 16px}
.mp-top{display:flex;align-items:center;gap:14px;cursor:pointer}
.mp-who{flex:1;min-width:0}.mp-comm{font-size:12px;font-weight:700;color:#8D7140}.mp-trade{font-size:17px;font-weight:800;color:var(--color-navy);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mp-tag{font-size:10.5px;font-weight:800;background:#E7EDF4;color:#2F5576;border-radius:5px;padding:2px 7px}
.mp-nums{font-size:13px;color:#485163;white-space:nowrap}.mp-nums b{color:var(--color-navy)}
.mp-pill{font-size:11.5px;font-weight:800;border-radius:100px;padding:4px 10px;white-space:nowrap}.mp-pill.sm{font-size:11px;padding:3px 8px}
.mp-sub{font-size:12.5px;color:var(--color-text-sub);margin:6px 0 2px}
.mp-lots{margin:10px 0 4px;border-top:1px solid var(--color-border);padding-top:6px;max-height:420px;overflow-y:auto}
.mp-lot{display:flex;align-items:center;gap:10px;padding:8px 2px;border-bottom:1px solid rgba(190,180,160,.35);cursor:pointer;font-size:13.5px}
.mp-lot.off{opacity:.5}.mp-lot input{width:18px;height:18px;flex-shrink:0}
.mp-addr{flex:1;min-width:0;font-weight:700}.mp-addr em{font-style:normal;font-weight:500;color:#6C7280}
.mp-it{color:#485163;white-space:nowrap}.mp-day{width:92px;text-align:right;font-weight:700;color:#2F5576;white-space:nowrap;font-size:12.5px}
.mp-foot{display:flex;align-items:center;gap:12px;margin-top:10px;font-size:13px;color:#485163;flex-wrap:wrap}.mp-foot span{flex:1;min-width:200px}
.mp-done{margin-top:10px;border-top:1px solid var(--color-border);padding-top:10px}.mp-ok{color:#4A7A55;font-weight:700;font-size:13.5px;display:flex;gap:6px;align-items:center;margin-bottom:8px}
.mp-acts{display:flex;gap:8px;flex-wrap:wrap}
.mp-more{text-align:center;margin:16px 0}.mp-note{font-size:12px;color:var(--color-text-sub);margin-top:18px}
.mp-spin{animation:mps .9s linear infinite}@keyframes mps{to{transform:rotate(360deg)}}
@media (max-width:700px){.mp{padding:16px 14px 50px}.mp-top{flex-wrap:wrap}.mp-nums{order:3;width:100%}.mp-lot{flex-wrap:wrap}.mp-day{width:auto}}
`;
