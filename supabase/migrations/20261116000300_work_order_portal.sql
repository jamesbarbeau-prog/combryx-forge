-- Work order portal: a trade or in-house technician opens a private link (no login), sees the site and the proposed
-- visit time, prints the work order, accepts the time or asks for another, and marks the job complete.
alter table public.work_orders
  add column if not exists portal_token uuid not null default gen_random_uuid(),
  add column if not exists audience text not null default 'trade',
  add column if not exists recipient_name text,
  add column if not exists recipient_email text,
  add column if not exists proposed_at timestamptz,
  add column if not exists proposed_window text,
  add column if not exists portal_sent_at timestamptz,
  add column if not exists portal_viewed_at timestamptz,
  add column if not exists response text,
  add column if not exists response_at timestamptz,
  add column if not exists response_note text,
  add column if not exists requested_time text,
  add column if not exists completion_note text;
create unique index if not exists work_orders_portal_token_key on public.work_orders (portal_token);

-- Read one work order by its private token. Returns only what the person doing the job needs.
create or replace function public.wo_portal_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w public.work_orders; l public.warranty_lots; c public.companies; cm text; items jsonb;
begin
  select * into w from work_orders where portal_token = p_token and portal_sent_at is not null;
  if not found then return null; end if;
  update work_orders set portal_viewed_at = coalesce(portal_viewed_at, now()) where id = w.id;
  select * into l from warranty_lots where id = w.lot_id;
  select * into c from companies where id = w.company_id;
  select name into cm from warranty_communities where id = l.community_id;
  select coalesce(jsonb_agg(jsonb_build_object('number', i.item_number, 'room', i.room, 'location', i.location, 'description', i.description) order by i.item_number), '[]'::jsonb)
    into items from warranty_items i
    where i.id::text in (select jsonb_array_elements_text(coalesce(w.custom_fields->'item_ids', jsonb_build_array(w.custom_fields->>'item_id'))));
  return jsonb_build_object(
    'ref', upper(left(w.id::text, 8)), 'company', c.name, 'logo', c.logo_url, 'company_phone', c.phone,
    'audience', w.audience, 'for', w.recipient_name,
    'issue', w.issue, 'description', w.description, 'notes', w.notes, 'priority', w.priority,
    'address', coalesce(nullif(w.address, ''), l.address), 'lot', l.lot_number, 'community', cm,
    'homeowner', nullif(trim(coalesce(l.homeowner_name, '')), ''), 'homeowner_phone', coalesce(l.phone_primary, l.homeowner_phone),
    'items', items, 'proposed_at', w.proposed_at, 'proposed_window', w.proposed_window,
    'status', w.status, 'response', w.response, 'response_at', w.response_at, 'requested_time', w.requested_time,
    'response_note', w.response_note, 'completed_at', w.completed_at, 'completion_note', w.completion_note);
end $$;

-- The person answers: accept the proposed time, ask for another, or mark the work complete.
create or replace function public.wo_portal_respond(p_token uuid, p_action text, p_note text default null, p_time text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w public.work_orders; note text := nullif(left(trim(coalesce(p_note, '')), 1000), ''); tm text := nullif(left(trim(coalesce(p_time, '')), 200), ''); who text; t text; b text;
begin
  select * into w from work_orders where portal_token = p_token and portal_sent_at is not null;
  if not found then raise exception 'This link is not valid.'; end if;
  who := coalesce(nullif(w.recipient_name, ''), 'The trade');
  if p_action = 'accept' then
    if w.proposed_at is null then raise exception 'No time has been proposed yet.'; end if;
    update work_orders set response = 'accepted', response_at = now(), response_note = note, requested_time = null, status = 'scheduled', scheduled_time = w.proposed_at where id = w.id;
    t := who || ' accepted the visit'; b := coalesce(w.issue, 'Work order');
  elsif p_action = 'reschedule' then
    if tm is null then raise exception 'Please say when would suit you.'; end if;
    update work_orders set response = 'reschedule_requested', response_at = now(), response_note = note, requested_time = tm where id = w.id;
    t := who || ' asked for a different time'; b := coalesce(w.issue, 'Work order') || E'\nSuggested: ' || tm;
  elsif p_action = 'complete' then
    update work_orders set response = 'completed', response_at = now(), status = 'complete', completed_at = now(), completion_note = note where id = w.id;
    t := who || ' marked the work complete'; b := coalesce(w.issue, 'Work order');
  else raise exception 'Unknown action.'; end if;
  insert into notifications (company_id, target_role, type, title, body, metadata)
    values (w.company_id, 'coordinator', 'work_order_response', t, b || coalesce(E'\n' || note, ''), jsonb_build_object('work_order_id', w.id, 'action', p_action));
  return jsonb_build_object('ok', true, 'action', p_action);
end $$;

revoke all on function public.wo_portal_get(uuid) from public;
revoke all on function public.wo_portal_respond(uuid, text, text, text) from public;
grant execute on function public.wo_portal_get(uuid) to anon, authenticated;
grant execute on function public.wo_portal_respond(uuid, text, text, text) to anon, authenticated;
