-- 0031 · the profile phone is immutable to clients; claiming reads the verified phone
-- claim_staff_invite() (0029) and invite_staff_by_phone() (0030) treat
-- profiles.phone_e164 as the OTP-verified login phone that 0028 copies from auth.users
-- at signup. But 0004 grants authenticated self-UPDATE on profiles and the column guard
-- only protected is_super_admin/id — so any signed-in user could write somebody else's
-- number onto their own profile and claim that person's unlinked cleaner roster row in
-- another tenant (cross-tenant escalation, customer PII exposure).
--
-- Fix, both ends:
--   * phone_e164 joins the immutable columns (changes go through support / service role);
--   * claim_staff_invite() reads the phone straight from auth.users — the number the
--     caller actually proved by OTP — so a stale or tampered profile row can never claim.

create or replace function app.guard_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if app.is_service_role() then
    return new;
  end if;
  if new.is_super_admin is distinct from old.is_super_admin
  or new.id is distinct from old.id
  or new.phone_e164 is distinct from old.phone_e164 then
    raise exception 'immutable_column' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.claim_staff_invite()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid    uuid := app.current_user_id();
  v_phone  text;
  v_staff  public.staff%rowtype;
begin
  if v_uid is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;

  -- The phone the caller verified by OTP at sign-in (GoTrue stores it without '+').
  select nullif(u.phone, '') into v_phone from auth.users u where u.id = v_uid;
  if v_phone is not null and v_phone !~ '^\+' then
    v_phone := '+' || regexp_replace(v_phone, '[^0-9]', '', 'g');
  end if;
  if v_phone is null or v_phone !~ '^\+255[1-9]\d{8}$' then
    return null;
  end if;

  select s.* into v_staff
  from public.staff s
  join public.tenants t on t.id = s.tenant_id
  where s.user_id is null
    and s.active
    and s.phone_e164 = v_phone
    and t.deleted_at is null
    and t.status <> 'SUSPENDED'
  order by s.created_at
  limit 1;

  if v_staff.id is null then
    return null;
  end if;

  update public.staff set user_id = v_uid where id = v_staff.id and user_id is null;

  insert into public.memberships (tenant_id, user_id, role)
  values (v_staff.tenant_id, v_uid, 'CLEANER')
  on conflict (tenant_id, user_id) do nothing;

  return v_staff.id;
end;
$$;
