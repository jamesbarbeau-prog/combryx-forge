-- Urgent and 2-year screens: shoe/crown/door "mould" is trim, and "letting in water" / "water through ..." is active water.
-- Both screens strip trim mouldings before matching and learn the extra water phrases.
do $$
declare
  d text; f regprocedure;
  strip text := $s$regexp_replace(coalesce(d,''), '(shoe|crown|base|door|stop|window|casing|trim)\s+mou?ld(ing)?', ' ', 'gi')$s$;
begin
  foreach f in array array['public.urgent_wording(text)'::regprocedure, 'public.two_year_wording(text)'::regprocedure] loop
    d := pg_get_functiondef(f);
    if position('shoe|crown' in d) = 0 then
      d := replace(d, 'coalesce(d,'''')', strip);
      d := replace(d, 'intrusion|coming|getting)|moisture', 'intrusion|coming|getting|in|into|through|thru|threw|dripping|pooling)|(let(ting|s)?|allow(ing|s)?) (in )?water|moisture');
      d := replace(d, 'pooling|marks?)|moisture', 'pooling|marks?|in|into|through|thru|threw|dripping)|(let(ting|s)?|allow(ing|s)?) (in )?water|moisture');
      execute d;
    end if;
  end loop;
end $$;
