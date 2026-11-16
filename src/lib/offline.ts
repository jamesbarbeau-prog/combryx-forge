// Offline-first store and automatic sync for the Field app.
// Every change is written to this phone first (IndexedDB) and queued. A background sync sends the queue as soon as there is signal,
// in order, and retries by itself. Nothing is ever lost because someone forgot to sync, and signing out never deletes pending work.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { compressImage, type InspItem, type InspPhoto, type Inspection, type LotDoc, type SiLine } from '@/lib/inspections';

export interface LocalPhoto { id: string; company_id: string; inspection_id: string; item_id: string | null; storage_path: string; kind: 'finding' | 'closing'; blob?: Blob; uploaded: boolean; created_at: string }
export interface LocalSig { key: string; id: string; company_id: string; inspection_id: string; role: string; name: string | null; signature: string; signed_at: string }
export interface LocalLot { lot_id: string; hit: Record<string, any>; detail: Record<string, any> | null; lines: SiLine[]; docs: LotDoc[]; saved_at: string }
export interface Op { seq?: number; type: string; payload: any; tries: number; error?: string; parked?: boolean; at: string }

interface Schema extends DBSchema {
  inspections: { key: string; value: Inspection & { _synced?: boolean } };
  items: { key: string; value: InspItem & { company_id: string }; indexes: { by_insp: string } };
  photos: { key: string; value: LocalPhoto; indexes: { by_insp: string } };
  sigs: { key: string; value: LocalSig; indexes: { by_insp: string } };
  lots: { key: string; value: LocalLot };
  outbox: { key: number; value: Op };
  kv: { key: string; value: any };
}

let _db: Promise<IDBPDatabase<Schema>> | null = null;
function db() {
  if (!_db) _db = openDB<Schema>('bg-field', 1, {
    upgrade(d) {
      d.createObjectStore('inspections', { keyPath: 'id' });
      d.createObjectStore('items', { keyPath: 'id' }).createIndex('by_insp', 'inspection_id');
      d.createObjectStore('photos', { keyPath: 'id' }).createIndex('by_insp', 'inspection_id');
      d.createObjectStore('sigs', { keyPath: 'key' }).createIndex('by_insp', 'inspection_id');
      d.createObjectStore('lots', { keyPath: 'lot_id' });
      d.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
      d.createObjectStore('kv');
    },
  });
  return _db;
}

// ── change notifications ──
const bus = new EventTarget();
const changed = () => bus.dispatchEvent(new Event('change'));
export function useLocal<T>(loader: () => Promise<T>, deps: unknown[] = []): [T | undefined, boolean] {
  const [v, setV] = useState<T | undefined>(undefined); const [ready, setReady] = useState(false); const seq = useRef(0);
  useEffect(() => {
    let live = true; const run = async () => { const my = ++seq.current; try { const r = await loader(); if (live && my === seq.current) { setV(r); setReady(true); } } catch { /* ignore */ } };
    run(); bus.addEventListener('change', run);
    return () => { live = false; bus.removeEventListener('change', run); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return [v, ready];
}

const uid = () => crypto.randomUUID();
const isNetErr = (e: any) => { const m = String(e?.message ?? e ?? '').toLowerCase(); return !navigator.onLine || e instanceof TypeError || /failed to fetch|network|load failed|fetch|timeout|offline|502|503|504/.test(m) || e?.name === 'FunctionsFetchError' || e?.name === 'AuthRetryableFetchError'; };

// ── outbox ──
async function enqueue(type: string, payload: any) { const d = await db(); await d.add('outbox', { type, payload, tries: 0, at: new Date().toISOString() }); changed(); scheduleSync(500); }
async function pendingOps() { return (await (await db()).getAll('outbox')); }

// ── inspections ──
export async function getInsp(id: string): Promise<Inspection | undefined> {
  if (!id) return undefined;
  const d = await db(); const local = await d.get('inspections', id); if (local) return local;
  if (!navigator.onLine) return undefined;
  const { data } = await supabase.from('inspections').select('*').eq('id', id).maybeSingle(); if (!data) return undefined;
  const [it, ph, sg] = await Promise.all([
    supabase.from('inspection_items').select('*').eq('inspection_id', id),
    supabase.from('inspection_photos').select('id,company_id,inspection_id,item_id,storage_path,kind,created_at').eq('inspection_id', id),
    supabase.from('inspection_signatures').select('*').eq('inspection_id', id),
  ]);
  const tx = d.transaction(['inspections', 'items', 'photos', 'sigs'], 'readwrite');
  await tx.objectStore('inspections').put({ ...(data as any), _synced: true });
  for (const i of (it.data ?? []) as any[]) await tx.objectStore('items').put(i);
  for (const p of (ph.data ?? []) as any[]) await tx.objectStore('photos').put({ ...p, uploaded: true });
  for (const s of (sg.data ?? []) as any[]) await tx.objectStore('sigs').put({ ...s, key: `${s.inspection_id}:${s.role}` });
  await tx.done; changed(); return data as unknown as Inspection;
}
export async function listInspections(): Promise<(Inspection & { _synced?: boolean })[]> { const l = await (await db()).getAll('inspections'); return l.filter(i => i.status !== 'cancelled').sort((a, b) => b.started_at.localeCompare(a.started_at)); }
export const listItems = async (id: string) => ((await (await db()).getAllFromIndex('items', 'by_insp', id)) as InspItem[]).sort((a, b) => a.seq - b.seq);
export const listPhotos = async (id: string) => (await (await db()).getAllFromIndex('photos', 'by_insp', id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
export const listSigs = async (id: string) => (await db()).getAllFromIndex('sigs', 'by_insp', id);

const INSP_FIELDS = ['id', 'company_id', 'lot_id', 'kind', 'status', 'inspector_id', 'inspector_name', 'started_at', 'address', 'enrolment_no', 'possession_date', 'super_name', 'super_email', 'owner_names', 'owner_emails', 'purchaser_present', 'absent_note', 'checklist', 'notes'] as const;
const pick = (o: any, keys: readonly string[]) => Object.fromEntries(keys.filter(k => k in o).map(k => [k, o[k]]));

export async function createInspection(row: Partial<Inspection> & { company_id: string; kind: 'qci' | 'pdi' }): Promise<Inspection> {
  const full = { id: uid(), status: 'in_progress', purchaser_present: true, checklist: {}, owner_emails: [], started_at: new Date().toISOString(), super_token: uid(), owner_token: uid(), pdf_path: null, completed_at: null, absent_note: null, notes: null, ...row } as unknown as Inspection;
  await (await db()).put('inspections', { ...full, _synced: false });
  await enqueue('insp_upsert', { row: pick(full, INSP_FIELDS), tokens: { super_token: full.super_token, owner_token: full.owner_token } });
  return full;
}
export async function patchInsp(id: string, patch: Partial<Inspection>) {
  const d = await db(); const cur = await d.get('inspections', id); if (!cur) return;
  await d.put('inspections', { ...cur, ...patch });
  const ops = (await pendingOps()).filter(o => o.type === 'insp_patch' && o.payload.id === id && !o.parked);
  const last = ops[ops.length - 1];
  const hasLater = last && (await pendingOps()).some(o => o.seq! > last.seq! && ['finish', 'send'].includes(o.type) && o.payload.id === id);
  if (last && !hasLater) { await d.put('outbox', { ...last, payload: { id, patch: { ...last.payload.patch, ...patch } } }); changed(); scheduleSync(500); } else await enqueue('insp_patch', { id, patch });
  changed();
}

// ── items ──
const ITEM_FIELDS = ['id', 'company_id', 'inspection_id', 'seq', 'list', 'source', 'room', 'description', 'note', 'ref_line_id', 'result'] as const;
export async function putItem(row: Partial<InspItem> & { company_id: string; inspection_id: string; description: string }): Promise<InspItem> {
  const d = await db(); const cur = row.id ? await d.get('items', row.id) : undefined;
  const full = { id: uid(), seq: 0, list: 'deficiency', source: 'observed', room: null, note: null, ref_line_id: null, result: null, res_status: 'open', res_note: null, res_at: null, res_by: null, ...cur, ...row } as any;
  await d.put('items', full);
  const ops = (await pendingOps()).filter(o => o.type === 'item_upsert' && o.payload.row.id === full.id && !o.parked);
  if (ops.length) { await d.put('outbox', { ...ops[ops.length - 1], payload: { row: pick(full, ITEM_FIELDS) } }); changed(); scheduleSync(500); } else await enqueue('item_upsert', { row: pick(full, ITEM_FIELDS) });
  return full;
}
export async function putItems(rows: (Partial<InspItem> & { company_id: string; inspection_id: string; description: string })[]) { for (const r of rows) await putItem(r); }
export async function removeItem(id: string) {
  const d = await db(); const photos = (await d.getAll('photos')).filter(p => p.item_id === id);
  const ops = await pendingOps();
  for (const o of ops) if ((o.type === 'item_upsert' && o.payload.row.id === id) || (o.type === 'photo_upload' && photos.some(p => p.id === o.payload.id))) await d.delete('outbox', o.seq!);
  for (const p of photos) await d.delete('photos', p.id);
  await d.delete('items', id); await enqueue('item_delete', { id });
}

// ── photos ──
export async function addPhoto(insp: Inspection, itemId: string | null, file: File | Blob): Promise<LocalPhoto> {
  const blob = await compressImage(file as File); const id = uid();
  const row: LocalPhoto = { id, company_id: insp.company_id, inspection_id: insp.id, item_id: itemId, storage_path: `${insp.company_id}/${insp.id}/${id}.jpg`, kind: 'finding', blob, uploaded: false, created_at: new Date().toISOString() };
  await (await db()).put('photos', row); await enqueue('photo_upload', { id }); return row;
}
export async function removePhoto(id: string) {
  const d = await db(); const p = await d.get('photos', id); if (!p) return;
  for (const o of await pendingOps()) if (o.type === 'photo_upload' && o.payload.id === id) await d.delete('outbox', o.seq!);
  await d.delete('photos', id); if (p.uploaded) await enqueue('photo_delete', { id, path: p.storage_path }); else changed();
}
const urlCache = new Map<string, string>();
export function usePhotoUrls(photos: LocalPhoto[] | undefined): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  useEffect(() => {
    let live = true; const out: Record<string, string> = {}; const need: LocalPhoto[] = [];
    for (const p of photos ?? []) { if (p.blob) { if (!urlCache.has(p.id)) urlCache.set(p.id, URL.createObjectURL(p.blob)); out[p.id] = urlCache.get(p.id)!; } else need.push(p); }
    setUrls({ ...out });
    if (need.length && navigator.onLine) supabase.storage.from('inspection-photos').createSignedUrls(need.map(p => p.storage_path), 3600).then(({ data }) => {
      if (!live) return; const m = { ...out }; (data ?? []).forEach((s, i) => { if (s.signedUrl) m[need[i].id] = s.signedUrl; }); setUrls(m);
    });
    return () => { live = false; };
  }, [photos]);
  return urls;
}

// ── signatures and finishing ──
export async function putSig(insp: Inspection, role: string, name: string, signature: string) {
  const d = await db(); const key = `${insp.id}:${role}`; const cur = await d.get('sigs', key);
  const row: LocalSig = { key, id: cur?.id ?? uid(), company_id: insp.company_id, inspection_id: insp.id, role, name, signature, signed_at: new Date().toISOString() };
  await d.put('sigs', row);
  for (const o of await pendingOps()) if (o.type === 'sig_upsert' && o.payload.key === key) await d.delete('outbox', o.seq!);
  await enqueue('sig_upsert', { key });
}
export async function finishInspection(insp: Inspection, patch: Partial<Inspection>) {
  const d = await db(); const done = { ...patch, status: 'signed' as const, completed_at: new Date().toISOString() };
  await d.put('inspections', { ...insp, ...done });
  await enqueue('finish', { id: insp.id, patch: pick({ ...insp, ...done }, ['inspector_name', 'super_name', 'super_email', 'notes', 'possession_date', 'purchaser_present', 'absent_note', 'checklist', 'status', 'completed_at']) });
}

// ── lots cached for working without signal ──
export async function cacheLot(hit: Record<string, any>): Promise<LocalLot | undefined> {
  if (!navigator.onLine) return (await db()).get('lots', hit.lot_id);
  const [det, lines, docs] = await Promise.all([
    supabase.from('warranty_lots').select('address,civic_number,street,enrollment_number,closing_date,possession_date,homeowner_name,homeowner_first,homeowner_last,owner2_first,owner2_last,homeowner_email,homeowner_email2').eq('id', hit.lot_id).maybeSingle(),
    supabase.from('lot_si_lines').select('id,lot_id,kind,ref,text,sort').eq('lot_id', hit.lot_id).order('sort'),
    supabase.from('lot_documents').select('id,lot_id,kind,title,url').eq('lot_id', hit.lot_id).order('created_at'),
  ]);
  if (det.error) return (await db()).get('lots', hit.lot_id);
  const row: LocalLot = { lot_id: hit.lot_id, hit, detail: det.data as any, lines: (lines.data ?? []) as SiLine[], docs: (docs.data ?? []) as LotDoc[], saved_at: new Date().toISOString() };
  await (await db()).put('lots', row); changed(); return row;
}
export const getCachedLot = async (id: string) => (await db()).get('lots', id);
export const listCachedLots = async () => (await (await db()).getAll('lots')).sort((a, b) => String(a.hit.address ?? '').localeCompare(String(b.hit.address ?? '')));
export async function dropLot(id: string) { await (await db()).delete('lots', id); changed(); }

// ── sync engine ──
let running = false, timer: ReturnType<typeof setTimeout> | null = null, lastError = '';
const state = { syncing: false, lastSync: null as string | null, signedIn: true };

export function scheduleSync(ms = 800) { if (timer) clearTimeout(timer); timer = setTimeout(() => { timer = null; syncNow(); }, ms); }

async function runOp(op: Op) {
  const p = op.payload; const d = await db();
  switch (op.type) {
    case 'insp_upsert': { const { error } = await supabase.from('inspections').upsert({ ...p.row, ...p.tokens }, { onConflict: 'id', ignoreDuplicates: false }); if (error) throw error; const cur = await d.get('inspections', p.row.id); if (cur) await d.put('inspections', { ...cur, _synced: true }); break; }
    case 'insp_patch': { const { error } = await supabase.from('inspections').update(p.patch).eq('id', p.id); if (error) throw error; break; }
    case 'item_upsert': { const { error } = await supabase.from('inspection_items').upsert(p.row, { onConflict: 'id' }); if (error) throw error; break; }
    case 'item_delete': {
      const { data: ph } = await supabase.from('inspection_photos').select('storage_path').eq('item_id', p.id);
      if (ph?.length) await supabase.storage.from('inspection-photos').remove(ph.map(x => x.storage_path));
      const { error } = await supabase.from('inspection_items').delete().eq('id', p.id); if (error) throw error; break;
    }
    case 'photo_upload': {
      const row = await d.get('photos', p.id); if (!row || !row.blob) return; // removed meanwhile
      const up = await supabase.storage.from('inspection-photos').upload(row.storage_path, row.blob, { contentType: 'image/jpeg', upsert: true }); if (up.error) throw up.error;
      const { error } = await supabase.from('inspection_photos').upsert({ id: row.id, company_id: row.company_id, inspection_id: row.inspection_id, item_id: row.item_id, storage_path: row.storage_path, kind: row.kind }, { onConflict: 'id' }); if (error) throw error;
      await d.put('photos', { ...row, uploaded: true }); break;
    }
    case 'photo_delete': { await supabase.storage.from('inspection-photos').remove([p.path]); const { error } = await supabase.from('inspection_photos').delete().eq('id', p.id); if (error) throw error; break; }
    case 'sig_upsert': {
      const s = await d.get('sigs', p.key); if (!s) return;
      const { error } = await supabase.from('inspection_signatures').upsert({ id: s.id, company_id: s.company_id, inspection_id: s.inspection_id, role: s.role, name: s.name, signature: s.signature, signed_at: s.signed_at }, { onConflict: 'inspection_id,role' }); if (error) throw error; break;
    }
    case 'finish': {
      const { error } = await supabase.from('inspections').update(p.patch).eq('id', p.id); if (error) throw error;
      await d.add('outbox', { type: 'send', payload: { id: p.id }, tries: 0, at: new Date().toISOString() }); break;
    }
    case 'send': {
      const { data, error } = await supabase.functions.invoke('inspection-send', { body: { inspection_id: p.id } });
      if (error) { const ctx = (error as any).context; if (ctx && typeof ctx.status === 'number' && ctx.status >= 400 && ctx.status < 500) throw new Error('send rejected: ' + ctx.status); throw error; }
      if ((data as any)?.error) throw new Error((data as any).error);
      const { data: fresh } = await supabase.from('inspections').select('status,pdf_path,sent_at').eq('id', p.id).maybeSingle();
      const cur = await d.get('inspections', p.id); if (cur && fresh) await d.put('inspections', { ...cur, ...(fresh as any) }); break;
    }
    default: break;
  }
}

export async function syncNow(): Promise<void> {
  if (running || !navigator.onLine) return;
  const { data: { session } } = await supabase.auth.getSession();
  state.signedIn = !!session; if (!session) { changed(); return; }
  running = true; state.syncing = true; changed();
  try {
    const d = await db();
    for (;;) {
      const ops = (await d.getAll('outbox')).filter(o => !o.parked); const op = ops[0]; if (!op) break;
      try { await runOp(op); await d.delete('outbox', op.seq!); }
      catch (e: any) {
        if (isNetErr(e)) { lastError = 'Waiting for signal'; scheduleSync(15000); break; }
        await d.put('outbox', { ...op, tries: op.tries + 1, parked: true, error: String(e?.message ?? e).slice(0, 200) }); lastError = String(e?.message ?? e);
      }
      changed();
    }
    state.lastSync = new Date().toISOString();
  } finally { running = false; state.syncing = false; changed(); }
}

export async function retryParked() { const d = await db(); for (const o of await d.getAll('outbox')) if (o.parked) await d.put('outbox', { ...o, parked: false, error: undefined }); changed(); scheduleSync(100); }
export async function dropParked() { const d = await db(); for (const o of await d.getAll('outbox')) if (o.parked) await d.delete('outbox', o.seq!); changed(); }

/** Free phone storage: photos of inspections that finished and sent more than a week ago keep their record but drop the local image. */
export async function tidyOld() {
  const d = await db(); const old = Date.now() - 7 * 864e5; const sent = (await d.getAll('inspections')).filter(i => i.status === 'sent' && i.completed_at && new Date(i.completed_at).getTime() < old);
  const pend = new Set((await d.getAll('outbox')).map(o => o.payload?.id).filter(Boolean));
  for (const i of sent) for (const p of await d.getAllFromIndex('photos', 'by_insp', i.id)) if (p.blob && p.uploaded && !pend.has(p.id)) await d.put('photos', { ...p, blob: undefined });
}

export interface SyncStatus { pending: number; parked: number; syncing: boolean; online: boolean; signedIn: boolean; lastSync: string | null; error: string; parkedMsgs: string[] }
export function useSyncStatus(): SyncStatus {
  const [online, setOnline] = useState(navigator.onLine);
  const [s] = useLocal(async () => { const ops = await pendingOps(); return { pending: ops.filter(o => !o.parked).length, parked: ops.filter(o => o.parked).length, parkedMsgs: ops.filter(o => o.parked).map(o => o.error ?? ''), syncing: state.syncing, signedIn: state.signedIn, lastSync: state.lastSync }; }, []);
  useEffect(() => { const on = () => { setOnline(true); scheduleSync(300); }, off = () => setOnline(false); window.addEventListener('online', on); window.addEventListener('offline', off); return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); }; }, []);
  return { pending: s?.pending ?? 0, parked: s?.parked ?? 0, parkedMsgs: s?.parkedMsgs ?? [], syncing: s?.syncing ?? false, online, signedIn: s?.signedIn ?? true, lastSync: s?.lastSync ?? null, error: lastError };
}

/** Starts the automatic sync loop: on launch, when signal returns, when the app comes to the front, on sign-in, and every 20 seconds. */
let started = false;
export function startAutoSync() {
  if (started) return; started = true;
  const kick = () => scheduleSync(200);
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  supabase.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' || ev === 'TOKEN_REFRESHED') kick(); });
  setInterval(() => { if (navigator.onLine) syncNow(); }, 20000);
  kick(); tidyOld().catch(() => undefined);
}

export async function unsyncedCount() { return (await pendingOps()).length; }
export type { InspPhoto };
