update public.contracts
set status = lower(status)
where status is not null;

alter table public.contracts
alter column status set default 'active';
