-- Warranty-side intake: every new Tarion claim form (30-day, mid-year, year-end, 2nd-year, MSD ...) becomes a case + items,
-- owner photos follow, and coordinators get one digest email. The Conciliation Manager keeps its own scheduled-inspection logic.
-- Writes happen only through the tarion-sync Edge Function (service role). Nothing here is callable by clients.

-- ---------- mapping of Tarion form codes to this app's periods ----------
create table if not exists warranty_form_map (
  tarion_code text primary key,
  period_type text,                    -- cases.period_type
  label       text not null,           -- shown in the case title
  prefix      text not null default 'TC-',
  do_import   boolean not null default true,
  note        text
);
insert into warranty_form_map (tarion_code, period_type, label, do_import, note) values
  ('30DAY', 'initial',     '30-Day',     true,  'matches the existing "initial" cases'),
  ('INITL', 'initial',     'Initial',    true,  null),
  ('MIDYR', 'mid_year',    'Mid-Year',   true,  null),
  ('YREND', 'year_end',    'Year-End',   true,  null),
  ('2NDYR', 'second_year', 'Second-Year',true,  null),
  ('MSDEF', 'msd',         'MSD',        true,  null),
  ('CEDEF', null,          'Common Elements', false, 'listed for review, not auto-imported')
on conflict (tarion_code) do nothing;
alter table warranty_form_map enable row level security;
drop policy if exists form_map_read on warranty_form_map;
create policy form_map_read on warranty_form_map for select to authenticated using (true);

-- ---------- one row per Tarion form seen ----------
create table if not exists tarion_form_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  tarion_case_id text not null,
  tarion_case_number text not null,
  form_code text,
  enrolment text,
  owner_name text,
  address text,
  after_sales_email text,
  status text not null check (status in ('imported','needs_review','skipped')),
  reason text,
  case_id uuid references cases(id) on delete set null,
  lot_id uuid,
  community_id uuid,
  items_count int not null default 0,
  photos_found int not null default 0,
  photos_done int not null default 0,
  photos_complete boolean not null default false,
  photo_note text,
  payload jsonb,
  tarion_created_at timestamptz,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  emailed_at timestamptz,
  unique (company_id, tarion_case_id)
);
create index if not exists tarion_form_imports_pending on tarion_form_imports (company_id, status, photos_complete);
alter table tarion_form_imports enable row level security;
drop policy if exists tfi_isolation on tarion_form_imports;
create policy tfi_isolation on tarion_form_imports for select to authenticated using (company_id = auth_company_id());

-- ---------- who gets the digest ----------
create table if not exists warranty_intake_recipients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  community_id uuid,                  -- null = every community
  email text not null,
  name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table warranty_intake_recipients enable row level security;
drop policy if exists wir_isolation on warranty_intake_recipients;
create policy wir_isolation on warranty_intake_recipients for all to authenticated
  using (company_id = auth_company_id()) with check (company_id = auth_company_id());

-- ---------- idempotency keys ----------
alter table warranty_items add column if not exists tarion_deficiency_id text;
create unique index if not exists warranty_items_tarion_def_uq on warranty_items (company_id, tarion_deficiency_id) where tarion_deficiency_id is not null;
create unique index if not exists warranty_evidence_path_uq on warranty_item_evidence (company_id, storage_path) where storage_path is not null;

-- ---------- private bucket for owner-submitted photos ----------
insert into storage.buckets (id, name, public) values ('warranty-photos', 'warranty-photos', false) on conflict (id) do nothing;
drop policy if exists wp_read on storage.objects;
create policy wp_read on storage.objects for select to authenticated using (
  case when bucket_id = 'warranty-photos' then (storage.foldername(name))[1] = auth_company_id()::text else false end);

-- ---------- helpers ----------
create or replace function tw_norm_enrol(t text) returns text language sql immutable as $$
  select regexp_replace(upper(regexp_replace(coalesce(t,''), '[^A-Za-z0-9]', '', 'g')), '^H', '')
$$;

-- ---------- the intake ----------
-- p = { tarionCaseId, caseNumber, formCode, enrolment, owner, address, afterSales, createdAt, retry,
--       items:[{id, num, description, floor, room, area, ioe, image1, image2}] }
create or replace function tw_ingest_form(p_company uuid, p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_existing tarion_form_imports%rowtype;
  v_map warranty_form_map%rowtype;
  v_lot warranty_lots%rowtype;
  v_clash cases%rowtype;
  v_case uuid; v_num int; v_no text; v_it jsonb; v_idx int := 0;
  v_status text := 'imported'; v_reason text; v_action text;
begin
  if coalesce(auth.jwt()->>'role','') <> 'service_role' and current_user not in ('postgres','service_role','supabase_admin') then
    raise exception 'not allowed';
  end if;

  select * into v_existing from tarion_form_imports where company_id = p_company and tarion_case_id = p->>'tarionCaseId';
  if found and (v_existing.status = 'imported' or not coalesce((p->>'retry')::boolean, false)) then
    return jsonb_build_object('action', case when v_existing.status = 'imported' then 'exists' else 'review_pending' end, 'importId', v_existing.id);
  end if;

  select * into v_map from warranty_form_map where tarion_code = upper(coalesce(p->>'formCode',''));
  select * into v_lot from warranty_lots where company_id = p_company and tw_norm_enrol(enrollment_number) = tw_norm_enrol(p->>'enrolment') and tw_norm_enrol(p->>'enrolment') <> '' limit 1;

  if v_lot.id is null then
    v_status := 'needs_review'; v_reason := 'No lot has enrolment ' || coalesce(nullif(p->>'enrolment',''),'(blank)') || ' yet';
  elsif v_map.tarion_code is null or not v_map.do_import or v_map.period_type is null then
    v_status := 'needs_review'; v_reason := 'Form type ' || coalesce(p->>'formCode','?') || ' is not auto-imported';
  else
    select * into v_clash from cases where company_id = p_company and lot_id = v_lot.id and period_type = v_map.period_type and deleted_at is null order by created_at limit 1;
    if v_clash.id is not null then
      if exists (select 1 from warranty_items where case_id = v_clash.id and deleted_at is null) then
        v_status := 'needs_review'; v_reason := v_map.label || ' case ' || v_clash.case_number || ' already exists for this lot with items';
      else
        v_case := v_clash.id; v_no := v_clash.case_number;
        update cases set tarion_case_number = coalesce(tarion_case_number, p->>'caseNumber') where id = v_case;
      end if;
    end if;
  end if;

  if v_status = 'imported' and v_case is null then
    perform pg_advisory_xact_lock(hashtext(p_company::text || v_map.prefix));
    select coalesce(max(substring(case_number from '[0-9]+$')::int), 0) + 1 into v_num
      from cases where company_id = p_company and case_number ~ ('^' || v_map.prefix || '[0-9]+$');
    v_no := v_map.prefix || lpad(v_num::text, 5, '0');
    insert into cases (company_id, case_number, case_type, status, title, description, period_type, lot_id, tarion_case_number, opened_at)
    values (p_company, v_no, 'warranty', 'open', 'Lot ' || v_lot.lot_number || ' — ' || v_map.label,
            'Imported from BuilderLink (Tarion case ' || (p->>'caseNumber') || ')', v_map.period_type, v_lot.id, p->>'caseNumber',
            coalesce(nullif(p->>'createdAt','')::timestamptz, now()))
    returning id into v_case;
  end if;

  if v_status = 'imported' then
    for v_it in select * from jsonb_array_elements(coalesce(p->'items', '[]'::jsonb)) loop
      v_idx := v_idx + 1;
      insert into warranty_items (company_id, case_id, item_number, room, floor_level, defect_area, location, description, owner_description, status, source_period, tarion_deficiency_id)
      values (p_company, v_case, coalesce(nullif(v_it->>'num',''), v_idx::text), nullif(v_it->>'room',''), nullif(v_it->>'floor',''), nullif(v_it->>'area',''),
              nullif(concat_ws(' · ', nullif(v_it->>'ioe',''), nullif(v_it->>'floor',''), nullif(v_it->>'room','')), ''),
              coalesce(nullif(v_it->>'description',''), '(no description)'), nullif(v_it->>'description',''), 'outstanding', v_map.period_type, v_it->>'id')
      on conflict (company_id, tarion_deficiency_id) where tarion_deficiency_id is not null do nothing;
    end loop;
  end if;

  insert into tarion_form_imports (company_id, tarion_case_id, tarion_case_number, form_code, enrolment, owner_name, address, after_sales_email, status, reason,
                                   case_id, lot_id, community_id, items_count, payload, tarion_created_at)
  values (p_company, p->>'tarionCaseId', p->>'caseNumber', p->>'formCode', p->>'enrolment', p->>'owner', p->>'address', nullif(p->>'afterSales',''), v_status, v_reason,
          v_case, v_lot.id, v_lot.community_id, jsonb_array_length(coalesce(p->'items','[]'::jsonb)),
          case when v_status = 'needs_review' then p else null end, nullif(p->>'createdAt','')::timestamptz)
  on conflict (company_id, tarion_case_id) do update set status = excluded.status, reason = excluded.reason, case_id = excluded.case_id, lot_id = excluded.lot_id,
    community_id = excluded.community_id, items_count = excluded.items_count, payload = excluded.payload, notified_at = null, emailed_at = null
  returning case when status = 'imported' then 'created' else 'review' end into v_action;

  return jsonb_build_object('action', v_action, 'caseId', v_case, 'caseNumber', v_no, 'status', v_status, 'reason', v_reason);
end $$;

revoke execute on function tw_ingest_form(uuid, jsonb) from public, anon, authenticated;
grant execute on function tw_ingest_form(uuid, jsonb) to service_role;
