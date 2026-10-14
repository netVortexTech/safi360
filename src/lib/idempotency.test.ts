import { isIdempotencyKey, newIdempotencyKey } from './idempotency';

describe('idempotency keys', () => {
  it('are scoped and unique', () => {
    const a = newIdempotencyKey('booking');
    const b = newIdempotencyKey('booking');
    expect(a).not.toBe(b);
    expect(a.startsWith('booking_')).toBe(true);
    expect(isIdempotencyKey(a)).toBe(true);
  });
  it('rejects foreign formats', () => {
    expect(isIdempotencyKey('booking_short')).toBe(false);
    expect(isIdempotencyKey('other_1234567890123456789012345678901234')).toBe(false);
  });
});
