alter table public.contracts
add column if not exists created_by uuid references auth.users(id) on delete restrict,
add column if not exists name text,
add column if not exists contract_number text,
add column if not exists client text,
add column if not exists address text,
add column if not exists postcode_w3w text,
add column if not exists description_of_works text,
add column if not exists division text,
add column if not exists status text default 'Active',
add column if not exists created_at timestamptz default now(),
add column if not exists updated_at timestamptz default now();

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
