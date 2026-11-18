-- Aging review: an assisted recommendation on which aged open items to keep open, close safely, or close now.
-- The AI only answers two questions per item (could it be a 2-year-warranty item, could it be a major structural defect).
-- The close/keep decision itself is the fixed rule set in aging_review() below, so it is the same for the screen and the report.
-- Age = days since the home's closing date (same as the Aging page). Nothing is closed by this migration.

create table if not exists public.aging_item_review (
  item_id uuid primary key references public.warranty_items(id) on delete cascade,
  company_id uuid not null,
  desc_hash text not null,                       -- md5 of the description, so an edited description is read again
  two_year_type boolean,                         -- water penetration, electrical/plumbing/heating distribution, Building Code health and safety
  msd_risk text check (msd_risk in ('none','possible')),
  confidence text check (confidence in ('high','medium','low')),
  reason text,
  source text not null default 'ai',
  model text,
  reviewed_at timestamptz not null default now()
);
alter table public.aging_item_review enable row level security;
drop policy if exists aging_item_review_company on public.aging_item_review;
create policy aging_item_review_company on public.aging_item_review for all to authenticated
  using (company_id = auth_company_id()) with check (company_id = auth_company_id());

-- Open Tarion/warranty items older than p_min_days (and older than 1 year) that still need the AI read.
create or replace function public.aging_review_candidates(p_min_days int default 300, p_file text default null)
returns table(item_id uuid, form text, age_days int, description text, dh text)
language sql stable security invoker set search_path = public as $$
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
  where b.age > greatest(365, p_min_days) and b.form <> 'msd'
    and (r.item_id is null or r.desc_hash <> md5(lower(regexp_replace(b.d, '\s+', ' ', 'g'))))
$$;

create or replace function public.aging_review_todo(p_min_days int default 300, p_limit int default 40, p_file text default null)
returns table(item_id uuid, form text, age_days int, description text, dh text)
language sql stable security invoker set search_path = public as $$
  select * from public.aging_review_candidates(p_min_days, p_file) order by age_days desc, item_id limit greatest(p_limit, 1)
$$;

create or replace function public.aging_review_pending(p_min_days int default 300, p_file text default null)
returns int language sql stable security invoker set search_path = public as $$
  select count(*)::int from public.aging_review_candidates(p_min_days, p_file)
$$;

-- The review list. Rules, in order (age in days since closing):
--   no closing date, or closing still ahead ........ needs a person (set the closing date)
--   up to 365 ....................................... keep open, update the owner (still inside the first-year warranty)
--   form is MSD, or the AI sees a possible MSD ...... keep open as a possible major structural defect (until 7 years, then close)
--   not read by the AI yet .......................... unreviewed
--   AI not confident ................................ needs a person
--   366 to 730 and could be a 2-year item ........... keep open, update the owner (can still go on the 2-year form)
--   366 to 730 and not a 2-year item ................ safe to close (no later form can pick it up)
--   731 to 1095 ..................................... safe to close (past the 2-year warranty, no MSD risk found)
--   over 1095 ....................................... close now (over 3 years, no MSD risk found)
create or replace function public.aging_review(p_min_days int default 300, p_community uuid default null, p_file text default null)
returns table(item_id uuid, lot_id uuid, community text, lot_number text, address text, owner text, closing_date date, age_days int,
              item_number text, form text, description text, two_year_type boolean, msd_risk text, confidence text, reason text,
              bucket text, bucket_reason text)
language sql stable security invoker set search_path = public as $$
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
    select b.item_id, b.lot_id, b.community, b.lot_number, b.address, b.owner, b.closing_date, b.age, b.item_number, b.form,
      left(b.d, 400) description, r.two_year_type tyt, r.msd_risk, r.confidence, r.reason, (r.item_id is not null) reviewed,
      (b.form = 'msd' or r.msd_risk = 'possible') msd_flag,
      (b.form = 'second_year' or coalesce(r.two_year_type, false)) is2
    from b left join aging_item_review r on r.item_id = b.item_id and r.desc_hash = md5(lower(regexp_replace(b.d, '\s+', ' ', 'g')))
    where b.age is null or b.age > p_min_days
  ), k as (
    select j.*, case
      when age is null then 'needs_review'
      when age <= 365 then 'keep_followup'
      when msd_flag and age > 2555 then 'close_now'
      when msd_flag then 'keep_msd'
      when not reviewed then 'needs_review'
      when confidence = 'low' then 'needs_review'
      when age <= 730 and is2 then 'keep_followup'
      when age <= 730 then 'safe_close'
      when age <= 1095 then 'safe_close'
      else 'close_now' end bk
    from j
  )
  select item_id, lot_id, community, lot_number, address, owner, closing_date, age, item_number, form, description, tyt, msd_risk, confidence, reason,
    bk,
    case
      when age is null then 'Closing date is missing or still ahead. Set it before judging this item.'
      when age <= 365 then 'Inside the first-year warranty. Keep open and update the owner.'
      when bk = 'close_now' and msd_flag then 'Over 7 years since closing, past the end of the structural warranty.'
      when bk = 'keep_msd' then 'Possible major structural defect. Keep open and review.'
      when not reviewed then 'The AI has not read this item yet.'
      when bk = 'needs_review' then 'The AI was not sure. A person should read it.'
      when bk = 'keep_followup' then 'Could still go on the 2-year form. Keep open and update the owner.'
      when bk = 'safe_close' and age <= 730 then 'Not a 2-year warranty item and past the first-year forms, so no later form can pick it up.'
      when bk = 'safe_close' then 'Past the 2-year warranty and no major structural risk found.'
      else 'Over 3 years since closing and no major structural risk found.' end
  from k
  order by community, closing_date nulls first, lot_number, item_number
$$;

grant execute on function public.aging_review_candidates(int, text), public.aging_review_todo(int, int, text),
  public.aging_review_pending(int, text), public.aging_review(int, uuid, text) to authenticated;
