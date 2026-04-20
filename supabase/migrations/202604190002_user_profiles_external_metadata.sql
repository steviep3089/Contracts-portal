alter table public.user_profiles
add column if not exists source_project text,
add column if not exists source_role text,
add column if not exists divisions text[] not null default '{}'::text[];