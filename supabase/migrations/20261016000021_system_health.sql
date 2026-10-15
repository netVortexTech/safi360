-- 0021 · platform-wide system health metrics (ping, queue depth, error rates).
-- Only super admins may read or write health snapshots.

create table if not exists public.system_health (
  id           uuid primary key default gen_random_uuid(),
  metric_name  text not null,
  metric_value jsonb not null,
  recorded_at  timestamptz not null default now()
);

create index system_health_name_idx on public.system_health (metric_name);
create index system_health_recorded_idx on public.system_health (recorded_at);

alter table public.system_health enable row level security;

revoke all on table public.system_health from public, anon;

create policy system_health_select on public.system_health
  for select to authenticated
  using (app.is_super_admin());

create policy system_health_insert on public.system_health
  for insert to authenticated
  with check (app.is_super_admin());
