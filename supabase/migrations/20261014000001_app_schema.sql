-- 0001 · app schema and JWT-claim helpers
-- The custom access-token hook (0005) adds tenant_id, tenant_role and is_super_admin to
-- every JWT. PostgREST exposes the verified claims as request.jwt.claims; these helpers
-- are the ONLY way policies and functions read them.

create schema if not exists app;

grant usage on schema app to anon, authenticated, service_role;

create or replace function app.jwt_claims()
returns jsonb
language sql
stable
as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb);
$$;

create or replace function app.current_user_id()
returns uuid
language sql
stable
as $$
  select nullif(app.jwt_claims() ->> 'sub', '')::uuid;
$$;

create or replace function app.current_tenant_id()
returns uuid
language sql
stable
as $$
  select nullif(app.jwt_claims() ->> 'tenant_id', '')::uuid;
$$;

-- Named tenant_role because Supabase reserves the `role` claim for the Postgres role.
create or replace function app.current_tenant_role()
returns text
language sql
stable
as $$
  select nullif(app.jwt_claims() ->> 'tenant_role', '');
$$;

create or replace function app.is_super_admin()
returns boolean
language sql
stable
as $$
  select coalesce((app.jwt_claims() ->> 'is_super_admin')::boolean, false);
$$;

create or replace function app.is_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(app.jwt_claims() ->> 'role', '') = 'service_role'
      or current_user in ('service_role', 'postgres', 'supabase_admin');
$$;

create or replace function app.has_tenant_role(variadic p_roles text[])
returns boolean
language sql
stable
as $$
  select app.current_tenant_role() = any (p_roles);
$$;

-- Generic updated_at maintenance.
create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

grant execute on function
  app.jwt_claims(),
  app.current_user_id(),
  app.current_tenant_id(),
  app.current_tenant_role(),
  app.is_super_admin(),
  app.is_service_role(),
  app.has_tenant_role(text[])
to anon, authenticated, service_role;
