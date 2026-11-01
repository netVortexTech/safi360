-- 0037 · reserved tenant slugs
--
-- A company's portal lives at /:slug, but the app's own routes (/ops, /field, /control,
-- /signup, /onboarding, /reset-password) are matched first. A company that signed up as
-- "ops" or "signup" would get a booking page nobody can open. Keep those names, and a few
-- obvious future ones, out of the tenants table and report them as unavailable.
-- Keep in sync with the reserved first segments in src/app/App.tsx.

create or replace function app.is_reserved_slug(p_slug text)
returns boolean
language sql
immutable
as $$
  select lower(btrim(coalesce(p_slug, ''))) = any (array[
    'ops', 'field', 'control', 'signup', 'onboarding', 'reset-password', 'login', 'logout',
    'admin', 'api', 'auth', 'app', 'assets', 'static', 'www', 'help', 'support', 'pricing',
    'terms', 'privacy', 'docs', 'blog', 'safi360'
  ]);
$$;

alter table public.tenants
  add constraint tenants_slug_not_reserved check (not app.is_reserved_slug(slug));

create or replace function public.tenant_slug_available(p_slug text)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select not app.is_reserved_slug(p_slug)
     and not exists (select 1 from public.tenants t where t.slug = lower(btrim(coalesce(p_slug, ''))));
$$;
