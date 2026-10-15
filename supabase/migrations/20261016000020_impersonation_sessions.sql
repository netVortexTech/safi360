-- 0020 · admin impersonation audit log.
-- Super admins can start/record an impersonation session scoped to a tenant and role.

create table if not exists public.impersonation_sessions (
  id              uuid primary key default gen_random_uuid(),
  admin_user_id   uuid not null references public.profiles(id),
  target_tenant_id uuid not null references public.tenants(id),
  target_role     text not null check (target_role in ('OWNER', 'MANAGER', 'DISPATCHER')),
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  reason          text
);

create index impersonation_sessions_admin_idx on public.impersonation_sessions (admin_user_id);
create index impersonation_sessions_tenant_idx on public.impersonation_sessions (target_tenant_id);

alter table public.impersonation_sessions enable row level security;

revoke all on table public.impersonation_sessions from public, anon;

create policy impersonation_sessions_select on public.impersonation_sessions
  for select to authenticated
  using (app.is_super_admin());

create policy impersonation_sessions_insert on public.impersonation_sessions
  for insert to authenticated
  with check (app.is_super_admin());

create policy impersonation_sessions_update on public.impersonation_sessions
  for update to authenticated
  using (app.is_super_admin());
