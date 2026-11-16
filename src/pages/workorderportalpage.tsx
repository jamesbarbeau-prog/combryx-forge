// Work order portal: the page a trade or in-house technician opens from a private link. No login.
// They see the site and the proposed visit time, can print the work order, accept the time or ask for another, and mark the job complete.
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, Check, CalendarClock, MapPin, Phone, Wrench } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface WO {
  ref: string; company: string | null; logo: string | null; company_phone: string | null; audience: string; for: string | null;
  issue: string; description: string | null; notes: string | null; priority: string | null;
  address: string | null; lot: string | null; community: string | null; homeowner: string | null; homeowner_phone: string | null;
  items: { number: number | null; room: string | null; location: string | null; description: string }[];
  proposed_at: string | null; proposed_window: string | null; status: string | null;
  response: string | null; response_at: string | null; requested_time: string | null; response_note: string | null;
  completed_at: string | null; completion_note: string | null;
  scheduled_time: string | null; trade_attended: boolean | null; trade_attend_note: string | null;
}

const when = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
const clock = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : '';

export default function WorkOrderPortalPage() {
  const { token } = useParams();
  const [wo, setWo] = useState<WO | null | undefined>(undefined);
  const [mode, setMode] = useState<'' | 'reschedule' | 'complete' | 'noshow'>('');
  const [note, setNote] = useState('');
  const [time, setTime] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('wo_portal_get', { p_token: token });
    if (error) { setWo(null); return; }
    setWo((data ?? null) as WO | null);
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function act(action: 'accept' | 'reschedule' | 'complete' | 'attended' | 'no_show') {
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('wo_portal_respond', { p_token: token, p_action: action, p_note: note || null, p_time: time || null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMode(''); setNote(''); setTime(''); await load();
  }

  if (wo === undefined) return <div className="wp"><style>{CSS}</style><p className="wp-m">Loading…</p></div>;
  if (wo === null) return <div className="wp"><style>{CSS}</style><div className="wp-card"><h1>This link is not available</h1><p className="wp-m">It may have been mistyped or replaced. Please contact the office that sent it.</p></div></div>;

  const done = wo.response === 'completed';
  const accepted = wo.response === 'accepted';
  const asked = wo.response === 'reschedule_requested';
  const visitDay = wo.scheduled_time ? new Date(wo.scheduled_time).toDateString() <= new Date().toDateString() || new Date(wo.scheduled_time) <= new Date() : false;
  const askAttend = accepted && visitDay && wo.trade_attended == null && !done;

  return (
    <div className="wp">
      <style>{CSS}</style>
      <div className="wp-bar wp-noprint">
        <div className="wp-brand">{wo.logo ? <img src={wo.logo} alt="" /> : null}<span>{wo.company ?? 'Work order'}</span></div>
        <button className="wp-btn ghost" onClick={() => window.print()}><Printer size={15} /> Print work order</button>
      </div>

      <main className="wp-card">
        <div className="wp-head">
          <div>
            <div className="wp-k">Work order {wo.ref}</div>
            <h1>{wo.issue}</h1>
            {wo.for && <div className="wp-m">For {wo.for}{wo.audience === 'tech' ? ' (in-house technician)' : ''}</div>}
          </div>
          {wo.priority && wo.priority !== 'normal' && <span className="wp-tag">{wo.priority}</span>}
        </div>

        <section className="wp-sec">
          <div className="wp-row"><MapPin size={16} /><div><b>{wo.address ?? 'Address not on file'}</b><span>{[wo.community, wo.lot ? `Lot ${wo.lot}` : ''].filter(Boolean).join(' · ')}</span></div></div>
          {(wo.homeowner || wo.homeowner_phone) && <div className="wp-row"><Phone size={16} /><div><b>{wo.homeowner ?? 'Homeowner'}</b><span>{wo.homeowner_phone ?? ''}{wo.homeowner_phone ? ' · call to arrange access' : ''}</span></div></div>}
        </section>

        <section className="wp-sec">
          <h2><Wrench size={15} /> Work to be done</h2>
          {wo.items.length ? (
            <ol className="wp-items">{wo.items.map((i, k) => <li key={k}><b>{[i.number != null ? `Item ${i.number}` : '', i.room, i.location].filter(Boolean).join(' · ')}</b><p>{i.description}</p></li>)}</ol>
          ) : <p>{wo.description ?? wo.issue}</p>}
          {wo.notes && <p className="wp-m">{wo.notes}</p>}
        </section>

        <section className="wp-sec wp-visit">
          <h2><CalendarClock size={15} /> Visit</h2>
          {wo.proposed_at ? (
            <div className="wp-when"><b>{when(wo.proposed_at)}</b><span>{wo.proposed_window || clock(wo.proposed_at)}</span></div>
          ) : <p className="wp-m">The office will propose a time shortly.</p>}

          {accepted && <div className="wp-ok"><Check size={15} /> You accepted this time{wo.response_at ? ` on ${when(wo.response_at)}` : ''}. See you then.</div>}
          {asked && <div className="wp-ask">You asked for a different time: <b>{wo.requested_time}</b>. The office will confirm or suggest another.</div>}
          {wo.trade_attended === true && !done && <div className="wp-ok"><Check size={15} /> You confirmed you attended. Thank you.</div>}
          {wo.trade_attended === false && <div className="wp-ask">You told us you did not attend{wo.trade_attend_note ? `: ${wo.trade_attend_note}` : ''}. The office will be in touch to rebook.</div>}
          {done && <div className="wp-ok"><Check size={15} /> Marked complete{wo.completed_at ? ` on ${when(wo.completed_at)}` : ''}. Thank you.</div>}

          {!done && (
            <div className="wp-noprint">
              {wo.proposed_at && !accepted && mode === '' && (
                <div className="wp-actions">
                  <button className="wp-btn primary" disabled={busy} onClick={() => act('accept')}><Check size={15} /> Accept this time</button>
                  <button className="wp-btn" onClick={() => setMode('reschedule')}>Ask for a different time</button>
                </div>
              )}
              {(accepted || asked) && mode === '' && (
                <div className="wp-actions">
                  <button className="wp-btn" onClick={() => setMode('reschedule')}>Change my answer</button>
                  {accepted && <button className="wp-btn primary" onClick={() => setMode('complete')}>Work is finished</button>}
                </div>
              )}
              {!wo.proposed_at && mode === '' && <div className="wp-actions"><button className="wp-btn" onClick={() => setMode('reschedule')}>Suggest a time</button></div>}

              {askAttend && mode === '' && (
                <div className="wp-form" style={{ marginTop: 14 }}>
                  <label>Did you attend this visit?</label>
                  <div className="wp-actions">
                    <button className="wp-btn primary" disabled={busy} onClick={() => act('attended')}><Check size={15} /> Yes, I attended</button>
                    <button className="wp-btn" onClick={() => setMode('noshow')}>No, I could not attend</button>
                  </div>
                </div>
              )}
              {mode === 'noshow' && (
                <div className="wp-form">
                  <label>What happened? (optional)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="So the office can rebook" />
                  <div className="wp-actions"><button className="wp-btn primary" disabled={busy} onClick={() => act('no_show')}>Tell the office</button><button className="wp-btn ghost" onClick={() => setMode('')}>Cancel</button></div>
                </div>
              )}
              {mode === 'reschedule' && (
                <div className="wp-form">
                  <label>When would suit you?</label>
                  <input value={time} onChange={e => setTime(e.target.value)} placeholder="e.g. Thursday Nov 26 after 1 pm" />
                  <label>Note (optional)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Anything the office should know" />
                  <div className="wp-actions"><button className="wp-btn primary" disabled={busy || !time.trim()} onClick={() => act('reschedule')}>Send request</button><button className="wp-btn ghost" onClick={() => setMode('')}>Cancel</button></div>
                </div>
              )}
              {mode === 'complete' && (
                <div className="wp-form">
                  <label>What was done? (optional)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Short note for the office" />
                  <div className="wp-actions"><button className="wp-btn primary" disabled={busy} onClick={() => act('complete')}>Mark complete</button><button className="wp-btn ghost" onClick={() => setMode('')}>Cancel</button></div>
                </div>
              )}
              {err && <p className="wp-err">{err}</p>}
            </div>
          )}
        </section>

        {wo.company_phone && <p className="wp-m wp-foot">Questions? Call {wo.company} at {wo.company_phone}.</p>}
      </main>
    </div>
  );
}

const CSS = `
.wp{min-height:100vh;background:var(--color-canvas,#E8E3DA);background-image:var(--texture,none);padding:20px 14px 48px;color:#1F2A3C;font-family:inherit}
.wp-bar{max-width:760px;margin:0 auto 14px;display:flex;align-items:center;justify-content:space-between;gap:10px}
.wp-brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:15px;color:#1B2A41}.wp-brand img{height:30px;border-radius:4px}
.wp-card{max-width:760px;margin:0 auto;background:#F8F6F1;border:1px solid #D9D2C5;border-radius:8px;padding:26px;box-shadow:0 1px 2px rgba(27,42,65,.06)}
.wp-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid #D9D2C5}
.wp-k{font-size:12px;color:#6C7280;margin-bottom:4px}
.wp h1{font-size:21px;line-height:1.25;margin:0;color:#1B2A41}
.wp h2{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;color:#485163;margin:0 0 10px}
.wp-m{color:#6C7280;font-size:13px;margin:4px 0 0}
.wp-tag{background:#EFE3C8;color:#7A5B1E;border:1px solid #D9C28F;border-radius:4px;padding:3px 9px;font-size:12px;font-weight:700;text-transform:capitalize}
.wp-sec{padding:16px 0;border-bottom:1px solid #E4DED2}.wp-sec:last-of-type{border-bottom:none}
.wp-row{display:flex;gap:11px;align-items:flex-start;margin-bottom:10px;color:#485163}.wp-row b{display:block;color:#1F2A3C;font-size:15px}.wp-row span{font-size:13px;color:#6C7280}
.wp-items{margin:0;padding-left:20px}.wp-items li{margin-bottom:10px}.wp-items b{font-size:13px;color:#485163}.wp-items p{margin:3px 0 0;font-size:15px;line-height:1.5}
.wp-when{background:#fff;border:1px solid #D9D2C5;border-radius:6px;padding:14px 16px;display:flex;flex-direction:column;gap:2px;margin-bottom:12px}.wp-when b{font-size:17px;color:#1B2A41}.wp-when span{color:#485163}
.wp-ok{background:#E3EDE5;border:1px solid #B7CDBB;color:#2F5C3B;border-radius:6px;padding:11px 14px;display:flex;gap:8px;align-items:center;margin:10px 0;font-size:14px}
.wp-ask{background:#F3E8CF;border:1px solid #DCC58E;color:#6E5316;border-radius:6px;padding:11px 14px;margin:10px 0;font-size:14px}
.wp-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
.wp-btn{display:inline-flex;align-items:center;gap:7px;padding:11px 18px;border-radius:6px;border:1px solid #C9C0AE;background:#F8F6F1;color:#1F2A3C;font:inherit;font-weight:600;font-size:14px;cursor:pointer}
.wp-btn.primary{background:#3F6A8F;border-color:#3F6A8F;color:#fff}.wp-btn.primary:hover{background:#2F5576}.wp-btn.ghost{background:transparent}.wp-btn:disabled{opacity:.55;cursor:wait}
.wp-form{display:flex;flex-direction:column;gap:6px;margin-top:10px}.wp-form label{font-size:12px;font-weight:700;color:#485163;margin-top:6px}
.wp-form input,.wp-form textarea{font:inherit;font-size:15px;padding:10px 12px;border:1px solid #C9C0AE;border-radius:6px;background:#fff;color:#1F2A3C}
.wp-err{color:#A5402F;font-size:13px;margin-top:10px}.wp-foot{margin-top:18px}
@media print{.wp{background:#fff;padding:0}.wp-noprint{display:none!important}.wp-card{border:none;box-shadow:none;padding:0;max-width:none}}
`;
