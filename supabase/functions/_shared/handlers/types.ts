// Dependency interfaces for the public request handlers. The Deno entrypoints supply a
// Supabase-backed implementation (supabase-deps.ts); tests supply in-memory fakes.
import type { Catalog } from '../pricing/quote.ts';
import type { AvailabilityRule, BusyInterval, ReservedCrew, StaffMember } from '../availability/slots.ts';
import type { BookingSource, BookingStatus, PaymentStatus } from '../enums.ts';
import type { OtpPurpose } from '../otp.ts';
import type { PaymentProvider } from '../payments/provider.ts';
import type { RateLimitAction } from '../rate-limit.ts';
import type { SmsProvider } from '../sms/provider.ts';

export interface PublicTenantInfo {
  id: string;
  slug: string;
  name: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';
  settings: unknown;
  base_lat: number | null;
  base_lng: number | null;
}

export interface StaffData {
  staff: StaffMember[];
  availability: AvailabilityRule[];
  busy: BusyInterval[];
  /** Unassigned crew held by live bookings in the range (0012/0013 reserving rules). */
  reserved: ReservedCrew[];
}

export type PublicAction = RateLimitAction;

export interface PublicDeps {
  /** Throws Error('tenant_not_found') / Error('tenant_suspended'). */
  resolveTenant(slug: string): Promise<PublicTenantInfo>;
  /** Throws Error('rate_limited'). */
  rateLimit(tenantId: string, action: PublicAction): Promise<void>;
  /** Active, non-deleted catalog rows for the tenant, read fresh on every call. */
  loadCatalog(tenantId: string): Promise<Catalog>;
  /** Active staff, every availability rule, and live assignments touching [from, to]. */
  loadStaff(tenantId: string, from: string, to: string): Promise<StaffData>;
  now(): Date;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}

// ---- booking write path --------------------------------------------------------------

export interface CustomerOtpRow {
  id: string;
  tenant_id: string;
  phone_e164: string;
  purpose: OtpPurpose;
  code_hash: string;
  salt: string;
  expires_at: string;
  attempts: number;
  max_attempts: number;
  consumed_at: string | null;
  scope: Record<string, unknown>;
}

export interface OtpStore {
  /** Store a new hashed code and retire every earlier unconsumed code for the same key. */
  issue(row: Omit<CustomerOtpRow, 'id' | 'attempts' | 'max_attempts' | 'consumed_at'>): Promise<void>;
  /**
   * Atomically spend one attempt on the latest live code (unconsumed, unexpired, attempts
   * left) and return it; null when there is no such code.
   */
  claim(tenantId: string, phone: string, purpose: OtpPurpose): Promise<CustomerOtpRow | null>;
  /** The latest code for the key regardless of state, to explain a failed claim. */
  latest(tenantId: string, phone: string, purpose: OtpPurpose): Promise<CustomerOtpRow | null>;
  consume(id: string): Promise<void>;
}

export interface CreateBookingResult {
  booking_id: string;
  ticket_ref: string;
  status: BookingStatus;
  created: boolean;
  hold_expires_at: string | null;
  customer_id?: string;
  quote_id?: string;
}

export interface BookingRow {
  id: string;
  tenant_id: string;
  ticket_ref: string;
  customer_id: string;
  status: BookingStatus;
  source: BookingSource;
  quote_id: string | null;
  scheduled_start: string | null;
  scheduled_end: string | null;
  duration_min: number;
  crew_size: number;
  flags: string[];
  payment_mode: 'DEPOSIT' | 'ON_COMPLETION';
  total_tzs: number;
  deposit_tzs: number;
  paid_tzs: number;
  locale: 'sw' | 'en';
  notes_customer: string | null;
  outcome_reason: string | null;
  hold_expires_at: string | null;
  address_snapshot: Record<string, unknown>;
  created_at: string;
  confirmed_at: string | null;
  cancelled_at: string | null;
}

export interface BookingItemRow {
  item_index: number;
  service_id: string | null;
  label_sw: string;
  label_en: string;
  input: Record<string, unknown>;
  qty: number;
  amount_tzs: number | null;
  requires_review: boolean;
}

export interface JobEventRow {
  id: number;
  kind: string;
  from_status: BookingStatus | null;
  to_status: BookingStatus | null;
  actor_kind: 'customer' | 'staff' | 'system';
  customer_visible: boolean;
  message_key: string | null;
  data: Record<string, unknown>;
  created_at: string;
}

export interface PaymentRow {
  id: string;
  tenant_id: string;
  booking_id: string;
  kind: 'DEPOSIT' | 'BALANCE';
  provider: 'MOCK' | 'SELCOM' | 'AZAMPAY' | 'MANUAL';
  provider_ref: string | null;
  amount_tzs: number;
  status: PaymentStatus;
  idempotency_key: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface BookingDetail {
  booking: BookingRow;
  customer: { phone_e164: string; name: string; locale: string };
  items: BookingItemRow[];
  events: JobEventRow[];
  payments: PaymentRow[];
  quote: { id: string; status: string; snapshot: unknown; expires_at: string | null } | null;
}

export interface TransitionMeta {
  actor: string;
  actor_role?: string;
  capacity?: number;
  customer_visible?: boolean;
  message_key?: string;
  data?: Record<string, unknown>;
}

export interface BookingDeps extends PublicDeps {
  env: {
    /** APP_ENV !== 'production': the only place mock adapters are allowed. */
    sandbox: boolean;
    tokenSecret: string;
  };
  sms: SmsProvider | null;
  payments: PaymentProvider | null;
  otp: OtpStore;
  /** Throws Error('rate_limited'); keyed by phone instead of IP. */
  rateLimitPhone(tenantId: string, action: PublicAction, phone: string): Promise<void>;
  /** create_booking_tx. Throws Error('slot_unavailable' | 'idempotency_mismatch' | …). */
  createBooking(payload: Record<string, unknown>): Promise<CreateBookingResult>;
  /** expire_booking_holds; best effort after a create. */
  expireHolds(): Promise<void>;
  transition(
    bookingId: string,
    to: BookingStatus,
    reason: string | null,
    meta: TransitionMeta,
  ): Promise<{ status: BookingStatus; changed: boolean }>;
  addJobEvent(
    bookingId: string,
    kind: string,
    customerVisible: boolean,
    messageKey: string | null,
    data: Record<string, unknown>,
    meta: TransitionMeta,
  ): Promise<void>;
  openException(
    bookingId: string,
    kind: string,
    details: Record<string, unknown>,
    severity: 'low' | 'normal' | 'high',
    meta: TransitionMeta,
  ): Promise<void>;
  /** Every booking of a customer phone in the tenant, newest first. */
  bookingsForPhone(
    tenantId: string,
    phone: string,
  ): Promise<(BookingRow & { service_label_sw: string; service_label_en: string })[]>;
  /** Customer-submitted comments/complaints on one booking, newest first. */
  feedbackForBooking(
    tenantId: string,
    bookingId: string,
  ): Promise<
    {
      id: string;
      kind: string;
      rating: number | null;
      body: string;
      status: string;
      response: string | null;
      created_at: string;
    }[]
  >;
  /** Insert a verified customer's comment/complaint. */
  submitFeedback(input: {
    tenantId: string;
    bookingId: string;
    customerId: string | null;
    kind: 'COMMENT' | 'COMPLAINT';
    rating: number | null;
    body: string;
  }): Promise<{ id: string }>;
  loadBookingDetail(tenantId: string, bookingId: string): Promise<BookingDetail | null>;
  insertPayment(row: {
    tenant_id: string;
    booking_id: string;
    kind: 'DEPOSIT' | 'BALANCE';
    provider: PaymentRow['provider'];
    amount_tzs: number;
    idempotency_key: string;
  }): Promise<PaymentRow>;
  findPaymentByKey(tenantId: string, idempotencyKey: string): Promise<PaymentRow | null>;
  findPaymentByRef(provider: PaymentRow['provider'], providerRef: string): Promise<PaymentRow | null>;
  setPaymentRef(paymentId: string, providerRef: string, raw: Record<string, unknown>): Promise<void>;
  /** apply_payment_result. */
  applyPaymentResult(
    paymentId: string,
    status: PaymentStatus,
    providerRef: string | null,
    raw: Record<string, unknown>,
  ): Promise<{ changed: boolean; booking_status?: BookingStatus }>;
}
