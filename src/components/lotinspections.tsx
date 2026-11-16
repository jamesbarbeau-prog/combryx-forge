// QCI and PDI inspections for one home, with each item's status, photos and the signed PDF. Used on the desk lot page.
import { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, Copy, FileText } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

interface Insp { id: string; kind: 'qci' | 'pdi'; status: string; inspector_name: string | null; super_name: string | null; super_email: string | null; owner_names: string | null; started_at: string; completed_at: string | null; pdf_path: string | null; super_token: string; owner_token: string; purchaser_present: boolean }
interface Item { id: string; inspection_id: string; seq: number; list: string; source: string; result: string | null; room: string | null; description: string; note: string | null; res_status: string; override_status: string }
interface Ph { id: string; item_id: string | null; kind: string; storage_path: string }

const needsClose = (i: Item) => i.list === 'deficiency' || (i.list === 'si_check' && (i.result === 'wrong' || i.result === 'missing'));
const fmt = (s: string | null) => s ? new Date(s).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const statusOf = (i: Item) => i.res_status === 'fixed' ? ['Closed with photo', '#4A7A55'] : i.res_status === 'override' ? ['Closed by warranty override', '#4A7A55'] : i.res_status === 'verified' ? ['Verified', '#4A7A55'] : i.override_status === 'requested' ? ['Override requested', '#2F5576'] : i.override_status === 'denied' ? ['Override denied, still open', '#A5402F'] : ['Open with construction', '#9A6A16'];

export default function LotInspections({ lotId, kind }: { lotId: string; kind?: 'qci' | 'pdi' }) {
  const [rows, setRows] = useState<Insp[] | null>(null); const [items, setItems] = useState<Item[]>([]); const [photos, setPhotos] = useState<Ph[]>([]);
  const [urls, setUrls] = useState<Record<string, string>>({}); const [msg, setMsg] = useState('');

  const load = useCallback(async () => {
    const { data: ins } = await supabase.from('inspections').select('id,kind,status,inspector_name,super_name,super_email,owner_names,started_at,completed_at,pdf_path,super_token,owner_token,purchaser_present').eq('lot_id', lotId).neq('status', 'cancelled').order('started_at', { ascending: false });
    const list = ((ins ?? []) as Insp[]).filter(r => !kind || r.kind === kind); setRows(list);
    if (!list.length) { setItems([]); setPhotos([]); return; }
    const ids = list.map(i => i.id);
    const [it, ph] = await Promise.all([
      supabase.from('inspection_items').select('id,inspection_id,seq,list,source,result,room,description,note,res_status,override_status').in('inspection_id', ids).order('seq'),
      supabase.from('inspection_photos').select('id,item_id,kind,storage_path').in('inspection_id', ids).order('created_at'),
    ]);
    setItems((it.data ?? []) as Item[]); const p = (ph.data ?? []) as Ph[]; setPhotos(p);
    if (p.length) { const { data } = await supabase.storage.from('inspection-photos').createSignedUrls(p.map(x => x.storage_path), 3600); const m: Record<string, string> = {}; (data ?? []).forEach((s, i) => { if (s.signedUrl) m[p[i].id] = s.signedUrl; }); setUrls(m); }
  }, [lotId, kind]);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const [rebuilding, setRebuilding] = useState<string | null>(null);
  async function rebuild(id: string) {
    setRebuilding(id); setMsg('');
    const { data, error } = await supabase.functions.invoke('inspection-send', { body: { inspection_id: id, rebuild_only: true } });
    setMsg(error || (data as any)?.error ? 'Could not rebuild the PDF: ' + (((data as any)?.error) ?? error?.message) : 'The PDF was rebuilt with the latest form layout.'); setRebuilding(null); await load();
  }
  async function pdf(path: string) { const { data } = await supabase.storage.from('inspection-photos').createSignedUrl(path, 600); if (data?.signedUrl) window.open(data.signedUrl, '_blank'); }
  const copy = (tok: string) => navigator.clipboard?.writeText(`${window.location.origin}/portal/inspection/${tok}`).then(() => setMsg('Link copied.'));
  const nav = useNavigate();
  const startBtns = (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {(!kind || kind === 'qci') && <button onClick={() => nav(`/field?lot=${lotId}&start=qci`)} style={{ height: 40, borderRadius: 8, border: 'none', background: '#1B2A41', color: '#fff', fontWeight: 800, fontSize: 14, padding: '0 16px', cursor: 'pointer', fontFamily: 'inherit' }}>Start QCI</button>}
      {(!kind || kind === 'pdi') && <button onClick={() => nav(`/field?lot=${lotId}&start=pdi`)} style={{ height: 40, borderRadius: 8, border: 'none', background: 'linear-gradient(180deg,#B8975A,#8D7140)', color: '#fff', fontWeight: 800, fontSize: 14, padding: '0 16px', cursor: 'pointer', fontFamily: 'inherit' }}>Start PDI</button>}
    </div>
  );
  const btn: React.CSSProperties = { height: 34, borderRadius: 8, border: '1px solid var(--color-border-hard)', background: '#fff', fontWeight: 700, fontSize: 13, padding: '0 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)' };

  if (!rows) return <div style={{ color: 'var(--color-muted)', fontSize: 13 }}>Loading…</div>;
  if (!rows.length) return (
    <div style={{ padding: 40, textAlign: 'center', background: 'var(--color-panel)', borderRadius: 10, border: '1px solid var(--color-border)' }}>
      <ClipboardCheck size={28} color="#8D7140" strokeWidth={1} style={{ marginBottom: 10, opacity: 0.6 }} />
      <p style={{ color: 'var(--color-muted)', fontSize: 13, margin: '0 0 14px' }}>No QCI or PDI has been done on this home yet.</p>
      <div style={{ display: 'flex', justifyContent: 'center' }}>{startBtns}</div>
    </div>
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {startBtns}
      {msg && <div style={{ fontSize: 13, color: '#2F5576' }}>{msg}</div>}
      {rows.map(r => {
        const its = items.filter(i => i.inspection_id === r.id && needsClose(i)); const openN = its.filter(i => i.res_status === 'open').length;
        return (
          <div key={r.id} style={{ background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 800, fontSize: 12, color: '#fff', background: r.kind === 'pdi' ? '#8D7140' : '#1B2A41', borderRadius: 6, padding: '3px 9px' }}>{r.kind.toUpperCase()}</span>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{r.status === 'in_progress' ? 'In progress on site' : `${r.kind === 'pdi' ? 'Pre-delivery inspection' : 'Quality control inspection'} signed ${fmt(r.completed_at)}`}</div>
                <div style={{ fontSize: 12.5, color: 'var(--color-text-sub)' }}>{[r.inspector_name, r.super_name ? `Superintendent: ${r.super_name}` : '', r.kind === 'pdi' && r.owner_names ? `Owner: ${r.owner_names}` : ''].filter(Boolean).join(' · ')}</div>
              </div>
              <span style={{ fontWeight: 800, fontSize: 13, color: openN ? '#9A6A16' : '#4A7A55', background: openN ? '#F6ECD3' : '#E8F0E7', borderRadius: 8, padding: '4px 10px' }}>{its.length === 0 ? 'No items' : openN ? `${openN} open of ${its.length}` : 'All closed'}</span>
            </div>
            <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
              {r.pdf_path && <button style={btn} onClick={() => pdf(r.pdf_path!)}><FileText size={14} /> {r.kind === 'pdi' ? 'Official PDI form (signed PDF)' : 'QCI report (PDF)'}</button>}
              {r.status !== 'in_progress' && <a style={{ ...btn, textDecoration: 'none', color: 'inherit', background: '#EFEBE2' }} href={`/portal/inspection/${r.super_token}`} target="_blank" rel="noreferrer"><ClipboardCheck size={14} /> Update items (close with photo)</a>}
              {r.status !== 'in_progress' && <button style={btn} onClick={() => copy(r.super_token)}><Copy size={14} /> Superintendent link</button>}
              {r.kind === 'pdi' && r.status !== 'in_progress' && <button style={btn} onClick={() => copy(r.owner_token)}><Copy size={14} /> Owner link</button>}
              {r.status !== 'in_progress' && <button style={btn} disabled={rebuilding === r.id} onClick={() => rebuild(r.id)}>{rebuilding === r.id ? 'Rebuilding…' : 'Rebuild PDF'}</button>}
              {r.status === 'signed' && !r.pdf_path && <span style={{ fontSize: 12.5, color: '#9A6A16', alignSelf: 'center' }}>Signed. The PDF is still being created.</span>}
            </div>
            {its.map(i => {
              const [label, color] = statusOf(i); const mine = photos.filter(p => p.item_id === i.id);
              return (
                <div key={i.id} style={{ borderTop: '1px solid var(--color-border)', padding: '10px 0', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14 }}>{i.room ? <b>{i.room}: </b> : null}{i.description}</div>
                    {i.note && <div style={{ fontSize: 12.5, color: 'var(--color-text-sub)' }}>{i.note}</div>}
                    {mine.length > 0 && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{mine.map(p => urls[p.id] ? <a key={p.id} href={urls[p.id]} target="_blank" rel="noreferrer" title={p.kind === 'closing' ? 'Closing photo' : 'Photo from the inspection'}><img src={urls[p.id]} alt="" style={{ width: 56, height: 56, objectFit: 'cover', borderRadius: 6, border: p.kind === 'closing' ? '2px solid #4A7A55' : '1px solid #C6BDAC' }} /></a> : null)}</div>}
                  </div>
                  <span style={{ fontWeight: 700, fontSize: 12.5, color, whiteSpace: 'nowrap' }}>{label}</span>
                </div>
              );
            })}
            {!its.length && <div style={{ fontSize: 13, color: 'var(--color-text-sub)' }}>{r.status === 'in_progress' ? 'Nothing recorded yet.' : 'No items for construction.'}</div>}
          </div>
        );
      })}
      
    </div>
  );
}
