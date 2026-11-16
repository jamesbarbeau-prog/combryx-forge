-- End-of-day visit checks: ask the trade "did you attend?" and the owner "did the trade show up, are you satisfied?".
alter table public.work_orders
  add column if not exists owner_token uuid not null default gen_random_uuid(),
  add column if not exists visit_check_sent_at timestamptz,
  add column if not exists visit_reminder_sent_at timestamptz,
  add column if not exists visit_escalated_at timestamptz,
  add column if not exists noshow_notified_at timestamptz,
  add column if not exists trade_attended boolean,
  add column if not exists trade_attended_at timestamptz,
  add column if not exists trade_attend_note text,
  add column if not exists owner_attended boolean,
  add column if not exists owner_satisfied boolean,
  add column if not exists owner_comment text,
  add column if not exists owner_responded_at timestamptz;
create unique index if not exists work_orders_owner_token_key on public.work_orders (owner_token);

-- Raise one coordinator alert (in-app notification) about a work order.
create or replace function public.wo_alert(p_wo uuid, p_type text, p_title text, p_body text) returns void
language sql security definer set search_path = public as $$
  insert into notifications (company_id, target_role, type, title, body, metadata)
  select company_id, 'coordinator', p_type, p_title, p_body, jsonb_build_object('work_order_id', id) from work_orders where id = p_wo;
$$;
revoke all on function public.wo_alert(uuid, text, text, text) from public, anon, authenticated;

-- After either side answers, compare the two answers and flag problems.
create or replace function public.wo_check_visit(p_wo uuid) returns void
language plpgsql security definer set search_path = public as $$
declare w public.work_orders; label text;
begin
  select * into w from work_orders where id = p_wo;
  label := coalesce(w.issue, 'Work order') || ' at ' || coalesce(w.address, 'site');
  if w.trade_attended is false or w.owner_attended is false then
    update work_orders set status = 'no_show' where id = w.id and status <> 'no_show';
    if w.trade_attended is true and w.owner_attended is false then
      perform wo_alert(w.id, 'work_order_disputed', 'Trade says they attended, owner says nobody came', label);
    elsif w.owner_attended is false then
      perform wo_alert(w.id, 'work_order_no_show', 'Owner reports the trade did not show up', label);
    end if;
  elsif w.owner_attended is true and w.owner_satisfied is false then
    perform wo_alert(w.id, 'work_order_unsatisfied', 'Owner is not satisfied with the visit', label || coalesce(E'\n' || w.owner_comment, ''));
  elsif w.trade_attended is false and w.owner_attended is true then
    perform wo_alert(w.id, 'work_order_disputed', 'Trade says they did not attend, owner says they did', label);
  end if;
end $$;
revoke all on function public.wo_check_visit(uuid) from public, anon, authenticated;

-- Trade / technician side: extend the portal answer with attendance.
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
    update work_orders set response = 'completed', response_at = now(), status = 'complete', completed_at = now(), completion_note = note, trade_attended = true, trade_attended_at = coalesce(trade_attended_at, now()) where id = w.id;
    t := who || ' marked the work complete'; b := coalesce(w.issue, 'Work order');
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

-- Add attendance fields to what the trade page can read.
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
    'response_note', w.response_note, 'completed_at', w.completed_at, 'completion_note', w.completion_note,
    'scheduled_time', w.scheduled_time, 'trade_attended', w.trade_attended, 'trade_attend_note', w.trade_attend_note);
end $$;

-- Owner side: a short page with two questions.
create or replace function public.wo_owner_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w public.work_orders; l public.warranty_lots; c public.companies;
begin
  select * into w from work_orders where owner_token = p_token and visit_check_sent_at is not null;
  if not found then return null; end if;
  select * into l from warranty_lots where id = w.lot_id;
  select * into c from companies where id = w.company_id;
  return jsonb_build_object('company', c.name, 'logo', c.logo_url, 'company_phone', c.phone,
    'issue', w.issue, 'address', coalesce(nullif(w.address, ''), l.address), 'trade', w.recipient_name,
    'scheduled_time', coalesce(w.scheduled_time, w.proposed_at), 'answered', w.owner_responded_at is not null,
    'attended', w.owner_attended, 'satisfied', w.owner_satisfied);
end $$;

create or replace function public.wo_owner_respond(p_token uuid, p_attended boolean, p_satisfied boolean default null, p_comment text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare w public.work_orders; cm text := nullif(left(trim(coalesce(p_comment, '')), 1000), '');
begin
  select * into w from work_orders where owner_token = p_token and visit_check_sent_at is not null;
  if not found then raise exception 'This link is not valid.'; end if;
  update work_orders set owner_attended = p_attended, owner_satisfied = case when p_attended then p_satisfied else null end,
    owner_comment = cm, owner_responded_at = now() where id = w.id;
  if p_attended and p_satisfied is true then
    perform wo_alert(w.id, 'work_order_response', 'Owner is satisfied with the visit', coalesce(w.issue, 'Work order') || coalesce(E'\n' || cm, ''));
  end if;
  perform wo_check_visit(w.id);
  return jsonb_build_object('ok', true);
end $$;

revoke all on function public.wo_portal_respond(uuid, text, text, text) from public;
revoke all on function public.wo_portal_get(uuid) from public;
revoke all on function public.wo_owner_get(uuid) from public;
revoke all on function public.wo_owner_respond(uuid, boolean, boolean, text) from public;
grant execute on function public.wo_portal_respond(uuid, text, text, text) to anon, authenticated;
grant execute on function public.wo_portal_get(uuid) to anon, authenticated;
grant execute on function public.wo_owner_get(uuid) to anon, authenticated;
grant execute on function public.wo_owner_respond(uuid, boolean, boolean, text) to anon, authenticated;
