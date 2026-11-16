// Inspections (desk): every QCI and PDI, which items construction still has open, and the override requests the warranty manager decides.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Check, ChevronDown, ChevronRight, Copy, FileText, ShieldQuestion, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface Insp { id: string; kind: 'qci' | 'pdi'; status: string; address: string | null; inspector_name: string | null; super_name: string | null; completed_at: string | null; started_at: string; pdf_path: string | null; super_token: string; owner_token: string; possession_date: string | null }
interface Item { id: string; inspection_id: string; list: string; result: string | null; room: string | null; description: string; res_status: string; override_status: string; override_reason: string | null; override_requested_by: string | null; override_requested_at: string | null; override_decision_note: string | null; source: string }

const card: React.CSSProperties = { background: 'var(--color-panel)', border: '1px solid var(--color-border)', borderRadius: 12, padding: 16 };
const needsClose = (i: Item) => i.list === 'deficiency' || (i.list === 'si_check' && (i.result === 'wrong' || i.result === 'missing'));
const fmt = (s: string | null) => s ? new Date(s).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
const street = (a: string | null) => (a ?? '').replace(/,\s*Ottawa.*$/i, '');

export default function InspectionsPage() {
  const [rows, setRows] = useState<Insp[]>([]); const [items, setItems] = useState<Item[]>([]);
  const [open, setOpen] = useState<string | null>(null); const [msg, setMsg] = useState(''); const [loading, setLoading] = useState(true);
  const [note, setNote] = useState<Record<string, string>>({}); const [busy, setBusy] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');

  const load = useCallback(async () => {
    const { data: ins } = await supabase.from('inspections').select('id,kind,status,address,inspector_name,super_name,completed_at,started_at,pdf_path,super_token,owner_token,possession_date').neq('status', 'cancelled').order('started_at', { ascending: false }).limit(150);
    const list = (ins ?? []) as Insp[]; setRows(list);
    if (list.length) {
      const { data: it } = await supabase.from('inspection_items').select('id,inspection_id,list,result,room,description,res_status,override_status,override_reason,override_requested_by,override_requested_at,override_decision_note,source').in('inspection_id', list.map(i => i.id)).order('seq');
      setItems((it ?? []) as Item[]);
    } else setItems([]);
    setLoading(false);
  }, []);
  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const byInsp = useMemo(() => { const m = new Map<string, Item[]>(); items.forEach(i => m.set(i.inspection_id, [...(m.get(i.inspection_id) ?? []), i])); return m; }, [items]);
  const addrOf = useMemo(() => new Map(rows.map(r => [r.id, r])), [rows]);
  const queue = items.filter(i => i.override_status === 'requested');

  async function decide(it: Item, approve: boolean) {
    setBusy(it.id); setMsg('');
    const { error } = await supabase.rpc('insp_override_decide', { p_item: it.id, p_approve: approve, p_note: note[it.id] ?? null });
    if (error) setMsg(error.message); else await load();
    setBusy(null);
  }
  async function pdf(path: string) { const { data } = await supabase.storage.from('inspection-photos').createSignedUrl(path, 600); if (data?.signedUrl) window.open(data.signedUrl, '_blank'); }
  const copy = (tok: string) => navigator.clipboard?.writeText(`${window.location.origin}/portal/inspection/${tok}`).then(() => setMsg('Link copied.'));

  const shown = rows.filter(r => filter === 'all' || (byInsp.get(r.id) ?? []).some(i => needsClose(i) && i.res_status === 'open') || r.status === 'in_progress');

  return (
    <div style={{ padding: '24px 28px', maxWidth: 1100 }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--color-navy)', margin: 0 }}>Inspections</h1>
      <p style={{ color: 'var(--color-text-sub)', fontSize: 14, margin: '4px 0 18px' }}>QCI and PDI items stay open with construction until each has a closing photo or you approve an override.</p>
      {msg && <div style={{ ...card, marginBottom: 12, color: '#2F5576', fontSize: 14 }}>{msg}</div>}

      <div style={{ ...card, marginBottom: 18, borderLeft: `4px solid ${queue.length ? '#B08D4F' : 'var(--color-border)'}` }}>
        <div style={{ fontWeight: 800, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}><ShieldQuestion size={17} /> Override requests ({queue.length})</div>
        {!queue.length && <div style={{ fontSize: 13.5, color: 'var(--color-text-sub)', marginTop: 6 }}>Nothing waiting. Construction can only close items with a closing photo.</div>}
        {queue.map(it => {
          const r = addrOf.get(it.inspection_id);
          return (
            <div key={it.id} style={{ borderTop: '1px solid var(--color-border)', marginTop: 12, paddingTop: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: '#8D7140' }}>{r?.kind.toUpperCase()} · {street(r?.address ?? '')}{it.room ? ` · ${it.room}` : ''}</div>
              <div style={{ fontSize: 15, fontWeight: 600, marginTop: 2 }}>{it.description}</div>
              <div style={{ fontSize: 13.5, marginTop: 6 }}><b>{it.override_requested_by || r?.super_name || 'Construction'}</b> says: {it.override_reason}</div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <input value={note[it.id] ?? ''} onChange={e => setNote({ ...note, [it.id]: e.target.value })} placeholder="Note to construction (optional)" style={{ flex: 1, minWidth: 220, height: 38, borderRadius: 8, border: '1px solid #CFC7B8', padding: '0 10px', font: '500 14px var(--font-body)' }} />
                <button disabled={busy === it.id} onClick={() => decide(it, true)} style={{ height: 38, borderRadius: 8, border: 'none', background: '#4A7A55', color: '#fff', fontWeight: 700, padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Check size={15} /> Approve, close it</button>
                <button disabled={busy === it.id} onClick={() => decide(it, false)} style={{ height: 38, borderRadius: 8, border: 'none', background: '#A5402F', color: '#fff', fontWeight: 700, padding: '0 14px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><X size={15} /> Deny, not done</button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        {(['open', 'all'] as const).map(f => <button key={f} onClick={() => setFilter(f)} style={{ height: 34, borderRadius: 8, border: '1px solid var(--color-border-hard)', background: filter === f ? 'var(--color-navy)' : 'var(--color-panel)', color: filter === f ? '#fff' : 'var(--color-text)', fontWeight: 700, fontSize: 13, padding: '0 14px', cursor: 'pointer' }}>{f === 'open' ? 'Open items' : 'All inspections'}</button>)}
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {loading && <div style={card}>Loading…</div>}
        {!loading && !shown.length && <div style={{ ...card, color: 'var(--color-text-sub)' }}>{filter === 'open' ? 'No inspections have open items.' : 'No inspections yet. Start one from the Field app on a phone.'}</div>}
        {shown.map(r => {
          const its = (byInsp.get(r.id) ?? []).filter(needsClose); const openN = its.filter(i => i.res_status === 'open').length; const isOpen = open === r.id;
          return (
            <div key={r.id} style={card}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }} onClick={() => setOpen(isOpen ? null : r.id)}>
                {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                <span style={{ fontWeight: 800, fontSize: 12, color: '#fff', background: r.kind === 'pdi' ? '#8D7140' : '#1B2A41', borderRadius: 6, padding: '3px 8px' }}>{r.kind.toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{street(r.address) || 'Home'}</div>
                  <div style={{ fontSize: 12.5, color: 'var(--color-text-sub)' }}>{r.status === 'in_progress' ? 'In progress on site' : `Signed ${fmt(r.completed_at)}`} · {r.inspector_name}{r.super_name ? ` · Super: ${r.super_name}` : ''}{r.kind === 'pdi' && r.possession_date ? ` · Possession ${fmt(r.possession_date)}` : ''}</div>
                </div>
                <span style={{ fontWeight: 800, fontSize: 13, color: openN ? '#9A6A16' : '#4A7A55', background: openN ? '#F6ECD3' : '#E8F0E7', borderRadius: 8, padding: '4px 10px' }}>{its.length === 0 ? 'No items' : openN ? `${openN} open of ${its.length}` : 'All closed'}</span>
              </div>
              {isOpen && (
                <div style={{ marginTop: 12, borderTop: '1px solid var(--color-border)', paddingTop: 10 }}>
                  <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                    {r.pdf_path && <button onClick={() => pdf(r.pdf_path!)} style={{ height: 34, borderRadius: 8, border: '1px solid var(--color-border-hard)', background: '#fff', fontWeight: 700, fontSize: 13, padding: '0 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><FileText size={14} /> Signed PDF</button>}
                    {r.status !== 'in_progress' && <button onClick={() => copy(r.super_token)} style={{ height: 34, borderRadius: 8, border: '1px solid var(--color-border-hard)', background: '#fff', fontWeight: 700, fontSize: 13, padding: '0 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Copy size={14} /> Superintendent link</button>}
                    {r.kind === 'pdi' && r.status !== 'in_progress' && <button onClick={() => copy(r.owner_token)} style={{ height: 34, borderRadius: 8, border: '1px solid var(--color-border-hard)', background: '#fff', fontWeight: 700, fontSize: 13, padding: '0 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}><Copy size={14} /> Owner link</button>}
                  </div>
                  {its.map(i => (
                    <div key={i.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: '1px solid #EDE7DA', fontSize: 14 }}>
                      <span style={{ flex: 1 }}>{i.room ? <b>{i.room}: </b> : null}{i.description}</span>
                      <span style={{ fontWeight: 700, fontSize: 12.5, color: i.res_status === 'open' ? (i.override_status === 'requested' ? '#2F5576' : i.override_status === 'denied' ? '#A5402F' : '#9A6A16') : '#4A7A55' }}>
                        {i.res_status === 'fixed' ? 'Closed, photo' : i.res_status === 'override' ? 'Closed, override' : i.res_status === 'verified' ? 'Verified' : i.override_status === 'requested' ? 'Override requested' : i.override_status === 'denied' ? 'Override denied' : 'Open'}
                      </span>
                    </div>
                  ))}
                  {!its.length && <div style={{ fontSize: 13.5, color: 'var(--color-text-sub)' }}>No items for construction.</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
