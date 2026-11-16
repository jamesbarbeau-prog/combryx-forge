-- Closing rule for QCI / PDI items.
-- Construction cannot close an item without a photo of the finished work. The only other way is an override the WARRANTY manager approves.

alter table public.inspection_photos add column if not exists kind text not null default 'finding' check (kind in ('finding','closing'));
alter table public.inspection_photos add column if not exists uploaded_by text;

alter table public.inspection_items drop constraint if exists inspection_items_res_status_check;
alter table public.inspection_items add constraint inspection_items_res_status_check check (res_status in ('open','fixed','override','verified'));
alter table public.inspection_items
  add column if not exists override_status text not null default 'none' check (override_status in ('none','requested','approved','denied')),
  add column if not exists override_reason text,
  add column if not exists override_requested_by text,
  add column if not exists override_requested_at timestamptz,
  add column if not exists override_decided_by uuid,
  add column if not exists override_decided_at timestamptz,
  add column if not exists override_decision_note text;
create index if not exists inspection_items_override on public.inspection_items (company_id, override_status) where override_status = 'requested';

-- The rule itself, in the database so no screen or link can skip it.
create or replace function public.inspection_close_rule() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.override_status is distinct from old.override_status and new.override_status in ('approved','denied')
     and coalesce(current_setting('bg.override_ok', true), '') <> '1' then
    raise exception 'Only the warranty manager can approve or deny an override.';
  end if;
  if new.res_status is distinct from old.res_status then
    if new.res_status = 'fixed' and not exists (select 1 from inspection_photos p where p.item_id = new.id and p.kind = 'closing') then
      raise exception 'A photo of the finished work is required to close this item.';
    end if;
    if new.res_status = 'override' and new.override_status <> 'approved' then
      raise exception 'This item can only be closed without a photo after the warranty manager approves it.';
    end if;
    if new.res_status = 'verified' and old.res_status not in ('fixed','override') then
      raise exception 'Only a closed item can be verified.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists inspection_items_close_rule on public.inspection_items;
create trigger inspection_items_close_rule before update on public.inspection_items for each row execute function public.inspection_close_rule();

-- Tell the warranty team when construction has closed everything.
create or replace function public.insp_notify_if_clear(p_inspection uuid) returns void language plpgsql security definer set search_path = public as $$
declare i public.inspections; n int;
begin
  select * into i from inspections where id = p_inspection; if not found then return; end if;
  select count(*) into n from inspection_items where inspection_id = i.id and res_status = 'open' and ((list = 'deficiency') or (list = 'si_check' and result in ('wrong','missing')));
  if n = 0 then
    insert into notifications (company_id, target_role, type, title, body, metadata)
      values (i.company_id, 'manager', 'inspection_closed', upper(i.kind) || ': construction has closed every item', coalesce(i.address, 'Site') || '. Ready for warranty.', jsonb_build_object('inspection_id', i.id));
  end if;
end $$;

drop function if exists public.insp_portal_get(uuid);
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
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'seq', x.seq, 'list', x.list, 'source', x.source, 'room', x.room, 'description', x.description, 'note', x.note,
      'result', x.result, 'res_status', x.res_status, 'res_note', x.res_note, 'res_at', x.res_at,
      'override_status', x.override_status, 'override_reason', x.override_reason, 'override_decision_note', x.override_decision_note,
      'photos', (select count(*) from inspection_photos p where p.item_id = x.id and p.kind = 'finding'),
      'closing_photos', (select count(*) from inspection_photos p where p.item_id = x.id and p.kind = 'closing')) order by x.list, x.seq), '[]'::jsonb) into items
    from inspection_items x where x.inspection_id = i.id and (x.list <> 'si_check' or x.result in ('wrong','missing'));
  return jsonb_build_object('role', v_role, 'kind', i.kind, 'status', i.status, 'company', co.name, 'logo', co.logo_url, 'company_phone', co.phone,
    'address', i.address, 'enrolment_no', i.enrolment_no, 'possession_date', i.possession_date, 'inspector', i.inspector_name, 'completed_at', i.completed_at,
    'owner_names', i.owner_names, 'purchaser_present', i.purchaser_present, 'has_pdf', i.pdf_path is not null, 'items', items);
end $$;

-- Superintendent marks an item closed: only possible with a closing photo (the trigger checks it too).
create or replace function public.insp_portal_resolve(p_token uuid, p_item uuid, p_status text, p_note text default null, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i public.inspections; it public.inspection_items;
begin
  select * into i from inspections where super_token = p_token and status in ('signed','sent');
  if not found then raise exception 'This link is not valid.'; end if;
  if p_status not in ('open','fixed') then raise exception 'Unknown status.'; end if;
  select * into it from inspection_items where id = p_item and inspection_id = i.id; if not found then raise exception 'Item not found.'; end if;
  if it.res_status in ('override','verified') then raise exception 'This item is already closed.'; end if;
  update inspection_items set res_status = p_status, res_note = nullif(left(trim(coalesce(p_note, '')), 500), ''), res_at = case when p_status = 'open' then null else now() end,
    res_by = nullif(left(trim(coalesce(p_name, '')), 80), '') where id = p_item;
  perform insp_notify_if_clear(i.id);
  return jsonb_build_object('ok', true);
end $$;

-- Construction asks the warranty manager to close an item that has no closing photo.
create or replace function public.insp_portal_request_override(p_token uuid, p_item uuid, p_reason text, p_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i public.inspections; it public.inspection_items;
begin
  select * into i from inspections where super_token = p_token and status in ('signed','sent');
  if not found then raise exception 'This link is not valid.'; end if;
  select * into it from inspection_items where id = p_item and inspection_id = i.id; if not found then raise exception 'Item not found.'; end if;
  if it.res_status <> 'open' then raise exception 'This item is already closed.'; end if;
  if it.override_status = 'requested' then raise exception 'A request is already waiting for the warranty manager.'; end if;
  if length(trim(coalesce(p_reason, ''))) < 5 then raise exception 'Tell the warranty manager why this item cannot have a photo.'; end if;
  update inspection_items set override_status = 'requested', override_reason = left(trim(p_reason), 500), override_requested_by = nullif(left(trim(coalesce(p_name, '')), 80), ''),
    override_requested_at = now(), override_decided_by = null, override_decided_at = null, override_decision_note = null where id = p_item;
  insert into notifications (company_id, target_role, type, title, body, metadata)
    values (i.company_id, 'manager', 'inspection_override_requested', 'Override requested: ' || upper(i.kind) || ' item', coalesce(i.address, 'Site') || ': ' || left(it.description, 90), jsonb_build_object('inspection_id', i.id, 'item_id', p_item));
  return jsonb_build_object('ok', true);
end $$;

-- The warranty manager (not a construction manager) approves or denies. Approve closes the item.
create or replace function public.insp_override_decide(p_item uuid, p_approve boolean, p_note text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it public.inspection_items; i public.inspections;
begin
  select * into it from inspection_items where id = p_item; if not found then raise exception 'Item not found.'; end if;
  if not cm_has_role(it.company_id, array['manager']) then raise exception 'Only a warranty manager can decide an override.'; end if;
  if it.override_status <> 'requested' then raise exception 'There is no request waiting on this item.'; end if;
  select * into i from inspections where id = it.inspection_id;
  perform set_config('bg.override_ok', '1', true);
  if p_approve then
    update inspection_items set override_status = 'approved', override_decided_by = auth.uid(), override_decided_at = now(), override_decision_note = nullif(left(trim(coalesce(p_note, '')), 500), ''),
      res_status = 'override', res_at = now(), res_by = 'Warranty manager override' where id = p_item;
    perform insp_notify_if_clear(i.id);
  else
    update inspection_items set override_status = 'denied', override_decided_by = auth.uid(), override_decided_at = now(), override_decision_note = nullif(left(trim(coalesce(p_note, '')), 500), '') where id = p_item;
  end if;
  return jsonb_build_object('ok', true, 'approved', p_approve);
end $$;

revoke all on function public.insp_portal_get(uuid) from public;
revoke all on function public.insp_portal_resolve(uuid, uuid, text, text, text) from public;
revoke all on function public.insp_portal_request_override(uuid, uuid, text, text) from public;
revoke all on function public.insp_override_decide(uuid, boolean, text) from public;
revoke all on function public.insp_notify_if_clear(uuid) from public;
grant execute on function public.insp_portal_get(uuid) to anon, authenticated;
grant execute on function public.insp_portal_resolve(uuid, uuid, text, text, text) to anon, authenticated;
grant execute on function public.insp_portal_request_override(uuid, uuid, text, text) to anon, authenticated;
grant execute on function public.insp_override_decide(uuid, boolean, text) to authenticated;
