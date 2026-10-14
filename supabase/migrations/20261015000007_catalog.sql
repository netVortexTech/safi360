-- 0007 · catalog: service categories, services, add-ons, service zones.
-- Pure structure; RLS lives in 0009. Every child FK is composite (id, tenant_id) so a row
-- can never point at a parent in another tenant, even through a service-role bug.

-- ---------------------------------------------------------------------------
-- service_categories
-- ---------------------------------------------------------------------------
create table public.service_categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default app.current_tenant_id() references public.tenants(id),
  name_sw     text not null check (length(name_sw) between 1 and 80),
  name_en     text not null check (length(name_en) between 1 and 80),
  sort        integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, tenant_id)
);

create index service_categories_tenant_idx on public.service_categories (tenant_id, sort);

create trigger service_categories_set_updated_at
  before update on public.service_categories
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- services — one pricing_type + one JSON rule each (blueprint §2.3). The rule shape per
-- type is validated by _shared/pricing/rules.ts on every write path and on every read.
-- ---------------------------------------------------------------------------
create table public.services (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null default app.current_tenant_id() references public.tenants(id),
  category_id      uuid,
  name_sw          text not null check (length(name_sw) between 1 and 120),
  name_en          text not null check (length(name_en) between 1 and 120),
  description_sw   text check (length(description_sw) <= 600),
  description_en   text check (length(description_en) <= 600),
  pricing_type     public.pricing_type not null,
  pricing_rule     jsonb not null default '{}'::jsonb,
  duration_rule    jsonb not null default '{"base_min":60}'::jsonb,  -- {base_min, per_unit_min, per_sqm_min, per_room_min}
  crew_size        integer not null default 1 check (crew_size between 1 and 20),
  recurrence_days  integer check (recurrence_days is null or recurrence_days > 0),
  photo_path       text check (length(photo_path) <= 300),           -- private Storage path, signed on read
  sort             integer not null default 0,
  active           boolean not null default true,
  deleted_at       timestamptz,                                      -- soft delete: booked services are never dropped
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (category_id, tenant_id) references public.service_categories (id, tenant_id) on delete set null
);

create index services_tenant_active_idx on public.services (tenant_id, active, sort) where deleted_at is null;
create index services_category_idx on public.services (category_id);

create trigger services_set_updated_at
  before update on public.services
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- service_addons — service_id null means "offered with every service"
-- ---------------------------------------------------------------------------
create table public.service_addons (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default app.current_tenant_id() references public.tenants(id),
  service_id  uuid,
  name_sw     text not null check (length(name_sw) between 1 and 120),
  name_en     text not null check (length(name_en) between 1 and 120),
  price_tzs   integer not null check (price_tzs >= 0),
  per_unit    boolean not null default false,                       -- true: price × item quantity
  sort        integer not null default 0,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (service_id, tenant_id) references public.services (id, tenant_id) on delete cascade
);

create index service_addons_tenant_idx on public.service_addons (tenant_id, service_id, sort);

create trigger service_addons_set_updated_at
  before update on public.service_addons
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- service_zones — resolved in this order by _shared/pricing/zones.ts:
--   1. polygon (GeoJSON Polygon, lng/lat) contains the address pin
--   2. an entry in `areas` matches the typed area/ward name
--   3. the smallest `max_km` distance band from the tenant base that fits
-- Outside every zone the booking page offers a callback instead of a price.
-- ---------------------------------------------------------------------------
create table public.service_zones (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null default app.current_tenant_id() references public.tenants(id),
  name            text not null check (length(name) between 1 and 80),
  areas           text[] not null default '{}'::text[],
  polygon         jsonb,                                            -- GeoJSON Polygon or null
  max_km          numeric(6,2) check (max_km is null or max_km > 0),
  travel_fee_tzs  integer not null default 0 check (travel_fee_tzs >= 0),
  serviceable     boolean not null default true,
  sort            integer not null default 0,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, tenant_id),
  check (polygon is null or jsonb_typeof(polygon -> 'coordinates') = 'array')
);

create index service_zones_tenant_idx on public.service_zones (tenant_id, sort);

create trigger service_zones_set_updated_at
  before update on public.service_zones
  for each row execute function app.set_updated_at();
