// Owner visit check: the short page a homeowner opens from the end-of-day email. Two questions, no login.
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface V { company: string | null; logo: string | null; company_phone: string | null; issue: string; address: string | null; trade: string | null; scheduled_time: string | null; answered: boolean; attended: boolean | null; satisfied: boolean | null }

export default function VisitCheckPage() {
  const { token } = useParams();
  const [v, setV] = useState<V | null | undefined>(undefined);
  const [attended, setAttended] = useState<boolean | null>(null);
  const [satisfied, setSatisfied] = useState<boolean | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('wo_owner_get', { p_token: token });
    setV(error ? null : ((data ?? null) as V | null));
  }, [token]);
  useEffect(() => { load(); }, [load]);

  async function submit() {
    if (attended === null || (attended && satisfied === null)) { setErr('Please answer the questions above.'); return; }
    setBusy(true); setErr('');
    const { error } = await supabase.rpc('wo_owner_respond', { p_token: token, p_attended: attended, p_satisfied: attended ? satisfied : null, p_comment: comment || null });
    setBusy(false);
    if (error) setErr(error.message); else setSent(true);
  }

  const day = v?.scheduled_time ? new Date(v.scheduled_time).toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric' }) : '';

  return (
    <div className="vc">
      <style>{CSS}</style>
      {v === undefined && <p className="vc-m">Loading…</p>}
      {v === null && <div className="vc-card"><h1>This link is not available</h1><p className="vc-m">Please contact the office that sent it.</p></div>}
      {v && (
        <div className="vc-card">
          <div className="vc-brand">{v.logo ? <img src={v.logo} alt="" /> : null}<span>{v.company}</span></div>
          <h1>How did your repair visit go?</h1>
          <p className="vc-m">{v.issue}{v.address ? ` · ${v.address}` : ''}{day ? ` · ${day}` : ''}</p>

          {(sent || v.answered) ? (
            <div className="vc-ok"><Check size={16} /> Thank you. {attended === false || v.attended === false ? 'We are sorry nobody came. The office has been told and will contact you to rebook.' : 'Your answer has been sent to the office.'}</div>
          ) : (
            <>
              <div className="vc-q">
                <label>Did {v.trade ? v.trade : 'the trade'} come to your home?</label>
                <div className="vc-opts">
                  <button className={attended === true ? 'on' : ''} onClick={() => setAttended(true)}>Yes</button>
                  <button className={attended === false ? 'on bad' : ''} onClick={() => setAttended(false)}>No, nobody came</button>
                </div>
              </div>
              {attended === true && (
                <div className="vc-q">
                  <label>Are you satisfied with the work?</label>
                  <div className="vc-opts">
                    <button className={satisfied === true ? 'on' : ''} onClick={() => setSatisfied(true)}>Yes</button>
                    <button className={satisfied === false ? 'on bad' : ''} onClick={() => setSatisfied(false)}>Not yet</button>
                  </div>
                </div>
              )}
              <div className="vc-q">
                <label>Anything you want us to know? (optional)</label>
                <textarea rows={3} value={comment} onChange={e => setComment(e.target.value)} />
              </div>
              {err && <p className="vc-err">{err}</p>}
              <button className="vc-send" disabled={busy} onClick={submit}>Send</button>
            </>
          )}
          {v.company_phone && <p className="vc-m" style={{ marginTop: 18 }}>Questions? Call {v.company_phone}.</p>}
        </div>
      )}
    </div>
  );
}

const CSS = `
.vc{min-height:100vh;background:var(--color-canvas,#E8E3DA);background-image:var(--texture,none);padding:24px 14px 48px;color:#1F2A3C;font-family:inherit}
.vc-card{max-width:560px;margin:0 auto;background:#F8F6F1;border:1px solid #D9D2C5;border-radius:8px;padding:26px;box-shadow:0 1px 2px rgba(27,42,65,.06)}
.vc-brand{display:flex;align-items:center;gap:10px;font-weight:700;color:#1B2A41;margin-bottom:14px}.vc-brand img{height:28px;border-radius:4px}
.vc h1{font-size:21px;margin:0 0 6px;color:#1B2A41}.vc-m{color:#6C7280;font-size:14px;margin:0 0 16px}
.vc-q{margin-top:18px}.vc-q label{display:block;font-weight:700;font-size:14px;margin-bottom:8px;color:#485163}
.vc-opts{display:flex;gap:10px;flex-wrap:wrap}
.vc-opts button{flex:1;min-width:130px;padding:13px 14px;border-radius:6px;border:1px solid #C9C0AE;background:#fff;font:inherit;font-weight:600;font-size:15px;color:#1F2A3C;cursor:pointer}
.vc-opts button.on{background:#3F6A8F;border-color:#3F6A8F;color:#fff}.vc-opts button.on.bad{background:#A5402F;border-color:#A5402F}
.vc textarea{width:100%;font:inherit;font-size:15px;padding:10px 12px;border:1px solid #C9C0AE;border-radius:6px;background:#fff;color:#1F2A3C;box-sizing:border-box}
.vc-send{margin-top:18px;width:100%;padding:13px;border-radius:6px;border:none;background:#3F6A8F;color:#fff;font:inherit;font-weight:700;font-size:15px;cursor:pointer}.vc-send:disabled{opacity:.6}
.vc-ok{display:flex;gap:9px;align-items:flex-start;background:#E3EDE5;border:1px solid #B7CDBB;color:#2F5C3B;border-radius:6px;padding:13px 15px;font-size:15px}
.vc-err{color:#A5402F;font-size:13px;margin-top:10px}
`;
