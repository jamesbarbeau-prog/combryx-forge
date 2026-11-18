-- "water in" matched "water installed". Drop the bare "in" from the extra water phrases; "letting in water" still covers that wording.
do $$
declare d text; f regprocedure;
begin
  foreach f in array array['public.urgent_wording(text)'::regprocedure, 'public.two_year_wording(text)'::regprocedure] loop
    d := pg_get_functiondef(f);
    if position('|in|into|' in d) > 0 then
      execute replace(d, '|in|into|', '|into|');
    end if;
  end loop;
end $$;
