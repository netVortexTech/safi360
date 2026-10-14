// Booking, assignment and payment forms generate an idempotency key when they open.
// The same key is sent on every submit of that form instance, so a double-tap or a
// retry after a timeout returns the existing ticket instead of creating a second one.

export type IdempotencyScope = 'booking' | 'assignment' | 'payment' | 'manual_payment' | 'quote';

function randomUuid(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  // Fallback for very old WebViews: 128 random bits as hex.
  const bytes = c.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function newIdempotencyKey(scope: IdempotencyScope): string {
  return `${scope}_${randomUuid()}`;
}

export const IDEMPOTENCY_KEY_PATTERN = /^(booking|assignment|payment|manual_payment|quote)_[0-9a-f-]{32,36}$/;

export function isIdempotencyKey(value: string): boolean {
  return IDEMPOTENCY_KEY_PATTERN.test(value);
}
