-- Contracts Core Schema
-- Safe to run via Supabase migrations.

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.app_user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'manager', 'inspector', 'viewer')),
  created_at timestamptz not null default now()
);

create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  contract_number text not null unique,
  contract_name text not null,
  location text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'closed')),
  start_date date,
  end_date date,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_team_roles (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_name text not null,
  created_at timestamptz not null default now(),
  unique (contract_id, user_id, role_name)
);

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null unique,
  asset_name text not null,
  asset_type text,
  serial_number text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_assets (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete restrict,
  assigned_from date not null default current_date,
  assigned_to date,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  unique (contract_id, asset_id, assigned_from)
);

create table if not exists public.form_templates (
  id uuid primary key default gen_random_uuid(),
  template_code text not null unique,
  title text not null,
  description text,
  frequency text not null check (frequency in ('daily', 'weekly', 'monthly', 'one_off')),
  checklist jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.contract_required_forms (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  form_template_id uuid not null references public.form_templates(id) on delete restrict,
  frequency_override text check (frequency_override in ('daily', 'weekly', 'monthly', 'one_off')),
  schedule_anchor_date date,
  next_due_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contract_id, form_template_id)
);

create table if not exists public.inspection_tasks (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.contracts(id) on delete cascade,
  form_template_id uuid not null references public.form_templates(id) on delete restrict,
  contract_required_form_id uuid references public.contract_required_forms(id) on delete set null,
  asset_id uuid references public.assets(id) on delete set null,
  title text not null,
  due_at timestamptz not null,
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'completed', 'cancelled', 'overdue')),
  assigned_to uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.inspection_results (
  id uuid primary key default gen_random_uuid(),
  inspection_task_id uuid not null unique references public.inspection_tasks(id) on delete cascade,
  contract_id uuid not null references public.contracts(id) on delete cascade,
  form_template_id uuid not null references public.form_templates(id) on delete restrict,
  completed_by uuid not null references auth.users(id) on delete restrict,
  completed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb,
  defect_found boolean not null default false,
  defect_severity text,
  defect_summary text,
  defect_payload jsonb,
  synced_to_defects boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_events (
  id bigserial primary key,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'sent', 'failed')),
  retry_count int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);

create table if not exists public.webhook_endpoints (
  id uuid primary key default gen_random_uuid(),
  endpoint_name text not null unique,
  endpoint_url text not null,
  secret text not null,
  event_types text[] not null default '{}'::text[],
  is_active boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_contract_team_roles_contract_id on public.contract_team_roles(contract_id);
create index if not exists idx_contract_team_roles_user_id on public.contract_team_roles(user_id);
create index if not exists idx_contract_assets_contract_id on public.contract_assets(contract_id);
create index if not exists idx_contract_assets_asset_id on public.contract_assets(asset_id);
create index if not exists idx_contract_required_forms_contract_id on public.contract_required_forms(contract_id);
create index if not exists idx_inspection_tasks_contract_id on public.inspection_tasks(contract_id);
create index if not exists idx_inspection_tasks_due_at on public.inspection_tasks(due_at);
create index if not exists idx_inspection_results_contract_id on public.inspection_results(contract_id);
create index if not exists idx_integration_events_status on public.integration_events(status);
create index if not exists idx_integration_events_created_at on public.integration_events(created_at);

create trigger set_updated_at_contracts
before update on public.contracts
for each row
execute function public.set_updated_at();

create trigger set_updated_at_assets
before update on public.assets
for each row
execute function public.set_updated_at();

create trigger set_updated_at_form_templates
before update on public.form_templates
for each row
execute function public.set_updated_at();

create trigger set_updated_at_contract_required_forms
before update on public.contract_required_forms
for each row
execute function public.set_updated_at();

create trigger set_updated_at_inspection_tasks
before update on public.inspection_tasks
for each row
execute function public.set_updated_at();

create trigger set_updated_at_webhook_endpoints
before update on public.webhook_endpoints
for each row
execute function public.set_updated_at();

create or replace function public.app_is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_user_roles ur
    where ur.user_id = auth.uid()
      and ur.role in ('admin', 'manager')
  );
$$;

create or replace function public.can_access_contract(target_contract_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.app_is_admin()
    or exists (
      select 1
      from public.contract_team_roles ctr
      where ctr.contract_id = target_contract_id
        and ctr.user_id = auth.uid()
    );
$$;

grant execute on function public.app_is_admin() to authenticated;
grant execute on function public.can_access_contract(uuid) to authenticated;

alter table public.app_user_roles enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_team_roles enable row level security;
alter table public.assets enable row level security;
alter table public.contract_assets enable row level security;
alter table public.form_templates enable row level security;
alter table public.contract_required_forms enable row level security;
alter table public.inspection_tasks enable row level security;
alter table public.inspection_results enable row level security;
alter table public.integration_events enable row level security;
alter table public.webhook_endpoints enable row level security;

create policy app_user_roles_select_own_or_admin
on public.app_user_roles
for select
to authenticated
using (user_id = auth.uid() or public.app_is_admin());

create policy app_user_roles_admin_write
on public.app_user_roles
for all
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

create policy contracts_select_access
on public.contracts
for select
to authenticated
using (public.can_access_contract(id));

create policy contracts_admin_write
on public.contracts
for all
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

create policy contract_team_roles_select_access
on public.contract_team_roles
for select
to authenticated
using (public.can_access_contract(contract_id));

create policy contract_team_roles_admin_write
on public.contract_team_roles
for all
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

create policy assets_select_authenticated
on public.assets
for select
to authenticated
using (true);

create policy assets_admin_write
on public.assets
for all
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

create policy contract_assets_select_access
on public.contract_assets
for select
to authenticated
using (public.can_access_contract(contract_id));

create policy contract_assets_admin_write
on public.contract_assets
for all
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

create policy form_templates_select_authenticated
on public.form_templates
for select
to authenticated
using (true);

create policy form_templates_admin_write
on public.form_templates
for all
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

create policy contract_required_forms_select_access
on public.contract_required_forms
for select
to authenticated
using (public.can_access_contract(contract_id));

create policy contract_required_forms_admin_write
on public.contract_required_forms
for all
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

create policy inspection_tasks_select_access
on public.inspection_tasks
for select
to authenticated
using (public.can_access_contract(contract_id));

create policy inspection_tasks_admin_write
on public.inspection_tasks
for all
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

create policy inspection_results_select_access
on public.inspection_results
for select
to authenticated
using (public.can_access_contract(contract_id));

create policy inspection_results_insert_access
on public.inspection_results
for insert
to authenticated
with check (public.can_access_contract(contract_id));

create policy inspection_results_update_admin
on public.inspection_results
for update
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

create policy integration_events_admin_only
on public.integration_events
for all
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

create policy webhook_endpoints_admin_only
on public.webhook_endpoints
for all
to authenticated
using (public.app_is_admin())
with check (public.app_is_admin());

insert into public.form_templates (template_code, title, description, frequency, checklist)
values
  ('PLANT_DAILY', 'Daily Plant Check', 'Daily equipment safety and condition check.', 'daily', '["Visual inspection", "Fluids check", "Safety interlocks"]'::jsonb),
  ('SAFETY_WEEKLY', 'Weekly Safety Walk', 'Weekly contract safety walk and action capture.', 'weekly', '["PPE compliance", "Signage", "Housekeeping"]'::jsonb),
  ('COMPLIANCE_MONTHLY', 'Monthly Compliance Audit', 'Monthly compliance validation.', 'monthly', '["Documentation", "Training records", "Permit checks"]'::jsonb)
on conflict (template_code) do nothing;
