-- 0026 · customer feedback: comments and complaints per booking.
-- Customers never touch tables directly: the portal submits through the
-- customer_action Edge Function (verified phone token, service role insert).
-- The ops reviews inbox reads and resolves rows; the response is mirrored to
-- the tracking timeline so the customer sees the outcome.

create table if not exists public.booking_feedback (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants(id),
  booking_id       uuid not null references public.bookings(id) on delete cascade,
  customer_id      uuid references public.customers(id) on delete set null,
  kind             text not null check (kind in ('COMMENT', 'COMPLAINT')),
  rating           smallint null check (rating between 1 and 5),
  body             text not null check (char_length(body) between 2 and 2000),
  status           text not null default 'OPEN'
                   check (status in ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'DISMISSED')),
  response         text null check (response is null or char_length(response) between 2 and 2000),
  responded_by     uuid null,
  responded_at     timestamptz null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index booking_feedback_tenant_idx on public.booking_feedback (tenant_id, created_at desc);
create index booking_feedback_booking_idx on public.booking_feedback (booking_id, created_at desc);
create index booking_feedback_status_idx on public.booking_feedback (tenant_id, status, created_at desc);

create trigger booking_feedback_set_updated_at
  before update on public.booking_feedback
  for each row execute function app.set_updated_at();

alter table public.booking_feedback enable row level security;

revoke all on table public.booking_feedback from public, anon, authenticated;

grant select, update on public.booking_feedback to authenticated;

-- Office roles read everything and work the queue; inserts come only from the
-- service role (Edge Function after phone verification).
create policy feedback_select on public.booking_feedback
  for select to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id()
    and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')));

create policy feedback_update on public.booking_feedback
  for update to authenticated
  using (tenant_id = app.current_tenant_id()
    and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'))
  with check (tenant_id = app.current_tenant_id()
    and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'));
