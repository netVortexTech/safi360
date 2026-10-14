// Error → HandlerResult mapping shared by every public handler. Mirrors http.ts, but
// returns plain data so handlers stay runtime-agnostic and unit-testable.
import { z } from 'zod';
import { SlotError } from '../availability/slots.ts';
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
  if (err instanceof Error) {
    switch (err.message) {
      case 'tenant_not_found':
        return errorResult('tenant_not_found', 'errors.tenant_not_found', 404);
      case 'tenant_suspended':
        return errorResult('tenant_suspended', 'errors.tenant_suspended', 403);
      case 'rate_limited':
        return errorResult('rate_limited', 'errors.rate_limited', 429, { retryable: true });
      case 'tenant_settings_invalid':
        return errorResult('tenant_settings_invalid', 'errors.internal', 500);
    }
  }
  return errorResult('internal', 'errors.internal', 500, { retryable: true });
}
