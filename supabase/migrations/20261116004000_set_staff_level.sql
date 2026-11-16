-- One call changes a person's level everywhere it matters: users.access_level, users.role and cm_members.role.
-- Only a company administrator may call it. Levels: viewer, coordinator, manager, admin.
create or replace function public.set_staff_level(p_user uuid, p_level text)
returns void language plpgsql security definer set search_path = public as $$
declare v_company uuid; v_al text; v_role user_role; v_cm text;
begin
  if not public.is_company_admin() then raise exception 'Only an administrator can change access.'; end if;
  select company_id into v_company from users where id = p_user;
  if v_company is null or v_company <> public.auth_company_id() then raise exception 'That person is not on your team.'; end if;
  case p_level
    when 'viewer'      then v_al := 'community'; v_role := 'viewer';  v_cm := 'viewer';
    when 'coordinator' then v_al := 'community'; v_role := 'tech';    v_cm := 'coordinator';
    when 'manager'     then v_al := 'manager';   v_role := 'manager'; v_cm := 'manager';
    when 'admin'       then v_al := 'company';   v_role := 'manager'; v_cm := 'manager';
    else raise exception 'Unknown level %', p_level;
  end case;
  update users set access_level = v_al, role = v_role where id = p_user;
  insert into cm_members (company_id, user_id, role) values (v_company, p_user, v_cm)
    on conflict (company_id, user_id) do update set role = excluded.role;
end $$;
grant execute on function public.set_staff_level(uuid, text) to authenticated;
