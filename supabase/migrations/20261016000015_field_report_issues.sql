-- 0015 · let an assigned cleaner report issues on their job via open_exception.
--
-- Field-phase report feature: a CLEANER may open a NEEDS_REVIEW / equipment / access
-- exception only on a job they are assigned to. Office roles keep all prior powers.
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
  if act.actor_role not in ('SYSTEM', 'CUSTOMER', 'OWNER', 'MANAGER', 'DISPATCHER', 'CLEANER') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if act.actor_role = 'CLEANER' and not app.is_assigned_cleaner(b.id) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
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

revoke all on function public.open_exception(uuid, text, jsonb, text, jsonb) from public, anon;
grant execute on function public.open_exception(uuid, text, jsonb, text, jsonb) to authenticated, service_role;
