-- "moulding" (trim) was being read as "mould". Applies to the urgent screen, the 2-year screen and the aging review rules.
do $$
declare d text; f regprocedure;
begin
  foreach f in array array['public.urgent_wording(text)'::regprocedure, 'public.two_year_wording(text)'::regprocedure, 'public.aging_apply_rules(integer,text)'::regprocedure] loop
    d := pg_get_functiondef(f);
    if position('mou?ld' in d) > 0 then
      execute replace(d, 'mou?ld', 'mou?ld(?!ing)');
    end if;
  end loop;
end $$;
