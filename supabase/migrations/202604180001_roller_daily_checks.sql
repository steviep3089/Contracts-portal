-- Roller Daily Checksheet table

create table if not exists public.roller_daily_checks (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  completed_by_name text not null,
  job_title text,
  check_date date not null,
  machine_reg text not null,
  asset_no text,
  serial_no text,
  machine_hours numeric(10,2),
  machine_type text,
  location text,
  checklist jsonb not null default '{}'::jsonb,
  notes text,
  has_defects boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_roller_daily_checks_created_by
  on public.roller_daily_checks(created_by);

create index if not exists idx_roller_daily_checks_check_date
  on public.roller_daily_checks(check_date);

create trigger set_updated_at_roller_daily_checks
before update on public.roller_daily_checks
for each row
execute function public.set_updated_at();

alter table public.roller_daily_checks enable row level security;

create policy roller_daily_checks_select_own_or_admin
on public.roller_daily_checks
for select
to authenticated
using (created_by = auth.uid() or public.app_is_admin());

create policy roller_daily_checks_insert_own_or_admin
on public.roller_daily_checks
for insert
to authenticated
with check (created_by = auth.uid() or public.app_is_admin());

create policy roller_daily_checks_update_own_or_admin
on public.roller_daily_checks
for update
to authenticated
using (created_by = auth.uid() or public.app_is_admin())
with check (created_by = auth.uid() or public.app_is_admin());
