create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete restrict,
  name text not null,
  contract_number text not null,
  client text not null,
  address text not null,
  postcode_w3w text,
  description_of_works text,
  division text,
  status text not null default 'Active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contracts_created_by
  on public.contracts(created_by);

create index if not exists idx_contracts_contract_number
  on public.contracts(contract_number);

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'set_updated_at_contracts'
  ) then
    create trigger set_updated_at_contracts
    before update on public.contracts
    for each row
    execute function public.set_updated_at();
  end if;
end
$$;

alter table public.contracts enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contracts'
      and policyname = 'contracts_select_own_or_admin'
  ) then
    create policy contracts_select_own_or_admin
    on public.contracts
    for select
    to authenticated
    using (created_by = auth.uid() or public.app_is_admin());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contracts'
      and policyname = 'contracts_insert_own_or_admin'
  ) then
    create policy contracts_insert_own_or_admin
    on public.contracts
    for insert
    to authenticated
    with check (created_by = auth.uid() or public.app_is_admin());
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'contracts'
      and policyname = 'contracts_update_own_or_admin'
  ) then
    create policy contracts_update_own_or_admin
    on public.contracts
    for update
    to authenticated
    using (created_by = auth.uid() or public.app_is_admin())
    with check (created_by = auth.uid() or public.app_is_admin());
  end if;
end
$$;
