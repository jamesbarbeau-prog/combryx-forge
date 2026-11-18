-- Security hardening (advisor findings, 18 Nov 2026).
-- 1. Trigger and internal helper functions are not meant to be called by anyone through the API.
revoke execute on function public.enforce_company_signup(), public.guard_company_domains(), public.guard_user_privileges(),
  public.inspection_close_rule(), public.inspection_lock(), public.join_company_on_confirm(), public.insp_notify_if_clear(uuid)
  from public, anon, authenticated;

-- 2. Staff-only functions: signed-in users only (each one also checks the caller's role and company inside).
revoke execute on function public.is_company_admin(), public.set_staff_level(uuid, text), public.insp_override_decide(uuid, boolean, text) from public, anon;
grant execute on function public.is_company_admin(), public.set_staff_level(uuid, text), public.insp_override_decide(uuid, boolean, text) to authenticated;
-- Left open on purpose: the token-based owner, trade and super portals (wo_portal_*, wo_owner_*, insp_portal_*),
-- and the two sign-up checks (brand_for_email, signup_allowed) that run before anyone is signed in.

-- 3. Pin the search path on every public function that has none, so a look-alike object in another schema cannot be picked up.
do $$
declare f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
      and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
  loop
    execute format('alter function %s set search_path = public, extensions', f.sig);
  end loop;
end $$;
