create table if not exists public.near_miss_reports (
  id uuid primary key default gen_random_uuid(),
  reported_at timestamptz not null,
  reporter_name text not null,
  site text not null,
  near_miss_details text not null,
  actions_taken text not null,
  source text,
  reported_by_user_id uuid,
  reported_by_email text,
  created_at timestamptz not null default now()
);

create index if not exists idx_near_miss_reports_reported_at
  on public.near_miss_reports (reported_at desc);

alter table public.near_miss_reports enable row level security;

-- Near miss reports are written by the edge function using service role.
-- Direct reads can be opened later with explicit policies if needed.
