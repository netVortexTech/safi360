import { describe, expect, it } from 'vitest';
import {
  hashCode,
  hmac,
  randomCode,
  randomSalt,
  signToken,
  timingSafeEqual,
  TokenError,
  verifyToken,
  type CustomerTokenPayload,
} from './otp.ts';

const SECRET = 'unit-test-secret';
const NOW = new Date('2026-10-14T09:00:00Z');

describe('one-time codes', () => {
  it('generates six digits and distinct salts', () => {
    expect(randomCode()).toMatch(/^\d{6}$/);
    expect(randomSalt()).not.toBe(randomSalt());
  });

  it('hashes deterministically per salt and never stores the code', async () => {
    const salt = randomSalt();
    const a = await hashCode('123456', salt);
    expect(a).toBe(await hashCode('123456', salt));
    expect(a).not.toBe(await hashCode('123457', salt));
    expect(a).not.toBe(await hashCode('123456', randomSalt()));
    expect(a).not.toContain('123456');
  });

  it('compares in constant time semantics (equal length, equal content)', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
  });
});

describe('customer tokens', () => {
  const payload: CustomerTokenPayload = {
    tenant_id: '11111111-1111-4111-8111-111111111111',
    phone: '+255754000001',
    purpose: 'booking',
    exp: NOW.getTime() + 60_000,
  };

  it('round-trips a signed payload', async () => {
    const token = await signToken(payload, SECRET);
    expect(await verifyToken(token, SECRET, NOW)).toEqual(payload);
  });

  it('rejects tampering, the wrong secret and malformed tokens', async () => {
    const token = await signToken(payload, SECRET);
    const [body, sig] = token.split('.') as [string, string];
    await expect(verifyToken(`${body}x.${sig}`, SECRET, NOW)).rejects.toMatchObject({
      code: 'token_invalid',
    });
    await expect(verifyToken(token, 'other', NOW)).rejects.toBeInstanceOf(TokenError);
    await expect(verifyToken('nonsense', SECRET, NOW)).rejects.toMatchObject({ code: 'token_invalid' });
    const forged = `${btoa(JSON.stringify({ phone: 1 }))}.${await hmac(SECRET, btoa(JSON.stringify({ phone: 1 })))}`;
    await expect(verifyToken(forged, SECRET, NOW)).rejects.toMatchObject({ code: 'token_invalid' });
  });

  it('expires', async () => {
    const token = await signToken(payload, SECRET);
    await expect(verifyToken(token, SECRET, new Date(payload.exp))).rejects.toMatchObject({
      code: 'token_expired',
    });
  });
});
