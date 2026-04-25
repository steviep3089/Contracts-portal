alter table public.user_profiles
  add column if not exists employee_number text,
  add column if not exists line_manager_user_id uuid references auth.users(id) on delete set null,
  add column if not exists has_direct_reports boolean not null default false;

create index if not exists idx_user_profiles_line_manager_user_id
  on public.user_profiles(line_manager_user_id);

create table if not exists public.self_cert_forms (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_name text not null,
  department text,
  employee_number text,
  first_day_absence date not null,
  working_days_lost integer not null default 0 check (working_days_lost >= 0),
  notification_made_to text,
  reason_and_symptoms text not null,
  injury_occurred boolean not null default false,
  injury_details text,
  sought_medical_advice boolean,
  consulted_doctor_again boolean,
  visited_hospital_or_clinic boolean,
  employee_signature text not null,
  employee_signed_at timestamptz not null default now(),
  status text not null default 'pending_manager_approval'
    check (status in ('pending_manager_approval', 'manager_approved', 'closed')),
  line_manager_user_id uuid references auth.users(id) on delete set null,
  line_manager_name text,
  line_manager_email text,
  manager_signature text,
  manager_signed_at timestamptz,
  submitted_to_hr_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger set_updated_at_self_cert_forms
before update on public.self_cert_forms
for each row
execute function public.set_updated_at();

create index if not exists idx_self_cert_forms_line_manager_status
  on public.self_cert_forms(line_manager_user_id, status, created_at desc);

alter table public.self_cert_forms enable row level security;

create policy self_cert_forms_select_own_or_manager
on public.self_cert_forms
for select
to authenticated
using (
  user_id = auth.uid()
  or line_manager_user_id = auth.uid()
  or public.app_is_admin()
);

create policy self_cert_forms_insert_own_or_admin
on public.self_cert_forms
for insert
to authenticated
with check (user_id = auth.uid() or public.app_is_admin());

create policy self_cert_forms_update_manager_or_admin
on public.self_cert_forms
for update
to authenticated
using (
  line_manager_user_id = auth.uid()
  or public.app_is_admin()
)
with check (
  line_manager_user_id = auth.uid()
  or public.app_is_admin()
);
