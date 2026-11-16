-- Aging = days since the home's closing date, for items that are still open.
-- Bands: 30, 60, 90, 120, 180, 300, 300p (over 300). 'pre' = closing date missing or still in the future.
create or replace function public.age_band(d int) returns text language sql immutable as $$
  select case when d is null then 'pre' when d <= 30 then '30' when d <= 60 then '60' when d <= 90 then '90'
              when d <= 120 then '120' when d <= 180 then '180' when d <= 300 then '300' else '300p' end
$$;

create or replace function public.lot_file_summary(p_lot uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
with lt as (select case when closing_date <= current_date then current_date - closing_date end age from warranty_lots where id = p_lot),
ci as (
  select public.file_key_of(c.period_type, c.case_type::text) fk, c.id case_id, c.case_number, c.status::text cstatus, c.opened_at, wi.status ist
  from cases c left join warranty_items wi on wi.case_id = c.id and wi.deleted_at is null
  where c.lot_id = p_lot and c.deleted_at is null
), ii as (
  select i.kind fk, it.res_status
  from inspections i join inspection_items it on it.inspection_id = i.id
  where i.lot_id = p_lot and i.status <> 'cancelled'
    and (it.list = 'deficiency' or (it.list = 'si_check' and it.result in ('wrong','missing')))
), allitems as (
  select fk, case when ist = 'outstanding' then 'open' when ist = 'complete' then 'closed' when ist is null then null else 'other' end st from ci
  union all
  select fk, case when res_status = 'open' then 'open' when res_status in ('fixed','override','verified') then 'closed' else 'other' end from ii
), agg as (
  select fk, count(*) filter (where st='open') open_n, count(*) filter (where st='closed') closed_n, count(*) filter (where st='other') other_n
  from allitems where st is not null group by fk
), cs as (
  select fk, jsonb_agg(jsonb_build_object('id',case_id,'case_number',case_number,'status',cstatus,'opened_at',opened_at) order by opened_at desc) cases
  from (select distinct fk, case_id, case_number, cstatus, opened_at from ci) x group by fk
), ins as (
  select kind fk, count(*) n, count(*) filter (where status = 'in_progress') in_progress from inspections where lot_id = p_lot and status <> 'cancelled' group by kind
), keys as (select unnest(array['service','pdi','qci','initial','mid_year','year_end','second_year','msd']) fk)
select jsonb_build_object('lot_id', p_lot, 'as_of', now(), 'age_days', (select age from lt), 'band', public.age_band((select age from lt)),
  'files', coalesce(jsonb_agg(jsonb_build_object(
  'key', k.fk, 'open', coalesce(a.open_n,0), 'closed', coalesce(a.closed_n,0), 'other', coalesce(a.other_n,0),
  'cases', coalesce(c.cases,'[]'::jsonb), 'inspections', coalesce(n.n,0), 'inspections_in_progress', coalesce(n.in_progress,0)
) order by array_position(array['service','pdi','qci','initial','mid_year','year_end','second_year','msd'], k.fk)), '[]'::jsonb))
from keys k left join agg a on a.fk=k.fk left join cs c on c.fk=k.fk left join ins n on n.fk=k.fk
$$;

drop function if exists public.community_aging(uuid);
create or replace function public.community_aging(p_community uuid default null, p_file text default null)
returns table(community_id uuid, community text, lots bigint, open_items bigint, avg_age_days numeric, oldest_days int,
              b30 bigint, b60 bigint, b90 bigint, b120 bigint, b180 bigint, b300 bigint, b300p bigint, pre bigint)
language sql stable security invoker set search_path = public as $$
  with o as (
    select l.community_id, l.id lot_id, case when l.closing_date <= current_date then current_date - l.closing_date end age
    from warranty_items wi join cases c on c.id = wi.case_id and c.deleted_at is null join warranty_lots l on l.id = c.lot_id
    where wi.deleted_at is null and wi.status = 'outstanding' and (p_community is null or l.community_id = p_community)
      and (p_file is null or public.file_key_of(c.period_type, c.case_type::text) = p_file)
    union all
    select l.community_id, l.id, case when l.closing_date <= current_date then current_date - l.closing_date end
    from inspection_items it join inspections i on i.id = it.inspection_id and i.status <> 'cancelled' join warranty_lots l on l.id = i.lot_id
    where it.res_status = 'open' and (it.list='deficiency' or (it.list='si_check' and it.result in ('wrong','missing')))
      and (p_community is null or l.community_id = p_community) and (p_file is null or i.kind = p_file)
  )
  select o.community_id, wc.name, count(distinct o.lot_id), count(*), round(avg(o.age)::numeric,0), max(o.age),
    count(*) filter (where public.age_band(o.age)='30'), count(*) filter (where public.age_band(o.age)='60'),
    count(*) filter (where public.age_band(o.age)='90'), count(*) filter (where public.age_band(o.age)='120'),
    count(*) filter (where public.age_band(o.age)='180'), count(*) filter (where public.age_band(o.age)='300'),
    count(*) filter (where public.age_band(o.age)='300p'), count(*) filter (where public.age_band(o.age)='pre')
  from o join warranty_communities wc on wc.id = o.community_id group by o.community_id, wc.name order by wc.name
$$;

-- The homes behind a band, for review (for example, everything over 300 days after closing).
create or replace function public.aged_lots(p_community uuid default null, p_min_days int default 300, p_file text default null)
returns table(lot_id uuid, community text, lot_number text, address text, owner text, closing_date date, age_days int, open_items bigint)
language sql stable security invoker set search_path = public as $$
  with o as (
    select l.id lot_id, c.period_type, c.case_type::text ct, 1 n from warranty_items wi join cases c on c.id = wi.case_id and c.deleted_at is null join warranty_lots l on l.id = c.lot_id
    where wi.deleted_at is null and wi.status = 'outstanding' and (p_community is null or l.community_id = p_community)
      and (p_file is null or public.file_key_of(c.period_type, c.case_type::text) = p_file)
    union all
    select l.id, i.kind, null, 1 from inspection_items it join inspections i on i.id = it.inspection_id and i.status <> 'cancelled' join warranty_lots l on l.id = i.lot_id
    where it.res_status = 'open' and (it.list='deficiency' or (it.list='si_check' and it.result in ('wrong','missing')))
      and (p_community is null or l.community_id = p_community) and (p_file is null or i.kind = p_file)
  )
  select l.id, wc.name, l.lot_number, l.address, l.homeowner_name, l.closing_date, (current_date - l.closing_date)::int, count(*)
  from o join warranty_lots l on l.id = o.lot_id join warranty_communities wc on wc.id = l.community_id
  where l.closing_date <= current_date and current_date - l.closing_date > p_min_days
  group by l.id, wc.name, l.lot_number, l.address, l.homeowner_name, l.closing_date
  order by l.closing_date limit 500
$$;
grant execute on function public.age_band(int), public.lot_file_summary(uuid), public.community_aging(uuid,text), public.aged_lots(uuid,int,text) to authenticated;
