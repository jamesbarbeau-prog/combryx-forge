-- Coordinator morning plan: every outstanding item that has a trade but no booking yet, grouped by community + trade,
-- ranked by the soonest builder repair period (BRP) end. BRP = Tarion's date on the case when we have it, otherwise
-- calculated from the home's warranty start (Initial day 41, Mid-Year 183, Year-End 365, Second-Year 730, plus 120 days).
alter table public.work_orders add column if not exists items_total integer not null default 0;

create or replace function public.plan_trade_work(p_scope text default 'trades', p_community uuid default null, p_max_groups integer default 60)
returns jsonb language sql stable security invoker set search_path = public as $$
with base as (
  select i.id item_id, i.trade_required as trade, i.created_at as item_created,
         c.id case_id, c.case_number, c.period_type, c.brp_end_date as tarion_brp,
         l.id lot_id, l.lot_number, l.address, l.community_id, co.name as community,
         coalesce(l.possession_date, l.closing_date, l.warranty_start_date) as start_d,
         (i.trade_required ~* '^(claridge technician|inspector)' or coalesce(t.is_internal, false)) as internal
  from warranty_items i
  join cases c on c.id = i.case_id and c.deleted_at is null and c.status in ('open', 'in_progress')
  join warranty_lots l on l.id = c.lot_id
  left join warranty_communities co on co.id = l.community_id
  left join trades t on t.company_id = i.company_id and t.trade_name = i.trade_required
  where i.company_id = auth_company_id() and i.deleted_at is null and i.status = 'outstanding'
    and nullif(trim(i.trade_required), '') is not null
    and coalesce(i.warranty_decision, '') <> 'not_warranty'
    and not exists (select 1 from work_order_items w join work_orders o on o.id = w.work_order_id
                    where w.warranty_item_id = i.id and coalesce(o.status, '') not in ('cancelled', 'complete', 'no_show'))
), scoped as (
  select * from base where case p_scope when 'all' then true when 'internal' then internal else not internal end
), brp as (
  select s.*, coalesce(s.tarion_brp, case s.period_type
      when 'initial' then s.start_d + 161 when 'mid_year' then s.start_d + 303
      when 'year_end' then s.start_d + 485 when 'second_year' then s.start_d + 850 end) as brp_end,
    case when s.tarion_brp is not null then 'tarion' when s.period_type in ('initial', 'mid_year', 'year_end', 'second_year') and s.start_d is not null then 'calc' else 'none' end as brp_src
  from scoped s
), lot_trade as (
  select community_id, community, trade, lot_id, lot_number, address,
    count(*)::int as items,
    min(brp_end) as brp_end,
    (array_agg(brp_src order by brp_end nulls last))[1] as brp_src,
    (array_agg(period_type order by brp_end nulls last))[1] as period,
    (array_agg(case_id order by brp_end nulls last))[1] as case_id,
    (array_agg(case_number order by brp_end nulls last))[1] as case_number,
    bool_or(period_type = 'emergency') as emergency,
    (current_date - min(item_created)::date) as oldest_days
  from brp group by community_id, community, trade, lot_id, lot_number, address
), lt2 as (
  select *, (brp_end - current_date) as days_left from lot_trade
), lt3 as (
  select *, case when emergency then 0 when brp_end is null then 5 when days_left between 0 and 30 then 1 when days_left < 0 and days_left >= -60 then 2
                 when days_left between 31 and 120 then 3 when days_left < -60 then 4 else 3 end as tier from lt2
), lt4 as (
  select *, tier * 100000 + case when tier in (1, 3) then days_left when tier in (2, 4) then -days_left else 0 end as rank from lt3
), grp as (
  select community_id, community, trade, sum(items)::int as items, count(*)::int as lot_count, min(rank) as min_rank, min(days_left) as min_days, min(tier) as top_tier,
    count(*) filter (where days_left < 0)::int as overdue_lots,
    jsonb_agg(jsonb_build_object('lot_id', lot_id, 'lot_number', lot_number, 'address', address, 'items', items, 'brp_end', brp_end, 'brp_src', brp_src,
      'period', period, 'case_id', case_id, 'case_number', case_number, 'emergency', emergency, 'days_left', days_left, 'oldest_days', oldest_days, 'tier', tier)
      order by rank, lot_number) as lots
  from lt4 where p_community is null or community_id = p_community
  group by community_id, community, trade
), ranked as (select * from grp order by min_rank, items desc limit greatest(p_max_groups, 1))
select jsonb_build_object(
  'as_of', current_date,
  'summary', (select jsonb_build_object('items', coalesce(sum(items), 0), 'lots', count(distinct lot_id), 'groups', count(distinct (community_id, trade)),
       'overdue_lots', count(distinct lot_id) filter (where days_left < 0),
       'due30_lots', count(distinct lot_id) filter (where days_left between 0 and 30),
       'no_brp_lots', count(distinct lot_id) filter (where brp_end is null),
       'emergency_lots', count(distinct lot_id) filter (where emergency))
     from lt4 where p_community is null or community_id = p_community),
  'communities', (select coalesce(jsonb_agg(jsonb_build_object('id', community_id, 'name', community, 'items', n) order by community), '[]'::jsonb)
     from (select community_id, community, sum(items)::int n from lt4 group by 1, 2) q),
  'groups', coalesce((select jsonb_agg(to_jsonb(r) order by r.min_rank, r.items desc) from ranked r), '[]'::jsonb)
);
$$;
grant execute on function public.plan_trade_work(text, uuid, integer) to authenticated;
