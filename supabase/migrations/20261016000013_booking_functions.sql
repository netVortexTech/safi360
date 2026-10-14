-- 0013 · the booking write path.
--   app.is_service_role()      — fixed: decided from JWT claims, not from current_user
--   app.write_audit()          — gains p_actor so customer actions are attributed
--   app.booking_transitions    — the allowed-transition table (mirrors enums.ts)
--   app.assert_slot_capacity() — shared capacity check (create, reschedule, late confirm)
--   transition_booking()       — the ONLY way a booking changes status
--   create_booking_tx()        — one transaction: customer, quote, booking, ticket, event
--   reschedule_booking()       — schedule changes under the same lock + capacity check
--   expire_booking_holds()     — materialises EXPIRED for lapsed holds (cron + on demand)
--   apply_payment_result()     — the ONLY way a payment status changes
--   add_job_event(), open_exception() — small append helpers for the Edge Functions
--   portal_catalog()           — the anonymous read the customer portal boots from

-- ---------------------------------------------------------------------------
-- 1. Foundation fixes
-- ---------------------------------------------------------------------------

-- Inside a SECURITY DEFINER function current_user is the owner, so the 0001 version
-- answered "service role" for every caller. Claims decide; current_user only matters
-- when there are no claims at all (superuser sessions: tests, seed, cron).
create or replace function app.is_service_role()
returns boolean
language sql
stable
as $$
  select case
    when app.jwt_claims() = '{}'::jsonb then current_user in ('postgres', 'supabase_admin', 'service_role')
    else coalesce(app.jwt_claims() ->> 'role', '') = 'service_role'
  end;
$$;

drop function app.write_audit(uuid, text, text, uuid, jsonb);

create function app.write_audit(
  p_tenant_id uuid,
  p_action    text,
  p_entity    text default null,
  p_entity_id uuid default null,
  p_diff      jsonb default '{}'::jsonb,
  p_actor     text default null
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
    coalesce(
      p_actor,
      case
        when app.is_super_admin() then 'super_admin'
        when app.is_service_role() then 'service_role'
        else app.current_tenant_role()
      end
    ),
    p_action, p_entity, p_entity_id, coalesce(p_diff, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function app.write_audit(uuid, text, text, uuid, jsonb, text) from public, anon, authenticated;
grant execute on function app.write_audit(uuid, text, text, uuid, jsonb, text) to service_role;

-- Integer setting with a default (tenant settings are validated jsonb, keys may be absent).
create or replace function app.setting_int(p_settings jsonb, p_key text, p_default integer)
returns integer
language sql
immutable
as $$
  select coalesce((p_settings ->> p_key)::integer, p_default);
$$;

revoke all on function app.setting_int(jsonb, text, integer) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Allowed transitions (source of truth shared with _shared/enums.ts; the db test
--    suite asserts parity). Roles: tenant roles, CUSTOMER (through a verified portal
--    token) and SYSTEM (routing, payments, hold expiry).
-- ---------------------------------------------------------------------------
create table app.booking_transitions (
  from_status  public.booking_status not null,
  to_status    public.booking_status not null,
  roles        text[] not null,
  primary key (from_status, to_status)
);

revoke all on table app.booking_transitions from anon, authenticated;
grant select on table app.booking_transitions to service_role;

insert into app.booking_transitions (from_status, to_status, roles) values
  ('REQUEST_RECEIVED',           'AWAITING_REVIEW',            '{SYSTEM,OWNER,MANAGER,DISPATCHER}'),
  ('REQUEST_RECEIVED',           'AWAITING_PAYMENT',           '{SYSTEM,OWNER,MANAGER,DISPATCHER}'),
  ('REQUEST_RECEIVED',           'CONFIRMED',                  '{SYSTEM,OWNER,MANAGER,DISPATCHER}'),
  ('REQUEST_RECEIVED',           'CANCELLED',                  '{SYSTEM,OWNER,MANAGER,DISPATCHER,CUSTOMER}'),
  ('AWAITING_REVIEW',            'AWAITING_CUSTOMER_APPROVAL', '{OWNER,MANAGER,DISPATCHER}'),
  ('AWAITING_REVIEW',            'AWAITING_PAYMENT',           '{OWNER,MANAGER,DISPATCHER}'),
  ('AWAITING_REVIEW',            'CONFIRMED',                  '{OWNER,MANAGER,DISPATCHER}'),
  ('AWAITING_REVIEW',            'CANCELLED',                  '{OWNER,MANAGER,DISPATCHER,CUSTOMER}'),
  ('AWAITING_CUSTOMER_APPROVAL', 'AWAITING_PAYMENT',           '{CUSTOMER,OWNER,MANAGER,DISPATCHER}'),
  ('AWAITING_CUSTOMER_APPROVAL', 'CONFIRMED',                  '{CUSTOMER,OWNER,MANAGER,DISPATCHER}'),
  ('AWAITING_CUSTOMER_APPROVAL', 'QUOTE_REJECTED',             '{CUSTOMER,OWNER,MANAGER,DISPATCHER}'),
  ('AWAITING_CUSTOMER_APPROVAL', 'EXPIRED',                    '{SYSTEM}'),
  ('AWAITING_CUSTOMER_APPROVAL', 'CANCELLED',                  '{CUSTOMER,OWNER,MANAGER,DISPATCHER}'),
  ('AWAITING_PAYMENT',           'CONFIRMED',                  '{SYSTEM,OWNER,MANAGER}'),
  ('AWAITING_PAYMENT',           'EXPIRED',                    '{SYSTEM}'),
  ('AWAITING_PAYMENT',           'CANCELLED',                  '{CUSTOMER,OWNER,MANAGER,DISPATCHER}'),
  ('CONFIRMED',                  'ASSIGNED',                   '{OWNER,MANAGER,DISPATCHER}'),
  ('CONFIRMED',                  'CANCELLED',                  '{CUSTOMER,OWNER,MANAGER,DISPATCHER}'),
  ('CONFIRMED',                  'NO_SHOW',                    '{OWNER,MANAGER,DISPATCHER}'),
  ('ASSIGNED',                   'EN_ROUTE',                   '{CLEANER,OWNER,MANAGER,DISPATCHER}'),
  ('ASSIGNED',                   'CONFIRMED',                  '{OWNER,MANAGER,DISPATCHER}'),
  ('ASSIGNED',                   'CANCELLED',                  '{CUSTOMER,OWNER,MANAGER,DISPATCHER}'),
  ('ASSIGNED',                   'NO_SHOW',                    '{CLEANER,OWNER,MANAGER,DISPATCHER}'),
  ('EN_ROUTE',                   'ARRIVED',                    '{CLEANER,OWNER,MANAGER,DISPATCHER}'),
  ('EN_ROUTE',                   'NO_SHOW',                    '{CLEANER,OWNER,MANAGER,DISPATCHER}'),
  ('ARRIVED',                    'IN_PROGRESS',                '{CLEANER,OWNER,MANAGER,DISPATCHER}'),
  ('ARRIVED',                    'NO_SHOW',                    '{CLEANER,OWNER,MANAGER,DISPATCHER}'),
  ('IN_PROGRESS',                'COMPLETED',                  '{CLEANER,OWNER,MANAGER,DISPATCHER}'),
  ('COMPLETED',                  'CLOSED',                     '{SYSTEM,OWNER,MANAGER,DISPATCHER}');

-- ---------------------------------------------------------------------------
-- 3. Capacity check. "Reserved crew" = crew the booking still needs that no assignment
--    covers (assigned staff are already busy in the availability engine, so counting them
--    here too would double-book nothing but under-sell slots). Overlap is padded by the
--    tenant travel buffer on both sides, exactly like _shared/availability/slots.ts.
--    Holds that lapsed no longer reserve anything, whatever cron has or has not done.
-- ---------------------------------------------------------------------------
create or replace function app.reserved_crew(
  p_tenant_id uuid,
  p_start     timestamptz,
  p_end       timestamptz,
  p_exclude   uuid default null
)
returns integer
language plpgsql
stable
as $$
declare
  v_buffer   interval;
  v_reserved integer;
begin
  select make_interval(mins => app.setting_int(settings, 'travel_buffer_min', 45))
  into v_buffer
  from public.tenants where id = p_tenant_id;

  select coalesce(sum(greatest(
           b.crew_size - (select count(*) from public.assignments a where a.booking_id = b.id and a.cancelled_at is null),
           0)), 0)::integer
  into v_reserved
  from public.bookings b
  where b.tenant_id = p_tenant_id
    and (p_exclude is null or b.id <> p_exclude)
    and b.scheduled_start is not null
    and b.scheduled_start - coalesce(v_buffer, interval '0') < p_end
    and b.scheduled_end + coalesce(v_buffer, interval '0') > p_start
    and (
      b.status in ('CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS')
      or (
        b.status in ('REQUEST_RECEIVED', 'AWAITING_REVIEW', 'AWAITING_CUSTOMER_APPROVAL', 'AWAITING_PAYMENT')
        and (b.hold_expires_at is null or b.hold_expires_at > now())
      )
    );
  return v_reserved;
end;
$$;

create or replace function app.assert_slot_capacity(
  p_tenant_id uuid,
  p_start     timestamptz,
  p_end       timestamptz,
  p_crew      integer,
  p_capacity  integer,
  p_exclude   uuid default null
)
returns void
language plpgsql
as $$
declare
  v_reserved integer;
begin
  if p_start is null or p_end is null then
    return;
  end if;
  v_reserved := app.reserved_crew(p_tenant_id, p_start, p_end, p_exclude);
  if v_reserved + p_crew > coalesce(p_capacity, 0) then
    raise exception 'slot_unavailable' using errcode = 'P0001',
      detail = format('reserved=%s crew=%s capacity=%s', v_reserved, p_crew, p_capacity);
  end if;
end;
$$;

-- Fallback capacity when a caller cannot compute staff availability (late payment
-- confirmation from a webhook): active staff who can do every service on the booking.
create or replace function app.qualified_staff_count(p_booking_id uuid)
returns integer
language sql
stable
as $$
  select count(*)::integer
  from public.staff s
  join public.bookings b on b.tenant_id = s.tenant_id
  where b.id = p_booking_id
    and s.active
    and s.skills @> coalesce(
      (select array_agg(distinct bi.service_id) from public.booking_items bi
       where bi.booking_id = b.id and bi.service_id is not null),
      '{}'::uuid[]
    );
$$;

revoke all on function app.reserved_crew(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
revoke all on function app.assert_slot_capacity(uuid, timestamptz, timestamptz, integer, integer, uuid) from public, anon, authenticated;
revoke all on function app.qualified_staff_count(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Event + exception helpers (also exposed to Edge Functions / office roles).
-- ---------------------------------------------------------------------------
create or replace function app.actor_of(p_meta jsonb)
returns table (actor_kind text, actor_label text, actor_role text, actor_user_id uuid)
language plpgsql
stable
as $$
declare
  v_actor text;
begin
  if app.is_service_role() then
    v_actor := coalesce(p_meta ->> 'actor', 'system');
    if v_actor like 'customer:%' then
      return query select 'customer'::text, v_actor, 'CUSTOMER'::text, null::uuid;
    elsif v_actor like 'staff:%' then
      -- Edge Functions acting for a signed-in staff member pass actor "staff:<uuid>" + actor_role.
      return query select 'staff'::text, v_actor, coalesce(p_meta ->> 'actor_role', 'DISPATCHER'),
                          nullif(split_part(v_actor, ':', 2), '')::uuid;
    else
      return query select 'system'::text, v_actor, 'SYSTEM'::text, null::uuid;
    end if;
  else
    return query select 'staff'::text, 'user:' || coalesce(app.current_user_id()::text, '?'),
                        coalesce(app.current_tenant_role(), ''), app.current_user_id();
  end if;
end;
$$;

revoke all on function app.actor_of(jsonb) from public, anon, authenticated;

create or replace function public.add_job_event(
  p_booking_id       uuid,
  p_kind             text,
  p_customer_visible boolean default false,
  p_message_key      text default null,
  p_data             jsonb default '{}'::jsonb,
  p_meta             jsonb default '{}'::jsonb
)
returns bigint
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  b    public.bookings%rowtype;
  act  record;
  v_id bigint;
begin
  select * into b from public.bookings
  where id = p_booking_id and (app.is_service_role() or tenant_id = app.current_tenant_id());
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  select * into act from app.actor_of(p_meta);
  if act.actor_role not in ('SYSTEM', 'CUSTOMER', 'OWNER', 'MANAGER', 'DISPATCHER')
     and not (act.actor_role = 'CLEANER' and app.is_assigned_cleaner(b.id)) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_kind not in ('note', 'customer_action', 'payment', 'assignment', 'reschedule_requested') then
    raise exception 'event_kind_not_allowed' using errcode = '22023';
  end if;
  insert into public.job_events (tenant_id, booking_id, kind, actor_kind, actor_user_id, actor_label,
                                 customer_visible, message_key, data)
  values (b.tenant_id, b.id, p_kind, act.actor_kind, act.actor_user_id, act.actor_label,
          p_customer_visible, p_message_key, coalesce(p_data, '{}'::jsonb))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.open_exception(
  p_booking_id uuid,
  p_kind       text,
  p_details    jsonb default '{}'::jsonb,
  p_severity   text default 'normal',
  p_meta       jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  b    public.bookings%rowtype;
  act  record;
  v_id uuid;
begin
  select * into b from public.bookings
  where id = p_booking_id and (app.is_service_role() or tenant_id = app.current_tenant_id());
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  select * into act from app.actor_of(p_meta);
  if act.actor_role not in ('SYSTEM', 'CUSTOMER', 'OWNER', 'MANAGER', 'DISPATCHER') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- One open exception per (booking, kind).
  select id into v_id from public.exceptions
  where booking_id = b.id and kind = p_kind and status = 'OPEN';
  if v_id is not null then
    update public.exceptions set details = details || coalesce(p_details, '{}'::jsonb) where id = v_id;
    return v_id;
  end if;
  insert into public.exceptions (tenant_id, booking_id, kind, severity, details)
  values (b.tenant_id, b.id, p_kind, coalesce(p_severity, 'normal'), coalesce(p_details, '{}'::jsonb))
  returning id into v_id;
  perform app.write_audit(b.tenant_id, 'exception.opened', 'booking', b.id,
                          jsonb_build_object('kind', p_kind), act.actor_label);
  return v_id;
end;
$$;

revoke all on function public.add_job_event(uuid, text, boolean, text, jsonb, jsonb) from public, anon;
grant execute on function public.add_job_event(uuid, text, boolean, text, jsonb, jsonb) to authenticated, service_role;
revoke all on function public.open_exception(uuid, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.open_exception(uuid, text, jsonb, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. transition_booking — the single status write path.
--    p_meta: {"actor": "customer:+2557…" | "system:<job>" | "staff:<uuid>",
--             "actor_role": "<tenant role when actor is staff:>",
--             "capacity": <free qualified staff, for late confirmations>,
--             "customer_visible": bool (default true), "message_key": "...", "data": {...}}
-- ---------------------------------------------------------------------------
create or replace function public.transition_booking(
  p_booking_id uuid,
  p_to         public.booking_status,
  p_reason     text default null,
  p_meta       jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  b          public.bookings%rowtype;
  act        record;
  v_allowed  text[];
  v_settings jsonb;
  v_hold     timestamptz;
  v_flags    text[];
  v_capacity integer;
  v_terminal boolean;
  v_now      timestamptz := now();
begin
  select * into act from app.actor_of(p_meta);

  select * into b from public.bookings
  where id = p_booking_id and (app.is_service_role() or tenant_id = app.current_tenant_id())
  for update;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;

  -- Replays (a webhook delivered twice) are harmless.
  if b.status = p_to then
    return jsonb_build_object('booking_id', b.id, 'status', b.status, 'changed', false);
  end if;

  select roles into v_allowed from app.booking_transitions
  where from_status = b.status and to_status = p_to;
  if v_allowed is null then
    raise exception 'transition_not_allowed' using errcode = 'P0001',
      detail = format('%s -> %s', b.status, p_to);
  end if;
  if not (act.actor_role = any (v_allowed)) then
    raise exception 'transition_forbidden' using errcode = '42501',
      detail = format('%s may not move %s -> %s', act.actor_role, b.status, p_to);
  end if;
  if act.actor_role = 'CLEANER' and not app.is_assigned_cleaner(b.id) then
    raise exception 'transition_forbidden' using errcode = '42501', detail = 'not assigned to this booking';
  end if;

  v_terminal := p_to in ('CANCELLED', 'QUOTE_REJECTED', 'NO_SHOW', 'EXPIRED');
  if v_terminal and nullif(trim(coalesce(p_reason, '')), '') is null then
    raise exception 'reason_required' using errcode = 'P0001';
  end if;

  select settings into v_settings from public.tenants where id = b.tenant_id;
  v_flags := b.flags;

  -- A payment that lands after the hold lapsed must not overbook: re-check and flag.
  if b.status = 'AWAITING_PAYMENT' and p_to = 'CONFIRMED'
     and b.hold_expires_at is not null and b.hold_expires_at <= v_now
     and b.scheduled_start is not null then
    v_capacity := coalesce((p_meta ->> 'capacity')::integer, app.qualified_staff_count(b.id));
    if app.reserved_crew(b.tenant_id, b.scheduled_start, b.scheduled_end, b.id) + b.crew_size > v_capacity then
      v_flags := array(select distinct unnest(v_flags || '{NEEDS_REVIEW}'::text[]));
      insert into public.exceptions (tenant_id, booking_id, kind, severity, details)
      values (b.tenant_id, b.id, 'SLOT_CONFLICT', 'high',
              jsonb_build_object('reason', 'paid_after_hold_expired', 'scheduled_start', b.scheduled_start));
    end if;
  end if;

  v_hold := case p_to
    when 'AWAITING_PAYMENT' then v_now + make_interval(mins => app.setting_int(v_settings, 'slot_hold_minutes', 15))
    when 'AWAITING_REVIEW' then v_now + make_interval(hours => app.setting_int(v_settings, 'quote_expiry_hours', 144))
    when 'AWAITING_CUSTOMER_APPROVAL' then v_now + make_interval(hours => app.setting_int(v_settings, 'quote_expiry_hours', 144))
    else null
  end;

  update public.bookings set
    status          = p_to,
    flags           = v_flags,
    hold_expires_at = v_hold,
    outcome_reason  = case when v_terminal then p_reason else outcome_reason end,
    confirmed_at    = case when p_to = 'CONFIRMED' and confirmed_at is null then v_now else confirmed_at end,
    completed_at    = case when p_to = 'COMPLETED' then v_now else completed_at end,
    closed_at       = case when p_to = 'CLOSED' then v_now else closed_at end,
    cancelled_at    = case when v_terminal then v_now else cancelled_at end
  where id = b.id;

  if v_terminal then
    update public.assignments set cancelled_at = v_now
    where booking_id = b.id and cancelled_at is null;
    update public.quotes set status = case when p_to = 'QUOTE_REJECTED' then 'REJECTED' when p_to = 'EXPIRED' then 'EXPIRED' else status end,
                            decided_at = coalesce(decided_at, v_now)
    where id = b.quote_id and p_to in ('QUOTE_REJECTED', 'EXPIRED');
  elsif p_to in ('AWAITING_PAYMENT', 'CONFIRMED') and b.status = 'AWAITING_CUSTOMER_APPROVAL' then
    update public.quotes set status = 'APPROVED', decided_at = v_now where id = b.quote_id;
  elsif p_to = 'AWAITING_CUSTOMER_APPROVAL' then
    update public.quotes set status = 'SENT', sent_at = coalesce(sent_at, v_now) where id = b.quote_id;
  end if;

  insert into public.job_events (tenant_id, booking_id, kind, from_status, to_status, actor_kind, actor_user_id,
                                 actor_label, customer_visible, message_key, data)
  values (b.tenant_id, b.id, 'status_changed', b.status, p_to, act.actor_kind, act.actor_user_id, act.actor_label,
          coalesce((p_meta ->> 'customer_visible')::boolean, true),
          coalesce(p_meta ->> 'message_key', 'status.' || p_to::text),
          coalesce(p_meta -> 'data', '{}'::jsonb) || case when p_reason is null then '{}'::jsonb else jsonb_build_object('reason', p_reason) end);

  perform app.write_audit(b.tenant_id, 'booking.transition', 'booking', b.id,
                          jsonb_build_object('from', b.status, 'to', p_to, 'reason', p_reason), act.actor_label);

  return jsonb_build_object('booking_id', b.id, 'status', p_to, 'changed', true, 'hold_expires_at', v_hold,
                            'flags', to_jsonb(v_flags));
end;
$$;

revoke all on function public.transition_booking(uuid, public.booking_status, text, jsonb) from public, anon;
grant execute on function public.transition_booking(uuid, public.booking_status, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. create_booking_tx — the one write path for new bookings. Service role only; the
--    Edge Function has already validated input, re-priced the items and computed the
--    slot capacity. Payload (jsonb):
--    { tenant_id, idempotency_key, source, locale, created_by?, booking_id?,
--      customer: {phone_e164, name, email?, phone_verified: bool},
--      address: {label?, region?, district?, ward?, street?, landmark?, area?, lat?, lng?, zone_id?} | null,
--      quote: <QuoteResult>, items: [{service_id, label_sw, label_en, input, qty, amount_tzs, requires_review}],
--      schedule: {start, end, capacity} | null, payment_mode: 'DEPOSIT'|'ON_COMPLETION',
--      notes_customer? }
-- ---------------------------------------------------------------------------
create or replace function public.create_booking_tx(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_tenant      uuid := (p ->> 'tenant_id')::uuid;
  v_key         text := p ->> 'idempotency_key';
  v_hash        text;
  v_existing    public.bookings%rowtype;
  v_customer_id uuid;
  v_name        text;
  v_phone       text;
  v_dup         uuid;
  v_address_id  uuid;
  v_quote_id    uuid;
  v_booking_id  uuid := coalesce((p ->> 'booking_id')::uuid, gen_random_uuid());
  v_q           jsonb := coalesce(p -> 'quote', '{}'::jsonb);
  v_sched       jsonb := p -> 'schedule';
  v_start       timestamptz;
  v_end         timestamptz;
  v_crew        integer;
  v_duration    integer;
  v_requires    boolean;
  v_deposit     integer;
  v_total       integer;
  v_mode        text := coalesce(p ->> 'payment_mode', 'ON_COMPLETION');
  v_target      public.booking_status;
  v_ticket      text;
  v_settings    jsonb;
  v_created_by  uuid := nullif(p ->> 'created_by', '')::uuid;
  v_source      public.booking_source := coalesce((p ->> 'source')::public.booking_source, 'website');
  v_item        jsonb;
  v_i           integer := 0;
  v_result      jsonb;
begin
  if v_tenant is null then
    raise exception 'tenant_required' using errcode = '22023';
  end if;
  if not app.is_service_role() then
    raise exception 'permission denied for create_booking_tx' using errcode = '42501';
  end if;

  -- One create at a time per tenant: the idempotency pre-select, the capacity check and
  -- the counter all happen under this lock (READ COMMITTED: each statement sees commits).
  perform pg_advisory_xact_lock(hashtext('booking'), hashtext(v_tenant::text));

  select settings into v_settings from public.tenants where id = v_tenant and deleted_at is null;
  if v_settings is null then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;

  v_hash := md5((p - 'idempotency_key' - 'booking_id')::text);
  if v_key is not null then
    select * into v_existing from public.bookings where tenant_id = v_tenant and idempotency_key = v_key;
    if found then
      if v_existing.request_hash is distinct from v_hash then
        raise exception 'idempotency_mismatch' using errcode = 'P0001';
      end if;
      return jsonb_build_object('booking_id', v_existing.id, 'ticket_ref', v_existing.ticket_ref,
                                'status', v_existing.status, 'created', false,
                                'hold_expires_at', v_existing.hold_expires_at);
    end if;
  end if;

  -- Customer: find-or-create by verified phone.
  v_phone := p -> 'customer' ->> 'phone_e164';
  v_name  := trim(regexp_replace(coalesce(p -> 'customer' ->> 'name', ''), '\s+', ' ', 'g'));
  if v_phone is null or v_name = '' then
    raise exception 'customer_required' using errcode = '22023';
  end if;
  insert into public.customers (tenant_id, phone_e164, name, email, locale, phone_verified_at, first_source)
  values (v_tenant, v_phone, v_name, nullif(p -> 'customer' ->> 'email', ''),
          coalesce(p ->> 'locale', 'sw'),
          case when coalesce((p -> 'customer' ->> 'phone_verified')::boolean, false) then now() end,
          v_source)
  on conflict (tenant_id, phone_e164) do update
    set phone_verified_at = coalesce(public.customers.phone_verified_at, excluded.phone_verified_at),
        name  = case when public.customers.name = '' then excluded.name else public.customers.name end,
        email = coalesce(public.customers.email, excluded.email),
        deleted_at = null
  returning id into v_customer_id;

  -- Same name on another phone: flag, never merge.
  select c.id into v_dup from public.customers c
  where c.tenant_id = v_tenant and c.id <> v_customer_id and c.deleted_at is null
    and lower(c.name) = lower(v_name)
  order by c.created_at limit 1;
  if v_dup is not null then
    insert into public.customer_duplicates (tenant_id, customer_id, duplicate_of_id, reason)
    values (v_tenant, v_customer_id, v_dup, 'same_name')
    on conflict (tenant_id, customer_id, duplicate_of_id) do nothing;
  end if;

  -- Address (optional for review-only requests).
  if p -> 'address' is not null and jsonb_typeof(p -> 'address') = 'object' then
    insert into public.customer_addresses (tenant_id, customer_id, label, region, district, ward, street, landmark,
                                           area, lat, lng, zone_id, is_default)
    values (v_tenant, v_customer_id,
            nullif(p -> 'address' ->> 'label', ''), nullif(p -> 'address' ->> 'region', ''),
            nullif(p -> 'address' ->> 'district', ''), nullif(p -> 'address' ->> 'ward', ''),
            nullif(p -> 'address' ->> 'street', ''), nullif(p -> 'address' ->> 'landmark', ''),
            nullif(p -> 'address' ->> 'area', ''),
            (p -> 'address' ->> 'lat')::double precision, (p -> 'address' ->> 'lng')::double precision,
            nullif(p -> 'address' ->> 'zone_id', '')::uuid,
            not exists (select 1 from public.customer_addresses a where a.customer_id = v_customer_id))
    returning id into v_address_id;
  end if;

  -- Quote snapshot.
  v_requires := coalesce((v_q ->> 'requires_review')::boolean, false);
  v_total    := coalesce((v_q ->> 'total_tzs')::integer, 0);
  v_deposit  := coalesce((v_q ->> 'deposit_tzs')::integer, 0);
  v_crew     := greatest(coalesce((v_q ->> 'crew_size')::integer, 1), 1);
  v_duration := greatest(coalesce((v_q ->> 'est_duration_min')::integer, 60), 1);

  insert into public.quotes (tenant_id, customer_id, status, snapshot, subtotal_tzs, travel_fee_tzs, discount_tzs,
                             tax_tzs, total_tzs, deposit_tzs, requires_review, has_estimate, expires_at, created_by)
  values (v_tenant, v_customer_id, case when v_requires then 'DRAFT' else 'APPROVED' end, v_q,
          coalesce((v_q ->> 'subtotal_tzs')::integer, 0), coalesce((v_q ->> 'travel_fee_tzs')::integer, 0),
          coalesce((v_q ->> 'discount_tzs')::integer, 0), coalesce((v_q ->> 'tax_tzs')::integer, 0),
          v_total, v_deposit, v_requires, coalesce((v_q ->> 'has_estimate')::boolean, false),
          (v_q ->> 'expires_at')::timestamptz, v_created_by)
  returning id into v_quote_id;

  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    insert into public.quote_items (tenant_id, quote_id, item_index, service_id, label_sw, label_en, input, qty,
                                    amount_tzs, requires_review)
    values (v_tenant, v_quote_id, v_i, nullif(v_item ->> 'service_id', '')::uuid,
            coalesce(v_item ->> 'label_sw', ''), coalesce(v_item ->> 'label_en', ''),
            coalesce(v_item -> 'input', '{}'::jsonb), greatest(coalesce((v_item ->> 'qty')::integer, 1), 1),
            (v_item ->> 'amount_tzs')::integer, coalesce((v_item ->> 'requires_review')::boolean, false));
    v_i := v_i + 1;
  end loop;

  -- Schedule + capacity (bookings on review may arrive without a slot).
  if v_sched is not null and jsonb_typeof(v_sched) = 'object' and v_sched ->> 'start' is not null then
    v_start := (v_sched ->> 'start')::timestamptz;
    v_end   := coalesce((v_sched ->> 'end')::timestamptz, v_start + make_interval(mins => v_duration));
    perform app.assert_slot_capacity(v_tenant, v_start, v_end, v_crew, (v_sched ->> 'capacity')::integer);
  end if;

  v_ticket := app.next_ticket_ref(v_tenant);

  insert into public.bookings (id, tenant_id, ticket_ref, customer_id, address_id, address_snapshot, status, source,
                               quote_id, scheduled_start, scheduled_end, duration_min, crew_size, payment_mode,
                               total_tzs, deposit_tzs, zone_id, locale, notes_customer, idempotency_key,
                               request_hash, created_by)
  values (v_booking_id, v_tenant, v_ticket, v_customer_id, v_address_id, coalesce(p -> 'address', '{}'::jsonb),
          'REQUEST_RECEIVED', v_source, v_quote_id, v_start, v_end, v_duration, v_crew,
          case when v_mode = 'DEPOSIT' then 'DEPOSIT' else 'ON_COMPLETION' end,
          v_total, v_deposit, nullif(v_q -> 'zone' ->> 'zone_id', '')::uuid, coalesce(p ->> 'locale', 'sw'),
          nullif(p ->> 'notes_customer', ''), v_key, v_hash, v_created_by);

  v_i := 0;
  for v_item in select * from jsonb_array_elements(coalesce(p -> 'items', '[]'::jsonb)) loop
    insert into public.booking_items (tenant_id, booking_id, item_index, service_id, label_sw, label_en, input, qty,
                                      amount_tzs, requires_review)
    values (v_tenant, v_booking_id, v_i, nullif(v_item ->> 'service_id', '')::uuid,
            coalesce(v_item ->> 'label_sw', ''), coalesce(v_item ->> 'label_en', ''),
            coalesce(v_item -> 'input', '{}'::jsonb), greatest(coalesce((v_item ->> 'qty')::integer, 1), 1),
            (v_item ->> 'amount_tzs')::integer, coalesce((v_item ->> 'requires_review')::boolean, false));
    v_i := v_i + 1;
  end loop;

  insert into public.job_events (tenant_id, booking_id, kind, to_status, actor_kind, actor_user_id, actor_label,
                                 customer_visible, message_key, data)
  values (v_tenant, v_booking_id, 'created', 'REQUEST_RECEIVED',
          case when v_created_by is null then 'customer' else 'staff' end, v_created_by,
          case when v_created_by is null then 'customer:' || v_phone else 'user:' || v_created_by::text end,
          true, 'event.created', jsonb_build_object('source', v_source, 'ticket_ref', v_ticket));

  -- Routing: review beats everything; a deposit holds the slot until paid; else confirmed.
  v_target := case
    when v_requires then 'AWAITING_REVIEW'::public.booking_status
    when v_mode = 'DEPOSIT' and v_deposit > 0 then 'AWAITING_PAYMENT'::public.booking_status
    else 'CONFIRMED'::public.booking_status
  end;

  v_result := public.transition_booking(v_booking_id, v_target, null,
                jsonb_build_object('actor', 'system:create_booking', 'customer_visible', true));

  if v_requires then
    insert into public.exceptions (tenant_id, booking_id, kind, severity, details)
    values (v_tenant, v_booking_id, 'NEEDS_REVIEW', 'normal', jsonb_build_object('reason', 'quote_on_inspection'));
  end if;

  return jsonb_build_object('booking_id', v_booking_id, 'ticket_ref', v_ticket, 'status', v_target,
                            'created', true, 'hold_expires_at', v_result -> 'hold_expires_at',
                            'customer_id', v_customer_id, 'quote_id', v_quote_id);
end;
$$;

revoke all on function public.create_booking_tx(jsonb) from public, anon, authenticated;
grant execute on function public.create_booking_tx(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 7. reschedule_booking — schedule columns are never updated directly.
-- ---------------------------------------------------------------------------
create or replace function public.reschedule_booking(
  p_booking_id uuid,
  p_start      timestamptz,
  p_end        timestamptz,
  p_capacity   integer,
  p_reason     text default null,
  p_meta       jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  b   public.bookings%rowtype;
  act record;
begin
  select * into act from app.actor_of(p_meta);
  if act.actor_role not in ('SYSTEM', 'OWNER', 'MANAGER', 'DISPATCHER') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into b from public.bookings
  where id = p_booking_id and (app.is_service_role() or tenant_id = app.current_tenant_id())
  for update;
  if not found then
    raise exception 'booking_not_found' using errcode = 'P0002';
  end if;
  if b.status in ('COMPLETED', 'CLOSED', 'CANCELLED', 'QUOTE_REJECTED', 'NO_SHOW', 'EXPIRED', 'IN_PROGRESS') then
    raise exception 'transition_not_allowed' using errcode = 'P0001', detail = 'booking cannot be rescheduled';
  end if;
  if p_end <= p_start then
    raise exception 'schedule_invalid' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('booking'), hashtext(b.tenant_id::text));
  perform app.assert_slot_capacity(b.tenant_id, p_start, p_end, b.crew_size, p_capacity, b.id);

  update public.bookings
  set scheduled_start = p_start, scheduled_end = p_end,
      flags = array(select distinct unnest(flags || '{RESCHEDULED}'::text[]))
  where id = b.id;
  update public.assignments set starts_at = p_start, ends_at = p_end
  where booking_id = b.id and cancelled_at is null;
  update public.exceptions set status = 'RESOLVED', resolved_at = now(), resolved_by = act.actor_user_id
  where booking_id = b.id and kind = 'RESCHEDULE_REQUESTED' and status = 'OPEN';

  insert into public.job_events (tenant_id, booking_id, kind, actor_kind, actor_user_id, actor_label,
                                 customer_visible, message_key, data)
  values (b.tenant_id, b.id, 'rescheduled', act.actor_kind, act.actor_user_id, act.actor_label, true,
          'event.rescheduled', jsonb_build_object('from', b.scheduled_start, 'to', p_start, 'reason', p_reason));
  perform app.write_audit(b.tenant_id, 'booking.rescheduled', 'booking', b.id,
                          jsonb_build_object('from', b.scheduled_start, 'to', p_start), act.actor_label);
  return jsonb_build_object('booking_id', b.id, 'scheduled_start', p_start, 'scheduled_end', p_end);
end;
$$;

revoke all on function public.reschedule_booking(uuid, timestamptz, timestamptz, integer, text, jsonb) from public, anon;
grant execute on function public.reschedule_booking(uuid, timestamptz, timestamptz, integer, text, jsonb) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. expire_booking_holds — lapsed payment holds and unanswered quotes become EXPIRED.
--    Reviews keep their status (the slot is simply no longer reserved).
-- ---------------------------------------------------------------------------
create or replace function public.expire_booking_holds(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  r       record;
  v_count integer := 0;
begin
  if not app.is_service_role() then
    raise exception 'permission denied for expire_booking_holds' using errcode = '42501';
  end if;
  for r in
    select id, status from public.bookings
    where status in ('AWAITING_PAYMENT', 'AWAITING_CUSTOMER_APPROVAL')
      and hold_expires_at is not null and hold_expires_at <= now()
    order by hold_expires_at
    limit greatest(coalesce(p_limit, 200), 1)
    for update skip locked
  loop
    perform public.transition_booking(r.id, 'EXPIRED',
      case when r.status = 'AWAITING_PAYMENT' then 'payment_hold_expired' else 'quote_expired' end,
      jsonb_build_object('actor', 'system:expire_holds', 'message_key', 'event.hold_expired'));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.expire_booking_holds(integer) from public, anon, authenticated;
grant execute on function public.expire_booking_holds(integer) to service_role;

-- ---------------------------------------------------------------------------
-- 9. apply_payment_result — the only status write on payments. Reached from verified
--    provider callbacks, polling or reconciliation (service role), never from a client.
-- ---------------------------------------------------------------------------
create or replace function public.apply_payment_result(
  p_payment_id   uuid,
  p_status       public.payment_status,
  p_provider_ref text default null,
  p_raw          jsonb default '{}'::jsonb,
  p_meta         jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  pay   public.payments%rowtype;
  b     public.bookings%rowtype;
  v_now timestamptz := now();
  v_tr  jsonb := null;
begin
  if not app.is_service_role() then
    raise exception 'permission denied for apply_payment_result' using errcode = '42501';
  end if;
  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment_not_found' using errcode = 'P0002';
  end if;
  select * into b from public.bookings where id = pay.booking_id for update;

  if pay.status = p_status then
    return jsonb_build_object('payment_id', pay.id, 'status', pay.status, 'changed', false);
  end if;
  -- SUCCESS and REFUNDED are final; a late FAILED/EXPIRED never undoes a success.
  if pay.status in ('SUCCESS', 'REFUNDED') and p_status not in ('REFUNDED') then
    return jsonb_build_object('payment_id', pay.id, 'status', pay.status, 'changed', false);
  end if;

  update public.payments
  set status = p_status, provider_ref = coalesce(p_provider_ref, provider_ref),
      raw = raw || coalesce(p_raw, '{}'::jsonb),
      completed_at = case when p_status in ('SUCCESS', 'FAILED', 'EXPIRED', 'REFUNDED') then v_now else completed_at end
  where id = pay.id;

  if p_status = 'SUCCESS' then
    update public.bookings set paid_tzs = paid_tzs + pay.amount_tzs where id = b.id;
    insert into public.job_events (tenant_id, booking_id, kind, actor_kind, actor_label, customer_visible, message_key, data)
    values (b.tenant_id, b.id, 'payment', 'system', 'system:payment', true, 'event.payment_received',
            jsonb_build_object('amount_tzs', pay.amount_tzs, 'kind', pay.kind, 'provider', pay.provider));
    if b.status = 'AWAITING_PAYMENT' then
      v_tr := public.transition_booking(b.id, 'CONFIRMED', null,
                jsonb_build_object('actor', 'system:payment', 'capacity', p_meta -> 'capacity'));
    end if;
  elsif p_status = 'UNKNOWN' then
    insert into public.exceptions (tenant_id, booking_id, kind, severity, details)
    values (b.tenant_id, b.id, 'PAYMENT_UNKNOWN', 'high',
            jsonb_build_object('payment_id', pay.id, 'provider', pay.provider, 'provider_ref', coalesce(p_provider_ref, pay.provider_ref)));
  elsif p_status in ('FAILED', 'EXPIRED') then
    insert into public.job_events (tenant_id, booking_id, kind, actor_kind, actor_label, customer_visible, message_key, data)
    values (b.tenant_id, b.id, 'payment', 'system', 'system:payment', true, 'event.payment_' || lower(p_status::text),
            jsonb_build_object('amount_tzs', pay.amount_tzs, 'kind', pay.kind, 'provider', pay.provider));
  elsif p_status = 'REFUNDED' then
    update public.bookings set paid_tzs = greatest(paid_tzs - pay.amount_tzs, 0) where id = b.id;
  end if;

  perform app.write_audit(b.tenant_id, 'payment.result', 'payment', pay.id,
                          jsonb_build_object('from', pay.status, 'to', p_status), 'system:payment');
  return jsonb_build_object('payment_id', pay.id, 'status', p_status, 'changed', true, 'booking', v_tr);
end;
$$;

revoke all on function public.apply_payment_result(uuid, public.payment_status, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.apply_payment_result(uuid, public.payment_status, text, jsonb, jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- 10. portal_catalog — what an anonymous visitor may know about a company: identity,
--     branding, public settings, the active catalog and the names of served areas.
--     Never phone numbers of customers or staff, never internal notes.
-- ---------------------------------------------------------------------------
create or replace function public.portal_catalog(p_slug text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
declare
  t public.tenants%rowtype;
begin
  select * into t from public.tenants where slug = lower(trim(p_slug)) and deleted_at is null;
  if not found then
    raise exception 'tenant_not_found' using errcode = 'P0002';
  end if;
  if t.status = 'SUSPENDED' then
    raise exception 'tenant_suspended' using errcode = 'P0001';
  end if;
  return jsonb_build_object(
    'tenant', jsonb_build_object(
      'id', t.id, 'slug', t.slug, 'name', t.name, 'city', t.city, 'phone_e164', t.phone_e164,
      'ticket_prefix', t.ticket_prefix, 'status', t.status, 'branding', t.branding,
      'base', case when t.base_lat is null then null else jsonb_build_object('lat', t.base_lat, 'lng', t.base_lng) end,
      'settings', jsonb_build_object(
        'deposit_pct', app.setting_int(t.settings, 'deposit_pct', 30),
        'cancel_hours', app.setting_int(t.settings, 'cancel_hours', 4),
        'slot_hold_minutes', app.setting_int(t.settings, 'slot_hold_minutes', 15),
        'quote_expiry_hours', app.setting_int(t.settings, 'quote_expiry_hours', 144),
        'min_lead_minutes', app.setting_int(t.settings, 'min_lead_minutes', 120),
        'slot_step_min', app.setting_int(t.settings, 'slot_step_min', 60),
        'languages', coalesce(t.settings -> 'languages', '["sw","en"]'::jsonb),
        'default_locale', coalesce(t.settings ->> 'default_locale', 'sw'),
        'working_hours', coalesce(t.settings -> 'working_hours', '{}'::jsonb),
        'tax', coalesce(t.settings -> 'tax', '{"mode":"none","rate_pct":18,"label":"VAT"}'::jsonb)
      )
    ),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'name_sw', c.name_sw, 'name_en', c.name_en, 'sort', c.sort) order by c.sort, c.name_en)
      from public.service_categories c where c.tenant_id = t.id), '[]'::jsonb),
    'services', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'category_id', s.category_id, 'name_sw', s.name_sw, 'name_en', s.name_en,
        'description_sw', s.description_sw, 'description_en', s.description_en,
        'pricing_type', s.pricing_type, 'pricing_rule', s.pricing_rule, 'duration_rule', s.duration_rule,
        'crew_size', s.crew_size, 'recurrence_days', s.recurrence_days, 'sort', s.sort, 'active', s.active
      ) order by s.sort, s.name_en)
      from public.services s where s.tenant_id = t.id and s.active and s.deleted_at is null), '[]'::jsonb),
    'addons', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'service_id', a.service_id, 'name_sw', a.name_sw, 'name_en', a.name_en,
        'price_tzs', a.price_tzs, 'per_unit', a.per_unit, 'active', a.active
      ) order by a.sort, a.name_en)
      from public.service_addons a where a.tenant_id = t.id and a.active), '[]'::jsonb),
    'zones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', z.id, 'name', z.name, 'areas', to_jsonb(z.areas), 'serviceable', z.serviceable,
        'travel_fee_tzs', z.travel_fee_tzs
      ) order by z.sort)
      from public.service_zones z where z.tenant_id = t.id and z.active), '[]'::jsonb)
  );
end;
$$;

revoke all on function public.portal_catalog(text) from public;
grant execute on function public.portal_catalog(text) to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 11. Hold expiry on a schedule when pg_cron is available (hosted). Local/PGlite
--     environments skip this; the reserving predicate keeps availability correct either way.
-- ---------------------------------------------------------------------------
do $cron$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    begin
      create extension if not exists pg_cron;
      perform cron.schedule('safi360_expire_booking_holds', '* * * * *', 'select public.expire_booking_holds(200)');
    exception when others then
      raise notice 'pg_cron schedule skipped: %', sqlerrm;
    end;
  end if;
end
$cron$;
