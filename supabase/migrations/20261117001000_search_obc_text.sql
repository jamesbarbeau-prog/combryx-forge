-- Full-text search over the stored Ontario Building Code pages. No embeddings, so it cannot drift from the model that built the vectors.
-- Part 9 (houses and small buildings) pages are ranked ahead of the large-building parts, since Tarion covers houses.
create or replace function public.search_obc_text(p_query text, p_limit int default 6)
returns table(id uuid, page_number int, content text, rank real)
language sql stable security invoker set search_path = public as $$
  select o.id, o.page_number, o.content,
         (ts_rank_cd(o.fts_weighted, websearch_to_tsquery('english', p_query)) * case when o.content ilike '%Part 9%' then 2.0 else 1.0 end)::real
  from obc_knowledge o
  where o.fts_weighted @@ websearch_to_tsquery('english', p_query)
  order by 4 desc
  limit greatest(1, least(p_limit, 10))
$$;
revoke all on function public.search_obc_text(text,int) from public, anon, authenticated;
grant execute on function public.search_obc_text(text,int) to service_role;
