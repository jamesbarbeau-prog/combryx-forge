-- Tarion forms that match a case already imported from the QDEF deficiency files are now LINKED to that case
-- (its Tarion case number is saved and each item gets its Tarion line id), so the photo service can fetch their photos.
-- Before this, such a form was parked as "already exists for this lot with items" and its photos were never fetched.
-- Items are matched by the line number at the start of the QDEF item text plus the first words of the description.
create or replace function public.tw_ingest_form(p_company uuid, p jsonb)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_existing tarion_form_imports%rowtype;
  v_map warranty_form_map%rowtype;
  v_lot warranty_lots%rowtype;
  v_clash cases%rowtype;
  v_case uuid; v_num int; v_no text; v_it jsonb; v_idx int := 0;
  v_status text := 'imported'; v_reason text; v_action text; v_street text; v_n int;
  v_linked boolean := false; v_matched int := 0; v_total int := 0;
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
    v_street := tw_norm_street(p->>'address');
    if v_street <> '' then
      select count(*) into v_n from warranty_lots where company_id = p_company and tw_norm_street(address) = v_street;
      if v_n = 1 then
        select * into v_lot from warranty_lots where company_id = p_company and tw_norm_street(address) = v_street;
        if v_lot.enrollment_number is null and coalesce(p->>'enrolment','') <> '' then
          update warranty_lots set enrollment_number = p->>'enrolment' where id = v_lot.id;
        end if;
      end if;
    end if;
  end if;

  if v_lot.id is null then
    v_status := 'needs_review'; v_reason := 'No lot has enrolment ' || coalesce(nullif(p->>'enrolment',''),'(blank)') || ' yet';
  elsif v_map.tarion_code is null or not v_map.do_import or v_map.period_type is null then
    v_status := 'needs_review'; v_reason := 'Form type ' || coalesce(p->>'formCode','?') || ' is not auto-imported';
  else
    select * into v_clash from cases where company_id = p_company and lot_id = v_lot.id and period_type = v_map.period_type and deleted_at is null order by created_at limit 1;
    if v_clash.id is not null then
      if exists (select 1 from warranty_items where case_id = v_clash.id and deleted_at is null) then
        v_total := jsonb_array_length(coalesce(p->'items','[]'::jsonb));
        select count(*) into v_matched from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) it
          where exists (select 1 from warranty_items w where w.case_id = v_clash.id and w.deleted_at is null and w.tarion_deficiency_id is null
            and substring(w.description from '^\s*(\d+)\s') = nullif(regexp_replace(coalesce(it->>'num',''), '\D', '', 'g'), '')
            and position(left(regexp_replace(lower(coalesce(it->>'description','')), '[^a-z0-9]', '', 'g'), 30) in regexp_replace(lower(w.description), '[^a-z0-9]', '', 'g')) > 0);
        if v_matched > 0 and v_matched * 2 >= v_total then
          v_case := v_clash.id; v_no := v_clash.case_number; v_linked := true;
          update cases set tarion_case_number = coalesce(tarion_case_number, p->>'caseNumber') where id = v_case;
          update warranty_items w set tarion_deficiency_id = it->>'id'
            from jsonb_array_elements(coalesce(p->'items','[]'::jsonb)) it
            where w.case_id = v_case and w.deleted_at is null and w.tarion_deficiency_id is null and it->>'id' is not null
              and substring(w.description from '^\s*(\d+)\s') = nullif(regexp_replace(coalesce(it->>'num',''), '\D', '', 'g'), '')
              and position(left(regexp_replace(lower(coalesce(it->>'description','')), '[^a-z0-9]', '', 'g'), 30) in regexp_replace(lower(w.description), '[^a-z0-9]', '', 'g')) > 0
              and not exists (select 1 from warranty_items x where x.company_id = w.company_id and x.tarion_deficiency_id = it->>'id');
        else
          v_status := 'needs_review'; v_reason := v_map.label || ' case ' || v_clash.case_number || ' already exists for this lot with items (' || v_matched || ' of ' || v_total || ' matched)';
        end if;
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

  if v_status = 'imported' and not v_linked then
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
                                   case_id, lot_id, community_id, items_count, payload, tarion_created_at, notified_at, emailed_at)
  values (p_company, p->>'tarionCaseId', p->>'caseNumber', p->>'formCode', p->>'enrolment', p->>'owner', p->>'address', nullif(p->>'afterSales',''), v_status,
          case when v_linked then 'Linked to existing case ' || v_no || ' (' || v_matched || ' of ' || v_total || ' items matched)' else v_reason end,
          v_case, v_lot.id, v_lot.community_id, jsonb_array_length(coalesce(p->'items','[]'::jsonb)),
          case when v_status = 'needs_review' then p else null end, nullif(p->>'createdAt','')::timestamptz,
          case when v_linked then now() end, case when v_linked then now() end)
  on conflict (company_id, tarion_case_id) do update set status = excluded.status, reason = excluded.reason, case_id = excluded.case_id, lot_id = excluded.lot_id,
    community_id = excluded.community_id, items_count = excluded.items_count, payload = excluded.payload, notified_at = excluded.notified_at, emailed_at = excluded.emailed_at
  returning case when status = 'imported' then 'created' else 'review' end into v_action;

  return jsonb_build_object('action', case when v_linked then 'linked' else v_action end, 'caseId', v_case, 'caseNumber', v_no, 'status', v_status, 'reason', v_reason);
end $function$;
