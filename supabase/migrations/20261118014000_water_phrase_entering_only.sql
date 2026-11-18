-- "allows water to exit" (drainage) was read as water getting in. Only entering or flowing water counts.
do $$
declare d text; f regprocedure;
begin
  foreach f in array array['public.urgent_wording(text)'::regprocedure, 'public.two_year_wording(text)'::regprocedure, 'public.aging_apply_rules(integer,text)'::regprocedure] loop
    d := pg_get_functiondef(f);
    if position('(let(ting|s)?|allow(ing|s)?) (in )?water' in d) > 0 then
      execute replace(d, '(let(ting|s)?|allow(ing|s)?) (in )?water', 'let(ting|s)? (in )?water|allow(ing|s)? water (in|into|to (enter|get|flow|leak|seep|come|pass|run))');
    end if;
  end loop;
end $$;
