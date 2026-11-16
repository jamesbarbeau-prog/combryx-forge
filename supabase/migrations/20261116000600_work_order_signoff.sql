-- Work order sign-off: scope-only sheet for the trade, owner signature captured on completion.
alter table public.work_orders
  add column if not exists owner_signature text,
  add column if not exists owner_signed_name text,
  add column if not exists owner_signed_at timestamptz;

drop function if exists public.wo_portal_respond(uuid, text, text, text);
create or replace function public.wo_portal_respond(p_token uuid, p_action text, p_note text default null, p_time text default null, p_sig text default null, p_sig_name text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w public.work_orders; note text := nullif(left(trim(coalesce(p_note, '')), 1000), ''); tm text := nullif(left(trim(coalesce(p_time, '')), 200), ''); who text; t text; b text;
  sig text := case when p_sig like 'data:image/png;base64,%' and length(p_sig) < 250000 then p_sig end;
  sname text := nullif(left(trim(coalesce(p_sig_name, '')), 120), '');
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
    update work_orders set response = 'completed', response_at = now(), status = 'complete', completed_at = now(), completion_note = note, trade_attended = true, trade_attended_at = coalesce(trade_attended_at, now()),
      owner_signature = sig, owner_signed_name = case when sig is not null then sname end, owner_signed_at = case when sig is not null then now() end where id = w.id;
    if sig is not null then
      update warranty_items set homeowner_signature = sig, homeowner_signed_at = now()
        where id::text in (select jsonb_array_elements_text(coalesce(w.custom_fields->'item_ids', jsonb_build_array(w.custom_fields->>'item_id'))));
    end if;
    t := who || ' marked the work complete' || case when sig is not null then ', owner signed off' else ' (no owner signature)' end; b := coalesce(w.issue, 'Work order');
  elsif p_action = 'attended' then
    update work_orders set trade_attended = true, trade_attended_at = now(), trade_attend_note = note where id = w.id;
    t := who || ' confirmed they attended'; b := coalesce(w.issue, 'Work order');
  elsif p_action = 'no_show' then
    update work_orders set trade_attended = false, trade_attended_at = now(), trade_attend_note = note where id = w.id;
    t := who || ' did not attend the visit'; b := coalesce(w.issue, 'Work order');
  else raise exception 'Unknown action.'; end if;
  insert into notifications (company_id, target_role, type, title, body, metadata)
    values (w.company_id, 'coordinator', 'work_order_response', t, b || coalesce(E'\n' || note, ''), jsonb_build_object('work_order_id', w.id, 'action', p_action));
  perform wo_check_visit(w.id);
  return jsonb_build_object('ok', true, 'action', p_action);
end $$;
revoke all on function public.wo_portal_respond(uuid, text, text, text, text, text) from public;
grant execute on function public.wo_portal_respond(uuid, text, text, text, text, text) to anon, authenticated;

-- The sheet a trade sees: scope, address, visit time, sign-off. No internal notes, priority or owner phone.
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
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'number', i.item_number, 'room', i.room, 'location', i.location, 'description', i.description) order by i.item_number), '[]'::jsonb)
    into items from warranty_items i
    where i.id::text in (select jsonb_array_elements_text(coalesce(w.custom_fields->'item_ids', jsonb_build_array(w.custom_fields->>'item_id'))));
  return jsonb_build_object(
    'ref', upper(left(w.id::text, 8)), 'company', c.name, 'logo', c.logo_url, 'company_phone', c.phone,
    'audience', w.audience, 'for', w.recipient_name,
    'issue', w.issue,
    'address', coalesce(nullif(w.address, ''), l.address), 'lot', l.lot_number, 'community', cm,
    'homeowner', nullif(trim(coalesce(l.homeowner_name, '')), ''),
    'items', items, 'proposed_at', w.proposed_at, 'proposed_window', w.proposed_window,
    'status', w.status, 'response', w.response, 'response_at', w.response_at, 'requested_time', w.requested_time,
    'response_note', w.response_note, 'completed_at', w.completed_at, 'completion_note', w.completion_note,
    'scheduled_time', w.scheduled_time, 'trade_attended', w.trade_attended, 'trade_attend_note', w.trade_attend_note,
    'signature', w.owner_signature, 'signed_name', w.owner_signed_name, 'signed_at', w.owner_signed_at);
end $$;
revoke all on function public.wo_portal_get(uuid) from public;
grant execute on function public.wo_portal_get(uuid) to anon, authenticated;
