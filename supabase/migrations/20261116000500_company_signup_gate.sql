-- Sign-up gate: only staff of a company (work-email domain or explicit invite) can create an account,
-- and only a confirmed email joins that company. Outsiders cannot even create a login.

alter table public.companies add column if not exists email_domains text[] not null default '{}';
update public.companies set email_domains = array['claridgehomes.com'] where id = 'c8bd8b99-090d-4379-86cd-95c3844c09f9' and email_domains = '{}';
update public.companies set name = 'Claridge Homes' where id = 'c8bd8b99-090d-4379-86cd-95c3844c09f9' and name = 'Your Company Name';

create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  access_level text not null default 'community',
  cm_role text not null default 'viewer' check (cm_role in ('manager','coordinator','viewer')),
  is_owner boolean not null default false,
  invited_by uuid,
  created_at timestamptz not null default now(),
  used_at timestamptz
);
create unique index if not exists company_invites_open_email on public.company_invites (lower(email)) where used_at is null;
alter table public.company_invites enable row level security;

create or replace function public.is_free_mail(p_domain text) returns boolean language sql immutable as $$
  select lower(p_domain) = any (array['gmail.com','googlemail.com','outlook.com','hotmail.com','live.com','msn.com','yahoo.com','yahoo.ca','icloud.com','me.com','aol.com','proton.me','protonmail.com','gmx.com','mail.com','rogers.com','bell.net','sympatico.ca','shaw.ca','telus.net','videotron.ca','cogeco.ca']);
$$;

-- Administrator = company owner, or an administrator access level.
create or replace function public.is_company_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from users u where u.id = auth.uid() and (u.is_owner or u.access_level in ('company','owner','vp','director')));
$$;

drop policy if exists company_invites_admin on public.company_invites;
create policy company_invites_admin on public.company_invites for all to authenticated
  using (company_id = auth_company_id() and is_company_admin()) with check (company_id = auth_company_id() and is_company_admin());

-- Which company (and level) would this email join? Invite first, then the company's staff domain.
create or replace function public.signup_company_for(p_email text) returns table (company_id uuid, access_level text, cm_role text, is_owner boolean)
language plpgsql stable security definer set search_path = public as $$
declare d text := lower(split_part(coalesce(p_email, ''), '@', 2));
begin
  if d = '' then return; end if;
  return query select i.company_id, i.access_level, i.cm_role, i.is_owner from company_invites i
    join companies c on c.id = i.company_id and c.is_active and c.deleted_at is null
    where lower(i.email) = lower(p_email) and i.used_at is null limit 1;
  if found then return; end if;
  if public.is_free_mail(d) then return; end if;
  return query select c.id, 'community'::text, 'viewer'::text, false from companies c
    where c.is_active and c.deleted_at is null and d = any (c.email_domains) limit 1;
end $$;
revoke all on function public.signup_company_for(text) from public, anon, authenticated;

-- Friendly pre-check for the sign-up form (true/false only).
create or replace function public.signup_allowed(p_email text) returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.signup_company_for(p_email));
$$;
grant execute on function public.signup_allowed(text) to anon, authenticated;

-- Gate 1: refuse to create a login for anyone who is not company staff.
create or replace function public.enforce_company_signup() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.signup_company_for(new.email)) then
    raise exception 'Sign-up is limited to staff of companies using Builder Guardian. Use your work email address.';
  end if;
  return new;
end $$;
drop trigger if exists enforce_company_signup on auth.users;
create trigger enforce_company_signup before insert on auth.users for each row execute function public.enforce_company_signup();

-- Gate 2: only once the email link has been clicked does the person join the company (lowest access).
create or replace function public.join_company_on_confirm() returns trigger language plpgsql security definer set search_path = public as $$
declare c record; meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
begin
  if new.email_confirmed_at is null then return new; end if;
  if exists (select 1 from users where id = new.id) then return new; end if;
  select * into c from public.signup_company_for(new.email) limit 1;
  if not found then return new; end if;
  insert into users (id, company_id, email, first_name, last_name, access_level, is_owner, role)
  values (new.id, c.company_id, lower(new.email), coalesce(nullif(meta->>'first_name', ''), initcap(split_part(new.email, '@', 1))), coalesce(meta->>'last_name', ''), c.access_level, c.is_owner, case when c.is_owner then 'owner'::user_role else 'tech'::user_role end);
  insert into cm_members (company_id, user_id, role) values (c.company_id, new.id, c.cm_role) on conflict do nothing;
  update company_invites set used_at = now() where lower(email) = lower(new.email) and used_at is null;
  return new;
end $$;
drop trigger if exists join_company_on_confirm on auth.users;
create trigger join_company_on_confirm after insert or update of email_confirmed_at on auth.users for each row execute function public.join_company_on_confirm();

-- Members cannot promote themselves or move companies; only an administrator changes access.
create or replace function public.guard_user_privileges() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and (new.access_level is distinct from old.access_level or new.is_owner is distinct from old.is_owner or new.role is distinct from old.role or new.company_id is distinct from old.company_id or new.is_active is distinct from old.is_active)
     and not public.is_company_admin() then
    raise exception 'Only an administrator can change access.';
  end if;
  return new;
end $$;
drop trigger if exists guard_user_privileges on public.users;
create trigger guard_user_privileges before update on public.users for each row execute function public.guard_user_privileges();

-- Only an administrator may change the staff domains, and free-mail domains are never allowed.
create or replace function public.guard_company_domains() returns trigger language plpgsql security definer set search_path = public as $$
declare d text; cleaned text[] := '{}';
begin
  if new.email_domains is distinct from old.email_domains then
    if auth.uid() is not null and not public.is_company_admin() then raise exception 'Only an administrator can change who may join.'; end if;
    foreach d in array new.email_domains loop
      d := lower(trim(both '@ ' from d));
      if d = '' or d !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+$' then raise exception 'Not a valid email domain: %', d; end if;
      if public.is_free_mail(d) then raise exception '% is a public email provider and cannot be used to verify staff.', d; end if;
      cleaned := cleaned || d;
    end loop;
    new.email_domains := cleaned;
  end if;
  return new;
end $$;
drop trigger if exists guard_company_domains on public.companies;
create trigger guard_company_domains before update on public.companies for each row execute function public.guard_company_domains();

-- Stray open policies: reference tables only for people who belong to a company; case documents only inside the company folder.
drop policy if exists form_map_read on public.warranty_form_map;
create policy form_map_read on public.warranty_form_map for select to authenticated using (auth_company_id() is not null);
drop policy if exists trade_matrix_read on public.trade_matrix;
create policy trade_matrix_read on public.trade_matrix for select to authenticated using (auth_company_id() is not null);

drop policy if exists "authenticated download 5pq0yj_0" on storage.objects;
drop policy if exists "authenticated upload 5pq0yj_0" on storage.objects;
drop policy if exists case_docs_company_read on storage.objects;
drop policy if exists case_docs_company_write on storage.objects;
create policy case_docs_company_read on storage.objects for select to authenticated
  using (bucket_id = 'case-documents' and (storage.foldername(name))[1] = auth_company_id()::text);
create policy case_docs_company_write on storage.objects for insert to authenticated
  with check (bucket_id = 'case-documents' and (storage.foldername(name))[1] = auth_company_id()::text);
