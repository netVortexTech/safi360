// zod schemas shared by Edge Functions (Deno, via deno.json import map) and the client
// (Vite, via the @shared alias). Every public input is validated with these before
// touching the database. Error messages are i18n keys, resolved by each consumer.
import { z } from 'zod';
import { BOOKING_SOURCES, MEMBER_ROLES } from './enums.ts';

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
  })
  .strict();
export type TenantSettings = z.infer<typeof tenantSettings>;

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
