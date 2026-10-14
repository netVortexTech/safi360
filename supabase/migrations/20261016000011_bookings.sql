-- 0011 · quotes, bookings, items, job events, exceptions, payments, customer OTP codes.
-- Pure structure; RLS and privileges in 0012, functions in 0013.
--
-- Write rules enforced by privileges (0012) and functions (0013), not by trust:
--   * bookings / booking_items / job_events are inserted only by create_booking_tx;
--   * bookings.status changes only inside transition_booking();
--   * payments.status changes only inside apply_payment_result();
--   * ticket_ref comes from app.next_ticket_ref() inside the same transaction.

-- ---------------------------------------------------------------------------
-- quotes — a priced snapshot. The booking points at its current quote; a revised quote
-- (after inspection) gets revised_from_id and supersedes the old one.
-- ---------------------------------------------------------------------------
create table public.quotes (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default app.current_tenant_id() references public.tenants(id),
  customer_id      uuid,
  status           text not null default 'DRAFT'
                     check (status in ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'SUPERSEDED')),
  snapshot         jsonb not null default '{}'::jsonb,                    -- full QuoteResult
  subtotal_tzs     integer not null default 0 check (subtotal_tzs >= 0),
  travel_fee_tzs   integer not null default 0 check (travel_fee_tzs >= 0),
  discount_tzs     integer not null default 0 check (discount_tzs >= 0),
  tax_tzs          integer not null default 0 check (tax_tzs >= 0),
  total_tzs        integer not null default 0 check (total_tzs >= 0),
  deposit_tzs      integer not null default 0 check (deposit_tzs >= 0),
  requires_review  boolean not null default false,
  has_estimate     boolean not null default false,
  revised_from_id  uuid,
  expires_at       timestamptz,
  created_by       uuid references auth.users(id) on delete set null,     -- null = customer
  sent_at          timestamptz,
  decided_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete set null,
  foreign key (revised_from_id, tenant_id) references public.quotes (id, tenant_id) on delete set null
);

create index quotes_tenant_customer_idx on public.quotes (tenant_id, customer_id);

create trigger quotes_set_updated_at
  before update on public.quotes
  for each row execute function app.set_updated_at();

create table public.quote_items (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default app.current_tenant_id() references public.tenants(id),
  quote_id         uuid not null,
  item_index       integer not null check (item_index >= 0),
  service_id       uuid,
  label_sw         text not null,
  label_en         text not null,
  input            jsonb not null default '{}'::jsonb,                     -- QuoteItemInput
  qty              integer not null default 1 check (qty >= 1),
  amount_tzs       integer check (amount_tzs is null or amount_tzs >= 0),  -- null while on review
  requires_review  boolean not null default false,
  foreign key (quote_id, tenant_id) references public.quotes (id, tenant_id) on delete cascade,
  foreign key (service_id, tenant_id) references public.services (id, tenant_id) on delete set null,
  unique (quote_id, item_index)
);

-- ---------------------------------------------------------------------------
-- bookings — the ticket. Lifecycle columns are written only by transition_booking().
-- ---------------------------------------------------------------------------
create table public.bookings (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null default app.current_tenant_id() references public.tenants(id),
  ticket_ref        text not null check (ticket_ref ~ '^[A-Z]{2,5}-\d{4}-\d{5}$'),
  customer_id       uuid not null,
  address_id        uuid,
  address_snapshot  jsonb not null default '{}'::jsonb,
  status            public.booking_status not null default 'REQUEST_RECEIVED',
  source            public.booking_source not null default 'website',
  quote_id          uuid,
  scheduled_start   timestamptz,
  scheduled_end     timestamptz,
  duration_min      integer not null check (duration_min > 0),
  crew_size         integer not null default 1 check (crew_size between 1 and 20),
  flags             text[] not null default '{}'::text[],
  payment_mode      text not null default 'ON_COMPLETION' check (payment_mode in ('DEPOSIT', 'ON_COMPLETION')),
  total_tzs         integer not null default 0 check (total_tzs >= 0),
  deposit_tzs       integer not null default 0 check (deposit_tzs >= 0),
  paid_tzs          integer not null default 0 check (paid_tzs >= 0),
  zone_id           uuid,
  locale            text not null default 'sw' check (locale in ('sw', 'en')),
  notes_customer    text check (notes_customer is null or length(notes_customer) <= 1000),
  notes_internal    text check (notes_internal is null or length(notes_internal) <= 4000),
  outcome_reason    text check (outcome_reason is null or length(outcome_reason) <= 300),
  idempotency_key   text check (idempotency_key is null or idempotency_key ~ '^(booking|assignment|payment|manual_payment|quote)_[0-9a-f-]{32,36}$'),
  request_hash      text,
  hold_expires_at   timestamptz,
  created_by        uuid references auth.users(id) on delete set null,     -- null = public portal
  confirmed_at      timestamptz,
  completed_at      timestamptz,
  closed_at         timestamptz,
  cancelled_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, ticket_ref),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id),
  foreign key (address_id, tenant_id) references public.customer_addresses (id, tenant_id) on delete set null,
  foreign key (quote_id, tenant_id) references public.quotes (id, tenant_id) on delete set null,
  foreign key (zone_id, tenant_id) references public.service_zones (id, tenant_id) on delete set null,
  constraint bookings_schedule_both_or_none check ((scheduled_start is null) = (scheduled_end is null)),
  constraint bookings_schedule_ordered check (scheduled_end is null or scheduled_end > scheduled_start),
  constraint bookings_flags_known check (flags <@ array['RESCHEDULED', 'NEEDS_REVIEW']::text[])
);

-- Partial: admin-created bookings (Phase 3) may carry no key.
create unique index bookings_idempotency_idx on public.bookings (tenant_id, idempotency_key)
  where idempotency_key is not null;
create index bookings_tenant_status_start_idx on public.bookings (tenant_id, status, scheduled_start);
create index bookings_customer_idx on public.bookings (tenant_id, customer_id, created_at desc);
create index bookings_hold_idx on public.bookings (hold_expires_at) where hold_expires_at is not null;

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function app.set_updated_at();

-- Every booking starts life as REQUEST_RECEIVED; create_booking_tx then routes it through
-- transition_booking() so the first status change is in the event trail like every other.
create or replace function app.bookings_insert_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'REQUEST_RECEIVED' then
    raise exception 'bookings_must_start_as_request_received' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger bookings_insert_guard
  before insert on public.bookings
  for each row execute function app.bookings_insert_guard();

create table public.booking_items (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default app.current_tenant_id() references public.tenants(id),
  booking_id       uuid not null,
  item_index       integer not null check (item_index >= 0),
  service_id       uuid,
  label_sw         text not null,
  label_en         text not null,
  input            jsonb not null default '{}'::jsonb,
  qty              integer not null default 1 check (qty >= 1),
  amount_tzs       integer check (amount_tzs is null or amount_tzs >= 0),
  requires_review  boolean not null default false,
  foreign key (booking_id, tenant_id) references public.bookings (id, tenant_id) on delete cascade,
  foreign key (service_id, tenant_id) references public.services (id, tenant_id) on delete set null,
  unique (booking_id, item_index)
);

-- assignments were created in 0008 before bookings existed. The only rows that can exist
-- without a booking are seed placeholders; drop them so the real foreign key can be added.
delete from public.assignments a
where not exists (select 1 from public.bookings b where b.id = a.booking_id);

alter table public.assignments
  add constraint assignments_booking_fk
  foreign key (booking_id, tenant_id) references public.bookings (id, tenant_id) on delete cascade;

-- ---------------------------------------------------------------------------
-- job_events — the ticket's timeline. Append-only. customer_visible rows feed the
-- customer tracking page; everything else is internal.
-- ---------------------------------------------------------------------------
create table public.job_events (
  id                bigint generated always as identity primary key,
  tenant_id         uuid not null default app.current_tenant_id() references public.tenants(id),
  booking_id        uuid not null,
  kind              text not null check (kind in (
                      'created', 'status_changed', 'note', 'customer_action', 'payment',
                      'assignment', 'reschedule_requested', 'rescheduled', 'hold_expired'
                    )),
  from_status       public.booking_status,
  to_status         public.booking_status,
  actor_kind        text not null check (actor_kind in ('customer', 'staff', 'system')),
  actor_user_id     uuid,
  actor_label       text check (actor_label is null or length(actor_label) <= 120),
  customer_visible  boolean not null default false,
  message_key       text check (message_key is null or length(message_key) <= 120),
  data              jsonb not null default '{}'::jsonb,
  created_at        timestamptz not null default now(),
  foreign key (booking_id, tenant_id) references public.bookings (id, tenant_id) on delete cascade
);

create index job_events_booking_idx on public.job_events (booking_id, created_at);

create trigger job_events_no_update
  before update or delete on public.job_events
  for each row execute function app.audit_logs_append_only();

-- ---------------------------------------------------------------------------
-- exceptions — things a human must look at (ops "Exceptions" queue).
-- ---------------------------------------------------------------------------
create table public.exceptions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default app.current_tenant_id() references public.tenants(id),
  booking_id   uuid,
  kind         text not null check (kind in (
                 'NEEDS_REVIEW', 'SLOT_CONFLICT', 'RESCHEDULE_REQUESTED', 'CANCEL_OUTSIDE_POLICY',
                 'PAYMENT_UNKNOWN', 'OUT_OF_AREA', 'POSSIBLE_DUPLICATE'
               )),
  severity     text not null default 'normal' check (severity in ('low', 'normal', 'high')),
  status       text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED', 'DISMISSED')),
  details      jsonb not null default '{}'::jsonb,
  resolved_by  uuid references auth.users(id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  foreign key (booking_id, tenant_id) references public.bookings (id, tenant_id) on delete cascade
);

create index exceptions_open_idx on public.exceptions (tenant_id, created_at desc) where status = 'OPEN';
create index exceptions_booking_idx on public.exceptions (booking_id);

create trigger exceptions_set_updated_at
  before update on public.exceptions
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- payments — one row per attempt. status moves only through apply_payment_result(),
-- which is only reached from verified provider callbacks / reconciliation.
-- ---------------------------------------------------------------------------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default app.current_tenant_id() references public.tenants(id),
  booking_id       uuid not null,
  kind             text not null check (kind in ('DEPOSIT', 'BALANCE')),
  provider         text not null check (provider in ('MOCK', 'SELCOM', 'AZAMPAY', 'MANUAL')),
  provider_ref     text check (provider_ref is null or length(provider_ref) <= 120),
  amount_tzs       integer not null check (amount_tzs > 0),
  status           public.payment_status not null default 'PENDING',
  idempotency_key  text check (idempotency_key is null or idempotency_key ~ '^(booking|assignment|payment|manual_payment|quote)_[0-9a-f-]{32,36}$'),
  raw              jsonb not null default '{}'::jsonb,
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  foreign key (booking_id, tenant_id) references public.bookings (id, tenant_id) on delete cascade
);

create unique index payments_idempotency_idx on public.payments (tenant_id, idempotency_key)
  where idempotency_key is not null;
create unique index payments_provider_ref_idx on public.payments (provider, provider_ref)
  where provider_ref is not null;
create index payments_booking_idx on public.payments (booking_id, created_at desc);

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- customer_otp_codes — hashed one-time codes for customers (booking + tracking).
-- Never readable by any client role. The code itself is never stored.
-- ---------------------------------------------------------------------------
create table public.customer_otp_codes (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  phone_e164   text not null check (phone_e164 ~ '^\+255[1-9]\d{8}$'),
  purpose      text not null check (purpose in ('booking', 'tracking')),
  code_hash    text not null,
  salt         text not null,
  expires_at   timestamptz not null,
  attempts     integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  consumed_at  timestamptz,
  scope        jsonb not null default '{}'::jsonb,                        -- e.g. {"ticket_ref": "UBC-2026-00001"}
  created_at   timestamptz not null default now()
);

create index customer_otp_codes_lookup_idx
  on public.customer_otp_codes (tenant_id, phone_e164, purpose, created_at desc)
  where consumed_at is null;
