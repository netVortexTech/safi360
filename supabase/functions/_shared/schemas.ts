// zod schemas shared by Edge Functions (Deno, via deno.json import map) and the client
// (Vite, via the @shared alias). Every public input is validated with these before
// touching the database. Error messages are i18n keys, resolved by each consumer.
import { z } from 'zod';
import { BOOKING_SOURCES, MEMBER_ROLES } from './enums.ts';
import { quoteAddressInput, quoteItemInput, taxSettings } from './pricing/rules.ts';

export const E164_TZ_REGEX = /^\+255[1-9]\d{8}$/;

export const phoneE164 = z.string().trim().regex(E164_TZ_REGEX, { message: 'validation.phone.invalid' });

export const tzsAmount = z
  .number()
  .int({ message: 'validation.money.integer' })
  .nonnegative({ message: 'validation.money.nonnegative' })
  .max(1_000_000_000, { message: 'validation.money.too_large' });

export const tenantSlug = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, { message: 'validation.slug.too_short' })
  .max(40, { message: 'validation.slug.too_long' })
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, { message: 'validation.slug.format' });

export const ticketPrefix = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,5}$/, { message: 'validation.ticket_prefix.format' });

export const ticketRef = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{2,5}-\d{4}-\d{5}$/, { message: 'validation.ticket_ref.format' });

export const idempotencyKey = z
  .string()
  .regex(/^(booking|assignment|payment|manual_payment|quote)_[0-9a-f-]{32,36}$/, {
    message: 'validation.idempotency_key.format',
  });

export const bookingSource = z.enum(BOOKING_SOURCES);
export const memberRole = z.enum(MEMBER_ROLES);

export const locale = z.enum(['sw', 'en']);

/** Six-digit one-time code used by customer tracking and staff OTP login. */
export const otpCode = z.string().regex(/^\d{6}$/, { message: 'validation.otp.format' });

// ---- Tenant settings & branding (jsonb columns on tenants) --------------------

export const tenantBranding = z
  .object({
    display_name: z.string().trim().min(1).max(80).optional(),
    logo_path: z.string().max(300).optional(), // Storage path, resolved to a signed URL
    /** Tenant brand colour as 6-digit hex; applied through the --brand CSS variable only. */
    color: z
      .string()
      .regex(/^#[0-9A-Fa-f]{6}$/)
      .optional(),
    greeting_sw: z.string().max(300).optional(),
    greeting_en: z.string().max(300).optional(),
    terms_sw: z.string().max(4000).optional(),
    terms_en: z.string().max(4000).optional(),
  })
  .strict();
export type TenantBranding = z.infer<typeof tenantBranding>;

export const workingHours = z.record(
  z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  z
    .object({
      open: z.string().regex(/^\d{2}:\d{2}$/),
      close: z.string().regex(/^\d{2}:\d{2}$/),
      closed: z.boolean().default(false),
    })
    .strict(),
);

export const tenantSettings = z
  .object({
    deposit_pct: z.number().int().min(0).max(100).default(30),
    cancel_hours: z.number().int().min(0).max(168).default(4),
    slot_hold_minutes: z.number().int().min(5).max(60).default(15),
    travel_buffer_min: z.number().int().min(0).max(180).default(45),
    quote_expiry_hours: z.number().int().min(1).max(336).default(144),
    working_hours: workingHours.default({}),
    languages: z.array(locale).min(1).default(['sw', 'en']),
    default_locale: locale.default('sw'),
    /** Tax display on quotes; 'none' until the tenant registers for VAT. */
    tax: taxSettings.default({ mode: 'none', rate_pct: 18, label: 'VAT' }),
    /** Earliest bookable start = now + lead. */
    min_lead_minutes: z
      .number()
      .int()
      .min(0)
      .max(7 * 24 * 60)
      .default(120),
    slot_step_min: z.union([z.literal(30), z.literal(60)]).default(60),
  })
  .strict();
export type TenantSettings = z.infer<typeof tenantSettings>;

// ---- Public quote & availability requests (Edge Functions) -----------------------

export const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { message: 'validation.date.format' });

export const quoteRequest = z
  .object({
    slug: tenantSlug,
    items: z.array(quoteItemInput).min(1, { message: 'validation.items.empty' }).max(20),
    address: quoteAddressInput.nullish(),
  })
  .strict();
export type QuoteRequest = z.infer<typeof quoteRequest>;

export const availabilityRequest = z
  .object({
    slug: tenantSlug,
    items: z.array(quoteItemInput).min(1, { message: 'validation.items.empty' }).max(20),
    from: dateKey,
    to: dateKey,
    address: quoteAddressInput.nullish(),
  })
  .strict();
export type AvailabilityRequest = z.infer<typeof availabilityRequest>;

// ---- Customer OTP, booking creation, tracking, actions, payments -------------------

export const otpPurpose = z.enum(['booking', 'tracking']);

export const otpSendRequest = z
  .object({
    slug: tenantSlug,
    phone: phoneE164,
    purpose: otpPurpose,
    locale: locale.default('sw'),
  })
  .strict();
export type OtpSendRequest = z.infer<typeof otpSendRequest>;

export const otpVerifyRequest = z
  .object({
    slug: tenantSlug,
    phone: phoneE164,
    purpose: otpPurpose,
    code: otpCode,
  })
  .strict();
export type OtpVerifyRequest = z.infer<typeof otpVerifyRequest>;

/** Where the cleaners go. Typed fields are optional; a pin or an area is enough to price. */
export const bookingAddressInput = z
  .object({
    label: z.string().trim().max(60).optional(),
    region: z.string().trim().max(80).optional(),
    district: z.string().trim().max(80).optional(),
    ward: z.string().trim().max(80).optional(),
    street: z.string().trim().max(160).optional(),
    landmark: z.string().trim().max(200).optional(),
    area: z.string().trim().max(120).optional(),
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
  })
  .strict()
  .refine((a) => (a.lat == null) === (a.lng == null), {
    message: 'validation.address.pin_incomplete',
    path: ['lng'],
  });
export type BookingAddressInput = z.infer<typeof bookingAddressInput>;

export const paymentMode = z.enum(['DEPOSIT', 'ON_COMPLETION']);

export const createBookingRequest = z
  .object({
    slug: tenantSlug,
    idempotency_key: idempotencyKey,
    /** From otp_verify (purpose booking): proves the customer owns the phone. */
    verify_token: z.string().min(16).max(2000),
    customer: z
      .object({
        name: z.string().trim().min(2, { message: 'validation.name.too_short' }).max(120),
        email: z.string().trim().email({ message: 'validation.email.invalid' }).max(254).optional(),
      })
      .strict(),
    address: bookingAddressInput.nullish(),
    items: z.array(quoteItemInput).min(1, { message: 'validation.items.empty' }).max(20),
    /** ISO instant of the chosen slot; optional only when the quote needs an inspection. */
    slot: z
      .object({ start: z.string().datetime({ offset: true }) })
      .strict()
      .nullish(),
    payment_mode: paymentMode.default('ON_COMPLETION'),
    source: bookingSource.default('website'),
    locale: locale.default('sw'),
    notes: z.string().trim().max(1000).optional(),
    /** The total the customer saw; a different server price is reported, not silently charged. */
    expected_total_tzs: tzsAmount.optional(),
  })
  .strict();
export type CreateBookingRequest = z.infer<typeof createBookingRequest>;

export const trackingStartRequest = z
  .object({
    slug: tenantSlug,
    phone: phoneE164,
    ticket_ref: ticketRef.optional(),
    locale: locale.default('sw'),
  })
  .strict();
export type TrackingStartRequest = z.infer<typeof trackingStartRequest>;

export const trackingVerifyRequest = z
  .object({
    slug: tenantSlug,
    phone: phoneE164,
    code: otpCode,
    ticket_ref: ticketRef.optional(),
  })
  .strict();
export type TrackingVerifyRequest = z.infer<typeof trackingVerifyRequest>;

export const trackingViewRequest = z
  .object({
    slug: tenantSlug,
    token: z.string().min(16).max(2000),
    booking_id: z.string().uuid(),
  })
  .strict();
export type TrackingViewRequest = z.infer<typeof trackingViewRequest>;

export const customerActionKind = z.enum(['approve_quote', 'reject_quote', 'cancel', 'request_reschedule']);

export const customerActionRequest = z
  .object({
    slug: tenantSlug,
    token: z.string().min(16).max(2000),
    booking_id: z.string().uuid(),
    action: customerActionKind,
    reason: z.string().trim().max(300).optional(),
    /** request_reschedule: the customer's preferred new start (ISO) and a note. */
    preferred_start: z.string().datetime({ offset: true }).optional(),
    note: z.string().trim().max(500).optional(),
  })
  .strict();
export type CustomerActionRequest = z.infer<typeof customerActionRequest>;

export const paymentStartRequest = z
  .object({
    slug: tenantSlug,
    token: z.string().min(16).max(2000),
    booking_id: z.string().uuid(),
    kind: z.enum(['DEPOSIT', 'BALANCE']).default('DEPOSIT'),
    idempotency_key: idempotencyKey,
  })
  .strict();
export type PaymentStartRequest = z.infer<typeof paymentStartRequest>;

/** Mock provider callback: the outcome the tester picked plus the signed token from payment_start. */
export const mockPaymentCallback = z
  .object({
    provider: z.literal('MOCK'),
    provider_ref: z.string().min(8).max(120),
    outcome: z.enum(['SUCCESS', 'FAILED', 'EXPIRED', 'UNKNOWN']),
    signature: z.string().min(16).max(200),
  })
  .strict();
export type MockPaymentCallback = z.infer<typeof mockPaymentCallback>;

// ---- Edge Function envelopes ----------------------------------------------------

/** Standard error body returned by every Edge Function. field_errors map to form fields. */
export const apiError = z.object({
  code: z.string(),
  message: z.string(),
  field_errors: z.record(z.string(), z.string()).optional(),
  retryable: z.boolean().default(false),
});
export type ApiError = z.infer<typeof apiError>;

/** Convert a zod error into field_errors keyed by dotted path. */
export function toFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_root';
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
