alter table public.roller_daily_checks
add column if not exists contract_id text,
add column if not exists contract_name text,
add column if not exists contract_number text;
