-- =============================================================================
-- Conciliation Manager (cm_*) — Postgres port of the Apps Script / Google Sheet app.
-- Sheet tab            -> table
--   Register           -> cm_cases
--   Cycles             -> cm_cycles
--   Items              -> cm_items
--   Comms Log          -> cm_comms          (+ cm_audit for the audit trail)
--   Settlement Batches -> cm_settlement_batches
--   Settings (lists)   -> cm_lists / cm_settings
-- Multi-tenant: every row carries company_id; RLS keys off cm_members (Supabase Auth).
-- The stage engine (Scheduled -> Awaiting CAR -> CAR Received -> Closed) is a VIEW, so it is
-- computed on every read and can never go stale. Multi-row business actions are RPCs so they are atomic.
-- =============================================================================

create table if not exists cm_members (
  company_id uuid not null,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('manager','coordinator','viewer')),
  created_at timestamptz not null default now(),
  primary key (company_id, user_id)
);

create table if not exists cm_settings (
  company_id          uuid primary key,
  timezone            text    not null default 'America/Toronto',
  car_response_days   int     not null default 30,
  repair_period_days  int     not null default 120,
  reminder_cadence_days int   not null default 7,
  offer_base_markup   numeric not null default 1.30,
  offer_overhead      numeric not null default 1.15,
  offer_hst           numeric not null default 1.13,
  admin_notify_email  text,
  updated_at          timestamptz not null default now()
);

create table if not exists cm_lists (
  company_id uuid not null,
  list_key   text not null check (list_key in ('item_statuses','likelihoods','exceptions','comm_types','case_statuses','form_types','defect_categories','communities','cycle_types','team','trades')),
  "values"   text[] not null default '{}',
  primary key (company_id, list_key)
);

create table if not exists cm_cases (
  id            uuid primary key default gen_random_uuid(),
  company_id    uuid not null,
  case_number   text not null,
  homeowner     text not null default '',
  address       text not null default '',
  lot           text not null default '',
  community     text not null default '',
  enrolment     text not null default '',
  form_type     text not null default '',
  status        text not null default 'Conciliation Requested',
  property_type text not null default 'freehold' check (property_type in ('freehold','common_elements')),
  supervisor        text not null default '',
  supervisor_email  text not null default '',
  coordinator_email text not null default '',
  owner_email   text not null default '',
  owner_phone   text not null default '',
  possession_date date,
  box_link      text not null default '',
  notes         text not null default '',
  offer_prepared_on date,
  manager_status text not null default 'ACTIVE',
  closure_reason text not null default '',
  case_closed_on timestamptz,
  manager_stage  text not null default '',
  scope_locked_on date,
  claim_booked_on date,
  claim_inspection_date date,
  claim_outcome text not null default '',
  claim_outcome_date date,
  tarion_claim_reference text not null default '',
  claim_amount numeric(12,2) not null default 0,
  builder_15_percent numeric(12,2) not null default 0,
  total_builder_exposure numeric(12,2) not null default 0,
  claim_outcome_notes text not null default '',
  legacy_ref    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (company_id, case_number)
);
create index if not exists cm_cases_company_idx on cm_cases(company_id);

create table if not exists cm_cycles (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  case_id     uuid not null references cm_cases(id) on delete cascade,
  seq         int  not null,
  type        text not null default 'Initial Inspection',
  inspection_date date,
  inspection_time text not null default '',
  car_received_on date,
  closed_on   date,
  notes       text not null default '',
  offer_prepared_on date,
  offer_reminder_last_sent date,
  offer_reminder_count int not null default 0,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  unique (case_id, seq)
);
create index if not exists cm_cycles_case_idx on cm_cycles(case_id);

create table if not exists cm_items (
  id           uuid primary key default gen_random_uuid(),
  company_id   uuid not null,
  case_id      uuid not null references cm_cases(id) on delete cascade,
  item_number  int  not null,
  description  text not null default '',
  original_note text not null default '',
  likelihood   text not null default '',
  internal_estimate numeric(12,2) not null default 0,
  trade        text not null default '',
  scope        text not null default '',
  offer_amount numeric(12,2) not null default 0,
  exception    text not null default 'None',
  status       text not null default 'Open',
  last_action  text not null default '',
  car_outcome  text not null default '',
  car_notes    text not null default '',
  car_date     date,
  scheduled_on date,
  completed_on date,
  verified_on  timestamptz,
  cpg          text not null default '',
  room         text not null default '',
  category     text not null default '',
  resolution_method text not null default '',
  resolution_status text not null default '' check (resolution_status in ('','Pending','Settled')),
  resolution_date timestamptz,
  tarion_analysis text not null default '',
  cycle_id     uuid references cm_cycles(id) on delete restrict,
  investigation_cycle_id uuid references cm_cycles(id) on delete set null,
  initial_warranted text not null default '',
  scope_status text not null default 'Keep Open',
  status_request_sent date,
  status_request_count int not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (case_id, item_number)
);
create index if not exists cm_items_case_idx  on cm_items(case_id);
create index if not exists cm_items_cycle_idx on cm_items(cycle_id);

create table if not exists cm_comms (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  case_id     uuid not null references cm_cases(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  type        text not null default 'Internal Note',
  by_name     text not null default '',
  summary     text not null default ''
);
create index if not exists cm_comms_case_idx on cm_comms(case_id, occurred_at desc);

create table if not exists cm_audit (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  case_id     uuid references cm_cases(id) on delete cascade,
  occurred_at timestamptz not null default now(),
  user_id     uuid,
  action      text not null,
  detail      text not null default ''
);
create index if not exists cm_audit_case_idx on cm_audit(case_id, occurred_at desc);

create table if not exists cm_documents (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  case_id     uuid not null references cm_cases(id) on delete cascade,
  cycle_id    uuid references cm_cycles(id) on delete set null,
  item_number int,
  folder      text not null default 'Evidence',
  file_name   text not null,
  storage_path text not null,
  uploaded_by uuid,
  uploaded_at timestamptz not null default now()
);

create table if not exists cm_settlement_batches (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null,
  case_id     uuid not null references cm_cases(id) on delete cascade,
  cycle_id    uuid references cm_cycles(id) on delete set null,
  kind        text not null default 'selected' check (kind in ('full','selected')),
  item_ids    uuid[] not null default '{}',
  item_numbers text not null default '',
  base_total  numeric(12,2),
  multiplier  numeric,
  calculated_total numeric(12,2),
  negotiated_total numeric(12,2),
  final_total numeric(12,2) not null default 0,
  release_date date,
  reason      text not null default '',
  release_path text not null default '',
  decision    text not null default 'OFFERED' check (decision in ('OFFERED','ACCEPTED','DECLINED')),
  decision_date timestamptz,
  signed_release_ref text not null default '',
  notes       text not null default '',
  created_at  timestamptz not null default now(),
  created_by  uuid
);
create index if not exists cm_batches_case_idx on cm_settlement_batches(case_id);

-- Tie the tenant root to the app's companies table when it exists.
do $$ begin
  if to_regclass('public.companies') is not null then
    begin
      alter table cm_members add constraint cm_members_company_fk foreign key (company_id) references public.companies(id) on delete cascade;
    exception when duplicate_object then null; end;
  end if;
end $$;

-- ------------------------------------------------------------------ helpers
create or replace function cm_has_role(p_company uuid, p_roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from cm_members m where m.company_id = p_company and m.user_id = auth.uid() and m.role = any(p_roles));
$$;

create or replace function cm_tz(p_company uuid) returns text language sql stable as $$
  select coalesce((select timezone from cm_settings where company_id = p_company), 'America/Toronto');
$$;
create or replace function cm_today(p_company uuid) returns date language sql stable as $$
  select (now() at time zone cm_tz(p_company))::date;
$$;

-- weekdays only (no stat-holiday calendar, same as the Sheet version)
create or replace function cm_business_days(p_target date, p_today date) returns int language sql immutable as $$
  select case when p_target is null then null
              when p_target <= p_today then p_target - p_today
              else (select count(*)::int from generate_series(p_today + 1, p_target, interval '1 day') d where extract(isodow from d) < 6) end;
$$;

create or replace function cm_set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create or replace function cm_log(p_case uuid, p_type text, p_by text, p_summary text) returns void
language plpgsql as $$
declare v_company uuid;
begin
  select company_id into v_company from cm_cases where id = p_case;
  insert into cm_comms(company_id, case_id, type, by_name, summary) values (v_company, p_case, p_type, coalesce(p_by,''), p_summary);
end $$;

create or replace function cm_audit_log(p_case uuid, p_action text, p_detail text) returns void
language plpgsql as $$
declare v_company uuid;
begin
  select company_id into v_company from cm_cases where id = p_case;
  insert into cm_audit(company_id, case_id, user_id, action, detail) values (v_company, p_case, auth.uid(), p_action, coalesce(p_detail,''));
end $$;

create or replace function cm_actor() returns text language sql stable as $$
  select coalesce((select email from auth.users where id = auth.uid()), 'system');
$$;

-- RPCs set this so locked rows can be transitioned by the sanctioned paths only.
create or replace function cm_bypass_on() returns void language sql as $$ select set_config('cm.bypass','1',true); $$;
create or replace function cm_bypass_off() returns void language sql as $$ select set_config('cm.bypass','',true); $$;

-- ------------------------------------------------------------------ triggers
create trigger cm_cases_updated before update on cm_cases for each row execute function cm_set_updated_at();
create trigger cm_items_updated before update on cm_items for each row execute function cm_set_updated_at();

-- every case gets its first inspection cycle, like createCaseNew()
create or replace function cm_case_first_cycle() returns trigger language plpgsql as $$
begin
  insert into cm_cycles(company_id, case_id, seq, type) values (new.company_id, new.id, 1, 'Initial Inspection')
  on conflict (case_id, seq) do nothing;
  return new;
end $$;
create trigger cm_cases_a_first_cycle after insert on cm_cases for each row execute function cm_case_first_cycle();

-- ONE definition of "closed" (managerClosedMap_): replaces the dashboard self-heal.
create or replace function cm_case_is_closed(c cm_cases) returns boolean language sql immutable as $$
  select nullif(btrim(c.closure_reason),'') is not null
      or lower(btrim(c.manager_status)) in ('closed','cancelled')
      or upper(btrim(c.manager_stage)) = 'CLOSED'
      or lower(btrim(c.status)) in ('closed','settled','cancelled conciliation','cancelled')
      or c.case_closed_on is not null;
$$;

create or replace function cm_close_cycles_on_closed_case() returns trigger language plpgsql as $$
begin
  if cm_case_is_closed(new) then
    update cm_cycles set closed_on = cm_today(new.company_id) where case_id = new.id and closed_on is null;
  end if;
  return new;
end $$;
create trigger cm_cases_close_cycles after insert or update on cm_cases for each row execute function cm_close_cycles_on_closed_case();

-- an item with no cycle belongs to the case's first cycle
create or replace function cm_item_default_cycle() returns trigger language plpgsql as $$
begin
  if new.cycle_id is null then
    select id into new.cycle_id from cm_cycles where case_id = new.case_id order by seq limit 1;
  end if;
  return new;
end $$;
create trigger cm_items_default_cycle before insert on cm_items for each row execute function cm_item_default_cycle();

-- locks: cash-settled items are frozen; pending-signature items can't be re-priced
create or replace function cm_item_locks() returns trigger language plpgsql as $$
begin
  if coalesce(current_setting('cm.bypass', true),'') = '1' then return new; end if;
  if old.resolution_status = 'Settled' then
    raise exception 'Item #% is cash-settled and locked.', old.item_number using errcode = 'P0001';
  end if;
  if old.resolution_status = 'Pending' and (new.offer_amount is distinct from old.offer_amount or new.internal_estimate is distinct from old.internal_estimate) then
    raise exception 'Item #% has a cash offer awaiting signature and cannot be re-priced.', old.item_number using errcode = 'P0001';
  end if;
  return new;
end $$;
create trigger cm_items_locks before update on cm_items for each row execute function cm_item_locks();

-- cycle edits are written to the activity feed, like saveCycle()
create or replace function cm_cycle_changes() returns trigger language plpgsql as $$
declare tag text := 'Cycle ' || new.seq || ' (' || new.type || ')';
begin
  if new.car_received_on is distinct from old.car_received_on then
    perform cm_log(new.case_id, 'Tarion Correspondence', cm_actor(),
      case when new.car_received_on is null then tag || ': CAR received date cleared.'
           else tag || ': CAR received ' || new.car_received_on || ' — 30-day response clock started.' end);
  end if;
  if new.inspection_date is distinct from old.inspection_date then
    perform cm_log(new.case_id, 'Internal Note', cm_actor(),
      tag || ': inspection date ' || coalesce('set to ' || new.inspection_date, 'cleared') || '.');
  end if;
  if new.closed_on is distinct from old.closed_on and coalesce(current_setting('cm.bypass', true),'') <> '1' then
    perform cm_log(new.case_id, 'Internal Note', cm_actor(), tag || case when new.closed_on is null then ': re-opened.' else ': marked closed.' end);
  end if;
  return new;
end $$;
create trigger cm_cycles_changes after update on cm_cycles for each row execute function cm_cycle_changes();

-- ------------------------------------------------------------------ stage engine views
create or replace view cm_cycle_view with (security_invoker = true) as
with mx as (select case_id, max(seq) as m from cm_cycles group by case_id),
cnt as (
  select cy.id as cycle_id,
    count(i.id)::int as total,
    count(i.id) filter (where i.status not in ('Settled','Closed','Repaired - Pre-Inspection'))::int as open_items,
    count(i.id) filter (where i.car_outcome in ('Warranted','Partially Warranted'))::int as warranted,
    count(i.id) filter (where i.car_outcome = 'Not Warranted')::int as not_warranted,
    count(i.id) filter (where i.car_outcome in ('','Not Assessed'))::int as not_assessed,
    count(i.id) filter (where i.car_outcome = 'Under Investigation')::int as investigation,
    count(i.id) filter (where i.car_outcome in ('Warranted','Partially Warranted') and i.scheduled_on is null and i.verified_on is null and i.resolution_status <> 'Settled')::int as unscheduled,
    count(i.id) filter (where i.verified_on is not null)::int as verified,
    count(i.id) filter (where i.resolution_status = '' and i.offer_amount > 0)::int as priced,
    coalesce(sum(i.offer_amount) filter (where i.resolution_status = '' and i.offer_amount > 0),0)::numeric(12,2) as priced_amt,
    count(i.id) filter (where i.resolution_status = 'Pending')::int as pending,
    coalesce(sum(i.offer_amount) filter (where i.resolution_status = 'Pending'),0)::numeric(12,2) as pending_amt,
    count(i.id) filter (where i.resolution_status = 'Settled')::int as settled,
    coalesce(sum(i.offer_amount) filter (where i.resolution_status = 'Settled'),0)::numeric(12,2) as settled_amt,
    count(i.id) filter (where i.exception ~* '^rb04\y')::int as rb04,
    count(i.id) filter (where nullif(btrim(i.exception),'') is not null and lower(btrim(i.exception)) not in ('none','n/a'))::int as exceptions,
    coalesce(sum(i.internal_estimate) filter (where i.internal_estimate > 0),0)::numeric(12,2) as internal_estimate_amt,
    count(i.id) filter (where nullif(btrim(i.exception),'') is not null and lower(btrim(i.exception)) not in ('none','n/a') and i.internal_estimate <= 0)::int as internal_estimate_missing
  from cm_cycles cy
  left join cm_items i on i.case_id = cy.case_id
    and ((cy.type = 'Under Investigation' and i.investigation_cycle_id = cy.id)
      or (cy.type <> 'Under Investigation' and i.cycle_id = cy.id))
  group by cy.id)
select cy.id, cy.company_id, cy.case_id, cy.seq, cy.type, cy.inspection_date, cy.inspection_time,
  cy.car_received_on, cy.closed_on, cy.notes, cy.offer_prepared_on, cy.offer_reminder_last_sent, cy.offer_reminder_count,
  (select count(*) from cm_cycles x where x.case_id = cy.case_id)::int as of_total,
  case when cy.closed_on is not null then 'Closed'
       when cy.car_received_on is not null then
         case when c.open_items = 0 and (c.total > 0 or cy.seq < mx.m) then 'Closed' else 'CAR Received' end
       when cy.inspection_date is not null and cy.inspection_date <= cm_today(cy.company_id) then 'Awaiting CAR'
       else 'Scheduled' end as stage,
  -- superseded: CAR is in and a newer cycle exists; hides the cycle's own card/clock, never its items
  (cy.car_received_on is not null and cy.seq < mx.m and cy.closed_on is null
     and not (c.open_items = 0 and (c.total > 0 or cy.seq < mx.m))) as superseded,
  cy.car_received_on + coalesce(s.car_response_days,30) as car_due,
  cy.inspection_date - cm_today(cy.company_id) as days_to_insp,
  cm_business_days(cy.inspection_date, cm_today(cy.company_id)) as business_days_to_insp,
  (cy.car_received_on + coalesce(s.car_response_days,30)) - cm_today(cy.company_id) as days_left,
  cm_today(cy.company_id) - cy.car_received_on as days_since_car,
  c.total, c.open_items, c.warranted, c.not_warranted, c.not_assessed, c.investigation, c.unscheduled, c.verified,
  c.priced, c.priced_amt, c.pending, c.pending_amt, c.settled, c.settled_amt, c.rb04, c.exceptions,
  c.internal_estimate_amt, c.internal_estimate_missing
from cm_cycles cy
join cnt c on c.cycle_id = cy.id
join mx on mx.case_id = cy.case_id
left join cm_settings s on s.company_id = cy.company_id;

create or replace view cm_case_view with (security_invoker = true) as
select c.*, cm_case_is_closed(c) as is_closed from cm_cases c;

-- ------------------------------------------------------------------ RPCs
create or replace function cm_add_cycle(p_case uuid, p_type text, p_inspection_date date, p_inspection_time text, p_notes text, p_item_ids uuid[])
returns uuid language plpgsql as $$
declare v_company uuid; v_seq int; v_id uuid; v_moved int := 0;
begin
  select company_id into v_company from cm_cases where id = p_case;
  if v_company is null then raise exception 'Case not found.'; end if;
  select coalesce(max(seq),0)+1 into v_seq from cm_cycles where case_id = p_case;
  insert into cm_cycles(company_id, case_id, seq, type, inspection_date, inspection_time, notes, created_by)
    values (v_company, p_case, v_seq, coalesce(nullif(p_type,''),'Re-inspection: Other'), p_inspection_date, coalesce(p_inspection_time,''), coalesce(p_notes,''), auth.uid())
    returning id into v_id;
  if p_item_ids is not null and array_length(p_item_ids,1) > 0 then
    if p_type = 'Under Investigation' then
      update cm_items set investigation_cycle_id = v_id where case_id = p_case and id = any(p_item_ids);
    else
      update cm_items set cycle_id = v_id where case_id = p_case and id = any(p_item_ids);
    end if;
    get diagnostics v_moved = row_count;
  end if;
  perform cm_log(p_case, 'Internal Note', cm_actor(), 'Cycle ' || v_seq || ' scheduled: ' || coalesce(p_type,'Re-inspection') ||
    coalesce(' on ' || p_inspection_date, '') || ' — ' || v_moved || ' item(s) moved into it.');
  return v_id;
end $$;

create or replace function cm_delete_cycle(p_cycle uuid) returns void language plpgsql as $$
declare cy cm_cycles; n int; cnt int;
begin
  select * into cy from cm_cycles where id = p_cycle;
  if cy.id is null then raise exception 'Cycle not found.'; end if;
  select count(*) into n from cm_cycles where case_id = cy.case_id;
  if n < 2 then raise exception 'A case must keep at least one cycle.'; end if;
  select count(*) into cnt from cm_items where cycle_id = p_cycle or investigation_cycle_id = p_cycle;
  if cnt > 0 then raise exception 'This cycle still has % item(s). Move them to another cycle first.', cnt; end if;
  delete from cm_cycles where id = p_cycle;
  perform cm_audit_log(cy.case_id, 'CYCLE DELETED', cy.seq::text);
  perform cm_log(cy.case_id, 'Internal Note', cm_actor(), 'Cycle ' || cy.seq || ' (' || cy.type || ') deleted (was empty).');
end $$;

-- p_items: [{num, outcome, desc, explanation, analysis, analysisUncertain}]  (PDF OCR/parse happens upstream)
create or replace function cm_apply_car(p_case uuid, p_cycle uuid, p_report_date date, p_file_name text, p_items jsonb)
returns jsonb language plpgsql as $$
declare cy cm_cycles; it jsonb; r cm_items; v_date date; stamp text;
  c_upd int := 0; c_w int := 0; c_p int := 0; c_nw int := 0; c_na int := 0;
  unmatched text[] := '{}'; replaced text[] := '{}'; v_desc text;
begin
  select * into cy from cm_cycles where id = p_cycle and case_id = p_case;
  if cy.id is null then raise exception 'Cycle not found — refresh and try again.'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Nothing to apply.'; end if;
  v_date := coalesce(p_report_date, cm_today(cy.company_id));
  stamp := 'CAR report processed ' || to_char(now(),'YYYY-MM-DD HH24:MI') || ' by ' || cm_actor();
  perform cm_bypass_on();
  for it in select * from jsonb_array_elements(p_items) loop
    select * into r from cm_items where case_id = p_case and item_number = (it->>'num')::int;
    if r.id is null then unmatched := unmatched || (it->>'num'); continue; end if;
    v_desc := coalesce(nullif(it->>'desc',''), r.description);
    if nullif(it->>'desc','') is not null and r.description <> '' and left(r.description,40) <> left(it->>'desc',40) then
      update cm_items set original_note = 'Original claim text: ' || left(r.description,400) where id = r.id;
      replaced := replaced || (it->>'num');
    end if;
    update cm_items set
      description = v_desc,
      car_outcome = coalesce(it->>'outcome',''),
      car_notes   = coalesce(nullif(it->>'explanation',''), nullif(it->>'desc',''), ''),
      car_date    = v_date,
      tarion_analysis = case when nullif(it->>'analysis','') is not null
        then (it->>'analysis') || case when (it->>'analysisUncertain') = 'true' then ' [Auto-matched across a page break — verify against the PDF]' else '' end
        else tarion_analysis end,
      cycle_id = cy.id,
      status = case when it->>'outcome' = 'Not Warranted' and resolution_status <> 'Settled' then 'Closed' else status end,
      last_action = stamp || ' — ' || coalesce(it->>'outcome','') || coalesce(' (report dated ' || p_report_date || ')','')
    where id = r.id;
    c_upd := c_upd + 1;
    case it->>'outcome'
      when 'Not Warranted' then c_nw := c_nw + 1;
      when 'Partially Warranted' then c_p := c_p + 1;
      when 'Not Assessed' then c_na := c_na + 1;
      else c_w := c_w + 1;
    end case;
  end loop;
  perform cm_bypass_off();
  update cm_cycles set car_received_on = v_date where id = cy.id;
  perform cm_log(p_case, 'Tarion Correspondence', cm_actor(),
    'Cycle ' || cy.seq || ' (' || cy.type || '): CAR report uploaded ("' || coalesce(p_file_name,'') || '", dated ' || coalesce(p_report_date::text,'unknown') || '): ' ||
    c_upd || ' item(s) updated — ' || c_w || ' warranted, ' || c_p || ' partially warranted, ' || c_nw || ' not warranted (closed), ' || c_na || ' not assessed (left open)' ||
    case when array_length(unmatched,1) > 0 then '. Not on this case: #' || array_to_string(unmatched, ', #') else '' end ||
    case when array_length(replaced,1) > 0 then '. Description replaced with CAR text on #' || array_to_string(replaced, ', #') else '' end ||
    '. 30-day response clock started from ' || v_date || '.');
  perform cm_audit_log(p_case, 'CAR REPORT APPLIED', cy.id || ': ' || c_upd || ' item(s)');
  return jsonb_build_object('updated', c_upd, 'warranted', c_w, 'partial', c_p, 'notWarranted', c_nw, 'notAssessed', c_na, 'unmatched', to_jsonb(unmatched), 'descReplaced', to_jsonb(replaced));
end $$;

-- the "wrong home" fix
create or replace function cm_reset_car(p_cycle uuid) returns jsonb language plpgsql as $$
declare cy cm_cycles; r cm_items; cleared int := 0; restored int := 0; reopened int := 0;
begin
  select * into cy from cm_cycles where id = p_cycle;
  if cy.id is null then raise exception 'Cycle not found.'; end if;
  perform cm_bypass_on();
  for r in select * from cm_items where case_id = cy.case_id and cycle_id = cy.id
       and (car_outcome <> '' or car_date is not null or car_notes <> '' or tarion_analysis <> '') loop
    update cm_items set
      description   = case when original_note like 'Original claim text: %' then substr(original_note, length('Original claim text: ')+1) else description end,
      original_note = case when original_note like 'Original claim text: %' then '' else original_note end,
      status = case when car_outcome = 'Not Warranted' and status = 'Closed' and last_action like '%CAR report processed%' then 'Open' else status end,
      car_outcome = '', car_notes = '', car_date = null, tarion_analysis = '',
      last_action = 'CAR RESET ' || to_char(now(),'YYYY-MM-DD HH24:MI') || ' by ' || cm_actor()
    where id = r.id;
    cleared := cleared + 1;
    if r.original_note like 'Original claim text: %' then restored := restored + 1; end if;
    if r.car_outcome = 'Not Warranted' and r.status = 'Closed' and r.last_action like '%CAR report processed%' then reopened := reopened + 1; end if;
  end loop;
  perform cm_bypass_off();
  update cm_cycles set car_received_on = null, closed_on = null where id = cy.id;
  perform cm_audit_log(cy.case_id, 'CAR RESET', cy.id || ': ' || cleared || ' item(s) cleared');
  perform cm_log(cy.case_id, 'Tarion Correspondence', cm_actor(), 'Cycle ' || cy.seq || ' CAR RESET: ' || cleared || ' item(s) cleared, ' || restored ||
    ' original description(s) restored, ' || reopened || ' auto-closed item(s) re-opened. 30-day clock removed.');
  return jsonb_build_object('cleared', cleared, 'restored', restored, 'reopened', reopened);
end $$;

create or replace function cm_mark_offer_prepared(p_cycle uuid) returns void language plpgsql as $$
declare cy cm_cycles;
begin
  select * into cy from cm_cycles where id = p_cycle;
  if cy.id is null then raise exception 'Inspection record not found.'; end if;
  update cm_cycles set offer_prepared_on = cm_today(cy.company_id) where id = p_cycle;
  if cy.seq = 1 then update cm_cases set offer_prepared_on = cm_today(cy.company_id) where id = cy.case_id; end if;
  perform cm_log(cy.case_id, 'Internal Note', cm_actor(), 'Cash offer preparation marked complete for Cycle ' || cy.seq || ' (' || cy.type || ').');
end $$;

-- Partial (selected-items) settlement batch: prices the items, marks them Pending signature, records the batch.
create or replace function cm_create_settlement_batch(p_case uuid, p_item_ids uuid[], p_base_total numeric, p_negotiated numeric,
  p_release_date date, p_reason text, p_notes text, p_cycle uuid default null)
returns uuid language plpgsql as $$
declare s cm_settings; v_company uuid; n int; mult numeric; calc numeric; fin numeric; i int := 0;
  cost_sum numeric := 0; offer_sum numeric := 0; c numeric; o numeric; r cm_items; v_id uuid; nums text[] := '{}';
begin
  select company_id into v_company from cm_cases where id = p_case;
  if v_company is null then raise exception 'Case not found.'; end if;
  n := coalesce(array_length(p_item_ids,1),0);
  if n = 0 then raise exception 'Select at least one item.'; end if;
  if not (coalesce(p_base_total,0) > 0) then raise exception 'Enter a base estimate greater than zero.'; end if;
  if p_negotiated is not null and not (p_negotiated > 0) then raise exception 'Negotiated total must be greater than zero.'; end if;
  select * into s from cm_settings where company_id = v_company;
  mult := coalesce(s.offer_base_markup,1.30) * coalesce(s.offer_overhead,1.15) * coalesce(s.offer_hst,1.13);
  calc := round(p_base_total * mult, 2);
  fin  := coalesce(p_negotiated, calc);
  perform cm_bypass_on();
  for r in select * from cm_items where case_id = p_case and id = any(p_item_ids) order by item_number loop
    if r.resolution_status in ('Pending','Settled') then
      perform cm_bypass_off();
      raise exception 'Item #% already has a pending or settled cash resolution.', r.item_number;
    end if;
    i := i + 1;
    c := case when i = n then round(p_base_total - cost_sum, 2) else round(p_base_total / n, 2) end; cost_sum := cost_sum + c;
    o := case when i = n then round(fin - offer_sum, 2) else round(fin / n, 2) end;               offer_sum := offer_sum + o;
    update cm_items set internal_estimate = c, offer_amount = o, status = 'Cash Offer Made', resolution_method = 'Cash',
      resolution_status = 'Pending', resolution_date = now(),
      last_action = to_char(now(),'YYYY-MM-DD HH24:MI') || ' by ' || cm_actor() || ' — cash offer $' || o || ' (partial settlement batch)'
    where id = r.id;
    nums := nums || r.item_number::text;
  end loop;
  perform cm_bypass_off();
  if i <> n then raise exception 'An item changed or could not be verified. Refresh and try again.'; end if;
  insert into cm_settlement_batches(company_id, case_id, cycle_id, kind, item_ids, item_numbers, base_total, multiplier, calculated_total, negotiated_total,
      final_total, release_date, reason, notes, created_by)
    values (v_company, p_case, p_cycle, 'selected', p_item_ids, array_to_string(nums, ', '), p_base_total, mult, calc, p_negotiated, fin, p_release_date,
      coalesce(nullif(p_reason,''),'To resolve only the selected conciliation items.'), coalesce(p_notes,''), auth.uid())
    returning id into v_id;
  perform cm_audit_log(p_case, 'PARTIAL CASH SETTLEMENT OFFERED', v_id || ' — ' || n || ' item(s), $' || fin);
  perform cm_log(p_case, 'Internal Note', cm_actor(), 'Partial cash settlement generated for items #' || array_to_string(nums, ', #') || '.');
  return v_id;
end $$;

-- Full & Final release from the offers already set on items (no re-pricing). Lists every non-settled item in scope;
-- only items with a real offer move to Pending. Items marked scope_status='Close' are skipped.
create or replace function cm_generate_full_release(p_case uuid, p_cycle uuid, p_release_date date, p_reason text, p_mark_prepared boolean default false)
returns uuid language plpgsql as $$
declare v_company uuid; r cm_items; nums text[] := '{}'; ids uuid[] := '{}'; total numeric := 0; stamped int := 0; v_id uuid; v_form text;
begin
  select company_id, form_type into v_company, v_form from cm_cases where id = p_case;
  if v_company is null then raise exception 'Case not found.'; end if;
  perform cm_bypass_on();
  for r in select * from cm_items where case_id = p_case and resolution_status <> 'Settled' and scope_status <> 'Close'
      and (p_cycle is null or cycle_id = p_cycle) order by item_number loop
    nums := nums || r.item_number::text; ids := ids || r.id; total := total + r.offer_amount;
    if r.offer_amount > 0 and r.resolution_status <> 'Pending' then
      update cm_items set status = 'Cash Offer Made', resolution_method = 'Cash', resolution_status = 'Pending', resolution_date = now(),
        last_action = to_char(now(),'YYYY-MM-DD HH24:MI') || ' by ' || cm_actor() || ' — cash offer $' || r.offer_amount || ' (release generated)' where id = r.id;
      stamped := stamped + 1;
    end if;
  end loop;
  perform cm_bypass_off();
  if array_length(ids,1) is null then raise exception 'No items to release.'; end if;
  insert into cm_settlement_batches(company_id, case_id, cycle_id, kind, item_ids, item_numbers, final_total, release_date, reason, created_by)
    values (v_company, p_case, p_cycle, 'full', ids, array_to_string(nums, ', '), round(total,2), p_release_date,
      coalesce(nullif(p_reason,''), 'To effectively close and completely resolve the ' || coalesce(nullif(v_form,''),'claim') || ' claim form for case #' ||
        (select case_number from cm_cases where id = p_case) || ' and all items listed on that form.'), auth.uid())
    returning id into v_id;
  if p_mark_prepared then
    update cm_cases set offer_prepared_on = cm_today(v_company) where id = p_case;
    update cm_cycles set offer_prepared_on = cm_today(v_company) where id = coalesce(p_cycle, (select id from cm_cycles where case_id = p_case and closed_on is null and car_received_on is null order by seq limit 1));
  end if;
  perform cm_audit_log(p_case, 'RELEASE GENERATED (full)', array_length(ids,1) || ' item(s) listed, $' || round(total,2));
  perform cm_log(p_case, 'Letter', cm_actor(), 'Full & Final release generated — ' || array_length(ids,1) || ' item(s) listed, total $' || round(total,2) ||
    case when stamped > 0 then '. ' || stamped || ' newly priced item(s) now PENDING purchaser signature.' else '. No newly priced items — nothing new pending signature.' end);
  return v_id;
end $$;

create or replace function cm_decide_settlement_batch(p_batch uuid, p_decision text, p_signed_ref text default '')
returns void language plpgsql as $$
declare b cm_settlement_batches; d text := upper(coalesce(p_decision,''));
begin
  select * into b from cm_settlement_batches where id = p_batch;
  if b.id is null then raise exception 'Settlement batch not found.'; end if;
  if b.decision <> 'OFFERED' then raise exception 'This batch has already been decided.'; end if;
  perform cm_bypass_on();
  if d = 'ACCEPTED' then
    if nullif(btrim(coalesce(p_signed_ref,'')),'') is null then perform cm_bypass_off(); raise exception 'Enter the signed release document URL or reference before accepting.'; end if;
    update cm_items set resolution_status = 'Settled', resolution_date = now(), status = 'Settled',
      last_action = 'Cash settlement ACCEPTED ' || to_char(now(),'YYYY-MM-DD HH24:MI') || ' by ' || cm_actor() || ' — LOCKED, do not schedule repair.'
    where id = any(b.item_ids) and resolution_status = 'Pending';
    update cm_settlement_batches set decision = 'ACCEPTED', decision_date = now(), signed_release_ref = p_signed_ref where id = b.id;
  elsif d = 'DECLINED' then
    update cm_items set resolution_method = '', resolution_status = '', resolution_date = null, status = 'Open',
      last_action = 'Cash offer DECLINED ' || to_char(now(),'YYYY-MM-DD HH24:MI') || ' by ' || cm_actor() || ' — reopened, available for a new offer.'
    where id = any(b.item_ids) and resolution_status in ('Pending','Settled');
    update cm_settlement_batches set decision = 'DECLINED', decision_date = now() where id = b.id;
  else
    perform cm_bypass_off(); raise exception 'Choose Accepted or Declined.';
  end if;
  perform cm_bypass_off();
  perform cm_audit_log(b.case_id, 'PARTIAL CASH SETTLEMENT ' || d, b.id::text);
  perform cm_log(b.case_id, 'Internal Note', cm_actor(), 'Settlement batch ' || left(b.id::text,8) || ' ' || d || '. Only its selected items were affected.');
end $$;

-- Whole-case Full & Final decision. Accepting closes every cycle and the case.
create or replace function cm_resolve_case_cash(p_case uuid, p_outcome text) returns jsonb language plpgsql as $$
declare v_company uuid; priced int; pend int; total numeric;
begin
  if p_outcome not in ('accepted','declined') then raise exception 'Choose accepted or declined.'; end if;
  select company_id into v_company from cm_cases where id = p_case;
  select count(*), count(*) filter (where resolution_status = 'Pending'), coalesce(sum(offer_amount),0)
    into priced, pend, total from cm_items where case_id = p_case and offer_amount > 0;
  if priced = 0 then raise exception 'There are no priced items on this case.'; end if;
  if pend <> priced then raise exception 'This is not a clean full-case offer: every priced item must be pending signature. Use the batch tools for a partial settlement.'; end if;
  perform cm_bypass_on();
  if p_outcome = 'accepted' then
    update cm_items set resolution_status = 'Settled', resolution_date = now(), status = 'Settled',
      last_action = 'FULL-CASE cash settlement ACCEPTED ' || to_char(now(),'YYYY-MM-DD HH24:MI') || ' by ' || cm_actor() || ' — locked; no repair scheduling.'
    where case_id = p_case and offer_amount > 0;
    update cm_settlement_batches set decision = 'ACCEPTED', decision_date = now() where case_id = p_case and decision = 'OFFERED';
    update cm_cases set status = 'Closed', case_closed_on = now(), manager_status = 'CLOSED', manager_stage = 'CLOSED' where id = p_case;
    perform cm_audit_log(p_case, 'FULL-CASE CASH SETTLEMENT ACCEPTED — CASE CLOSED', priced || ' priced item(s), $' || total);
    perform cm_log(p_case, 'Internal Note', cm_actor(), 'Full & Final cash settlement accepted for all priced items. Case closed and all inspection cycles closed. Retain the signed release in Documents.');
  else
    update cm_items set resolution_method = '', resolution_status = '', resolution_date = null, status = 'Open',
      last_action = 'FULL-CASE cash offer DECLINED ' || to_char(now(),'YYYY-MM-DD HH24:MI') || ' by ' || cm_actor() || ' — reopened.'
    where case_id = p_case and offer_amount > 0;
    update cm_settlement_batches set decision = 'DECLINED', decision_date = now() where case_id = p_case and decision = 'OFFERED';
    perform cm_audit_log(p_case, 'FULL-CASE CASH SETTLEMENT DECLINED', priced || ' priced item(s) reopened');
    perform cm_log(p_case, 'Internal Note', cm_actor(), 'Full-case cash offer declined. All priced items reopened; conciliation remains active.');
  end if;
  perform cm_bypass_off();
  return jsonb_build_object('outcome', p_outcome, 'updated', priced, 'total', total, 'closed', p_outcome = 'accepted');
end $$;

create or replace function cm_route_to_repair(p_item_ids uuid[], p_scheduled date default null) returns int language plpgsql as $$
declare n int; v_case uuid;
begin
  update cm_items set resolution_method = 'Repair', status = 'Repair Scheduled', scheduled_on = coalesce(p_scheduled, scheduled_on),
    last_action = 'Routed to repair ' || to_char(now(),'YYYY-MM-DD HH24:MI') || ' by ' || cm_actor()
  where id = any(p_item_ids) and resolution_status = '';
  get diagnostics n = row_count;
  select case_id into v_case from cm_items where id = any(p_item_ids) limit 1;
  if n > 0 then perform cm_log(v_case, 'Site Visit', cm_actor(), n || ' item(s) routed to repair (not cash)' || coalesce(', scheduled ' || p_scheduled, '') || '.'); end if;
  return n;
end $$;

create or replace function cm_book_claim(p_case uuid, p_inspection_date date, p_inspection_time text default '', p_notes text default '')
returns uuid language plpgsql as $$
declare c cm_cases; v_cycle uuid; eligible uuid[]; today date;
begin
  select * into c from cm_cases where id = p_case;
  if c.id is null then raise exception 'Case not found.'; end if;
  if p_inspection_date is null then raise exception 'Claim inspection date is required.'; end if;
  if cm_case_is_closed(c) then raise exception 'A closed case cannot be booked for claim inspection.'; end if;
  if c.claim_booked_on is not null then raise exception 'A claim inspection has already been booked for this case.'; end if;
  select array_agg(id) into eligible from cm_items where case_id = p_case and status <> 'Closed' and car_outcome in ('Warranted','Partially Warranted');
  if eligible is null then raise exception 'There are no open warranted or partially warranted items to include in the claim inspection.'; end if;
  today := cm_today(c.company_id);
  -- close only the CAR/repair cycles; Under Investigation is an independent workstream
  perform cm_bypass_on();
  update cm_cycles set closed_on = today where case_id = p_case and closed_on is null and type <> 'Under Investigation';
  perform cm_bypass_off();
  v_cycle := cm_add_cycle(p_case, 'Claim Inspection', p_inspection_date, p_inspection_time, coalesce(nullif(p_notes,''),'Claim inspection booked'), eligible);
  update cm_cases set manager_status = 'Claim Booked', claim_booked_on = today, claim_inspection_date = p_inspection_date, manager_stage = 'CLAIM_BOOKED' where id = p_case;
  return v_cycle;
end $$;

create or replace function cm_record_claim_outcome(p_case uuid, p_outcome text, p_date date default null, p_reference text default '',
  p_amount numeric default 0, p_builder_15 numeric default 0, p_total_exposure numeric default 0, p_notes text default '')
returns void language plpgsql as $$
declare c cm_cases;
begin
  select * into c from cm_cases where id = p_case;
  if c.id is null then raise exception 'Case not found.'; end if;
  if p_outcome is null or p_outcome not in ('Paid','Denied','Withdrawn','Settled','No Claim') then raise exception 'Invalid claim outcome.'; end if;
  if nullif(btrim(c.closure_reason),'') is not null then raise exception 'This case is already closed.'; end if;
  update cm_cases set claim_outcome = p_outcome, claim_outcome_date = coalesce(p_date, cm_today(c.company_id)),
    tarion_claim_reference = coalesce(p_reference,''), claim_amount = coalesce(p_amount,0), builder_15_percent = coalesce(p_builder_15,0),
    total_builder_exposure = coalesce(p_total_exposure,0), claim_outcome_notes = coalesce(p_notes,''),
    manager_status = 'Closed', closure_reason = 'Claim outcome recorded', manager_stage = 'CLOSED' where id = p_case;
  perform cm_log(p_case, 'Internal Note', cm_actor(), 'Claim outcome recorded: ' || p_outcome || '. Case closed.');
end $$;

create or replace function cm_close_case(p_case uuid, p_reason text) returns void language plpgsql as $$
begin
  if nullif(btrim(coalesce(p_reason,'')),'') is null then raise exception 'Closure reason is required.'; end if;
  update cm_cases set manager_status = 'Closed', closure_reason = p_reason, manager_stage = 'CLOSED' where id = p_case;
  perform cm_log(p_case, 'Internal Note', cm_actor(), 'Case closed: ' || p_reason);
end $$;

-- seeds the lists/settings for a new company (run once per tenant)
create or replace function cm_seed_company(p_company uuid) returns void language plpgsql as $$
begin
  insert into cm_settings(company_id) values (p_company) on conflict do nothing;
  insert into cm_lists(company_id, list_key, "values") values
    (p_company,'item_statuses', array['Open','Repair Scheduled','Cash Offer Made','Settled','Closed','Repaired - Pre-Inspection']),
    (p_company,'likelihoods',   array['Likely','Possible','Unlikely']),
    (p_company,'exceptions',    array['None','RB04','Other']),
    (p_company,'comm_types',    array['Internal Note','Email','Letter','Site Visit','Tarion Correspondence','Phone Call']),
    (p_company,'case_statuses', array['Conciliation Requested','Inspection Scheduled','Awaiting CAR','CAR Received','Closed','Settled','Cancelled Conciliation']),
    (p_company,'form_types',    array['Year 1 Claim Form','Year 2 Claim Form','Common Elements Claim Form']),
    (p_company,'cycle_types',   array['Initial Inspection','Re-inspection: Heat','Re-inspection: Cooling','Under Investigation','Claim Inspection','Re-inspection: Further Investigation','Re-inspection: Other'])
  on conflict do nothing;
end $$;

-- ------------------------------------------------------------------ RLS
do $$
declare t text;
begin
  foreach t in array array['cm_cases','cm_cycles','cm_items','cm_comms','cm_audit','cm_documents','cm_settlement_batches','cm_settings','cm_lists'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (cm_has_role(company_id, array[''manager'',''coordinator'',''viewer'']))', t || '_read', t);
    execute format('create policy %I on %I for insert with check (cm_has_role(company_id, array[''manager'']))', t || '_ins', t);
    execute format('create policy %I on %I for update using (cm_has_role(company_id, array[''manager''])) with check (cm_has_role(company_id, array[''manager'']))', t || '_upd', t);
    execute format('create policy %I on %I for delete using (cm_has_role(company_id, array[''manager'']))', t || '_del', t);
  end loop;
end $$;
alter table cm_members enable row level security;
create policy cm_members_read on cm_members for select using (user_id = auth.uid() or cm_has_role(company_id, array['manager']));
create policy cm_members_manage on cm_members for all using (cm_has_role(company_id, array['manager'])) with check (cm_has_role(company_id, array['manager']));
