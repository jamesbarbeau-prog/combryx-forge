// Superintendent / owner page for a signed QCI or PDI. Opened from a private link, no login.
// Superintendent: close each item with a photo of the finished work, or ask the WARRANTY manager to override when no photo is possible.
// Owner (PDI): read-only status of the items on their form.
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Camera, Check, ShieldQuestion, Clock, XCircle, Loader2, FileText } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { compressImage } from '@/lib/inspections';
import { BrandShield } from '@/components/identity';

interface PItem {
  id: string; seq: number; list: string; source: string; room: string | null; description: string; note: string | null; result: string | null;
  res_status: 'open' | 'fixed' | 'override' | 'verified'; res_note: string | null; res_at: string | null;
  override_status: 'none' | 'requested' | 'approved' | 'denied'; override_reason: string | null; override_decision_note: string | null;
  photos: number; closing_photos: number;
}
interface Portal { role: 'super' | 'owner'; kind: 'qci' | 'pdi'; company: string | null; logo: string | null; address: string | null; enrolment_no: string | null; inspector: string | null; completed_at: string | null; owner_names: string | null; items: PItem[] }
interface Ph { item_id: string; kind: 'finding' | 'closing'; url: string }

const card: React.CSSProperties = { background: '#F8F6F1', border: '1px solid #D9D2C5', borderRadius: 14, padding: 14 };
const inp: React.CSSProperties = { width: '100%', minHeight: 48, borderRadius: 10, border: '1px solid #B9AF9B', background: '#fff', padding: '10px 12px', font: '500 16px var(--font-body)', color: '#1F2A3C', boxSizing: 'border-box' };
const btn = (bg: string, fg = '#fff', border = 'none'): React.CSSProperties => ({ minHeight: 48, borderRadius: 10, border, background: bg, color: fg, fontWeight: 800, fontSize: 15, padding: '0 16px', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%' });
const SRC: Record<string, string> = { observed: 'Observed', site_instruction: 'Site instruction', selection: 'Selection', upgrade: 'Upgrade' };
const closed = (s: PItem['res_status']) => s !== 'open';

export default function InspectionPortalPage() {
  const { token } = useParams();
  const [d, setD] = useState<Portal | null | undefined>(undefined);
  const [photos, setPhotos] = useState<Ph[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [name, setName] = useState(() => { try { return localStorage.getItem('bg-portal-name') ?? ''; } catch { return ''; } });
  const [busy, setBusy] = useState<string | null>(null); const [err, setErr] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState<string | null>(null); const [reason, setReason] = useState('');
  const [showClosed, setShowClosed] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('insp_portal_get', { p_token: token });
    setD(error ? null : ((data ?? null) as Portal | null));
    supabase.functions.invoke('inspection-portal', { body: { action: 'photos', token } }).then(({ data: r }) => setPhotos(((r as { photos?: Ph[] } | null)?.photos) ?? []));
    supabase.functions.invoke('inspection-portal', { body: { action: 'pdf', token } }).then(({ data: r }) => setPdfUrl(((r as { url?: string | null } | null)?.url) ?? null));
  }, [token]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { try { localStorage.setItem('bg-portal-name', name); } catch { /* ignore */ } }, [name]);

  const fail = (id: string, m: string) => setErr(e => ({ ...e, [id]: m }));
  async function addPhoto(it: PItem, file: File | undefined) {
    if (!file) return; setBusy(it.id); fail(it.id, '');
    try {
      const blob = await compressImage(file);
      const fd = new FormData(); fd.append('token', token!); fd.append('item_id', it.id); fd.append('name', name); fd.append('file', new File([blob], 'closing.jpg', { type: 'image/jpeg' }));
      const { data, error } = await supabase.functions.invoke('inspection-portal', { body: fd });
      if (error || (data as any)?.error) throw new Error((data as any)?.error ?? 'Upload failed');
      await load();
    } catch (e: any) { fail(it.id, e.message ?? 'The photo did not upload. Check your signal and try again.'); } finally { setBusy(null); }
  }
  async function close(it: PItem) {
    setBusy(it.id); fail(it.id, '');
    const { error } = await supabase.rpc('insp_portal_resolve', { p_token: token, p_item: it.id, p_status: 'fixed', p_note: null, p_name: name || null });
    if (error) fail(it.id, error.message); else await load(); setBusy(null);
  }
  async function reopen(it: PItem) { setBusy(it.id); await supabase.rpc('insp_portal_resolve', { p_token: token, p_item: it.id, p_status: 'open', p_note: null, p_name: name || null }); await load(); setBusy(null); }
  async function sendAsk(it: PItem) {
    setBusy(it.id); fail(it.id, '');
    const { error } = await supabase.rpc('insp_portal_request_override', { p_token: token, p_item: it.id, p_reason: reason, p_name: name || null });
    if (error) fail(it.id, error.message); else { setAsk(null); setReason(''); await load(); } setBusy(null);
  }

  if (d === undefined) return <Shell><div style={{ ...card, display: 'flex', gap: 8, alignItems: 'center' }}><Loader2 size={16} /> Loading…</div></Shell>;
  if (!d) return <Shell><div style={card}><b>This link is not valid.</b><div style={{ marginTop: 6, fontSize: 14, color: '#485163' }}>It may have been replaced. Ask the warranty office for a new one.</div></div></Shell>;

  const isSuper = d.role === 'super';
  const rows = d.items.filter(i => i.list !== 'not_assessed' || !isSuper);
  const open = rows.filter(i => !closed(i.res_status)), done = rows.filter(i => closed(i.res_status));
  const ph = (id: string, k: Ph['kind']) => photos.filter(p => p.item_id === id && p.kind === k);

  return (
    <Shell company={d.company} logo={d.logo}>
      <div style={{ ...card, borderLeft: '4px solid #B08D4F' }}>
        <div style={{ fontWeight: 800, fontSize: 18 }}>{(d.address ?? '').replace(/,\s*Ottawa.*$/i, '')}</div>
        <div style={{ fontSize: 13.5, color: '#485163' }}>{d.kind === 'pdi' ? 'Pre-delivery inspection' : 'Quality control inspection'} · {d.inspector}{d.owner_names && !isSuper ? '' : ''}</div>
        <div style={{ marginTop: 8, fontSize: 15, fontWeight: 700, color: open.length ? '#9A6A16' : '#4A7A55' }}>
          {open.length ? `${open.length} item${open.length === 1 ? '' : 's'} still open` : 'Every item is closed'} <span style={{ color: '#485163', fontWeight: 500 }}>({done.length} of {rows.length} closed)</span>
        </div>
        {pdfUrl && <a href={pdfUrl} target="_blank" rel="noreferrer" style={{ ...btn('#1B2A41'), textDecoration: 'none', marginTop: 12 }}><FileText size={18} /> {d.kind === 'pdi' ? 'Open the signed PDI form (PDF)' : 'Open the QCI report (PDF)'}</a>}
      </div>

      {isSuper && (
        <div style={card}>
          <label style={{ fontWeight: 700, fontSize: 13 }}>Your name</label>
          <input style={{ ...inp, minHeight: 48, padding: '0 12px', marginTop: 4 }} value={name} onChange={e => setName(e.target.value)} placeholder="Superintendent name" />
          <div style={{ fontSize: 12.5, color: '#485163', marginTop: 8, lineHeight: 1.45 }}>An item closes when you add a photo of the finished work. If a photo is not possible, ask the warranty manager to close it. They will approve it or tell you what is still outstanding.</div>
        </div>
      )}

      {open.map(it => (
        <div key={it.id} style={{ ...card, borderLeft: `4px solid ${it.override_status === 'denied' ? '#A5402F' : '#C6BDAC'}` }}>
          <div style={{ fontSize: 11.5, fontWeight: 800, color: '#8D7140' }}>{SRC[it.source]}{it.room ? ` · ${it.room}` : ''}</div>
          <div style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.35, marginTop: 2 }}>{it.description}</div>
          {it.note && <div style={{ fontSize: 13.5, color: '#485163', marginTop: 4 }}>{it.note}</div>}
          <Thumbs list={ph(it.id, 'finding')} />

          {!isSuper && <Chip tone="warn" icon={<Clock size={14} />}>With construction</Chip>}

          {isSuper && it.override_status === 'requested' && (
            <div style={{ marginTop: 10 }}><Chip tone="info" icon={<Clock size={14} />}>Waiting for the warranty manager</Chip><div style={{ fontSize: 13, color: '#485163', marginTop: 4 }}>Your reason: {it.override_reason}</div></div>
          )}
          {isSuper && it.override_status === 'denied' && (
            <div style={{ marginTop: 10, padding: 10, background: '#F4E1DB', borderRadius: 9, fontSize: 14 }}>
              <b style={{ color: '#A5402F', display: 'flex', alignItems: 'center', gap: 6 }}><XCircle size={15} /> The warranty manager did not approve this</b>
              {it.override_decision_note && <div style={{ marginTop: 4 }}>{it.override_decision_note}</div>}
              <div style={{ marginTop: 4, color: '#485163' }}>Finish the work and add a photo to close it.</div>
            </div>
          )}

          {isSuper && it.override_status !== 'requested' && (
            <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
              <Thumbs list={ph(it.id, 'closing')} label="Closing photos" />
              <label style={btn('#F8F6F1', '#1B2A41', '1px solid #B9AF9B')}>
                {busy === it.id ? <Loader2 size={18} /> : <Camera size={18} />} {ph(it.id, 'closing').length ? 'Add another photo' : 'Take a closing photo'}
                <input type="file" accept="image/*" capture="environment" hidden onChange={e => { addPhoto(it, e.target.files?.[0]); e.target.value = ''; }} />
              </label>
              <button style={{ ...btn('#4A7A55'), opacity: it.closing_photos ? 1 : 0.45 }} disabled={!it.closing_photos || busy === it.id} onClick={() => close(it)}><Check size={18} /> Mark closed</button>
              {!it.closing_photos && (ask === it.id ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <textarea style={{ ...inp, minHeight: 84 }} value={reason} onChange={e => setReason(e.target.value)} placeholder="Why can this not have a photo? (for the warranty manager)" />
                  <div style={{ display: 'flex', gap: 8 }}><button style={btn('#1B2A41')} disabled={busy === it.id} onClick={() => sendAsk(it)}>Send to warranty</button><button style={btn('#F8F6F1', '#1B2A41', '1px solid #B9AF9B')} onClick={() => setAsk(null)}>Cancel</button></div>
                </div>
              ) : <button style={{ ...btn('transparent', '#2F5576'), minHeight: 44 }} onClick={() => { setAsk(it.id); setReason(''); }}><ShieldQuestion size={17} /> No photo possible? Ask the warranty manager</button>)}
            </div>
          )}
          {err[it.id] && <div style={{ color: '#A5402F', fontSize: 13.5, marginTop: 8 }}>{err[it.id]}</div>}
        </div>
      ))}

      {done.length > 0 && (
        <>
          <button style={{ ...btn('transparent', '#2F5576'), width: 'auto', justifySelf: 'start' }} onClick={() => setShowClosed(v => !v)}>{showClosed ? 'Hide' : 'Show'} {done.length} closed item{done.length === 1 ? '' : 's'}</button>
          {showClosed && done.map(it => (
            <div key={it.id} style={{ ...card, borderLeft: '4px solid #4A7A55' }}>
              <div style={{ fontSize: 14.5, lineHeight: 1.35 }}>{it.room ? <b>{it.room}: </b> : null}{it.description}</div>
              <div style={{ margin: '6px 0' }}><Chip tone="ok" icon={<Check size={14} />}>{it.res_status === 'override' ? 'Closed by warranty manager approval' : it.res_status === 'verified' ? 'Verified by warranty' : 'Closed with photo'}</Chip></div>
              <Thumbs list={ph(it.id, 'closing')} />
              {isSuper && it.res_status === 'fixed' && <button style={{ ...btn('transparent', '#6C7280'), minHeight: 40, width: 'auto' }} onClick={() => reopen(it)}>Reopen</button>}
            </div>
          ))}
        </>
      )}
    </Shell>
  );
}

function Thumbs({ list, label }: { list: Ph[]; label?: string }) {
  if (!list.length) return null;
  return (
    <div style={{ marginTop: 8 }}>
      {label && <div style={{ fontSize: 12, fontWeight: 700, color: '#485163', marginBottom: 4 }}>{label}</div>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>{list.map(p => <a key={p.url} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt="" style={{ width: 76, height: 76, objectFit: 'cover', borderRadius: 8, border: '1px solid #C6BDAC' }} /></a>)}</div>
    </div>
  );
}
function Chip({ tone, icon, children }: { tone: 'ok' | 'warn' | 'info'; icon: React.ReactNode; children: React.ReactNode }) {
  const c = tone === 'ok' ? ['#E8F0E7', '#4A7A55'] : tone === 'warn' ? ['#F6ECD3', '#9A6A16'] : ['#E2EAF1', '#2F5576'];
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: c[0], color: c[1], fontWeight: 700, fontSize: 13, padding: '4px 10px', borderRadius: 8, marginTop: 8 }}>{icon}{children}</span>;
}
function Shell({ children, company, logo }: { children: React.ReactNode; company?: string | null; logo?: string | null }) {
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--color-canvas)', fontFamily: 'var(--font-body)', color: 'var(--color-text)' }}>
      <header style={{ background: 'linear-gradient(180deg,#1B2A41,#16233A)', borderBottom: '2px solid #B08D4F', color: '#fff', display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px' }}>
        {logo ? <img src={logo} alt="" style={{ height: 30 }} /> : <BrandShield size={32} />}
        <span style={{ fontWeight: 800, fontSize: 16 }}>{company ?? 'Inspection'}</span>
      </header>
      <main style={{ maxWidth: 640, margin: '0 auto', padding: 14, display: 'grid', gap: 12, paddingBottom: 60 }}>{children}</main>
    </div>
  );
}
