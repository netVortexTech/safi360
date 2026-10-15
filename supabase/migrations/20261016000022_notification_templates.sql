-- 0022 · per-tenant notification template library.
-- Any tenant member can read templates; only OWNER may create or update them.

create table if not exists public.notification_templates (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  template_key text not null,
  description  text,
  subject_sw   text,
  subject_en   text,
  body_sw      text not null,
  body_en      text not null,
  variables    jsonb not null default '[]'::jsonb,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, template_key)
);

create index notification_templates_tenant_idx on public.notification_templates (tenant_id);

create trigger notification_templates_set_updated_at
  before update on public.notification_templates
  for each row execute function app.set_updated_at();

alter table public.notification_templates enable row level security;

revoke all on table public.notification_templates from public, anon;

create policy notification_templates_select on public.notification_templates
  for select to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER', 'CLEANER'));

create policy notification_templates_insert on public.notification_templates
  for insert to authenticated
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER'));

create policy notification_templates_update on public.notification_templates
  for update to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER'));
