-- Page speed: cases had no index on lot_id, so search, community counts, overview and aging each scanned every case once per home.
create index if not exists idx_cases_lot on public.cases (lot_id);
create index if not exists idx_cm_cases_lot on public.cm_cases (lot_id);
create index if not exists idx_items_outstanding on public.warranty_items (case_id) where status = 'outstanding' and deleted_at is null;
analyze public.cases; analyze public.warranty_items; analyze public.warranty_lots;
