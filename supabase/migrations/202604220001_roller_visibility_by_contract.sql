-- Allow contract team members to read roller forms for contracts they can access.
-- This keeps creator visibility and admin visibility while enabling contract-level visibility.

create or replace function public.can_access_roller_daily_check(
  target_contract_id text,
  target_contract_number text,
  target_contract_name text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  parsed_contract_id uuid;
begin
  if public.app_is_admin() then
    return true;
  end if;

  if coalesce(btrim(target_contract_id), '') <> '' then
    begin
      parsed_contract_id := target_contract_id::uuid;
    exception
      when invalid_text_representation then
        parsed_contract_id := null;
    end;

    if parsed_contract_id is not null and public.can_access_contract(parsed_contract_id) then
      return true;
    end if;
  end if;

  if coalesce(btrim(target_contract_number), '') <> '' and exists (
    select 1
    from public.contracts c
    where c.contract_number = target_contract_number
      and public.can_access_contract(c.id)
  ) then
    return true;
  end if;

  if coalesce(btrim(target_contract_name), '') <> '' and exists (
    select 1
    from public.contracts c
    where (c.name = target_contract_name or c.contract_name = target_contract_name)
      and public.can_access_contract(c.id)
  ) then
    return true;
  end if;

  return false;
end;
$$;

grant execute on function public.can_access_roller_daily_check(text, text, text) to authenticated;

drop policy if exists roller_daily_checks_select_own_or_admin on public.roller_daily_checks;

create policy roller_daily_checks_select_access
on public.roller_daily_checks
for select
to authenticated
using (
  created_by = auth.uid()
  or public.can_access_roller_daily_check(contract_id, contract_number, contract_name)
);
