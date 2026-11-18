-- Aging review: a free, instant, rule-based screen for the same single question the AI answered:
-- could this item be a Tarion 2-year item (water penetration, electrical/plumbing/heating distribution, Building Code health and safety)?
-- It looks for wording that points to one of those three. A match keeps the item open; no match makes it "review and close"
-- (a person still decides, nothing is closed). It is deliberately cautious: when the wording hints at water, plumbing,
-- electrical, heating or safety it keeps the item open. Items with no usable description stay "unread".
-- Reads already made by the AI are left alone (their description hash still matches).
create or replace function public.aging_apply_rules(p_keep_days int default 730, p_file text default null)
returns int language plpgsql security definer set search_path = public, extensions as $$
declare
  co uuid := public.auth_company_id();
  rx constant text := '(leak|water (damage|stain|entry|infiltrat|penetrat|intrusion|coming|getting|pooling|marks?)|moisture|damp|mou?ld|flood|seep|efflorescence|condensation|wet (wall|floor|carpet|drywall|ceiling|insulation|basement)|ice dam|sump|foundation (crack|leak)|roof.{0,30}(leak|water)|window.{0,30}(leak|water)|flashing|hot water|water heater|water pressure|plumb|pipe|drain(?!age)|faucet|supply line|toilet.{0,20}(leak|running|flush)|breaker|gfci|wiring|wires|no power|electrical|outlet.{0,30}(not work|dead|no power|spark|hot)|furnace|no heat|not heating|cold air|airflow|hotter|colder|duct ?work|hvac|thermostat|hrv|heat recovery|ventilat|exhaust fan|carbon monoxide|smoke alarm|co detector|gas (line|leak|smell)|guard ?rail|handrail|railing|egress)';
  n int;
begin
  if co is null then raise exception 'not signed in'; end if;
  with b as (
    select wi.id item_id,
      (current_date - l.closing_date)::int age,
      public.file_key_of(c.period_type, c.case_type::text) form,
      coalesce(nullif(trim(wi.description),''), nullif(trim(wi.owner_description),''), '') d
    from warranty_items wi join cases c on c.id = wi.case_id and c.deleted_at is null join warranty_lots l on l.id = c.lot_id
    where wi.company_id = co and wi.deleted_at is null and wi.status = 'outstanding' and l.closing_date <= current_date
      and (p_file is null or public.file_key_of(c.period_type, c.case_type::text) = p_file)
  ), t as (
    select b.item_id, b.d, md5(lower(regexp_replace(b.d, '\s+', ' ', 'g'))) dh
    from b left join aging_item_review r on r.item_id = b.item_id
    where b.age > 365 and b.age <= greatest(p_keep_days, 365) and b.form <> 'msd'
      and (r.item_id is null or r.desc_hash <> md5(lower(regexp_replace(b.d, '\s+', ' ', 'g'))))
  ), ins as (
    insert into aging_item_review (item_id, company_id, desc_hash, two_year_type, msd_risk, confidence, reason, source, model, reviewed_at)
    select t.item_id, co, t.dh,
      (length(t.d) >= 4 and t.d ~* rx),
      'none',
      case when length(t.d) < 4 then 'low' else 'medium' end,
      case when length(t.d) < 4 then 'There is no description to read.'
           when t.d ~* rx then 'Wording points to a 2-year type: "' || lower((regexp_match(t.d, rx, 'i'))[1]) || '".'
           else 'No water, plumbing, electrical, heating or safety wording.' end,
      'rule', 'keywords-v1', now()
    from t
    on conflict (item_id) do update set company_id = excluded.company_id, desc_hash = excluded.desc_hash, two_year_type = excluded.two_year_type,
      msd_risk = excluded.msd_risk, confidence = excluded.confidence, reason = excluded.reason, source = excluded.source, model = excluded.model, reviewed_at = excluded.reviewed_at
    returning 1
  ) select count(*) into n from ins;
  return n;
end $$;
revoke all on function public.aging_apply_rules(int, text) from public, anon;
grant execute on function public.aging_apply_rules(int, text) to authenticated;
