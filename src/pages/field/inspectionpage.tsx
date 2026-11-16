// The on-site inspection screen for both QCI (against site instructions, selections and upgrades, plus observed defects) and PDI (with the owner, Tarion layout).
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, Image as ImageIcon, Plus, Trash2, Check, X, Minus, FileText, Copy, ChevronLeft, ExternalLink, AlertTriangle, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import {
  addPhoto, finishInspection, getCachedLot, getInsp, listItems, listPhotos, listSigs, patchInsp, putItem, putItems, putSig,
  removeItem, removePhoto, useLocal, usePhotoUrls, useSyncStatus, type LocalPhoto,
} from '@/lib/offline';
import { SignaturePad } from '@/components/signaturepad';
import LotSource from '@/components/lotsource';
import {
  LIST_LABEL, ROOMS, SRC_LABEL, appOrigin, fmtDate, loadLotSource,
  type InspItem, type Inspection, type ListKey, type SiLine,
} from '@/lib/inspections';

const NAVY = '#1B2A41', BRASS = '#8D7140';
const card: React.CSSProperties = { background: '#F8F6F1', border: '1px solid #D9D2C5', borderRadius: 14, padding: 14 };
const inp: React.CSSProperties = { width: '100%', minHeight: 48, borderRadius: 10, border: '1px solid #B9AF9B', background: '#fff', padding: '0 12px', font: '500 16px var(--font-body)', color: '#1F2A3C', boxSizing: 'border-box' };
const big = (bg: string, fg = '#fff', border = 'none'): React.CSSProperties => ({ minHeight: 48, borderRadius: 10, border, background: bg, color: fg, fontWeight: 800, fontSize: 15, padding: '0 16px', cursor: 'pointer', fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8 });

type Tab = 'lines' | 'findings' | 'finish';

/** One inspection item per source line, written to the phone (works with no signal). */
async function seedLocal(insp: Inspection, lines: SiLine[]) {
  const existing = await listItems(insp.id);
  const have = new Set(existing.filter(i => i.list === 'si_check').map(i => i.ref_line_id));
  const fresh = lines.filter(l => !have.has(l.id)); if (!fresh.length) return;
  const base = existing.filter(i => i.list === 'si_check').length;
  await putItems(fresh.map((l, n) => ({ company_id: insp.company_id, inspection_id: insp.id, seq: base + n + 1, list: 'si_check' as ListKey, source: l.kind, description: (l.ref ? `${l.ref}: ` : '') + l.text, ref_line_id: l.id })));
}

export default function InspectionPage() {
  const { id } = useParams();
  const sync = useSyncStatus();
  const [insp, ready] = useLocal(() => getInsp(id!), [id]);
  const [itemsL] = useLocal(() => listItems(id!), [id]);
  const [photosL] = useLocal(() => listPhotos(id!), [id]);
  const items = itemsL ?? []; const photos = photosL ?? [];
  const urls = usePhotoUrls(photosL);
  const [lines, setLines] = useState<SiLine[]>([]);
  const [tab, setTab] = useState<Tab | null>(null);
  const [sheet, setSheet] = useState<null | { list: ListKey; room?: string; description?: string }>(null);
  const [err, setErr] = useState('');
  const seeding = useRef(false);
  const lotId = insp?.lot_id ?? null;

  // Site instruction lines: the copy saved on the phone first, refreshed from the server when there is signal.
  useEffect(() => {
    if (!lotId) return; let live = true;
    (async () => {
      const saved = (await getCachedLot(lotId))?.lines ?? []; if (live) setLines(saved);
      if (navigator.onLine) { try { const s2 = await loadLotSource(lotId); if (live && s2.lines.length) setLines(s2.lines); } catch { /* keep saved */ } }
    })();
    return () => { live = false; };
  }, [lotId, sync.online]);

  // QCI: make each line ready to tick, once.
  useEffect(() => {
    if (!insp || insp.kind !== 'qci' || insp.status !== 'in_progress' || !lines.length || itemsL === undefined || seeding.current) return;
    seeding.current = true; seedLocal(insp, lines).catch((e: any) => setErr(e.message ?? 'Could not add the lines')).finally(() => { seeding.current = false; });
  }, [insp?.id, insp?.status, lines, itemsL?.length]);

  useEffect(() => { if (insp && tab === null) setTab(insp.status !== 'in_progress' ? 'finish' : insp.kind === 'qci' ? 'lines' : 'findings'); }, [insp, tab]);

  if (!ready || (insp && tab === null)) return <div style={{ ...card, display: 'flex', gap: 10, alignItems: 'center' }}><Loader2 size={16} className="spin" /> Loading…<style>{`.spin{animation:sp .9s linear infinite}@keyframes sp{to{transform:rotate(360deg)}}`}</style></div>;
  if (!insp) return <div style={{ ...card, color: '#A5402F' }}>{err || (sync.online ? 'Inspection not found.' : 'This inspection is not saved on this phone. Connect to the internet once to open it.')}</div>;

  const editable = insp.status === 'in_progress';
  const isQci = insp.kind === 'qci';
  const siItems = items.filter(i => i.list === 'si_check');
  const findings = items.filter(i => i.list !== 'si_check');
  const answeredSi = siItems.filter(i => i.result).length;
  const tabs: { id: Tab; label: string; n?: string }[] = [
    ...(isQci ? [{ id: 'lines' as Tab, label: 'Lines', n: siItems.length ? `${answeredSi}/${siItems.length}` : '' }] : []),
    { id: 'findings', label: isQci ? 'Findings' : 'Items', n: String(findings.length) },
    { id: 'finish', label: editable ? (isQci ? 'Finish' : 'Sign') : 'Signed' },
  ];

  const photosOf = (itemId: string) => photos.filter(p => p.item_id === itemId && p.kind !== 'closing');

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...card, borderLeft: `4px solid ${isQci ? NAVY : BRASS}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 800, fontSize: 12, color: '#fff', background: isQci ? NAVY : BRASS, borderRadius: 6, padding: '3px 8px' }}>{insp.kind.toUpperCase()}</span>
          <Link to="/field" style={{ marginLeft: 'auto', color: '#2F5576', fontWeight: 700, fontSize: 13, textDecoration: 'none', display: 'flex', alignItems: 'center' }}><ChevronLeft size={15} /> All</Link>
        </div>
        <div style={{ fontWeight: 800, fontSize: 18, marginTop: 6 }}>{(insp.address ?? '').replace(/,\s*Ottawa.*$/i, '') || 'Home'}</div>
        <div style={{ fontSize: 13, color: '#485163' }}>{[insp.owner_names, insp.enrolment_no].filter(Boolean).join(' · ')}</div>
        {!editable && <div style={{ marginTop: 6, fontSize: 13, fontWeight: 700, color: '#4A7A55' }}>Signed {fmtDate(insp.completed_at)}. This record is locked.</div>}
      </div>

      <div role="tablist" style={{ display: 'grid', gridTemplateColumns: `repeat(${tabs.length},1fr)`, gap: 6 }}>
        {tabs.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            style={{ minHeight: 48, borderRadius: 10, border: tab === t.id ? 'none' : '1px solid #C6BDAC', background: tab === t.id ? NAVY : '#F8F6F1', color: tab === t.id ? '#fff' : '#1F2A3C', fontWeight: 800, fontSize: 14, cursor: 'pointer', fontFamily: 'inherit' }}>
            {t.label}{t.n ? <span style={{ marginLeft: 6, fontWeight: 600, opacity: 0.8 }}>{t.n}</span> : null}
          </button>
        ))}
      </div>

      {err && <div style={{ ...card, color: '#A5402F', fontSize: 14, display: 'flex', gap: 8 }}><AlertTriangle size={16} /> {err}</div>}

      {tab === 'lines' && isQci && (
        <LinesTab insp={insp} items={siItems} photosOf={photosOf} urls={urls} editable={editable} online={sync.online} setErr={setErr} lines={lines} onLines={setLines} />
      )}
      {tab === 'findings' && (
        <FindingsTab insp={insp} items={findings} photosOf={photosOf} urls={urls} editable={editable} setErr={setErr} add={(list) => setSheet({ list })} />
      )}
      {tab === 'finish' && <FinishTab insp={insp} items={items} photos={photos} editable={editable} online={sync.online} answeredSi={answeredSi} totalSi={siItems.length} />}

      {sheet && editable && (
        <FindingSheet insp={insp} init={sheet} nextSeq={(l: ListKey) => items.filter(i => i.list === l).length + 1} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); setErr(''); setTab('findings'); }} />
      )}
    </div>
  );
}

// ───────── Photos ─────────
function PhotoRow({ item, photos, urls, editable, insp, setErr }: { item: InspItem; photos: LocalPhoto[]; urls: Record<string, string>; editable: boolean; insp: Inspection; setErr: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  async function add(files: FileList | null) {
    if (!files?.length) return; setBusy(true); setErr('');
    try { for (const f of Array.from(files)) await addPhoto(insp, item.id, f); }
    catch (e: any) { setErr('Could not save the photo on this phone: ' + (e.message ?? 'try again')); }
    finally { setBusy(false); }
  }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
      {photos.map(p => (
        <div key={p.id} style={{ position: 'relative' }}>
          {urls[p.id] ? <a href={urls[p.id]} target="_blank" rel="noreferrer"><img src={urls[p.id]} alt="" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, border: p.uploaded ? '1px solid #C6BDAC' : '2px dashed #B08D4F', display: 'block' }} /></a> : <div style={{ width: 72, height: 72, borderRadius: 8, background: '#E4DDCF' }} />}
          {editable && <button onClick={() => removePhoto(p.id)} aria-label="Remove photo" style={{ position: 'absolute', top: -6, right: -6, width: 24, height: 24, borderRadius: 12, border: 'none', background: '#A5402F', color: '#fff', display: 'grid', placeItems: 'center', cursor: 'pointer' }}><X size={13} /></button>}
        </div>
      ))}
      {editable && (
        <>
          <label style={{ ...big('#EFEBE2', '#1B2A41', '1px solid #B9AF9B'), width: 72, height: 72, minHeight: 72, padding: 0, borderRadius: 8, flexDirection: 'column', gap: 2, fontSize: 11 }}>
            {busy ? <Loader2 size={20} className="spin" /> : <Camera size={22} />}{busy ? '' : 'Photo'}
            <input type="file" accept="image/*" capture="environment" hidden onChange={e => { add(e.target.files); e.target.value = ''; }} />
          </label>
          <label style={{ ...big('#EFEBE2', '#1B2A41', '1px solid #B9AF9B'), width: 48, height: 72, minHeight: 72, padding: 0, borderRadius: 8 }} aria-label="Choose from gallery">
            <ImageIcon size={18} /><input type="file" accept="image/*" multiple hidden onChange={e => { add(e.target.files); e.target.value = ''; }} />
          </label>
        </>
      )}
    </div>
  );
}

// ───────── QCI: lines against site instructions, selections and upgrades ─────────
function LinesTab({ insp, items, photosOf, urls, editable, online, setErr, lines, onLines }: { insp: Inspection; items: InspItem[]; photosOf: (id: string) => LocalPhoto[]; urls: Record<string, string>; editable: boolean; online: boolean; setErr: (s: string) => void; lines: SiLine[]; onLines: (l: SiLine[]) => void }) {
  const [syncing, setSyncing] = useState(false);
  const [showSrc, setShowSrc] = useState(false);
  async function set(it: InspItem, result: InspItem['result']) { await putItem({ ...it, company_id: insp.company_id, result }); }
  async function note(it: InspItem, v: string) { if ((it.note ?? '') !== v) await putItem({ ...it, company_id: insp.company_id, note: v || null }); }
  async function pull() {
    if (!insp.lot_id) return; setSyncing(true);
    try { const s = await loadLotSource(insp.lot_id); onLines(s.lines); await seedLocal(insp, s.lines); }
    catch (e: any) { setErr(e.message); } finally { setSyncing(false); }
  }
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {insp.lot_id && editable && !online && <div style={{ ...card, fontSize: 13.5, color: '#485163' }}>Working without signal. The {lines.length} site instruction line{lines.length === 1 ? '' : 's'} saved on this phone are all you need. New lines can be added when you are connected.</div>}
      {insp.lot_id && editable && online && (
        <>
          <button onClick={() => setShowSrc(v => !v)} style={big('#F8F6F1', '#1B2A41', '1px solid #B9AF9B')}>{showSrc ? 'Hide' : 'Site instruction sheets and lines'}{!showSrc && lines.length ? ` (${lines.length})` : ''}</button>
          {(showSrc || (!lines.length && !items.length)) && <LotSource lotId={insp.lot_id} onChange={l => { if (l.length !== lines.length) onLines(l); }} />}
        </>
      )}
      {editable && online && lines.length > items.length && <button onClick={pull} disabled={syncing} style={big(NAVY)}>{syncing ? 'Adding…' : `Add ${lines.length - items.length} new line${lines.length - items.length === 1 ? '' : 's'} to this inspection`}</button>}
      {!items.length && <div style={{ ...card, color: '#485163', fontSize: 14 }}>No lines yet. Paste the site instructions and selections above, or just record what you see under Findings.</div>}
      {items.map(it => (
        <div key={it.id} style={{ ...card, borderLeft: `4px solid ${it.result === 'ok' ? '#4A7A55' : it.result === 'wrong' || it.result === 'missing' ? '#A5402F' : '#C6BDAC'}` }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: BRASS, marginBottom: 3 }}>{SRC_LABEL[it.source]}</div>
          <div style={{ fontSize: 15.5, fontWeight: 600, lineHeight: 1.35 }}>{it.description}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 10 }}>
            {([['ok', 'OK', Check, '#4A7A55'], ['wrong', 'Wrong', X, '#A5402F'], ['missing', 'Missing', Minus, '#9A6A16'], ['na', 'N/A', Minus, '#6C7280']] as const).map(([k, label, Icon, color]) => (
              <button key={k} disabled={!editable} onClick={() => set(it, it.result === k ? null : k)} aria-pressed={it.result === k}
                style={{ minHeight: 48, borderRadius: 9, border: `2px solid ${color}`, background: it.result === k ? color : 'transparent', color: it.result === k ? '#fff' : color, fontWeight: 800, fontSize: 13, cursor: editable ? 'pointer' : 'default', fontFamily: 'inherit', display: 'grid', placeItems: 'center' }}>
                <Icon size={16} />{label}
              </button>
            ))}
          </div>
          {(it.result === 'wrong' || it.result === 'missing') && (
            <>
              <textarea key={it.id + (it.note ?? '')} defaultValue={it.note ?? ''} disabled={!editable} onBlur={e => note(it, e.target.value.trim())} placeholder="What is wrong? (location, what is there instead)"
                style={{ ...inp, minHeight: 70, padding: 10, marginTop: 8 }} />
              <PhotoRow item={it} photos={photosOf(it.id)} urls={urls} editable={editable} insp={insp} setErr={setErr} />
            </>
          )}
        </div>
      ))}
    </div>
  );
}

// ───────── Findings: defects, substitutions, items not assessed ─────────
function FindingsTab({ insp, items, photosOf, urls, editable, setErr, add }: { insp: Inspection; items: InspItem[]; photosOf: (id: string) => LocalPhoto[]; urls: Record<string, string>; editable: boolean; setErr: (s: string) => void; add: (l: ListKey) => void }) {
  const lists: ListKey[] = ['deficiency'];
  async function del(it: InspItem) { if (!confirm('Remove this finding and its photos?')) return; await removeItem(it.id); }
  return (
    <div style={{ display: 'grid', gap: 12 }}>
      {editable && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          {lists.map(l => <button key={l} onClick={() => add(l)} style={{ ...big(NAVY), minHeight: 56, fontSize: 16 }}><Plus size={18} />{insp.kind === 'qci' ? 'Add defect' : 'Add item'}</button>)}
        </div>
      )}
      {lists.map(l => {
        const rows = items.filter(i => i.list === l); if (!rows.length && l !== 'deficiency') return null;
        return (
          <div key={l}>
            <div style={{ fontWeight: 800, fontSize: 14, color: NAVY, margin: '4px 2px 8px' }}>{insp.kind === 'qci' ? LIST_LABEL[l] : 'Items to be completed'} ({rows.length})</div>
            {!rows.length && <div style={{ ...card, color: '#485163', fontSize: 14 }}>{insp.kind === 'qci' ? 'Nothing recorded yet.' : 'Walk the home with the owner. When they point out something, tap Add item, choose the room, describe it and take the photo.'}</div>}
            <div style={{ display: 'grid', gap: 8 }}>
              {rows.map((it, n) => (
                <div key={it.id} style={card}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                    <span style={{ fontWeight: 800, color: BRASS, minWidth: 22 }}>{n + 1}.</span>
                    <div style={{ flex: 1 }}>
                      {it.room && <div style={{ fontSize: 12, fontWeight: 800, color: '#2F5576' }}>{it.room}</div>}
                      <div style={{ fontSize: 15, lineHeight: 1.35 }}>{it.description}</div>
                    </div>
                    {editable && <button onClick={() => del(it)} aria-label="Remove finding" style={{ border: 'none', background: 'none', color: '#A5402F', padding: 8, cursor: 'pointer' }}><Trash2 size={17} /></button>}
                  </div>
                  <PhotoRow item={it} photos={photosOf(it.id)} urls={urls} editable={editable} insp={insp} setErr={setErr} />
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ───────── Add finding (bottom sheet) ─────────
function FindingSheet({ insp, init, nextSeq, onClose, onSaved }: { insp: Inspection; init: { list: ListKey; room?: string; description?: string }; nextSeq: (l: ListKey) => number; onClose: () => void; onSaved: (msg?: string) => void }) {
  const [list, setList] = useState<ListKey>(init.list);
  const [room, setRoom] = useState(init.room ?? ''); const [desc, setDesc] = useState(init.description ?? '');
  const [files, setFiles] = useState<File[]>([]); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const previews = useMemo(() => files.map(f => URL.createObjectURL(f)), [files]);
  const ta = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { ta.current?.focus(); const l = ta.current?.value.length ?? 0; ta.current?.setSelectionRange(l, l); }, []);

  async function save() {
    if (!desc.trim()) { setErr('Describe the item.'); return; }
    setBusy(true); setErr('');
    try {
      const item = await putItem({ company_id: insp.company_id, inspection_id: insp.id, seq: nextSeq(list), list, source: 'observed', room: room || null, description: desc.trim() });
      for (const f of files) await addPhoto(insp, item.id, f);
      onSaved();
    } catch (e: any) { setErr(e.message ?? 'Could not save'); setBusy(false); }
  }
  const lists: ListKey[] = ['deficiency'];
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(20,28,44,0.55)', display: 'flex', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#F8F6F1', width: '100%', maxWidth: 640, margin: '0 auto', borderRadius: '18px 18px 0 0', padding: '16px 14px calc(16px + var(--sab))', maxHeight: '92dvh', overflowY: 'auto', display: 'grid', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center' }}><div style={{ fontWeight: 800, fontSize: 17, flex: 1 }}>{insp.kind === 'qci' ? 'Add a defect' : 'Add an item'}</div><button onClick={onClose} aria-label="Close" style={{ border: 'none', background: 'none', padding: 8 }}><X size={20} /></button></div>
        {lists.length > 1 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${lists.length},1fr)`, gap: 6 }}>
            {lists.map(l => <button key={l} onClick={() => setList(l)} style={{ minHeight: 44, borderRadius: 9, border: '1px solid #B9AF9B', background: list === l ? NAVY : '#fff', color: list === l ? '#fff' : '#1F2A3C', fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}>{LIST_LABEL[l]}</button>)}
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
          {ROOMS.map(r => <button key={r} onClick={() => setRoom(room === r ? '' : r)} style={{ flex: '0 0 auto', minHeight: 40, borderRadius: 20, border: '1px solid #B9AF9B', background: room === r ? '#2F5576' : '#fff', color: room === r ? '#fff' : '#1F2A3C', fontWeight: 600, fontSize: 13.5, padding: '0 14px', cursor: 'pointer', fontFamily: 'inherit' }}>{r}</button>)}
        </div>
        <input value={room} onChange={e => setRoom(e.target.value)} placeholder="Room or location" style={inp} />
        <textarea ref={ta} value={desc} onChange={e => setDesc(e.target.value)} placeholder={insp.kind === 'qci' ? 'What did you find?' : 'What needs to be done?'} style={{ ...inp, minHeight: 100, padding: 12 }} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {previews.map((u, i) => <div key={u} style={{ position: 'relative' }}><img src={u} alt="" style={{ width: 64, height: 64, objectFit: 'cover', borderRadius: 8 }} /><button onClick={() => setFiles(files.filter((_, j) => j !== i))} aria-label="Remove" style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, borderRadius: 11, border: 'none', background: '#A5402F', color: '#fff' }}><X size={12} /></button></div>)}
          <label style={{ ...big('#fff', NAVY, '1px solid #B9AF9B'), minHeight: 64, width: 64, padding: 0, borderRadius: 8, flexDirection: 'column', gap: 2, fontSize: 11 }}><Camera size={22} />Photo<input type="file" accept="image/*" capture="environment" hidden onChange={e => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} /></label>
          <label style={{ ...big('#fff', NAVY, '1px solid #B9AF9B'), minHeight: 64, width: 48, padding: 0, borderRadius: 8 }} aria-label="Choose from gallery"><ImageIcon size={18} /><input type="file" accept="image/*" multiple hidden onChange={e => { setFiles([...files, ...Array.from(e.target.files ?? [])]); e.target.value = ''; }} /></label>
        </div>
        {err && <div style={{ color: '#A5402F', fontSize: 14 }}>{err}</div>}
        <button onClick={save} disabled={busy} style={big(NAVY)}>{busy ? 'Saving…' : (insp.kind === 'qci' ? 'Save finding' : 'Save item')}</button>
      </div>
    </div>
  );
}

// ───────── Finish: details, signatures, lock ─────────
function FinishTab({ insp, items, photos, editable, online, answeredSi, totalSi }: { insp: Inspection; items: InspItem[]; photos: LocalPhoto[]; editable: boolean; online: boolean; answeredSi: number; totalSi: number }) {
  const isQci = insp.kind === 'qci';
  const [superName, setSuperName] = useState(insp.super_name ?? ''); const [superEmail, setSuperEmail] = useState(insp.super_email ?? '');
  const [inspector, setInspector] = useState(insp.inspector_name ?? '');
  const [poss, setPoss] = useState(insp.possession_date ?? ''); const [present, setPresent] = useState(insp.purchaser_present);
  const [absent, setAbsent] = useState(insp.absent_note ?? ''); const [notes, setNotes] = useState(insp.notes ?? '');
  const [pName, setPName] = useState(insp.owner_names ?? ''); const [p2Name, setP2Name] = useState(''); const [dName, setDName] = useState(''); const [useDesignate, setUseDesignate] = useState(false); const [two, setTwo] = useState(false);
  const [sigB, setSigB] = useState<string | null>(null); const [sigP, setSigP] = useState<string | null>(null); const [sigP2, setSigP2] = useState<string | null>(null); const [sigD, setSigD] = useState<string | null>(null);
  const [hub, setHub] = useState(false);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState(''); const [note, setNote] = useState('');
  const [sigsL] = useLocal(() => listSigs(insp.id), [insp.id]); const sigs = sigsL ?? [];

  const defects = items.filter(i => i.list === 'deficiency').length;
  const siBad = items.filter(i => i.list === 'si_check' && (i.result === 'wrong' || i.result === 'missing')).length;
  const base = `${appOrigin()}/portal/inspection/`;

  async function finish() {
    setErr('');
    if (isQci && answeredSi < totalSi) return setErr(`${totalSi - answeredSi} line${totalSi - answeredSi === 1 ? ' is' : 's are'} not answered yet. Mark each OK, Wrong, Missing or N/A.`);
    if (!inspector.trim()) return setErr('Enter the builder representative name.');
    if (!sigB) return setErr('The builder representative needs to sign.');
    if (!superName.trim() || !/.+@.+\..+/.test(superEmail)) return setErr('Enter the superintendent name and email so the findings reach construction.');
    if (!isQci) {
      if (!poss) return setErr('Confirm the date of possession.');
      if (present) {
        if (!hub) return setErr('Tick the box to confirm the home was inspected and the Learning Hub was explained.');
        if (!useDesignate && (!pName.trim() || !sigP)) return setErr('The purchaser needs to enter their name and sign.');
        if (useDesignate && (!dName.trim() || !sigD)) return setErr('The designate needs to enter their name and sign.');
        if (two && (!p2Name.trim() || !sigP2)) return setErr('The second purchaser needs to enter their name and sign.');
      } else if (!absent.trim()) return setErr('Note the efforts made to have the purchaser attend.');
    }
    setBusy(true);
    try {
      const rows = [{ role: 'builder', name: inspector.trim(), signature: sigB }] as { role: string; name: string; signature: string }[];
      if (!isQci && present) {
        if (useDesignate) rows.push({ role: 'designate', name: dName.trim(), signature: sigD! }); else rows.push({ role: 'purchaser', name: pName.trim(), signature: sigP! });
        if (two) rows.push({ role: 'purchaser2', name: p2Name.trim(), signature: sigP2! });
      }
      for (const r of rows) await putSig(insp, r.role, r.name, r.signature);
      await finishInspection(insp, {
        inspector_name: inspector.trim(), super_name: superName.trim(), super_email: superEmail.trim(), notes: notes.trim() || null,
        possession_date: poss || null, purchaser_present: isQci ? true : present, absent_note: !isQci && !present ? absent.trim() : null,
      });
      try { localStorage.setItem('bg-super-name', superName.trim()); localStorage.setItem('bg-super-email', superEmail.trim()); } catch { /* ignore */ }
      setNote(navigator.onLine ? 'Signed and saved. Sending the PDF and test email now.' : 'Signed and saved on this phone. It sends automatically as soon as you have signal. You do not need to do anything.');
    } catch (e: any) { setErr(e.message ?? 'Could not sign'); } finally { setBusy(false); }
  }

  async function openPdf() {
    if (!insp.pdf_path) return; if (!navigator.onLine) { setNote('Connect to the internet to open the PDF.'); return; } const { data } = await supabase.storage.from('inspection-photos').createSignedUrl(insp.pdf_path, 600); if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }
  const copy = (t: string) => navigator.clipboard?.writeText(t).then(() => setNote('Link copied.'));

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={card}>
        <div style={{ fontWeight: 800, marginBottom: 6 }}>Summary</div>
        <div style={{ fontSize: 14.5, lineHeight: 1.6 }}>
          {isQci ? <>Lines checked: <b>{answeredSi}/{totalSi}</b> · Not as specified: <b>{siBad}</b> · Observed defects: <b>{defects}</b></>
            : <>Items to be completed: <b>{defects}</b></>}
          <br />Photos: <b>{photos.length}</b>
        </div>
      </div>

      {editable ? (
        <>
          <div style={{ ...card, display: 'grid', gap: 8 }}>
            <label style={{ fontWeight: 700, fontSize: 13 }}>Builder representative</label>
            <input style={inp} value={inspector} onChange={e => setInspector(e.target.value)} placeholder="Name" />
            <label style={{ fontWeight: 700, fontSize: 13 }}>Superintendent (receives the findings)</label>
            <input style={inp} value={superName} onChange={e => setSuperName(e.target.value)} placeholder="Name" />
            <input style={inp} value={superEmail} onChange={e => setSuperEmail(e.target.value)} placeholder="Email" inputMode="email" autoCapitalize="none" />
            {!isQci && (<><label style={{ fontWeight: 700, fontSize: 13 }}>Date of possession</label><input type="date" style={inp} value={poss} onChange={e => setPoss(e.target.value)} /></>)}
            <label style={{ fontWeight: 700, fontSize: 13 }}>Notes (optional)</label>
            <textarea style={{ ...inp, minHeight: 70, padding: 10 }} value={notes} onChange={e => setNotes(e.target.value)} />
          </div>

          <div style={{ ...card, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 800 }}>Builder signature</div>
            <SignaturePad onChange={setSigB} />
          </div>

          {!isQci && (
            <div style={{ ...card, display: 'grid', gap: 10 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44, fontWeight: 700 }}><input type="checkbox" checked={present} onChange={e => setPresent(e.target.checked)} style={{ width: 22, height: 22 }} /> Purchaser or designate is here</label>
              {present ? (
                <>
                  <div style={{ fontSize: 13.5, color: '#485163', fontStyle: 'italic' }}>“I have inspected my new home and I agree that the descriptions of the items listed on this form are accurate.”</div>
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, minHeight: 40, fontSize: 13.5, lineHeight: 1.4 }}><input type="checkbox" checked={hub} onChange={e => setHub(e.target.checked)} style={{ width: 22, height: 22, flex: '0 0 auto' }} /> I / We the undersigned Purchaser(s) certify that the above referenced unit has been physically inspected by myself / ourselves and the builder has advised that the Tarion Homeowner's Learning Hub can be accessed at tarion.com/homeowners/learning-hub</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, fontSize: 14 }}><input type="checkbox" checked={useDesignate} onChange={e => setUseDesignate(e.target.checked)} style={{ width: 20, height: 20 }} /> A designate is signing (needs the owner's written authority)</label>
                  {!useDesignate ? (<><input style={inp} value={pName} onChange={e => setPName(e.target.value)} placeholder="Purchaser name" /><SignaturePad onChange={setSigP} /></>)
                    : (<><input style={inp} value={dName} onChange={e => setDName(e.target.value)} placeholder="Designate name" /><SignaturePad onChange={setSigD} /></>)}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 40, fontSize: 14 }}><input type="checkbox" checked={two} onChange={e => setTwo(e.target.checked)} style={{ width: 20, height: 20 }} /> A second purchaser is signing</label>
                  {two && (<><input style={inp} value={p2Name} onChange={e => setP2Name(e.target.value)} placeholder="Second purchaser name" /><SignaturePad onChange={setSigP2} /></>)}
                </>
              ) : (
                <textarea style={{ ...inp, minHeight: 80, padding: 10 }} value={absent} onChange={e => setAbsent(e.target.value)} placeholder="Efforts made to have the purchaser attend (also note this on the CCP)" />
              )}
            </div>
          )}
          {err && <div style={{ color: '#A5402F', fontSize: 14, fontWeight: 600 }}>{err}</div>}
          <button onClick={finish} disabled={busy} style={{ ...big('linear-gradient(180deg,#B8975A,#8D7140)'), minHeight: 56, fontSize: 16 }}>{busy ? 'Signing…' : 'Sign and finish'}</button>
          <div style={{ fontSize: 12.5, color: '#6C7280' }}>Once signed, the findings and photos cannot be changed.</div>
        </>
      ) : (
        <>
          <div style={{ ...card, display: 'grid', gap: 10 }}>
            <div style={{ fontWeight: 800 }}>Signatures</div>
            {sigs.map(s => (<div key={s.role}><div style={{ fontSize: 12.5, color: '#485163' }}>{s.role === 'builder' ? 'Builder representative' : s.role === 'designate' ? 'Designate' : 'Purchaser'}: <b>{s.name}</b></div><img src={s.signature} alt="Signature" style={{ height: 70, background: '#fff', border: '1px solid #D9D2C5', borderRadius: 6 }} /></div>))}
            {!insp.purchaser_present && <div style={{ fontSize: 13.5 }}>Purchaser absent. {insp.absent_note}</div>}
          </div>
          {!insp.pdf_path && <div style={{ ...card, fontSize: 13.5, borderLeft: '4px solid #B08D4F' }}>{online ? 'Sending the PDF and emails…' : 'Saved on this phone. The PDF, emails and the update to the office system go out automatically when you have signal.'}</div>}
          {insp.pdf_path && <button onClick={openPdf} style={big(NAVY)}><FileText size={17} /> Open the {isQci ? 'QCI report' : 'PDI form'} (PDF)</button>}
          <div style={{ ...card, display: 'grid', gap: 8 }}>
            <div style={{ fontWeight: 800 }}>Share</div>
            <button onClick={() => copy(base + insp.super_token)} style={big('#F8F6F1', NAVY, '1px solid #B9AF9B')}><Copy size={16} /> Copy superintendent link</button>
            {!isQci && <button onClick={() => copy(base + insp.owner_token)} style={big('#F8F6F1', NAVY, '1px solid #B9AF9B')}><Copy size={16} /> Copy owner link</button>}
            <a href={base + insp.super_token} target="_blank" rel="noreferrer" style={{ color: '#2F5576', fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><ExternalLink size={15} /> Preview what the superintendent sees</a>
          </div>
          {!isQci && (
            <div style={{ ...card, fontSize: 13.5, lineHeight: 1.5 }}>
              <b>Next:</b> complete the CCP and Warranty Certificate on the PDI date and submit them to Tarion through BuilderLink within 15 days of possession. The builder keeps a copy of this form and gives one to the owner.
            </div>
          )}
        </>
      )}
      {note && <div style={{ ...card, color: '#2F5576', fontSize: 14 }}>{note}</div>}
    </div>
  );
}
