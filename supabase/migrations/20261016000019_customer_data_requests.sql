-- 0019 · GDPR-style data export / deletion request tracking.
-- Only the service role (edge functions) can read or write; no client access.

create table if not exists public.customer_data_requests (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants(id),
  phone_e164   text not null check (phone_e164 ~ '^\+255[1-9]\d{8}$'),
  request_type text not null check (request_type in ('export', 'deletion')),
  status       text not null default 'PENDING' check (status in ('PENDING', 'COMPLETED', 'FAILED')),
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create index customer_data_requests_tenant_idx on public.customer_data_requests (tenant_id);
create index customer_data_requests_phone_idx on public.customer_data_requests (phone_e164);

alter table public.customer_data_requests enable row level security;

revoke all on table public.customer_data_requests from public, anon, authenticated;

create policy customer_data_requests_service_all on public.customer_data_requests
  for all to service_role
  using (true)
  with check (true);
