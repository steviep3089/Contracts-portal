insert into public.people_directory (
  person_key,
  portal_user_id,
  full_name,
  email,
  phone,
  job_role,
  authority,
  regions,
  source_projects,
  source_user_refs
)
select
  case
    when nullif(lower(trim(up.email)), '') is not null then 'email:' || lower(trim(up.email))
    when nullif(trim(up.phone), '') is not null then 'phone:' || trim(up.phone)
    else 'portal:' || up.user_id::text
  end as person_key,
  up.user_id,
  up.full_name,
  up.email,
  up.phone,
  up.job_role,
  coalesce(up.authority, case when lower(coalesce(aur.role, '')) = 'admin' then 'admin' else 'user' end) as authority,
  coalesce(up.regions, up.divisions, '{}'::text[]) as regions,
  array['portal']::text[] as source_projects,
  jsonb_build_array(jsonb_build_object('source_project', 'portal', 'source_user_id', up.user_id::text)) as source_user_refs
from public.user_profiles up
left join public.app_user_roles aur on aur.user_id = up.user_id
on conflict (person_key)
do update set
  portal_user_id = coalesce(public.people_directory.portal_user_id, excluded.portal_user_id),
  full_name = coalesce(public.people_directory.full_name, excluded.full_name),
  email = coalesce(public.people_directory.email, excluded.email),
  phone = coalesce(public.people_directory.phone, excluded.phone),
  job_role = coalesce(public.people_directory.job_role, excluded.job_role),
  authority = case
    when public.people_directory.authority = 'admin' or excluded.authority = 'admin' then 'admin'
    else 'user'
  end,
  regions = (
    select array(
      select distinct x from unnest(coalesce(public.people_directory.regions, '{}'::text[]) || coalesce(excluded.regions, '{}'::text[])) x
      where nullif(trim(x), '') is not null
    )
  ),
  source_projects = (
    select array(
      select distinct x from unnest(coalesce(public.people_directory.source_projects, '{}'::text[]) || coalesce(excluded.source_projects, '{}'::text[])) x
      where nullif(trim(x), '') is not null
    )
  );
