-- 0005 · custom access-token hook
-- Supabase Auth calls this before minting a JWT (config.toml → [auth.hook.custom_access_token]).
-- It adds tenant_id, tenant_role and is_super_admin from memberships/profiles.
-- The `role` claim is left untouched: Supabase uses it for the Postgres role.

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = public, pg_temp
as $$
declare
  v_user_id   uuid;
  v_claims    jsonb;
  v_tenant_id uuid;
  v_role      text;
  v_super     boolean;
begin
  v_user_id := (event ->> 'user_id')::uuid;
  v_claims  := coalesce(event -> 'claims', '{}'::jsonb);

  select m.tenant_id, m.role::text
  into v_tenant_id, v_role
  from public.memberships m
  join public.tenants t on t.id = m.tenant_id
  where m.user_id = v_user_id
    and m.active
    and t.deleted_at is null
  limit 1;

  select coalesce(p.is_super_admin, false)
  into v_super
  from public.profiles p
  where p.id = v_user_id;

  v_claims := v_claims || jsonb_build_object(
    'tenant_id',      v_tenant_id,
    'tenant_role',    v_role,
    'is_super_admin', coalesce(v_super, false)
  );

  return jsonb_set(event, '{claims}', v_claims);
end;
$$;

-- Only the auth service may call the hook or read the tables it needs.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;

grant select on public.memberships, public.tenants, public.profiles to supabase_auth_admin;

create policy memberships_auth_admin_read on public.memberships
  for select to supabase_auth_admin using (true);
create policy tenants_auth_admin_read on public.tenants
  for select to supabase_auth_admin using (true);
create policy profiles_auth_admin_read on public.profiles
  for select to supabase_auth_admin using (true);
