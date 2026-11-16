-- The warranty pages read these four tables but RLS was on with no policy, so signed-in users saw nothing.
-- Same rule as cases / warranty_items: a signed-in user sees and edits only their own company's rows.
create policy warranty_lots_isolation on warranty_lots for all to authenticated
  using (company_id = auth_company_id()) with check (company_id = auth_company_id());
create policy warranty_communities_isolation on warranty_communities for all to authenticated
  using (company_id = auth_company_id()) with check (company_id = auth_company_id());
create policy company_settings_isolation on company_settings for all to authenticated
  using (company_id = auth_company_id()) with check (company_id = auth_company_id());
create policy user_communities_isolation on user_communities for all to authenticated
  using (exists (select 1 from users u where u.id = user_communities.user_id and u.company_id = auth_company_id()))
  with check (exists (select 1 from users u where u.id = user_communities.user_id and u.company_id = auth_company_id()));
