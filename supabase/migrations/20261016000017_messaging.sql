-- 0017 · messaging state and notification queue (platform scaffold).
-- Full WhatsApp bot and gateway provider callbacks arrive in the Edge Functions; this
-- migration only gives the database a durable home for conversations and delivery status.

create table if not exists public.message_threads (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id),
  channel          text not null check (channel in ('WHATSAPP', 'SMS')),
  external_thread  text not null,
  phone_e164       text not null check (phone_e164 ~ '^\+255[1-9]\d{8}$'),
  booking_id       uuid references public.bookings(id) on delete set null,
  status           text not null default 'OPEN' check (status in ('OPEN', 'WAITING', 'HANDED_OFF', 'CLOSED')),
  state            jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (tenant_id, channel, external_thread)
);

create table if not exists public.messages (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id),
  thread_id         uuid not null references public.message_threads(id) on delete cascade,
  direction         text not null check (direction in ('INBOUND', 'OUTBOUND')),
  provider_msg_id   text,
  body              text,
  template_key      text,
  locale            text check (locale in ('sw', 'en')),
  metadata          jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now()
);

create index message_threads_tenant_idx on public.message_threads (tenant_id, updated_at desc);
create index message_threads_status_idx on public.message_threads (tenant_id, status, updated_at desc);
create index messages_thread_idx on public.messages (tenant_id, thread_id, created_at);
create unique index messages_provider_msg_id_idx on public.messages (provider_msg_id) where provider_msg_id is not null;

create trigger message_threads_set_updated_at
  before update on public.message_threads
  for each row execute function app.set_updated_at();

create or replace function app.touch_message_thread()
returns trigger
language plpgsql
as $$
begin
  update public.message_threads set updated_at = now() where id = new.thread_id;
  return new;
end;
$$;

create trigger messages_touch_thread
  after insert on public.messages
  for each row execute function app.touch_message_thread();

create table if not exists public.notifications (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references public.tenants(id),
  booking_id        uuid references public.bookings(id) on delete cascade,
  thread_id         uuid references public.message_threads(id) on delete set null,
  customer_id       uuid,
  channel           text not null check (channel in ('WHATSAPP', 'SMS')),
  template_key      text not null check (length(template_key) between 2 and 60),
  locale            text not null default 'sw' check (locale in ('sw', 'en')),
  variables         jsonb not null default '{}'::jsonb,
  status            public.notification_status not null default 'queued',
  external_ref      text,
  last_error        text,
  scheduled_for     timestamptz not null default now(),
  sent_at           timestamptz,
  delivered_at      timestamptz,
  read_at           timestamptz,
  failed_at         timestamptz,
  created_at        timestamptz not null default now()
);

create index notifications_tenant_due_idx on public.notifications (tenant_id, scheduled_for, status);
create index notifications_booking_idx on public.notifications (booking_id, created_at desc);
create index notifications_status_idx on public.notifications (tenant_id, status, scheduled_for desc);

alter table public.message_threads enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

revoke all on table public.message_threads, public.messages, public.notifications from public, anon;

grant select on public.message_threads, public.messages, public.notifications to authenticated;
grant select, insert, update on public.notifications to authenticated;

create policy message_threads_select on public.message_threads
  for select to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')));

create policy messages_select on public.messages
  for select to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')));

create policy notifications_select on public.notifications
  for select to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')));

create policy notifications_resend on public.notifications
  for update to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'));
