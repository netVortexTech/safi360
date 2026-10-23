-- 0034 · self-serve company signup and plan selection
--
-- /signup (a new owner creates a company after phone OTP) and /onboarding/plan (the owner
-- picks a plan) were written as direct table writes from the browser. The platform rules
-- reject every one of them, and rightly so:
--   * authenticated has no INSERT on tenants or profiles (0004);
--   * memberships_insert needs an existing OWNER/MANAGER claim and forbids self-insert (0004);
--   * plan_id, status and trial_ends_at are immutable to clients (guard_tenant_columns, 0003);
--   * tenants_select hides other tenants, so a slug/prefix availability check from the
--     client always answers "available" and the insert then dies on the unique index.
-- The rules stay. The writes move behind SECURITY DEFINER functions that enforce the same
-- invariants server-side, in the style of claim_staff_invite() (0029/0031).
--
-- Activation stays with the platform: select_plan() records the owner's choice and never
-- touches status or trial_ends_at, so an expired trial cannot unlock itself by picking a
-- plan. A payment callback or a super admin (service role) moves a tenant to ACTIVE.

-- ---------------------------------------------------------------------------
-- Availability checks for the signup form. A slug is public anyway (it is the portal
-- URL); a ticket prefix appears on every customer-facing ticket reference.
-- ---------------------------------------------------------------------------
create or replace function public.tenant_slug_available(p_slug text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select not exists (select 1 from public.tenants t where t.slug = lower(btrim(coalesce(p_slug, ''))));
$$;

create or replace function public.tenant_prefix_available(p_prefix text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select not exists (
    select 1 from public.tenants t where t.ticket_prefix = upper(btrim(coalesce(p_prefix, '')))
  );
$$;

revoke all on function public.tenant_slug_available(text) from public, anon;
revoke all on function public.tenant_prefix_available(text) from public, anon;
grant execute on function public.tenant_slug_available(text) to authenticated, service_role;
grant execute on function public.tenant_prefix_available(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- signup_tenant: company + profile + OWNER membership, atomically, on a 7-day trial.
-- Returns the new tenant id. The caller must refresh their session afterwards so the
-- access-token hook (0005) adds the tenant claims.
-- ---------------------------------------------------------------------------
create or replace function public.signup_tenant(
  p_name          text,
  p_slug          text,
  p_ticket_prefix text,
  p_city          text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid       uuid := app.current_user_id();
  v_phone     text;
  v_name      text := nullif(btrim(coalesce(p_name, '')), '');
  v_slug      text := lower(btrim(coalesce(p_slug, '')));
  v_prefix    text := upper(btrim(coalesce(p_ticket_prefix, '')));
  v_city      text := nullif(btrim(coalesce(p_city, '')), '');
  v_tenant_id uuid;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  -- One active company per account (memberships_one_active_per_user). An owner who
  -- already has a company signs in instead; an employee keeps their employer.
  if exists (select 1 from public.memberships m where m.user_id = v_uid and m.active) then
    raise exception 'already_member' using errcode = '23505',
      hint = 'this account already belongs to a company';
  end if;

  -- The company phone is the number the caller just proved by OTP (GoTrue stores it
  -- without the leading '+'); the form never supplies one.
  select nullif(u.phone, '') into v_phone from auth.users u where u.id = v_uid;
  if v_phone is not null and v_phone !~ '^\+' then
    v_phone := '+' || regexp_replace(v_phone, '[^0-9]', '', 'g');
  end if;
  if v_phone is null or v_phone !~ '^\+255[1-9]\d{8}$' then
    raise exception 'phone_required' using errcode = '23514',
      hint = 'sign in with a Tanzanian (+255) phone number first';
  end if;

  -- Format rules are the table CHECK constraints (23514); a taken slug or prefix is the
  -- unique index (23505; the constraint name says which one).
  insert into public.tenants
    (name, slug, phone_e164, city, ticket_prefix, branding, settings, plan_id, status, trial_ends_at)
  values (
    v_name, v_slug, v_phone, v_city, v_prefix,
    jsonb_build_object('display_name', v_name),
    jsonb_build_object(
      'deposit_pct', 30,
      'cancel_hours', 4,
      'slot_hold_minutes', 15,
      'travel_buffer_min', 45,
      'quote_expiry_hours', 144,
      'languages', jsonb_build_array('sw', 'en'),
      'default_locale', 'sw',
      'working_hours', jsonb_build_object(
        'mon', jsonb_build_object('open', '08:00', 'close', '18:00'),
        'tue', jsonb_build_object('open', '08:00', 'close', '18:00'),
        'wed', jsonb_build_object('open', '08:00', 'close', '18:00'),
        'thu', jsonb_build_object('open', '08:00', 'close', '18:00'),
        'fri', jsonb_build_object('open', '08:00', 'close', '18:00'),
        'sat', jsonb_build_object('open', '08:00', 'close', '16:00'),
        'sun', jsonb_build_object('open', '09:00', 'close', '13:00', 'closed', true)
      )
    ),
    null, 'TRIAL', now() + interval '7 days'
  )
  returning id into v_tenant_id;

  -- 0028 creates the profile when the auth user is created; cover accounts that predate it.
  insert into public.profiles (id, phone_e164, locale)
  values (v_uid, v_phone, 'sw')
  on conflict do nothing;

  insert into public.memberships (tenant_id, user_id, role, active)
  values (v_tenant_id, v_uid, 'OWNER', true);

  return v_tenant_id;
end;
$$;

revoke all on function public.signup_tenant(text, text, text, text) from public, anon;
grant execute on function public.signup_tenant(text, text, text, text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- guard_tenant_columns (0003) answers from JWT claims since 0013, so a SECURITY DEFINER
-- function called by an owner is still "a client" to it. select_plan() announces its one
-- controlled write through a transaction-local setting; the guard then lets plan_id
-- change and nothing else. PostgREST clients cannot set GUCs, only SQL in this repo can.
-- ---------------------------------------------------------------------------
create or replace function app.guard_tenant_columns()
returns trigger
language plpgsql
as $$
declare
  v_platform_write text := coalesce(current_setting('app.platform_tenant_write', true), '');
begin
  if app.is_service_role() then
    return new;
  end if;
  if new.id            is distinct from old.id
  or new.slug          is distinct from old.slug
  or new.ticket_prefix is distinct from old.ticket_prefix
  or (new.plan_id      is distinct from old.plan_id and v_platform_write <> 'plan_id')
  or new.status        is distinct from old.status
  or new.trial_ends_at is distinct from old.trial_ends_at
  or new.deleted_at    is distinct from old.deleted_at
  or new.created_at    is distinct from old.created_at then
    raise exception 'immutable_column' using errcode = '42501',
      hint = 'slug, ticket_prefix, plan_id, status, trial_ends_at and deleted_at are managed by the platform';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- select_plan: the OWNER records which plan they want. Never changes status or the
-- trial, so the subscription gate keeps deciding access from platform-managed columns.
-- ---------------------------------------------------------------------------
create or replace function public.select_plan(p_plan_id text)
returns void
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

  -- Decide from the membership row, not the JWT: straight after signup the token may not
  -- carry the new tenant claims yet.
  select m.tenant_id into v_tenant
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = v_uid
    and m.active
    and m.role = 'OWNER'
    and t.deleted_at is null
  limit 1;
  if v_tenant is null then
    raise exception 'owner_required' using errcode = '42501';
  end if;

  if not exists (select 1 from public.plans p where p.id = p_plan_id and p.active) then
    raise exception 'plan_not_found' using errcode = '23503';
  end if;

  perform set_config('app.platform_tenant_write', 'plan_id', true);
  update public.tenants set plan_id = p_plan_id where id = v_tenant;
  perform set_config('app.platform_tenant_write', '', true);
end;
$$;

revoke all on function public.select_plan(text) from public, anon;
grant execute on function public.select_plan(text) to authenticated, service_role;
