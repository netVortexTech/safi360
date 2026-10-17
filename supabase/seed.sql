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
insert into public.tenants (id, slug, name, phone_e164, city, ticket_prefix, base_lat, base_lng, branding, settings, plan_id, status)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'usafi-bora',
    'Usafi Bora Cleaners',
    '+255754000001',
    'Dar es Salaam',
    'UBC',
    -6.7199, 39.2113,
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
    null, null,
    '{"display_name":"Pwani Fresh Cleaning","color":"#13293D"}',
    '{"deposit_pct":20}',
    'starter',
    'TRIAL'
  )
on conflict (id) do nothing;

-- Auth users (local only). Supabase Auth owns this table; we insert the minimum columns.
-- The empty-string token columns matter on a hosted project: GoTrue fails to sign a user in
-- when any of them is NULL ("converting NULL to string is unsupported").
insert into auth.users (id, instance_id, aud, role, phone, phone_confirmed_at, raw_app_meta_data, raw_user_meta_data,
                        confirmation_token, recovery_token, email_change, email_change_token_new, email_change_token_current,
                        phone_change, phone_change_token, reauthentication_token, created_at, updated_at)
values
  ('aaaaaaaa-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '255754000001', now(), '{"provider":"phone","providers":["phone"]}', '{"name":"Bahati Mwakyusa"}', '', '', '', '', '', '', '', '', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '255754000002', now(), '{"provider":"phone","providers":["phone"]}', '{"name":"Zuhura Khamis"}', '', '', '', '', '', '', '', '', now(), now()),
  ('aaaaaaaa-0000-4000-8000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', '255754000003', now(), '{"provider":"phone","providers":["phone"]}', '{"name":"Safi360 Admin"}', '', '', '', '', '', '', '', '', now(), now())
on conflict (id) do nothing;

insert into public.profiles (id, phone_e164, name, locale, is_super_admin) values
  ('aaaaaaaa-0000-4000-8000-000000000001', '+255754000001', 'Bahati Mwakyusa', 'sw', false),
  ('aaaaaaaa-0000-4000-8000-000000000002', '+255754000002', 'Zuhura Khamis',   'sw', false),
  ('aaaaaaaa-0000-4000-8000-000000000003', '+255754000003', 'Safi360 Admin',   'en', true)
-- The auth-user trigger (0028) may have created minimal profiles already; let the seed's
-- explicit values win so is_super_admin and names are exact.
on conflict (id) do update set
  phone_e164 = excluded.phone_e164,
  name       = excluded.name,
  locale     = excluded.locale,
  is_super_admin = excluded.is_super_admin;

insert into public.memberships (tenant_id, user_id, role) values
  ('11111111-1111-4111-8111-111111111111', 'aaaaaaaa-0000-4000-8000-000000000001', 'OWNER'),
  ('22222222-2222-4222-8222-222222222222', 'aaaaaaaa-0000-4000-8000-000000000002', 'OWNER')
on conflict (tenant_id, user_id) do nothing;

-- Non-secret integration config for the sample tenant (secrets are set via Edge Functions).
insert into public.tenant_integrations (tenant_id, kind, config, status) values
  ('11111111-1111-4111-8111-111111111111', 'WHATSAPP', '{"waba_id":"sandbox-waba","phone_number_id":"sandbox-ubc"}', 'DISABLED'),
  ('11111111-1111-4111-8111-111111111111', 'SELCOM',   '{"vendor_id":"sandbox-ubc"}', 'DISABLED')
on conflict (tenant_id, kind) do nothing;

-- ===========================================================================
-- Phase 1 · catalog, zones, staff (Usafi Bora). Mirrors _shared/pricing/fixtures.ts;
-- the db test suite asserts both stay identical.
-- ===========================================================================

insert into public.service_categories (id, tenant_id, name_sw, name_en, sort) values
  ('44440000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Sofa na makochi',        'Sofa & upholstery',          1),
  ('44440000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Mazulia na magodoro',    'Carpets & mattresses',       2),
  ('44440000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Usafi wa nyumba',        'Home deep clean',            3),
  ('44440000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Ofisi na baada ya ujenzi', 'Office & post-construction', 4),
  ('44440000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Kufukiza na matibabu',   'Fumigation & treatment',     5)
on conflict (id) do nothing;

insert into public.services (id, tenant_id, category_id, name_sw, name_en, pricing_type, pricing_rule, duration_rule, crew_size, recurrence_days, sort, active) values
  ('55550000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '44440000-0000-4000-8000-000000000001',
   'Usafi wa sofa', 'Sofa cleaning', 'PER_SEAT',
   '{"price_tzs":15000,"min_charge_tzs":45000,"min_seats":1}',
   '{"base_min":30,"per_unit_min":20}', 1, 90, 1, true),
  ('55550000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '44440000-0000-4000-8000-000000000002',
   'Usafi wa zulia', 'Carpet cleaning', 'PER_VARIANT',
   '{"variants":[{"key":"5x6","label_sw":"Futi 5×6","label_en":"5×6 ft","price_tzs":35000},{"key":"6x6","label_sw":"Futi 6×6","label_en":"6×6 ft","price_tzs":40000},{"key":"8x10","label_sw":"Futi 8×10","label_en":"8×10 ft","price_tzs":60000}]}',
   '{"base_min":30,"per_unit_min":30}', 1, null, 2, true),
  ('55550000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '44440000-0000-4000-8000-000000000002',
   'Usafi wa godoro', 'Mattress cleaning', 'PER_VARIANT',
   '{"variants":[{"key":"single","label_sw":"Godoro la mtu mmoja (3.5×6)","label_en":"Single (3.5×6)","price_tzs":30000},{"key":"double","label_sw":"Godoro la watu wawili (5×6)","label_en":"Double (5×6)","price_tzs":40000},{"key":"king","label_sw":"King (6×6)","label_en":"King (6×6)","price_tzs":50000}],"min_charge_tzs":40000}',
   '{"base_min":20,"per_unit_min":30}', 1, null, 3, true),
  ('55550000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', '44440000-0000-4000-8000-000000000003',
   'Usafi wa kina wa nyumba', 'Residential deep clean', 'PER_ROOM',
   '{"rooms":[{"key":"bedroom","label_sw":"Chumba cha kulala","label_en":"Bedroom","price_tzs":30000},{"key":"bathroom","label_sw":"Bafu","label_en":"Bathroom","price_tzs":20000},{"key":"kitchen","label_sw":"Jiko","label_en":"Kitchen","price_tzs":35000},{"key":"sitting","label_sw":"Sebule","label_en":"Sitting room","price_tzs":30000},{"key":"dining","label_sw":"Chumba cha kulia","label_en":"Dining room","price_tzs":20000}],"min_charge_tzs":80000}',
   '{"base_min":60,"per_room_min":45}', 2, null, 4, true),
  ('55550000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', '44440000-0000-4000-8000-000000000004',
   'Usafi baada ya ujenzi', 'Post-construction clean', 'PER_AREA',
   '{"unit":"sqm","tiers":[{"up_to_sqm":100,"price_tzs":2500},{"up_to_sqm":300,"price_tzs":2200},{"up_to_sqm":null,"price_tzs":2000}],"tier_mode":"bracket","ranges":[{"key":"under_50","label_sw":"Chini ya 50 m²","label_en":"Under 50 m²","min_sqm":0,"max_sqm":50,"assumed_sqm":40},{"key":"50_100","label_sw":"50–100 m²","label_en":"50–100 m²","min_sqm":50,"max_sqm":100,"assumed_sqm":75},{"key":"100_200","label_sw":"100–200 m²","label_en":"100–200 m²","min_sqm":100,"max_sqm":200,"assumed_sqm":150},{"key":"200_400","label_sw":"200–400 m²","label_en":"200–400 m²","min_sqm":200,"max_sqm":400,"assumed_sqm":300},{"key":"over_400","label_sw":"Zaidi ya 400 m²","label_en":"Over 400 m²","min_sqm":400,"max_sqm":null,"assumed_sqm":500}],"min_charge_tzs":150000}',
   '{"base_min":120,"per_sqm_min":1.5}', 3, null, 5, true),
  ('55550000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', '44440000-0000-4000-8000-000000000004',
   'Usafi wa ofisi', 'Office cleaning', 'PER_AREA',
   '{"unit":"sqm","tiers":[{"up_to_sqm":200,"price_tzs":1500},{"up_to_sqm":null,"price_tzs":1200}],"tier_mode":"marginal","ranges":[{"key":"under_100","label_sw":"Chini ya 100 m²","label_en":"Under 100 m²","min_sqm":0,"max_sqm":100,"assumed_sqm":80},{"key":"100_300","label_sw":"100–300 m²","label_en":"100–300 m²","min_sqm":100,"max_sqm":300,"assumed_sqm":200},{"key":"over_300","label_sw":"Zaidi ya 300 m²","label_en":"Over 300 m²","min_sqm":300,"max_sqm":null,"assumed_sqm":400}],"min_charge_tzs":100000}',
   '{"base_min":60,"per_sqm_min":0.8}', 2, null, 6, true),
  ('55550000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', '44440000-0000-4000-8000-000000000005',
   'Kufukiza nyumba ya vyumba 3', 'Fumigation, 3-bedroom house', 'FLAT',
   '{"price_tzs":120000}', '{"base_min":90}', 1, 30, 7, true),
  ('55550000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', '44440000-0000-4000-8000-000000000003',
   'Usafi wa tanki la maji', 'Water tank cleaning', 'PER_UNIT',
   '{"unit_sw":"tanki","unit_en":"tank","price_tzs":60000,"max_qty":10}', '{"base_min":60,"per_unit_min":90}', 2, null, 8, true),
  ('55550000-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', '44440000-0000-4000-8000-000000000005',
   'Matibabu ya ukungu na harufu', 'Mould & odour treatment', 'INSPECTION_REQUIRED',
   '{"from_price_tzs":50000}', '{"base_min":120}', 1, null, 9, true),
  ('55550000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111', '44440000-0000-4000-8000-000000000004',
   'Mkataba mkubwa wa kibiashara', 'Large commercial contract', 'CUSTOM_QUOTE',
   '{}', '{"base_min":480}', 4, null, 10, true),
  ('55550000-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', '44440000-0000-4000-8000-000000000001',
   'Usafi wa mapazia', 'Curtain cleaning', 'PER_UNIT',
   '{"unit_sw":"pazia","unit_en":"curtain","price_tzs":8000,"min_charge_tzs":24000}', '{"base_min":30,"per_unit_min":10}', 1, null, 11, false)
on conflict (id) do nothing;

insert into public.service_addons (id, tenant_id, service_id, name_sw, name_en, price_tzs, per_unit, sort, active) values
  ('66660000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '55550000-0000-4000-8000-000000000001', 'Kuondoa madoa',               'Stain treatment',  5000,  true,  1, true),
  ('66660000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', null,                                   'Kuondoa harufu',              'Odour removal',    15000, false, 2, true),
  ('66660000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '55550000-0000-4000-8000-000000000001', 'Kuondoa manyoya ya wanyama',  'Pet hair removal', 10000, false, 3, true),
  ('66660000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', '55550000-0000-4000-8000-000000000002', 'Kinga ya madoa',              'Stain protection', 8000,  true,  4, true),
  ('66660000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', '55550000-0000-4000-8000-000000000001', 'Manukato',                    'Fragrance',        3000,  false, 5, false)
on conflict (id) do nothing;

insert into public.service_zones (id, tenant_id, name, areas, polygon, max_km, travel_fee_tzs, serviceable, sort, active) values
  ('77770000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Mbezi & Kimara',
   '{"Mbezi","Mbezi Beach","Kimara","Goba","Kibamba"}', null, 10, 0, true, 1, true),
  ('77770000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Kinondoni & Mikocheni',
   '{"Kinondoni","Mikocheni","Masaki","Oysterbay","Sinza","Mwananyamala","Msasani","Kijitonyama"}',
   '{"type":"Polygon","coordinates":[[[39.24,-6.81],[39.31,-6.81],[39.31,-6.73],[39.24,-6.73],[39.24,-6.81]]]}', 20, 5000, true, 2, true),
  ('77770000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Kigamboni & Mbagala',
   '{"Kigamboni","Mbagala","Temeke"}', null, 35, 15000, true, 3, true),
  ('77770000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Bagamoyo (callback only)',
   '{"Bagamoyo"}', null, 70, 0, false, 4, true)
on conflict (id) do nothing;

-- Staff (the team from the Stitch screens). Phones are local-only sample numbers.
insert into public.staff (id, tenant_id, display_name, phone_e164, skills, home_zone_id, is_team_lead, pay_type, pay_rate_tzs, active) values
  ('88880000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Neema Mushi',    '+255754100001',
   '{55550000-0000-4000-8000-000000000001,55550000-0000-4000-8000-000000000002,55550000-0000-4000-8000-000000000003,55550000-0000-4000-8000-000000000004,55550000-0000-4000-8000-000000000005,55550000-0000-4000-8000-000000000006,55550000-0000-4000-8000-000000000007,55550000-0000-4000-8000-000000000008,55550000-0000-4000-8000-000000000009}',
   '77770000-0000-4000-8000-000000000001', true,  'PER_JOB', 15000, true),
  ('88880000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Rehema Kisanga', '+255754100002',
   '{55550000-0000-4000-8000-000000000001,55550000-0000-4000-8000-000000000002,55550000-0000-4000-8000-000000000003,55550000-0000-4000-8000-000000000004}',
   '77770000-0000-4000-8000-000000000002', false, 'PER_JOB', 12000, true),
  ('88880000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Juma Said',      '+255754100003',
   '{55550000-0000-4000-8000-000000000004,55550000-0000-4000-8000-000000000005,55550000-0000-4000-8000-000000000006,55550000-0000-4000-8000-000000000008}',
   '77770000-0000-4000-8000-000000000001', false, 'DAILY', 25000, true),
  ('88880000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Baraka Mtei',    '+255754100004',
   '{55550000-0000-4000-8000-000000000007,55550000-0000-4000-8000-000000000009}',
   '77770000-0000-4000-8000-000000000003', false, 'MONTHLY', 350000, true),
  ('88880000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', 'Amina Hassan',   '+255754100005',
   '{55550000-0000-4000-8000-000000000001}', null, false, null, null, false)
on conflict (id) do nothing;

-- Weekly availability (weekday 0 = Sunday). Juma has no weekly rows → tenant hours apply.
insert into public.staff_availability (tenant_id, staff_id, weekday, start_time, end_time, is_off)
select '11111111-1111-4111-8111-111111111111', s.id, d.weekday, d.start_time::time, d.end_time::time, false
from (values
  ('88880000-0000-4000-8000-000000000001'::uuid, 1, '08:00', '18:00'), ('88880000-0000-4000-8000-000000000001', 2, '08:00', '18:00'),
  ('88880000-0000-4000-8000-000000000001', 3, '08:00', '18:00'), ('88880000-0000-4000-8000-000000000001', 4, '08:00', '18:00'),
  ('88880000-0000-4000-8000-000000000001', 5, '08:00', '18:00'), ('88880000-0000-4000-8000-000000000001', 6, '08:00', '16:00'),
  ('88880000-0000-4000-8000-000000000002', 1, '08:00', '17:00'), ('88880000-0000-4000-8000-000000000002', 2, '08:00', '17:00'),
  ('88880000-0000-4000-8000-000000000002', 3, '08:00', '17:00'), ('88880000-0000-4000-8000-000000000002', 4, '08:00', '17:00'),
  ('88880000-0000-4000-8000-000000000002', 5, '08:00', '17:00'),
  ('88880000-0000-4000-8000-000000000004', 1, '09:00', '18:00'), ('88880000-0000-4000-8000-000000000004', 2, '09:00', '18:00'),
  ('88880000-0000-4000-8000-000000000004', 3, '09:00', '18:00'), ('88880000-0000-4000-8000-000000000004', 4, '09:00', '18:00'),
  ('88880000-0000-4000-8000-000000000004', 5, '09:00', '18:00'), ('88880000-0000-4000-8000-000000000004', 6, '09:00', '18:00')
) as d(staff_id, weekday, start_time, end_time)
join public.staff s on s.id = d.staff_id
where not exists (select 1 from public.staff_availability a where a.staff_id = s.id and a.weekday = d.weekday);

-- Dated overrides: Juma on leave 20–22 Oct, Rehema half day on Sat 17 Oct.
insert into public.staff_availability (tenant_id, staff_id, date, date_to, is_off, reason)
select '11111111-1111-4111-8111-111111111111', '88880000-0000-4000-8000-000000000003', '2026-10-20', '2026-10-22', true, 'Likizo'
where not exists (select 1 from public.staff_availability where staff_id = '88880000-0000-4000-8000-000000000003' and date = '2026-10-20');
insert into public.staff_availability (tenant_id, staff_id, date, start_time, end_time, is_off, reason)
select '11111111-1111-4111-8111-111111111111', '88880000-0000-4000-8000-000000000002', '2026-10-17', '08:00', '12:00', false, 'Nusu siku'
where not exists (select 1 from public.staff_availability where staff_id = '88880000-0000-4000-8000-000000000002' and date = '2026-10-17');

-- One real booking through the write path (idempotent: the key returns the same ticket on
-- re-seed): Asha Mwakyusa, sofa 3 seats, Fri 16 Oct 09:00–12:00 Dar, Neema assigned.
select public.create_booking_tx(jsonb_build_object(
  'tenant_id', '11111111-1111-4111-8111-111111111111',
  'booking_id', 'bbbb0000-0000-4000-8000-000000000001',
  'idempotency_key', 'booking_bbbb0000-0000-4000-8000-000000000001',
  'source', 'phone', 'locale', 'sw', 'created_by', 'aaaaaaaa-0000-4000-8000-000000000001',
  'customer', jsonb_build_object('phone_e164', '+255754123456', 'name', 'Asha Mwakyusa', 'phone_verified', true),
  'address', jsonb_build_object('area', 'Mbezi Beach', 'street', 'Mbezi Beach Road', 'landmark', 'Near the mosque',
                                'zone_id', '77770000-0000-4000-8000-000000000001'),
  'quote', jsonb_build_object('currency', 'TZS', 'subtotal_tzs', 45000, 'travel_fee_tzs', 0, 'discount_tzs', 0,
                              'tax_tzs', 0, 'total_tzs', 45000, 'deposit_tzs', 13500, 'balance_tzs', 31500,
                              'requires_review', false, 'has_estimate', false, 'est_duration_min', 90, 'crew_size', 1,
                              'zone', jsonb_build_object('zone_id', '77770000-0000-4000-8000-000000000001', 'name', 'Mbezi & Kimara',
                                                         'travel_fee_tzs', 0, 'serviceable', true, 'matched_by', 'area'),
                              'out_of_area', false, 'lines', '[]'::jsonb),
  'items', jsonb_build_array(jsonb_build_object('service_id', '55550000-0000-4000-8000-000000000001',
                                                'label_sw', 'Usafi wa sofa', 'label_en', 'Sofa cleaning',
                                                'input', jsonb_build_object('service_id', '55550000-0000-4000-8000-000000000001', 'qty', 3),
                                                'qty', 3, 'amount_tzs', 45000, 'requires_review', false)),
  'schedule', jsonb_build_object('start', '2026-10-16T06:00:00Z', 'end', '2026-10-16T09:00:00Z', 'capacity', 3),
  'payment_mode', 'ON_COMPLETION'
));

insert into public.assignments (id, tenant_id, booking_id, staff_id, starts_at, ends_at, is_lead) values
  ('99990000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'bbbb0000-0000-4000-8000-000000000001',
   '88880000-0000-4000-8000-000000000001', '2026-10-16T06:00:00Z', '2026-10-16T09:00:00Z', true)
on conflict (id) do nothing;

select public.transition_booking('bbbb0000-0000-4000-8000-000000000001', 'ASSIGNED', null,
                                 '{"actor":"staff:aaaaaaaa-0000-4000-8000-000000000001","actor_role":"OWNER","customer_visible":true}'::jsonb);

-- Second tenant gets a small catalog and one cleaner so isolation is visible.
insert into public.service_categories (id, tenant_id, name_sw, name_en, sort) values
  ('44440000-0000-4000-8000-000000000101', '22222222-2222-4222-8222-222222222222', 'Sofa', 'Sofa', 1)
on conflict (id) do nothing;
insert into public.services (id, tenant_id, category_id, name_sw, name_en, pricing_type, pricing_rule, duration_rule, crew_size, sort, active) values
  ('55550000-0000-4000-8000-000000000101', '22222222-2222-4222-8222-222222222222', '44440000-0000-4000-8000-000000000101',
   'Usafi wa sofa', 'Sofa cleaning', 'PER_SEAT', '{"price_tzs":12000,"min_charge_tzs":36000}', '{"base_min":30,"per_unit_min":20}', 1, 1, true)
on conflict (id) do nothing;
insert into public.service_zones (id, tenant_id, name, areas, travel_fee_tzs, serviceable, sort) values
  ('77770000-0000-4000-8000-000000000101', '22222222-2222-4222-8222-222222222222', 'Stone Town', '{"Stone Town","Mji Mkongwe"}', 0, true, 1)
on conflict (id) do nothing;
insert into public.staff (id, tenant_id, display_name, phone_e164, skills, active) values
  ('88880000-0000-4000-8000-000000000101', '22222222-2222-4222-8222-222222222222', 'Salma Juma', '+255754200001',
   '{55550000-0000-4000-8000-000000000101}', true)
on conflict (id) do nothing;
insert into public.service_addons (id, tenant_id, service_id, name_sw, name_en, price_tzs, per_unit, sort, active) values
  ('66660000-0000-4000-8000-000000000101', '22222222-2222-4222-8222-222222222222', null, 'Kuondoa harufu', 'Odour removal', 10000, false, 1, true)
on conflict (id) do nothing;

-- ===========================================================================
-- Phase 7 · notification templates (both tenants share the same template library)
-- ===========================================================================

insert into public.notification_templates (tenant_id, template_key, description, subject_sw, subject_en, body_sw, body_en, variables, active) values
  -- Usafi Bora
  ('11111111-1111-4111-8111-111111111111', 'booking_confirmation', 'Thibitisha mbekuko', 'Ombi lako limethibitishwa', 'Your booking is confirmed', 'Karibu {customer_name}! Ombi lako la {service_name} limethibitishwa kwa tarehe {booking_date} saa {booking_time}. Timu yetu itawasiliana na kabla ya huduma kuanza.', 'Welcome {customer_name}! Your booking for {service_name} is confirmed for {booking_date} at {booking_time}. Our team will reach out before the service begins.', '["customer_name","service_name","booking_date","booking_time"]', true),
  ('11111111-1111-4111-8111-111111111111', 'booking_reminder', 'Kikumbusho cha mbekuko', 'Kikumbusho: Kesho {booking_date}', 'Reminder: Tomorrow {booking_date}', 'Habari {customer_name}, tunakukumbusha kuwa kesho ({booking_date}) saa {booking_time} tuna huduma ya {service_name}. Tafadhali tayari kwa timu yetu.', 'Hi {customer_name}, a reminder that tomorrow ({booking_date}) at {booking_time} we have {service_name} scheduled. Please be ready for our team.', '["customer_name","booking_date","booking_time","service_name"]', true),
  ('11111111-1111-4111-8111-111111111111', 'payment_received', 'Thibitisho la malipo', 'Malipo yamepokelewa', 'Payment received', 'Asante {customer_name}! Tumepokea malipo yako ya {amount_tzs} TZS kwa huduma ya {service_name}. Risiti namba: {receipt_number}.', 'Thank you {customer_name}! We received your payment of {amount_tzs} TZS for {service_name}. Receipt number: {receipt_number}.', '["customer_name","amount_tzs","service_name","receipt_number"]', true),
  ('11111111-1111-4111-8111-111111111111', 'booking_cancelled', 'Mbeguko limefutwa', 'Ombi limefutwa', 'Booking cancelled', 'Habari {customer_name}, ombi lako la {service_name} limebatilishwa. Ikiwa hii ni kwa makosa tafadhiliana nasi.', 'Dear {customer_name}, your booking for {service_name} has been cancelled. If this was a mistake, please contact us.', '["customer_name","service_name"]', true),
  ('11111111-1111-4111-8111-111111111111', 'staff_assigned', 'Timu imeshughulikia', 'Staff assigned', 'Team assigned', 'Habari {customer_name}, timu yetu ya wafanyakazi imethibitishwa kwa huduma yako ya {service_name} tarehe {booking_date}. Kiongozi: {staff_name}.', 'Hi {customer_name}, our team is confirmed for your {service_name} service on {booking_date}. Lead: {staff_name}.', '["customer_name","service_name","booking_date","staff_name"]', true),
  ('11111111-1111-4111-8111-111111111111', 'service_completed', 'Huduma imetimizwa', 'Service completed', 'Service completed', 'Asante {customer_name}! Huduma yako ya {service_name} imekamilika. Tunatarajia kukutumia tena.', 'Thank you {customer_name}! Your {service_name} service has been completed. We look forward to serving you again.', '["customer_name","service_name"]', true),

  -- Pwani Fresh
  ('22222222-2222-4222-8222-222222222222', 'booking_confirmation', 'Thibitisha mbekuko', 'Ombi lako limethibitishwa', 'Your booking is confirmed', 'Karibu {customer_name}! Ombi lako la {service_name} limethibitishwa kwa tarehe {booking_date} saa {booking_time}. Timu yetu itawasiliana na kabla ya huduma kuanza.', 'Welcome {customer_name}! Your booking for {service_name} is confirmed for {booking_date} at {booking_time}. Our team will reach out before the service begins.', '["customer_name","service_name","booking_date","booking_time"]', true),
  ('22222222-2222-4222-8222-222222222222', 'booking_reminder', 'Kikumbusho cha mbekuko', 'Kikumbusho: Kesho {booking_date}', 'Reminder: Tomorrow {booking_date}', 'Habari {customer_name}, tunakukumbusha kuwa kesho ({booking_date}) saa {booking_time} tuna huduma ya {service_name}. Tafadhali tayari kwa timu yetu.', 'Hi {customer_name}, a reminder that tomorrow ({booking_date}) at {booking_time} we have {service_name} scheduled. Please be ready for our team.', '["customer_name","booking_date","booking_time","service_name"]', true),
  ('22222222-2222-4222-8222-222222222222', 'payment_received', 'Thibitisho la malipo', 'Malipo yamepokelewa', 'Payment received', 'Asante {customer_name}! Tumepokea malipo yako ya {amount_tzs} TZS kwa huduma ya {service_name}. Risiti namba: {receipt_number}.', 'Thank you {customer_name}! We received your payment of {amount_tzs} TZS for {service_name}. Receipt number: {receipt_number}.', '["customer_name","amount_tzs","service_name","receipt_number"]', true),
  ('22222222-2222-4222-8222-222222222222', 'booking_cancelled', 'Mbeguko limefutwa', 'Ombi limefutwa', 'Booking cancelled', 'Habari {customer_name}, ombi lako la {service_name} limebatilishwa. Ikiwa hii ni kwa makosa tafadhiliana nasi.', 'Dear {customer_name}, your booking for {service_name} has been cancelled. If this was a mistake, please contact us.', '["customer_name","service_name"]', true),
  ('22222222-2222-4222-8222-222222222222', 'staff_assigned', 'Timu imeshughulikia', 'Staff assigned', 'Team assigned', 'Habari {customer_name}, timu yetu ya wafanyakazi imethibitishwa kwa huduma yako ya {service_name} tarehe {booking_date}. Kiongozi: {staff_name}.', 'Hi {customer_name}, our team is confirmed for your {service_name} service on {booking_date}. Lead: {staff_name}.', '["customer_name","service_name","booking_date","staff_name"]', true),
  ('22222222-2222-4222-8222-222222222222', 'service_completed', 'Huduma imetimizwa', 'Service completed', 'Service completed', 'Asante {customer_name}! Huduma yako ya {service_name} imekamilika. Tunatarajia kukutumia tena.', 'Thank you {customer_name}! Your {service_name} service has been completed. We look forward to serving you again.', '["customer_name","service_name"]', true)
on conflict (tenant_id, template_key) do nothing;
