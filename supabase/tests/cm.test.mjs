import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const dir=new URL('../migrations/', import.meta.url).pathname;
const db=new PGlite();
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
await db.exec(`create schema auth; create table auth.users(id uuid primary key, email text);
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', current_setting('request.jwt.email', true)) $$;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub',true),'')::uuid $$;
create role authenticated nologin; create role anon nologin; create role service_role nologin; grant usage on schema public, auth to authenticated;
create schema storage; create table storage.buckets(id text primary key, name text, public boolean); create table storage.objects(id uuid, bucket_id text, name text); alter table storage.objects enable row level security; create function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1,'/') $$;
create table warranty_communities(id uuid primary key default gen_random_uuid(), name text);
create table warranty_lots(id uuid primary key default gen_random_uuid(), company_id uuid, community_id uuid, lot_number text, homeowner_name text, homeowner_email text, phone_primary text, address text, enrollment_number text, closing_date date);`);
for(const f of fs.readdirSync(dir).sort()){ try{ await db.exec(fs.readFileSync(dir+f,'utf8')); console.log('applied',f);}catch(e){console.log('MIGRATION ERROR',f,e.message); process.exit(1);} }
await db.exec(`grant all on all tables in schema public to authenticated; grant execute on all functions in schema public to authenticated;`);
const A='11111111-1111-1111-1111-111111111111',B='22222222-2222-2222-2222-222222222222',U1='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',U2='bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
await db.exec(`insert into auth.users values ('${U1}','james@a.com'),('${U2}','other@b.com');
insert into cm_members values ('${A}','${U1}','manager'),('${B}','${U2}','manager');
select cm_seed_company('${A}'); select cm_seed_company('${B}');
insert into warranty_communities(id,name) values ('33333333-3333-3333-3333-333333333333','Westwood');
insert into warranty_lots(company_id,community_id,lot_number,homeowner_name,homeowner_email,phone_primary,address,enrollment_number) values ('${A}','33333333-3333-3333-3333-333333333333','506','Pat Owner','pat@x.com','613-555-0100','12 Elm St, Ottawa ON K1A 0A1','H-123 456');`);
const as=async(u)=>{await db.exec(`reset role; select set_config('request.jwt.sub','${u}',false); set role authenticated;`)};
const q=async(s,p)=> (await db.query(s,p)).rows;
await as(U1);
// intake: new case
let r=(await q(`select cm_ingest_np($1,$2) as r`,[A,{caseNumber:'900100',enrolment:'H123456',homeowner:'',address:'12 Elm St, Ottawa ON K1A 0A1',formType:'Year 1 Claim Form',inspectionDate:'2099-01-10',inspectionTime:'2:00 PM',items:[{n:1,text:'INTERIOR - Floor squeak'},{n:2,text:'EXTERIOR - Siding gap'},{n:3,text:'INTERIOR - Drywall crack'}]}]))[0].r;
ok(r.action==='create_case'&&r.status==='applied','intake auto-creates new case');
const cid=r.caseId;
r=(await q(`select cm_ingest_np($1,$2) as r`,[A,{caseNumber:'900100',address:'x',inspectionDate:'2099-01-10',items:[{n:1,text:'INTERIOR - Floor squeak'}]}]))[0].r;
ok(r.action==='duplicate','same doc again = duplicate');
r=(await q(`select cm_ingest_np($1,$2) as r`,[A,{caseNumber:'900100',inspectionDate:'2099-02-01',items:[]}]))[0].r;
ok(r.action==='reschedule','new date before inspection = reschedule');
r=(await q(`select cm_ingest_np($1,$2) as r`,[A,{caseNumber:'900100',inspectionDate:'2099-02-01',items:[{n:1,text:'TOTALLY different thing here'}]}]))[0].r;
ok(r.action==='review'&&r.status==='pending','differing items = review');
r=(await q(`select cm_link_warranty_data($1) as r`,[A]))[0].r;
let c=(await q(`select * from cm_cases where id=$1`,[cid]))[0];
ok(r.linked===1&&c.homeowner==='Pat Owner'&&c.lot==='506'&&c.community==='Westwood','merge fills owner/lot/community by enrolment');
let cy=(await q(`select * from cm_cycle_view where case_id=$1`,[cid]))[0];
ok(cy.stage==='Scheduled'&&cy.total===3,'stage Scheduled, 3 items');
await db.query(`update cm_cycles set inspection_date='2020-01-01' where id=$1`,[cy.id]);
ok((await q(`select stage from cm_cycle_view where id=$1`,[cy.id]))[0].stage==='Awaiting CAR','past inspection = Awaiting CAR');
r=(await q(`select cm_apply_car($1,$2,(now()::date-5),'car.pdf',$3) as r`,[cid,cy.id,JSON.stringify([{num:1,outcome:'Warranted',desc:'INTERIOR - Floor squeak'},{num:2,outcome:'Not Warranted',desc:'Siding is within tolerance per CPG'},{num:3,outcome:'Warranted',desc:'INTERIOR - Drywall crack'},{num:9,outcome:'Warranted',desc:'x'}])]))[0].r;
ok(r.updated===3&&r.notWarranted===1&&r.unmatched.length===1&&r.descReplaced.length===1,'CAR apply counts');
cy=(await q(`select * from cm_cycle_view where id=$1`,[cy.id]))[0];
ok(cy.stage==='CAR Received'&&cy.days_left===25&&cy.unscheduled===2&&cy.open_items===2,'CAR Received, 25 days left, 2 unscheduled');
const items=await q(`select id,item_number from cm_items where case_id=$1 order by item_number`,[cid]);
const b=(await q(`select cm_create_settlement_batch($1,$2::uuid[],1000,null,current_date,'','') as id`,[cid,[items[0].id]]))[0].id;
let i1=(await q(`select * from cm_items where id=$1`,[items[0].id]))[0];
ok(Number(i1.offer_amount)===1689.35&&i1.resolution_status==='Pending','batch prices 1000 x1.30x1.15x1.13 = 1689.35, Pending');
let e=null; try{await db.query(`update cm_items set offer_amount=5 where id=$1`,[items[0].id]);}catch(x){e=x.message}
ok(e&&/awaiting signature/.test(e),'pending item cannot be re-priced');
e=null; try{await db.query(`select cm_decide_settlement_batch($1,'ACCEPTED','')`,[b]);}catch(x){e=x.message}
ok(e&&/signed release/.test(e),'accept requires signed release ref');
await db.query(`select cm_decide_settlement_batch($1,'ACCEPTED','box://signed.pdf')`,[b]);
e=null; try{await db.query(`update cm_items set description='x' where id=$1`,[items[0].id]);}catch(x){e=x.message}
ok(e&&/locked/.test(e),'settled item is locked');
ok((await q(`select current_setting('cm.bypass',true) as b`))[0].b!=='1','bypass flag is off after RPC');
// re-inspection cycle supersedes
const c2=(await q(`select cm_add_cycle($1,'Re-inspection: Heat','2099-03-01','','',$2::uuid[]) as id`,[cid,[items[2].id]]))[0].id;
let v=await q(`select seq,stage,superseded,total from cm_cycle_view where case_id=$1 order by seq`,[cid]);
ok(v[0].stage==='Closed'&&v[1].stage==='Scheduled'&&v[1].total===1,'cycle 1 closes once its remaining items resolved/moved; cycle 2 scheduled');
r=(await q(`select cm_reset_car($1) as r`,[cy.id]))[0].r;
ok(r.cleared>=1&&r.reopened===1,'CAR reset re-opens auto-closed item');
// RLS isolation
await as(U2);
ok((await q(`select count(*)::int n from cm_cases`))[0].n===0 && (await q(`select count(*)::int n from cm_cycle_view`))[0].n===0,'other company sees nothing (tables + view)');
e=null; try{await db.query(`insert into cm_cases(company_id,case_number) values ($1,'X')`,[A]);}catch(x){e=x.message}
ok(e&&/row-level security/.test(e),'other company cannot insert into tenant A');
e=null; try{await db.query(`select cm_close_case($1,'hack')`,[cid]);}catch(x){e=x.message}
await as(U1);
ok((await q(`select closure_reason from cm_cases where id=$1`,[cid]))[0].closure_reason==='','other company cannot close tenant A case via RPC');
e=null; try{await db.query(`select cm_link_warranty_data($1)`,[B]);}catch(x){e=x.message}
ok(e&&/Managers only/.test(e),'definer merge function refuses non-members');
await db.query(`select cm_close_case($1,'Test close')`,[cid]);
ok((await q(`select count(*)::int n from cm_cycles where case_id=$1 and closed_on is null`,[cid]))[0].n===0,'closing a case closes all its cycles');

// ---------- review fixes + blank workspace (run as a brand-new user, no access to auth.users)
const U3='cccccccc-cccc-cccc-cccc-cccccccccccc', U4='dddddddd-dddd-dddd-dddd-dddddddddddd';
await db.exec(`reset role; insert into auth.users values ('${U3}','new@buyer.com'),('${U4}','team@buyer.com'); select set_config('request.jwt.email','new@buyer.com',false);`);
await as(U3);
const tryx=async(s,p)=>{try{await db.query(s,p);return null}catch(e){return e.message}};
const W=(await q(`select cm_create_workspace('Buyer Homes') as id`))[0].id;
ok(!!W&&(await q(`select role from cm_members where company_id=$1`,[W]))[0].role==='manager','new user creates a blank workspace and becomes manager');
ok((await q(`select count(*)::int n from cm_cases where company_id=$1`,[W]))[0].n===0,'workspace starts with no cases (blank app)');
ok((await tryx(`select cm_create_workspace('Again')`))!==null,'a user cannot create a second workspace');
ok((await q(`select count(*)::int n from cm_lists where company_id=$1`,[W]))[0].n>0,'default lists are seeded');
await q(`select cm_add_member($1,'team@buyer.com','coordinator')`,[W]);
ok((await q(`select count(*)::int n from cm_list_members($1)`,[W]))[0].n===2,'manager adds a teammate by email and lists members');
ok((await tryx(`select cm_add_member($1,'nobody@x.com','viewer')`,[W]))!==null,'unknown email is rejected');
await as(U4);
ok((await tryx(`select cm_add_member($1,'new@buyer.com','manager')`,[W]))!==null,'a coordinator cannot add members');
await as(U3);
// anon-style caller (no membership) cannot run the merge for someone else's company
await db.exec(`reset role; select set_config('request.jwt.sub','${U4}',false); set role authenticated;`);
ok((await tryx(`select cm_link_warranty_data($1)`,[A]))!==null,'non-member cannot run merge for another company');
await as(U3);
// case, items, cycle
const mk=async(n,desc)=>{const c=(await q(`insert into cm_cases(company_id,case_number,enrolment) values ($1,$2,'H'||$2) returning id`,[W,n]))[0].id;
  for(const i of [1,2]) await q(`insert into cm_items(company_id,case_id,item_number,description) values ($1,$2,$3,'d')`,[W,c,i]);
  return {c, cy:(await q(`select id from cm_cycles where case_id=$1`,[c]))[0].id};};
let k=await mk('T1');
ok((await q(`select cm_close_case($1,'done') as r`,[k.c])).length===1,'closing a case works without reading auth.users');
await q(`select cm_reopen_case($1,'new evidence')`,[k.c]);
ok((await q(`select manager_status from cm_cases where id=$1`,[k.c]))[0].manager_status==='ACTIVE','case can be re-opened with a reason');
ok((await tryx(`select cm_reopen_case($1,'')`,[k.c]))!==null,'re-open needs a reason');
// direct cash-status writes blocked
const its=await q(`select id from cm_items where case_id=$1 order by item_number`,[k.c]);
ok((await tryx(`update cm_items set resolution_status='Settled' where id=$1`,[its[0].id]))!==null,'cash status cannot be set by a direct table write');
// audit log append-only
await q(`select cm_audit_log($1,'X','y')`,[k.c]).catch(()=>{});
ok((await q(`with d as (delete from cm_audit where case_id=$1 returning 1) select count(*)::int n from d`,[k.c]))[0].n===0,'audit rows cannot be deleted');
ok((await q(`with d as (delete from cm_comms where case_id=$1 returning 1) select count(*)::int n from d`,[k.c]))[0].n===0,'activity log rows cannot be deleted');
// claim booking with a settled warranted item
await q(`select cm_apply_car($1,$2,current_date,'f',$3)`,[k.c,k.cy,JSON.stringify([{num:1,outcome:'Warranted'},{num:2,outcome:'Warranted'}])]);
const bb=(await q(`select cm_create_settlement_batch($1,$2::uuid[],100,null,current_date,'','') as id`,[k.c,[its[0].id]]))[0].id;
await q(`select cm_decide_settlement_batch($1,'ACCEPTED','ref')`,[bb]);
ok((await tryx(`select cm_book_claim($1,'2099-01-01')`,[k.c]))===null,'claim inspection can be booked when another item is already cash-settled');
ok((await q(`select resolution_status from cm_items where id=$1`,[its[0].id]))[0].resolution_status==='Settled','the settled item stays settled and is not moved');
// full & final after an earlier partial
await q(`update cm_items set offer_amount=50 where id=$1`,[its[1].id]);
await q(`select cm_generate_full_release($1,null,current_date,'',false)`,[k.c]);
ok((await tryx(`select cm_generate_full_release($1,null,current_date,'',false)`,[k.c]))!==null,'a second open Full & Final offer is refused');
ok((await tryx(`select cm_resolve_case_cash($1,'accepted','')`,[k.c]))!==null,'accepting a full release needs a signed reference');
ok((await tryx(`select cm_resolve_case_cash($1,'accepted','DOC-1')`,[k.c]))===null,'Full & Final accepted after an earlier partial settlement');
ok((await q(`select is_closed from cm_case_view where id=$1`,[k.c]))[0].is_closed===true,'accepting Full & Final closes the case');
// intake: repeated sync noise + same-letter date+items
const np2={caseNumber:'T2',address:'1 A St, Ottawa ON K1A 0A1',inspectionDate:'2099-01-10',npVersionId:'V1',items:[{n:1,text:'INTERIOR - a thing'}]};
await q(`select cm_ingest_np($1,$2)`,[W,np2]);
for(let i=0;i<3;i++) await q(`select cm_ingest_np($1,$2)`,[W,np2]);
ok((await q(`select count(*)::int n from cm_intake_queue where company_id=$1 and case_number='T2'`,[W]))[0].n===1,'same letter version re-synced = one log row, not one per run');
const diff2={...np2,npVersionId:'V2',items:[{n:1,text:'EXTERIOR - something else entirely'}]};
for(let i=0;i<3;i++) await q(`select cm_ingest_np($1,$2)`,[W,diff2]);
ok((await q(`select count(*)::int n from cm_intake_queue where company_id=$1 and case_number='T2' and status='pending'`,[W]))[0].n===1,'an unresolved review is queued once, not every sync');
await q(`insert into cm_cases(company_id,case_number) values ($1,'T3')`,[W]);
await q(`select cm_ingest_np($1,$2)`,[W,{caseNumber:'T3',inspectionDate:'2099-05-05',items:[{n:1,text:'INTERIOR - x'}]}]);
ok((await q(`select cy.inspection_date::text d from cm_cycles cy join cm_cases c on c.id=cy.case_id where c.case_number='T3'`))[0].d==='2099-05-05','items and a new date in one letter are both applied');
// tenant isolation for the new workspace
await as(U1);
ok((await q(`select count(*)::int n from cm_cases where company_id=$1`,[W]))[0].n===0,'another company cannot see the new workspace');
