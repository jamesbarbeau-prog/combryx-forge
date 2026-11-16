alter table public.work_orders add column if not exists updated_at timestamptz not null default now();
