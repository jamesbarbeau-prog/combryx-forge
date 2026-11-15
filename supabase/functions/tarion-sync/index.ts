// tarion-sync — Supabase Edge Function. Port of VbiImport.gs (BuilderLink / Tarion VB Integration).
// Pulls active conciliation work orders, finds the newest "Scheduled NP" letter per case, reads its header and
// "Items for Inspection" list, and hands each one to cm_ingest_np(), which decides: create / update / duplicate / review.
//
// Secrets (supabase secrets set ...):
//   TARION_USERNAME, TARION_PASSWORD      API-only BuilderLink user
//   TARION_ORG_ID                         Salesforce Organization ID supplied by Tarion
//   TARION_TOKEN (optional)               security token, appended to the password if set
//   TARION_LOGIN_URL (optional)           full SOAP login URL override
//   CM_CRON_SECRET + CM_COMPANY_ID        only for scheduled (unattended) runs
// Called from the app with the signed-in manager's JWT, or by a schedule with header x-cron-secret.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { extractText, getDocumentProxy } from 'npm:unpdf@0.12.1';

const API = '59.0';
const WO_STATUSES = ['Scheduled', 'Rescheduled', 'Inspection Confirmed'];
const NP_MATCH = /scheduled\s*np/i;
const MAX_CASES = 40;
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret' };
const xml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

interface Session { sessionId: string; instance: string }
type Rec = Record<string, any>;

async function login(): Promise<Session> {
  const user = Deno.env.get('TARION_USERNAME'), pass = Deno.env.get('TARION_PASSWORD') ?? '';
  const token = Deno.env.get('TARION_TOKEN') ?? '', org = Deno.env.get('TARION_ORG_ID') ?? '';
  if (!user || !pass) throw new Error('Tarion API credentials are not set (TARION_USERNAME / TARION_PASSWORD).');
  const custom = Deno.env.get('TARION_LOGIN_URL');
  const urls = [...(custom ? [custom] : []), `https://builderlink.tarion.com/services/Soap/u/${API}`, `https://login.salesforce.com/services/Soap/u/${API}`];
  const passwords = token ? [pass + token, pass] : [pass];
  const faults: string[] = [];
  for (const url of urls) for (const pw of passwords) {
    const body = `<?xml version="1.0" encoding="utf-8"?><env:Envelope xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:env="http://schemas.xmlsoap.org/soap/envelope/">` +
      (org ? `<env:Header><n1:LoginScopeHeader xmlns:n1="urn:partner.soap.sforce.com"><n1:organizationId>${xml(org)}</n1:organizationId></n1:LoginScopeHeader></env:Header>` : '') +
      `<env:Body><n1:login xmlns:n1="urn:partner.soap.sforce.com"><n1:username>${xml(user)}</n1:username><n1:password>${xml(pw)}</n1:password></n1:login></env:Body></env:Envelope>`;
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/xml; charset=UTF-8', SOAPAction: 'login' }, body });
    const txt = await res.text();
    const sid = txt.match(/<sessionId>([^<]+)<\/sessionId>/)?.[1], srv = txt.match(/<serverUrl>([^<]+)<\/serverUrl>/)?.[1];
    if (sid && srv) return { sessionId: sid, instance: srv.match(/^https:\/\/[^/]+/)![0] };
    faults.push(`${new URL(url).host}${pw !== pass ? ' (password+token)' : ''}: ${txt.match(/<faultstring>([^<]+)<\/faultstring>/)?.[1] ?? 'HTTP ' + res.status}`);
  }
  throw new Error('Tarion login failed — ' + faults.join(' | '));
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

// ---- NP letter parsing (same rules as vbiParseNp_ / vbiParseNpItems_)
export function parseNp(text: string) {
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
export function parseNpItems(text: string) {
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
  // rebuild lines from text positions so the item table reads row by row
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

Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    let db, companyId: string;
    const cron = req.headers.get('x-cron-secret');
    if (cron && cron === Deno.env.get('CM_CRON_SECRET')) {
      db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      companyId = Deno.env.get('CM_COMPANY_ID')!;
    } else {
      db = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: { user } } = await db.auth.getUser();
      if (!user) return json({ error: 'Sign in required.' }, 401);
      const { data: m } = await db.from('cm_members').select('company_id, role').eq('user_id', user.id).eq('role', 'manager').limit(1).maybeSingle();
      if (!m) return json({ error: 'Managers only.' }, 403);
      companyId = m.company_id;
    }
    const s = await login();
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
      try {
        const c = cases[cid]; if (!c) throw new Error('case not returned');
        const links = await soqlIn(s, 'SELECT ContentDocumentId FROM ContentDocumentLink WHERE LinkedEntityId IN ', [c.Id, c.ParentId].filter(Boolean));
        const docIds = [...new Set(links.map(l => l.ContentDocumentId))];
        let docs: Rec[] = docIds.length ? await soqlIn(s, 'SELECT Id, Title, Description, FileExtension, CreatedDate FROM ContentVersion WHERE IsLatest = true AND ContentDocumentId IN ', docIds) : [];
        docs = docs.filter(v => [v.Title, v.Description].some(t => t && NP_MATCH.test(String(t)))).sort((a, b) => String(b.CreatedDate).localeCompare(String(a.CreatedDate)));
        // newest letter already processed for this case? skip the download entirely
        const { data: known } = await db.from('cm_cases').select('np_version').eq('company_id', companyId).eq('case_number', String(c.CaseNumber)).maybeSingle();
        if (docs[0] && known?.np_version === docs[0].Id) { results.unchanged = (results.unchanged ?? 0) + 1; continue; }
        let info = { caseNumber: '', enrolment: '', address: '', homeowner: '', date: '', time: '' }, items: { n: number; text: string }[] = [], npUrl = '';
        for (const d of docs) {   // newest first; older letters are searched only for an item list (the Reinspection NP has none)
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
    return json({ checked: caseIds.length, results, errors });
  } catch (e) { return json({ checked: 0, results: {}, errors: [(e as Error).message] }); }
});
