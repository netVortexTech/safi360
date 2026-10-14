// Where a visitor came from. `?src=` on any portal URL is validated against the enum and
// remembered for the session so the booking records it; the widget route forces its own.
import { BOOKING_SOURCES, type BookingSource } from '@shared/enums';

const KEY = 'safi360.portal.source';
const CUSTOMER_SOURCES: BookingSource[] = [
  'website',
  'booking_widget',
  'whatsapp',
  'instagram',
  'facebook',
  'referral',
];

export function parseSource(value: string | null | undefined): BookingSource | null {
  if (!value) return null;
  const v = value.trim().toLowerCase();
  return (BOOKING_SOURCES as readonly string[]).includes(v) && CUSTOMER_SOURCES.includes(v as BookingSource)
    ? (v as BookingSource)
    : null;
}

function storage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Call once per page load with the current search params; returns the effective source. */
export function captureSource(search: string, forced?: BookingSource): BookingSource {
  const s = storage();
  const fromQuery = parseSource(new URLSearchParams(search).get('src'));
  const chosen = forced ?? fromQuery ?? parseSource(s?.getItem(KEY)) ?? 'website';
  try {
    s?.setItem(KEY, chosen);
  } catch {
    // Storage blocked: the default still applies for this page.
  }
  return chosen;
}

export function currentSource(): BookingSource {
  return parseSource(storage()?.getItem(KEY)) ?? 'website';
}
