-- 0003 · platform tables: plans, tenants, profiles, memberships, counters,
-- integrations (+ secrets), audit log, rate limits, and the ticket allocator.
-- RLS policies live in 0004 so this file is pure structure.

-- ---------------------------------------------------------------------------
-- plans (platform level)
-- ---------------------------------------------------------------------------
create table public.plans (
  id          text primary key,                       -- 'starter' | 'growth' | 'pro'
  name        text not null,
  price_tzs   integer not null check (price_tzs >= 0),
  limits      jsonb not null default '{}'::jsonb,     -- {"staff":5,"bookings_month":150,"reminders_month":100}
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
create table public.tenants (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique
                   check (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$'),
  name           text not null check (length(name) between 2 and 120),
  phone_e164     text not null check (phone_e164 ~ '^\+255[1-9]\d{8}$'),
  city           text,
  ticket_prefix  text not null unique check (ticket_prefix ~ '^[A-Z]{2,5}$'),
  branding       jsonb not null default '{}'::jsonb,
  settings       jsonb not null default '{}'::jsonb,
  plan_id        text references public.plans(id),
  status         public.tenant_status not null default 'TRIAL',
  trial_ends_at  timestamptz,
  deleted_at     timestamptz,                          -- soft delete only
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create trigger tenants_set_updated_at
  before update on public.tenants
  for each row execute function app.set_updated_at();

-- Columns the tenant may never change for itself (platform-managed).
create or replace function app.guard_tenant_columns()
returns trigger
language plpgsql
as $$
begin
  if app.is_service_role() then
    return new;
  end if;
  if new.id            is distinct from old.id
  or new.slug          is distinct from old.slug
  or new.ticket_prefix is distinct from old.ticket_prefix
  or new.plan_id       is distinct from old.plan_id
  or new.status        is distinct from old.status
  or new.trial_ends_at is distinct from old.trial_ends_at
  or new.deleted_at    is distinct from old.deleted_at
  or new.created_at    is distinct from old.created_at then
    raise exception 'immutable_column' using errcode = '42501',
      hint = 'slug, ticket_prefix, plan_id, status, trial_ends_at and deleted_at are managed by the platform';
  end if;
  return new;
end;
$$;

create trigger tenants_guard_columns
  before update on public.tenants
  for each row execute function app.guard_tenant_columns();

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id              uuid primary key references auth.users(id) on delete cascade,
  phone_e164      text unique check (phone_e164 ~ '^\+255[1-9]\d{8}$'),
  name            text,
  email           text unique,
  locale          text not null default 'sw' check (locale in ('sw', 'en')),
  is_super_admin  boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function app.set_updated_at();

create or replace function app.guard_profile_columns()
returns trigger
language plpgsql
as $$
begin
  if app.is_service_role() then
    return new;
  end if;
  if new.is_super_admin is distinct from old.is_super_admin
  or new.id is distinct from old.id then
    raise exception 'immutable_column' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_columns
  before update on public.profiles
  for each row execute function app.guard_profile_columns();

-- ---------------------------------------------------------------------------
-- memberships (user <-> tenant with role)
-- ---------------------------------------------------------------------------
create table public.memberships (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants(id),
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        public.member_role not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, user_id)
);

-- MVP: a user belongs to one active tenant at a time (the JWT carries one tenant_id).
create unique index memberships_one_active_per_user on public.memberships (user_id) where active;
create index memberships_tenant_idx on public.memberships (tenant_id);

create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- tenant_counters — one row per tenant per year, locked FOR UPDATE by the allocator
-- ---------------------------------------------------------------------------
create table public.tenant_counters (
  tenant_id   uuid not null references public.tenants(id),
  year        integer not null check (year between 2024 and 2100),
  last_value  integer not null default 0 check (last_value >= 0),
  primary key (tenant_id, year)
);

-- Allocates the next ticket reference inside the caller's transaction.
-- Year is taken in Africa/Dar_es_Salaam (fixed UTC+3, no DST) so tickets roll over at
-- local midnight. Only callable by service-role code paths (create_booking RPC).
create or replace function app.next_ticket_ref(p_tenant_id uuid, p_at timestamptz default now())
returns text
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_prefix text;
  v_year   integer;
  v_next   integer;
begin
  select ticket_prefix into v_prefix
  from public.tenants
  where id = p_tenant_id and deleted_at is null;
  if v_prefix is null then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;

  v_year := extract(year from (p_at + interval '3 hours'))::integer;

  insert into public.tenant_counters (tenant_id, year, last_value)
  values (p_tenant_id, v_year, 0)
  on conflict (tenant_id, year) do nothing;

  perform 1 from public.tenant_counters
  where tenant_id = p_tenant_id and year = v_year
  for update;

  update public.tenant_counters
  set last_value = last_value + 1
  where tenant_id = p_tenant_id and year = v_year
  returning last_value into v_next;

  return format('%s-%s-%s', v_prefix, v_year, lpad(v_next::text, 5, '0'));
end;
$$;

revoke all on function app.next_ticket_ref(uuid, timestamptz) from public, anon, authenticated;
grant execute on function app.next_ticket_ref(uuid, timestamptz) to service_role;

-- ---------------------------------------------------------------------------
-- tenant_integrations (non-secret config) + tenant_integration_secrets
-- ---------------------------------------------------------------------------
create table public.tenant_integrations (
  tenant_id   uuid not null references public.tenants(id),
  kind        text not null check (kind in ('WHATSAPP', 'SELCOM', 'AZAMPAY', 'SMS')),
  config      jsonb not null default '{}'::jsonb,     -- non-secret ids: waba_id, phone_number_id, merchant_id
  status      text not null default 'ACTIVE' check (status in ('ACTIVE', 'DISABLED', 'ERROR')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (tenant_id, kind)
);

create unique index tenant_integrations_wa_phone_number_idx
  on public.tenant_integrations ((config ->> 'phone_number_id'))
  where kind = 'WHATSAPP';

create trigger tenant_integrations_set_updated_at
  before update on public.tenant_integrations
  for each row execute function app.set_updated_at();

-- Secrets live apart from config so no client role can ever select them, even with `*`.
-- Values are AES-256-GCM ciphertext produced by Edge Functions; the key never enters Postgres.
create table public.tenant_integration_secrets (
  tenant_id    uuid not null,
  kind         text not null,
  secret_enc   bytea not null,
  key_version  integer not null default 1,
  updated_at   timestamptz not null default now(),
  primary key (tenant_id, kind),
  foreign key (tenant_id, kind) references public.tenant_integrations (tenant_id, kind) on delete cascade
);

-- ---------------------------------------------------------------------------
-- audit_logs — append only
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id             bigint generated always as identity primary key,
  tenant_id      uuid references public.tenants(id),  -- null for platform-level actions
  actor_user_id  uuid,
  actor_role     text,                                 -- tenant_role, 'service_role', 'super_admin'
  action         text not null,                        -- e.g. booking.transition, payment.manual_record
  entity         text,
  entity_id      uuid,
  diff           jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create or replace function app.audit_logs_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs is append-only' using errcode = '42501';
end;
$$;

create trigger audit_logs_no_update
  before update or delete on public.audit_logs
  for each row execute function app.audit_logs_append_only();

-- Helper used by database functions (transition_booking, manual payments, ...).
create or replace function app.write_audit(
  p_tenant_id uuid,
  p_action    text,
  p_entity    text default null,
  p_entity_id uuid default null,
  p_diff      jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_id bigint;
begin
  insert into public.audit_logs (tenant_id, actor_user_id, actor_role, action, entity, entity_id, diff)
  values (
    p_tenant_id,
    app.current_user_id(),
    case
      when app.is_super_admin() then 'super_admin'
      when app.is_service_role() then 'service_role'
      else app.current_tenant_role()
    end,
    p_action, p_entity, p_entity_id, coalesce(p_diff, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function app.write_audit(uuid, text, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function app.write_audit(uuid, text, text, uuid, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- rate_limits — fixed windows per tenant/action/caller, used by public Edge Functions
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  tenant_id     uuid not null references public.tenants(id),
  action        text not null,
  caller        text not null,                         -- 'ip:1.2.3.4' or 'phone:+2557...'
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (tenant_id, action, caller, window_start)
);

create or replace function public.app_rate_limit_hit(
  p_tenant_id      uuid,
  p_action         text,
  p_caller         text,
  p_limit          integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.rate_limits (tenant_id, action, caller, window_start, hits)
  values (p_tenant_id, p_action, p_caller, v_window, 1)
  on conflict (tenant_id, action, caller, window_start)
  do update set hits = public.rate_limits.hits + 1
  returning hits into v_hits;
  -- Opportunistic cleanup of old windows for this key.
  delete from public.rate_limits
  where tenant_id = p_tenant_id and action = p_action and caller = p_caller and window_start < v_window;
  return v_hits <= p_limit;
end;
$$;

revoke all on function public.app_rate_limit_hit(uuid, text, text, integer, integer) from public, anon, authenticated;
grant execute on function public.app_rate_limit_hit(uuid, text, text, integer, integer) to service_role;
