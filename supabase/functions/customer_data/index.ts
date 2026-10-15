// POST /functions/v1/customer_data — OTP-verified customer data requests.
// Body: { action: 'export' | 'delete', tenant_slug, phone_e164, otp_token }.
// Export returns the customer row + bookings + payments; delete soft-anonymises
// the customer row (name → 'Deleted user', email → null) and records the request
// in customer_data_requests. Service role only; RLS denies all client access.
import { adminClient } from '../_shared/admin-client.ts';
import { verifyToken } from '../_shared/otp.ts';
import { serveBooking } from '../_shared/runtime.ts';
import type { BookingDeps } from '../_shared/handlers/types.ts';
import type { HandlerResult } from '../_shared/handlers/types.ts';

interface CustomerDataRequest {
  action: 'export' | 'delete';
  tenant_slug?: unknown;
  phone_e164?: unknown;
  otp_token?: unknown;
}

function badRequest(message: string): HandlerResult {
  return { status: 400, body: { code: 'validation_failed', message, retryable: false } };
}

async function handleCustomerData(rawBody: unknown, deps: BookingDeps): Promise<HandlerResult> {
  try {
    const input = (rawBody ?? {}) as CustomerDataRequest;
    if (input.action !== 'export' && input.action !== 'delete') {
      return badRequest('validation.action.invalid');
    }
    if (typeof input.tenant_slug !== 'string' || !input.tenant_slug) {
      return badRequest('validation.tenant_slug.required');
    }
    if (typeof input.phone_e164 !== 'string' || !/^\+255[1-9]\d{8}$/.test(input.phone_e164)) {
      return badRequest('validation.phone.invalid');
    }
    if (typeof input.otp_token !== 'string' || !input.otp_token) {
      return badRequest('validation.otp_token.required');
    }

    const tenant = await deps.resolveTenant(input.tenant_slug);
    await deps.rateLimit(tenant.id, 'tracking_view');

    // Verify the OTP token proves ownership of this phone on this tenant.
    let provenPhone: string;
    try {
      const payload = await verifyToken(input.otp_token, deps.env.tokenSecret, deps.now());
      if (payload.tenant_id !== tenant.id) return badRequest('validation.otp_token.invalid');
      provenPhone = payload.phone;
    } catch {
      return badRequest('validation.otp_token.invalid');
    }
    if (provenPhone !== input.phone_e164) {
      return { status: 403, body: { code: 'forbidden', message: 'errors.forbidden', retryable: false } };
    }

    const admin = adminClient();
    const phone = input.phone_e164;

    const customerRes = await admin
      .from('customers')
      .select('id, tenant_id, phone_e164, name, email, locale, created_at')
      .eq('tenant_id', tenant.id)
      .eq('phone_e164', phone)
      .maybeSingle();
    if (customerRes.error) throw new Error(customerRes.error.message);
    const customer = customerRes.data as Record<string, unknown> | null;

    const requestRow = {
      tenant_id: tenant.id,
      phone_e164: phone,
      request_type: input.action === 'export' ? 'export' : 'deletion',
      status: 'PENDING',
    };
    const insertRes = await admin.from('customer_data_requests').insert(requestRow).select('id').single();
    if (insertRes.error) throw new Error(insertRes.error.message);
    const requestId = (insertRes.data as { id: string }).id;

    if (input.action === 'export') {
      let bookings: unknown[] = [];
      let payments: unknown[] = [];
      if (customer) {
        const bRes = await admin
          .from('bookings')
          .select('id, ticket_ref, status, total_tzs, scheduled_start, created_at')
          .eq('tenant_id', tenant.id)
          .eq('customer_id', customer['id'])
          .limit(500);
        if (bRes.error) throw new Error(bRes.error.message);
        bookings = (bRes.data ?? []) as unknown[];
        const bookingIds = new Set((bookings as { id: string }[]).map((b) => b.id));
        if (bookingIds.size > 0) {
          const pRes = await admin
            .from('payments')
            .select('id, booking_id, kind, amount_tzs, status, provider, created_at')
            .eq('tenant_id', tenant.id)
            .in('booking_id', [...bookingIds])
            .limit(500);
          if (pRes.error) throw new Error(pRes.error.message);
          payments = (pRes.data ?? []) as unknown[];
        }
      }
      await admin
        .from('customer_data_requests')
        .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
        .eq('id', requestId);
      return { status: 200, body: { request_id: requestId, customer, bookings, payments } };
    }

    // Delete: soft-anonymise the customer row, keep booking history intact.
    if (customer) {
      const updRes = await admin
        .from('customers')
        .update({ name: 'Deleted user', email: null })
        .eq('id', customer['id'])
        .select('id');
      if (updRes.error) throw new Error(updRes.error.message);
    }
    await admin
      .from('customer_data_requests')
      .update({ status: 'COMPLETED', completed_at: new Date().toISOString() })
      .eq('id', requestId);
    return { status: 200, body: { request_id: requestId, status: 'COMPLETED' } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';
    if (message === 'tenant_not_found') {
      return {
        status: 404,
        body: { code: 'tenant_not_found', message: 'errors.tenant_not_found', retryable: false },
      };
    }
    if (message === 'rate_limited') {
      return { status: 429, body: { code: 'rate_limited', message: 'errors.rate_limited', retryable: true } };
    }
    return { status: 500, body: { code: 'internal', message: 'errors.internal', retryable: true } };
  }
}

serveBooking('customer_data', handleCustomerData);
