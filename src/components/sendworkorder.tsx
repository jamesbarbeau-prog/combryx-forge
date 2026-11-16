// Send one work order to a trade or an in-house technician through the portal link, and follow their answer.
import { useEffect, useState } from 'react';
import { Send, Copy, Mail, Check, Clock } from 'lucide-react';
import { supabase } from '@/lib/supabase';

export interface WOFull {
  id: string; status: string | null; issue: string; created_at: string | null; scheduled_time: string | null;
  portal_token: string; owner_token: string; audience: string | null; recipient_name: string | null; recipient_email: string | null;
  proposed_at: string | null; proposed_window: string | null; portal_sent_at: string | null; portal_viewed_at: string | null;
  response: string | null; requested_time: string | null; response_note: string | null;
  trade_attended: boolean | null; owner_attended: boolean | null; owner_satisfied: boolean | null; owner_comment: string | null;
}
export const WO_COLS = 'id,status,issue,created_at,scheduled_time,portal_token,owner_token,audience,recipient_name,recipient_email,proposed_at,proposed_window,portal_sent_at,portal_viewed_at,response,requested_time,response_note,trade_attended,owner_attended,owner_satisfied,owner_comment';

interface Person { id: string; name: string; email: string | null }
const WINDOWS = ['8:00 am – 12:00 pm', '12:00 pm – 4:00 pm', 'Any time that day', 'First thing in the morning'];
const TEST_MAIL = 'james.barbeau@claridgehomes.com';
const origin = () => window.location.origin;
export const tradeLink = (w: { portal_token: string }) => `${origin()}/portal/work-order/${w.portal_token}`;
export const ownerLink = (w: { owner_token: string }) => `${origin()}/portal/visit/${w.owner_token}`;
const fmt = (iso: string | null) => iso ? new Date(iso).toLocaleString('en-CA', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

export function statusOf(w: WOFull): { text: string; tone: 'ok' | 'warn' | 'bad' | 'idle' } {
  if (w.status === 'no_show') return { text: 'No-show reported', tone: 'bad' };
  if (w.owner_attended === true && w.owner_satisfied === false) return { text: 'Owner not satisfied', tone: 'bad' };
  if (w.status === 'complete') return { text: 'Complete', tone: 'ok' };
  if (w.response === 'reschedule_requested') return { text: `Asked for ${w.requested_time ?? 'another time'}`, tone: 'warn' };
  if (w.response === 'accepted') return { text: `Accepted ${fmt(w.scheduled_time ?? w.proposed_at)}`, tone: 'ok' };
  if (w.portal_viewed_at) return { text: 'Opened, no answer yet', tone: 'warn' };
  if (w.portal_sent_at) return { text: 'Sent, not opened', tone: 'idle' };
  return { text: 'Not sent', tone: 'idle' };
}

export function SendWorkOrder({ order, tradeName, address, onChanged }: { order: WOFull; tradeName: string | null; address: string; onChanged: () => void }) {
  const [trades, setTrades] = useState<Person[]>([]);
  const [techs, setTechs] = useState<Person[]>([]);
  const [audience, setAudience] = useState<'trade' | 'tech'>((order.audience as 'trade' | 'tech') || 'trade');
  const [pick, setPick] = useState('');
  const [email, setEmail] = useState(order.recipient_email ?? '');
  const [date, setDate] = useState(order.proposed_at ? order.proposed_at.slice(0, 10) : '');
  const [time, setTime] = useState(order.proposed_at ? new Date(order.proposed_at).toTimeString().slice(0, 5) : '08:00');
  const [win, setWin] = useState(order.proposed_window ?? WINDOWS[0]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [open, setOpen] = useState(!order.portal_sent_at);

  useEffect(() => {
    (async () => {
      const [{ data: t }, { data: k }] = await Promise.all([
        supabase.from('trades').select('id,trade_name,email,contact_person').eq('is_active', true).order('trade_name'),
        supabase.from('techs').select('id,name,email').eq('active', true).order('name'),
      ]);
      const tr = ((t ?? []) as { id: string; trade_name: string; email: string | null; contact_person: string | null }[]).map(x => ({ id: x.id, name: x.trade_name, email: x.email }));
      setTrades(tr); setTechs(((k ?? []) as Person[]));
      if (!order.recipient_name && tradeName) { const m = tr.find(x => x.name === tradeName); if (m) { setPick(m.id); if (!email && m.email) setEmail(m.email); } }
      else if (order.recipient_name) { const m = tr.find(x => x.name === order.recipient_name) ?? ((k ?? []) as Person[]).find(x => x.name === order.recipient_name); if (m) setPick(m.id); }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const list = audience === 'trade' ? trades : techs;
  const chosen = list.find(x => x.id === pick);

  function choose(id: string) { setPick(id); const p = list.find(x => x.id === id); if (p?.email) setEmail(p.email); }

  async function send() {
    if (!chosen) { setMsg('Choose who it is for.'); return; }
    if (!date) { setMsg('Choose a visit date.'); return; }
    setBusy(true); setMsg('');
    const proposed = new Date(`${date}T${time || '08:00'}`).toISOString();
    const { error } = await supabase.from('work_orders').update({
      audience, recipient_name: chosen.name, recipient_email: email || null, proposed_at: proposed, proposed_window: win || null,
      portal_sent_at: new Date().toISOString(), status: 'sent', response: null, response_at: null, requested_time: null,
    }).eq('id', order.id);
    setBusy(false);
    if (error) { setMsg(error.message); return; }
    setOpen(false); onChanged();
  }

  const link = tradeLink(order);
  const mailto = () => {
    const subject = `Work order: ${order.issue}`;
    const body = `Hello,\n\nWe have a warranty repair at ${address || 'the site'} for you.\n\nOpen the work order, see the proposed time, print it, and accept the time or ask for a different one here:\n${link}\n\nThank you.`;
    const real = email || order.recipient_email || '';
    // Test mode: the draft opens addressed to the tester, never to the real trade. Set TEST_MAIL to '' to go live.
    if (TEST_MAIL) return `mailto:${encodeURIComponent(TEST_MAIL)}?subject=${encodeURIComponent('[TEST] ' + subject)}&body=${encodeURIComponent(`TEST MODE. This would go to: ${real || 'nobody (no address on file)'}\n\n` + body)}`;
    return `mailto:${encodeURIComponent(real)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  async function copy(text: string) { try { await navigator.clipboard.writeText(text); setMsg('Link copied.'); } catch { setMsg(text); } }

  const st = statusOf(order);
  const sent = !!order.portal_sent_at;

  return (
    <div className={`swo tone-${st.tone}`}>
      <div className="swo-top"><b>{order.issue}</b><span className="swo-st">{st.text}</span></div>
      {sent && order.recipient_name && <div className="swo-m">To {order.recipient_name} ({order.audience === 'tech' ? 'in-house technician' : 'trade'}){order.proposed_at ? ` · proposed ${fmt(order.proposed_at)}` : ''}</div>}
      {order.response === 'reschedule_requested' && <div className="swo-warn"><Clock size={13} /> They asked for: {order.requested_time}{order.response_note ? ` — ${order.response_note}` : ''}. Pick a new date below and send again.</div>}
      {order.owner_attended === false && <div className="swo-bad">The owner says nobody came.</div>}
      {order.owner_attended === true && order.owner_satisfied != null && <div className={order.owner_satisfied ? 'swo-ok' : 'swo-bad'}>{order.owner_satisfied ? 'The owner is satisfied.' : 'The owner is not satisfied.'}{order.owner_comment ? ` “${order.owner_comment}”` : ''}</div>}

      {sent && !open && (
        <div className="swo-acts">
          <button className="ip-btn" onClick={() => copy(link)}><Copy size={13} /> Copy link</button>
          <a className="ip-btn" href={mailto()}><Mail size={13} /> Email the link</a>
          <button className="ip-btn" onClick={() => setOpen(true)}><Send size={13} /> New time / resend</button>
        </div>
      )}

      {open && (
        <div className="swo-form">
          <div className="swo-seg">
            <button className={audience === 'trade' ? 'on' : ''} onClick={() => { setAudience('trade'); setPick(''); }}>Trade</button>
            <button className={audience === 'tech' ? 'on' : ''} onClick={() => { setAudience('tech'); setPick(''); }}>In-house technician</button>
          </div>
          <label className="ip-l">{audience === 'trade' ? 'Trade' : 'Technician'}</label>
          <select className="ip-sel" value={pick} onChange={e => choose(e.target.value)}>
            <option value="">Select</option>{list.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
          </select>
          {audience === 'tech' && techs.length === 0 && <small className="ip-hint">No technicians are set up yet.</small>}
          <label className="ip-l">Email to send the link to</label>
          <input className="ip-sel" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@company.com" />
          <div className="swo-two">
            <div><label className="ip-l">Visit date</label><input className="ip-sel" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label className="ip-l">Arrival</label><input className="ip-sel" type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
          </div>
          <label className="ip-l">Window</label>
          <select className="ip-sel" value={win} onChange={e => setWin(e.target.value)}>{WINDOWS.map(w => <option key={w}>{w}</option>)}</select>
          <div className="swo-acts">
            <button className="ip-btn primary" onClick={send} disabled={busy}><Send size={14} /> {busy ? 'Saving…' : 'Create link'}</button>
            {sent && <button className="ip-btn" onClick={() => setOpen(false)}>Cancel</button>}
          </div>
        </div>
      )}
      {msg && <div className="swo-note">{msg.startsWith('http') ? <><Check size={13} /> {msg}</> : msg}</div>}
    </div>
  );
}

export const SWO_CSS = `
.swo{border:1px solid #D9D2C5;background:#fff;border-radius:6px;padding:12px 14px;margin-top:10px}
.swo.tone-ok{border-left:3px solid #4A7A55}.swo.tone-warn{border-left:3px solid #9A6A16}.swo.tone-bad{border-left:3px solid #A5402F}.swo.tone-idle{border-left:3px solid #C9C0AE}
.swo-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.swo-top b{font-size:13px;color:#1F2A3C;line-height:1.35}
.swo-st{font-size:11px;font-weight:700;color:#485163;background:#EFEBE2;border-radius:4px;padding:3px 8px;white-space:nowrap}
.swo-m{font-size:12px;color:#6C7280;margin-top:4px}
.swo-warn{display:flex;gap:6px;align-items:flex-start;margin-top:8px;font-size:12px;color:#6E5316;background:#F3E8CF;border-radius:5px;padding:7px 9px}
.swo-bad{margin-top:8px;font-size:12px;color:#A5402F;background:#F4E2DE;border-radius:5px;padding:7px 9px}.swo-ok{margin-top:8px;font-size:12px;color:#2F5C3B;background:#E3EDE5;border-radius:5px;padding:7px 9px}
.swo-acts{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.swo-acts a{text-decoration:none}
.swo-form{margin-top:10px;display:flex;flex-direction:column}.swo-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.swo-seg{display:flex;border:1px solid #C9C0AE;border-radius:6px;overflow:hidden;margin-bottom:6px}.swo-seg button{flex:1;padding:8px;background:#F8F6F1;border:none;font:inherit;font-size:12px;font-weight:600;color:#485163;cursor:pointer}.swo-seg button.on{background:#3F6A8F;color:#fff}
.swo-note{margin-top:8px;font-size:12px;color:#485163;display:flex;gap:6px;align-items:center;word-break:break-all}
`;
