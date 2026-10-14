// Deposit payments through the provider interface. payment_start records a PENDING row and
// asks the provider for instructions; payment_callback verifies the provider's signature and
// hands the result to apply_payment_result(), the only place a payment status changes.
import { mockPaymentCallback, paymentStartRequest } from '../schemas.ts';
import { toErrorResult } from './errors.ts';
import { requireOwnBooking, requireTrackingToken } from './tracking.ts';
import type { BookingDeps, HandlerResult, PaymentRow } from './types.ts';
import type { PaymentStartResult } from '../payments/provider.ts';
import type { BookingStatus } from '../enums.ts';

export interface PaymentStartResponse {
  payment_id: string;
  provider: PaymentRow['provider'];
  amount_tzs: number;
  status: PaymentRow['status'];
  instructions: PaymentStartResult['instructions'];
}

export interface PaymentCallbackResponse {
  payment_id: string;
  status: PaymentRow['status'];
  booking_status: BookingStatus | null;
}

export async function handlePaymentStart(rawBody: unknown, deps: BookingDeps): Promise<HandlerResult> {
  try {
    const input = paymentStartRequest.parse(rawBody);
    const tenant = await deps.resolveTenant(input.slug);
    await deps.rateLimit(tenant.id, 'payment_start');
    if (!deps.payments) throw new Error('payment_not_configured');
    const { phone } = await requireTrackingToken(deps, tenant, input.token, ['tracking', 'booking']);
    const detail = await requireOwnBooking(deps, tenant, phone, input.booking_id);
    const b = detail.booking;
    if (input.kind !== 'DEPOSIT' || b.status !== 'AWAITING_PAYMENT') throw new Error('action_not_allowed');
    const amount = b.deposit_tzs - b.paid_tzs;
    if (amount <= 0) throw new Error('payment_amount_invalid');

    let payment = await deps.findPaymentByKey(tenant.id, input.idempotency_key);
    if (!payment) {
      payment = await deps.insertPayment({
        tenant_id: tenant.id,
        booking_id: b.id,
        kind: 'DEPOSIT',
        provider: deps.payments.id,
        amount_tzs: amount,
        idempotency_key: input.idempotency_key,
      });
    }
    const started = await deps.payments.start({
      payment_id: payment.id,
      booking_id: b.id,
      ticket_ref: b.ticket_ref,
      amount_tzs: payment.amount_tzs,
      phone,
      locale: b.locale,
    });
    if (payment.provider_ref !== started.provider_ref) {
      await deps.setPaymentRef(payment.id, started.provider_ref, { started_at: deps.now().toISOString() });
    }
    const body: PaymentStartResponse = {
      payment_id: payment.id,
      provider: payment.provider,
      amount_tzs: payment.amount_tzs,
      status: payment.status,
      instructions: started.instructions,
    };
    return { status: 200, body };
  } catch (err) {
    return toErrorResult(err);
  }
}

/** Provider webhook. No slug and no customer token: the signature is the authentication. */
export async function handlePaymentCallback(rawBody: unknown, deps: BookingDeps): Promise<HandlerResult> {
  try {
    if (!deps.payments) throw new Error('payment_not_configured');
    const parsed = deps.payments.id === 'MOCK' ? mockPaymentCallback.parse(rawBody) : rawBody;
    const verified = await deps.payments.verifyCallback(parsed);
    const payment = await deps.findPaymentByRef(deps.payments.id, verified.provider_ref);
    if (!payment) throw new Error('payment_not_found');
    await deps.rateLimit(payment.tenant_id, 'payment_callback');
    const result = await deps.applyPaymentResult(
      payment.id,
      verified.status,
      verified.provider_ref,
      verified.raw,
    );
    const body: PaymentCallbackResponse = {
      payment_id: payment.id,
      status: verified.status,
      booking_status: result.booking_status ?? null,
    };
    return { status: 200, body };
  } catch (err) {
    return toErrorResult(err);
  }
}
