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
  confirmation_token  text,
  recovery_token      text,
  email_change        text,
  email_change_token_new text,
  email_change_token_current text,
  phone_change        text,
  phone_change_token  text,
  reauthentication_token text,
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

-- Storage: the bucket catalog, object index and path helper that migration 0033 uses.
create schema if not exists storage;

create table if not exists storage.buckets (
  id         text primary key,
  name       text not null,
  public     boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text references storage.buckets(id),
  name       text,
  owner      uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select (string_to_array(name, '/'))[1 : array_length(string_to_array(name, '/'), 1) - 1]
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant select, insert, update on storage.objects to authenticated;
