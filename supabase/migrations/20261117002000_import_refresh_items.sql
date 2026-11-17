-- Re-importing a deficiency file corrects existing items (matched by work order number inside the case) instead of adding them again.
create or replace function public.import_refresh_items(p_case uuid, p_rows jsonb)
returns int language plpgsql security invoker set search_path = public as $$
declare n int;
begin
  with r as (
    select x->>'wo' as wo, x->>'status' as status, nullif(x->>'completed','')::timestamptz as completed, nullif(x->>'date_in','')::timestamptz as date_in
    from jsonb_array_elements(p_rows) x
  ), u as (
    update warranty_items i
       set status = r.status, completed_at = r.completed, assessed_at = coalesce(r.date_in, i.assessed_at), updated_at = now()
      from r
     where i.case_id = p_case and i.deleted_at is null and i.item_number = r.wo
       and (i.status is distinct from r.status or i.completed_at is distinct from r.completed)
    returning 1)
  select count(*) into n from u;
  return n;
end $$;
grant execute on function public.import_refresh_items(uuid, jsonb) to authenticated;
