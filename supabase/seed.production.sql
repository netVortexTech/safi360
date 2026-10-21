-- 0000 · Production seed: Plans only
-- Run this ONCE on a fresh production database via: psql -f supabase/seed.production.sql
-- NEVER run the development seed.sql against production.

-- ---------------------------------------------------------------------------
-- plans (platform level) — adjust prices as needed before running
-- ---------------------------------------------------------------------------
insert into public.plans (id, name, price_tzs, limits) values
  ('starter', 'Starter', 45000,  '{"staff":5,"bookings_month":150,"reminders_month":100}'),
  ('growth',  'Growth',  95000,  '{"staff":15,"bookings_month":600,"reminders_month":1000}'),
  ('pro',     'Pro',     180000, '{"staff":null,"bookings_month":null,"reminders_month":5000}')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Super admin user (create via Supabase Auth UI first, then run this)
-- Replace UUID with the actual auth.users.id after creating the user
-- ---------------------------------------------------------------------------
-- insert into public.profiles (id, phone_e164, name, locale, is_super_admin) values
--   ('REPLACE_WITH_AUTH_USER_ID', '+255XXXXXXXXX', 'Safi360 Admin', 'en', true)
-- on conflict (id) do update set
--   phone_e164 = excluded.phone_e164,
--   name       = excluded.name,
--   locale     = excluded.locale,
--   is_super_admin = excluded.is_super_admin;