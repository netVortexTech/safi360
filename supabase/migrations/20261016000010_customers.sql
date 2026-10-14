-- 0010 · customers, their addresses and possible-duplicate flags.
-- Pure structure; RLS lives in 0012. One customer row per (tenant, phone): the phone is the
-- identity a customer proves with an OTP, so find-or-create keys on it. Two people who
-- share a name but not a phone are flagged, never merged automatically.

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------
create table public.customers (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          uuid not null default app.current_tenant_id() references public.tenants(id),
  phone_e164         text not null check (phone_e164 ~ '^\+255[1-9]\d{8}$'),
  name               text not null check (length(name) between 1 and 120),
  email              text check (email is null or (length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  locale             text not null default 'sw' check (locale in ('sw', 'en')),
  phone_verified_at  timestamptz,
  notes_internal     text check (notes_internal is null or length(notes_internal) <= 2000),
  first_source       public.booking_source not null default 'website',
  tags               text[] not null default '{}'::text[],
  deleted_at         timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, phone_e164)
);

create index customers_tenant_name_idx on public.customers (tenant_id, lower(name));

create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- customer_addresses — a saved place to clean. zone_id is resolved at save time from
-- the typed area / pin so the price explanation on a ticket stays stable.
-- ---------------------------------------------------------------------------
create table public.customer_addresses (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null default app.current_tenant_id() references public.tenants(id),
  customer_id  uuid not null,
  label        text check (label is null or length(label) <= 60),          -- "Home", "Office"
  region       text check (region is null or length(region) <= 80),
  district     text check (district is null or length(district) <= 80),
  ward         text check (ward is null or length(ward) <= 80),
  street       text check (street is null or length(street) <= 160),
  landmark     text check (landmark is null or length(landmark) <= 200),
  area         text check (area is null or length(area) <= 120),            -- typed / matched area name
  lat          double precision check (lat is null or lat between -90 and 90),
  lng          double precision check (lng is null or lng between -180 and 180),
  zone_id      uuid,
  is_default   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade,
  foreign key (zone_id, tenant_id) references public.service_zones (id, tenant_id) on delete set null,
  constraint customer_addresses_pin_both_or_none check ((lat is null) = (lng is null))
);

create index customer_addresses_customer_idx on public.customer_addresses (tenant_id, customer_id);

create trigger customer_addresses_set_updated_at
  before update on public.customer_addresses
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- customer_duplicates — "these two records look alike". Opened by create_booking_tx when a
-- new phone arrives with a name already on file; resolved by an owner/manager later.
-- ---------------------------------------------------------------------------
create table public.customer_duplicates (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default app.current_tenant_id() references public.tenants(id),
  customer_id      uuid not null,
  duplicate_of_id  uuid not null,
  reason           text not null check (reason in ('same_name', 'similar_phone')),
  status           text not null default 'OPEN' check (status in ('OPEN', 'MERGED', 'DISMISSED')),
  resolved_by      uuid references auth.users(id) on delete set null,
  resolved_at      timestamptz,
  created_at       timestamptz not null default now(),
  foreign key (customer_id, tenant_id) references public.customers (id, tenant_id) on delete cascade,
  foreign key (duplicate_of_id, tenant_id) references public.customers (id, tenant_id) on delete cascade,
  unique (tenant_id, customer_id, duplicate_of_id),
  check (customer_id <> duplicate_of_id)
);

create index customer_duplicates_open_idx on public.customer_duplicates (tenant_id) where status = 'OPEN';
