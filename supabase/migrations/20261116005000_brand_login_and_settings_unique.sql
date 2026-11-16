-- 1. company_settings had no unique company_id, so every Save inserted another row and the page read none of them back.
delete from company_settings a using company_settings b
 where a.company_id = b.company_id and (a.updated_at, a.id) < (b.updated_at, b.id);
create unique index if not exists company_settings_company_uidx on company_settings(company_id);

-- 2. The sign-in page asks which company an email belongs to, so it can show that company's logo before sign-in.
--    Matches an open invite for that exact email, or the company's work email domain (never a free-mail domain).
create or replace function public.brand_for_email(p_email text)
returns table(name text, logo text) language plpgsql stable security definer set search_path = public as $$
declare d text := lower(split_part(coalesce(p_email, ''), '@', 2)); v_company uuid;
begin
  if d = '' then return; end if;
  select i.company_id into v_company from company_invites i
    join companies c on c.id = i.company_id and c.is_active and c.deleted_at is null
   where lower(i.email) = lower(p_email) and i.used_at is null limit 1;
  if v_company is null and not public.is_free_mail(d) then
    select c.id into v_company from companies c where c.is_active and c.deleted_at is null and d = any (c.email_domains) limit 1;
  end if;
  if v_company is null then return; end if;
  return query select coalesce(nullif(s.settings->>'name', ''), c.name), nullif(s.settings->>'logo_url', '')
    from companies c left join company_settings s on s.company_id = c.id where c.id = v_company;
end $$;
grant execute on function public.brand_for_email(text) to anon, authenticated;
