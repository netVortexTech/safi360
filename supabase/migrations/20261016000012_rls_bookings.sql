-- 0012 · privileges and row level security for customers, quotes, bookings, events,
-- exceptions, payments and OTP codes.
--
-- Privileges carry the write rules, RLS carries tenant scope:
--   * bookings, booking_items and job_events cannot be inserted by ANY client role
--     (service_role included) — only the owner-executed functions in 0013 write them;
--   * bookings.status, schedule, totals and ticket_ref are not grantable to clients at all:
--     authenticated gets UPDATE on an explicit column list only;
--   * payments.status is never updated by a client role (apply_payment_result only);
--   * customer_otp_codes have no client grants (the Edge Functions use service_role);
--   * anon touches nothing here; the portal reads through public.portal_catalog().

revoke all on table
  public.customers,
  public.customer_addresses,
  public.customer_duplicates,
  public.quotes,
  public.quote_items,
  public.bookings,
  public.booking_items,
  public.job_events,
  public.exceptions,
  public.payments,
  public.customer_otp_codes
from anon, authenticated;

-- service_role keeps SELECT everywhere (Edge Functions read with it) but loses the writes
-- that must go through functions.
revoke insert, update, delete on table public.bookings, public.booking_items, public.job_events from service_role;
revoke update, delete on table public.payments from service_role;

alter table public.customers           enable row level security;
alter table public.customer_addresses  enable row level security;
alter table public.customer_duplicates enable row level security;
alter table public.quotes              enable row level security;
alter table public.quote_items         enable row level security;
alter table public.bookings            enable row level security;
alter table public.booking_items       enable row level security;
alter table public.job_events          enable row level security;
alter table public.exceptions          enable row level security;
alter table public.payments            enable row level security;
alter table public.customer_otp_codes  enable row level security;

-- ---- helpers --------------------------------------------------------------------------

-- True when the signed-in cleaner holds a live assignment on the booking.
create or replace function app.is_assigned_cleaner(p_booking_id uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.assignments a
    join public.staff s on s.id = a.staff_id and s.tenant_id = a.tenant_id
    where a.booking_id = p_booking_id
      and a.cancelled_at is null
      and s.user_id = app.current_user_id()
  );
$$;

grant execute on function app.is_assigned_cleaner(uuid) to authenticated, service_role;

-- ---- customers ------------------------------------------------------------------------
grant select, insert, update on public.customers, public.customer_addresses to authenticated;
grant select, update on public.customer_duplicates to authenticated;

create policy customers_select on public.customers
  for select to authenticated
  using (
    app.is_super_admin()
    or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'))
    or (
      tenant_id = app.current_tenant_id()
      and exists (
        select 1 from public.bookings b
        where b.customer_id = public.customers.id and app.is_assigned_cleaner(b.id)
      )
    )
  );
create policy customers_write on public.customers
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'));

create policy customer_addresses_select on public.customer_addresses
  for select to authenticated
  using (
    app.is_super_admin()
    or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'))
    or (
      tenant_id = app.current_tenant_id()
      and exists (
        select 1 from public.bookings b
        where b.address_id = public.customer_addresses.id and app.is_assigned_cleaner(b.id)
      )
    )
  );
create policy customer_addresses_write on public.customer_addresses
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'));

create policy customer_duplicates_select on public.customer_duplicates
  for select to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')));
create policy customer_duplicates_resolve on public.customer_duplicates
  for update to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'));

-- ---- quotes: office reads; revised quotes are written by staff in Phase 3 -------------
grant select, insert, update on public.quotes, public.quote_items to authenticated;

create policy quotes_select on public.quotes
  for select to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')));
create policy quotes_write on public.quotes
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'));

create policy quote_items_select on public.quote_items
  for select to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')));
create policy quote_items_write on public.quote_items
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'));

-- ---- bookings: office sees the tenant; a cleaner sees jobs they are assigned to ------
grant select on public.bookings, public.booking_items to authenticated;
grant update (notes_internal) on public.bookings to authenticated;

create policy bookings_select on public.bookings
  for select to authenticated
  using (
    app.is_super_admin()
    or (
      tenant_id = app.current_tenant_id()
      and (app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER') or app.is_assigned_cleaner(id))
    )
  );
create policy bookings_update_notes on public.bookings
  for update to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'));

create policy booking_items_select on public.booking_items
  for select to authenticated
  using (
    app.is_super_admin()
    or (
      tenant_id = app.current_tenant_id()
      and (app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER') or app.is_assigned_cleaner(booking_id))
    )
  );

-- ---- job_events: read within the tenant; written only by functions -------------------
grant select on public.job_events to authenticated;

create policy job_events_select on public.job_events
  for select to authenticated
  using (
    app.is_super_admin()
    or (
      tenant_id = app.current_tenant_id()
      and (app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER') or app.is_assigned_cleaner(booking_id))
    )
  );

-- ---- exceptions: office queue --------------------------------------------------------
grant select, update on public.exceptions to authenticated;

create policy exceptions_select on public.exceptions
  for select to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')));
create policy exceptions_resolve on public.exceptions
  for update to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'));

-- ---- payments: office reads; nobody but apply_payment_result() changes status --------
grant select on public.payments to authenticated;

create policy payments_select on public.payments
  for select to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')));

-- customer_otp_codes: no client policies, no client grants.
