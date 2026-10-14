-- 0016 · manual payments and reconciliation helpers.
-- Only OWNER/MANAGER may record a manual receipt; the function writes through apply-level rules
-- (a SUCCESS row, paid_tzs movement, event, audit). Gateway payments can never be marked paid
-- manually: provider must be MANUAL.
create or replace function public.record_manual_payment(
  p_booking_id uuid,
  p_amount_tzs integer,
  p_method text,
  p_reason text,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  b   public.bookings%rowtype;
  act record;
  v_pay uuid;
begin
  if p_amount_tzs <= 0 then
    raise exception 'invalid_amount' using errcode = '22023';
  end if;
  select * into b from public.bookings where id = p_booking_id and (app.is_service_role() or tenant_id = app.current_tenant_id());
  if not found then raise exception 'booking_not_found' using errcode = 'P0002'; end if;
  select * into act from app.actor_of('{}'::jsonb);
  if act.actor_role not in ('OWNER', 'MANAGER') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  insert into public.payments (tenant_id, booking_id, kind, provider, provider_ref, amount_tzs, status, completed_at, raw)
  values (b.tenant_id, b.id, case when p_amount_tzs <= b.deposit_tzs then 'DEPOSIT' else 'BALANCE' end, 'MANUAL',
          'manual_' || gen_random_uuid()::text, p_amount_tzs, 'SUCCESS', p_occurred_at,
          jsonb_build_object('method', coalesce(p_method, 'cash'), 'reason', p_reason, 'actor', act.actor_role))
  returning id into v_pay;
  update public.bookings set paid_tzs = paid_tzs + p_amount_tzs where id = b.id;
  insert into public.job_events (tenant_id, booking_id, kind, actor_kind, actor_user_id, actor_label, customer_visible, message_key, data)
  values (b.tenant_id, b.id, 'payment', 'staff', act.actor_user_id, act.actor_label, true, 'event.payment_received',
          jsonb_build_object('amount_tzs', p_amount_tzs, 'kind', 'MANUAL', 'provider', 'MANUAL', 'manual', true));
  perform app.write_audit(b.tenant_id, 'payment.manual', 'payment', v_pay, jsonb_build_object('amount_tzs', p_amount_tzs, 'reason', p_reason), act.actor_label);
  return v_pay;
end;
$$;

revoke all on function public.record_manual_payment(uuid, integer, text, text, timestamptz) from public, anon;
grant execute on function public.record_manual_payment(uuid, integer, text, text, timestamptz) to authenticated, service_role;

-- late payment after expiry: apply_payment_result must leave the money unmatched.
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
  if pay.status in ('SUCCESS', 'REFUNDED') and p_status not in ('REFUNDED') then
    return jsonb_build_object('payment_id', pay.id, 'status', pay.status, 'changed', false);
  end if;

  update public.payments
  set status = p_status, provider_ref = coalesce(p_provider_ref, provider_ref),
      raw = raw || coalesce(p_raw, '{}'::jsonb),
      completed_at = case when p_status in ('SUCCESS', 'FAILED', 'EXPIRED', 'REFUNDED') then v_now else completed_at end
  where id = pay.id;

  if p_status = 'SUCCESS' then
    if b.status = 'EXPIRED' then
      insert into public.exceptions (tenant_id, booking_id, kind, severity, details)
      values (b.tenant_id, b.id, 'PAYMENT_UNKNOWN', 'high',
              jsonb_build_object('payment_id', pay.id, 'provider', pay.provider, 'provider_ref', coalesce(p_provider_ref, pay.provider_ref),
                                 'reason', 'late_callback_after_expiry'));
    else
      update public.bookings set paid_tzs = paid_tzs + pay.amount_tzs where id = b.id;
      insert into public.job_events (tenant_id, booking_id, kind, actor_kind, actor_label, customer_visible, message_key, data)
      values (b.tenant_id, b.id, 'payment', 'system', 'system:payment', true, 'event.payment_received',
              jsonb_build_object('amount_tzs', pay.amount_tzs, 'kind', pay.kind, 'provider', pay.provider));
      if b.status = 'AWAITING_PAYMENT' then
        v_tr := public.transition_booking(b.id, 'CONFIRMED', null,
                  jsonb_build_object('actor', 'system:payment', 'capacity', p_meta -> 'capacity'));
      end if;
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
