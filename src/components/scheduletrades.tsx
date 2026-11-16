// "Schedule trades": one work order per trade for the case, each covering all of that trade's items, with a portal link per trade.
import { useEffect, useMemo, useState } from 'react';
import { X, Send, Copy, Mail, Check, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { tradeLink, workOrderMailto, TEST_MAIL } from '@/components/sendworkorder';

export interface STItem { id: string; item_number: number; room: string | null; description: string; status: string; warranty_decision: string | null; trade_required: string | null }
interface Props { caseId: string; companyId: string; lotId: string | null; items: STItem[]; onClose: () => void; onDone: () => void }
interface Cfg { date: string; time: string; win: string; email: string; checked: string[] }
interface Made { trade: string; count: number; token: string; email: string; when: string; issue: string }

const WINDOWS = ['8:00 am – 12:00 pm', '12:00 pm – 4:00 pm', 'Any time that day', 'First thing in the morning'];
const isInHouse = (name: string) => /^claridge technician/i.test(name);
const approved = (i: STItem) => i.warranty_decision === 'warranty_approved';

export function ScheduleTradesDialog({ caseId, companyId, lotId, items, onClose, onDone }: Props) {
  const [dir, setDir] = useState<Record<string, { email: string | null }>>({});
  const [booked, setBooked] = useState<Set<string>>(new Set());
  const [address, setAddress] = useState('');
  const [cfg, setCfg] = useState<Record<string, Cfg>>({});
  const [allDate, setAllDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [made, setMade] = useState<Made[] | null>(null);
  const [copied, setCopied] = useState('');
  const [ready, setReady] = useState(false);

  const candidates = useMemo(() => items.filter(i => i.status === 'outstanding' && i.trade_required), [items]);
  const groups = useMemo(() => {
    const m = new Map<string, STItem[]>();
    for (const i of candidates.filter(i => !booked.has(i.id))) m.set(i.trade_required!, [...(m.get(i.trade_required!) ?? []), i]);
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [candidates, booked]);
  const alreadyCount = candidates.filter(i => booked.has(i.id)).length;

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: wos }, { data: lot }] = await Promise.all([
        supabase.from('trades').select('trade_name,email').eq('is_active', true),
        supabase.from('work_orders').select('custom_fields,status').eq('case_id', caseId).neq('status', 'cancelled'),
        lotId ? supabase.from('warranty_lots').select('address,civic_number,street,lot_number').eq('id', lotId).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setDir(Object.fromEntries(((t ?? []) as { trade_name: string; email: string | null }[]).map(x => [x.trade_name, { email: x.email }])));
      const ids = new Set<string>();
      for (const w of (wos ?? []) as { custom_fields: { item_id?: string; item_ids?: string[] } | null }[]) {
        if (w.custom_fields?.item_id) ids.add(w.custom_fields.item_id);
        for (const x of w.custom_fields?.item_ids ?? []) ids.add(x);
      }
      setBooked(ids);
      const l = lot as { address: string | null; civic_number: string | null; street: string | null; lot_number: string | null } | null;
      setAddress(l?.address ?? (`${l?.civic_number ?? ''} ${l?.street ?? ''}`.trim() || (l?.lot_number ? `Lot ${l.lot_number}` : '')));
      setReady(true);
    })();
  }, [caseId, lotId]);

  // Start each trade with its approved items ticked and its email filled in.
  useEffect(() => {
    if (!ready) return;
    setCfg(prev => {
      const next = { ...prev };
      for (const [trade, its] of groups) if (!next[trade]) next[trade] = { date: '', time: '08:00', win: WINDOWS[0], email: dir[trade]?.email ?? '', checked: its.filter(approved).map(i => i.id) };
      return next;
    });
  }, [ready, groups, dir]);

  const set = (trade: string, patch: Partial<Cfg>) => setCfg(c => ({ ...c, [trade]: { ...c[trade], ...patch } }));
  const toggle = (trade: string, id: string) => { const c = cfg[trade]; set(trade, { checked: c.checked.includes(id) ? c.checked.filter(x => x !== id) : [...c.checked, id] }); };
  const applyAll = (d: string) => { setAllDate(d); setCfg(c => Object.fromEntries(Object.entries(c).map(([k, v]) => [k, { ...v, date: d }]))); };

  const ready2go = groups.filter(([t]) => cfg[t]?.checked.length && cfg[t]?.date);

  async function create() {
    setBusy(true); setErr('');
    const out: Made[] = [];
    try {
      for (const [trade, its] of ready2go) {
        const c = cfg[trade];
        const chosen = its.filter(i => c.checked.includes(i.id));
        const issue = chosen.length === 1 ? `${trade}: ${chosen[0].description}`.slice(0, 120) : `${trade}: ${chosen.length} items`;
        const lines = chosen.map(i => `#${i.item_number} ${i.room ? i.room + ': ' : ''}${i.description}`).join('\n');
        const proposed = new Date(`${c.date}T${c.time || '08:00'}`).toISOString();
        const { data: wo, error } = await supabase.from('work_orders').insert({
          company_id: companyId, case_id: caseId, lot_id: lotId, issue, description: lines, address: address || 'Address not on file',
          call_type: 'Warranty', priority: 'normal', items_total: chosen.length,
          custom_fields: { item_ids: chosen.map(i => i.id), trade },
          audience: isInHouse(trade) ? 'tech' : 'trade', recipient_name: trade, recipient_email: c.email || null,
          proposed_at: proposed, proposed_window: c.win || null, portal_sent_at: new Date().toISOString(), status: 'sent',
        }).select('id,portal_token').single();
        if (error || !wo) throw new Error(`${trade}: ${error?.message ?? 'could not create the work order'}`);
        const { error: e2 } = await supabase.from('work_order_items').insert(chosen.map(i => ({ company_id: companyId, work_order_id: wo.id, warranty_item_id: i.id })));
        if (e2) throw new Error(`${trade}: ${e2.message}`);
        out.push({ trade, count: chosen.length, token: wo.portal_token, email: c.email, issue, when: `${new Date(proposed).toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}, ${c.win}` });
      }
      setMade(out); onDone();
    } catch (e) {
      setErr((e as Error).message);
      if (out.length) { setMade(out); onDone(); }
    }
    setBusy(false);
  }

  async function copy(token: string) {
    const link = tradeLink({ portal_token: token });
    try { await navigator.clipboard.writeText(link); } catch { window.prompt('Copy this link', link); }
    setCopied(token); setTimeout(() => setCopied(''), 1500);
  }

  return (
    <div className="st-scrim" onClick={onClose}>
      <style>{CSS}</style>
      <div className="st" role="dialog" aria-label="Schedule trades" onClick={e => e.stopPropagation()}>
        <header className="st-h">
          <div><h2>Schedule trades</h2><p>One work order per trade, covering all of that trade's items. Each trade gets one link.</p></div>
          <button className="st-x" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </header>

        {!ready ? <div className="st-m">Loading…</div> : made ? (
          <div className="st-body">
            <p className="st-ok"><Check size={14} /> {made.length} work order{made.length === 1 ? '' : 's'} created. Nothing has been emailed yet{TEST_MAIL ? ' (test mode: email drafts open addressed to you)' : ''}.</p>
            {made.map(m => (
              <div key={m.token} className="st-card">
                <div className="st-top"><b>{m.trade}</b>{isInHouse(m.trade) && <span className="st-tag">In-house</span>}<span className="st-n">{m.count} item{m.count === 1 ? '' : 's'}</span></div>
                <div className="st-m2">{m.when}</div>
                <div className="st-acts">
                  <button className="st-btn" onClick={() => copy(m.token)}>{copied === m.token ? <Check size={13} /> : <Copy size={13} />} {copied === m.token ? 'Copied' : 'Copy link'}</button>
                  <a className="st-btn" href={workOrderMailto(m.issue, address, tradeLink({ portal_token: m.token }), m.email)}><Mail size={13} /> Email the link</a>
                </div>
              </div>
            ))}
            {err && <p className="st-err">{err}</p>}
            <div className="st-foot"><button className="st-btn primary" onClick={onClose}>Done</button></div>
          </div>
        ) : groups.length === 0 ? (
          <div className="st-body">
            <p className="st-m">{candidates.length === 0 ? 'No items are ready. Assign a trade to at least one outstanding item first.' : `All ${alreadyCount} item${alreadyCount === 1 ? '' : 's'} with a trade already have a work order.`}</p>
            <div className="st-foot"><button className="st-btn" onClick={onClose}>Close</button></div>
          </div>
        ) : (
          <div className="st-body">
            <div className="st-all"><label>Same visit date for every trade (optional)</label><input type="date" value={allDate} onChange={e => applyAll(e.target.value)} /></div>
            {groups.map(([trade, its]) => {
              const c = cfg[trade]; if (!c) return null;
              return (
                <section key={trade} className="st-card">
                  <div className="st-top"><Wrench size={14} /><b>{trade}</b>{isInHouse(trade) && <span className="st-tag">In-house</span>}<span className="st-n">{c.checked.length} of {its.length} item{its.length === 1 ? '' : 's'}</span></div>
                  <ul className="st-items">
                    {its.map(i => (
                      <li key={i.id}><label><input type="checkbox" checked={c.checked.includes(i.id)} onChange={() => toggle(trade, i.id)} />
                        <span>#{i.item_number} {i.room ? i.room + ': ' : ''}{i.description}{!approved(i) && <em> not yet approved</em>}</span></label></li>
                    ))}
                  </ul>
                  <div className="st-grid">
                    <div><label>Visit date</label><input type="date" value={c.date} onChange={e => set(trade, { date: e.target.value })} /></div>
                    <div><label>Arrival</label><input type="time" value={c.time} onChange={e => set(trade, { time: e.target.value })} /></div>
                    <div><label>Window</label><select value={c.win} onChange={e => set(trade, { win: e.target.value })}>{WINDOWS.map(w => <option key={w}>{w}</option>)}</select></div>
                    <div><label>Email for the link</label><input type="email" placeholder="name@company.com" value={c.email} onChange={e => set(trade, { email: e.target.value })} /></div>
                  </div>
                </section>
              );
            })}
            {alreadyCount > 0 && <p className="st-m2">{alreadyCount} item{alreadyCount === 1 ? '' : 's'} already on a work order, not shown.</p>}
            {err && <p className="st-err">{err}</p>}
            <div className="st-foot">
              <span className="st-m2">{ready2go.length === 0 ? 'Pick a date for each trade you want to schedule.' : `${ready2go.length} of ${groups.length} trade${groups.length === 1 ? '' : 's'} ready`}</span>
              <button className="st-btn" onClick={onClose}>Cancel</button>
              <button className="st-btn primary" onClick={create} disabled={busy || ready2go.length === 0}><Send size={14} /> {busy ? 'Creating…' : `Create ${ready2go.length || ''} work order${ready2go.length === 1 ? '' : 's'}`}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const CSS = `
.st-scrim{position:fixed;inset:0;z-index:80;background:rgba(27,42,65,.5);display:flex;align-items:center;justify-content:center;padding:20px}
.st{width:100%;max-width:720px;max-height:90vh;display:flex;flex-direction:column;background:#F8F6F1;border:1px solid #D9D2C5;border-radius:10px;box-shadow:0 24px 60px rgba(20,16,8,.35);overflow:hidden;color:#1F2A3C;font-family:var(--font-body)}
.st-h{display:flex;align-items:flex-start;gap:12px;padding:16px 20px;border-bottom:1px solid #D9D2C5;border-top:3px solid #B08D4F}
.st-h h2{font:800 18px var(--font-body);letter-spacing:-.02em;color:#1B2A41;margin:0}.st-h p{font-size:12.5px;color:#5B6577;margin:3px 0 0}
.st-x{margin-left:auto;border:0;background:transparent;cursor:pointer;color:#6C7280;padding:6px;border-radius:6px;display:flex}.st-x:hover{background:#EFEBE2}
.st-body{padding:16px 20px 18px;overflow-y:auto;display:flex;flex-direction:column;gap:12px}
.st-all{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.st-all label{font-size:12px;color:#5B6577}
.st-card{border:1px solid #D9D2C5;background:#fff;border-radius:8px;padding:12px 14px}
.st-top{display:flex;align-items:center;gap:8px;font-size:14px}.st-top b{font-weight:700}
.st-tag{font:700 10px var(--font-body);padding:2px 8px;border-radius:10px;background:rgba(63,106,143,.12);color:#2F5576}
.st-n{margin-left:auto;font-size:12px;color:#6C7280}
.st-items{list-style:none;margin:10px 0;padding:0;display:grid;gap:6px}
.st-items label{display:flex;gap:9px;align-items:flex-start;font-size:13px;line-height:1.4;cursor:pointer}.st-items input{margin-top:3px}
.st-items em{color:#9A6A16;font-style:normal;font-size:11.5px;margin-left:6px}
.st-grid{display:grid;grid-template-columns:1fr 1fr 1.3fr 1.6fr;gap:10px}
.st-grid label,.st-all label{display:block;font:700 10.5px var(--font-body);letter-spacing:.05em;text-transform:uppercase;color:#6C7280;margin-bottom:5px}
.st-all label{text-transform:none;letter-spacing:0;font-weight:600;font-size:12.5px;margin:0}
.st input[type=date],.st input[type=time],.st input[type=email],.st select{width:100%;height:36px;box-sizing:border-box;padding:0 9px;border:1px solid #C6BDAC;border-radius:6px;background:#fff;font:13px var(--font-body);color:#1F2A3C}
.st-all input{width:auto!important}
.st input:focus,.st select:focus{outline:2px solid rgba(63,106,143,.35);border-color:#3F6A8F}
.st-foot{display:flex;align-items:center;gap:8px;justify-content:flex-end;margin-top:4px}.st-foot .st-m2{margin-right:auto}
.st-btn{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 14px;border-radius:7px;border:1px solid #C6BDAC;background:#F8F6F1;color:#1F2A3C;font:700 12.5px var(--font-body);cursor:pointer;text-decoration:none}
.st-btn:hover{background:#EFEBE2}.st-btn.primary{background:linear-gradient(180deg,#2F5576,#264763);border-color:#1B2A41;color:#fff}.st-btn.primary:hover{background:linear-gradient(180deg,#34607F,#2A506D)}.st-btn:disabled{opacity:.55;cursor:default}
.st-acts{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}
.st-m,.st-m2{font-size:12.5px;color:#5B6577}.st-m{padding:22px 20px}
.st-ok{display:flex;align-items:center;gap:7px;font-size:13px;color:#2F5A3A;margin:0}
.st-err{font-size:12.5px;color:#A5402F;margin:0}
@media (max-width:640px){.st-grid{grid-template-columns:1fr 1fr}}
`;
