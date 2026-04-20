-- User access integration for contracts portal.
-- Adds user profile contact fields and import helper from maintenance-admin role table.

create table if not exists public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at_user_profiles
before update on public.user_profiles
for each row
execute function public.set_updated_at();

alter table public.user_profiles enable row level security;

create policy user_profiles_select_own_or_admin
on public.user_profiles
for select
to authenticated
using (user_id = auth.uid() or public.app_is_admin());

create policy user_profiles_insert_own_or_admin
on public.user_profiles
for insert
to authenticated
with check (user_id = auth.uid() or public.app_is_admin());

create policy user_profiles_update_own_or_admin
on public.user_profiles
for update
to authenticated
using (user_id = auth.uid() or public.app_is_admin())
with check (user_id = auth.uid() or public.app_is_admin());

create or replace function public.import_maintenance_users_to_app_roles()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  imported_count integer := 0;
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'user_roles'
  ) then
    return 0;
  end if;

  with source_roles as (
    select distinct
      ur.user_id,
      case
        when lower(coalesce(ur.role, '')) = 'admin' then 'admin'
        when lower(coalesce(ur.role, '')) = 'manager' then 'manager'
        when lower(coalesce(ur.role, '')) = 'inspector' then 'inspector'
        else 'viewer'
      end as role
    from public.user_roles ur
    where ur.user_id is not null
  ),
  upserted as (
    insert into public.app_user_roles (user_id, role)
    select user_id, role
    from source_roles
    on conflict (user_id)
    do update set role = excluded.role
    returning 1
  )
  select count(*) into imported_count from upserted;

  return imported_count;
end;
$$;

grant execute on function public.import_maintenance_users_to_app_roles() to authenticated;