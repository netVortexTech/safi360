// Error → HandlerResult mapping shared by every public handler. Mirrors http.ts, but
// returns plain data so handlers stay runtime-agnostic and unit-testable.
import { z } from 'zod';
import { SlotError } from '../availability/slots.ts';
import { TokenError } from '../otp.ts';
import { QuoteError } from '../pricing/types.ts';
import { toFieldErrors, type ApiError } from '../schemas.ts';
import type { HandlerResult } from './types.ts';

export function errorResult(
  code: string,
  message: string,
  status: number,
  extra: Partial<ApiError> = {},
): HandlerResult {
  const body: ApiError = { code, message, retryable: false, ...extra };
  return { status, body };
}

export function toErrorResult(err: unknown): HandlerResult {
  if (err instanceof z.ZodError) {
    return errorResult('validation_failed', 'validation.failed', 422, { field_errors: toFieldErrors(err) });
  }
  if (err instanceof QuoteError) {
    return errorResult(err.code, `quote.error.${err.code}`, 422, {
      field_errors: { [err.path.join('.')]: `quote.error.${err.code}` },
    });
  }
  if (err instanceof SlotError) {
    return errorResult(err.code, `availability.error.${err.code}`, 422);
  }
  if (err instanceof TokenError) {
    return errorResult(err.code, `errors.${err.code}`, 401);
  }
  if (err instanceof Error) {
    // Postgres raises reach us as "message" text; map the known business codes.
    const code = KNOWN_CODES[err.message] ?? KNOWN_CODES[firstWord(err.message)];
    if (code) return errorResult(code.code, code.message, code.status, code.extra);
  }
  return errorResult('internal', 'errors.internal', 500, { retryable: true });
}

function firstWord(message: string): string {
  return message.split(/[\s:]/)[0] ?? message;
}

const KNOWN_CODES: Record<
  string,
  { code: string; message: string; status: number; extra?: Partial<ApiError> }
> = {
  tenant_not_found: { code: 'tenant_not_found', message: 'errors.tenant_not_found', status: 404 },
  tenant_suspended: { code: 'tenant_suspended', message: 'errors.tenant_suspended', status: 403 },
  rate_limited: {
    code: 'rate_limited',
    message: 'errors.rate_limited',
    status: 429,
    extra: { retryable: true },
  },
  tenant_settings_invalid: { code: 'tenant_settings_invalid', message: 'errors.internal', status: 500 },
  slot_unavailable: {
    code: 'slot_unavailable',
    message: 'booking.error.slot_unavailable',
    status: 409,
    extra: { retryable: true },
  },
  quote_changed: {
    code: 'quote_changed',
    message: 'booking.error.quote_changed',
    status: 409,
    extra: { retryable: true },
  },
  idempotency_mismatch: {
    code: 'idempotency_mismatch',
    message: 'booking.error.idempotency_mismatch',
    status: 409,
  },
  slot_required: { code: 'slot_required', message: 'booking.error.slot_required', status: 422 },
  slot_in_past: { code: 'slot_in_past', message: 'booking.error.slot_in_past', status: 422 },
  out_of_area: { code: 'out_of_area', message: 'booking.error.out_of_area', status: 422 },
  phone_not_verified: { code: 'phone_not_verified', message: 'errors.phone_not_verified', status: 401 },
  token_purpose_mismatch: { code: 'token_invalid', message: 'errors.token_invalid', status: 401 },
  otp_invalid: { code: 'otp_invalid', message: 'auth.errors.invalid_code', status: 401 },
  otp_expired: { code: 'otp_expired', message: 'auth.errors.expired', status: 401 },
  otp_exhausted: { code: 'otp_exhausted', message: 'auth.errors.rate_limited', status: 429 },
  sms_not_configured: { code: 'sms_not_configured', message: 'errors.sms_not_configured', status: 503 },
  payment_not_configured: {
    code: 'payment_not_configured',
    message: 'errors.payment_not_configured',
    status: 503,
  },
  booking_not_found: { code: 'booking_not_found', message: 'errors.booking_not_found', status: 404 },
  payment_not_found: { code: 'payment_not_found', message: 'errors.payment_not_found', status: 404 },
  action_not_allowed: {
    code: 'action_not_allowed',
    message: 'tracking.error.action_not_allowed',
    status: 409,
  },
  transition_not_allowed: {
    code: 'action_not_allowed',
    message: 'tracking.error.action_not_allowed',
    status: 409,
  },
  transition_forbidden: { code: 'forbidden', message: 'errors.forbidden', status: 403 },
  reason_required: { code: 'reason_required', message: 'validation.reason.required', status: 422 },
  signature_invalid: { code: 'signature_invalid', message: 'errors.forbidden', status: 401 },
  payment_amount_invalid: { code: 'payment_amount_invalid', message: 'errors.invalid_data', status: 422 },
};
