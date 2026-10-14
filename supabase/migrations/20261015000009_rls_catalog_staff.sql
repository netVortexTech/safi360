-- 0009 · row level security for catalog and staff tables.
-- Reads: any member of the tenant (cleaners need service names and colleagues' names
-- on their jobs; prices on other jobs are hidden at the booking level, not here).
-- Writes: catalog and staff by OWNER/MANAGER (permissions catalog.edit, staff.manage);
-- assignments by OWNER/MANAGER/DISPATCHER (booking.assign). Super admins read all.
-- anon never touches these tables; the public quote/availability functions use the
-- service role after resolving the tenant from the URL slug.

revoke all on table
  public.service_categories,
  public.services,
  public.service_addons,
  public.service_zones,
  public.staff,
  public.staff_availability,
  public.assignments
from anon, authenticated;

alter table public.service_categories enable row level security;
alter table public.services            enable row level security;
alter table public.service_addons      enable row level security;
alter table public.service_zones       enable row level security;
alter table public.staff               enable row level security;
alter table public.staff_availability  enable row level security;
alter table public.assignments         enable row level security;

grant select, insert, update, delete on
  public.service_categories,
  public.services,
  public.service_addons,
  public.service_zones,
  public.staff,
  public.staff_availability,
  public.assignments
to authenticated;

-- ---- catalog: read by members, written by owner/manager ---------------------------
create policy service_categories_select on public.service_categories
  for select to authenticated
  using (tenant_id = app.current_tenant_id() or app.is_super_admin());
create policy service_categories_write on public.service_categories
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'));

create policy services_select on public.services
  for select to authenticated
  using (tenant_id = app.current_tenant_id() or app.is_super_admin());
create policy services_write on public.services
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'));

create policy service_addons_select on public.service_addons
  for select to authenticated
  using (tenant_id = app.current_tenant_id() or app.is_super_admin());
create policy service_addons_write on public.service_addons
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'));

create policy service_zones_select on public.service_zones
  for select to authenticated
  using (tenant_id = app.current_tenant_id() or app.is_super_admin());
create policy service_zones_write on public.service_zones
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'));

-- ---- staff ------------------------------------------------------------------------
create policy staff_select on public.staff
  for select to authenticated
  using (tenant_id = app.current_tenant_id() or app.is_super_admin());
create policy staff_write on public.staff
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'));

create policy staff_availability_select on public.staff_availability
  for select to authenticated
  using (tenant_id = app.current_tenant_id() or app.is_super_admin());
create policy staff_availability_write on public.staff_availability
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER'));

-- ---- assignments: office roles see all; a cleaner sees only their own ----------------
create policy assignments_select on public.assignments
  for select to authenticated
  using (
    app.is_super_admin()
    or (
      tenant_id = app.current_tenant_id()
      and (
        app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER')
        or exists (
          select 1 from public.staff s
          where s.id = public.assignments.staff_id
            and s.tenant_id = public.assignments.tenant_id
            and s.user_id = app.current_user_id()
        )
      )
    )
  );
create policy assignments_write on public.assignments
  for all to authenticated
  using (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'))
  with check (tenant_id = app.current_tenant_id() and app.has_tenant_role('OWNER', 'MANAGER', 'DISPATCHER'));
