-- =============================================================================
-- Part 2: merge with the warranty data already in the app + automatic Tarion intake.
--  * cm_cases link to warranty_lots by ENROLMENT NUMBER (the QDEF owner import already stores it)
--  * cm_link_warranty_data(): fills owner/contact/lot/community on CM cases from those lots. Re-runnable.
--  * cm_intake_queue: every Tarion/BuilderLink document lands here. Sure -> applied automatically,
--    not sure -> waits for a human ("duplicate or new case?").
--  * cm_ingest_np(): the decision engine the sync job (Edge Function) calls.
-- =============================================================================

alter table cm_cases    add column if not exists lot_id uuid;
alter table cm_cases    add column if not exists community_id uuid;
alter table cm_cases    add column if not exists enrolment_norm text generated always as (upper(regexp_replace(enrolment, '[^A-Za-z0-9]', '', 'g'))) stored;
alter table cm_cases    add column if not exists np_url text not null default '';
alter table cm_cases    add column if not exists inspector text not null default '';
create index if not exists cm_cases_enrol_idx on cm_cases(company_id, enrolment_norm);
alter table cm_settings add column if not exists include_common_elements boolean not null default true;
alter table cm_settings add column if not exists last_sync_at timestamptz;

create table if not exists cm_sync_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  source text not null default 'tarion_api',
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  checked int not null default 0,
  created int not null default 0,
  updated int not null default 0,
  queued int not null default 0,
  errors jsonb not null default '[]'
);

create table if not exists cm_intake_queue (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  source text not null default 'tarion_api',
  case_number text not null default '',
  enrolment text not null default '',
  payload jsonb not null default '{}',
  proposed_action text not null,    -- create_case | add_items | reschedule | new_cycle | duplicate | skip_common_elements | review
  reason text not null default '',
  status text not null default 'pending' check (status in ('pending','applied','rejected','skipped')),
  auto_applied boolean not null default false,
  case_id uuid references cm_cases(id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid
);
create index if not exists cm_intake_company_idx on cm_intake_queue(company_id, status, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['cm_sync_runs','cm_intake_queue'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select using (cm_has_role(company_id, array[''manager'',''coordinator'',''viewer'']))', t || '_read', t);
    execute format('create policy %I on %I for insert with check (cm_has_role(company_id, array[''manager'']))', t || '_ins', t);
    execute format('create policy %I on %I for update using (cm_has_role(company_id, array[''manager''])) with check (cm_has_role(company_id, array[''manager'']))', t || '_upd', t);
    execute format('create policy %I on %I for delete using (cm_has_role(company_id, array[''manager'']))', t || '_del', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- merge with the QDEF owner import
-- Reads warranty_lots / warranty_communities (written by the existing QDEF import). Only blanks are filled;
-- anything already typed on the CM case wins. SECURITY DEFINER so it can read the lots table regardless of its
-- RLS, but it refuses anyone who is not a manager of that company.
create or replace function cm_link_warranty_data(p_company uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare linked int := 0; unmatched jsonb;
begin
  if auth.uid() is not null and not cm_has_role(p_company, array['manager']) then raise exception 'Managers only.'; end if;
  if to_regclass('public.warranty_lots') is null then return jsonb_build_object('skipped', 'warranty_lots table not found'); end if;
  execute $q$
    with m as (
      select distinct on (c.id) c.id as cm_id, l.id as lot_id, l.community_id, l.lot_number, l.homeowner_name,
             l.homeowner_email, l.phone_primary, l.address, l.closing_date
      from cm_cases c
      join warranty_lots l on l.company_id = c.company_id
       and upper(regexp_replace(coalesce(l.enrollment_number,''), '[^A-Za-z0-9]', '', 'g')) = c.enrolment_norm
      where c.company_id = $1 and c.enrolment_norm <> ''
      order by c.id)
    update cm_cases c set
      lot_id = m.lot_id, community_id = m.community_id,
      lot = case when c.lot = '' then coalesce(m.lot_number,'') else c.lot end,
      homeowner = case when c.homeowner = '' then coalesce(m.homeowner_name,'') else c.homeowner end,
      owner_email = case when c.owner_email = '' then coalesce(m.homeowner_email,'') else c.owner_email end,
      owner_phone = case when c.owner_phone = '' then coalesce(m.phone_primary,'') else c.owner_phone end,
      address = case when c.address = '' then coalesce(m.address,'') else c.address end,
      possession_date = coalesce(c.possession_date, m.closing_date::date)
    from m where c.id = m.cm_id
  $q$ using p_company;
  get diagnostics linked = row_count;
  if to_regclass('public.warranty_communities') is not null then
    execute $q$ update cm_cases c set community = coalesce(nullif(c.community,''), w.name, '')
                from warranty_communities w where w.id = c.community_id and c.company_id = $1 and c.community = '' $q$ using p_company;
  end if;
  select coalesce(jsonb_agg(case_number order by case_number), '[]') into unmatched
    from cm_cases where company_id = p_company and lot_id is null;
  return jsonb_build_object('linked', linked, 'unmatched', unmatched);
end $$;

-- every home a CM case can open in the wider warranty file: lot -> warranty cases/items counts (tolerates missing tables)
create or replace function cm_home_history(p_case uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare c cm_cases; wc int := 0; wi int := 0; wo int := 0;
begin
  select * into c from cm_cases where id = p_case;
  if c.id is null or not cm_has_role(c.company_id, array['manager','coordinator','viewer']) then return null; end if;
  if c.lot_id is null then return jsonb_build_object('linked', false); end if;
  if to_regclass('public.cases') is not null then execute 'select count(*) from cases where lot_id = $1' into wc using c.lot_id; end if;
  if to_regclass('public.warranty_items') is not null and to_regclass('public.cases') is not null then
    execute 'select count(*) from warranty_items wi join cases k on k.id = wi.case_id where k.lot_id = $1' into wi using c.lot_id;
  end if;
  if to_regclass('public.work_orders') is not null then
    begin execute 'select count(*) from work_orders where lot_id = $1' into wo using c.lot_id; exception when undefined_column then wo := 0; end;
  end if;
  return jsonb_build_object('linked', true, 'lot_id', c.lot_id, 'warranty_cases', wc, 'warranty_items', wi, 'work_orders', wo);
exception when undefined_column then
  return jsonb_build_object('linked', true, 'lot_id', c.lot_id);
end $$;

-- ---------------------------------------------------------------- Tarion intake decision engine
-- p: {caseNumber, enrolment, homeowner, address, lot, formType, inspector, inspectionDate, inspectionTime, npUrl, woStatus,
--     items:[{n,text}], source}
-- Rules (James, Nov 2026): work out duplicate vs new case; apply automatically when sure, queue for review when not.
create or replace function cm_ingest_np(p_company uuid, p jsonb) returns jsonb
language plpgsql as $$
declare
  v_case cm_cases; v_num text := nullif(btrim(p->>'caseNumber'),''); v_enrol text := coalesce(p->>'enrolment','');
  v_form text := coalesce(p->>'formType',''); v_date date := nullif(p->>'inspectionDate','')::date; v_time text := coalesce(p->>'inspectionTime','');
  v_items jsonb := coalesce(p->'items','[]'::jsonb); n_new int := jsonb_array_length(coalesce(p->'items','[]'::jsonb)); n_old int;
  v_settings cm_settings; v_ce boolean; v_id uuid; v_action text; v_reason text := ''; v_status text := 'pending'; v_auto boolean := false;
  it jsonb; gov cm_cycle_view; mismatch int;
begin
  if v_num is null then raise exception 'caseNumber is required'; end if;
  select * into v_settings from cm_settings where company_id = p_company;
  v_ce := v_form ~* '(common element|cedef|condo)';
  select * into v_case from cm_cases where company_id = p_company and case_number = v_num;

  if v_case.id is null then
    if v_ce and not coalesce(v_settings.include_common_elements, true) then
      v_action := 'skip_common_elements'; v_status := 'skipped'; v_reason := 'Common-elements conciliation; company setting excludes them.';
    elsif coalesce(p->>'address','') <> '' and n_new > 0 then
      insert into cm_cases(company_id, case_number, homeowner, address, lot, enrolment, form_type, property_type, inspector, np_url)
        values (p_company, v_num, coalesce(p->>'homeowner',''), coalesce(p->>'address',''), coalesce(p->>'lot',''), v_enrol, v_form,
                case when v_ce then 'common_elements' else 'freehold' end, coalesce(p->>'inspector',''), coalesce(p->>'npUrl',''))
        returning * into v_case;
      for it in select * from jsonb_array_elements(v_items) loop
        insert into cm_items(company_id, case_id, item_number, description) values (p_company, v_case.id, (it->>'n')::int, coalesce(it->>'text',''))
        on conflict (case_id, item_number) do nothing;
      end loop;
      update cm_cycles set inspection_date = v_date, inspection_time = v_time where case_id = v_case.id and seq = 1;
      perform cm_log(v_case.id, 'Internal Note', 'system', 'Case created automatically from Tarion intake — ' || n_new || ' item(s), inspection ' || coalesce(v_date::text,'not set') || '.');
      v_action := 'create_case'; v_status := 'applied'; v_auto := true;
    else
      v_action := 'review'; v_reason := 'New case number but the letter is missing an address or an item list.';
    end if;
  else
    select count(*) into n_old from cm_items where case_id = v_case.id;
    if n_old = 0 and n_new > 0 then
      for it in select * from jsonb_array_elements(v_items) loop
        insert into cm_items(company_id, case_id, item_number, description) values (p_company, v_case.id, (it->>'n')::int, coalesce(it->>'text',''))
        on conflict (case_id, item_number) do nothing;
      end loop;
      perform cm_log(v_case.id, 'Internal Note', 'system', n_new || ' item(s) imported from Tarion intake.');
      v_action := 'add_items'; v_status := 'applied'; v_auto := true;
    elsif n_new > 0 then
      -- compare overlapping item numbers on the first 40 characters (a CAR may have replaced descriptions)
      select count(*) into mismatch from jsonb_array_elements(v_items) j
        join cm_items i on i.case_id = v_case.id and i.item_number = (j->>'n')::int
        where left(lower(i.description),40) <> left(lower(coalesce(j->>'text','')),40)
          and left(lower(i.original_note),60) not like '%' || left(lower(coalesce(j->>'text','')),30) || '%';
      if mismatch > 0 then
        v_action := 'review'; v_reason := mismatch || ' item description(s) differ from what is on the case — could be a different form or a corrected letter.';
      end if;
    end if;
    if v_action is null then
      select * into gov from cm_cycle_view where case_id = v_case.id and type <> 'Under Investigation' and closed_on is null order by seq desc limit 1;
      if v_date is not null and gov.id is not null then
        if gov.stage = 'Scheduled' and gov.inspection_date is distinct from v_date then
          update cm_cycles set inspection_date = v_date, inspection_time = v_time where id = gov.id;
          v_action := 'reschedule'; v_status := 'applied'; v_auto := true;
          v_reason := 'Inspection moved ' || coalesce(gov.inspection_date::text,'not set') || ' -> ' || v_date;
        elsif gov.stage <> 'Scheduled' and (gov.inspection_date is distinct from v_date) and v_date > cm_today(p_company) then
          v_action := 'review'; v_reason := 'A new inspection date (' || v_date || ') arrived after the CAR — likely a re-inspection. Confirm and pick the items.';
        end if;
      end if;
      if v_action is null then v_action := 'duplicate'; v_status := 'applied'; v_auto := true; v_reason := 'Nothing new — same case, same items, same date.'; end if;
    end if;
    if coalesce(p->>'npUrl','') <> '' then update cm_cases set np_url = p->>'npUrl' where id = v_case.id; end if;
    if coalesce(p->>'inspector','') <> '' then update cm_cases set inspector = p->>'inspector' where id = v_case.id; end if;
  end if;

  insert into cm_intake_queue(company_id, source, case_number, enrolment, payload, proposed_action, reason, status, auto_applied, case_id, resolved_at)
    values (p_company, coalesce(p->>'source','tarion_api'), v_num, v_enrol, p, v_action, v_reason, v_status, v_auto, v_case.id,
            case when v_status <> 'pending' then now() end)
    returning id into v_id;
  return jsonb_build_object('action', v_action, 'status', v_status, 'intakeId', v_id, 'caseId', v_case.id, 'reason', v_reason);
end $$;

-- a human approves a queued intake (the same effect the engine would have had)
create or replace function cm_resolve_intake(p_intake uuid, p_decision text) returns jsonb
language plpgsql as $$
declare q cm_intake_queue; p jsonb; v_case cm_cases; it jsonb; v_date date; v_time text;
begin
  select * into q from cm_intake_queue where id = p_intake;
  if q.id is null or q.status <> 'pending' then raise exception 'Intake item not found or already handled.'; end if;
  if p_decision = 'reject' then
    update cm_intake_queue set status = 'rejected', resolved_at = now(), resolved_by = auth.uid() where id = q.id;
    return jsonb_build_object('status','rejected');
  end if;
  p := q.payload; v_date := nullif(p->>'inspectionDate','')::date; v_time := coalesce(p->>'inspectionTime','');
  select * into v_case from cm_cases where company_id = q.company_id and case_number = q.case_number;
  if v_case.id is null then
    insert into cm_cases(company_id, case_number, homeowner, address, lot, enrolment, form_type, inspector, np_url)
      values (q.company_id, q.case_number, coalesce(p->>'homeowner',''), coalesce(p->>'address',''), coalesce(p->>'lot',''),
              coalesce(p->>'enrolment',''), coalesce(p->>'formType',''), coalesce(p->>'inspector',''), coalesce(p->>'npUrl','')) returning * into v_case;
    for it in select * from jsonb_array_elements(coalesce(p->'items','[]')) loop
      insert into cm_items(company_id, case_id, item_number, description) values (q.company_id, v_case.id, (it->>'n')::int, coalesce(it->>'text',''))
      on conflict (case_id, item_number) do nothing;
    end loop;
    update cm_cycles set inspection_date = v_date, inspection_time = v_time where case_id = v_case.id and seq = 1;
  elsif v_date is not null then
    -- existing case + a date after the CAR: book it as the next cycle (re-inspection); user picks items later in the case folder
    perform cm_add_cycle(v_case.id, 'Re-inspection: Other', v_date, v_time, 'Created from Tarion intake — confirm type and items.', null);
  end if;
  update cm_intake_queue set status = 'applied', resolved_at = now(), resolved_by = auth.uid(), case_id = v_case.id where id = q.id;
  return jsonb_build_object('status','applied','caseId', v_case.id);
end $$;

-- private bucket for NP letters, CARs, releases and evidence; path = <company_id>/...
insert into storage.buckets (id, name, public) values ('cm-documents','cm-documents', false) on conflict (id) do nothing;
create policy cm_docs_read on storage.objects for select using (bucket_id = 'cm-documents' and cm_has_role(((storage.foldername(name))[1])::uuid, array['manager','coordinator','viewer']));
create policy cm_docs_write on storage.objects for insert with check (bucket_id = 'cm-documents' and cm_has_role(((storage.foldername(name))[1])::uuid, array['manager']));
create policy cm_docs_update on storage.objects for update using (bucket_id = 'cm-documents' and cm_has_role(((storage.foldername(name))[1])::uuid, array['manager']));
