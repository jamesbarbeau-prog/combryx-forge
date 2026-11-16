// Shared bits for the QCI / PDI field inspections.
import { supabase } from '@/lib/supabase';
import { getCompanyId } from '@/lib/company';

export type Kind = 'qci' | 'pdi';
export type ListKey = 'deficiency' | 'substitution' | 'not_assessed' | 'si_check';

export interface Inspection {
  id: string; company_id: string; lot_id: string | null; kind: Kind; status: 'in_progress' | 'signed' | 'sent' | 'cancelled';
  inspector_name: string | null; address: string | null; enrolment_no: string | null; possession_date: string | null;
  super_name: string | null; super_email: string | null; owner_names: string | null; owner_emails: string[];
  purchaser_present: boolean; absent_note: string | null; checklist: Record<string, 'ok' | 'issue' | 'na'>; notes: string | null;
  pdf_path: string | null; super_token: string; owner_token: string; started_at: string; completed_at: string | null;
}
export interface InspItem {
  id: string; inspection_id: string; seq: number; list: ListKey; source: 'observed' | 'site_instruction' | 'selection' | 'upgrade';
  room: string | null; description: string; note: string | null; ref_line_id: string | null; result: 'ok' | 'wrong' | 'missing' | 'na' | null;
  res_status: 'open' | 'fixed' | 'verified' | 'not_required'; res_note: string | null; res_at: string | null; res_by: string | null;
}
export interface InspPhoto { id: string; item_id: string | null; storage_path: string }
export interface SiLine { id: string; lot_id: string; kind: 'site_instruction' | 'selection' | 'upgrade'; ref: string | null; text: string; sort: number }
export interface LotDoc { id: string; lot_id: string; kind: 'site_instructions' | 'selections' | 'other'; title: string; url: string | null }

// Tarion's standard Pre-Delivery Inspection form, "Minimum Checklist" (PDI Form 1.0, Jan 2021). Wording follows the form; confirm against the current official copy.
export const PDI_CHECKLIST: string[] = [
  'Windows, sidelights and other glazing',
  'Window and door screens',
  'Windows, interior and exterior doors (including garage overhead door)',
  'Door locks',
  'Bathtubs, sinks and toilets',
  'Faucets: kitchen, bathroom, laundry room',
  'Bathroom accessories (if provided)',
  'Exhaust fans: kitchen and bathrooms (if provided)',
  'Mirrors, countertops and cabinetry',
  'Electrical outlets and fixtures',
  'Flooring (hardwood, vinyl, ceramic tile, carpet)',
  'Gas fireplaces, including circulation fans (if provided)',
  'Interior finishes and trim carpentry',
  'Heat Recovery Ventilation system (if provided)',
  'Furnace',
  'Heating system',
  'Hot water heater (if provided, not a rental)',
  'Exterior finishes, driveways, walkways, decks and landscaping (confirm completion)',
  'Air conditioning system (if provided and conditions permit)',
];

export const ROOMS = ['Exterior', 'Garage', 'Porch / Entry', 'Foyer', 'Kitchen', 'Great room', 'Dining', 'Powder room', 'Mudroom / Laundry', 'Stairs / Hall', 'Primary bedroom', 'Ensuite', 'Bedroom 2', 'Bedroom 3', 'Bedroom 4', 'Main bath', 'Basement', 'Mechanical', 'Roof / Attic'];

export const LIST_LABEL: Record<ListKey, string> = { deficiency: 'Defects', substitution: 'Substitutions', not_assessed: 'Not assessed', si_check: 'Site instructions' };
export const SRC_LABEL: Record<string, string> = { observed: 'Observed', site_instruction: 'Site instruction', selection: 'Selection', upgrade: 'Upgrade' };

export const INSP_COLS = 'id,company_id,lot_id,kind,status,inspector_name,address,enrolment_no,possession_date,super_name,super_email,owner_names,owner_emails,purchaser_present,absent_note,checklist,notes,pdf_path,super_token,owner_token,started_at,completed_at';

/** Shrink a phone photo to something that uploads fast on a bad connection. */
export async function compressImage(file: File, max = 1600, quality = 0.76): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob: Blob | null = await new Promise(res => c.toBlob(res, 'image/jpeg', quality));
    return blob ?? file;
  } catch { return file; }
}

export async function uploadPhoto(inspectionId: string, itemId: string | null, file: File): Promise<InspPhoto> {
  const companyId = await getCompanyId();
  const blob = await compressImage(file);
  const path = `${companyId}/${inspectionId}/${crypto.randomUUID()}.jpg`;
  const up = await supabase.storage.from('inspection-photos').upload(path, blob, { contentType: 'image/jpeg' });
  if (up.error) throw up.error;
  const { data, error } = await supabase.from('inspection_photos').insert({ company_id: companyId, inspection_id: inspectionId, item_id: itemId, storage_path: path }).select('id,item_id,storage_path').single();
  if (error) { await supabase.storage.from('inspection-photos').remove([path]); throw error; }
  return data as InspPhoto;
}

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data } = await supabase.storage.from('inspection-photos').createSignedUrls(paths, 3600);
  const out: Record<string, string> = {};
  (data ?? []).forEach(d => { if (d.path && d.signedUrl) out[d.path] = d.signedUrl; });
  return out;
}

export async function loadLotSource(lotId: string): Promise<{ docs: LotDoc[]; lines: SiLine[] }> {
  const [d, l] = await Promise.all([
    supabase.from('lot_documents').select('id,lot_id,kind,title,url').eq('lot_id', lotId).order('created_at'),
    supabase.from('lot_si_lines').select('id,lot_id,kind,ref,text,sort').eq('lot_id', lotId).order('sort'),
  ]);
  return { docs: (d.data ?? []) as LotDoc[], lines: (l.data ?? []) as SiLine[] };
}

/** Make the QCI lines ready to tick: one inspection item per source line (only the ones not already added). */
export async function seedSiChecks(insp: Inspection, lines: SiLine[], existing: InspItem[]) {
  const have = new Set(existing.filter(i => i.list === 'si_check').map(i => i.ref_line_id));
  const fresh = lines.filter(l => !have.has(l.id));
  if (!fresh.length) return;
  const base = existing.filter(i => i.list === 'si_check').length;
  const { error } = await supabase.from('inspection_items').insert(fresh.map((l, n) => ({
    company_id: insp.company_id, inspection_id: insp.id, seq: base + n + 1, list: 'si_check', source: l.kind,
    description: (l.ref ? `${l.ref}: ` : '') + l.text, ref_line_id: l.id,
  })));
  if (error) throw error;
}

export const fmtDate = (s: string | null | undefined) => s ? new Date(s.length === 10 ? s + 'T12:00:00' : s).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
