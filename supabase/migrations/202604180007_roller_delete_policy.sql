do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'roller_daily_checks'
      and policyname = 'roller_daily_checks_delete_own_or_admin'
  ) then
    create policy roller_daily_checks_delete_own_or_admin
    on public.roller_daily_checks
    for delete
    to authenticated
    using (created_by = auth.uid() or public.app_is_admin());
  end if;
end
$$;
