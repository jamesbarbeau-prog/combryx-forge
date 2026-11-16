-- Owner's file: one summary per file type for a lot, plus a community aging rollup.
-- File keys: service, pdi, qci, initial, mid_year, year_end, second_year, msd.
-- Open = outstanding warranty items, or inspection deficiencies not yet closed.
create or replace function public.file_key_of(p_period text, p_case_type text)
returns text language sql immutable as $$
  select case
    when p_period in ('initial','mid_year','year_end','second_year','msd','pdi') then p_period
    when p_period in ('emergency','service') or p_case_type in ('emergency','field_service') then 'service'
    else 'service' end
$$;

create or replace function public.lot_file_summary(p_lot uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
with ci as (   -- case items
  select public.file_key_of(c.period_type, c.case_type::text) fk, c.id case_id, c.case_number, c.status::text cstatus, c.opened_at,
         wi.status ist, least(wi.created_at, c.opened_at) created_at
  from cases c left join warranty_items wi on wi.case_id = c.id and wi.deleted_at is null
  where c.lot_id = p_lot and c.deleted_at is null
), ii as (     -- inspection items that need closing
  select i.kind fk, it.res_status, it.created_at
  from inspections i join inspection_items it on it.inspection_id = i.id
  where i.lot_id = p_lot and i.status <> 'cancelled'
    and (it.list = 'deficiency' or (it.list = 'si_check' and it.result in ('wrong','missing')))
), allitems as (
  select fk, case when ist = 'outstanding' then 'open' when ist = 'complete' then 'closed' when ist is null then null else 'other' end st, created_at from ci
  union all
  select fk, case when res_status = 'open' then 'open' when res_status in ('fixed','override','verified') then 'closed' else 'other' end, created_at from ii
), agg as (
  select fk,
    count(*) filter (where st='open') open_n, count(*) filter (where st='closed') closed_n, count(*) filter (where st='other') other_n,
    (max(extract(day from now()-created_at)) filter (where st='open'))::int oldest,
    count(*) filter (where st='open' and now()-created_at <= interval '30 days') b30,
    count(*) filter (where st='open' and now()-created_at > interval '30 days' and now()-created_at <= interval '60 days') b60,
    count(*) filter (where st='open' and now()-created_at > interval '60 days' and now()-created_at <= interval '90 days') b90,
    count(*) filter (where st='open' and now()-created_at > interval '90 days') b90p
  from allitems where st is not null group by fk
), cs as (
  select fk, jsonb_agg(jsonb_build_object('id',case_id,'case_number',case_number,'status',cstatus,'opened_at',opened_at) order by opened_at desc) cases
  from (select distinct fk, case_id, case_number, cstatus, opened_at from ci) x group by fk
), ins as (
  select kind fk, count(*) n, count(*) filter (where status = 'in_progress') in_progress from inspections where lot_id = p_lot and status <> 'cancelled' group by kind
), keys as (select unnest(array['service','pdi','qci','initial','mid_year','year_end','second_year','msd']) fk)
select jsonb_build_object('lot_id', p_lot, 'as_of', now(), 'files', coalesce(jsonb_agg(jsonb_build_object(
  'key', k.fk, 'open', coalesce(a.open_n,0), 'closed', coalesce(a.closed_n,0), 'other', coalesce(a.other_n,0),
  'oldest_open_days', a.oldest, 'buckets', jsonb_build_object('d30',coalesce(a.b30,0),'d60',coalesce(a.b60,0),'d90',coalesce(a.b90,0),'d90p',coalesce(a.b90p,0)),
  'cases', coalesce(c.cases,'[]'::jsonb), 'inspections', coalesce(n.n,0), 'inspections_in_progress', coalesce(n.in_progress,0)
) order by array_position(array['service','pdi','qci','initial','mid_year','year_end','second_year','msd'], k.fk)), '[]'::jsonb))
from keys k left join agg a on a.fk=k.fk left join cs c on c.fk=k.fk left join ins n on n.fk=k.fk
$$;

-- Aging of open items by community and file type (for the KPI view).
create or replace function public.community_aging(p_community uuid default null)
returns table(community_id uuid, community text, file_key text, open_items bigint, lots bigint, avg_age_days numeric, oldest_days int, d30 bigint, d60 bigint, d90 bigint, d90p bigint)
language sql stable security invoker set search_path = public as $$
  with o as (
    select l.community_id, public.file_key_of(c.period_type, c.case_type::text) fk, l.id lot_id, least(wi.created_at, c.opened_at) created_at
    from warranty_items wi join cases c on c.id = wi.case_id and c.deleted_at is null join warranty_lots l on l.id = c.lot_id
    where wi.deleted_at is null and wi.status = 'outstanding' and (p_community is null or l.community_id = p_community)
    union all
    select l.community_id, i.kind, l.id, it.created_at
    from inspection_items it join inspections i on i.id = it.inspection_id and i.status <> 'cancelled' join warranty_lots l on l.id = i.lot_id
    where it.res_status = 'open' and (it.list='deficiency' or (it.list='si_check' and it.result in ('wrong','missing')))
      and (p_community is null or l.community_id = p_community)
  )
  select o.community_id, wc.name, o.fk, count(*), count(distinct o.lot_id),
         round(avg(extract(epoch from now()-o.created_at)/86400)::numeric,1), max(extract(day from now()-o.created_at))::int,
         count(*) filter (where now()-o.created_at <= interval '30 days'),
         count(*) filter (where now()-o.created_at > interval '30 days' and now()-o.created_at <= interval '60 days'),
         count(*) filter (where now()-o.created_at > interval '60 days' and now()-o.created_at <= interval '90 days'),
         count(*) filter (where now()-o.created_at > interval '90 days')
  from o join warranty_communities wc on wc.id = o.community_id group by o.community_id, wc.name, o.fk order by wc.name, o.fk
$$;
grant execute on function public.file_key_of(text,text), public.lot_file_summary(uuid), public.community_aging(uuid) to authenticated;
