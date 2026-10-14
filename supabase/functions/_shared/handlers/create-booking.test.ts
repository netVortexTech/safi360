import { describe, expect, it } from 'vitest';
import { SERVICE_IDS } from '../pricing/fixtures.ts';
import type { ApiError } from '../schemas.ts';
import { handleCreateBooking, type CreateBookingResponse } from './create-booking.ts';
import { fakeBookingDeps, fakeBookingWorld, type FakeBookingWorld } from './fake-deps.ts';
import { OTHER_PHONE, PHONE, SLOT_START, seedBooking, token, withStaff } from './fake-bookings.ts';

function world(): FakeBookingWorld {
  return withStaff(fakeBookingWorld());
}

async function request(
  w: FakeBookingWorld,
  over: Record<string, unknown> = {},
  purpose: 'booking' | 'tracking' = 'booking',
) {
  return {
    slug: 'usafi-bora',
    idempotency_key: 'booking_11111111-1111-4111-8111-aaaaaaaaaaaa',
    verify_token: await token(w, purpose),
    customer: { name: 'Daudi Lyimo' },
    address: { area: 'Mbezi Beach', street: 'Sinza Road', landmark: 'near the bus stop' },
    items: [{ service_id: SERVICE_IDS.sofa, qty: 5 }],
    slot: { start: SLOT_START },
    payment_mode: 'ON_COMPLETION',
    source: 'website',
    locale: 'sw',
    expected_total_tzs: 75000,
    ...over,
  };
}

describe('create_booking — happy paths', () => {
  it('confirms an instant booking and returns the ticket, quote and schedule', async () => {
    const w = world();
    const res = await handleCreateBooking(await request(w), fakeBookingDeps(w));
    expect(res.status).toBe(201);
    const body = res.body as CreateBookingResponse;
    expect(body.ticket_ref).toBe('UBC-2026-00001');
    expect(body.status).toBe('CONFIRMED');
    expect(body.created).toBe(true);
    expect(body.quote.total_tzs).toBe(75000);
    expect(body.schedule).toEqual({ start: SLOT_START, end: '2026-10-16T08:15:00.000Z' });
    const stored = w.bookings[0]!;
    expect(stored.phone).toBe(PHONE);
    expect(stored.items[0]).toMatchObject({ label_en: 'Sofa cleaning', qty: 5, amount_tzs: 75000 });
    expect(stored.address_snapshot).toMatchObject({ area: 'Mbezi Beach' });
    expect(w.expireHoldsCalls).toBe(1);
    expect(w.rateLimitCalls).toContain(`${w.tenants[0]!.id}:create_booking`);
  });

  it('routes a deposit booking to awaiting payment with a 15-minute hold', async () => {
    const w = world();
    const res = await handleCreateBooking(await request(w, { payment_mode: 'DEPOSIT' }), fakeBookingDeps(w));
    const body = res.body as CreateBookingResponse;
    expect(body.status).toBe('AWAITING_PAYMENT');
    expect(Date.parse(body.hold_expires_at ?? '') - w.now.getTime()).toBe(15 * 60_000);
  });

  it('accepts an inspection request without a slot and routes it to review', async () => {
    const w = world();
    const res = await handleCreateBooking(
      await request(w, {
        items: [{ service_id: SERVICE_IDS.mould }],
        slot: null,
        expected_total_tzs: undefined,
      }),
      fakeBookingDeps(w),
    );
    expect(res.status).toBe(201);
    const body = res.body as CreateBookingResponse;
    expect(body.status).toBe('AWAITING_REVIEW');
    expect(body.schedule).toBeNull();
    expect(w.exceptions).toEqual([expect.objectContaining({ kind: 'NEEDS_REVIEW' })]);
  });

  it('a double submit with the same key returns the same ticket without a second booking', async () => {
    const w = world();
    const deps = fakeBookingDeps(w);
    const first = (await handleCreateBooking(await request(w), deps)).body as CreateBookingResponse;
    const second = await handleCreateBooking(await request(w), deps);
    expect(second.status).toBe(200);
    expect((second.body as CreateBookingResponse).ticket_ref).toBe(first.ticket_ref);
    expect((second.body as CreateBookingResponse).created).toBe(false);
    expect(w.bookings).toHaveLength(1);
  });
});

describe('create_booking — refusals', () => {
  it('needs a booking token for this tenant', async () => {
    const w = world();
    const deps = fakeBookingDeps(w);
    const tracking = await handleCreateBooking(await request(w, {}, 'tracking'), deps);
    expect(tracking.status).toBe(401);
    expect((tracking.body as ApiError).code).toBe('phone_not_verified');
    const garbage = await handleCreateBooking(
      await request(w, { verify_token: 'abc.def.ghi.jkl.mnop' }),
      deps,
    );
    expect(garbage.status).toBe(401);
    expect((garbage.body as ApiError).code).toBe('token_invalid');
    w.now = new Date(w.now.getTime() + 20 * 60_000);
    const stale = await handleCreateBooking(await request(world()), deps);
    expect(stale.status).toBe(401);
    expect((stale.body as ApiError).code).toBe('token_expired');
    expect(w.bookings).toEqual([]);
  });

  it('refuses a slot that is no longer offered (taken mid-flow)', async () => {
    const w = world();
    // Someone else has the only two cleaners' worth of crew at that time.
    await seedBooking(w, { phone: OTHER_PHONE, crew: 2, start: SLOT_START });
    const res = await handleCreateBooking(await request(w), fakeBookingDeps(w));
    expect(res.status).toBe(409);
    expect((res.body as ApiError).code).toBe('slot_unavailable');
    expect((res.body as ApiError).retryable).toBe(true);
  });

  it('refuses a slot the engine would not offer at all', async () => {
    const w = world();
    const sunday = await handleCreateBooking(
      await request(w, { slot: { start: '2026-10-18T06:00:00Z' } }),
      fakeBookingDeps(w),
    );
    expect(sunday.status).toBe(409);
    expect((sunday.body as ApiError).code).toBe('slot_unavailable');
    const past = await handleCreateBooking(
      await request(w, { slot: { start: '2026-10-01T06:00:00Z' } }),
      fakeBookingDeps(w),
    );
    expect(past.status).toBe(422);
    expect((past.body as ApiError).code).toBe('slot_in_past');
    const none = await handleCreateBooking(await request(w, { slot: null }), fakeBookingDeps(w));
    expect(none.status).toBe(422);
    expect((none.body as ApiError).code).toBe('slot_required');
  });

  it('reports a changed price instead of charging it silently', async () => {
    const w = world();
    const res = await handleCreateBooking(
      await request(w, { expected_total_tzs: 60000 }),
      fakeBookingDeps(w),
    );
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'quote_changed', retryable: true, quote: { total_tzs: 75000 } });
    expect(w.bookings).toEqual([]);
  });

  it('refuses addresses outside the service area and malformed bodies', async () => {
    const w = world();
    const away = await handleCreateBooking(
      await request(w, { address: { area: 'Dodoma' } }),
      fakeBookingDeps(w),
    );
    expect(away.status).toBe(422);
    expect((away.body as ApiError).code).toBe('out_of_area');
    const bad = await handleCreateBooking(await request(w, { customer: { name: 'D' } }), fakeBookingDeps(w));
    expect(bad.status).toBe(422);
    expect((bad.body as ApiError).field_errors).toEqual({ 'customer.name': 'validation.name.too_short' });
  });

  it('refuses a different payload under a used key', async () => {
    const w = world();
    const deps = fakeBookingDeps(w);
    await handleCreateBooking(await request(w), deps);
    const res = await handleCreateBooking(await request(w, { customer: { name: 'Someone Else' } }), deps);
    expect(res.status).toBe(409);
    expect((res.body as ApiError).code).toBe('idempotency_mismatch');
  });
});
