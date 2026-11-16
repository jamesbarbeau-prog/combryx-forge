-- Live search over homes (civic address, lot incl. townhome block-lots like B04-39, owner, enrolment, case #) and the community dashboard feeds.
-- All three are SECURITY INVOKER so row-level security (company isolation) applies to the caller.
create or replace function public.warranty_search(p_q text, p_limit int default 12)
returns table(lot_id uuid, community text, lot_number text, address text, owner text, enrollment text,
              open_cases int, closed_cases int, conciliations int, case_hit text)
language sql stable security invoker set search_path = public as $$
  with toks as (
    -- "B04-39", "b4 39", "B4-39", "b439" all end up as block + lot words; leading zeros are dropped on both sides; "lot"/"unit" are ignored
    select regexp_replace(regexp_replace(t, '^([a-z]+)0+([0-9])', '\1\2'), '^0+([0-9])', '\1') as t
    from (select lower(x) as t from regexp_split_to_table(btrim(coalesce(p_q,'')), '[[:space:],%_/\\-]+') x where x <> '' and x not in ('lot','lots','block','blk','unit','#')) s
  ), base as (
    select l.id, l.lot_number, l.address, l.civic_number, c.name as cname,
           lower(concat_ws(' ', l.lot_number,
                 regexp_replace(l.lot_number, '([A-Za-z])0+([0-9])', '\1\2', 'g'),
                 regexp_replace(l.lot_number, '[-/ ]+', ' ', 'g'),
                 regexp_replace(regexp_replace(l.lot_number, '([A-Za-z])0+([0-9])', '\1\2', 'g'), '[-/ ]+', ' ', 'g'),
                 regexp_replace(regexp_replace(l.lot_number, '([A-Za-z])0+([0-9])', '\1\2', 'g'), '[-/ ]+', '', 'g'),
                 regexp_replace(l.lot_number, '^.*[-/ ]', ''))) as lot_ix,
           nullif(btrim(concat_ws(' & ', nullif(btrim(concat_ws(' ', l.homeowner_first, l.homeowner_last)), ''), nullif(btrim(concat_ws(' ', l.owner2_first, l.owner2_last)), ''))), '') as owner_n,
           l.homeowner_name, l.enrollment_number,
           (select string_agg(x.cn, ' ') from (
              select ca.case_number as cn from cases ca where ca.lot_id = l.id
              union all select ca.tarion_case_number from cases ca where ca.lot_id = l.id and ca.tarion_case_number is not null
              union all select m.case_number from cm_cases m where m.lot_id = l.id) x) as case_nums,
           (select count(*) from cases ca where ca.lot_id = l.id and ca.closed_at is null and ca.status in ('open','in_progress'))::int as open_n,
           (select count(*) from cases ca where ca.lot_id = l.id and (ca.closed_at is not null or ca.status not in ('open','in_progress')))::int as closed_n,
           (select count(*) from cm_cases m where m.lot_id = l.id)::int as conc_n
    from warranty_lots l left join warranty_communities c on c.id = l.community_id
  ), hay as (
    select b.*, lower(concat_ws(' ', b.address, b.civic_number, b.lot_ix, b.homeowner_name, b.owner_n, b.enrollment_number, b.cname, b.case_nums)) as h from base b
  ), hit as (
    select h.*, (select count(*) from toks where h.h ~ ('\m' || toks.t || '\M')) as whole_n
    from hay h
    where exists (select 1 from toks)
      and not exists (select 1 from toks where case when toks.t ~ '^[a-z]{0,3}[0-9]{1,4}$' then h.h !~ ('\m' || toks.t) else h.h not like '%' || toks.t || '%' end)
  )
  select h.id, h.cname, h.lot_number, h.address, coalesce(h.owner_n, h.homeowner_name), h.enrollment_number, h.open_n, h.closed_n, h.conc_n,
         (select split_part(x, ' ', 1) from regexp_split_to_table(coalesce(h.case_nums, ''), ' ') x where x <> '' and exists (select 1 from toks where x ilike '%' || toks.t || '%') limit 1)
  from hit h
  order by h.whole_n desc, (h.open_n + h.conc_n) desc, h.address
  limit greatest(1, least(p_limit, 30));
$$;
grant execute on function public.warranty_search(text, int) to authenticated;

create or replace function public.community_counts()
returns table(community_id uuid, name text, lots int, open_cases int, open_items int)
language sql stable security invoker set search_path = public as $$
  select c.id, c.name,
    (select count(*) from warranty_lots l where l.community_id = c.id)::int,
    (select count(*) from cases ca join warranty_lots l on l.id = ca.lot_id where l.community_id = c.id and ca.closed_at is null and ca.status in ('open','in_progress'))::int,
    (select count(*) from warranty_items wi join cases ca on ca.id = wi.case_id join warranty_lots l on l.id = ca.lot_id where l.community_id = c.id and wi.status = 'outstanding')::int
  from warranty_communities c where coalesce(c.active, true) order by c.name;
$$;

create or replace function public.community_overview(p_community uuid)
returns table(lot_id uuid, lot_number text, address text, owner text, enrollment text, model text, start_date date, forms jsonb, conciliations int)
language sql stable security invoker set search_path = public as $$
  select l.id, l.lot_number, l.address,
         coalesce(nullif(btrim(concat_ws(' & ', nullif(btrim(concat_ws(' ', l.homeowner_first, l.homeowner_last)), ''), nullif(btrim(concat_ws(' ', l.owner2_first, l.owner2_last)), ''))), ''), l.homeowner_name),
         l.enrollment_number, l.model,
         coalesce(l.warranty_start_date, l.possession_date, l.closing_date),
         (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'case_number', c.case_number, 'type', c.period_type, 'status', c.status, 'opened', c.opened_at,
                   'closed', c.closed_at, 'brp_end', c.brp_end_date, 'items', coalesce(x.tot, 0), 'open', coalesce(x.op, 0)) order by c.opened_at), '[]'::jsonb)
            from cases c
            left join lateral (select count(*) tot, count(*) filter (where wi.status = 'outstanding') op from warranty_items wi where wi.case_id = c.id) x on true
           where c.lot_id = l.id),
         (select count(*) from cm_cases m where m.lot_id = l.id)::int
  from warranty_lots l where l.community_id = p_community order by l.address, l.lot_number;
$$;
grant execute on function public.community_counts() to authenticated;
grant execute on function public.community_overview(uuid) to authenticated;
