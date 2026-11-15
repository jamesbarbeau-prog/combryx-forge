import { PGlite } from '@electric-sql/pglite';
import fs from 'fs';
const dir=new URL('../migrations/', import.meta.url).pathname;
const db=new PGlite();
const ok=(c,m)=>{console.log((c?'PASS ':'FAIL ')+m); if(!c) process.exitCode=1;};
await db.exec(`create schema auth; create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.sub',true),'')::uuid $$;
create role authenticated nologin; grant usage on schema public, auth to authenticated; grant select on auth.users to authenticated;
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
