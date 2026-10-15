import { describe, expect, it } from 'vitest';
import { SANDBOX_OTP_CODE } from '../otp.ts';
import type { ApiError } from '../schemas.ts';
import { fakeBookingDeps, fakeBookingWorld } from './fake-deps.ts';
import { OTHER_PHONE, PHONE, seedBooking, token, withStaff } from './fake-bookings.ts';
import {
  allowedActions,
  handleTrackingStart,
  handleTrackingVerify,
  handleTrackingView,
  type TrackingVerifyResponse,
  type TrackingViewResponse,
} from './tracking.ts';

const settings = { cancel_hours: 4 } as Parameters<typeof allowedActions>[1];
const base = { slug: 'usafi-bora', phone: PHONE };

describe('tracking_start', () => {
  it('sends a code only when the phone (and ticket) match, but always says code_sent', async () => {
    const w = withStaff(fakeBookingWorld());
    const deps = fakeBookingDeps(w);
    const nobody = await handleTrackingStart(base, deps);
    expect(nobody.status).toBe(200);
    expect(nobody.body).toEqual({ status: 'code_sent' });
    expect(w.otps).toEqual([]);
    expect(w.sms?.sent).toEqual([]);

    const booking = await seedBooking(w);
    const wrongTicket = await handleTrackingStart({ ...base, ticket_ref: 'UBC-2026-09999' }, deps);
    expect(wrongTicket.body).toEqual({ status: 'code_sent' });
    expect(w.otps).toEqual([]);

    const ok = await handleTrackingStart({ ...base, ticket_ref: booking.ticket_ref }, deps);
    expect(ok.body).toEqual({ status: 'code_sent' });
    expect(w.otps).toHaveLength(1);
    expect(w.otps[0]).toMatchObject({ purpose: 'tracking', scope: { ticket_ref: booking.ticket_ref } });
    expect(w.rateLimitCalls).toContain(`${w.tenants[0]!.id}:otp_send:${PHONE}`);
  });

  it('is a configuration error without an SMS provider, whether or not the phone matches', async () => {
    const w = withStaff(fakeBookingWorld({ sms: null }));
    const res = await handleTrackingStart(base, fakeBookingDeps(w));
    expect(res.status).toBe(503);
  });
});

describe('tracking_verify', () => {
  it('returns a token plus every booking on the phone; the typed ticket is resolved', async () => {
    const w = withStaff(fakeBookingWorld());
    const deps = fakeBookingDeps(w);
    const older = await seedBooking(w, { start: '2026-10-15T06:00:00.000Z' });
    const newer = await seedBooking(w);
    await seedBooking(w, { phone: OTHER_PHONE, start: '2026-10-17T06:00:00.000Z' });
    await handleTrackingStart({ ...base, ticket_ref: newer.ticket_ref }, deps);
    const res = await handleTrackingVerify(
      { ...base, code: SANDBOX_OTP_CODE, ticket_ref: newer.ticket_ref },
      deps,
    );
    expect(res.status).toBe(200);
    const body = res.body as TrackingVerifyResponse;
    expect(body.booking_id).toBe(newer.id);
    expect(body.bookings.map((b) => b.ticket_ref)).toEqual([newer.ticket_ref, older.ticket_ref]);
    expect(body.bookings[0]).toMatchObject({ service_label_en: 'Sofa cleaning', status: 'CONFIRMED' });
    expect(JSON.stringify(body)).not.toContain(OTHER_PHONE);
  });

  it('reveals nothing on a wrong code', async () => {
    const w = withStaff(fakeBookingWorld());
    const deps = fakeBookingDeps(w);
    await seedBooking(w);
    await handleTrackingStart(base, deps);
    const res = await handleTrackingVerify({ ...base, code: '999999' }, deps);
    expect(res.status).toBe(401);
    expect(Object.keys(res.body as object).sort()).toEqual(['code', 'field_errors', 'message', 'retryable']);
  });
});

describe('tracking_view', () => {
  it('returns the customer-safe projection for the token holder only', async () => {
    const w = withStaff(fakeBookingWorld());
    const deps = fakeBookingDeps(w);
    const mine = await seedBooking(w);
    const theirs = await seedBooking(w, { phone: OTHER_PHONE, start: '2026-10-17T06:00:00.000Z' });
    const t = await token(w, 'tracking');
    const res = await handleTrackingView({ slug: 'usafi-bora', token: t, booking_id: mine.id }, deps);
    expect(res.status).toBe(200);
    const body = res.body as TrackingViewResponse;
    expect(body.booking).toMatchObject({
      ticket_ref: mine.ticket_ref,
      status: 'CONFIRMED',
      total_tzs: 75000,
      balance_tzs: 75000,
      address: { area: 'Mbezi Beach', street: 'Sinza Road' },
    });
    expect(body.customer).toEqual({ name: 'Daudi Lyimo', phone_masked: '+25571****342' });
    expect(body.timeline.map((e) => e.kind)).toEqual(['created', 'status_changed']);
    expect(body.actions).toEqual(['cancel', 'request_reschedule', 'submit_feedback']);
    expect(body.policy).toMatchObject({ cancel_hours: 4, cancel_within_policy: true });
    const text = JSON.stringify(body);
    expect(text).not.toContain(PHONE);
    expect(text).not.toContain('notes_internal');
    expect(text).not.toContain('idempotency');

    const other = await handleTrackingView({ slug: 'usafi-bora', token: t, booking_id: theirs.id }, deps);
    expect(other.status).toBe(404);
    expect((other.body as ApiError).code).toBe('booking_not_found');
  });

  it('hides internal events and accepts a booking token too', async () => {
    const w = withStaff(fakeBookingWorld());
    const deps = fakeBookingDeps(w);
    const mine = await seedBooking(w);
    await deps.addJobEvent(
      mine.id,
      'note',
      false,
      null,
      { text: 'Customer is difficult' },
      { actor: 'staff:x', actor_role: 'OWNER' },
    );
    const res = await handleTrackingView(
      { slug: 'usafi-bora', token: await token(w, 'booking'), booking_id: mine.id },
      deps,
    );
    expect(res.status).toBe(200);
    const body = res.body as TrackingViewResponse;
    expect(body.timeline.some((e) => e.kind === 'note')).toBe(false);
    expect(JSON.stringify(body)).not.toContain('difficult');
  });

  it('refuses missing, foreign and expired tokens without touching the booking', async () => {
    const w = withStaff(fakeBookingWorld());
    const deps = fakeBookingDeps(w);
    const mine = await seedBooking(w);
    const foreign = await token(w, 'tracking', PHONE, '22222222-2222-4222-8222-222222222222');
    const res = await handleTrackingView({ slug: 'usafi-bora', token: foreign, booking_id: mine.id }, deps);
    expect(res.status).toBe(401);
    const stale = await token(w, 'tracking');
    w.now = new Date(w.now.getTime() + 16 * 60_000);
    const expired = await handleTrackingView({ slug: 'usafi-bora', token: stale, booking_id: mine.id }, deps);
    expect(expired.status).toBe(401);
    expect((expired.body as ApiError).code).toBe('token_expired');
  });
});

describe('allowedActions policy', () => {
  const now = new Date('2026-10-14T09:00:00Z');
  const booking = (over: Partial<Parameters<typeof allowedActions>[0]>) => ({
    status: 'CONFIRMED' as const,
    scheduled_start: '2026-10-16T06:00:00Z',
    payment_mode: 'ON_COMPLETION' as const,
    deposit_tzs: 0,
    paid_tzs: 0,
    ...over,
  });

  it('offers approval only while a quote waits, payment only while a deposit is due', () => {
    expect(
      allowedActions(booking({ status: 'AWAITING_CUSTOMER_APPROVAL' }), settings, now, true).actions,
    ).toEqual(['approve_quote', 'reject_quote', 'cancel', 'submit_feedback']);
    expect(
      allowedActions(
        booking({ status: 'AWAITING_PAYMENT', payment_mode: 'DEPOSIT', deposit_tzs: 10 }),
        settings,
        now,
        true,
      ).actions,
    ).toEqual(['pay_deposit', 'cancel', 'request_reschedule', 'submit_feedback']);
    expect(
      allowedActions(
        booking({ status: 'AWAITING_PAYMENT', payment_mode: 'DEPOSIT', deposit_tzs: 10 }),
        settings,
        now,
        false,
      ).actions,
    ).not.toContain('pay_deposit');
  });

  it('keeps cancel visible inside the window but marks it outside policy; reschedule disappears', () => {
    const late = allowedActions(booking({ scheduled_start: '2026-10-14T11:00:00Z' }), settings, now, true);
    expect(late.actions).toEqual(['cancel', 'submit_feedback']);
    expect(late.cancel_within_policy).toBe(false);
    expect(late.cancel_deadline).toBe('2026-10-14T07:00:00.000Z');
    const unscheduled = allowedActions(
      booking({ status: 'AWAITING_REVIEW', scheduled_start: null }),
      settings,
      now,
      true,
    );
    expect(unscheduled.actions).toEqual(['cancel', 'submit_feedback']);
    expect(unscheduled.cancel_within_policy).toBe(true);
  });

  it('offers only feedback once a job is underway or finished', () => {
    for (const status of ['EN_ROUTE', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'EXPIRED'] as const) {
      expect(allowedActions(booking({ status }), settings, now, true).actions, status).toEqual([
        'submit_feedback',
      ]);
    }
  });
});
