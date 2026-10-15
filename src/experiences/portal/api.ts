// Customer portal data access. Anonymous visitors never touch tables: the catalog comes
// from the portal_catalog RPC and every write goes through an Edge Function. Errors keep
// the server's code + i18n key so screens can explain what happened.
import type { ApiError } from '@shared/schemas';
import { env } from '@/lib/env';
import { isOffline } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import type {
  AvailabilityResponse,
  CreateBookingResponse,
  CustomerActionResponse,
  OtpSendResponse,
  OtpVerifyResponse,
  PaymentCallbackResponse,
  PaymentStartResponse,
  PortalCatalog,
  TrackingStartResponse,
  TrackingVerifyResponse,
  TrackingViewResponse,
} from './types';

export class PortalApiError extends Error {
  constructor(
    readonly code: string,
    /** i18n key */
    readonly messageKey: string,
    readonly status: number,
    readonly retryable = false,
    readonly fieldErrors: Record<string, string> = {},
    /** Extra payload some errors carry (quote_changed → the fresh quote). */
    readonly data: Record<string, unknown> = {},
  ) {
    super(code);
    this.name = 'PortalApiError';
  }
}

export function isPortalApiError(err: unknown): err is PortalApiError {
  return err instanceof PortalApiError;
}

/** i18n key for any failure on the portal, network included. */
export function portalErrorKey(err: unknown): string {
  if (isOffline()) return 'errors.offline_body';
  if (isPortalApiError(err)) return err.messageKey;
  return 'errors.generic_body';
}

function fromApiError(status: number, body: unknown): PortalApiError {
  const b = (body ?? {}) as Partial<ApiError> & Record<string, unknown>;
  const code = typeof b.code === 'string' ? b.code : 'internal';
  const messageKey = typeof b.message === 'string' ? b.message : 'errors.internal';
  const { code: _c, message: _m, field_errors, retryable, ...data } = b;
  return new PortalApiError(code, messageKey, status, retryable === true, field_errors ?? {}, data);
}

/** POST to a public Edge Function with the anon key; never a user session. */
export async function invoke<T>(name: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${env.VITE_SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
        'x-client-info': 'safi360-portal',
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new PortalApiError('network', 'errors.generic_body', 0, true);
  }
  const json: unknown = await res.json().catch(() => null);
  if (!res.ok) throw fromApiError(res.status, json);
  return json as T;
}

export async function fetchPortalCatalog(slug: string): Promise<PortalCatalog> {
  const res: { data: unknown; error: { message?: string; code?: string } | null } = await supabase.rpc(
    'portal_catalog',
    { p_slug: slug },
  );
  if (res.error) {
    const msg = res.error.message ?? '';
    if (/tenant_not_found/.test(msg))
      throw new PortalApiError('tenant_not_found', 'errors.tenant_not_found', 404);
    if (/tenant_suspended/.test(msg))
      throw new PortalApiError('tenant_suspended', 'errors.tenant_suspended', 403);
    throw new PortalApiError('internal', 'errors.generic_body', 500, true);
  }
  return res.data as PortalCatalog;
}

export interface AvailabilityArgs {
  slug: string;
  items: unknown[];
  from: string;
  to: string;
  address?: { area?: string; lat?: number; lng?: number } | null;
}

export const portalApi = {
  availability: (args: AvailabilityArgs) => invoke<AvailabilityResponse>('availability', args),
  otpSend: (args: { slug: string; phone: string; purpose: 'booking' | 'tracking'; locale: 'sw' | 'en' }) =>
    invoke<OtpSendResponse>('otp_send', args),
  otpVerify: (args: { slug: string; phone: string; purpose: 'booking' | 'tracking'; code: string }) =>
    invoke<OtpVerifyResponse>('otp_verify', args),
  createBooking: (args: Record<string, unknown>) => invoke<CreateBookingResponse>('create_booking', args),
  trackingStart: (args: { slug: string; phone: string; ticket_ref?: string; locale: 'sw' | 'en' }) =>
    invoke<TrackingStartResponse>('tracking_start', args),
  trackingVerify: (args: { slug: string; phone: string; code: string; ticket_ref?: string }) =>
    invoke<TrackingVerifyResponse>('tracking_verify', args),
  trackingView: (args: { slug: string; token: string; booking_id: string }) =>
    invoke<TrackingViewResponse>('tracking_view', args),
  customerAction: (args: {
    slug: string;
    token: string;
    booking_id: string;
    action: 'approve_quote' | 'reject_quote' | 'cancel' | 'request_reschedule' | 'submit_feedback';
    reason?: string;
    preferred_start?: string;
    note?: string;
    feedback_kind?: 'COMMENT' | 'COMPLAINT';
    rating?: number | undefined;
    body?: string;
  }) => invoke<CustomerActionResponse>('customer_action', args),
  paymentStart: (args: {
    slug: string;
    token: string;
    booking_id: string;
    kind: 'DEPOSIT';
    idempotency_key: string;
  }) => invoke<PaymentStartResponse>('payment_start', args),
  paymentCallback: (args: { provider: 'MOCK'; provider_ref: string; outcome: string; signature: string }) =>
    invoke<PaymentCallbackResponse>('payment_callback', args),
};
