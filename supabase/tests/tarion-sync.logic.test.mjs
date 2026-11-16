import assert from 'node:assert/strict';
const env = { SUPABASE_URL:'https://x.supabase.co', SUPABASE_SERVICE_ROLE_KEY:'srv', SUPABASE_ANON_KEY:'anon', CM_CRON_SECRET:'cs', CM_COMPANY_ID:'co1',
  TARION_USERNAME:'u@x.bl', TARION_PASSWORD:'pw', TARION_ORG_ID:'00DX', MAIL_WEBHOOK_URL:'https://hook.test/x', MAIL_WEBHOOK_SECRET:'ms', APP_URL:'https://app.test' };
let handler; globalThis.Deno = { env:{ get:k=>env[k] }, serve:h=>{ handler=h; } };

// ---------- fake database ----------
const T = { warranty_form_map:[{tarion_code:'YREND'},{tarion_code:'CEDEF'}], tarion_form_imports:[], warranty_items:[], warranty_item_evidence:[], warranty_intake_recipients:[{company_id:'co1',email:'Coord@Claridge.com',community_id:null,is_active:true}], notifications:[], cm_sync_runs:[], cm_settings:[{company_id:'co1'}], cm_cases:[] };
const stored = []; let id = 0;
function table(name){ const f=[]; let mode='select', patch=null, rows=null, single=false, head=false, lim=1e9;
  const b = { select:(c,o)=>{ if(mode==='select'){} head=!!o?.head; return b; }, eq:(k,v)=>{f.push(r=>r[k]===v);return b;}, in:(k,v)=>{f.push(r=>v.includes(r[k]));return b;},
    like:(k,p)=>{const rx=new RegExp('^'+p.replace(/%/g,'.*'));f.push(r=>rx.test(r[k]??''));return b;},
    not:(k,op,v)=>{f.push(r=>r[k]!==null&&r[k]!==undefined);return b;}, or:(s)=>{const cols=s.split(',').map(x=>x.split('.')[0]);f.push(r=>cols.some(c=>r[c]==null));return b;},
    order:()=>b, limit:n=>{lim=n;return b;}, maybeSingle:()=>{single=true;return b;},
    insert:(r)=>{mode='insert';rows=Array.isArray(r)?r:[r];return b;}, update:(p)=>{mode='update';patch=p;return b;},
    then:(res,rej)=>{ try{ const tb=(T[name]??=[]); let out;
      if(mode==='insert'){ rows.forEach(r=>{ if(name==='warranty_item_evidence'&&tb.some(x=>x.storage_path===r.storage_path)) throw new Error('dup'); tb.push({id:'id'+(++id),...r}); }); out={data:null,error:null}; }
      else if(mode==='update'){ tb.filter(r=>f.every(g=>g(r))).forEach(r=>Object.assign(r,patch)); out={data:null,error:null}; }
      else { const m=tb.filter(r=>f.every(g=>g(r))).slice(0,lim); out= head?{count:m.length,data:null}:{data:single?(m[0]??null):m,error:null}; }
      res(out);}catch(e){res({data:null,error:{message:e.message}});} } };
  return b; }
const fakeClient = { from:table, storage:{from:(bk)=>({upload:async(p,buf)=>{stored.push({bk,p,len:buf.byteLength});return{error:null};}})},
  auth:{getUser:async()=>({data:{user:null}})},
  rpc: async (fn,a)=>{ if(fn==='tw_ingest_form'){ const p=a.p; const ex=T.tarion_form_imports.find(x=>x.tarion_case_id===p.tarionCaseId);
      if(ex&&(ex.status==='imported'||!p.retry)) return {data:{action:'exists'}};
      if(p.enrolment!=='H1'){ const row={id:'imp'+(++id),company_id:a.p_company,tarion_case_id:p.tarionCaseId,tarion_case_number:p.caseNumber,form_code:p.formCode,owner_name:p.owner,address:p.address,status:'needs_review',reason:'No lot has enrolment '+p.enrolment+' yet',payload:p,items_count:p.items.length,photos_complete:false,photos_found:0,photos_done:0,created_at:new Date().toISOString()}; if(ex)Object.assign(ex,row); else T.tarion_form_imports.push(row); return {data:{action:'review'}}; }
      const caseId='case'+(++id); p.items.forEach(i=>T.warranty_items.push({id:'it'+(++id),case_id:caseId,item_number:i.num,tarion_deficiency_id:i.id}));
      T.tarion_form_imports.push({id:'imp'+(++id),company_id:a.p_company,tarion_case_id:p.tarionCaseId,tarion_case_number:p.caseNumber,form_code:p.formCode,owner_name:p.owner,address:p.address,after_sales_email:p.afterSales,status:'imported',case_id:caseId,community_id:'comm1',items_count:p.items.length,photos_complete:false,photos_found:0,photos_done:0,created_at:new Date().toISOString()});
      return {data:{action:'created'}}; } return {data:{}}; } };
globalThis.__createClient = ()=>fakeClient;

// ---------- fake Salesforce ----------
const calls=[]; const mails=[];
const J=r=>new Response(JSON.stringify({done:true,records:r}),{status:200});
globalThis.fetch = async (url,opt)=>{ url=String(url);
  if(/Soap/.test(url)){ calls.push('login '+url); return new Response('<r><serverUrl>https://tarion.my.salesforce.com/x</serverUrl><sessionId>SID</sessionId></r>'); }
  if(url.startsWith('https://hook.test')){ mails.push(JSON.parse(opt.body)); return new Response('ok'); }
  if(/VersionData|Attachment\/.+\/Body/.test(url)) return new Response(new Uint8Array([1,2,3,4]),{headers:{'content-type':'image/jpeg'}});
  const q=decodeURIComponent((url.match(/[?&]q=([^&]+)/)||[])[1]||''); calls.push(q.slice(0,70));
  if(/FROM WorkOrder/.test(q)) return J([]);
  if(/FROM Case WHERE CreatedDate/.test(q)) return J([
    {Id:'500A',CaseNumber:'09500001',Case_Type__c:'YREND',ContactId:'C1',Enrolment_Number__c:'E1',CreatedDate:'2026-11-14T10:00:00Z',RecordType:{Name:'Warranty'}},
    {Id:'500B',CaseNumber:'09500002',Case_Type__c:'YREND',ContactId:'C2',Enrolment_Number__c:'E2',CreatedDate:'2026-11-14T11:00:00Z',RecordType:null},
    {Id:'500R',CaseNumber:'09500003',Case_Type__c:'YREND',ContactId:'C1',Enrolment_Number__c:'E1',CreatedDate:'2026-11-14T12:00:00Z',RecordType:{Name:'RFC'}}]);
  if(/FROM Contact/.test(q)) return J([{Id:'C1',Name:'Ann Owner'},{Id:'C2',Name:'Bo Owner'}]);
  if(/FROM Enrolment__c/.test(q)) return J([{Id:'E1',Name:'H1',Street_Number__c:'12',Street_Name__c:'Oak St',Postal_Code__c:'K1A 0B1',City__c:'CT',Vendor_Builder_After_Sales_Contact__c:'svc@claridgehomes.com'},{Id:'E2',Name:'H2',Street_Number__c:'9',Street_Name__c:'Elm',City__c:'CT'}]);
  if(/FROM City__c/.test(q)) return J([{Id:'CT',Name:'OTTAWA'}]);
  if(/FROM Deficiency__c/.test(q)) return J(q.includes("'500A'")?[{Id:'D2',Item__c:'2',Description__c:'Door rubs',Room_Area__c:'Hall'},{Id:'D1',Item__c:'1',Description__c:'Cracked tile',Interior_Exterior__c:'INTERIOR',Floor_Level__c:'Floor 01',Room_Area__c:'Kitchen'}]:[{Id:'D3',Item__c:'1',Description__c:'x'}]);
  if(/FROM ContentDocumentLink/.test(q)) return J([{ContentDocumentId:'DOC1',LinkedEntityId:'D1'},{ContentDocumentId:'DOC2',LinkedEntityId:'D1'}]);
  if(/FROM ContentVersion WHERE IsLatest = true AND ContentDocumentId/.test(q)) return J([{Id:'V1',Title:'crack',FileExtension:'jpg',CreatedDate:'2026-11-14T10:05:00Z',ContentDocumentId:'DOC1'},{Id:'V2',Title:'note',FileExtension:'pdf',CreatedDate:'x',ContentDocumentId:'DOC2'}]);
  if(/FROM ContentVersion WHERE IsLatest = true AND \(Case_ID__c/.test(q)) return new Response('[{"message":"No such column Case_ID__c"}]',{status:400});
  if(/FROM Attachment/.test(q)) return J([{Id:'AT1',Name:'door.png',ContentType:'image/png',CreatedDate:'2026-11-14T10:06:00Z',ParentId:'D2'}]);
  return new Response('not mocked '+q,{status:404}); };

await import(process.env.BUNDLE || './bundle.mjs');
const run=async(body={})=>{ const r=await handler(new Request('https://f',{method:'POST',headers:{'x-cron-secret':'cs','content-type':'application/json'},body:JSON.stringify(body)})); return r.json(); };

let r = await run({mode:'forms'});
console.log(JSON.stringify({forms:r.forms,photos:r.photos,digest:r.digest},null,1));
assert.equal(r.forms.results.new_forms,2,'RFC case must be ignored'); assert.equal(r.forms.results.created,1); assert.equal(r.forms.results.review,1);
assert.ok(calls.some(c=>c.startsWith('login https://login.salesforce.com/services/Soap/u/54.0/00DX')),'org id in address first');
assert.equal(T.warranty_item_evidence.length,2,'jpg via link + png via attachment; pdf ignored'); assert.equal(stored.length,2);
assert.ok(stored.every(s=>s.bk==='warranty-photos'&&s.p.startsWith('co1/09500001/')),'private bucket, company folder'); console.log(stored.map(s=>s.p));
const imp=T.tarion_form_imports.find(x=>x.status==='imported'); assert.equal(imp.photos_complete,true); assert.equal(imp.photos_done,2);
assert.equal(mails.length,1,'one combined digest to the configured coordinator');
console.log(mails.map(m=>m.to+' | '+m.subject));
assert.ok(mails[0].html.includes('Ann Owner')&&mails[0].html.includes('12 Oak St, OTTAWA, K1A 0B1')&&mails[0].html.includes('2/2'));
assert.ok(T.notifications.length===1&&T.notifications[0].title.startsWith('1 new'));
assert.ok(T.tarion_form_imports.every(x=>x.emailed_at),'marked emailed');
// second run: nothing new, nothing re-sent
const before=mails.length; r = await run({mode:'forms'}); assert.equal(r.forms.results.new_forms,0); assert.equal(mails.length,before,'no duplicate email');
// the waiting form gets retried and imported once its lot exists (fake rpc: enrolment H2 now "matches")
T.tarion_form_imports.find(x=>x.status==='needs_review').payload.enrolment='H1';
r = await run({mode:'forms'}); assert.equal(r.forms.results.created_after_review,1,'retry creates it'); console.log('retry ok');
console.log('ALL PASS');
