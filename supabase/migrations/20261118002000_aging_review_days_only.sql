-- Aging review, simplified to days only. No AI and no structural-risk check.
--   no closing date (or still ahead) -> needs_review (set the closing date first)
--   age <= p_keep_days (default 730, the 2-year warranty)  -> keep_followup: resolve and update the owner
--   age <= p_close_days (default 1095, 3 years)            -> safe_close: past the 2-year form, no later form can pick it up
--   older                                                  -> close_now: well past 3 years
drop function if exists public.aging_review(int, uuid, text);

create or replace function public.aging_review(p_min_days int default 300, p_community uuid default null, p_file text default null,
                                               p_keep_days int default 730, p_close_days int default 1095)
returns table(item_id uuid, lot_id uuid, community text, lot_number text, address text, owner text, closing_date date, age_days int,
              item_number text, form text, description text, bucket text, bucket_reason text)
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
  ), k as (
    select b.*, case
      when age is null then 'needs_review'
      when age <= p_keep_days then 'keep_followup'
      when age <= p_close_days then 'safe_close'
      else 'close_now' end bk
    from b where age is null or age > p_min_days
  )
  select item_id, lot_id, community, lot_number, address, owner, closing_date, age, item_number, form, left(d, 400), bk,
    case bk
      when 'needs_review' then 'Closing date is missing or still ahead. Set it before judging this item.'
      when 'keep_followup' then 'Inside the ' || round(p_keep_days / 365.0, 1) || '-year window (' || p_keep_days || ' days). Resolve it and update the owner.'
      when 'safe_close' then 'Past ' || p_keep_days || ' days and under ' || p_close_days || '. Safe to close: no Tarion form can pick it up.'
      else 'Over ' || p_close_days || ' days since closing. Close it.' end
  from k
  order by community, closing_date nulls first, lot_number, item_number
$$;

grant execute on function public.aging_review(int, uuid, text, int, int) to authenticated;
