-- Work-order aging (the industry-standard clock): one row per QDEF work order, loaded from the QDEF "Outstanding Aging - Details" report.
-- Age = days since the work order was created, taken from the report (report date minus the age QDEF shows).
-- A work order that is missing from a later report has left the aging report (completed or closed in QDEF); gone_on records when,
-- so days-to-close per trade can be measured from successive imports. The Tarion clock (days since closing) is computed alongside, never replaced.
create table if not exists public.qdef_work_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  community text not null,
  lot_number text not null,
  wo_number bigint not null,
  category text,
  trade text,
  closing_date date,
  scheduled_date date,
  owner text,
  address text,
  description text,
  created_est date not null,
  first_seen date not null,
  last_seen date not null,
  age_at_seen int,
  gone_on date,
  unique (company_id, wo_number)
);
alter table public.qdef_work_orders enable row level security;
create policy qwo_read on public.qdef_work_orders for select to authenticated using (company_id = public.auth_company_id());
create index if not exists idx_qwo_open on public.qdef_work_orders (company_id, community) where gone_on is null;
create index if not exists idx_qwo_trade on public.qdef_work_orders (company_id, trade);

-- The Tarion 2-year wording screen, shared so every report uses the same words.
create or replace function public.two_year_wording(d text) returns text language sql immutable set search_path = public as $$
  select lower((regexp_match(coalesce(d,''), '(leak|water (damage|stain|entry|infiltrat|penetrat|intrusion|coming|getting|pooling|marks?)|moisture|damp|mou?ld|flood|seep|efflorescence|condensation|wet (wall|floor|carpet|drywall|ceiling|insulation|basement)|ice dam|sump|foundation (crack|leak)|roof.{0,30}(leak|water)|window.{0,30}(leak|water)|flashing|hot water|water heater|water pressure|plumb|pipe|drain(?!age)|faucet|supply line|toilet.{0,20}(leak|running|flush)|breaker|gfci|wiring|wires|no power|electrical|outlet.{0,30}(not work|dead|no power|spark|hot)|furnace|no heat|not heating|cold air|airflow|hotter|colder|duct ?work|hvac|thermostat|hrv|heat recovery|ventilat|exhaust fan|carbon monoxide|smoke alarm|co detector|gas (line|leak|smell)|guard ?rail|handrail|railing|egress)', 'i'))[1])
$$;
-- Wording that should never wait: active water, no heat or hot water, gas, smoke or CO, sparking, no power.
create or replace function public.urgent_wording(d text) returns text language sql immutable set search_path = public as $$
  select lower((regexp_match(coalesce(d,''), '(leak|water (damage|stain|entry|infiltrat|penetrat|intrusion|coming|getting)|moisture|mou?ld|flood|seep|no heat|not heating|no hot water|carbon monoxide|co detector|smoke alarm|gas (leak|smell|line)|spark|no power|exposed wir|egress)', 'i'))[1])
$$;

create or replace function public.qdef_wo_import(p_community text, p_report_date date, p_rows jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare co uuid := public.auth_company_id(); added int := 0; updated int := 0; gone int := 0; comm text := left(trim(coalesce(p_community,'')), 80);
begin
  if co is null then raise exception 'not signed in'; end if;
  if comm = '' then raise exception 'community required'; end if;
  if p_report_date is null or p_report_date > current_date then raise exception 'bad report date'; end if;
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 20000 then raise exception 'bad rows'; end if;
  with src as (
    select distinct on ((r->>'wo')::bigint)
      (r->>'wo')::bigint wo, left(coalesce(r->>'lot',''), 40) lot, left(nullif(r->>'category',''), 40) category, left(nullif(r->>'trade',''), 80) trade,
      nullif(r->>'closing','')::date closing, nullif(r->>'scheduled','')::date scheduled, left(nullif(r->>'owner',''), 120) owner, left(nullif(r->>'address',''), 160) address,
      left(coalesce(r->>'description',''), 600) description, greatest(coalesce((r->>'age')::int, 0), 0) age
    from jsonb_array_elements(p_rows) r where r->>'wo' ~ '^\d{1,12}$'
  ), up as (
    insert into public.qdef_work_orders (company_id, community, lot_number, wo_number, category, trade, closing_date, scheduled_date, owner, address, description, created_est, first_seen, last_seen, age_at_seen)
    select co, comm, lot, wo, category, trade, closing, scheduled, owner, address, description, p_report_date - age, p_report_date, p_report_date, age from src
    on conflict (company_id, wo_number) do update set
      community = excluded.community, lot_number = excluded.lot_number, category = excluded.category, trade = excluded.trade,
      closing_date = excluded.closing_date, scheduled_date = excluded.scheduled_date,
      owner = coalesce(excluded.owner, qdef_work_orders.owner), address = coalesce(excluded.address, qdef_work_orders.address), description = excluded.description,
      age_at_seen = case when excluded.last_seen >= qdef_work_orders.last_seen then excluded.age_at_seen else qdef_work_orders.age_at_seen end,
      gone_on = case when excluded.last_seen >= qdef_work_orders.last_seen then null else qdef_work_orders.gone_on end,
      last_seen = greatest(qdef_work_orders.last_seen, excluded.last_seen)
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) filter (where not inserted) into added, updated from up;
  update public.qdef_work_orders set gone_on = p_report_date where company_id = co and community = comm and gone_on is null and last_seen < p_report_date;
  get diagnostics gone = row_count;
  return jsonb_build_object('added', added, 'updated', updated, 'left_report', gone);
end $$;
revoke all on function public.qdef_wo_import(text, date, jsonb) from public, anon;
grant execute on function public.qdef_wo_import(text, date, jsonb) to authenticated;

create or replace function public.qdef_wo_open(p_community text default null)
returns table(wo_number bigint, community text, lot_number text, owner text, address text, category text, trade text, closing_date date, scheduled_date date,
              description text, age_days int, days_since_closing int, tarion text, two_year_word text, urgent_word text, last_seen date)
language sql stable security invoker set search_path = public as $$
  select w.wo_number, w.community, w.lot_number, w.owner, w.address, w.category, coalesce(w.trade, 'Unassigned'), w.closing_date, w.scheduled_date, w.description,
    (current_date - w.created_est)::int age, d.dsc, 
    case when d.dsc is null then 'needs_review'
         when d.dsc <= 365 then 'keep_followup'
         when d.dsc <= 730 then case when public.two_year_wording(w.description) is not null then 'keep_followup' else 'review_close' end
         when d.dsc <= 1095 then 'safe_close' else 'close_now' end tarion,
    public.two_year_wording(w.description), public.urgent_wording(w.description), w.last_seen
  from public.qdef_work_orders w
  cross join lateral (select case when w.closing_date is null or w.closing_date > current_date then null else (current_date - w.closing_date)::int end dsc) d
  where w.gone_on is null and (p_community is null or w.community = p_community)
$$;

create or replace function public.qdef_wo_trade_stats(p_community text default null, p_since int default 90)
returns table(trade text, open_count int, open_avg int, open_median int, over30 int, over60 int, over90 int, over120 int, closed_count int, closed_avg int)
language sql stable security invoker set search_path = public as $$
  with o as (
    select coalesce(trade,'Unassigned') t, (current_date - created_est) a from public.qdef_work_orders where gone_on is null and (p_community is null or community = p_community)
  ), c as (
    select coalesce(trade,'Unassigned') t, (gone_on - created_est) d from public.qdef_work_orders where gone_on is not null and gone_on >= current_date - p_since and (p_community is null or community = p_community)
  ), os as (
    select t, count(*)::int n, round(avg(a))::int av, (percentile_cont(0.5) within group (order by a))::int med,
      count(*) filter (where a > 30)::int o30, count(*) filter (where a > 60)::int o60, count(*) filter (where a > 90)::int o90, count(*) filter (where a > 120)::int o120 from o group by t
  ), cs as (select t, count(*)::int n, round(avg(d))::int av from c group by t)
  select coalesce(os.t, cs.t), coalesce(os.n, 0), os.av, os.med, coalesce(os.o30, 0), coalesce(os.o60, 0), coalesce(os.o90, 0), coalesce(os.o120, 0), coalesce(cs.n, 0), cs.av
  from os full join cs on cs.t = os.t
$$;
grant execute on function public.qdef_wo_open(text), public.qdef_wo_trade_stats(text, int), public.two_year_wording(text), public.urgent_wording(text) to authenticated;
