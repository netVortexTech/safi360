import { z } from 'zod';
import { ALLOWED_TRANSITIONS, BOOKING_STATUSES, canTransition, isTerminalStatus } from './enums.ts';
import {
  idempotencyKey,
  phoneE164,
  tenantSettings,
  tenantSlug,
  ticketPrefix,
  ticketRef,
  toFieldErrors,
  tzsAmount,
} from './schemas.ts';

describe('shared schemas', () => {
  it('accepts only E.164 Tanzanian phones', () => {
    expect(phoneE164.safeParse('+255754123456').success).toBe(true);
    expect(phoneE164.safeParse('0754123456').success).toBe(false);
    expect(phoneE164.safeParse('+254712345678').success).toBe(false);
  });

  it('accepts only integer, non-negative TZS', () => {
    expect(tzsAmount.safeParse(75000).success).toBe(true);
    expect(tzsAmount.safeParse(75000.5).success).toBe(false);
    expect(tzsAmount.safeParse(-1).success).toBe(false);
  });

  it('normalises slugs and prefixes', () => {
    expect(tenantSlug.parse('  Usafi-Bora ')).toBe('usafi-bora');
    expect(tenantSlug.safeParse('-bad').success).toBe(false);
    expect(ticketPrefix.parse('ubc')).toBe('UBC');
    expect(ticketPrefix.safeParse('U1').success).toBe(false);
  });

  it('validates ticket references', () => {
    expect(ticketRef.parse('ubc-2026-00042')).toBe('UBC-2026-00042');
    expect(ticketRef.safeParse('UBC-26-42').success).toBe(false);
  });

  it('validates idempotency keys', () => {
    expect(idempotencyKey.safeParse('booking_123e4567-e89b-12d3-a456-426614174000').success).toBe(true);
    expect(idempotencyKey.safeParse('booking_x').success).toBe(false);
  });

  it('fills tenant settings defaults', () => {
    const s = tenantSettings.parse({});
    expect(s.deposit_pct).toBe(30);
    expect(s.travel_buffer_min).toBe(45);
    expect(s.default_locale).toBe('sw');
  });

  it('maps zod issues to field errors', () => {
    const schema = z.object({ phone: phoneE164, amount: tzsAmount });
    const result = schema.safeParse({ phone: 'x', amount: 1.5 });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(toFieldErrors(result.error)).toEqual({
        phone: 'validation.phone.invalid',
        amount: 'validation.money.integer',
      });
    }
  });
});

describe('booking transitions', () => {
  it('cover every status', () => {
    for (const s of BOOKING_STATUSES) expect(ALLOWED_TRANSITIONS[s]).toBeDefined();
  });
  it('allow the documented moves and nothing else', () => {
    expect(canTransition('CONFIRMED', 'ASSIGNED')).toBe(true);
    expect(canTransition('ASSIGNED', 'CONFIRMED')).toBe(true); // unassign
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'CANCELLED')).toBe(false);
    expect(canTransition('COMPLETED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('CLOSED', 'CONFIRMED')).toBe(false);
  });
  it('terminal outcomes have no exits', () => {
    for (const s of ['CANCELLED', 'QUOTE_REJECTED', 'NO_SHOW', 'EXPIRED'] as const) {
      expect(isTerminalStatus(s)).toBe(true);
      expect(ALLOWED_TRANSITIONS[s]).toHaveLength(0);
    }
    expect(isTerminalStatus('COMPLETED')).toBe(false);
  });
});
