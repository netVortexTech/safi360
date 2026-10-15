-- 0027 · reminder queue: day-before service reminders and balance reminders.
-- queue_booking_reminders() inserts SMS rows for the caller's tenant; the
-- sender picks them up once a provider is connected. A partial unique index
-- keeps repeats idempotent while a row is still queued. Run it from pg_cron
-- (service role per tenant is out of scope) or the Reminders page button.

create unique index if not exists notifications_dedupe_idx
  on public.notifications (booking_id, template_key)
  where status = 'queued';

create or replace function public.queue_booking_reminders()
returns integer
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_count  integer := 0;
begin
  if v_tenant is null
     or coalesce(app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'), false) = false then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- Day-before: active bookings starting in the next 24–48h without a queued reminder.
  with candidates as (
    select b.id, b.locale, b.scheduled_start, b.ticket_ref, c.id as customer_id, c.name as customer_name
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.tenant_id = v_tenant
      and b.status in ('CONFIRMED', 'ASSIGNED')
      and b.scheduled_start > now() + make_interval(hours => 24)
      and b.scheduled_start <= now() + make_interval(hours => 48)
      and not exists (
        select 1 from public.notifications n
        where n.booking_id = b.id and n.template_key = 'booking_reminder' and n.status = 'queued'
      )
  ),
  inserted as (
    insert into public.notifications
      (tenant_id, booking_id, customer_id, channel, template_key, locale, variables, scheduled_for)
    select v_tenant, id, customer_id, 'SMS', 'booking_reminder', locale,
           jsonb_build_object('ticket_ref', ticket_ref, 'customer_name', customer_name,
                              'service_time', scheduled_start),
           scheduled_start - make_interval(hours => 24)
    from candidates
    on conflict do nothing
    returning 1
  )
  select count(*) into v_count from inserted;

  -- Balance: collectable bookings whose service time has passed, one queued nudge each.
  with candidates as (
    select b.id, b.locale, b.total_tzs - b.paid_tzs as balance, b.ticket_ref,
           c.id as customer_id, c.name as customer_name
    from public.bookings b
    join public.customers c on c.id = b.customer_id
    where b.tenant_id = v_tenant
      and b.status in ('CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED')
      and b.scheduled_start is not null
      and b.scheduled_start <= now()
      and b.total_tzs - b.paid_tzs > 0
      and not exists (
        select 1 from public.notifications n
        where n.booking_id = b.id and n.template_key = 'balance_reminder' and n.status = 'queued'
      )
  ),
  inserted as (
    insert into public.notifications
      (tenant_id, booking_id, customer_id, channel, template_key, locale, variables, scheduled_for)
    select v_tenant, id, customer_id, 'SMS', 'balance_reminder', locale,
           jsonb_build_object('ticket_ref', ticket_ref, 'customer_name', customer_name,
                              'balance_tzs', balance),
           now()
    from candidates
    on conflict do nothing
    returning 1
  )
  select v_count + count(*) into v_count from inserted;

  return v_count;
end;
$$;

revoke all on function public.queue_booking_reminders() from public, anon;
grant execute on function public.queue_booking_reminders() to authenticated, service_role;
