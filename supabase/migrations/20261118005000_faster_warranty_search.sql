-- warranty_search: same matching and ranking, but case numbers and case counts are gathered once per search
-- (grouped by home) instead of with three correlated sub-selects for every home on every keystroke.
create or replace function public.warranty_search(p_q text, p_limit integer default 12)
returns table(lot_id uuid, community text, lot_number text, address text, owner text, enrollment text, open_cases integer, closed_cases integer, conciliations integer, case_hit text)
language sql stable set search_path = public, extensions as $$
  with toks as (
    select regexp_replace(regexp_replace(t, '^([a-z]+)0+([0-9])', '\1\2'), '^0+([0-9])', '\1') as t
    from (select lower(x) as t from regexp_split_to_table(btrim(coalesce(p_q,'')), '[[:space:],%_/\\-]+') x where x <> '' and x not in ('lot','lots','block','blk','unit','#')) s
  ), cn as (
    select z.lot_id, string_agg(z.x, ' ') as s from (
      select ca.lot_id, ca.case_number as x from cases ca where ca.lot_id is not null
      union all select ca.lot_id, ca.tarion_case_number from cases ca where ca.lot_id is not null and ca.tarion_case_number is not null
      union all select m.lot_id, m.case_number from cm_cases m where m.lot_id is not null) z
    group by z.lot_id
  ), cc as (
    select ca.lot_id,
      (count(*) filter (where ca.closed_at is null and ca.status in ('open','in_progress')))::int as open_n,
      (count(*) filter (where ca.closed_at is not null or ca.status not in ('open','in_progress')))::int as closed_n
    from cases ca where ca.lot_id is not null group by ca.lot_id
  ), cm as (
    select m.lot_id, count(*)::int as n from cm_cases m where m.lot_id is not null group by m.lot_id
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
           cn.s as case_nums, coalesce(cc.open_n, 0) as open_n, coalesce(cc.closed_n, 0) as closed_n, coalesce(cm.n, 0) as conc_n
    from warranty_lots l left join warranty_communities c on c.id = l.community_id
      left join cn on cn.lot_id = l.id left join cc on cc.lot_id = l.id left join cm on cm.lot_id = l.id
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
