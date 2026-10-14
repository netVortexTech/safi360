-- Development seed. Applied by `supabase db reset` and by the db test harness.
-- Sample tenant "Usafi Bora Cleaners" (prefix UBC) plus a second tenant so cross-tenant
-- isolation is visible in local development. Phone OTP for every seeded user is 123456
-- (see config.toml [auth.sms.test_otp]). Never run against production.

insert into public.plans (id, name, price_tzs, limits) values
  ('starter', 'Starter', 45000,  '{"staff":5,"bookings_month":150,"reminders_month":100}'),
  ('growth',  'Growth',  95000,  '{"staff":15,"bookings_month":600,"reminders_month":1000}'),
  ('pro',     'Pro',     180000, '{"staff":null,"bookings_month":null,"reminders_month":5000}')
on conflict (id) do nothing;

-- Tenants -------------------------------------------------------------------
insert into public.tenants (id, slug, name, phone_e164, city, ticket_prefix, branding, settings, plan_id, status)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'usafi-bora',
    'Usafi Bora Cleaners',
    '+255754000001',
    'Dar es Salaam',
    'UBC',
    '{"display_name":"Usafi Bora Cleaners","color":"#0E7C7B","greeting_sw":"Karibu Usafi Bora! Tunasafisha sofa, mazulia, magodoro na nyumba nzima.","greeting_en":"Welcome to Usafi Bora! We clean sofas, carpets, mattresses and whole homes."}',
    '{"deposit_pct":30,"cancel_hours":4,"slot_hold_minutes":15,"travel_buffer_min":45,"quote_expiry_hours":144,"languages":["sw","en"],"default_locale":"sw","working_hours":{"mon":{"open":"08:00","close":"18:00"},"tue":{"open":"08:00","close":"18:00"},"wed":{"open":"08:00","close":"18:00"},"thu":{"open":"08:00","close":"18:00"},"fri":{"open":"08:00","close":"18:00"},"sat":{"open":"08:00","close":"16:00"},"sun":{"open":"09:00","close":"13:00","closed":true}}}',
    'growth',
    'ACTIVE'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'pwani-fresh',
    'Pwani Fresh Cleaning',
    '+255754000002',
    'Zanzibar',
    'PFC',
    '{"display_name":"Pwani Fresh Cleaning","color":"#13293D"}',
    '{"deposit_pct":20}',
    'starter',
    'TRIAL'
  )
on conflict (id) do nothing;

-- Auth users (local only). Supabase Auth owns this table; we insert the minimum columns.
insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '255754000001', now(), '{"provider":"phone","providers":["phone"]}', '{"name":"Bahati Mwakyusa"}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '255754000002', now(), '{"provider":"phone","providers":["phone"]}', '{"name":"Zuhura Khamis"}', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '255754000003', now(), '{"provider":"phone","providers":["phone"]}', '{"name":"Safi360 Admin"}', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, phone_e164, name, locale, is_super_admin) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '+255754000001', 'Bahati Mwakyusa', 'sw', false),
  ('aaaaaaaa-0000-4000-8000-000000000002', '+255754000002', 'Zuhura Khamis',   'sw', false),
  ('aaaaaaaa-0000-4000-8000-000000000003', '+255754000003', 'Safi360 Admin',   'en', true)
on conflict (id) do nothing;

insert into public.memberships (tenant_id, user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'OWNER'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-000000000002', 'OWNER')
on conflict (tenant_id, user_id) do nothing;

-- Non-secret integration config for the sample tenant (secrets are set via Edge Functions).
insert into public.tenant_integrations (tenant_id, kind, config, status) values
  ('11111111-1111-4111-8111-111111111111', 'WHATSAPP', '{"waba_id":"sandbox-waba","phone_number_id":"sandbox-ubc"}', 'DISABLED'),
  ('11111111-1111-4111-8111-111111111111', 'SELCOM',   '{"vendor_id":"sandbox-ubc"}', 'DISABLED')
on conflict (tenant_id, kind) do nothing;
