-- Test-only bootstrap that recreates the parts of a Supabase database our migrations
-- depend on, so the real migration files can run unchanged inside PGlite.
-- NOT a migration. Never applied to a real Supabase project.

create schema if not exists auth;

create table if not exists auth.users (
  instance_id         uuid,
  id                  uuid primary key,
  aud                 text,
  role                text,
  email               text,
  phone               text unique,
  phone_confirmed_at  timestamptz,
  email_confirmed_at  timestamptz,
  encrypted_password  text,
  raw_app_meta_data   jsonb default '{}'::jsonb,
  raw_user_meta_data  jsonb default '{}'::jsonb,
  is_anonymous        boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    create role supabase_auth_admin nologin;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to supabase_auth_admin, service_role;

-- Supabase's default privileges: every new public table/function/sequence is granted
-- to the three API roles. Our migrations revoke what they do not want.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
