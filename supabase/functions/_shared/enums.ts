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

/** Database enum order (0002 + 0006). The UI orders them differently; see pricing/rules.ts. */
export const PRICING_TYPES = [
  'PER_UNIT',
  'PER_SEAT',
  'PER_VARIANT',
  'PER_AREA',
  'PER_ROOM',
  'FLAT',
  'INSPECTION_REQUIRED',
  'CUSTOM_QUOTE',
] as const;
export type PricingType = (typeof PRICING_TYPES)[number];

/** Types that cannot produce a number without a human: the booking routes to AWAITING_REVIEW. */
export const REVIEW_PRICING_TYPES = [
  'INSPECTION_REQUIRED',
  'CUSTOM_QUOTE',
] as const satisfies readonly PricingType[];

export const PAY_TYPES = ['PER_JOB', 'DAILY', 'MONTHLY'] as const;
export type PayType = (typeof PAY_TYPES)[number];

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

/** Who may perform a transition: tenant roles, the customer (verified portal token) or the system. */
export type TransitionActor = MemberRole | 'CUSTOMER' | 'SYSTEM';

const OFFICE: readonly TransitionActor[] = ['OWNER', 'MANAGER', 'DISPATCHER'];
const FIELD: readonly TransitionActor[] = ['CLEANER', 'OWNER', 'MANAGER', 'DISPATCHER'];

/**
 * Actors per transition. Mirrors app.booking_transitions (migration 0013); the db test
 * suite asserts the two are identical.
 */
export type TransitionKey = `${BookingStatus}->${BookingStatus}`;

export const TRANSITION_ACTORS: Readonly<Partial<Record<TransitionKey, readonly TransitionActor[]>>> = {
  'REQUEST_RECEIVED->AWAITING_REVIEW': ['SYSTEM', ...OFFICE],
  'REQUEST_RECEIVED->AWAITING_PAYMENT': ['SYSTEM', ...OFFICE],
  'REQUEST_RECEIVED->CONFIRMED': ['SYSTEM', ...OFFICE],
  'REQUEST_RECEIVED->CANCELLED': ['SYSTEM', ...OFFICE, 'CUSTOMER'],
  'AWAITING_REVIEW->AWAITING_CUSTOMER_APPROVAL': OFFICE,
  'AWAITING_REVIEW->AWAITING_PAYMENT': OFFICE,
  'AWAITING_REVIEW->CONFIRMED': OFFICE,
  'AWAITING_REVIEW->CANCELLED': [...OFFICE, 'CUSTOMER'],
  'AWAITING_CUSTOMER_APPROVAL->AWAITING_PAYMENT': ['CUSTOMER', ...OFFICE],
  'AWAITING_CUSTOMER_APPROVAL->CONFIRMED': ['CUSTOMER', ...OFFICE],
  'AWAITING_CUSTOMER_APPROVAL->QUOTE_REJECTED': ['CUSTOMER', ...OFFICE],
  'AWAITING_CUSTOMER_APPROVAL->EXPIRED': ['SYSTEM'],
  'AWAITING_CUSTOMER_APPROVAL->CANCELLED': ['CUSTOMER', ...OFFICE],
  'AWAITING_PAYMENT->CONFIRMED': ['SYSTEM', 'OWNER', 'MANAGER'],
  'AWAITING_PAYMENT->EXPIRED': ['SYSTEM'],
  'AWAITING_PAYMENT->CANCELLED': ['CUSTOMER', ...OFFICE],
  'CONFIRMED->ASSIGNED': OFFICE,
  'CONFIRMED->CANCELLED': ['CUSTOMER', ...OFFICE],
  'CONFIRMED->NO_SHOW': OFFICE,
  'ASSIGNED->EN_ROUTE': FIELD,
  'ASSIGNED->CONFIRMED': OFFICE,
  'ASSIGNED->CANCELLED': ['CUSTOMER', ...OFFICE],
  'ASSIGNED->NO_SHOW': FIELD,
  'EN_ROUTE->ARRIVED': FIELD,
  'EN_ROUTE->NO_SHOW': FIELD,
  'ARRIVED->IN_PROGRESS': FIELD,
  'ARRIVED->NO_SHOW': FIELD,
  'IN_PROGRESS->COMPLETED': FIELD,
  'COMPLETED->CLOSED': ['SYSTEM', ...OFFICE],
};

export function transitionActors(from: BookingStatus, to: BookingStatus): readonly TransitionActor[] {
  return TRANSITION_ACTORS[`${from}->${to}`] ?? [];
}

export const EXCEPTION_KINDS = [
  'NEEDS_REVIEW',
  'SLOT_CONFLICT',
  'RESCHEDULE_REQUESTED',
  'CANCEL_OUTSIDE_POLICY',
  'PAYMENT_UNKNOWN',
  'OUT_OF_AREA',
  'POSSIBLE_DUPLICATE',
] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

export const JOB_EVENT_KINDS = [
  'created',
  'status_changed',
  'note',
  'customer_action',
  'payment',
  'assignment',
  'reschedule_requested',
  'rescheduled',
  'hold_expired',
] as const;
export type JobEventKind = (typeof JOB_EVENT_KINDS)[number];

export const PAYMENT_PROVIDERS = ['MOCK', 'SELCOM', 'AZAMPAY', 'MANUAL'] as const;
export type PaymentProvider = (typeof PAYMENT_PROVIDERS)[number];

export const PAYMENT_MODES = ['DEPOSIT', 'ON_COMPLETION'] as const;
export type PaymentMode = (typeof PAYMENT_MODES)[number];

export const QUOTE_STATUSES = ['DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'EXPIRED', 'SUPERSEDED'] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const OTP_PURPOSES = ['booking', 'tracking'] as const;
export type OtpPurpose = (typeof OTP_PURPOSES)[number];

/** Actions a verified customer may take from the tracking page, decided by policy server-side. */
export const CUSTOMER_ACTIONS = [
  'approve_quote',
  'reject_quote',
  'cancel',
  'request_reschedule',
  'pay_deposit',
] as const;
export type CustomerAction = (typeof CUSTOMER_ACTIONS)[number];

export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function isTerminalStatus(status: BookingStatus): boolean {
  return (TERMINAL_STATUSES as readonly string[]).includes(status);
}
