alter table public.inspection_items add column if not exists note text;

create or replace function public.insp_portal_get(p_token uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare i public.inspections; v_role text; co public.companies; items jsonb; photos jsonb;
begin
  select * into i from inspections where super_token = p_token and status in ('signed','sent');
  if found then v_role := 'super'; else
    select * into i from inspections where owner_token = p_token and kind = 'pdi' and status in ('signed','sent');
    if not found then return null; end if; v_role := 'owner';
  end if;
  select * into co from companies where id = i.company_id;
  select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'seq', x.seq, 'list', x.list, 'source', x.source, 'room', x.room, 'description', x.description, 'note', x.note,
      'result', x.result, 'res_status', x.res_status, 'res_note', x.res_note, 'res_at', x.res_at,
      'photos', (select count(*) from inspection_photos p where p.item_id = x.id)) order by x.list, x.seq), '[]'::jsonb) into items
    from inspection_items x where x.inspection_id = i.id and (x.list <> 'si_check' or x.result in ('wrong','missing'));
  return jsonb_build_object('role', v_role, 'kind', i.kind, 'status', i.status, 'company', co.name, 'logo', co.logo_url, 'company_phone', co.phone,
    'address', i.address, 'enrolment_no', i.enrolment_no, 'possession_date', i.possession_date, 'inspector', i.inspector_name, 'completed_at', i.completed_at,
    'owner_names', i.owner_names, 'purchaser_present', i.purchaser_present, 'has_pdf', i.pdf_path is not null, 'items', items);
end $$;
revoke all on function public.insp_portal_get(uuid) from public;
grant execute on function public.insp_portal_get(uuid) to anon, authenticated;
