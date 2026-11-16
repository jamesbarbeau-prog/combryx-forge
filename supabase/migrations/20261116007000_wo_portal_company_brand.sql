-- Trade portal: company name, logo and phone come from the company's own branding settings (fallback to the companies row).
create or replace function public.wo_portal_get(p_token uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare w public.work_orders; l public.warranty_lots; c public.companies; cm text; items jsonb; cs jsonb;
begin
  select * into w from work_orders where portal_token = p_token and portal_sent_at is not null;
  if not found then return null; end if;
  update work_orders set portal_viewed_at = coalesce(portal_viewed_at, now()) where id = w.id;
  select * into l from warranty_lots where id = w.lot_id;
  select * into c from companies where id = w.company_id;
  select settings into cs from company_settings where company_id = w.company_id order by updated_at desc nulls last limit 1;
  select name into cm from warranty_communities where id = l.community_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'number', i.item_number, 'room', i.room, 'location', i.location, 'description', i.description) order by i.item_number), '[]'::jsonb)
    into items from warranty_items i
    where i.id::text in (select jsonb_array_elements_text(coalesce(w.custom_fields->'item_ids', jsonb_build_array(w.custom_fields->>'item_id'))));
  return jsonb_build_object(
    'ref', upper(left(w.id::text, 8)),
    'company', coalesce(nullif(cs->>'name', ''), c.name),
    'logo', coalesce(nullif(cs->>'logo_url', ''), c.logo_url),
    'company_phone', coalesce(nullif(cs->>'phone', ''), c.phone),
    'audience', w.audience, 'for', w.recipient_name,
    'issue', w.issue,
    'address', coalesce(nullif(w.address, ''), l.address), 'lot', l.lot_number, 'community', cm,
    'homeowner', nullif(trim(coalesce(l.homeowner_name, '')), ''),
    'items', items, 'proposed_at', w.proposed_at, 'proposed_window', w.proposed_window,
    'status', w.status, 'response', w.response, 'response_at', w.response_at, 'requested_time', w.requested_time,
    'response_note', w.response_note, 'completed_at', w.completed_at, 'completion_note', w.completion_note,
    'scheduled_time', w.scheduled_time, 'trade_attended', w.trade_attended, 'trade_attend_note', w.trade_attend_note,
    'signature', w.owner_signature, 'signed_name', w.owner_signed_name, 'signed_at', w.owner_signed_at);
end $function$;
