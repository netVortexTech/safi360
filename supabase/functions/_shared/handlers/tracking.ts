// Track my booking: start (always "code sent"), verify (token scoped to the phone), view
// (customer-safe projection + the actions policy allows). Nothing about a booking is
// returned before the phone is proven; a mismatch sends nothing and still says "sent".
import { verifyToken } from '../otp.ts';
import type { QuoteResult } from '../pricing/types.ts';
import { trackingStartRequest, trackingVerifyRequest, trackingViewRequest } from '../schemas.ts';
import type { TenantSettings } from '../schemas.ts';
import { toErrorResult } from './errors.ts';
import { customerToken, issueOtp, otpErrorResult, verifyOtpCode } from './otp.ts';
import { settingsOf } from './quote.ts';
import type { BookingDeps, BookingDetail, BookingRow, HandlerResult, PublicTenantInfo } from './types.ts';
import type { BookingStatus } from '../enums.ts';

export interface TrackingStartResponse {
  status: 'code_sent';
}

export interface BookingSummary {
  id: string;
  ticket_ref: string;
  status: BookingStatus;
  scheduled_start: string | null;
  service_label_sw: string;
  service_label_en: string;
  total_tzs: number;
  created_at: string;
}

export interface TrackingVerifyResponse {
  token: string;
  expires_at: string;
  /** The ticket the customer typed, when it is theirs. */
  booking_id: string | null;
  /** Every booking on this phone (lost-ticket recovery). */
  bookings: BookingSummary[];
}

export type CustomerActionKind =
  'approve_quote' | 'reject_quote' | 'cancel' | 'request_reschedule' | 'pay_deposit';

export interface TrackingViewResponse {
  booking: {
    id: string;
    ticket_ref: string;
    status: BookingStatus;
    source: string;
    scheduled_start: string | null;
    scheduled_end: string | null;
    duration_min: number;
    crew_size: number;
    flags: string[];
    payment_mode: 'DEPOSIT' | 'ON_COMPLETION';
    total_tzs: number;
    deposit_tzs: number;
    paid_tzs: number;
    balance_tzs: number;
    locale: string;
    hold_expires_at: string | null;
    created_at: string;
    outcome_reason: string | null;
    address: {
      label?: string;
      area?: string;
      street?: string;
      landmark?: string;
      ward?: string;
      district?: string;
    };
    notes_customer: string | null;
  };
  customer: { name: string; phone_masked: string };
  items: {
    label_sw: string;
    label_en: string;
    qty: number;
    amount_tzs: number | null;
    requires_review: boolean;
  }[];
  quote: QuoteResult | null;
  timeline: {
    kind: string;
    to_status: BookingStatus | null;
    message_key: string | null;
    at: string;
    data: Record<string, unknown>;
  }[];
  payments: {
    id: string;
    kind: string;
    amount_tzs: number;
    status: string;
    provider: string;
    created_at: string;
  }[];
  actions: CustomerActionKind[];
  policy: { cancel_hours: number; cancel_within_policy: boolean; cancel_deadline: string | null };
}

const CANCELLABLE: BookingStatus[] = [
  'AWAITING_REVIEW',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'ASSIGNED',
];
const RESCHEDULABLE: BookingStatus[] = ['AWAITING_REVIEW', 'AWAITING_PAYMENT', 'CONFIRMED', 'ASSIGNED'];

export function cancelDeadline(
  booking: Pick<BookingRow, 'scheduled_start'>,
  settings: TenantSettings,
): Date | null {
  if (!booking.scheduled_start) return null;
  return new Date(Date.parse(booking.scheduled_start) - settings.cancel_hours * 3_600_000);
}

/** The customer-side policy: what the tracking page may offer for this booking right now. */
export function allowedActions(
  booking: Pick<BookingRow, 'status' | 'scheduled_start' | 'payment_mode' | 'deposit_tzs' | 'paid_tzs'>,
  settings: TenantSettings,
  now: Date,
  paymentsConfigured: boolean,
): { actions: CustomerActionKind[]; cancel_within_policy: boolean; cancel_deadline: string | null } {
  const deadline = cancelDeadline(booking, settings);
  const withinPolicy = deadline == null || now.getTime() <= deadline.getTime();
  const actions: CustomerActionKind[] = [];
  if (booking.status === 'AWAITING_CUSTOMER_APPROVAL') actions.push('approve_quote', 'reject_quote');
  if (booking.status === 'AWAITING_PAYMENT' && paymentsConfigured && booking.deposit_tzs > booking.paid_tzs) {
    actions.push('pay_deposit');
  }
  if (CANCELLABLE.includes(booking.status)) actions.push('cancel');
  if (RESCHEDULABLE.includes(booking.status) && booking.scheduled_start && withinPolicy)
    actions.push('request_reschedule');
  return { actions, cancel_within_policy: withinPolicy, cancel_deadline: deadline?.toISOString() ?? null };
}

export function maskPhone(phone: string): string {
  return `${phone.slice(0, 6)}****${phone.slice(-3)}`;
}

const VISIBLE_DATA_KEYS = ['reason', 'amount_tzs', 'kind', 'preferred_start', 'from', 'to'] as const;
const ADDRESS_KEYS = ['label', 'area', 'street', 'landmark', 'ward', 'district'] as const;

/** The parts of an address snapshot a customer may see back (no coordinates, no notes). */
export function publicAddress(snapshot: Record<string, unknown>): TrackingViewResponse['booking']['address'] {
  const out: TrackingViewResponse['booking']['address'] = {};
  for (const k of ADDRESS_KEYS) {
    const v = snapshot[k];
    if (typeof v === 'string' && v.trim()) out[k] = v;
  }
  return out;
}

export function projectBooking(
  detail: BookingDetail,
  settings: TenantSettings,
  now: Date,
  paymentsConfigured: boolean,
): TrackingViewResponse {
  const b = detail.booking;
  const policy = allowedActions(b, settings, now, paymentsConfigured);
  return {
    booking: {
      id: b.id,
      ticket_ref: b.ticket_ref,
      status: b.status,
      source: b.source,
      scheduled_start: b.scheduled_start,
      scheduled_end: b.scheduled_end,
      duration_min: b.duration_min,
      crew_size: b.crew_size,
      flags: b.flags,
      payment_mode: b.payment_mode,
      total_tzs: b.total_tzs,
      deposit_tzs: b.deposit_tzs,
      paid_tzs: b.paid_tzs,
      balance_tzs: Math.max(0, b.total_tzs - b.paid_tzs),
      locale: b.locale,
      hold_expires_at: b.hold_expires_at,
      created_at: b.created_at,
      outcome_reason: b.outcome_reason,
      address: publicAddress(b.address_snapshot),
      notes_customer: b.notes_customer,
    },
    customer: { name: detail.customer.name, phone_masked: maskPhone(detail.customer.phone_e164) },
    items: detail.items.map((i) => ({
      label_sw: i.label_sw,
      label_en: i.label_en,
      qty: i.qty,
      amount_tzs: i.amount_tzs,
      requires_review: i.requires_review,
    })),
    quote:
      detail.quote && detail.quote.snapshot && typeof detail.quote.snapshot === 'object'
        ? (detail.quote.snapshot as QuoteResult)
        : null,
    timeline: detail.events
      .filter((e) => e.customer_visible)
      .map((e) => ({
        kind: e.kind,
        to_status: e.to_status,
        message_key: e.message_key,
        at: e.created_at,
        data: Object.fromEntries(VISIBLE_DATA_KEYS.filter((k) => k in e.data).map((k) => [k, e.data[k]])),
      })),
    payments: detail.payments.map((p) => ({
      id: p.id,
      kind: p.kind,
      amount_tzs: p.amount_tzs,
      status: p.status,
      provider: p.provider,
      created_at: p.created_at,
    })),
    actions: policy.actions,
    policy: {
      cancel_hours: settings.cancel_hours,
      cancel_within_policy: policy.cancel_within_policy,
      cancel_deadline: policy.cancel_deadline,
    },
  };
}

function summarise(b: BookingRow & { service_label_sw: string; service_label_en: string }): BookingSummary {
  return {
    id: b.id,
    ticket_ref: b.ticket_ref,
    status: b.status,
    scheduled_start: b.scheduled_start,
    service_label_sw: b.service_label_sw,
    service_label_en: b.service_label_en,
    total_tzs: b.total_tzs,
    created_at: b.created_at,
  };
}

/** Resolve a tracking token to the tenant + phone it proves, for view/action/payment. */
export async function requireTrackingToken(
  deps: BookingDeps,
  tenant: PublicTenantInfo,
  token: string,
  purposes: ('booking' | 'tracking')[] = ['tracking'],
): Promise<{ phone: string }> {
  const payload = await verifyToken(token, deps.env.tokenSecret, deps.now());
  if (payload.tenant_id !== tenant.id || !purposes.includes(payload.purpose))
    throw new Error('token_purpose_mismatch');
  return { phone: payload.phone };
}

/** The booking, only if it belongs to the phone the token proves. */
export async function requireOwnBooking(
  deps: BookingDeps,
  tenant: PublicTenantInfo,
  phone: string,
  bookingId: string,
): Promise<BookingDetail> {
  const detail = await deps.loadBookingDetail(tenant.id, bookingId);
  if (!detail || detail.customer.phone_e164 !== phone) throw new Error('booking_not_found');
  return detail;
}

export async function handleTrackingStart(rawBody: unknown, deps: BookingDeps): Promise<HandlerResult> {
  try {
    const input = trackingStartRequest.parse(rawBody);
    const tenant = await deps.resolveTenant(input.slug);
    await deps.rateLimit(tenant.id, 'track_request_code');
    await deps.rateLimitPhone(tenant.id, 'otp_send', input.phone);
    if (!deps.sms) throw new Error('sms_not_configured');
    const bookings = await deps.bookingsForPhone(tenant.id, input.phone);
    const matches = input.ticket_ref
      ? bookings.some((b) => b.ticket_ref === input.ticket_ref)
      : bookings.length > 0;
    if (matches) {
      await issueOtp(
        deps,
        tenant,
        input.phone,
        'tracking',
        input.locale,
        input.ticket_ref ? { ticket_ref: input.ticket_ref } : {},
      );
    }
    const body: TrackingStartResponse = { status: 'code_sent' };
    return { status: 200, body };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function handleTrackingVerify(rawBody: unknown, deps: BookingDeps): Promise<HandlerResult> {
  try {
    const input = trackingVerifyRequest.parse(rawBody);
    const tenant = await deps.resolveTenant(input.slug);
    await deps.rateLimit(tenant.id, 'track_verify_code');
    await verifyOtpCode(deps, tenant.id, input.phone, 'tracking', input.code);
    const bookings = await deps.bookingsForPhone(tenant.id, input.phone);
    const matched = input.ticket_ref
      ? (bookings.find((b) => b.ticket_ref === input.ticket_ref) ?? null)
      : null;
    const token = await customerToken(deps, tenant.id, input.phone, 'tracking');
    const body: TrackingVerifyResponse = {
      ...token,
      booking_id: matched?.id ?? null,
      bookings: bookings.map(summarise),
    };
    return { status: 200, body };
  } catch (err) {
    return otpErrorResult(err);
  }
}

export async function handleTrackingView(rawBody: unknown, deps: BookingDeps): Promise<HandlerResult> {
  try {
    const input = trackingViewRequest.parse(rawBody);
    const tenant = await deps.resolveTenant(input.slug);
    await deps.rateLimit(tenant.id, 'tracking_view');
    const { phone } = await requireTrackingToken(deps, tenant, input.token, ['tracking', 'booking']);
    const detail = await requireOwnBooking(deps, tenant, phone, input.booking_id);
    const body = projectBooking(detail, settingsOf(tenant), deps.now(), deps.payments != null);
    return { status: 200, body };
  } catch (err) {
    return toErrorResult(err);
  }
}
