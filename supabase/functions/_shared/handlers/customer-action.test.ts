import { describe, expect, it } from 'vitest';
import type { ApiError } from '../schemas.ts';
import { handleCustomerAction, type CustomerActionResponse } from './customer-action.ts';
import { fakeBookingDeps, fakeBookingWorld, type FakeBookingWorld } from './fake-deps.ts';
import { PHONE, seedBooking, token, withStaff } from './fake-bookings.ts';

async function act(
  w: FakeBookingWorld,
  bookingId: string,
  action: string,
  extra: Record<string, unknown> = {},
) {
  return handleCustomerAction(
    { slug: 'usafi-bora', token: await token(w, 'tracking'), booking_id: bookingId, action, ...extra },
    fakeBookingDeps(w),
  );
}

describe('customer_action', () => {
  it('approving a quote waits for the deposit when one is due, else confirms', async () => {
    const w = withStaff(fakeBookingWorld());
    const deposit = await seedBooking(w, { status: 'AWAITING_CUSTOMER_APPROVAL', paymentMode: 'DEPOSIT' });
    const res = await act(w, deposit.id, 'approve_quote');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      action: 'approve_quote',
      outcome: 'status_changed',
      booking_status: 'AWAITING_PAYMENT',
    } satisfies CustomerActionResponse);
    expect(w.transitions.at(-1)).toBe(
      `${deposit.ticket_ref}:AWAITING_CUSTOMER_APPROVAL->AWAITING_PAYMENT:customer:${PHONE}`,
    );

    const onCompletion = await seedBooking(w, {
      status: 'AWAITING_CUSTOMER_APPROVAL',
      start: '2026-10-17T06:00:00.000Z',
    });
    const res2 = await act(w, onCompletion.id, 'approve_quote');
    expect((res2.body as CustomerActionResponse).booking_status).toBe('CONFIRMED');
  });

  it('rejecting a quote is terminal and keeps the reason', async () => {
    const w = withStaff(fakeBookingWorld());
    const b = await seedBooking(w, { status: 'AWAITING_CUSTOMER_APPROVAL' });
    const res = await act(w, b.id, 'reject_quote', { reason: 'Too expensive' });
    expect((res.body as CustomerActionResponse).booking_status).toBe('QUOTE_REJECTED');
    expect(b.outcome_reason).toBe('Too expensive');
    expect(b.events.at(-1)).toMatchObject({
      to_status: 'QUOTE_REJECTED',
      customer_visible: true,
      data: { reason: 'Too expensive' },
    });
  });

  it('cancels inside the policy window', async () => {
    const w = withStaff(fakeBookingWorld());
    const b = await seedBooking(w);
    const res = await act(w, b.id, 'cancel');
    expect(res.body).toMatchObject({ outcome: 'status_changed', booking_status: 'CANCELLED' });
    expect(b.outcome_reason).toBe('customer_cancelled');
  });

  it('outside the window a cancel becomes a request for the office, not a change', async () => {
    const w = withStaff(fakeBookingWorld());
    const b = await seedBooking(w, { start: '2026-10-14T11:00:00.000Z' });
    const res = await act(w, b.id, 'cancel', { reason: 'Travelling' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ outcome: 'request_logged', booking_status: 'CONFIRMED' });
    expect(b.status).toBe('CONFIRMED');
    expect(w.exceptions).toEqual([
      expect.objectContaining({ booking_id: b.id, kind: 'CANCEL_OUTSIDE_POLICY', severity: 'high' }),
    ]);
    expect(b.events.at(-1)).toMatchObject({
      kind: 'customer_action',
      customer_visible: true,
      message_key: 'event.cancel_requested',
    });
  });

  it('a reschedule request opens an exception and a visible event', async () => {
    const w = withStaff(fakeBookingWorld());
    const b = await seedBooking(w);
    const res = await act(w, b.id, 'request_reschedule', {
      preferred_start: '2026-10-20T06:00:00Z',
      note: 'Morning please',
    });
    expect(res.body).toMatchObject({ outcome: 'request_logged' });
    expect(w.exceptions[0]).toMatchObject({
      kind: 'RESCHEDULE_REQUESTED',
      details: { preferred_start: '2026-10-20T06:00:00Z', note: 'Morning please' },
    });
    expect(b.events.at(-1)).toMatchObject({
      kind: 'reschedule_requested',
      data: { preferred_start: '2026-10-20T06:00:00Z' },
    });
  });

  it('records a comment with rating without changing the booking', async () => {
    const w = withStaff(fakeBookingWorld());
    const b = await seedBooking(w, { status: 'COMPLETED' });
    const res = await act(w, b.id, 'submit_feedback', {
      feedback_kind: 'COMMENT',
      rating: 5,
      body: 'Safi sana, asanteni!',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ outcome: 'request_logged', booking_status: 'COMPLETED' });
    expect(b.status).toBe('COMPLETED');
    expect(w.feedback).toEqual([
      expect.objectContaining({
        booking_id: b.id,
        kind: 'COMMENT',
        rating: 5,
        body: 'Safi sana, asanteni!',
        status: 'OPEN',
      }),
    ]);
  });

  it('records a complaint and rejects missing kind or body', async () => {
    const w = withStaff(fakeBookingWorld());
    const b = await seedBooking(w, { status: 'COMPLETED' });
    const res = await act(w, b.id, 'submit_feedback', {
      feedback_kind: 'COMPLAINT',
      body: 'Mfanyakazi alichelewa sana',
    });
    expect(res.status).toBe(200);
    expect(w.feedback[0]).toMatchObject({ kind: 'COMPLAINT', rating: null });

    const noKind = await act(w, b.id, 'submit_feedback', { body: 'Missing kind' });
    expect(noKind.status).toBe(422);
    const noBody = await act(w, b.id, 'submit_feedback', { feedback_kind: 'COMMENT', rating: 4 });
    expect(noBody.status).toBe(422);
  });

  it('refuses actions the policy does not offer and bookings that are not yours', async () => {
    const w = withStaff(fakeBookingWorld());
    const b = await seedBooking(w);
    const approve = await act(w, b.id, 'approve_quote');
    expect(approve.status).toBe(409);
    expect((approve.body as ApiError).code).toBe('action_not_allowed');
    const theirs = await seedBooking(w, { phone: '+255713908115', start: '2026-10-17T06:00:00.000Z' });
    const foreign = await act(w, theirs.id, 'cancel');
    expect(foreign.status).toBe(404);
    const unknown = await act(w, b.id, 'pay_deposit');
    expect(unknown.status).toBe(422);
  });
});
