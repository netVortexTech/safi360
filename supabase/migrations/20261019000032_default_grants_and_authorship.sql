-- 0032 · take back default grants; bind authorship columns; protect the OWNER row
--
-- 1) Tables created after 0004 revoked only `public, anon`, so `authenticated` kept
--    Supabase's default ALL grant — including TRUNCATE, which RLS never filters. Any
--    signed-in user (phone signup is open) could have emptied these tables for every
--    tenant. Revoke everything, then grant back exactly what the policies mediate.
-- 2) support_messages let a tenant OWNER/MANAGER write rows with is_staff = true and
--    any author_id, impersonating platform staff; impersonation_sessions did not bind
--    admin_user_id to the caller.
-- 3) The memberships UPDATE policy checked only the NEW role, so a MANAGER could
--    demote the OWNER; invite_staff_by_phone()'s upsert had the same hole.

-- 1) default grants ------------------------------------------------------------------
revoke all on table
  public.message_threads,
  public.messages,
  public.notifications,
  public.support_requests,
  public.support_messages,
  public.impersonation_sessions,
  public.system_health,
  public.notification_templates
from public, anon, authenticated;

grant select on public.message_threads, public.messages to authenticated;
grant select, insert, update on public.notifications to authenticated;
grant select, insert, update on public.support_requests to authenticated;
grant select, insert on public.support_messages to authenticated;
grant select, insert, update on public.impersonation_sessions to authenticated;
grant select, insert on public.system_health to authenticated;
grant select, insert, update on public.notification_templates to authenticated;

-- 2) authorship bindings -------------------------------------------------------------
drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages
  for insert to authenticated
  with check (
    (
      app.is_super_admin()
      or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'))
    )
    and author_id = app.current_user_id()
    and is_staff = app.is_super_admin()
  );

drop policy if exists impersonation_sessions_insert on public.impersonation_sessions;
create policy impersonation_sessions_insert on public.impersonation_sessions
  for insert to authenticated
  with check (app.is_super_admin() and admin_user_id = app.current_user_id());

-- 3) only an OWNER may touch an OWNER's membership row -------------------------------
drop policy if exists memberships_update on public.memberships;
create policy memberships_update on public.memberships
  for update to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_tenant_role('OWNER', 'MANAGER')
    and user_id <> app.current_user_id()
    and (role <> 'OWNER' or app.has_tenant_role('OWNER'))
  )
  with check (
    tenant_id = app.current_tenant_id()
    and (role <> 'OWNER' or app.has_tenant_role('OWNER'))
  );

-- invite_staff_by_phone: the upsert may change any role except an existing OWNER's.
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
  on conflict (tenant_id, user_id) do update
    set role = excluded.role, active = true
    where public.memberships.role <> 'OWNER';

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
