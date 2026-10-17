-- 0029 · claim a staff invite on first cleaner login
-- The office adds an employee on the roster (a public.staff row with their phone); the
-- employee then signs in on the cleaner app. This function links the signed-in user to
-- that staff row by phone and grants the CLEANER membership, so they immediately see
-- their assigned jobs. It never grants access to a tenant without a matching roster row.
--
-- Only the caller's own verified phone (from their profile) is used, and only staff rows
-- with a NULL user_id can be claimed, so a login can never take over a linked account.

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

  select p.phone_e164 into v_phone from public.profiles p where p.id = v_uid;
  if v_phone is null then
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

revoke all on function public.claim_staff_invite() from public, anon;
grant execute on function public.claim_staff_invite() to authenticated, service_role;
