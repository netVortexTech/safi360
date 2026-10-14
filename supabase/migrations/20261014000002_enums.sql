-- 0002 · enums
-- Source of truth shared with supabase/functions/_shared/enums.ts; the db test suite
-- asserts the two lists are identical.

create type public.booking_status as enum (
  'REQUEST_RECEIVED',
  'AWAITING_REVIEW',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CLOSED',
  'CANCELLED',
  'QUOTE_REJECTED',
  'NO_SHOW',
  'EXPIRED'
);

create type public.booking_source as enum (
  'website',
  'booking_widget',
  'whatsapp',
  'instagram',
  'facebook',
  'phone',
  'walk_in',
  'referral',
  'admin_created'
);

create type public.payment_status as enum (
  'PENDING',
  'SUCCESS',
  'FAILED',
  'EXPIRED',
  'UNKNOWN',
  'REFUNDED'
);

create type public.notification_status as enum (
  'queued',
  'sent',
  'delivered',
  'read',
  'failed'
);

create type public.member_role as enum (
  'OWNER',
  'MANAGER',
  'DISPATCHER',
  'CLEANER'
);

create type public.pricing_type as enum (
  'PER_UNIT',
  'PER_VARIANT',
  'PER_AREA',
  'PER_ROOM',
  'FLAT',
  'CUSTOM_QUOTE'
);

create type public.tenant_status as enum (
  'TRIAL',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED'
);
