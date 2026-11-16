// Work order portal: the page a trade or in-house technician opens from a private link. No login.
// Branded with the company that sent it (logo + name), or a plain work order with the company name when it has no logo. Never the product's own name.
// Flow: where and what (address, scope with photos) -> confirm the visit time -> mark the work finished (owner sign-off).
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Printer, Check, CalendarClock, MapPin, Wrench, PenLine, Phone, X, ExternalLink } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { SignaturePad } from '@/components/signaturepad';

interface WO {
  ref: string; company: string | null; logo: string | null; company_phone: string | null; audience: string; for: string | null;
  issue: string;
  address: string | null; lot: string | null; community: string | null; homeowner: string | null;
  items: { id: string; number: number | string | null; room: string | null; location: string | null; description: string }[];
  signature: string | null; signed_name: string | null; signed_at: string | null;
  proposed_at: string | null; proposed_window: string | null; status: string | null;
  response: string | null; response_at: string | null; requested_time: string | null; response_note: string | null;
  completed_at: string | null; completion_note: string | null;
  scheduled_time: string | null; trade_attended: boolean | null; trade_attend_note: string | null;
}
type Photo = { item_id: string; url: string; name: string };

const when = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) : '';
const short = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' }) : '';
const clock = (iso: string | null) => iso ? new Date(iso).toLocaleTimeString('en-CA', { hour: 'numeric', minute: '2-digit' }) : '';
const PARTS = ['Morning (8 am to 12 pm)', 'Afternoon (12 pm to 4 pm)', 'Any time that day'];

export default function WorkOrderPortalPage() {
  const { token } = useParams();
  const [wo, setWo] = useState<WO | null | undefined>(undefined);
  const [mode, setMode] = useState<'' | 'reschedule' | 'complete' | 'noshow'>('');
  const [note, setNote] = useState('');
  const [day, setDay] = useState('');
  const [part, setPart] = useState(PARTS[0]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [zoom, setZoom] = useState<string | null>(null);
  const [sig, setSig] = useState<string | null>(null);
  const [sigName, setSigName] = useState('');
  const [noOwner, setNoOwner] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('wo_portal_get', { p_token: token });
    if (error) { setWo(null); return; }
    setWo((data ?? null) as WO | null);
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!token) return;
    supabase.functions.invoke('wo-portal-photos', { body: { token } }).then(({ data }) => setPhotos(((data as { photos?: Photo[] } | null)?.photos) ?? []));
  }, [token]);
  useEffect(() => { if (wo && !sigName) setSigName(wo.homeowner ?? ''); }, [wo]); // eslint-disable-line react-hooks/exhaustive-deps

  // The browser tab and the printed page header carry the company, never the product name.
  useEffect(() => {
    if (!wo) return;
    const prev = document.title;
    document.title = `Work order ${wo.ref}${wo.company ? ' · ' + wo.company : ''}`;
    return () => { document.title = prev; };
  }, [wo]);
  useEffect(() => { if (zoom) { const k = (e: KeyboardEvent) => e.key === 'Escape' && setZoom(null); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); } }, [zoom]);

  async function act(action: 'accept' | 'reschedule' | 'complete' | 'attended' | 'no_show') {
    setBusy(true); setErr('');
    const time = action === 'reschedule' && day ? `${new Date(day + 'T12:00').toLocaleDateString('en-CA', { weekday: 'short', month: 'short', day: 'numeric' })}, ${part}` : null;
    const { error } = await supabase.rpc('wo_portal_respond', { p_token: token, p_action: action, p_note: note || null, p_time: time, p_sig: action === 'complete' ? sig : null, p_sig_name: action === 'complete' && sig ? sigName.trim() || null : null });
    setBusy(false);
    if (error) { setErr(error.message); return; }
    setMode(''); setNote(''); setDay(''); setSig(null); setNoOwner(false); await load();
  }

  const photoCount = photos.length;
  const mapUrl = useMemo(() => wo?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(wo.address)}` : null, [wo?.address]);

  if (wo === undefined) return <div className="wp"><style>{CSS}</style><p className="wp-m" style={{ textAlign: 'center' }}>Loading…</p></div>;
  if (wo === null) return <div className="wp"><style>{CSS}</style><div className="wp-card"><h1>This link is not available</h1><p className="wp-m">It may have been mistyped or replaced. Please contact the office that sent it.</p></div></div>;

  const done = wo.response === 'completed';
  const accepted = wo.response === 'accepted';
  const asked = wo.response === 'reschedule_requested';
  const visitDay = wo.scheduled_time ? new Date(wo.scheduled_time) <= new Date() : false;
  const askAttend = accepted && visitDay && wo.trade_attended == null && !done;
  const company = wo.company ?? 'Work order';

  // Where the trade is in the three-step flow
  const step = done ? 3 : accepted ? 2 : 1;
  const next = done ? 'All done. Thank you.'
    : asked ? 'Waiting for the office to answer your request for a different time.'
    : accepted ? 'Time confirmed. When the work is finished, press "Work is finished" below.'
    : wo.proposed_at ? 'Please confirm the visit time below.'
    : 'The office will propose a visit time shortly.';

  return (
    <div className="wp">
      <style>{CSS}</style>

      <main className="wp-card">
        <header className="wp-brandbar">
          <div className="wp-brand">
            {wo.logo ? <img src={wo.logo} alt={company} /> : <span className="wp-mark">{company.trim().charAt(0).toUpperCase()}</span>}
            <div><b>{company}</b><span>Work order {wo.ref}</span></div>
          </div>
          <button className="wp-btn ghost wp-noprint" onClick={() => window.print()}><Printer size={15} /> Print</button>
        </header>

        <section className="wp-hero">
          <div className="wp-k">{wo.for ? `For ${wo.for}${wo.audience === 'tech' ? ' (in-house technician)' : ''}` : 'Warranty repair'}</div>
          <h1>{wo.address ?? 'Address not on file'}</h1>
          <div className="wp-m">{[wo.community, wo.lot ? `Lot ${wo.lot}` : '', `${wo.items.length || 1} item${(wo.items.length || 1) === 1 ? '' : 's'} to repair`].filter(Boolean).join(' · ')}</div>
          {mapUrl && <a className="wp-maplink wp-noprint" href={mapUrl} target="_blank" rel="noreferrer"><MapPin size={14} /> Open in maps <ExternalLink size={12} /></a>}
        </section>

        <ol className="wp-steps wp-noprint" aria-label="Progress">
          {['Review the work', 'Confirm the visit time', 'Mark it finished'].map((t, i) => {
            const n = i + 1; const state = n < step ? 'done' : n === step ? 'now' : 'todo';
            return <li key={t} className={state}><span>{state === 'done' ? <Check size={13} /> : n}</span>{t}</li>;
          })}
        </ol>
        <div className={`wp-next wp-noprint${done || accepted ? ' ok' : ''}`}>{next}</div>

        <section className="wp-sec">
          <h2><Wrench size={15} /> Work to be done{photoCount ? ` (${photoCount} photo${photoCount === 1 ? '' : 's'} attached)` : ''}</h2>
          {wo.items.length ? (
            <ol className="wp-items">{wo.items.map((i, k) => {
              const ph = photos.filter(x => x.item_id === i.id);
              const head = [i.number != null ? `Item ${i.number}` : '', i.room, i.location].filter(Boolean).join(' · ');
              return (
                <li key={k}>
                  {head && <b>{head}</b>}
                  <p>{i.description}</p>
                  {ph.length > 0 && <div className="wp-photos">{ph.map((x, n) => <button key={n} type="button" onClick={() => setZoom(x.url)} aria-label={`Enlarge photo ${n + 1} for item ${i.number ?? ''}`}><img src={x.url} alt={`Photo ${n + 1} for item ${i.number ?? ''}`} loading="lazy" /></button>)}</div>}
                </li>
              );
            })}</ol>
          ) : <p>{wo.issue}</p>}
        </section>

        <section className="wp-sec wp-visit">
          <h2><CalendarClock size={15} /> Visit time</h2>
          {wo.proposed_at ? (
            <div className="wp-when"><b>{when(wo.proposed_at)}</b><span>{wo.proposed_window || clock(wo.proposed_at)}</span></div>
          ) : <p className="wp-m">The office will propose a time shortly.</p>}

          {accepted && <div className="wp-ok"><Check size={15} /> You accepted this time{wo.response_at ? ` on ${short(wo.response_at)}` : ''}. See you then.</div>}
          {asked && <div className="wp-ask">You asked for: <b>{wo.requested_time}</b>. The office will confirm or suggest another.</div>}
          {wo.trade_attended === true && !done && <div className="wp-ok"><Check size={15} /> You confirmed you attended. Thank you.</div>}
          {wo.trade_attended === false && <div className="wp-ask">You told us you did not attend{wo.trade_attend_note ? `: ${wo.trade_attend_note}` : ''}. The office will be in touch to rebook.</div>}
          {done && <div className="wp-ok"><Check size={15} /> Marked finished{wo.completed_at ? ` on ${short(wo.completed_at)}` : ''}. Thank you.</div>}

          {!done && (
            <div className="wp-noprint">
              {wo.proposed_at && !accepted && mode === '' && (
                <div className="wp-actions">
                  <button className="wp-btn primary big" disabled={busy} onClick={() => act('accept')}><Check size={16} /> Yes, I can do this time</button>
                  <button className="wp-btn big" onClick={() => setMode('reschedule')}>I need a different time</button>
                </div>
              )}
              {(accepted || asked) && mode === '' && (
                <div className="wp-actions">
                  {accepted && <button className="wp-btn primary big" onClick={() => setMode('complete')}>Work is finished</button>}
                  <button className="wp-btn" onClick={() => setMode('reschedule')}>Change the time</button>
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
                  <label htmlFor="wp-day">Which day suits you?</label>
                  <input id="wp-day" type="date" value={day} min={new Date().toLocaleDateString('en-CA')} onChange={e => setDay(e.target.value)} />
                  <label htmlFor="wp-part">What time of day?</label>
                  <select id="wp-part" value={part} onChange={e => setPart(e.target.value)}>{PARTS.map(p => <option key={p}>{p}</option>)}</select>
                  <label htmlFor="wp-note">Note for the office (optional)</label>
                  <textarea id="wp-note" value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="Anything the office should know" />
                  <div className="wp-actions"><button className="wp-btn primary" disabled={busy || !day} onClick={() => act('reschedule')}>Send request</button><button className="wp-btn ghost" onClick={() => setMode('')}>Cancel</button></div>
                </div>
              )}
              {mode === 'complete' && (
                <div className="wp-form">
                  <label htmlFor="wp-done">What was done? (optional)</label>
                  <textarea id="wp-done" value={note} onChange={e => setNote(e.target.value)} rows={3} placeholder="Short note for the office" />
                  <label htmlFor="wp-owner">Owner sign-off: the owner signs below to confirm the work is complete</label>
                  <input id="wp-owner" value={sigName} onChange={e => setSigName(e.target.value)} placeholder="Owner's name" />
                  <SignaturePad onChange={setSig} />
                  <label className="wp-check"><input type="checkbox" checked={noOwner} onChange={e => setNoOwner(e.target.checked)} /> The owner was not home or did not sign</label>
                  <div className="wp-actions"><button className="wp-btn primary" disabled={busy || (!sig && !noOwner)} onClick={() => act('complete')}>Mark finished</button><button className="wp-btn ghost" onClick={() => setMode('')}>Cancel</button></div>
                </div>
              )}
              {err && <p className="wp-err">{err}</p>}
            </div>
          )}
        </section>

        <section className={`wp-sec wp-sign${wo.signature ? '' : ' wp-printonly'}`}>
          <h2><PenLine size={15} /> Owner sign-off</h2>
          {wo.signature ? (
            <div className="wp-signed"><img src={wo.signature} alt="Owner signature" /><span>{wo.signed_name ?? 'Owner'}{wo.signed_at ? ` · ${when(wo.signed_at)}` : ''}</span></div>
          ) : (
            <div className="wp-blank">
              <div><i /><span>Owner name</span></div><div><i /><span>Signature</span></div><div><i /><span>Date</span></div>
            </div>
          )}
          <p className="wp-m">I confirm the work listed above has been completed.</p>
        </section>

        {wo.company_phone && <p className="wp-foot"><Phone size={13} /> Questions? Call {company} at <a href={`tel:${wo.company_phone.replace(/[^\d+]/g, '')}`}>{wo.company_phone}</a></p>}
      </main>

      {zoom && (
        <div className="wp-zoom wp-noprint" role="dialog" aria-label="Photo" onClick={() => setZoom(null)}>
          <button type="button" aria-label="Close photo" onClick={() => setZoom(null)}><X size={20} /></button>
          <img src={zoom} alt="Enlarged photo" onClick={e => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}

const CSS = `
.wp{min-height:100vh;background:var(--color-canvas,#E8E3DA);background-image:var(--texture,none);padding:20px 14px 48px;color:#1F2A3C;font-family:inherit}
.wp-card{max-width:760px;margin:0 auto;background:#F8F6F1;border:1px solid #D9D2C5;border-radius:8px;padding:0 26px 26px;box-shadow:0 1px 2px rgba(27,42,65,.06)}
.wp-brandbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:18px 0 14px;border-bottom:2px solid #8D7140}
.wp-brand{display:flex;align-items:center;gap:12px;min-width:0}.wp-brand img{height:44px;width:auto;max-width:160px;object-fit:contain}
.wp-brand div{display:flex;flex-direction:column;min-width:0}.wp-brand b{font-size:16px;color:#1B2A41}.wp-brand span{font-size:12px;color:#6C7280}
.wp-mark{width:44px;height:44px;border-radius:8px;background:#1B2A41;color:#F8F6F1;display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;flex:none}
.wp-hero{padding:20px 0 6px}.wp-k{font-size:12.5px;color:#6C7280;margin-bottom:4px}
.wp h1{font-size:23px;line-height:1.25;margin:0;color:#1B2A41}
.wp h2{display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:700;color:#485163;margin:0 0 10px}
.wp-m{color:#6C7280;font-size:13.5px;margin:4px 0 0}
.wp-maplink{display:inline-flex;align-items:center;gap:6px;margin-top:10px;font-size:13.5px;font-weight:600;color:#3F6A8F;text-decoration:none}.wp-maplink:hover{text-decoration:underline}
.wp-steps{list-style:none;margin:18px 0 10px;padding:0;display:flex;gap:8px;flex-wrap:wrap}
.wp-steps li{display:flex;align-items:center;gap:8px;font-size:13px;color:#8A8F9B;padding:7px 12px;border:1px solid #E0DACD;border-radius:999px;background:#FBFAF6}
.wp-steps li span{width:20px;height:20px;border-radius:50%;background:#E4DED2;color:#6C7280;display:flex;align-items:center;justify-content:center;font-size:11.5px;font-weight:700}
.wp-steps li.now{color:#1B2A41;font-weight:700;border-color:#3F6A8F;background:#fff}.wp-steps li.now span{background:#3F6A8F;color:#fff}
.wp-steps li.done{color:#2F5C3B}.wp-steps li.done span{background:#B7CDBB;color:#2F5C3B}
.wp-next{background:#fff;border:1px solid #D9D2C5;border-left:4px solid #3F6A8F;border-radius:6px;padding:12px 14px;font-size:15px;font-weight:600;color:#1B2A41;margin-bottom:6px}.wp-next.ok{border-left-color:#4A7A55}
.wp-sec{padding:18px 0;border-bottom:1px solid #E4DED2}.wp-sec:last-of-type{border-bottom:none}
.wp-items{margin:0;padding-left:22px}.wp-items li{margin-bottom:14px}.wp-items b{font-size:13px;color:#485163}.wp-items p{margin:3px 0 0;font-size:15.5px;line-height:1.5}
.wp-photos{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px}
.wp-photos button{padding:0;border:none;background:none;cursor:zoom-in}
.wp-photos img{height:130px;width:auto;max-width:210px;object-fit:cover;border-radius:5px;border:1px solid #D9D2C5;display:block}
.wp-items li{break-inside:avoid}
.wp-when{background:#fff;border:1px solid #D9D2C5;border-radius:6px;padding:14px 16px;display:flex;flex-direction:column;gap:2px;margin-bottom:12px}.wp-when b{font-size:18px;color:#1B2A41}.wp-when span{color:#485163}
.wp-ok{background:#E3EDE5;border:1px solid #B7CDBB;color:#2F5C3B;border-radius:6px;padding:11px 14px;display:flex;gap:8px;align-items:center;margin:10px 0;font-size:14px}
.wp-ask{background:#F3E8CF;border:1px solid #DCC58E;color:#6E5316;border-radius:6px;padding:11px 14px;margin:10px 0;font-size:14px}
.wp-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:6px}
.wp-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:11px 18px;border-radius:6px;border:1px solid #C9C0AE;background:#F8F6F1;color:#1F2A3C;font:inherit;font-weight:600;font-size:14px;cursor:pointer}
.wp-btn.big{padding:14px 22px;font-size:15px}
.wp-btn.primary{background:#3F6A8F;border-color:#3F6A8F;color:#fff}.wp-btn.primary:hover{background:#2F5576}.wp-btn.ghost{background:transparent}.wp-btn:disabled{opacity:.55;cursor:wait}
.wp-btn:focus-visible,.wp-photos button:focus-visible,.wp-maplink:focus-visible{outline:3px solid #8D7140;outline-offset:2px}
.wp-form{display:flex;flex-direction:column;gap:6px;margin-top:10px}.wp-form label{font-size:12.5px;font-weight:700;color:#485163;margin-top:6px}
.wp-form input,.wp-form textarea,.wp-form select{font:inherit;font-size:15px;padding:10px 12px;border:1px solid #C9C0AE;border-radius:6px;background:#fff;color:#1F2A3C}
.wp-err{color:#A5402F;font-size:13px;margin-top:10px}
.wp-foot{margin:18px 0 0;font-size:13.5px;color:#485163;display:flex;align-items:center;gap:7px}.wp-foot a{color:#3F6A8F;font-weight:600}
.wp-check{display:flex;align-items:center;gap:8px;font-weight:600;color:#485163;margin-top:10px}.wp-check input{width:auto}
.wp-sign{break-inside:avoid}
.wp-blank{display:grid;grid-template-columns:1.4fr 2fr .9fr;gap:18px;margin:26px 0 10px}.wp-blank div{display:flex;flex-direction:column;gap:5px}.wp-blank i{display:block;height:34px;border-bottom:1.5px solid #1F2A3C}.wp-blank span{font-size:11.5px;color:#6C7280}
.wp-signed{display:flex;flex-direction:column;gap:4px;margin:8px 0}.wp-signed img{height:70px;width:auto;max-width:280px;object-fit:contain;align-self:flex-start;border-bottom:1.5px solid #1F2A3C}.wp-signed span{font-size:12.5px;color:#485163}
.wp-zoom{position:fixed;inset:0;background:rgba(15,22,36,.86);display:flex;align-items:center;justify-content:center;z-index:50;padding:20px}
.wp-zoom img{max-width:100%;max-height:100%;object-fit:contain;border-radius:6px}
.wp-zoom button{position:absolute;top:14px;right:14px;width:40px;height:40px;border-radius:50%;border:none;background:#F8F6F1;color:#1B2A41;display:flex;align-items:center;justify-content:center;cursor:pointer}
@media (max-width:560px){.wp-card{padding:0 16px 20px}.wp h1{font-size:20px}.wp-btn.big{flex:1 1 100%}.wp-blank{grid-template-columns:1fr}}
@media screen{.wp-printonly{display:none}}
@media print{.wp-photos img{height:110px}.wp{background:#fff;padding:0}.wp-noprint{display:none!important}.wp-card{border:none;box-shadow:none;padding:0;max-width:none}.wp-brandbar{padding-top:0}.wp-hero{padding-top:14px}}
`;
