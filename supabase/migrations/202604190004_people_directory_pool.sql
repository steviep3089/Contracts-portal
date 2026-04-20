create table if not exists public.people_directory (
  person_key text primary key,
  portal_user_id uuid references auth.users(id) on delete set null,
  full_name text,
  email text,
  phone text,
  job_role text,
  authority text not null default 'user' check (authority in ('admin', 'user')),
  regions text[] not null default '{}'::text[],
  source_projects text[] not null default '{}'::text[],
  source_user_refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at_people_directory
before update on public.people_directory
for each row
execute function public.set_updated_at();

alter table public.people_directory enable row level security;

create policy people_directory_select_authenticated
on public.people_directory
for select
to authenticated
using (true);

create policy people_directory_write_admin
on public.people_directory
for all
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());
