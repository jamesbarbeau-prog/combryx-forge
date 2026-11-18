-- Same trim-mould and water-wording changes for the Tarion-window review rules.
create or replace function public.strip_trim_mould(d text) returns text language sql immutable set search_path = public as $$
  select regexp_replace(coalesce(d,''), '(shoe|crown|base|door|stop|window|casing|trim)\s+mou?ld(ing)?', ' ', 'gi')
$$;

do $$
declare d text; f regprocedure := 'public.aging_apply_rules(integer,text)'::regprocedure;
begin
  d := pg_get_functiondef(f);
  if position('strip_trim_mould' in d) = 0 then
    d := replace(d, 't.d ~* rx', 'public.strip_trim_mould(t.d) ~* rx');
    d := replace(d, 'regexp_match(t.d, rx', 'regexp_match(public.strip_trim_mould(t.d), rx');
    d := replace(d, 'pooling|marks?)|moisture', 'pooling|marks?|into|through|thru|threw|dripping)|(let(ting|s)?|allow(ing|s)?) (in )?water|moisture');
    execute d;
  end if;
end $$;

-- Rule-made reviews were worked out with the old wording; force a re-read on the next review run (AI and manual reviews are untouched).
update public.aging_item_review set desc_hash = '' where source = 'rule';
