// One-time importer: reads the Conciliation Manager Google Sheet (File > Download > .xlsx) and loads
// Register / Cycles / Items / Comms Log / Settlement Batches into the cm_* tables. Re-runnable: cases whose
// case number already exists are skipped, never overwritten.
import * as XLSX from 'xlsx';
import { supabase } from '@/lib/supabase';

type Row = unknown[];
const s = (v: unknown) => (v == null ? '' : String(v).trim());
const n = (v: unknown) => { const x = Number(String(v ?? '').replace(/[$,]/g, '')); return isFinite(x) ? Math.round(x * 100) / 100 : 0; };
const d = (v: unknown): string | null => {
  if (v instanceof Date && !isNaN(v.getTime())) return new Date(v.getTime() + 12 * 3600 * 1000).toISOString().slice(0, 10);
  const t = s(v); return /^\d{4}-\d{2}-\d{2}/.test(t) ? t.slice(0, 10) : null;
};
const col = (hdr: Row, name: string) => hdr.findIndex(h => s(h).toLowerCase() === name.toLowerCase());

export interface SheetPreview { cases: number; cycles: number; items: number; comms: number; batches: number; missing: string[] }
export interface SheetData { reg: Row[]; cyc: Row[]; items: Row[]; comms: Row[]; batches: Row[] }

export function readWorkbook(buf: ArrayBuffer): { data: SheetData; preview: SheetPreview } {
  const wb = XLSX.read(buf, { type: 'array', cellDates: true });
  const get = (name: string): Row[] => wb.Sheets[name] ? XLSX.utils.sheet_to_json<Row>(wb.Sheets[name], { header: 1, defval: '', raw: true }) : [];
  const data = { reg: get('Register'), cyc: get('Cycles'), items: get('Items'), comms: get('Comms Log'), batches: get('Settlement Batches') };
  const missing = ['Register', 'Items'].filter(x => !wb.Sheets[x]);
  const cnt = (r: Row[]) => r.slice(1).filter(x => s(x[0])).length;
  const regIds = new Set(data.reg.slice(1).map(r => s(r[0])).filter(Boolean));
  return { data, preview: { cases: regIds.size, cycles: cnt(data.cyc), items: cnt(data.items), comms: data.comms.slice(1).filter(x => s(x[1])).length, batches: cnt(data.batches), missing } };
}

async function insertChunks(table: string, rows: Record<string, unknown>[], errors: string[]) {
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + 200));
    if (error) errors.push(`${table} rows ${i + 1}-${i + 200}: ${error.message}`);
  }
}

export async function importSheet(companyId: string, data: SheetData, onStep: (m: string) => void) {
  const errors: string[] = [];
  const rh = data.reg[0] ?? [];
  const mc = (name: string) => col(rh, name);
  // Register: merge duplicate rows per Case ID (first row wins, blanks filled from later rows) — same as cyReadRegister_().
  const merged = new Map<string, Row>();
  for (const r of data.reg.slice(1)) {
    const id = s(r[0]); if (!id) continue;
    const ex = merged.get(id);
    if (!ex) merged.set(id, [...r]);
    else r.forEach((v, i) => { if (s(ex[i]) === '' && s(v) !== '') ex[i] = v; });
  }
  onStep('Checking existing cases…');
  const { data: existing } = await supabase.from('cm_cases').select('case_number').eq('company_id', companyId);
  const have = new Set((existing ?? []).map((x: { case_number: string }) => x.case_number));
  const g = (r: Row, name: string) => { const i = mc(name); return i < 0 ? '' : r[i]; };
  const caseRows = [...merged.entries()].filter(([id]) => !have.has(id)).map(([id, r]) => ({
    company_id: companyId, case_number: id, legacy_ref: id, homeowner: s(r[1]), address: s(r[2]), enrolment: s(r[3]), form_type: s(r[4]),
    status: s(r[9]) || 'Conciliation Requested', notes: s(r[16]).split(' | ')[0], supervisor: s(r[17]), lot: s(r[19]),
    possession_date: d(r[22]), owner_email: s(r[23]), owner_phone: s(r[24]), box_link: s(r[25]), offer_prepared_on: d(r[26]),
    supervisor_email: s(r[27]), coordinator_email: s(r[28]), community: s(r[29]),
    case_closed_on: d(r[30]), property_type: /common element|cedef/i.test(s(r[4])) ? 'common_elements' : 'freehold',
    manager_status: s(g(r, 'Manager Status')) || 'ACTIVE', closure_reason: s(g(r, 'Closure Reason')), manager_stage: s(g(r, 'Manager Stage')),
    claim_booked_on: d(g(r, 'Claim Booked On')), claim_inspection_date: d(g(r, 'Claim Inspection Date')), scope_locked_on: d(g(r, 'Scope Locked On')),
    claim_outcome: s(g(r, 'Claim Outcome')), claim_outcome_date: d(g(r, 'Claim Outcome Date')), tarion_claim_reference: s(g(r, 'Tarion Claim Reference')),
    claim_amount: n(g(r, 'Claim Amount')), builder_15_percent: n(g(r, 'Builder 15 Percent')), total_builder_exposure: n(g(r, 'Total Builder Exposure')),
    claim_outcome_notes: s(g(r, 'Claim Outcome Notes')),
  }));
  onStep(`Creating ${caseRows.length} case(s)…`);
  await insertChunks('cm_cases', caseRows, errors);
  const newIds = new Set(caseRows.map(c => c.case_number));
  const { data: all } = await supabase.from('cm_cases').select('id, case_number').eq('company_id', companyId);
  const caseId = new Map((all ?? []).map((x: { id: string; case_number: string }) => [x.case_number, x.id]));

  // Cycles (seq 1 already exists via trigger -> upsert on case_id,seq)
  onStep('Importing inspection cycles…');
  const cycRows = data.cyc.slice(1).filter(r => s(r[0]) && newIds.has(s(r[1]))).map(r => ({
    company_id: companyId, case_id: caseId.get(s(r[1])), seq: Number(r[2]) || 1, type: s(r[3]) || 'Initial Inspection',
    inspection_date: d(r[4]), inspection_time: s(r[5]), car_received_on: d(r[6]), closed_on: d(r[7]), notes: s(r[8]),
    offer_prepared_on: d(r[11]), offer_reminder_last_sent: d(r[12]), offer_reminder_count: Number(r[13]) || 0,
  }));
  for (let i = 0; i < cycRows.length; i += 200) {
    const { error } = await supabase.from('cm_cycles').upsert(cycRows.slice(i, i + 200), { onConflict: 'case_id,seq' });
    if (error) errors.push(`cm_cycles: ${error.message}`);
  }
  // cases with no Cycles row: carry the Register inspection date / CAR date onto cycle 1
  const withCycles = new Set(data.cyc.slice(1).map(r => s(r[1])));
  for (const [id, r] of merged) {
    if (!newIds.has(id) || withCycles.has(id)) continue;
    await supabase.from('cm_cycles').update({ inspection_date: d(r[7]), inspection_time: s(r[18]), car_received_on: d(r[21]) }).eq('case_id', caseId.get(id)).eq('seq', 1);
  }
  const { data: cyAll } = await supabase.from('cm_cycles').select('id, case_id, seq').eq('company_id', companyId);
  const numById = new Map([...caseId.entries()].map(([num, id]) => [id, num]));
  const cycleId = new Map((cyAll ?? []).map((x: { id: string; case_id: string; seq: number }) => [`${numById.get(x.case_id)}#${x.seq}`, x.id]));

  onStep('Importing items…');
  const ih = data.items[0] ?? [];
  const iInv = col(ih, 'Investigation Cycle ID'), iInit = col(ih, 'Initial Warranted'), iScope = col(ih, 'Manager Scope Status');
  const iSent = col(ih, 'Status Request Sent'), iCount = col(ih, 'Status Request Count');
  const seen = new Set<string>();
  const itemRows = data.items.slice(1).filter(r => s(r[0]) && s(r[1]) && newIds.has(s(r[0]))).flatMap(r => {
    const num = parseInt(s(r[1]), 10); const key = `${s(r[0])}|${num}`;
    if (!num || seen.has(key)) { if (num) errors.push(`Duplicate item #${num} on case ${s(r[0])} skipped`); return []; }
    seen.add(key);
    const rs = s(r[28]);
    return [{
      company_id: companyId, case_id: caseId.get(s(r[0])), item_number: num, description: s(r[2]), likelihood: s(r[4]), internal_estimate: n(r[5]),
      trade: s(r[6]), scope: s(r[7]), offer_amount: n(r[8]), exception: s(r[10]) || 'None', status: s(r[11]) || 'Open', last_action: s(r[13]),
      original_note: s(r[14]), car_outcome: s(r[17]), car_notes: s(r[18]), car_date: d(r[19]), scheduled_on: d(r[20]), completed_on: d(r[21]),
      verified_on: r[22] instanceof Date ? (r[22] as Date).toISOString() : null, cpg: s(r[24]), room: s(r[25]), category: s(r[26]),
      resolution_method: s(r[27]), resolution_status: rs === 'Pending' || rs === 'Settled' ? rs : '', resolution_date: r[29] instanceof Date ? (r[29] as Date).toISOString() : null,
      tarion_analysis: s(r[30]), cycle_id: cycleId.get(s(r[31])) ?? null,
      investigation_cycle_id: iInv >= 0 ? cycleId.get(s(r[iInv])) ?? null : null,
      initial_warranted: iInit >= 0 ? s(r[iInit]) : '', scope_status: (iScope >= 0 && s(r[iScope])) || 'Keep Open',
      status_request_sent: iSent >= 0 ? d(r[iSent]) : null, status_request_count: iCount >= 0 ? Number(r[iCount]) || 0 : 0,
    }];
  });
  await insertChunks('cm_items', itemRows, errors);

  onStep('Importing activity log…');
  const commRows = data.comms.slice(1).filter(r => newIds.has(s(r[1]))).map(r => ({
    company_id: companyId, case_id: caseId.get(s(r[1])), occurred_at: r[0] instanceof Date ? (r[0] as Date).toISOString() : new Date().toISOString(),
    type: s(r[2]) || 'Internal Note', by_name: s(r[4]), summary: s(r[5]),
  }));
  await insertChunks('cm_comms', commRows, errors);

  const batchRows = data.batches.slice(1).filter(r => s(r[0]) && newIds.has(s(r[1]))).map(r => ({
    company_id: companyId, case_id: caseId.get(s(r[1])), kind: 'selected', item_numbers: s(r[5]), base_total: n(r[6]), multiplier: Number(r[7]) || null,
    calculated_total: n(r[8]), negotiated_total: s(r[9]) === '' ? null : n(r[9]), final_total: n(r[10]), release_path: s(r[11]),
    decision: ['OFFERED', 'ACCEPTED', 'DECLINED'].includes(s(r[13])) ? s(r[13]) : 'OFFERED', signed_release_ref: s(r[15]), notes: s(r[17]),
    created_at: r[2] instanceof Date ? (r[2] as Date).toISOString() : new Date().toISOString(),
  }));
  await insertChunks('cm_settlement_batches', batchRows, errors);
  return { cases: caseRows.length, skipped: merged.size - caseRows.length, cycles: cycRows.length, items: itemRows.length, comms: commRows.length, batches: batchRows.length, errors };
}
