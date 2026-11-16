// Item panel: a right-hand slide-over for one warranty item. Tabs keep each job in its own window:
// Details | AI assessment | Evidence | Trade & work order | History.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Camera, Upload, Lock, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { getCompanyId } from '@/lib/company';
import { ItemAssessment } from '@/components/itemassessment';
import { SendWorkOrder, WO_COLS, SWO_CSS, type WOFull } from '@/components/sendworkorder';

interface Item {
  id: string; company_id: string; case_id: string | null; item_number: number | null; room: string | null; floor_level: string | null;
  location: string | null; defect_area: string | null; description: string; status: string; trade_required: string | null;
  assessment_notes: string | null; assessed_at: string | null; warranty_decision: string | null; decision_at: string | null;
  decision_notes: string | null; completed_at: string | null; chargeable: boolean | null;
}
interface Evidence { id: string; evidence_type: string; phase: string | null; file_url: string | null; file_name: string | null; notes: string | null; captured_at: string; is_locked: boolean | null }
type WorkOrder = WOFull;
interface Trade { id: string; trade_name: string; trade_type: string | null }

const TABS = [
  { id: 'details', label: 'Details' }, { id: 'ai', label: 'AI assessment' }, { id: 'evidence', label: 'Evidence' },
  { id: 'trade', label: 'Trade & work order' }, { id: 'history', label: 'History' },
] as const;
type TabId = typeof TABS[number]['id'];

const EVIDENCE_TYPES: { id: string; label: string; phase: string }[] = [
  { id: 'owner_photo', label: 'Homeowner photo', phase: 'claim' },
  { id: 'assessment_photo', label: 'Assessment photo', phase: 'assessment' },
  { id: 'completion_photo_before', label: 'Before repair', phase: 'repair' },
  { id: 'completion_photo_after', label: 'After repair', phase: 'repair' },
  { id: 'homeowner_signature', label: 'Homeowner signature', phase: 'completion' },
  { id: 'engineering_doc', label: 'Engineering document', phase: 'assessment' },
  { id: 'other', label: 'Other', phase: 'assessment' },
];
const TYPE_LABEL = Object.fromEntries(EVIDENCE_TYPES.map(t => [t.id, t.label])) as Record<string, string>;
const STATUS_LABEL: Record<string, string> = { outstanding: 'Outstanding', complete: 'Complete', not_warranted: 'Not warranted', duplicate: 'Duplicate' };
const fmt = (s: string | null) => s ? new Date(s).toLocaleString('en-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—';

export default function ItemPanel({ itemId, onClose, onChanged }: { itemId: string; onClose: () => void; onChanged?: () => void }) {
  const [tab, setTab] = useState<TabId>('details');
  const [item, setItem] = useState<Item | null>(null);
  const [address, setAddress] = useState<{ lotId: string | null; text: string }>({ lotId: null, text: '' });
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [upType, setUpType] = useState('assessment_photo');
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const { data: it } = await supabase.from('warranty_items').select('*').eq('id', itemId).maybeSingle();
    if (!it) return;
    setItem(it as Item);
    const [{ data: ev }, { data: tr }] = await Promise.all([
      supabase.from('warranty_item_evidence').select('id,evidence_type,phase,file_url,file_name,notes,captured_at,is_locked').eq('item_id', itemId).order('captured_at', { ascending: false }),
      supabase.from('trades').select('id,trade_name,trade_type').eq('is_active', true).order('trade_name'),
    ]);
    setEvidence((ev ?? []) as Evidence[]); setTrades((tr ?? []) as Trade[]);
    if (it.case_id) {
      const { data: c } = await supabase.from('cases').select('lot_id').eq('id', it.case_id).maybeSingle();
      if (c?.lot_id) {
        const { data: lot } = await supabase.from('warranty_lots').select('address, civic_number, street, lot_number').eq('id', c.lot_id).maybeSingle();
        setAddress({ lotId: c.lot_id, text: lot?.address ?? (`${lot?.civic_number ?? ''} ${lot?.street ?? ''}`.trim() || `Lot ${lot?.lot_number ?? ''}`) });
      }
      const [{ data: w1 }, { data: w2 }] = await Promise.all([
        supabase.from('work_orders').select(WO_COLS).eq('case_id', it.case_id).contains('custom_fields', { item_id: itemId }),
        supabase.from('work_orders').select(WO_COLS).eq('case_id', it.case_id).contains('custom_fields', { item_ids: [itemId] }),
      ]);
      const wo = [...((w1 ?? []) as unknown as WOFull[]), ...((w2 ?? []) as unknown as WOFull[])].sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
      setOrders((wo ?? []) as WorkOrder[]);
    }
  }, [itemId]);

  useEffect(() => { setTab('details'); setItem(null); setMsg(''); load(); }, [load]);
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); }; window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onClose]);

  const photos = useMemo(() => evidence.filter(e => e.evidence_type !== 'access_log'), [evidence]);
  const history = useMemo(() => {
    if (!item) return [];
    const rows: { at: string; what: string }[] = [];
    if (item.assessed_at) rows.push({ at: item.assessed_at, what: 'Assessed' + (item.assessment_notes ? `: ${item.assessment_notes}` : '') });
    if (item.decision_at) rows.push({ at: item.decision_at, what: `Decision: ${item.warranty_decision === 'warranty_approved' ? 'repair approved' : item.warranty_decision ?? 'recorded'}${item.decision_notes ? ` — ${item.decision_notes}` : ''}` });
    if (item.completed_at) rows.push({ at: item.completed_at, what: 'Marked complete' });
    for (const e of evidence) rows.push({ at: e.captured_at, what: e.evidence_type === 'access_log' ? (e.notes ?? 'Logged') : `${TYPE_LABEL[e.evidence_type] ?? e.evidence_type} added${e.file_name ? ` (${e.file_name})` : ''}` });
    for (const w of orders) if (w.created_at) rows.push({ at: w.created_at, what: `Work order created (${w.status ?? 'queued'})` });
    return rows.sort((a, b) => b.at.localeCompare(a.at));
  }, [item, evidence, orders]);

  async function upload(file: File) {
    if (!item || !item.case_id) { setMsg('This item is not attached to a case, so photos cannot be stored.'); return; }
    setBusy('upload'); setMsg('');
    try {
      const type = EVIDENCE_TYPES.find(t => t.id === upType)!;
      const ext = file.name.split('.').pop();
      const path = `${await getCompanyId()}/evidence/${item.case_id}/${item.id}/${type.id}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('case-documents').upload(path, file);
      if (upErr) throw upErr;
      const { data: u } = supabase.storage.from('case-documents').getPublicUrl(path);
      const { data: auth } = await supabase.auth.getUser();
      const { error } = await supabase.from('warranty_item_evidence').insert({
        company_id: item.company_id, item_id: item.id, case_id: item.case_id, evidence_type: type.id, phase: type.phase,
        file_url: u.publicUrl, file_name: file.name, storage_path: path, is_before: type.id === 'completion_photo_before', captured_by_id: auth.user?.id ?? null,
      });
      if (error) throw error;
      await load(); onChanged?.();
    } catch (e) { setMsg(`Upload failed: ${(e as Error).message}`); }
    setBusy('');
  }

  async function setTrade(name: string) {
    if (!item) return;
    setBusy('trade'); setMsg('');
    const { error } = await supabase.from('warranty_items').update({ trade_required: name || null }).eq('id', item.id);
    if (error) setMsg(error.message); else { await load(); onChanged?.(); }
    setBusy('');
  }

  async function createWorkOrder() {
    if (!item || !item.case_id) return;
    setBusy('wo'); setMsg('');
    const { error } = await supabase.from('work_orders').insert({
      company_id: item.company_id, case_id: item.case_id, lot_id: address.lotId,
      issue: item.description.slice(0, 120), description: item.description, address: address.text || 'Address not on file',
      call_type: 'Warranty', status: 'queued', priority: 'normal',
      notes: [item.room, item.trade_required ? `Trade: ${item.trade_required}` : ''].filter(Boolean).join(' · ') || null,
      custom_fields: { item_id: item.id, trade: item.trade_required },
    });
    if (error) setMsg(`Could not create the work order: ${error.message}`); else { await load(); onChanged?.(); setMsg('Work order created.'); }
    setBusy('');
  }

  return (
    <>
      <style>{CSS}{SWO_CSS}</style>
      <div className="ip-scrim" onClick={onClose} />
      <aside className="ip" role="dialog" aria-label="Warranty item">
        <header className="ip-h">
          <div style={{ minWidth: 0 }}>
            <div className="ip-t">{item ? (item.room || item.location || 'Item') : 'Loading…'}{item?.item_number != null ? <span> · Item {item.item_number}</span> : null}</div>
            <div className="ip-s">{address.text}{item ? ` · ${STATUS_LABEL[item.status] ?? item.status}` : ''}</div>
          </div>
          <button className="ip-x" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </header>
        <nav className="ip-tabs" role="tablist">
          {TABS.map(t => <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'on' : ''} onClick={() => setTab(t.id)}>{t.label}{t.id === 'evidence' && photos.length ? <em>{photos.length}</em> : null}</button>)}
        </nav>

        <div className="ip-b">
          {!item && <div className="ip-m">Loading item…</div>}
          {item && tab === 'details' && (
            <div className="ip-grid">
              <p className="ip-desc">{item.description}</p>
              <dl>
                <dt>Room</dt><dd>{item.room || '—'}</dd><dt>Floor</dt><dd>{item.floor_level || '—'}</dd>
                <dt>Location</dt><dd>{item.location || '—'}</dd><dt>Defect area</dt><dd>{item.defect_area || '—'}</dd>
                <dt>Status</dt><dd>{STATUS_LABEL[item.status] ?? item.status}</dd>
                <dt>Decision</dt><dd>{item.warranty_decision ? item.warranty_decision.replace(/_/g, ' ') : 'Not decided'}</dd>
                <dt>Trade</dt><dd>{item.trade_required || 'Not assigned'}</dd>
              </dl>
              {item.assessment_notes && <div className="ip-note"><b>Scope of work / notes</b>{item.assessment_notes}</div>}
            </div>
          )}

          {item && tab === 'ai' && <ItemAssessment itemId={item.id} description={item.description} room={item.room} />}

          {item && tab === 'evidence' && (
            <div>
              <div className="ip-up">
                <select value={upType} onChange={e => setUpType(e.target.value)} aria-label="Evidence type">{EVIDENCE_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select>
                <button className="ip-btn" onClick={() => fileRef.current?.click()} disabled={busy === 'upload'}><Upload size={14} />{busy === 'upload' ? 'Uploading…' : 'Add file'}</button>
                <input ref={fileRef} type="file" accept="image/*,application/pdf" capture={undefined} hidden onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ''; }} />
              </div>
              {photos.length === 0 && <div className="ip-m"><Camera size={18} /> No photos or documents yet. Add the first one above.</div>}
              <div className="ip-photos">
                {photos.map(p => (
                  <a key={p.id} className="ip-ph" href={p.file_url ?? undefined} target="_blank" rel="noreferrer">
                    {p.file_url && /\.(png|jpe?g|webp|gif|heic)$/i.test(p.file_name ?? '') ? <img src={p.file_url} alt={p.file_name ?? 'evidence'} loading="lazy" /> : <div className="doc">{(p.file_name ?? 'file').split('.').pop()?.toUpperCase()}</div>}
                    <span>{TYPE_LABEL[p.evidence_type] ?? p.evidence_type}{p.is_locked ? <Lock size={11} /> : null}</span>
                    <small>{fmt(p.captured_at)}</small>
                  </a>
                ))}
              </div>
            </div>
          )}

          {item && tab === 'trade' && (
            <div className="ip-grid">
              <label className="ip-l">Assigned trade</label>
              <select className="ip-sel" value={item.trade_required ?? ''} onChange={e => setTrade(e.target.value)} disabled={busy === 'trade'}>
                <option value="">Select a trade</option>{trades.map(t => <option key={t.id} value={t.trade_name}>{t.trade_name}{t.trade_type ? ` (${t.trade_type})` : ''}</option>)}
              </select>
              <label className="ip-l" style={{ marginTop: 18 }}>Work orders for this item</label>
              {orders.length === 0 && <div className="ip-m">None yet. Once a trade is assigned you can create one here.</div>}
              {orders.map(w => <SendWorkOrder key={w.id + (w.portal_sent_at ?? '')} order={w} tradeName={item.trade_required} address={address.text} onChanged={() => { load(); onChanged?.(); }} />)}
              <button className="ip-btn primary" style={{ marginTop: 10 }} onClick={createWorkOrder} disabled={!item.trade_required || busy === 'wo' || !item.case_id}>
                <CheckCircle2 size={14} />{busy === 'wo' ? 'Creating…' : 'Create work order'}
              </button>
              {!item.trade_required && <small className="ip-hint">Assign a trade first.</small>}
            </div>
          )}

          {item && tab === 'history' && (
            <ol className="ip-hist">{history.length === 0 ? <li className="ip-m">No activity recorded yet.</li> : history.map((h, i) => <li key={i}><span>{fmt(h.at)}</span>{h.what}</li>)}</ol>
          )}
          {msg && <div className="ip-msg" role="status">{msg}</div>}
        </div>
      </aside>
    </>
  );
}

const CSS = `
.ip-scrim{position:fixed;inset:0;background:rgba(40,32,18,.28);z-index:80}
.ip{padding-top:var(--sat);padding-bottom:var(--sab);box-sizing:border-box;position:fixed;top:0;right:0;bottom:0;width:min(560px,100vw);background:#F8F6F1;z-index:81;display:flex;flex-direction:column;box-shadow:-18px 0 44px rgba(40,32,18,.16);font-family:var(--font-body);animation:ipin .16s ease-out}
@keyframes ipin{from{transform:translateX(24px);opacity:.6}to{transform:none;opacity:1}}
@media (prefers-reduced-motion:reduce){.ip{animation:none}}
.ip-h{display:flex;align-items:flex-start;gap:12px;padding:16px 18px 12px;border-bottom:1px solid #D9D2C5}
.ip-t{font:800 16px var(--font-body);color:#1F2A3C}.ip-t span{font-weight:600;color:#5E6575}.ip-s{font:500 12.5px var(--font-body);color:#5E6575;margin-top:2px}
.ip-x{margin-left:auto;border:0;background:transparent;padding:6px;border-radius:8px;color:#485163;cursor:pointer}.ip-x:hover{background:#EFEBE2}
.ip-tabs{display:flex;gap:2px;padding:0 12px;border-bottom:1px solid #D9D2C5;overflow-x:auto}
.ip-tabs button{border:0;background:transparent;padding:10px 12px;font:600 13px var(--font-body);color:#5E6575;cursor:pointer;border-bottom:2px solid transparent;white-space:nowrap}
.ip-tabs button:hover{color:#1F2A3C}.ip-tabs button.on{color:#2F5576;border-bottom-color:#3F6A8F}.ip-tabs em{font-style:normal;margin-left:6px;font:700 11px var(--font-body);background:#E6E0D5;color:#485163;border-radius:999px;padding:1px 7px}
.ip-b{flex:1;overflow-y:auto;padding:18px}
.ip-m{display:flex;align-items:center;gap:8px;font:500 13px var(--font-body);color:#5E6575;padding:10px 0}
.ip-desc{font:500 14px/1.55 var(--font-body);color:#1F2A3C;margin:0 0 14px}
.ip dl{display:grid;grid-template-columns:110px 1fr;gap:8px 12px;margin:0;font-size:13px}.ip dt{color:#5E6575;font-weight:600}.ip dd{margin:0;color:#1F2A3C;font-weight:600}
.ip-note{margin-top:16px;padding:12px;background:#EFEBE2;border-radius:10px;font-size:13px;line-height:1.5;color:#2F394A}.ip-note b{display:block;margin-bottom:4px;color:#1F2A3C}
.ip-up{display:flex;gap:8px;margin-bottom:14px}.ip-up select,.ip-sel{flex:1;height:36px;border:1px solid #CFC7B8;border-radius:9px;padding:0 10px;font:600 13px var(--font-body);background:#F8F6F1;color:#1F2A3C}.ip-sel{width:100%}
.ip-btn{display:inline-flex;align-items:center;gap:6px;height:36px;border:1px solid #CFC7B8;background:#F8F6F1;border-radius:9px;padding:0 13px;font:700 13px var(--font-body);color:#1F2A3C;cursor:pointer}.ip-btn:hover:not(:disabled){background:#EFEBE2}
.ip-btn.primary{background:#3F6A8F;border-color:#3F6A8F;color:#fff}.ip-btn.primary:hover:not(:disabled){background:#2F5576}.ip-btn:disabled{opacity:.5;cursor:not-allowed}
.ip-photos{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.ip-ph{display:flex;flex-direction:column;border:1px solid #D9D2C5;border-radius:10px;overflow:hidden;color:inherit;text-decoration:none}.ip-ph:hover{border-color:#B9C6DD}
.ip-ph img,.ip-ph .doc{height:104px;width:100%;object-fit:cover;background:#EFEBE2;display:flex;align-items:center;justify-content:center;font:800 14px var(--font-body);color:#5E6575}
.ip-ph span{display:flex;align-items:center;gap:5px;padding:7px 9px 0;font:700 12px var(--font-body);color:#1F2A3C}.ip-ph small{padding:0 9px 8px;font:500 11px var(--font-body);color:#5E6575}
.ip-l{display:block;font:700 12px var(--font-body);color:#5E6575;margin-bottom:6px}.ip-hint{display:block;margin-top:6px;color:#5E6575;font-size:12px}
.ip-wo{display:flex;gap:10px;align-items:flex-start;padding:10px 12px;border:1px solid #D9D2C5;border-radius:10px;margin-bottom:8px;color:#485163}.ip-wo b{display:block;font:700 13px var(--font-body);color:#1F2A3C}.ip-wo small{font:500 12px var(--font-body);color:#5E6575}
.ip-hist{list-style:none;margin:0;padding:0 0 0 14px;border-left:2px solid #D9D2C5}.ip-hist li{position:relative;padding:0 0 16px 14px;font:500 13px/1.45 var(--font-body);color:#1F2A3C}
.ip-hist li::before{content:'';position:absolute;left:-21px;top:5px;width:8px;height:8px;border-radius:50%;background:#3F6A8F;box-shadow:0 0 0 3px #fff}.ip-hist li span{display:block;font:600 11.5px var(--font-body);color:#5E6575}
.ip-msg{margin-top:14px;padding:10px 12px;border-radius:9px;background:#EFEBE2;font:600 12.5px var(--font-body);color:#2F394A}
`;
