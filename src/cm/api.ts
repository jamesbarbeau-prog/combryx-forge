// Conciliation Manager data layer (Supabase). Mirrors the Apps Script API surface.
import { supabase } from '@/lib/supabase';

export interface CmCase {
  id: string; company_id: string; case_number: string; homeowner: string; address: string; lot: string; community: string;
  enrolment: string; form_type: string; status: string; property_type: 'freehold' | 'common_elements';
  supervisor: string; supervisor_email: string; coordinator_email: string; owner_email: string; owner_phone: string;
  possession_date: string | null; box_link: string; notes: string; offer_prepared_on: string | null;
  manager_status: string; closure_reason: string; manager_stage: string; claim_booked_on: string | null;
  claim_outcome: string; claim_amount: number; total_builder_exposure: number; lot_id: string | null;
  np_url: string; inspector: string; is_closed: boolean;
}
export interface CmCycle {
  id: string; case_id: string; seq: number; of_total: number; type: string; inspection_date: string | null; inspection_time: string;
  car_received_on: string | null; closed_on: string | null; notes: string; offer_prepared_on: string | null;
  stage: 'Scheduled' | 'Awaiting CAR' | 'CAR Received' | 'Closed'; superseded: boolean; car_due: string | null;
  days_to_insp: number | null; days_left: number | null; total: number; open_items: number; warranted: number;
  not_warranted: number; not_assessed: number; unscheduled: number; verified: number; priced: number; priced_amt: number;
  pending: number; pending_amt: number; settled: number; settled_amt: number; rb04: number; exceptions: number; internal_estimate_amt: number;
}
export interface CmItem {
  id: string; case_id: string; item_number: number; description: string; original_note: string; likelihood: string;
  internal_estimate: number; trade: string; scope: string; offer_amount: number; exception: string; status: string; last_action: string;
  car_outcome: string; car_notes: string; car_date: string | null; scheduled_on: string | null; completed_on: string | null;
  verified_on: string | null; cpg: string; room: string; category: string; resolution_method: string;
  resolution_status: '' | 'Pending' | 'Settled'; tarion_analysis: string; cycle_id: string | null; investigation_cycle_id: string | null;
}
export interface CmBatch {
  id: string; case_id: string; kind: 'full' | 'selected'; item_numbers: string; base_total: number | null; calculated_total: number | null;
  negotiated_total: number | null; final_total: number; decision: 'OFFERED' | 'ACCEPTED' | 'DECLINED'; signed_release_ref: string;
  created_at: string; reason: string;
}
export interface CmComm { id: string; occurred_at: string; type: string; by_name: string; summary: string }
export interface CmIntake {
  id: string; case_number: string; proposed_action: string; reason: string; status: string; auto_applied: boolean;
  created_at: string; payload: Record<string, unknown>; case_id: string | null;
}
export interface Attention { sev: number; caseId: string; label: string; detail: string; days: number; tab: string }

function must<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

export async function myMembership(): Promise<{ company_id: string; role: string } | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from('cm_members').select('company_id, role').eq('user_id', user.id).limit(1).maybeSingle();
  return data ?? null;
}

export const createWorkspace = (name: string) => rpc('cm_create_workspace', { p_name: name }) as Promise<string>;
export const listMembers = (companyId: string) => rpc('cm_list_members', { p_company: companyId }) as Promise<{ user_id: string; email: string; role: string }[]>;
export const addMember = (companyId: string, email: string, role: string) => rpc('cm_add_member', { p_company: companyId, p_email: email, p_role: role });
export const reopenCase = (id: string, reason: string) => rpc('cm_reopen_case', { p_case: id, p_reason: reason });
export async function signedDocUrl(path: string) {
  const { data, error } = await supabase.storage.from('cm-documents').createSignedUrl(path, 300);
  if (error) throw new Error(error.message);
  return data.signedUrl;
}

export async function loadDashboard() {
  const [cases, cycles] = await Promise.all([
    supabase.from('cm_case_view').select('*').order('case_number'),
    supabase.from('cm_cycle_view').select('*').order('seq'),
  ]);
  return { cases: must(cases) as CmCase[], cycles: must(cycles) as CmCycle[] };
}

/** Same rules as getDashboard() in Cycles.gs. */
export function buildAttention(cases: CmCase[], cycles: CmCycle[]): Attention[] {
  const byId = new Map(cases.map(c => [c.id, c]));
  const out: Attention[] = [];
  const pl = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
  for (const v of cycles) {
    const cs = byId.get(v.case_id);
    if (!cs || cs.is_closed || v.stage === 'Closed') continue;
    const who = `${cs.homeowner || cs.case_number} — ${cs.address}`;
    const claimBooked = cs.manager_stage === 'CLAIM_BOOKED';
    if (!v.superseded) {
      if (v.stage === 'Scheduled' && v.days_to_insp !== null) {
        if (v.days_to_insp === 0 && !claimBooked) out.push({ sev: 2, caseId: cs.id, tab: 'cycles', label: 'Inspection is today', detail: who, days: 0 });
        else if (v.days_to_insp > 0 && v.days_to_insp <= 7 && !v.offer_prepared_on && !(cs.offer_prepared_on && v.seq === 1))
          out.push({ sev: 1, caseId: cs.id, tab: 'cash', label: `Prepare cash offer — inspection in ${pl(v.days_to_insp, 'day')}`, detail: who, days: v.days_to_insp });
      } else if (v.stage === 'CAR Received' && v.days_left !== null && !claimBooked) {
        const d = `${cs.homeowner || cs.case_number} — ${v.open_items} open, ${v.unscheduled} warranted not scheduled`;
        if (v.days_left < 0) out.push({ sev: 3, caseId: cs.id, tab: 'items', label: `30-day clock overdue by ${pl(Math.abs(v.days_left), 'day')}`, detail: d, days: v.days_left });
        else if (v.days_left <= 7) out.push({ sev: 2, caseId: cs.id, tab: 'items', label: `${pl(v.days_left, 'day')} left on the 30-day clock`, detail: d, days: v.days_left });
        if (v.days_left <= 7 && v.unscheduled > 0)
          out.push({ sev: 3, caseId: cs.id, tab: 'cash', label: `Prepare second cash offer — ${v.unscheduled} item(s) still unscheduled`, detail: who, days: v.days_left });
      }
    }
    if (v.pending > 0 && !claimBooked)
      out.push({ sev: 1, caseId: cs.id, tab: 'cash', label: `${pl(v.pending, 'cash item')} awaiting signature`, detail: `${cs.homeowner || cs.case_number} — $${money(v.pending_amt)}`, days: 999 });
  }
  return out.sort((a, b) => b.sev - a.sev || a.days - b.days);
}

export async function loadCase(caseId: string) {
  const [c, cy, it, co, ba] = await Promise.all([
    supabase.from('cm_case_view').select('*').eq('id', caseId).single(),
    supabase.from('cm_cycle_view').select('*').eq('case_id', caseId).order('seq'),
    supabase.from('cm_items').select('*').eq('case_id', caseId).order('item_number'),
    supabase.from('cm_comms').select('*').eq('case_id', caseId).order('occurred_at', { ascending: false }).limit(80),
    supabase.from('cm_settlement_batches').select('*').eq('case_id', caseId).order('created_at', { ascending: false }),
  ]);
  return { case: must(c) as CmCase, cycles: must(cy) as CmCycle[], items: must(it) as CmItem[], comms: must(co) as CmComm[], batches: must(ba) as CmBatch[] };
}

export const saveCase = async (id: string, f: Partial<CmCase>) => must(await supabase.from('cm_cases').update(f).eq('id', id).select('id'));
export const saveCycle = async (id: string, f: Record<string, unknown>) => must(await supabase.from('cm_cycles').update(f).eq('id', id).select('id'));
export const saveItem = async (id: string, f: Partial<CmItem>) => must(await supabase.from('cm_items').update(f).eq('id', id).select('id'));
export async function createCase(companyId: string, f: Partial<CmCase> & { case_number: string }, inspDate?: string) {
  const row = must(await supabase.from('cm_cases').insert({ company_id: companyId, ...f }).select('id').single()) as { id: string };
  if (inspDate) await supabase.from('cm_cycles').update({ inspection_date: inspDate }).eq('case_id', row.id).eq('seq', 1);
  return row.id;
}
export async function addNote(c: CmCase, type: string, summary: string) {
  const { data: { user } } = await supabase.auth.getUser();
  must(await supabase.from('cm_comms').insert({ company_id: c.company_id, case_id: c.id, type, by_name: user?.email ?? '', summary }).select('id'));
}
const rpc = async (fn: string, args: Record<string, unknown>) => must(await supabase.rpc(fn, args));
export const addCycle = (caseId: string, type: string, date: string | null, itemIds: string[]) =>
  rpc('cm_add_cycle', { p_case: caseId, p_type: type, p_inspection_date: date, p_inspection_time: '', p_notes: '', p_item_ids: itemIds });
export const applyCar = (caseId: string, cycleId: string, reportDate: string, items: { num: number; outcome: string }[]) =>
  rpc('cm_apply_car', { p_case: caseId, p_cycle: cycleId, p_report_date: reportDate, p_file_name: 'manual entry', p_items: items });
export const resetCar = (cycleId: string) => rpc('cm_reset_car', { p_cycle: cycleId });
export const markOfferPrepared = (cycleId: string) => rpc('cm_mark_offer_prepared', { p_cycle: cycleId });
export const createBatch = (caseId: string, itemIds: string[], base: number, negotiated: number | null) =>
  rpc('cm_create_settlement_batch', { p_case: caseId, p_item_ids: itemIds, p_base_total: base, p_negotiated: negotiated, p_release_date: new Date().toISOString().slice(0, 10), p_reason: '', p_notes: '' });
export const fullRelease = (caseId: string) =>
  rpc('cm_generate_full_release', { p_case: caseId, p_cycle: null, p_release_date: new Date().toISOString().slice(0, 10), p_reason: '', p_mark_prepared: true });
export const decideBatch = (id: string, decision: string, signed: string) => rpc('cm_decide_settlement_batch', { p_batch: id, p_decision: decision, p_signed_ref: signed });
export const routeToRepair = (ids: string[], date: string | null) => rpc('cm_route_to_repair', { p_item_ids: ids, p_scheduled: date });
export const resolveCaseCash = (id: string, outcome: 'accepted' | 'declined') => rpc('cm_resolve_case_cash', { p_case: id, p_outcome: outcome });
export const closeCase = (id: string, reason: string) => rpc('cm_close_case', { p_case: id, p_reason: reason });
export const bookClaim = (id: string, date: string) => rpc('cm_book_claim', { p_case: id, p_inspection_date: date });
export const linkWarrantyData = (companyId: string) => rpc('cm_link_warranty_data', { p_company: companyId }) as Promise<{ linked?: number; unmatched?: string[]; skipped?: string }>;
export const homeHistory = (caseId: string) => rpc('cm_home_history', { p_case: caseId }) as Promise<{ linked: boolean; warranty_cases?: number; warranty_items?: number; work_orders?: number } | null>;
export const loadIntake = async () => must(await supabase.from('cm_intake_queue').select('*').order('created_at', { ascending: false }).limit(100)) as CmIntake[];
export const resolveIntake = (id: string, decision: 'apply' | 'reject') => rpc('cm_resolve_intake', { p_intake: id, p_decision: decision });
export async function runTarionSync() {
  const { data, error } = await supabase.functions.invoke('tarion-sync', { body: {} });
  if (error) throw new Error(error.message);
  return data as { checked: number; results: Record<string, number>; errors: string[] };
}

export const money = (n: number | null | undefined) => Number(n || 0).toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDate = (s: string | null | undefined) => s ? new Date(s.length <= 10 ? s + 'T12:00:00' : s).toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
