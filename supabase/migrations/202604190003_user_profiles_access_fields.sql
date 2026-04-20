alter table public.user_profiles
add column if not exists email text,
add column if not exists job_role text,
add column if not exists regions text[] not null default '{}'::text[],
add column if not exists authority text not null default 'user'
  check (authority in ('admin', 'user'));