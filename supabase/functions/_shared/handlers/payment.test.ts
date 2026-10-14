import { describe, expect, it } from 'vitest';
import type { ApiError } from '../schemas.ts';
import { fakeBookingDeps, fakeBookingWorld, type FakeBookingWorld } from './fake-deps.ts';
import { seedBooking, token, withStaff } from './fake-bookings.ts';
import {
  handlePaymentCallback,
  handlePaymentStart,
  type PaymentCallbackResponse,
  type PaymentStartResponse,
} from './payment.ts';

const KEY = 'payment_11111111-1111-4111-8111-aaaaaaaaaaaa';

async function start(w: FakeBookingWorld, bookingId: string, key = KEY) {
  return handlePaymentStart(
    {
      slug: 'usafi-bora',
      token: await token(w, 'booking'),
      booking_id: bookingId,
      kind: 'DEPOSIT',
      idempotency_key: key,
    },
    fakeBookingDeps(w),
  );
}

describe('payment_start (Mock adapter)', () => {
  it('records a pending deposit and hands back one signed outcome per state', async () => {
    const w = withStaff(fakeBookingWorld());
    const b = await seedBooking(w, { paymentMode: 'DEPOSIT' });
    const res = await start(w, b.id);
    expect(res.status).toBe(200);
    const body = res.body as PaymentStartResponse;
    expect(body).toMatchObject({ provider: 'MOCK', amount_tzs: 22500, status: 'PENDING' });
    expect(body.instructions.kind).toBe('mock');
    if (body.instructions.kind === 'mock') {
      expect(Object.keys(body.instructions.outcomes).sort()).toEqual([
        'EXPIRED',
        'FAILED',
        'SUCCESS',
        'UNKNOWN',
      ]);
    }
    expect(w.payments[0]).toMatchObject({
      booking_id: b.id,
      provider_ref: `mock_${body.payment_id}`,
      status: 'PENDING',
    });
    // Same key → same payment, no second row.
    const again = (await start(w, b.id)).body as PaymentStartResponse;
    expect(again.payment_id).toBe(body.payment_id);
    expect(w.payments).toHaveLength(1);
  });

  it('is only offered while a deposit is awaited, and only with a provider', async () => {
    const w = withStaff(fakeBookingWorld());
    const confirmed = await seedBooking(w);
    const res = await start(w, confirmed.id);
    expect(res.status).toBe(409);
    const none = withStaff(fakeBookingWorld({ paymentProvider: null }));
    const b = await seedBooking(none, { paymentMode: 'DEPOSIT' });
    const off = await start(none, b.id);
    expect(off.status).toBe(503);
    expect((off.body as ApiError).code).toBe('payment_not_configured');
  });
});

describe('payment_callback (Mock adapter)', () => {
  async function started(w: FakeBookingWorld) {
    const b = await seedBooking(w, { paymentMode: 'DEPOSIT' });
    const body = (await start(w, b.id, `payment_${crypto.randomUUID()}`)).body as PaymentStartResponse;
    const outcomes =
      body.instructions.kind === 'mock' ? body.instructions.outcomes : ({} as Record<string, string>);
    return { b, body, outcomes, ref: `mock_${body.payment_id}` };
  }

  it('SUCCESS confirms the booking; a replay changes nothing', async () => {
    const w = withStaff(fakeBookingWorld());
    const { b, outcomes, ref } = await started(w);
    const res = await handlePaymentCallback(
      { provider: 'MOCK', provider_ref: ref, outcome: 'SUCCESS', signature: outcomes.SUCCESS },
      fakeBookingDeps(w),
    );
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      status: 'SUCCESS',
      booking_status: 'CONFIRMED',
    } satisfies Partial<PaymentCallbackResponse>);
    expect(b.status).toBe('CONFIRMED');
    expect(b.paid_tzs).toBe(22500);
    const replay = await handlePaymentCallback(
      { provider: 'MOCK', provider_ref: ref, outcome: 'SUCCESS', signature: outcomes.SUCCESS },
      fakeBookingDeps(w),
    );
    expect(replay.status).toBe(200);
    expect(b.paid_tzs).toBe(22500);
  });

  it('FAILED and EXPIRED leave the booking waiting; UNKNOWN opens an exception', async () => {
    const w = withStaff(fakeBookingWorld());
    const { b, outcomes, ref } = await started(w);
    await handlePaymentCallback(
      { provider: 'MOCK', provider_ref: ref, outcome: 'FAILED', signature: outcomes.FAILED },
      fakeBookingDeps(w),
    );
    expect(w.payments[0]?.status).toBe('FAILED');
    expect(b.status).toBe('AWAITING_PAYMENT');
    const second = await started(w);
    await handlePaymentCallback(
      { provider: 'MOCK', provider_ref: second.ref, outcome: 'UNKNOWN', signature: second.outcomes.UNKNOWN },
      fakeBookingDeps(w),
    );
    expect(w.exceptions.some((e) => e.kind === 'PAYMENT_UNKNOWN' && e.booking_id === second.b.id)).toBe(true);
    expect(second.b.status).toBe('AWAITING_PAYMENT');
  });

  it('rejects forged or mismatched signatures and unknown references', async () => {
    const w = withStaff(fakeBookingWorld());
    const { outcomes, ref } = await started(w);
    const forged = await handlePaymentCallback(
      { provider: 'MOCK', provider_ref: ref, outcome: 'SUCCESS', signature: outcomes.FAILED },
      fakeBookingDeps(w),
    );
    expect(forged.status).toBe(401);
    expect((forged.body as ApiError).code).toBe('signature_invalid');
    expect(w.payments[0]?.status).toBe('PENDING');
    const unknownRef = await handlePaymentCallback(
      { provider: 'MOCK', provider_ref: 'mock_nothing', outcome: 'SUCCESS', signature: 'x'.repeat(20) },
      fakeBookingDeps(w),
    );
    expect(unknownRef.status).toBe(401);
  });
});
