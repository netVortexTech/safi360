-- 0018 · support request tickets and threaded messages.
-- Platform super admins plus tenant OWNER/MANAGER can read and manage tickets;
-- messages inherit visibility through their parent request.

create table if not exists public.support_requests (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  subject     text not null,
  body        text not null,
  status      text not null default 'OPEN' check (status in ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED')),
  priority    text not null default 'MEDIUM' check (priority in ('LOW', 'MEDIUM', 'HIGH', 'URGENT')),
  created_by  uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_at timestamptz
);

create index support_requests_tenant_idx on public.support_requests (tenant_id);
create index support_requests_status_idx on public.support_requests (status);

create trigger support_requests_set_updated_at
  before update on public.support_requests
  for each row execute function app.set_updated_at();

create table if not exists public.support_messages (
  id         uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.support_requests(id) on delete cascade,
  body       text not null,
  author_id  uuid references public.profiles(id),
  is_staff   boolean not null default false,
  created_at timestamptz not null default now()
);

create index support_messages_request_idx on public.support_messages (request_id);

alter table public.support_requests enable row level security;
alter table public.support_messages enable row level security;

revoke all on table public.support_requests, public.support_messages from public, anon;

create policy support_requests_select on public.support_requests
  for select to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER')));

create policy support_requests_insert on public.support_requests
  for insert to authenticated
  with check (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER')));

create policy support_requests_update on public.support_requests
  for update to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER')));

create policy support_messages_select on public.support_messages
  for select to authenticated
  using (
    app.is_super_admin()
    or exists (
      select 1
      from public.support_requests sr
      where sr.id = support_messages.request_id
        and sr.tenant_id = app.current_tenant_id()
        and app.has_tenant_role('OWNER', 'MANAGER')
    )
  );

create policy support_messages_insert on public.support_messages
  for insert to authenticated
  with check (
    app.is_super_admin()
    or exists (
      select 1
      from public.support_requests sr
      where sr.id = support_messages.request_id
        and sr.tenant_id = app.current_tenant_id()
        and app.has_tenant_role('OWNER', 'MANAGER')
    )
  );
