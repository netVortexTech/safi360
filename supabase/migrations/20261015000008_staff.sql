-- 0008 · staff, availability and assignments.
-- Pure structure; RLS lives in 0009.

-- ---------------------------------------------------------------------------
-- staff — a cleaner or team lead. user_id links to the phone-OTP login once the person
-- has signed in; until then the owner manages the row by phone number only.
-- ---------------------------------------------------------------------------
create table public.staff (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default app.current_tenant_id() references public.tenants(id),
  user_id       uuid references auth.users(id) on delete set null,
  display_name  text not null check (length(display_name) between 1 and 80),
  phone_e164    text check (phone_e164 is null or phone_e164 ~ '^\+255[1-9]\d{8}$'),
  skills        uuid[] not null default '{}'::uuid[],               -- service ids this person can do
  home_zone_id  uuid,
  is_team_lead  boolean not null default false,
  pay_type      text check (pay_type is null or pay_type in ('PER_JOB', 'DAILY', 'MONTHLY')),
  pay_rate_tzs  integer check (pay_rate_tzs is null or pay_rate_tzs >= 0),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, user_id),
  unique (tenant_id, phone_e164),
  foreign key (home_zone_id, tenant_id) references public.service_zones (id, tenant_id) on delete set null
);

create index staff_tenant_active_idx on public.staff (tenant_id, active);

create trigger staff_set_updated_at
  before update on public.staff
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- staff_availability — two row kinds:
--   weekly: weekday 0..6 (0 = Sunday) + start/end, or is_off for that weekday
--   dated:  date (+ optional date_to) overrides the weekly rule: leave (is_off) or special hours
-- A staff member with no weekly rows follows the tenant working hours.
-- ---------------------------------------------------------------------------
create table public.staff_availability (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null default app.current_tenant_id() references public.tenants(id),
  staff_id    uuid not null,
  weekday     smallint check (weekday is null or weekday between 0 and 6),
  date        date,
  date_to     date,
  start_time  time,
  end_time    time,
  is_off      boolean not null default false,
  reason      text check (reason is null or length(reason) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  foreign key (staff_id, tenant_id) references public.staff (id, tenant_id) on delete cascade,
  constraint staff_availability_one_kind check ((weekday is null) <> (date is null)),
  constraint staff_availability_range check (date_to is null or (date is not null and date_to >= date)),
  constraint staff_availability_times check (
    (is_off and start_time is null and end_time is null)
    or (not is_off and start_time is not null and end_time is not null and end_time > start_time)
  )
);

create index staff_availability_weekly_idx on public.staff_availability (tenant_id, staff_id, weekday) where weekday is not null;
create index staff_availability_dated_idx on public.staff_availability (tenant_id, staff_id, date) where date is not null;

create trigger staff_availability_set_updated_at
  before update on public.staff_availability
  for each row execute function app.set_updated_at();

-- ---------------------------------------------------------------------------
-- assignments — a staff member booked for a time window. Created here so availability
-- can be proven against real rows; the bookings migration adds the booking_id foreign
-- key and the trigger that keeps starts_at/ends_at in step with the booking schedule.
-- ---------------------------------------------------------------------------
create table public.assignments (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null default app.current_tenant_id() references public.tenants(id),
  booking_id    uuid not null,
  staff_id      uuid not null,
  starts_at     timestamptz not null,
  ends_at       timestamptz not null,
  is_lead       boolean not null default false,
  assigned_by   uuid references auth.users(id) on delete set null,
  assigned_at   timestamptz not null default now(),
  cancelled_at  timestamptz,
  foreign key (staff_id, tenant_id) references public.staff (id, tenant_id),
  unique (booking_id, staff_id),
  check (ends_at > starts_at)
);

create index assignments_staff_window_idx on public.assignments (tenant_id, staff_id, starts_at) where cancelled_at is null;
create index assignments_booking_idx on public.assignments (booking_id);
