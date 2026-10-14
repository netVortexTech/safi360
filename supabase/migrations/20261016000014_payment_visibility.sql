-- 0014 · billing visibility: the payments ledger is management-only.
--
-- Phase 3 rule: a dispatcher cannot see billing. Dispatchers (and the ops screens
-- they use) keep working with the booking money columns (total_tzs / paid_tzs on
-- the ticket: what to collect), but individual payment attempts — providers,
-- references and raw callbacks — are visible only to OWNER and MANAGER roles
-- (plus super admins). Cleaners never see any of it (unchanged).

drop policy if exists payments_select on public.payments;

create policy payments_select on public.payments
  for select to authenticated
  using (app.is_super_admin() or (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER')));
