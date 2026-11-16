-- Reports: deficiencies per trade, per technician, and recurring issues per trade.
-- Aging everywhere = days since the home's closing date, open items only (see 20261116003000_aging_from_closing.sql).

-- Trade names arrive in variants ("ColourCraft - PreClose", "Colour Craft"). One key per real trade.
create or replace function public.trade_clean(p text) returns text language sql immutable as $$
  select nullif(trim(regexp_replace(coalesce(p,''), '\s*-\s*pre\s*cl\w*\s*$', '', 'i')), '')
$$;
create or replace function public.trade_key(p text) returns text language sql immutable as $$
  select nullif(lower(regexp_replace(coalesce(public.trade_clean(p),''), '[^a-zA-Z0-9]', '', 'g')), '')
$$;

-- One keyword theme per item, first match wins. Deliberately simple and readable so it can be tuned.
create or replace function public.issue_theme(p text) returns text language sql immutable as $$
  select case
    when d ~ '(nail|screw|fastener) ?pop' then 'Nail and screw pops'
    when d ~ '(drywall|dry wall|patch|seam|tape|mud|bulge|plaster)' then 'Drywall patch and finish'
    when d ~ '(paint|touch.?up|scuff|sticker|stain|colou?r)' then 'Paint touch-up'
    when d ~ '(caulk|sealant|seal )' then 'Caulking and sealant'
    when d ~ '(stair|railing|handrail|spindle|baluster|newel)' then 'Stairs and railings'
    when d ~ '(cabinet|drawer|vanity|shelf|shelves)' then 'Cabinets and vanities'
    when d ~ '(counter|granite|quartz|marble|backsplash)' then 'Countertops'
    when d ~ '(door|latch|strike|hinge|deadbolt|handle|knob|weatherstrip)' then 'Doors and hardware'
    when d ~ '(window|screen|sash|glazing|glass)' then 'Windows and glass'
    when d ~ '(trim|baseboard|casing|moulding|molding|gap)' then 'Trim and baseboard'
    when d ~ '(floor|hardwood|laminate|vinyl|tile|grout|carpet|squeak|threshold)' then 'Flooring and tile'
    when d ~ '(faucet|toilet|drain|leak|plumb|shower|tub|hose bib|sink|water)' then 'Plumbing'
    when d ~ '(outlet|switch|light|gfci|electrical|plug|pot light|breaker|fixture|smoke)' then 'Electrical and lighting'
    when d ~ '(furnace|duct|vent|hvac|register|air return|thermostat|fan|heat)' then 'HVAC and ventilation'
    when d ~ '(brick|mortar|parging|siding|stucco|cladding|soffit|fascia|eave|roof|shingle|flashing)' then 'Exterior envelope'
    when d ~ '(grad|sod|drainage|settle|driveway|sidewalk|patio|deck|landscap|walkway|interlock|asphalt|concrete)' then 'Grading, landscaping and concrete'
    when d ~ '(garage|overhead)' then 'Garage'
    when d ~ '(clean|dirt|dust|debris)' then 'Cleaning'
    else 'Other'
  end
  from (select lower(coalesce(split_part(p, ' | ', 2), '') || ' ' || coalesce(p,'')) d) x
$$;

create or replace function public.trade_deficiency_report(p_community uuid default null)
returns table(trade text, items bigint, open_items bigint, closed_items bigint, not_warranty bigint, homes_open bigint,
              open_120p bigint, open_300p bigint, avg_open_age numeric, oldest_open int, on_work_order bigint)
language sql stable security invoker set search_path = public as $$
  with b as (
    select public.trade_key(wi.trade_required) k, public.trade_clean(wi.trade_required) nm, wi.id, wi.status, l.id lot_id,
           case when l.closing_date <= current_date then current_date - l.closing_date end age,
           exists (select 1 from work_order_items woi join work_orders w on w.id = woi.work_order_id
                   where woi.warranty_item_id = wi.id and coalesce(w.status,'') not in ('cancelled','complete','no_show')) booked
    from warranty_items wi join cases c on c.id = wi.case_id and c.deleted_at is null join warranty_lots l on l.id = c.lot_id
    where wi.deleted_at is null and wi.trade_required is not null and (p_community is null or l.community_id = p_community)
  )
  select (array_agg(nm order by length(nm)))[1],
    count(*), count(*) filter (where status='outstanding'), count(*) filter (where status='complete'),
    count(*) filter (where status in ('not_warranted','duplicate')),
    count(distinct lot_id) filter (where status='outstanding'),
    count(*) filter (where status='outstanding' and age > 120), count(*) filter (where status='outstanding' and age > 300),
    round(avg(age) filter (where status='outstanding'), 0), max(age) filter (where status='outstanding'),
    count(*) filter (where status='outstanding' and booked)
  from b where k is not null group by k order by 3 desc
$$;

create or replace function public.tech_deficiency_report(p_audience text default 'tech')
returns table(tech text, work_orders bigint, items_assigned bigint, items_done bigint, orders_complete bigint,
              no_shows bigint, owner_unhappy bigint, avg_days_to_complete numeric)
language sql stable security invoker set search_path = public as $$
  select coalesce(t.name, nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''), 'Not assigned yet'),
    count(distinct w.id),
    count(woi.id),
    count(woi.id) filter (where wi.status = 'complete' or woi.status = 'complete' or woi.completed_at is not null),
    count(distinct w.id) filter (where w.response = 'completed' or w.status = 'complete'),
    count(distinct w.id) filter (where w.status = 'no_show' or w.trade_attended = false),
    count(distinct w.id) filter (where w.owner_satisfied = false),
    round(avg(extract(epoch from (w.completed_at - w.created_at)) / 86400) filter (where w.completed_at is not null)::numeric, 1)
  from work_orders w
  left join techs t on t.id = w.tech_id
  left join users u on u.id = w.assigned_to
  left join work_order_items woi on woi.work_order_id = w.id
  left join warranty_items wi on wi.id = woi.warranty_item_id
  where (p_audience is null or w.audience = p_audience) and coalesce(w.status,'') <> 'cancelled'
  group by coalesce(t.name, nullif(trim(coalesce(u.first_name,'') || ' ' || coalesce(u.last_name,'')), ''), 'Not assigned yet') order by 2 desc
$$;

create or replace function public.recurring_issues(p_trade text default null, p_min int default 5)
returns table(trade text, theme text, items bigint, open_items bigint, homes bigint, communities bigint,
              repeat_homes bigint, avg_open_age numeric, share_of_trade numeric)
language sql stable security invoker set search_path = public as $$
  with b as (
    select public.trade_key(wi.trade_required) k, public.trade_clean(wi.trade_required) nm, public.issue_theme(wi.description) th,
           wi.status, l.id lot_id, l.community_id,
           case when l.closing_date <= current_date then current_date - l.closing_date end age
    from warranty_items wi join cases c on c.id = wi.case_id and c.deleted_at is null join warranty_lots l on l.id = c.lot_id
    where wi.deleted_at is null and wi.status in ('outstanding','complete') and wi.trade_required is not null
      and (p_trade is null or public.trade_key(wi.trade_required) = public.trade_key(p_trade))
  ), per_home as (select k, th, lot_id, count(*) n from b group by k, th, lot_id),
  rep as (select k, th, count(*) filter (where n >= 2) repeat_homes from per_home group by k, th),
  tot as (select k, count(*) n from b group by k)
  select (array_agg(b.nm order by length(b.nm)))[1], b.th, count(*), count(*) filter (where b.status='outstanding'),
    count(distinct b.lot_id), count(distinct b.community_id), max(rep.repeat_homes),
    round(avg(b.age) filter (where b.status='outstanding'), 0), round(100.0 * count(*) / max(tot.n), 1)
  from b join rep on rep.k = b.k and rep.th = b.th join tot on tot.k = b.k
  where b.k is not null group by b.k, b.th having count(*) >= p_min
  order by count(*) filter (where b.status='outstanding') desc
$$;

create or replace function public.issue_samples(p_trade text, p_theme text)
returns table(item_id uuid, lot_id uuid, address text, community text, status text, age_days int, description text)
language sql stable security invoker set search_path = public as $$
  select wi.id, l.id, l.address, wc.name, wi.status, case when l.closing_date <= current_date then (current_date - l.closing_date)::int end,
         left(coalesce(wi.description, wi.owner_description, ''), 300)
  from warranty_items wi join cases c on c.id = wi.case_id and c.deleted_at is null join warranty_lots l on l.id = c.lot_id
  left join warranty_communities wc on wc.id = l.community_id
  where wi.deleted_at is null and wi.status in ('outstanding','complete') and public.trade_key(wi.trade_required) = public.trade_key(p_trade)
    and public.issue_theme(wi.description) = p_theme
  order by (wi.status = 'outstanding') desc, l.closing_date nulls last limit 40
$$;

grant execute on function public.trade_clean(text), public.trade_key(text), public.issue_theme(text),
  public.trade_deficiency_report(uuid), public.tech_deficiency_report(text), public.recurring_issues(text,int), public.issue_samples(text,text) to authenticated;
