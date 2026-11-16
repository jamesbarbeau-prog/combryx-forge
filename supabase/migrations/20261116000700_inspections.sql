-- QCI and PDI inspections done on site from a phone: items, photos, signatures, per-lot site instruction sources.

-- Where a lot's site instructions / selections live (Box link, any URL, or an uploaded file) and the lines to check them against.
create table if not exists public.lot_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lot_id uuid not null references public.warranty_lots(id) on delete cascade,
  kind text not null default 'site_instructions' check (kind in ('site_instructions','selections','other')),
  title text not null,
  url text,
  storage_path text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create table if not exists public.lot_si_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lot_id uuid not null references public.warranty_lots(id) on delete cascade,
  kind text not null default 'site_instruction' check (kind in ('site_instruction','selection','upgrade')),
  ref text,
  text text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists lot_documents_lot on public.lot_documents (lot_id);
create index if not exists lot_si_lines_lot on public.lot_si_lines (lot_id, sort);

create table if not exists public.inspections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lot_id uuid references public.warranty_lots(id) on delete set null,
  kind text not null check (kind in ('qci','pdi')),
  status text not null default 'in_progress' check (status in ('in_progress','signed','sent','cancelled')),
  inspector_id uuid,
  inspector_name text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  address text,
  enrolment_no text,
  possession_date date,
  super_name text,
  super_email text,
  owner_names text,
  owner_emails text[] not null default '{}',
  purchaser_present boolean not null default true,
  absent_note text,
  checklist jsonb not null default '{}'::jsonb,
  notes text,
  pdf_path text,
  sent_at timestamptz,
  super_token uuid not null default gen_random_uuid(),
  owner_token uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now()
);
create unique index if not exists inspections_super_token on public.inspections (super_token);
create unique index if not exists inspections_owner_token on public.inspections (owner_token);
create index if not exists inspections_lot on public.inspections (lot_id, kind);

create table if not exists public.inspection_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  seq int not null default 0,
  list text not null default 'deficiency' check (list in ('deficiency','not_assessed','substitution','si_check')),
  source text not null default 'observed' check (source in ('observed','site_instruction','selection','upgrade')),
  room text,
  description text not null,
  ref_line_id uuid references public.lot_si_lines(id) on delete set null,
  result text check (result in ('ok','wrong','missing','na')),
  res_status text not null default 'open' check (res_status in ('open','fixed','verified','not_required')),
  res_note text,
  res_at timestamptz,
  res_by text,
  created_by uuid,
  created_at timestamptz not null default now()
);
create index if not exists inspection_items_insp on public.inspection_items (inspection_id, list, seq);

create table if not exists public.inspection_photos (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  item_id uuid references public.inspection_items(id) on delete cascade,
  storage_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists inspection_photos_insp on public.inspection_photos (inspection_id, item_id);

create table if not exists public.inspection_signatures (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  role text not null check (role in ('builder','purchaser','purchaser2','designate')),
  name text,
  signature text not null,
  signed_at timestamptz not null default now(),
  unique (inspection_id, role)
);

do $$ declare t text; begin
  foreach t in array array['lot_documents','lot_si_lines','inspections','inspection_items','inspection_photos','inspection_signatures'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_company', t);
    execute format('create policy %I on public.%I for all to authenticated using (company_id = auth_company_id()) with check (company_id = auth_company_id())', t || '_company', t);
  end loop;
end $$;

-- Once a form is signed it is an official record: items, photos and signatures can no longer be changed from the app.
create or replace function public.inspection_lock() returns trigger language plpgsql security definer set search_path = public as $$
declare st text; iid uuid;
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  iid := coalesce((case when tg_op = 'DELETE' then old.inspection_id else new.inspection_id end), null);
  select status into st from inspections where id = iid;
  if st in ('signed','sent') then
    if tg_table_name = 'inspection_items' and tg_op = 'UPDATE' and new.description = old.description and new.room is not distinct from old.room and new.list = old.list and new.result is not distinct from old.result and new.seq = old.seq then
      return new; -- only the resolution fields changed
    end if;
    raise exception 'This inspection is signed and can no longer be changed.';
  end if;
  return coalesce(new, old);
end $$;
do $$ declare t text; begin
  foreach t in array array['inspection_items','inspection_photos','inspection_signatures'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_lock', t);
    execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.inspection_lock()', t || '_lock', t);
  end loop;
end $$;

-- Photos live in a private bucket, inside the company's own folder.
insert into storage.buckets (id, name, public) values ('inspection-photos', 'inspection-photos', false) on conflict (id) do nothing;
drop policy if exists insp_photos_read on storage.objects;
drop policy if exists insp_photos_write on storage.objects;
drop policy if exists insp_photos_delete on storage.objects;
create policy insp_photos_read on storage.objects for select to authenticated using (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth_company_id()::text);
create policy insp_photos_write on storage.objects for insert to authenticated with check (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth_company_id()::text);
create policy insp_photos_delete on storage.objects for delete to authenticated using (bucket_id = 'inspection-photos' and (storage.foldername(name))[1] = auth_company_id()::text);

-- Superintendent / owner link: what was recorded. Only the superintendent may mark items fixed.
create or replace function public.insp_portal_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i public.inspections; v_role text; co public.companies; items jsonb;
begin
  select * into i from inspections where super_token = p_token and status in ('signed','sent');
  if found then v_role := 'super'; else
    select * into i from inspections where owner_token = p_token and kind = 'pdi' and status in ('signed','sent');
    if not found then return null; end if; v_role := 'owner';
  end if;
  select * into co from companies where id = i.company_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'seq', x.seq, 'list', x.list, 'source', x.source, 'room', x.room, 'description', x.description,
      'result', x.result, 'res_status', x.res_status, 'res_note', x.res_note, 'res_at', x.res_at) order by x.list, x.seq), '[]'::jsonb) into items
    from inspection_items x where x.inspection_id = i.id and (x.list <> 'si_check' or x.result in ('wrong','missing'));
  return jsonb_build_object('role', v_role, 'kind', i.kind, 'status', i.status, 'company', co.name, 'logo', co.logo_url, 'company_phone', co.phone,
    'address', i.address, 'enrolment_no', i.enrolment_no, 'possession_date', i.possession_date, 'inspector', i.inspector_name, 'completed_at', i.completed_at,
    'owner_names', i.owner_names, 'purchaser_present', i.purchaser_present, 'has_pdf', i.pdf_path is not null, 'items', items);
end $$;

create or replace function public.insp_portal_resolve(p_token uuid, p_item uuid, p_status text, p_note text default null, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i public.inspections; open_left int;
begin
  select * into i from inspections where super_token = p_token and status in ('signed','sent');
  if not found then raise exception 'This link is not valid.'; end if;
  if p_status not in ('open','fixed','not_required') then raise exception 'Unknown status.'; end if;
  update inspection_items set res_status = p_status, res_note = nullif(left(trim(coalesce(p_note, '')), 500), ''), res_at = case when p_status = 'open' then null else now() end,
    res_by = nullif(left(trim(coalesce(p_name, '')), 80), '')
    where id = p_item and inspection_id = i.id;
  select count(*) into open_left from inspection_items where inspection_id = i.id and res_status = 'open' and ((list = 'deficiency') or (list = 'si_check' and result in ('wrong','missing')));
  if open_left = 0 then
    insert into notifications (company_id, target_role, type, title, body, metadata)
      values (i.company_id, 'coordinator', 'inspection_resolved', upper(i.kind) || ': every item is marked fixed', coalesce(i.address, 'Site'), jsonb_build_object('inspection_id', i.id));
  end if;
  return jsonb_build_object('ok', true, 'open_left', open_left);
end $$;

revoke all on function public.insp_portal_get(uuid) from public;
revoke all on function public.insp_portal_resolve(uuid, uuid, text, text, text) from public;
grant execute on function public.insp_portal_get(uuid) to anon, authenticated;
grant execute on function public.insp_portal_resolve(uuid, uuid, text, text, text) to anon, authenticated;
