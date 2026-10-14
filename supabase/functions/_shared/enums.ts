// Source of truth for every enum shared by the database, Edge Functions and the client.
// Keep in sync with supabase/migrations/0002_enums.sql — the db test suite asserts parity.
// This file must stay dependency-free so Deno and Vite can both import it.

export const BOOKING_STATUSES = [
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
  'EXPIRED',
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number];

/** Terminal outcomes — require outcome_reason. */
export const TERMINAL_STATUSES = [
  'CANCELLED',
  'QUOTE_REJECTED',
  'NO_SHOW',
  'EXPIRED',
] as const satisfies readonly BookingStatus[];

export const BOOKING_SOURCES = [
  'website',
  'booking_widget',
  'whatsapp',
  'instagram',
  'facebook',
  'phone',
  'walk_in',
  'referral',
  'admin_created',
] as const;
export type BookingSource = (typeof BOOKING_SOURCES)[number];

export const PAYMENT_STATUSES = ['PENDING', 'SUCCESS', 'FAILED', 'EXPIRED', 'UNKNOWN', 'REFUNDED'] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const NOTIFICATION_STATUSES = ['queued', 'sent', 'delivered', 'read', 'failed'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const MEMBER_ROLES = ['OWNER', 'MANAGER', 'DISPATCHER', 'CLEANER'] as const;
export type MemberRole = (typeof MEMBER_ROLES)[number];

export const PRICING_TYPES = [
  'PER_UNIT',
  'PER_VARIANT',
  'PER_AREA',
  'PER_ROOM',
  'FLAT',
  'CUSTOM_QUOTE',
] as const;
export type PricingType = (typeof PRICING_TYPES)[number];

export const TENANT_STATUSES = ['TRIAL', 'ACTIVE', 'PAST_DUE', 'SUSPENDED'] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const BOOKING_FLAGS = ['RESCHEDULED', 'NEEDS_REVIEW'] as const;
export type BookingFlag = (typeof BOOKING_FLAGS)[number];

/**
 * Allowed status transitions (prompt + blueprint §3). The database function
 * transition_booking() enforces the same table; the client uses it only to decide
 * which actions to offer.
 */
export const ALLOWED_TRANSITIONS: Readonly<Record<BookingStatus, readonly BookingStatus[]>> = {
  REQUEST_RECEIVED: ['AWAITING_REVIEW', 'AWAITING_PAYMENT', 'CONFIRMED', 'CANCELLED'],
  AWAITING_REVIEW: ['AWAITING_CUSTOMER_APPROVAL', 'AWAITING_PAYMENT', 'CONFIRMED', 'CANCELLED'],
  AWAITING_CUSTOMER_APPROVAL: ['AWAITING_PAYMENT', 'CONFIRMED', 'QUOTE_REJECTED', 'EXPIRED', 'CANCELLED'],
  AWAITING_PAYMENT: ['CONFIRMED', 'EXPIRED', 'CANCELLED'],
  CONFIRMED: ['ASSIGNED', 'CANCELLED', 'NO_SHOW'],
  ASSIGNED: ['EN_ROUTE', 'CONFIRMED', 'CANCELLED', 'NO_SHOW'],
  EN_ROUTE: ['ARRIVED', 'NO_SHOW'],
  ARRIVED: ['IN_PROGRESS', 'NO_SHOW'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: ['CLOSED'],
  CLOSED: [],
  CANCELLED: [],
  QUOTE_REJECTED: [],
  NO_SHOW: [],
  EXPIRED: [],
};

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: BookingStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}
