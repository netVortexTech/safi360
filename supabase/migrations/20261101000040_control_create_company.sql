-- 0040 · control-center company creation via SECURITY DEFINER RPC
--
-- ControlCreateCompany inserted directly into public.tenants from the browser, but
-- RLS (0004) grants authenticated only select/update on tenants — there is no insert
-- policy and no insert grant. The write is rejected with "permission denied for table
-- tenants". Move it behind a SECURITY DEFINER function, the same pattern as
-- signup_tenant() (0034), so super admins can create companies server-side.
--
-- The function enforces is_super_admin() itself; the function body runs as the owner
-- (postgres) so it can insert into tenants despite RLS.

create or replace function public.control_create_company(
  p_name          text,
  p_slug          text,
  p_phone_e164    text,
  p_city          text default null,
  p_ticket_prefix text,
  p_plan_id       text default null,
  p_trial_ends_at timestamptz default null,
  p_branding      jsonb default '{}'::jsonb,
  p_settings      jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := app.current_user_id();
  v_tenant uuid;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if not app.is_super_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  insert into public.tenants
    (name, slug, phone_e164, city, ticket_prefix, branding, settings, plan_id, status, trial_ends_at)
  values (
    nullif(btrim(coalesce(p_name, '')), ''),
    lower(btrim(coalesce(p_slug, ''))),
    p_phone_e164,
    nullif(btrim(coalesce(p_city, '')), ''),
    upper(btrim(coalesce(p_ticket_prefix, ''))),
    p_branding,
    p_settings,
    p_plan_id,
    'TRIAL',
    p_trial_ends_at
  )
  returning id into v_tenant;

  return v_tenant;
end;
$$;

revoke all on function public.control_create_company(
  text, text, text, text, text, text, timestamptz, jsonb, jsonb
) from public, anon;
grant execute on function public.control_create_company(
  text, text, text, text, text, text, timestamptz, jsonb, jsonb
) to authenticated;
