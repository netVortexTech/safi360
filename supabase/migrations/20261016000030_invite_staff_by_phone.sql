-- 0030 · invite a staff member by phone (office side)
-- The office adds a colleague by phone before that colleague can see anything. This is
-- a single SECURITY DEFINER call so the office does not need to read the invitee's
-- profile row first (RLS only exposes profiles of existing members). It:
--   * finds the profile by the verified phone,
--   * grants/updates the membership (never OWNER, never your own),
--   * for CLEANER, links or creates the roster row so RLS shows them their jobs.
-- Callers must be OWNER or MANAGER of their own tenant.

create or replace function public.invite_staff_by_phone(
  p_phone_e164 text,
  p_role public.member_role
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_uid      uuid := app.current_user_id();
  v_tenant   uuid := app.current_tenant_id();
  v_role     text := app.current_tenant_role();
  v_target   uuid;
  v_name     text;
begin
  if v_uid is null or v_tenant is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  if v_role not in ('OWNER', 'MANAGER') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- OWNER is never grantable here (the memberships policy keeps OWNER owner-only).
  if p_role not in ('MANAGER', 'DISPATCHER', 'CLEANER') then
    raise exception 'invalid_role' using errcode = '22023';
  end if;
  if p_phone_e164 is null or p_phone_e164 !~ '^\+255[1-9]\d{8}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;

  select p.id, p.name into v_target, v_name
  from public.profiles p
  where p.phone_e164 = p_phone_e164;

  if v_target is null then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;
  if v_target = v_uid then
    raise exception 'cannot_edit_self' using errcode = '42501';
  end if;

  insert into public.memberships (tenant_id, user_id, role, active)
  values (v_tenant, v_target, p_role, true)
  on conflict (tenant_id, user_id) do update set role = excluded.role, active = true;

  if p_role = 'CLEANER' then
    update public.staff
       set user_id = v_target
     where tenant_id = v_tenant
       and phone_e164 = p_phone_e164
       and user_id is null;

    if not found then
      insert into public.staff (tenant_id, user_id, display_name, phone_e164)
      select v_tenant, v_target, coalesce(v_name, p_phone_e164), p_phone_e164
      where not exists (
        select 1 from public.staff
        where tenant_id = v_tenant and phone_e164 = p_phone_e164
      );
    end if;
  end if;

  return v_target;
end;
$$;

revoke all on function public.invite_staff_by_phone(text, public.member_role) from public, anon;
grant execute on function public.invite_staff_by_phone(text, public.member_role) to authenticated, service_role;
