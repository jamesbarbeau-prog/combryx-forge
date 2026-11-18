-- Aging review: the AI filter comes back for one question only, inside the 2-year window.
-- The 2-year form covers water penetration, electrical/plumbing/heating distribution, and Building Code health-and-safety violations.
-- An item past the first year that is NOT one of those cannot be picked up by the 2-year form (even if it rode over from the year-end form),
-- so it is "review and close". The AI answers that single question (aging_item_review.two_year_type); the days do everything else.
--   no closing date / ahead ........................ needs_review
--   up to 365 days ................................. keep_followup (still on the year-end form)
--   366 .. keep days (730) and could be a 2-year type keep_followup
--   366 .. keep days and not a 2-year type ......... review_close
--   366 .. keep days, AI not read yet or unsure .... unread (a person decides; never recommended for closing)
--   keep days .. close days (1095) ................. safe_close
--   over close days ................................ close_now
drop function if exists public.aging_review(int, uuid, text, int, int);
drop function if exists public.aging_review_pending(int, text);
drop function if exists public.aging_review_todo(int, int, text);
drop function if exists public.aging_review_candidates(int, text);

create or replace function public.aging_review_candidates(p_keep_days int default 730, p_file text default null)
returns table(item_id uuid, form text, age_days int, description text, dh text)
language sql stable security invoker set search_path = public, extensions as $$
  with b as (
    select wi.id item_id, public.file_key_of(c.period_type, c.case_type::text) form,
      (current_date - l.closing_date)::int age,
      coalesce(nullif(trim(wi.description),''), nullif(trim(wi.owner_description),''), '') d
    from warranty_items wi join cases c on c.id = wi.case_id and c.deleted_at is null join warranty_lots l on l.id = c.lot_id
    where wi.deleted_at is null and wi.status = 'outstanding' and l.closing_date <= current_date
      and (p_file is null or public.file_key_of(c.period_type, c.case_type::text) = p_file)
  )
  select b.item_id, b.form, b.age, left(b.d, 500), md5(lower(regexp_replace(b.d, '\s+', ' ', 'g')))
  from b left join aging_item_review r on r.item_id = b.item_id
  where b.age > 365 and b.age <= greatest(p_keep_days, 365) and b.form <> 'msd'
    and (r.item_id is null or r.desc_hash <> md5(lower(regexp_replace(b.d, '\s+', ' ', 'g'))))
$$;

create or replace function public.aging_review_todo(p_keep_days int default 730, p_limit int default 40, p_file text default null)
returns table(item_id uuid, form text, age_days int, description text, dh text)
language sql stable security invoker set search_path = public, extensions as $$
  select * from public.aging_review_candidates(p_keep_days, p_file) order by age_days desc, item_id limit greatest(p_limit, 1)
$$;

create or replace function public.aging_review_pending(p_keep_days int default 730, p_file text default null)
returns int language sql stable security invoker set search_path = public, extensions as $$
  select count(*)::int from public.aging_review_candidates(p_keep_days, p_file)
$$;

create or replace function public.aging_review(p_min_days int default 300, p_community uuid default null, p_file text default null,
                                               p_keep_days int default 730, p_close_days int default 1095)
returns table(item_id uuid, lot_id uuid, community text, lot_number text, address text, owner text, closing_date date, age_days int,
              item_number text, form text, description text, two_year_type boolean, confidence text, reason text, bucket text, bucket_reason text)
language sql stable security invoker set search_path = public, extensions as $$
  with b as (
    select wi.id item_id, l.id lot_id, wc.name community, l.lot_number, l.address, l.homeowner_name owner, l.closing_date,
      case when l.closing_date <= current_date then (current_date - l.closing_date)::int end age,
      wi.item_number, public.file_key_of(c.period_type, c.case_type::text) form,
      coalesce(nullif(trim(wi.description),''), nullif(trim(wi.owner_description),''), '') d
    from warranty_items wi join cases c on c.id = wi.case_id and c.deleted_at is null
      join warranty_lots l on l.id = c.lot_id join warranty_communities wc on wc.id = l.community_id
    where wi.deleted_at is null and wi.status = 'outstanding'
      and (p_community is null or l.community_id = p_community)
      and (p_file is null or public.file_key_of(c.period_type, c.case_type::text) = p_file)
  ), j as (
    select b.*, r.two_year_type tyt, r.confidence, r.reason,
      (r.item_id is not null and r.desc_hash = md5(lower(regexp_replace(b.d, '\s+', ' ', 'g')))) read_ok
    from b left join aging_item_review r on r.item_id = b.item_id
    where b.age is null or b.age > p_min_days
  ), k as (
    select j.*, greatest(p_keep_days, 365) kd, case
      when age is null then 'needs_review'
      when age <= 365 then 'keep_followup'
      when age <= greatest(p_keep_days, 365) then
        case when not read_ok or confidence = 'low' then 'unread'
             when tyt then 'keep_followup'
             else 'review_close' end
      when age <= p_close_days then 'safe_close'
      else 'close_now' end bk
    from j
  )
  select item_id, lot_id, community, lot_number, address, owner, closing_date, age, item_number, form, left(d, 400),
    case when read_ok then tyt end, case when read_ok then confidence end, case when read_ok then reason end, bk,
    case
      when bk = 'needs_review' then 'Closing date is missing or still ahead. Set it before judging this item.'
      when bk = 'keep_followup' and age <= 365 then 'Still inside the first year (year-end form). Resolve it and update the owner.'
      when bk = 'keep_followup' then 'Could still go on the 2-year form (water penetration, distribution or Building Code). Keep open and update the owner.'
      when bk = 'unread' and not read_ok then 'The AI has not read this item yet. Not recommended for closing until it has.'
      when bk = 'unread' then 'The AI was not sure what this is. A person should read it.'
      when bk = 'review_close' and form = 'second_year' then 'On the 2-year form but not a 2-year type (water penetration, distribution, Building Code). Review and close.'
      when bk = 'review_close' then 'Not a 2-year type (water penetration, distribution, Building Code), so the 2-year form cannot pick it up. Review and close.'
      when bk = 'safe_close' then 'Past ' || kd || ' days and under ' || p_close_days || '. Safe to close: no Tarion form can pick it up.'
      else 'Over ' || p_close_days || ' days since closing. Close it.' end
  from k
  order by community, closing_date nulls first, lot_number, item_number
$$;

grant execute on function public.aging_review_candidates(int, text), public.aging_review_todo(int, int, text),
  public.aging_review_pending(int, text), public.aging_review(int, uuid, text, int, int) to authenticated;
