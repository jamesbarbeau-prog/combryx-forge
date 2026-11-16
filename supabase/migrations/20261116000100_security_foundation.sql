-- Applied live as close_trades_hole_and_company_policies and guard_company_param_functions (2026-11-16).
-- trades: replace open policies with company isolation; tech_profiles isolation; trade_matrix read-only for signed-in users.
drop policy if exists trades_select on trades;
drop policy if exists trades_insert on trades;
drop policy if exists trades_update on trades;
drop policy if exists trades_delete on trades;
create policy trades_isolation on trades for all to authenticated
  using (company_id = auth_company_id()) with check (company_id = auth_company_id());
create policy tech_profiles_isolation on tech_profiles for all to authenticated
  using (company_id = auth_company_id()) with check (company_id = auth_company_id());
create policy trade_matrix_read on trade_matrix for select to authenticated using (true);
alter function public.auth_company_id() set search_path = public;
revoke execute on function public.cm_has_role(uuid, text[]) from anon, public;
grant execute on function public.cm_has_role(uuid, text[]) to authenticated, service_role;
-- Guarded in place (company must be the caller's own; acting user must be the caller): approve_po, reject_po, submit_po,
-- open_conciliation, get_financial_summary, get_erp_export. Removed from the public API: get_case_for_addin, log_email_to_case,
-- log_email_attachment, check_email_duplicate, calculate_priority_score, rollover_period, route_po_approval,
-- record_claim_outcome, record_conciliation_report, set_user_claims, rls_auto_enable. Count helpers now SECURITY INVOKER.
alter function public.get_community_lot_counts(uuid[]) security invoker;
alter function public.get_community_case_counts(uuid[]) security invoker;
