// ops_create_booking: staff tenant comes from the session claims, not the body;
// role gate, payload mapping and the createBooking call are exercised in-memory.
import { describe, expect, it } from 'vitest';
import { handleOpsCreateBooking } from './ops-create-booking.ts';
import { fakeBookingDeps, fakeBookingWorld, type FakeBookingWorld } from './fake-deps.ts';
import { withStaff } from './fake-bookings.ts';

const VALID = {
  customer: { phone_e164: '+255715880342', name: 'Daudi Lyimo', phone_verified: false },
  items: [
    {
      service_id: '55550000-0000-4000-8000-000000000001',
      label_sw: 'Usafi wa kawaida',
      label_en: 'Standard cleaning',
      qty: 1,
      amount_tzs: 45000,
      requires_review: false,
      input: {},
    },
  ],
  quote: {
    subtotal_tzs: 45000,
    travel_fee_tzs: 0,
    discount_tzs: 0,
    tax_tzs: 0,
    total_tzs: 45000,
    deposit_tzs: 13500,
    requires_review: false,
    has_estimate: false,
    est_duration_min: 120,
    crew_size: 1,
  },
  payment_mode: 'DEPOSIT',
  source: 'walk_in',
};

function act(w: FakeBookingWorld, body: unknown) {
  return handleOpsCreateBooking(body, fakeBookingDeps(w));
}

describe('ops_create_booking', () => {
  it('creates a booking for the staff tenant and returns the ticket', async () => {
    const w = withStaff(fakeBookingWorld());
    const res = await act(w, VALID);
    expect(res.status).toBe(200);
    const body = res.body as { ticket_ref: string; status: string; created: boolean };
    expect(body.created).toBe(true);
    expect(body.ticket_ref).toMatch(/^UBC-2026-/);
    expect(w.bookings.at(-1)).toMatchObject({
      tenant_id: w.staffSession.tenantId,
      source: 'walk_in',
      payment_mode: 'DEPOSIT',
    });
  });

  it('refuses a cleaner session and a payload for another tenant', async () => {
    const w = withStaff(fakeBookingWorld());
    w.staffSession.role = 'CLEANER';
    const cleaner = await act(w, VALID);
    expect(cleaner.status).toBe(403);
    expect(w.bookings).toHaveLength(0);

    w.staffSession.role = 'OWNER';
    w.staffSession.tenantId = '99999999-9999-4999-8999-999999999999';
    const foreign = await act(w, VALID);
    expect(foreign.status).toBe(404);
  });

  it('rejects invalid quote totals and bad schedules with 422', async () => {
    const w = withStaff(fakeBookingWorld());
    const badTotal = await act(w, { ...VALID, quote: { ...VALID.quote, total_tzs: 100 } });
    expect(badTotal.status).toBe(422);

    const past = await act(w, {
      ...VALID,
      schedule: { start: '2020-01-01T06:00:00Z', end: '2020-01-01T08:00:00Z', capacity: 10 },
    });
    expect(past.status).toBe(422);

    const reversed = await act(w, {
      ...VALID,
      schedule: { start: '2026-12-01T08:00:00Z', end: '2026-12-01T06:00:00Z', capacity: 10 },
    });
    expect(reversed.status).toBe(422);
  });

  it('works without a schedule (review queue booking)', async () => {
    const w = withStaff(fakeBookingWorld());
    const res = await act(w, VALID);
    expect(res.status).toBe(200);
    expect(w.bookings.at(-1)?.scheduled_start).toBeNull();
  });
});
