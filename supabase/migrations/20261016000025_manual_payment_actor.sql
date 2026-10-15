-- 0025 · manual payments accept an explicit staff actor.
-- record_manual_payment() resolved the actor from JWT claims only, so direct
-- calls without claim-carried roles were rejected. The new trailing p_meta
-- uses the same staff:<uuid> + actor_role shape as the other write-path
-- functions; correct databases keep deciding from claims, the meta is a fallback.

drop function if exists public.record_manual_payment(uuid, integer, text, text, timestamptz);

create or replace function public.record_manual_payment(
  p_booking_id uuid,
  p_amount_tzs integer,
  p_method text,
  p_reason text,
  p_occurred_at timestamptz default now(),
  p_meta jsonb default '{}'::jsonb
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
  select * into act from app.actor_of(p_meta);
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

revoke all on function public.record_manual_payment(uuid, integer, text, text, timestamptz, jsonb) from public, anon;
grant execute on function public.record_manual_payment(uuid, integer, text, text, timestamptz, jsonb) to authenticated, service_role;
