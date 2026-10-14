// Per-tab memory for the portal: the last booking (for the confirmation page) and the
// tracking session (token + bookings). sessionStorage only — a new tab starts clean, and
// nothing here outlives the 15-minute token anyway.
import type { LastBooking, TrackingSession } from './types';

function read<T>(key: string): T | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value == null) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / blocked storage: the page still works for this render.
  }
}

const LAST_BOOKING = 'safi360.portal.last_booking';
const TRACKING = 'safi360.portal.tracking';

export function saveLastBooking(b: LastBooking): void {
  write(LAST_BOOKING, b);
}

export function loadLastBooking(slug: string, ticketRef?: string): LastBooking | null {
  const b = read<LastBooking>(LAST_BOOKING);
  if (!b || b.slug !== slug) return null;
  if (ticketRef && b.ticket_ref !== ticketRef) return null;
  return b;
}

export function saveTrackingSession(s: TrackingSession | null): void {
  write(TRACKING, s);
}

export function loadTrackingSession(slug: string, now = Date.now()): TrackingSession | null {
  const s = read<TrackingSession>(TRACKING);
  if (!s || s.slug !== slug) return null;
  if (Date.parse(s.expires_at) <= now) {
    write(TRACKING, null);
    return null;
  }
  return s;
}

/** A token that still has at least a minute of life, from either source. */
export function usableToken(slug: string, bookingId: string | null, now = Date.now()): string | null {
  const tracking = loadTrackingSession(slug, now);
  if (
    tracking &&
    (bookingId == null ||
      tracking.booking_id === bookingId ||
      tracking.bookings.some((b) => b.id === bookingId))
  ) {
    return tracking.token;
  }
  const last = loadLastBooking(slug);
  if (
    last &&
    (bookingId == null || last.booking_id === bookingId) &&
    Date.parse(last.token_expires_at) - now > 60_000
  ) {
    return last.token;
  }
  return null;
}
