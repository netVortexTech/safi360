-- 0023 · support_messages carries its own tenant_id (convention: every tenant
-- table has NOT NULL tenant_id, mirroring messages.thread denormalisation).
alter table public.support_messages
  add column if not exists tenant_id uuid references public.tenants(id);

update public.support_messages m
  set tenant_id = sr.tenant_id
  from public.support_requests sr
  where sr.id = m.request_id and m.tenant_id is null;

alter table public.support_messages alter column tenant_id set not null;

create index if not exists support_messages_tenant_idx on public.support_messages (tenant_id);

-- Direct tenant check now (equivalent to the previous parent-join check).
drop policy if exists support_messages_select on public.support_messages;
create policy support_messages_select on public.support_messages
  for select to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER')));

drop policy if exists support_messages_insert on public.support_messages;
create policy support_messages_insert on public.support_messages
  for insert to authenticated
  with check (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER')));
