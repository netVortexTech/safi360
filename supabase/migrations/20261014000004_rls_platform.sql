-- 0004 · row level security for the platform tables.
-- Rules:
--   * anon never reads a table directly (public actions go through Edge Functions);
--   * authenticated users see only their own tenant, via JWT claims;
--   * counters, secrets and rate limits are invisible to every client role;
--   * service_role bypasses RLS (Supabase default) and is used only server-side.

-- Supabase grants anon/authenticated/service_role ALL on new public tables by default.
-- Take that back explicitly so every grant below is deliberate.
revoke all on table
  public.plans,
  public.tenants,
  public.profiles,
  public.memberships,
  public.tenant_counters,
  public.tenant_integrations,
  public.tenant_integration_secrets,
  public.audit_logs,
  public.rate_limits
from anon, authenticated;

alter table public.plans                      enable row level security;
alter table public.tenants                    enable row level security;
alter table public.profiles                   enable row level security;
alter table public.memberships                enable row level security;
alter table public.tenant_counters            enable row level security;
alter table public.tenant_integrations        enable row level security;
alter table public.tenant_integration_secrets enable row level security;
alter table public.audit_logs                 enable row level security;
alter table public.rate_limits                enable row level security;

-- plans: readable by any signed-in user (pricing page in ops settings); writes via service role.
grant select on public.plans to authenticated;
create policy plans_select on public.plans
  for select to authenticated
  using (active or app.is_super_admin());

-- tenants: members read their own tenant; owners may update branding/settings
-- (platform-managed columns are blocked by the guard trigger); super admins read all.
grant select, update on public.tenants to authenticated;
create policy tenants_select on public.tenants
  for select to authenticated
  using (id = app.current_tenant_id() or app.is_super_admin());
create policy tenants_update_owner on public.tenants
  for update to authenticated
  using (id = app.current_tenant_id() and app.has_tenant_role('OWNER'))
  with check (id = app.current_tenant_id() and app.has_tenant_role('OWNER'));

-- profiles: own row, plus colleagues in the same tenant (names on tickets and dispatch).
grant select, update on public.profiles to authenticated;
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = app.current_user_id()
    or app.is_super_admin()
    or exists (
      select 1 from public.memberships m
      where m.user_id = public.profiles.id
        and m.tenant_id = app.current_tenant_id()
    )
  );
create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = app.current_user_id())
  with check (id = app.current_user_id());

-- memberships: visible within the tenant; owners/managers manage them, but only an
-- owner can grant OWNER and nobody can edit their own membership.
grant select, insert, update, delete on public.memberships to authenticated;
create policy memberships_select on public.memberships
  for select to authenticated
  using (tenant_id = app.current_tenant_id() or app.is_super_admin());
create policy memberships_insert on public.memberships
  for insert to authenticated
  with check (
    tenant_id = app.current_tenant_id()
    and app.has_tenant_role('OWNER', 'MANAGER')
    and (role <> 'OWNER' or app.has_tenant_role('OWNER'))
    and user_id <> app.current_user_id()
  );
create policy memberships_update on public.memberships
  for update to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_tenant_role('OWNER', 'MANAGER')
    and user_id <> app.current_user_id()
  )
  with check (
    tenant_id = app.current_tenant_id()
    and (role <> 'OWNER' or app.has_tenant_role('OWNER'))
  );
create policy memberships_delete on public.memberships
  for delete to authenticated
  using (
    tenant_id = app.current_tenant_id()
    and app.has_tenant_role('OWNER')
    and user_id <> app.current_user_id()
  );

-- tenant_counters: no client access at all (RLS on, no policies, no grants).

-- tenant_integrations: owners see non-secret config; writes happen in Edge Functions.
grant select on public.tenant_integrations to authenticated;
create policy tenant_integrations_select_owner on public.tenant_integrations
  for select to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER'));

-- tenant_integration_secrets: no client access at all.

-- audit_logs: owners and managers read their tenant's trail; inserts only via app.write_audit.
grant select on public.audit_logs to authenticated;
create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'))
    or app.is_super_admin()
  );

-- rate_limits: no client access at all.
