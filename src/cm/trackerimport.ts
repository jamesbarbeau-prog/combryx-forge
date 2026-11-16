// One-time (and safe to re-run) import of the Apps Script "Conciliation Tracker" workbook into the cm_* tables.
// Runs in the browser under the signed-in manager's login, so row-level security applies as normal.
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';
import * as api from '@/cm/api';

type Row = Record<string, unknown>;
const COMMUNITY: Record<string, string> = { ironvalley: 'Iron Valley', 'iron valley': 'Iron Valley', 'rivers edge': "River's Edge", "river's edge": "River's Edge", lillythorne: 'Lilythorne', 'watters point': "Watters' Pointe", 'watters pointe': "Watters' Pointe" };

const str = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim());
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const pad = (n: number) => String(n).padStart(2, '0');
const caseId = (v: unknown) => { const s = str(v); if (!s) return ''; const n = parseFloat(s); return Number.isFinite(n) ? String(Math.trunc(n)) : s; };

function dateOnly(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') { const p = XLSX.SSF.parse_date_code(v); return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}` : null; }
  if (v instanceof Date) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v)); return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
function stamp(v: unknown): string | null {
  if (typeof v === 'number') { const p = XLSX.SSF.parse_date_code(v); return p ? `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.H)}:${pad(p.M)}:${pad(Math.floor(p.S))}` : null; }
  const d = dateOnly(v); return d ? `${d}T12:00:00` : null;
}
function clock(v: unknown): string {
  if (typeof v === 'number' && v < 1) { const mins = Math.round(v * 1440); const h = Math.floor(mins / 60); return `${h % 12 || 12}:${pad(mins % 60)} ${h < 12 ? 'AM' : 'PM'}`; }
  const s = str(v); const m = /(\d{1,2}):(\d{2}):\d{2}\s+GMT/.exec(s);
  if (m) { const h = +m[1]; return `${h % 12 || 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`; }
  return s;
}
function sheet(wb: XLSX.WorkBook, name: string): Row[] {
  const ws = wb.Sheets[name]; if (!ws) return [];
  return XLSX.utils.sheet_to_json<Row>(ws, { defval: null, raw: true });
}
const chunk = <T,>(a: T[], n: number) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));
const closedLike = /^(closed|settled|cancel)/i;

export interface ImportResult { cases: number; skipped: number; cycles: number; items: number; comms: number; linked: number; unmatched: string[] }

export async function importTrackerWorkbook(file: File, companyId: string, onStep: (s: string) => void): Promise<ImportResult> {
  onStep('Reading workbook…');
  const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const reg = sheet(wb, 'Register').filter(r => caseId(r['Case ID']));
  if (!reg.length) throw new Error('No "Register" sheet with cases found — is this the Conciliation Tracker workbook?');

  const existing = new Map<string, string>();
  { const { data, error } = await supabase.from('cm_cases').select('id, case_number').eq('company_id', companyId); if (error) throw new Error(error.message); for (const r of data ?? []) existing.set(r.case_number, r.id); }

  onStep(`Importing ${reg.length} cases…`);
  const fresh: Row[] = []; let skipped = 0;
  for (const r of reg) {
    const cn = caseId(r['Case ID']);
    if (existing.has(cn)) { skipped++; continue; }
    const status = str(r['Status']);
    const mgrStatus = str(r['Manager Status']); const stage = str(r['Manager Stage']); let reason = str(r['Closure Reason']);
    let ms = mgrStatus;
    if (closedLike.test(status) && !reason && !/^(closed|cancelled)$/i.test(mgrStatus) && stage.toUpperCase() !== 'CLOSED') { ms = 'CLOSED'; reason = status; }
    const comm = str(r['Community']);
    fresh.push({
      company_id: companyId, case_number: cn, homeowner: str(r['Homeowner']), address: str(r['Address']), lot: str(r['Lot / Block-Unit']),
      community: COMMUNITY[comm.toLowerCase()] ?? comm, enrolment: str(r['Enrolment #']), form_type: str(r['Form Type']), status: status || 'Conciliation Requested',
      supervisor: str(r['Site Supervisor']), supervisor_email: str(r['Supervisor Email']), coordinator_email: str(r['Coordinator Email']),
      owner_email: str(r['Homeowner Email']), owner_phone: str(r['Homeowner Phone']), possession_date: dateOnly(r['Possession Date']),
      box_link: str(r['Box Folder Link']), notes: str(r['Notes']), offer_prepared_on: dateOnly(r['Cash Offer Prepared']),
      manager_status: ms, closure_reason: reason, manager_stage: stage, claim_booked_on: dateOnly(r['Claim Booked On']),
      claim_inspection_date: dateOnly(r['Claim Inspection Date']), scope_locked_on: dateOnly(r['Scope Locked On']), claim_outcome: str(r['Claim Outcome']),
      claim_outcome_date: dateOnly(r['Claim Outcome Date']), tarion_claim_reference: str(r['Tarion Claim Reference']), claim_amount: num(r['Claim Amount']),
      builder_15_percent: num(r['Builder 15 Percent']), total_builder_exposure: num(r['Total Builder Exposure']), claim_outcome_notes: str(r['Claim Outcome Notes']),
    });
  }
  for (const part of chunk(fresh, 25)) {
    const { data, error } = await supabase.from('cm_cases').insert(part).select('id, case_number');
    if (error) throw new Error('Cases: ' + error.message);
    for (const r of data ?? []) existing.set(r.case_number, r.id);
  }
  const newIds = new Set(fresh.map(f => existing.get(f.case_number as string)!));

  onStep('Importing inspection cycles…');
  const cyc = sheet(wb, 'Cycles').filter(r => caseId(r['Case ID']) && existing.has(caseId(r['Case ID'])) && newIds.has(existing.get(caseId(r['Case ID']))!));
  const withCycles = [...new Set(cyc.map(r => existing.get(caseId(r['Case ID']))!))];
  // Each new case is created with a blank first cycle; replace it with the real ones from the workbook.
  for (const part of chunk(withCycles, 20)) { const { error } = await supabase.from('cm_cycles').delete().in('case_id', part); if (error) throw new Error('Cycles: ' + error.message); }
  const cycleRows = cyc.map(r => ({
    company_id: companyId, case_id: existing.get(caseId(r['Case ID']))!, seq: Math.trunc(num(r['Seq'])) || 1, type: str(r['Type']) || 'Initial Inspection',
    inspection_date: dateOnly(r['Inspection Date']), inspection_time: clock(r['Inspection Time']), car_received_on: dateOnly(r['CAR Received']),
    closed_on: dateOnly(r['Closed On']), notes: str(r['Notes']), offer_prepared_on: dateOnly(r['Offer Prepared On']),
    offer_reminder_count: Math.trunc(num(r['Offer Reminder Count'])),
  }));
  const cycleIds = new Map<string, string>(); // "caseNumber#seq" -> uuid
  const byId = new Map([...existing].map(([k, v]) => [v, k]));
  for (const part of chunk(cycleRows, 50)) {
    const { data, error } = await supabase.from('cm_cycles').insert(part).select('id, case_id, seq');
    if (error) throw new Error('Cycles: ' + error.message);
    for (const r of data ?? []) cycleIds.set(`${byId.get(r.case_id)}#${r.seq}`, r.id);
  }
  { // pick up the auto-created cycles of cases that had none in the workbook
    const { data } = await supabase.from('cm_cycles').select('id, case_id, seq').eq('company_id', companyId);
    for (const r of data ?? []) { const k = `${byId.get(r.case_id)}#${r.seq}`; if (!cycleIds.has(k)) cycleIds.set(k, r.id); }
  }

  onStep('Importing items…');
  const items = sheet(wb, 'Items').filter(r => caseId(r['Case ID']) && existing.has(caseId(r['Case ID'])) && newIds.has(existing.get(caseId(r['Case ID']))!) && str(r['Description']));
  const used = new Set<string>();
  const itemRows = items.map(r => {
    const cn = caseId(r['Case ID']); let n = Math.trunc(num(r['Item #'])) || 1; while (used.has(`${cn}:${n}`)) n++; used.add(`${cn}:${n}`);
    const rs = str(r['Resolution Status']);
    const cid = (k: string) => { const v = str(r[k]); const m = /^(\d+)(?:\.\d+)?#(\d+)$/.exec(v); return m ? cycleIds.get(`${m[1]}#${m[2]}`) ?? null : null; };
    return {
      company_id: companyId, case_id: existing.get(cn)!, item_number: n, description: str(r['Description']), likelihood: str(r['Warranted Likelihood']),
      internal_estimate: num(r['Est Repair Cost']), trade: str(r['Trade / Vendor']), scope: str(r['Scope Notes']), offer_amount: num(r['Cash Offer Value']),
      exception: str(r['Chargeability Exception']), status: str(r['Status']) || 'Open', last_action: str(r['Last Action']),
      car_outcome: str(r['Tarion Outcome']), car_notes: str(r['CAR Notes']), car_date: dateOnly(r['CAR Date']), scheduled_on: dateOnly(r['Repair Scheduled']),
      completed_on: dateOnly(r['Repair Completed']), verified_on: dateOnly(r['Verified On']), cpg: str(r['CPG Reference']), room: str(r['Room / Location']),
      category: str(r['Defect Category']) || str(r['Warranty Category']), resolution_method: str(r['Resolution Method']),
      resolution_status: rs === 'Pending' || rs === 'Settled' ? rs : '', resolution_date: stamp(r['Resolution Date']), tarion_analysis: str(r['Tarion Analysis']),
      cycle_id: cid('Cycle ID'), investigation_cycle_id: cid('Investigation Cycle ID'), initial_warranted: str(r['Initial Warranted']),
      scope_status: str(r['Manager Scope Status']) || 'Keep Open', status_request_count: Math.trunc(num(r['Status Request Count'])), status_request_sent: dateOnly(r['Status Request Sent']),
    };
  });
  for (const part of chunk(itemRows, 100)) { const { error } = await supabase.from('cm_items').insert(part); if (error) throw new Error('Items: ' + error.message); }

  onStep('Importing communications log…');
  const comms = sheet(wb, 'Comms Log').filter(r => caseId(r['Case ID']) && existing.has(caseId(r['Case ID'])) && newIds.has(existing.get(caseId(r['Case ID']))!) && str(r['Summary']));
  const commRows = comms.map(r => ({
    company_id: companyId, case_id: existing.get(caseId(r['Case ID']))!, occurred_at: stamp(r['Date']) ?? new Date().toISOString(),
    type: str(r['Type']) || 'Internal Note', by_name: str(r['Contact']) || str(r['Direction']), summary: str(r['Summary']),
  }));
  for (const part of chunk(commRows, 200)) { const { error } = await supabase.from('cm_comms').insert(part); if (error) throw new Error('Comms: ' + error.message); }

  onStep('Linking cases to homes and owners…');
  const link = await api.linkWarrantyData(companyId).catch(() => ({ linked: 0, unmatched: [] as string[] }));
  return { cases: fresh.length, skipped, cycles: cycleRows.length, items: itemRows.length, comms: commRows.length, linked: link.linked ?? 0, unmatched: link.unmatched ?? [] };
}
