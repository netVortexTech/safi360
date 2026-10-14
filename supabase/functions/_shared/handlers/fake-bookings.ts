// Test helpers on top of fake-deps: a verified token and bookings in a given state.
import { signToken, TOKEN_TTL_MS, type OtpPurpose } from '../otp.ts';
import { FIXTURE_TENANT_ID, SERVICE_IDS } from '../pricing/fixtures.ts';
import type { BookingStatus } from '../enums.ts';
import { fakeBookingDeps, staffMember, type FakeBooking, type FakeBookingWorld } from './fake-deps.ts';

export const PHONE = '+255715880342';
export const OTHER_PHONE = '+255713908115';
export const NEEMA = 'neema';
export const REHEMA = 'rehema';

/** Fri 16 Oct 2026 09:00 Dar: inside tenant hours, two days after `now`. */
export const SLOT_START = '2026-10-16T06:00:00.000Z';

export function withStaff(world: FakeBookingWorld): FakeBookingWorld {
  world.staff = {
    staff: [
      staffMember(NEEMA, Object.values(SERVICE_IDS)),
      staffMember(REHEMA, [SERVICE_IDS.sofa, SERVICE_IDS.carpet]),
    ],
    availability: [],
    busy: [],
    reserved: [],
  };
  return world;
}

export function token(
  world: FakeBookingWorld,
  purpose: OtpPurpose,
  phone = PHONE,
  tenantId = FIXTURE_TENANT_ID,
): Promise<string> {
  return signToken(
    { tenant_id: tenantId, phone, purpose, exp: world.now.getTime() + TOKEN_TTL_MS },
    world.tokenSecret,
  );
}

export interface SeedBookingOptions {
  phone?: string;
  status?: BookingStatus;
  paymentMode?: 'DEPOSIT' | 'ON_COMPLETION';
  requiresReview?: boolean;
  start?: string | null;
  totalTzs?: number;
  crew?: number;
}

/** A booking created through the fake write path, then moved to the wanted status. */
export async function seedBooking(
  world: FakeBookingWorld,
  opts: SeedBookingOptions = {},
): Promise<FakeBooking> {
  const deps = fakeBookingDeps(world);
  const start = opts.start === undefined ? SLOT_START : opts.start;
  const total = opts.totalTzs ?? 75000;
  const result = await deps.createBooking({
    tenant_id: FIXTURE_TENANT_ID,
    idempotency_key: `booking_${crypto.randomUUID()}`,
    source: 'website',
    locale: 'sw',
    customer: { phone_e164: opts.phone ?? PHONE, name: 'Daudi Lyimo', phone_verified: true },
    address: { area: 'Mbezi Beach', street: 'Sinza Road' },
    quote: {
      total_tzs: total,
      deposit_tzs: Math.round(total * 0.3),
      requires_review: opts.requiresReview ?? false,
      est_duration_min: 135,
      crew_size: opts.crew ?? 1,
    },
    items: [
      {
        service_id: SERVICE_IDS.sofa,
        label_sw: 'Usafi wa sofa',
        label_en: 'Sofa cleaning',
        input: { service_id: SERVICE_IDS.sofa, qty: 5 },
        qty: 5,
        amount_tzs: opts.requiresReview ? null : total,
        requires_review: opts.requiresReview ?? false,
      },
    ],
    schedule: start
      ? { start, end: new Date(Date.parse(start) + 135 * 60_000).toISOString(), capacity: 2 }
      : null,
    payment_mode: opts.paymentMode ?? 'ON_COMPLETION',
    notes_customer: null,
  });
  const booking = world.bookings.find((b) => b.id === result.booking_id) as FakeBooking;
  if (opts.status && booking.status !== opts.status) {
    booking.status = opts.status;
    if (opts.status === 'AWAITING_CUSTOMER_APPROVAL' || opts.status === 'AWAITING_REVIEW') {
      booking.hold_expires_at = new Date(world.now.getTime() + 144 * 3_600_000).toISOString();
    }
  }
  return booking;
}
