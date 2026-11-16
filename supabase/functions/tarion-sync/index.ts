// tarion-sync — Supabase Edge Function. Port of VbiImport.gs (BuilderLink / Tarion VB Integration).
//
// Two jobs, one login:
//   conciliation  scheduled-inspection letters (NP) -> Conciliation Manager (cm_* tables)   [unchanged logic]
//   forms         every NEW warranty claim form -> case + items, owner photos, coordinator digest email
// Body: { mode: 'all' | 'forms' | 'conciliation', backfillDays?: number }
//
// Secrets: TARION_USERNAME, TARION_PASSWORD, TARION_ORG_ID, optional TARION_TOKEN, TARION_LOGIN_URL, TARION_API_VERSION (default 54.0)
//          scheduled runs: CM_CRON_SECRET (+ CM_COMPANY_ID)
//          email (optional, either one): RESEND_API_KEY + MAIL_FROM   |   MAIL_WEBHOOK_URL + MAIL_WEBHOOK_SECRET      APP_URL (optional link)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1';

const API = Deno.env.get('TARION_API_VERSION') ?? '54.0';
const WO_STATUSES = ['Scheduled', 'Rescheduled', 'Inspection Confirmed'];
const NP_MATCH = /scheduled\s*np/i;
const MAX_CASES = 40, MAX_NEW_FORMS = 60, RUN_MS = 110_000;
const IMG = /^(jpe?g|png|gif|heic|heif|webp|bmp)$/i;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

interface Session { sessionId: string; instance: string }
type Rec = Record<string, any>;

/* ================= login ================= */
async function login(): Promise<Session> {
  const user = Deno.env.get('TARION_USERNAME'), pass = Deno.env.get('TARION_PASSWORD') ?? '';
  const token = Deno.env.get('TARION_TOKEN') ?? '', org = Deno.env.get('TARION_ORG_ID') ?? '';
  if (!user || !pass) throw new Error('Tarion API credentials are not set (TARION_USERNAME / TARION_PASSWORD).');
  const custom = Deno.env.get('TARION_LOGIN_URL');
  const urls = [...(custom ? [custom] : []),
    ...(org ? [`https://login.salesforce.com/services/Soap/u/${API}/${org}`] : []),
    `https://login.salesforce.com/services/Soap/u/${API}`,
    ...(org ? [`https://builderlink.tarion.com/services/Soap/u/${API}/${org}`] : []),
    `https://builderlink.tarion.com/services/Soap/u/${API}`];
  const passwords = token ? [pass + token, pass] : [pass];
  const faults: string[] = [];
  for (const url of urls) for (const pw of passwords) {
    const body = `<?xml version="1.0" encoding="UTF-8"?><soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:partner.soap.sforce.com">` +
      (org ? `<soapenv:Header><urn:LoginScopeHeader><urn:organizationId>${xml(org)}</urn:organizationId></urn:LoginScopeHeader></soapenv:Header>` : '') +
      `<soapenv:Body><urn:login><urn:username>${xml(user)}</urn:username><urn:password>${xml(pw)}</urn:password></urn:login></soapenv:Body></soapenv:Envelope>`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=UTF-8', SOAPAction: '""' }, body });
    const txt = await res.text();
    const sid = txt.match(/<sessionId>([^<]+)<\/sessionId>/)?.[1], srv = txt.match(/<serverUrl>([^<]+)<\/serverUrl>/)?.[1];
    if (sid && srv) return { sessionId: sid, instance: srv.match(/^https:\/\/[^/]+/)![0] };
    faults.push(`${new URL(url).host}${pw !== pass ? ' (password+token)' : ''}: ${txt.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1] ?? 'HTTP ' + res.status}`);
  }
  let ip = 'unknown';
  try { ip = (await (await fetch('https://api.ipify.org')).text()).trim(); } catch { /* ignore */ }
  throw new Error(`Tarion login failed (org id ${org ? 'sent' : 'NOT set'}; outbound IP seen by Tarion: ${ip}) — ` + faults.join(' | '));
}

async function soql(s: Session, q: string): Promise<Rec[]> {
  let out: Rec[] = [], path: string | null = `/services/data/v${API}/query?q=${encodeURIComponent(q)}`;
  while (path) {
    const res = await fetch(s.instance + path, { headers: { Authorization: 'Bearer ' + s.sessionId } });
    const txt = await res.text();
    if (!res.ok) throw new Error(`SOQL failed (${res.status}): ${txt.slice(0, 300)} | ${q.slice(0, 160)}`);
    const j = JSON.parse(txt); out = out.concat(j.records); path = j.done ? null : j.nextRecordsUrl;
  }
  return out;
}
async function soqlIn(s: Session, prefix: string, ids: string[], suffix = ''): Promise<Rec[]> {
  let out: Rec[] = [];
  for (let i = 0; i < ids.length; i += 50) out = out.concat(await soql(s, `${prefix}('${ids.slice(i, i + 50).join("','")}')${suffix}`));
  return out;
}
const q = (v: string) => v.replace(/'/g, "\\'");

/* ================= NP letter parsing (conciliation) ================= */
function parseNp(text: string) {
  const t = text.replace(/\r/g, ''); const lines = t.split('\n').map(l => l.trim()).filter(Boolean);
  const grab = (rx: RegExp) => t.match(rx)?.[1]?.trim() ?? '';
  const out = { caseNumber: grab(/Case\s*#\s*(\d+)/i), enrolment: grab(/Enrolment\s*#\s*([A-Z0-9]+)/i), address: '', homeowner: '', date: '', time: '' };
  const addrRx = /^\d+[^,\n]*?,\s*[A-Za-z .'-]+\s+ON\s+[A-Z]\d[A-Z]\s?\d[A-Z]\d$/i;
  const ai = lines.findIndex(l => addrRx.test(l));
  if (ai >= 0) { out.address = lines[ai]; const si = lines.findIndex(l => l === lines[ai].split(',')[0].trim()); if (si > 0) out.homeowner = lines[si - 1]; }
  const dm = t.match(/([A-Z][a-z]+ \d{1,2}, \d{4})\s+at\s+(\d{1,2}:\d{2}\s*[AP]M)/i);
  if (dm) { const d = new Date(dm[1] + ' 12:00 UTC'); if (!isNaN(d.getTime())) { out.date = d.toISOString().slice(0, 10); out.time = dm[2].toUpperCase().replace(/\s+/g, ' '); } }
  return out;
}
function parseNpItems(text: string) {
  const all = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  const start = all.findIndex(l => /^items for inspection/i.test(l));
  if (start < 0) return [];
  const noise = /^(tarion|item|homeowner.?s description|item homeowner.?s description|homeowner request for conciliation form|(tarion\s+)?page\s+\d+\s+of\s+\d+)$|yonge street|tarion\.com|^(enrolment|case|vendor\/builder)\s*#/i;
  const category = /^[A-Z][A-Z /&]{2,}\s+-\s/;
  const items: { n: number; text: string }[] = []; let last = 0;
  for (const l of all.slice(start + 1)) {
    if (noise.test(l)) continue;
    const m = l.match(/^(\d{1,3})(?:\s+(\S.*))?$/);
    if (m && Number(m[1]) > last && (!m[2] || category.test(m[2]))) { last = Number(m[1]); items.push({ n: last, text: (m[2] ?? '').trim() }); }
    else if (items.length && l.length < 600) items[items.length - 1].text = (items[items.length - 1].text + ' ' + l).trim();
  }
  return items.filter(i => i.text);
}
async function pdfText(buf: ArrayBuffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  let out = '';
  for (let p = 1; p <= pdf.numPages; p++) {
    const tc = await (await pdf.getPage(p)).getTextContent();
    let y: number | null = null, line = '';
    for (const it of tc.items as Rec[]) {
      const iy = Math.round(it.transform?.[5] ?? 0);
      if (y !== null && Math.abs(iy - y) > 2) { out += line.trim() + '\n'; line = ''; }
      line += it.str + (it.hasEOL ? '\n' : ' '); y = iy;
    }
    out += line.trim() + '\n';
  }
  if (!out.trim()) out = (await extractText(pdf, { mergePages: true })).text as string;
  return out;
}

/* ================= conciliation (unchanged behaviour) ================= */
async function runConciliation(s: Session, db: any, companyId: string, deadline: number) {
  const errors: string[] = [], results: Record<string, number> = {};
  const wos = (await soql(s, `SELECT Id, WorkOrderNumber, Status, CaseId, Owner.Name FROM WorkOrder WHERE Status IN (${WO_STATUSES.map(x => `'${x}'`).join(',')})`)).filter(w => w.CaseId);
  const apps: Rec = {};
  try {
    for (const a of await soqlIn(s, 'SELECT Id, ParentRecordId, Status, SchedStartTime FROM ServiceAppointment WHERE ParentRecordId IN ', wos.map(w => w.Id), " AND Status NOT IN ('Canceled','Cancelled') ORDER BY SchedStartTime DESC"))
      if (!apps[a.ParentRecordId]) apps[a.ParentRecordId] = a;
  } catch (e) { errors.push('appointments: ' + (e as Error).message.slice(0, 200)); }
  const byCase: Rec = {};
  for (const w of wos) { const a = apps[w.Id]; const cur = byCase[w.CaseId]; if (!cur || (a?.SchedStartTime && (!cur.start || a.SchedStartTime > cur.start))) byCase[w.CaseId] = { wo: w, start: a?.SchedStartTime ?? null }; }
  const caseIds = Object.keys(byCase).slice(0, MAX_CASES);
  const cases: Rec = {};
  if (caseIds.length) for (const c of await soqlIn(s, 'SELECT Id, CaseNumber, Status, Subject, ParentId, RecordType.Name FROM Case WHERE Id IN ', caseIds)) cases[c.Id] = c;

  for (const cid of caseIds) {
    if (Date.now() > deadline) { errors.push('conciliation stopped early to stay within the time limit; it continues next run'); break; }
    try {
      const c = cases[cid]; if (!c) throw new Error('case not returned');
      const links = await soqlIn(s, 'SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId IN ', [c.Id, c.ParentId].filter(Boolean));
      const docIds = [...new Set(links.map(l => l.ContentDocumentId))];
      let docs: Rec[] = docIds.length ? await soqlIn(s, 'SELECT Id, Title, Description, FileExtension, CreatedDate FROM ContentVersion WHERE IsLatest = true AND ContentDocumentId IN ', docIds) : [];
      docs = docs.filter(v => [v.Title, v.Description].some(t => t && NP_MATCH.test(String(t)))).sort((a, b) => String(b.CreatedDate).localeCompare(String(a.CreatedDate)));
      const { data: known } = await db.from('cm_cases').select('np_version').eq('company_id', companyId).eq('case_number', String(c.CaseNumber)).maybeSingle();
      if (docs[0] && known?.np_version === docs[0].Id) { results.unchanged = (results.unchanged ?? 0) + 1; continue; }
      let info = { caseNumber: '', enrolment: '', address: '', homeowner: '', date: '', time: '' }, items: { n: number; text: string }[] = [], npUrl = '';
      for (const d of docs) {
        const res = await fetch(`${s.instance}/services/data/v${API}/sobjects/ContentVersion/${d.Id}/VersionData`, { headers: { Authorization: 'Bearer ' + s.sessionId } });
        if (!res.ok) continue;
        const buf = await res.arrayBuffer(); const text = await pdfText(buf); const one = parseNp(text);
        if (!npUrl) {
          info = one;
          const path = `${companyId}/np/${c.CaseNumber}-${d.Id}.pdf`;
          const up = await db.storage.from('cm-documents').upload(path, buf, { contentType: 'application/pdf', upsert: true });
          npUrl = up.error ? '' : path;
        } else (['homeowner', 'address', 'enrolment'] as const).forEach(k => { if (!info[k]) info[k] = one[k]; });
        items = parseNpItems(text);
        if (items.length) break;
      }
      const start = byCase[cid].start ? new Date(byCase[cid].start) : null;
      const { data, error } = await db.rpc('cm_ingest_np', { p_company: companyId, p: {
        source: 'tarion_api', caseNumber: String(c.CaseNumber), enrolment: info.enrolment, homeowner: info.homeowner, address: info.address,
        npVersionId: docs[0]?.Id ?? '', formType: c.RecordType?.Name ?? c.Subject ?? '', inspector: byCase[cid].wo.Owner?.Name ?? '', woStatus: byCase[cid].wo.Status,
        inspectionDate: info.date || (start ? start.toLocaleDateString('en-CA', { timeZone: 'America/Toronto' }) : ''), inspectionTime: info.time, npUrl, items } });
      if (error) throw new Error(error.message);
      results[data.action] = (results[data.action] ?? 0) + 1;
    } catch (e) { errors.push(`${cases[cid]?.CaseNumber ?? cid}: ${(e as Error).message.slice(0, 200)}`); }
  }
  await db.from('cm_sync_runs').insert({ company_id: companyId, finished_at: new Date().toISOString(), checked: caseIds.length,
    created: results.create_case ?? 0, updated: (results.reschedule ?? 0) + (results.add_items ?? 0), queued: results.review ?? 0, errors });
  await db.rpc('cm_link_warranty_data', { p_company: companyId });
  return { checked: caseIds.length, results, errors };
}

/* ================= warranty forms ================= */
const num = (s: unknown) => { const n = parseInt(String(s ?? '').replace(/\D/g, ''), 10); return isNaN(n) ? 1e9 : n; };

async function runForms(s: Session, admin: any, companyId: string, backfillDays?: number) {
  const errors: string[] = [], results: Record<string, number> = {};
  const { data: map } = await admin.from('warranty_form_map').select('tarion_code');
  const codes: string[] = (map ?? []).map((m: Rec) => m.tarion_code);
  const { count: seen } = await admin.from('tarion_form_imports').select('id', { count: 'exact', head: true }).eq('company_id', companyId);
  const days = Math.min(60, backfillDays ?? (seen ? 3 : 7));
  const since = new Date(Date.now() - days * 864e5).toISOString().slice(0, 19) + 'Z';

  // 1) forms that were waiting for a lot with this enrolment number
  const { data: waiting } = await admin.from('tarion_form_imports').select('payload').eq('company_id', companyId).eq('status', 'needs_review').like('reason', 'No lot%').not('payload', 'is', null).limit(40);
  for (const w of waiting ?? []) {
    const { data, error } = await admin.rpc('tw_ingest_form', { p_company: companyId, p: { ...w.payload, retry: true } });
    if (error) errors.push('retry: ' + error.message.slice(0, 160)); else if (data.action === 'created') results.created_after_review = (results.created_after_review ?? 0) + 1;
  }

  // 2) new forms from Tarion
  const cases = (await soql(s, `SELECT Id, CaseNumber, Status, Case_Type__c, ContactId, Enrolment_Number__c, CreatedDate, RecordType.Name FROM Case WHERE CreatedDate >= ${since} AND Case_Type__c IN (${codes.map(c => `'${q(c)}'`).join(',')}) ORDER BY CreatedDate ASC LIMIT 400`))
    .filter(c => c.RecordType?.Name !== 'RFC');
  const haveSet = new Set<string>();
  for (let i = 0; i < cases.length; i += 80) {
    const { data: have } = await admin.from('tarion_form_imports').select('tarion_case_id').eq('company_id', companyId).in('tarion_case_id', cases.slice(i, i + 80).map(c => c.Id));
    (have ?? []).forEach((h: Rec) => haveSet.add(h.tarion_case_id));
  }
  const fresh = cases.filter(c => !haveSet.has(c.Id)).slice(0, MAX_NEW_FORMS);
  results.seen_in_window = cases.length; results.new_forms = fresh.length;
  if (!fresh.length) return { results, errors };

  const contacts: Rec = {}, enrols: Rec = {}, cities: Rec = {};
  try { for (const r of await soqlIn(s, 'SELECT Id, Name FROM Contact WHERE Id IN ', [...new Set(fresh.map(c => c.ContactId).filter(Boolean))])) contacts[r.Id] = r.Name; } catch (e) { errors.push('owners: ' + (e as Error).message.slice(0, 160)); }
  const enrolIds = [...new Set(fresh.map(c => c.Enrolment_Number__c).filter(Boolean))];
  try { for (const r of await soqlIn(s, 'SELECT Id, Name, Street_Number__c, Street_Name__c, Postal_Code__c, Lot__c, City__c, Vendor_Builder_After_Sales_Contact__c FROM Enrolment__c WHERE Id IN ', enrolIds)) enrols[r.Id] = r; }
  catch (e) {
    errors.push('enrolment details (retrying with enrolment number only): ' + (e as Error).message.slice(0, 160));
    for (const r of await soqlIn(s, 'SELECT Id, Name FROM Enrolment__c WHERE Id IN ', enrolIds)) enrols[r.Id] = r;
  }
  try { for (const r of await soqlIn(s, 'SELECT Id, Name FROM City__c WHERE Id IN ', [...new Set(Object.values(enrols).map((e: Rec) => e.City__c).filter(Boolean))])) cities[r.Id] = r.Name; } catch { /* city is optional */ }

  for (const c of fresh) {
    try {
      const en = enrols[c.Enrolment_Number__c] ?? {};
      const rows = await soql(s, `SELECT Id, Name, Item__c, Description__c, Interior_Exterior__c, Floor_Level__c, Room_Area__c, Item_Defect_Area__c FROM Deficiency__c WHERE Case_Id__c = '${q(c.Id)}'`);
      if (!rows.length) throw new Error('no item records returned yet; will retry on the next run');
      const items = rows.sort((a, b) => num(a.Item__c) - num(b.Item__c)).map(r => ({
        id: r.Id, num: String(r.Item__c ?? ''), description: r.Description__c ?? '', ioe: r.Interior_Exterior__c ?? '', floor: r.Floor_Level__c ?? '', room: r.Room_Area__c ?? '', area: r.Item_Defect_Area__c ?? '' }));
      const address = [[en.Street_Number__c, en.Street_Name__c].filter(Boolean).join(' '), cities[en.City__c], en.Postal_Code__c].filter(Boolean).join(', ');
      const { data, error } = await admin.rpc('tw_ingest_form', { p_company: companyId, p: {
        tarionCaseId: c.Id, caseNumber: String(c.CaseNumber), formCode: c.Case_Type__c, enrolment: en.Name ?? '', owner: contacts[c.ContactId] ?? '', address,
        afterSales: en.Vendor_Builder_After_Sales_Contact__c ?? '', createdAt: c.CreatedDate, items } });
      if (error) throw new Error(error.message);
      results[data.action] = (results[data.action] ?? 0) + 1;
    } catch (e) { errors.push(`form ${c.CaseNumber}: ${(e as Error).message.slice(0, 200)}`); }
  }
  return { results, errors };
}

/* ================= owner photos ================= */
async function runPhotos(s: Session, admin: any, companyId: string, deadline: number) {
  const out = { downloaded: 0, forms: 0, notes: [] as string[], errors: [] as string[] };
  const { data: pend } = await admin.from('tarion_form_imports').select('id, tarion_case_id, tarion_case_number, case_id, photos_done, created_at')
    .eq('company_id', companyId).eq('status', 'imported').eq('photos_complete', false).not('case_id', 'is', null).order('created_at', { ascending: false }).limit(25);
  for (const imp of pend ?? []) {
    if (Date.now() > deadline) break;
    try {
      const { data: items } = await admin.from('warranty_items').select('id, item_number, tarion_deficiency_id').eq('case_id', imp.case_id).not('tarion_deficiency_id', 'is', null);
      const byDef = new Map<string, Rec>((items ?? []).map((i: Rec) => [i.tarion_deficiency_id, i]));
      const byNo = new Map<string, Rec>((items ?? []).map((i: Rec) => [String(i.item_number), i]));
      const cand = new Map<string, { id: string; kind: 'cv' | 'att'; title: string; ext: string; created: string; item: Rec | undefined }>();
      const strat: Record<string, number> = { links: 0, caseFiles: 0, attachments: 0 };

      // A) files linked straight to the item records
      try {
        const links = await soqlIn(s, 'SELECT ContentDocumentId, LinkedEntityId FROM ContentDocumentLink WHERE LinkedEntityId IN ', [...byDef.keys()]);
        const docItem = new Map(links.map(l => [l.ContentDocumentId, byDef.get(l.LinkedEntityId)]));
        if (docItem.size) for (const v of await soqlIn(s, 'SELECT Id, Title, FileExtension, CreatedDate, ContentDocumentId FROM ContentVersion WHERE IsLatest = true AND ContentDocumentId IN ', [...docItem.keys()]))
          if (IMG.test(v.FileExtension ?? '')) { cand.set(v.Id, { id: v.Id, kind: 'cv', title: v.Title, ext: v.FileExtension, created: v.CreatedDate, item: docItem.get(v.ContentDocumentId) }); strat.links++; }
      } catch (e) { out.errors.push(`${imp.tarion_case_number} item links: ${(e as Error).message.slice(0, 120)}`); }
      // B) files that name the case (and optionally a line item) in their own fields
      try {
        const id15 = imp.tarion_case_id.slice(0, 15);
        for (const v of await soql(s, `SELECT Id, Title, FileExtension, CreatedDate, Line_Item_Number__c FROM ContentVersion WHERE IsLatest = true AND (Case_ID__c = '${q(imp.tarion_case_id)}' OR Case_ID__c = '${q(id15)}')`))
          if (IMG.test(v.FileExtension ?? '') && !cand.has(v.Id)) { cand.set(v.Id, { id: v.Id, kind: 'cv', title: v.Title, ext: v.FileExtension, created: v.CreatedDate, item: byNo.get(String(v.Line_Item_Number__c ?? '').replace(/\D/g, '')) }); strat.caseFiles++; }
      } catch { /* this field may not exist; the other routes still run */ }
      // C) older-style attachments on the item records
      try {
        for (const a of await soqlIn(s, 'SELECT Id, Name, ContentType, CreatedDate, ParentId FROM Attachment WHERE ParentId IN ', [...byDef.keys()]))
          if (/^image\//i.test(a.ContentType ?? '') && !cand.has(a.Id)) { cand.set(a.Id, { id: a.Id, kind: 'att', title: a.Name, ext: (a.Name.split('.').pop() ?? 'jpg'), created: a.CreatedDate, item: byDef.get(a.ParentId) }); strat.attachments++; }
      } catch { /* optional */ }

      const { data: had } = await admin.from('warranty_item_evidence').select('storage_path').eq('case_id', imp.case_id).eq('evidence_type', 'owner_photo');
      const haveSet = new Set((had ?? []).map((h: Rec) => h.storage_path));
      let done = haveSet.size, hitDeadline = false, unmatched = 0;
      for (const c of cand.values()) {
        if (!c.item) { unmatched++; continue; }
        const ext = String(c.ext).toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
        const path = `${companyId}/${imp.tarion_case_number}/${c.item.item_number}-${c.id}.${ext}`;
        if (haveSet.has(path)) continue;
        if (Date.now() > deadline) { hitDeadline = true; break; }
        const res = await fetch(c.kind === 'cv' ? `${s.instance}/services/data/v${API}/sobjects/ContentVersion/${c.id}/VersionData` : `${s.instance}/services/data/v${API}/sobjects/Attachment/${c.id}/Body`, { headers: { Authorization: 'Bearer ' + s.sessionId } });
        if (!res.ok) { out.errors.push(`${imp.tarion_case_number} photo ${c.title}: HTTP ${res.status}`); continue; }
        const up = await admin.storage.from('warranty-photos').upload(path, await res.arrayBuffer(), { contentType: res.headers.get('content-type') ?? 'image/jpeg', upsert: true });
        if (up.error) { out.errors.push(`${imp.tarion_case_number} upload: ${up.error.message.slice(0, 100)}`); continue; }
        const ins = await admin.from('warranty_item_evidence').insert({ company_id: companyId, item_id: c.item.id, case_id: imp.case_id, evidence_type: 'owner_photo', phase: 'assessment',
          file_name: `${c.title}.${ext}`, storage_path: path, is_before: true, captured_at: c.created, notes: 'Submitted by the homeowner through Tarion' });
        if (ins.error) { out.errors.push(`${imp.tarion_case_number} evidence: ${ins.error.message.slice(0, 100)}`); continue; }
        done++; out.downloaded++;
      }
      const ageH = (Date.now() - new Date(imp.created_at).getTime()) / 36e5;
      const complete = !hitDeadline && (cand.size > 0 ? unmatched === 0 || done > 0 : ageH > 72);
      const note = `found ${cand.size} (item links ${strat.links}, case files ${strat.caseFiles}, attachments ${strat.attachments})` + (unmatched ? `; ${unmatched} not matched to an item` : '');
      await admin.from('tarion_form_imports').update({ photos_found: cand.size, photos_done: done, photos_complete: complete, photo_note: note }).eq('id', imp.id);
      out.forms++; out.notes.push(`${imp.tarion_case_number}: ${note}`);
    } catch (e) { out.errors.push(`${imp.tarion_case_number} photos: ${(e as Error).message.slice(0, 160)}`); }
  }
  return out;
}

/* ================= coordinator digest ================= */
async function sendMail(to: string[], subject: string, html: string): Promise<'sent' | 'not_configured' | string> {
  const key = Deno.env.get('RESEND_API_KEY'), from = Deno.env.get('MAIL_FROM'), hook = Deno.env.get('MAIL_WEBHOOK_URL');
  try {
    if (key && from) {
      const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to, subject, html }) });
      return r.ok ? 'sent' : `Resend HTTP ${r.status}: ${(await r.text()).slice(0, 160)}`;
    }
    if (hook) {
      const r = await fetch(hook, { method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'follow', body: JSON.stringify({ secret: Deno.env.get('MAIL_WEBHOOK_SECRET') ?? '', to, subject, html }) });
      const t = await r.text();
      return r.ok && /ok/i.test(t) ? 'sent' : `mail webhook HTTP ${r.status}: ${t.slice(0, 160)}`;
    }
  } catch (e) { return (e as Error).message.slice(0, 160); }
  return 'not_configured';
}

async function sendDigest(admin: any, companyId: string) {
  const out = { emailed: 0, recipients: 0, inApp: 0, noRecipient: 0, mail: 'none waiting' as string };
  const { data: rows } = await admin.from('tarion_form_imports').select('*').eq('company_id', companyId).in('status', ['imported', 'needs_review']).or('emailed_at.is.null,notified_at.is.null').order('created_at', { ascending: true }).limit(200);
  if (!rows?.length) return out;
  const { data: recips } = await admin.from('warranty_intake_recipients').select('email, community_id').eq('company_id', companyId).eq('is_active', true);
  const forEmail = new Map<string, Rec[]>();
  const orphan: Rec[] = [];
  for (const r of rows.filter((x: Rec) => !x.emailed_at)) {
    let to = (recips ?? []).filter((x: Rec) => !x.community_id || x.community_id === r.community_id).map((x: Rec) => x.email.toLowerCase());
    if (!to.length && r.after_sales_email) to = [String(r.after_sales_email).toLowerCase()];
    if (!to.length) { orphan.push(r); continue; }
    for (const e of new Set(to)) forEmail.set(e, [...(forEmail.get(e) ?? []), r]);
  }
  out.noRecipient = orphan.length;
  const app = Deno.env.get('APP_URL');
  const emailedIds = new Set<string>();
  for (const [email, list] of forEmail) {
    const ok = list.filter(r => r.status === 'imported'), review = list.filter(r => r.status === 'needs_review');
    const photos = (r: Rec) => r.photos_found ? `${r.photos_done}/${r.photos_found}${r.photos_complete ? '' : ' (more coming)'}` : (r.photos_complete ? '0' : 'checking');
    const th = 'style="text-align:left;padding:6px 10px;border-bottom:1px solid #d7dde3;font-size:12px;color:#5b6b7a"', td = 'style="padding:6px 10px;border-bottom:1px solid #eef1f4;font-size:13px"';
    const html = `<div style="font-family:Arial,sans-serif;color:#102a43;max-width:760px">` +
      `<h2 style="margin:0 0 4px">${ok.length} new warranty form${ok.length === 1 ? '' : 's'} imported</h2><p style="margin:0 0 14px;color:#5b6b7a">Builder Guardian · from BuilderLink</p>` +
      (ok.length ? `<table style="border-collapse:collapse;width:100%"><tr><th ${th}>Case</th><th ${th}>Form</th><th ${th}>Homeowner</th><th ${th}>Address</th><th ${th}>Items</th><th ${th}>Photos</th></tr>` +
        ok.map(r => `<tr><td ${td}>${esc(r.tarion_case_number)}</td><td ${td}>${esc(r.form_code)}</td><td ${td}>${esc(r.owner_name)}</td><td ${td}>${esc(r.address)}</td><td ${td}>${r.items_count}</td><td ${td}>${esc(photos(r))}</td></tr>`).join('') + `</table>` : '') +
      (review.length ? `<h3 style="margin:18px 0 6px">Needs a look (${review.length})</h3><ul style="margin:0;padding-left:18px">` + review.map(r => `<li style="font-size:13px">${esc(r.tarion_case_number)} · ${esc(r.owner_name)} · ${esc(r.reason)}</li>`).join('') + `</ul>` : '') +
      (app ? `<p style="margin-top:18px"><a href="${esc(app)}">Open Builder Guardian</a></p>` : '') + `</div>`;
    const r = await sendMail([email], `Builder Guardian: ${ok.length} new warranty form${ok.length === 1 ? '' : 's'} imported${review.length ? ` (+${review.length} to review)` : ''}`, html);
    out.mail = r;
    if (r === 'sent') { out.recipients++; list.forEach(x => emailedIds.add(x.id)); }
  }
  if (emailedIds.size) { out.emailed = emailedIds.size; await admin.from('tarion_form_imports').update({ emailed_at: new Date().toISOString() }).in('id', [...emailedIds]); }

  const unseen = rows.filter((x: Rec) => !x.notified_at);
  if (unseen.length) {
    const n = unseen.filter((x: Rec) => x.status === 'imported').length;
    const ins = await admin.from('notifications').insert({ company_id: companyId, type: 'warranty_forms_imported', target_role: 'coordinator',
      title: `${n} new warranty form${n === 1 ? '' : 's'} imported from Tarion`,
      body: unseen.slice(0, 10).map((r: Rec) => `${r.tarion_case_number} ${r.form_code ?? ''} ${r.owner_name ?? ''} ${r.status === 'needs_review' ? '(needs review: ' + r.reason + ')' : ''}`).join('\n'),
      metadata: { import_ids: unseen.map((r: Rec) => r.id) } });
    if (!ins.error) { out.inApp = unseen.length; await admin.from('tarion_form_imports').update({ notified_at: new Date().toISOString() }).in('id', unseen.map((r: Rec) => r.id)); }
  }
  return out;
}

/* ================= entry ================= */
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  const t0 = Date.now();
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const body = await req.json().catch(() => ({}));
    const mode: string = body.mode ?? 'all';
    const admin = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    let db: any, companyId: string;
    const cron = req.headers.get('x-cron-secret');
    if (cron && cron === Deno.env.get('CM_CRON_SECRET')) {
      db = admin;
      companyId = Deno.env.get('CM_COMPANY_ID') ?? (await admin.from('cm_settings').select('company_id').limit(1).maybeSingle()).data?.company_id;
      if (!companyId) return json({ error: 'CM_COMPANY_ID is not set.' }, 400);
    } else {
      db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: { user } } = await db.auth.getUser();
      if (!user) return json({ error: 'Sign in required.' }, 401);
      const { data: m } = await db.from('cm_members').select('company_id, role').eq('user_id', user.id).eq('role', 'manager').limit(1).maybeSingle();
      if (!m) return json({ error: 'Managers only.' }, 403);
      companyId = m.company_id;
    }
    const s = await login();
    const report: Rec = { mode };
    if (mode === 'all' || mode === 'forms') {
      try { report.forms = await runForms(s, admin, companyId, body.backfillDays); } catch (e) { report.forms = { results: {}, errors: ['forms: ' + (e as Error).message] }; }
    }
    if (mode === 'all' || mode === 'conciliation') {
      try { report.conciliation = await runConciliation(s, db, companyId, t0 + 75_000); } catch (e) { report.conciliation = { checked: 0, results: {}, errors: ['conciliation: ' + (e as Error).message] }; }
    }
    if (mode === 'all' || mode === 'forms') {
      try { report.photos = await runPhotos(s, admin, companyId, t0 + RUN_MS); } catch (e) { report.photos = { errors: ['photos: ' + (e as Error).message] }; }
      try { report.digest = await sendDigest(admin, companyId); } catch (e) { report.digest = { error: (e as Error).message }; }
    }
    // keeps the shape the app already reads
    const c = report.conciliation ?? { checked: 0, results: {}, errors: [] };
    return json({ checked: c.checked, results: c.results, errors: [...c.errors, ...(report.forms?.errors ?? [])], ...report });
  } catch (e) { return json({ checked: 0, results: {}, errors: [(e as Error).message] }); }
});
