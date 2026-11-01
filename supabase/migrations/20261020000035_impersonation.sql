-- 0035 · real impersonation: Safi360 staff enter a company's portal as its owner.
--
-- While a super admin has an open, unexpired impersonation_sessions row, the access-token
-- hook mints their token as a member of that one company:
--   tenant_id = target, tenant_role = target_role, is_super_admin = false
--   impersonation_id / impersonation_mode / impersonation_until / impersonator_name / impersonation_ticket
-- is_super_admin is false on purpose: tenant RLS has "… or app.is_super_admin()" branches, and
-- leaving it on would show every company's rows inside the portal.
--
-- Safety:
--   * app.current_tenant_id()/current_tenant_role() stop honouring the tenant claims the moment
--     the session is ended or expires, even though the JWT itself is still valid.
--   * read_only sessions: a PostgREST pre-request check rejects every write (non-GET requests and
--     volatile RPCs). The ops_create_booking Edge Function refuses read-only tokens too.
--   * every audited write made while impersonating is attributed to 'super_admin' with the
--     staff member's user id and the session id.

-- ---------------------------------------------------------------------------
-- Session validity, checked on every tenant-scoped access
-- ---------------------------------------------------------------------------

create or replace function app.impersonation_valid()
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select case
    when coalesce(app.jwt_claims() ->> 'impersonation_id', '') = '' then true
    else exists (
      select 1 from public.impersonation_sessions s
      where s.id = (app.jwt_claims() ->> 'impersonation_id')::uuid
        and s.admin_user_id = app.current_user_id()
        and s.ended_at is null
        and s.expires_at > now()
    )
  end;
$$;

create or replace function app.current_tenant_id()
returns uuid
language sql
stable
as $$
  select case when app.impersonation_valid() then nullif(app.jwt_claims() ->> 'tenant_id', '')::uuid end;
$$;

create or replace function app.current_tenant_role()
returns text
language sql
stable
as $$
  select case when app.impersonation_valid() then nullif(app.jwt_claims() ->> 'tenant_role', '') end;
$$;

-- ---------------------------------------------------------------------------
-- Access-token hook
-- ---------------------------------------------------------------------------

grant select on public.impersonation_sessions to supabase_auth_admin;

create policy impersonation_sessions_auth_admin_read on public.impersonation_sessions
  for select to supabase_auth_admin using (true);

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid;
  v_claims    jsonb;
  v_tenant_id uuid;
  v_role      text;
  v_super     boolean;
  v_name      text;
  v_imp_id    uuid;
  v_imp_tenant uuid;
  v_imp_role  text;
  v_imp_mode  text;
  v_imp_until timestamptz;
  v_imp_ticket text;
begin
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims  := coalesce(event -> 'claims', '{}'::jsonb);

  select coalesce(p.is_super_admin, false), p.name
  into v_super, v_name
  from public.profiles p
  where p.id = v_user_id;

  -- Safi360 staff inside a company's portal: a member of that company only.
  if coalesce(v_super, false) then
    select s.id, s.target_tenant_id, s.target_role, s.mode, s.expires_at, s.ticket
    into v_imp_id, v_imp_tenant, v_imp_role, v_imp_mode, v_imp_until, v_imp_ticket
    from public.impersonation_sessions s
    join public.tenants t on t.id = s.target_tenant_id and t.deleted_at is null
    where s.admin_user_id = v_user_id
      and s.ended_at is null
      and s.expires_at > now()
    order by s.started_at desc
    limit 1;
  end if;

  if v_imp_id is not null then
    v_claims := v_claims || jsonb_build_object(
      'tenant_id',            v_imp_tenant,
      'tenant_role',          v_imp_role,
      'is_super_admin',       false,
      'impersonation_id',     v_imp_id,
      'impersonation_mode',   v_imp_mode,
      'impersonation_until',  floor(extract(epoch from v_imp_until))::bigint,
      'impersonator_name',    coalesce(v_name, 'Safi360'),
      'impersonation_ticket', v_imp_ticket
    );
    return jsonb_set(event, '{claims}', v_claims);
  end if;

  select m.tenant_id, m.role::text
  into v_tenant_id, v_role
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = v_user_id
    and m.active
    and t.deleted_at is null
  limit 1;

  -- A fresh token never carries leftover impersonation claims.
  v_claims := (v_claims - 'impersonation_id' - 'impersonation_mode' - 'impersonation_until'
               - 'impersonator_name' - 'impersonation_ticket')
    || jsonb_build_object(
      'tenant_id',      v_tenant_id,
      'tenant_role',    v_role,
      'is_super_admin', coalesce(v_super, false)
    );

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- ---------------------------------------------------------------------------
-- Audit attribution while impersonating
-- ---------------------------------------------------------------------------

create or replace function app.write_audit(
  p_tenant_id uuid,
  p_action    text,
  p_entity    text default null,
  p_entity_id uuid default null,
  p_diff      jsonb default '{}'::jsonb,
  p_actor     text default null
)
returns bigint
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id   bigint;
  v_imp  text := nullif(app.jwt_claims() ->> 'impersonation_id', '');
begin
  insert into public.audit_logs (tenant_id, actor_user_id, actor_role, action, entity, entity_id, diff)
  values (
    p_tenant_id,
    app.current_user_id(),
    case
      when v_imp is not null then 'super_admin'
      else coalesce(
        p_actor,
        case
          when app.is_super_admin() then 'super_admin'
          when app.is_service_role() then 'service_role'
          else app.current_tenant_role()
        end
      )
    end,
    p_action, p_entity, p_entity_id,
    coalesce(p_diff, '{}'::jsonb)
      || case when v_imp is not null then jsonb_build_object('impersonation_id', v_imp) else '{}'::jsonb end
  )
  returning id into v_id;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Starting and ending sessions
-- ---------------------------------------------------------------------------

create or replace function public.control_start_session(
  p_tenant uuid, p_ticket text, p_mode text, p_minutes integer, p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id uuid;
  v_until timestamptz;
  v_reason text := app.require_reason(p_reason);
begin
  perform app.require_platform_write('support.session');
  if p_mode not in ('read_only', 'write') then raise exception 'invalid_mode' using errcode = '22023'; end if;
  if p_minutes is null or p_minutes < 5 or p_minutes > 240 then
    raise exception 'invalid_duration' using errcode = '22023';
  end if;
  if not exists (select 1 from public.tenants where id = p_tenant and deleted_at is null) then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;
  -- One open session per staff member.
  update public.impersonation_sessions set ended_at = now()
  where admin_user_id = app.current_user_id() and ended_at is null;
  v_until := now() + make_interval(mins => p_minutes);
  insert into public.impersonation_sessions (admin_user_id, target_tenant_id, target_role, reason, mode, ticket, expires_at)
  values (app.current_user_id(), p_tenant, 'OWNER', v_reason, p_mode, nullif(btrim(p_ticket), ''), v_until)
  returning id into v_id;
  perform app.write_audit(p_tenant, 'support_session.start', 'impersonation_session', v_id,
    jsonb_build_object('reason', v_reason, 'before', jsonb_build_object('session', null),
                       'after', jsonb_build_object('session', v_id, 'mode', p_mode, 'max_minutes', p_minutes, 'ticket', p_ticket)),
    'super_admin');
  return jsonb_build_object('id', v_id, 'ends_at', v_until);
end;
$$;

/**
 * End the caller's own open session(s). Callable from inside the company's portal, where the
 * token is no longer a super-admin token, so it checks session ownership instead.
 */
create or replace function public.end_impersonation()
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_tenant uuid;
  r record;
begin
  if app.current_user_id() is null then
    raise exception 'auth_required' using errcode = '42501';
  end if;
  for r in
    update public.impersonation_sessions set ended_at = now()
    where admin_user_id = app.current_user_id() and ended_at is null
    returning id, target_tenant_id
  loop
    v_tenant := r.target_tenant_id;
    perform app.write_audit(r.target_tenant_id, 'support_session.end', 'impersonation_session', r.id,
      jsonb_build_object('reason', 'Session ended by staff'), 'super_admin');
  end loop;
  return v_tenant;
end;
$$;

revoke all on function public.end_impersonation() from public, anon;

grant execute on function public.end_impersonation() to authenticated;

revoke all on function public.control_start_session(uuid, text, text, integer, text) from public, anon;

grant execute on function public.control_start_session(uuid, text, text, integer, text) to authenticated;

revoke all on function app.impersonation_valid() from public, anon;

grant execute on function app.impersonation_valid() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Read-only sessions: PostgREST pre-request check
-- ---------------------------------------------------------------------------

create or replace function public.check_request()
returns void
language plpgsql
stable
set search_path = public, app, pg_temp
as $$
declare
  v_path text;
  v_fn   text;
begin
  if coalesce(app.jwt_claims() ->> 'impersonation_mode', '') <> 'read_only' then
    return;
  end if;
  if coalesce(current_setting('request.method', true), 'GET') in ('GET', 'HEAD', 'OPTIONS') then
    return;
  end if;
  -- Reads exposed as RPC (POST /rpc/fn) are fine when the function cannot write.
  v_path := coalesce(current_setting('request.path', true), '');
  if v_path like '/rpc/%' then
    v_fn := substr(v_path, 6);
    if v_fn = 'end_impersonation' or exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = v_fn and p.provolatile in ('s', 'i')
    ) then
      return;
    end if;
  end if;
  raise exception 'read_only_session' using errcode = '42501',
    hint = 'This support session is read-only. End it and start one that allows changes.';
end;
$$;

revoke all on function public.check_request() from public;

grant execute on function public.check_request() to anon, authenticated, service_role;

do $$
begin
  if exists (select 1 from pg_roles where rolname = 'authenticator') then
    execute 'alter role authenticator set pgrst.db_pre_request = ''public.check_request''';
    perform pg_notify('pgrst', 'reload config');
  end if;
end
$$;
