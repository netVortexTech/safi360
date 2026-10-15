-- 0024 · let office roles queue customer notifications.
-- Reads and resend already exist (0017); without an INSERT policy the approve /
-- decline flows in the ops app cannot queue the SMS/WhatsApp rows the sender
-- picks up once a provider is connected. Queued rows are inert until then.

create policy notifications_queue on public.notifications
  for insert to authenticated
  with check (
    tenant_id = app.current_tenant_id()
    and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')
  );
