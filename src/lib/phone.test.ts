import { formatPhone, maskPhone, normalizeTzPhone } from './phone';

describe('normalizeTzPhone', () => {
  it.each([
    ['0754123456', '+255754123456'],
    ['0754 123 456', '+255754123456'],
    ['754123456', '+255754123456'],
    ['255754123456', '+255754123456'],
    ['+255 754 123 456', '+255754123456'],
    ['+255754123456', '+255754123456'],
    ['00255754123456', '+255754123456'],
    ['(0754) 123-456', '+255754123456'],
  ])('normalises %s → %s', (input, expected) => {
    expect(normalizeTzPhone(input)).toEqual({ ok: true, e164: expected, national: '754123456' });
  });

  it('rejects short input with a field-level reason', () => {
    expect(normalizeTzPhone('754 12')).toEqual({ ok: false, reason: 'too_short' });
  });

  it('rejects long input', () => {
    expect(normalizeTzPhone('7541234567')).toEqual({ ok: false, reason: 'too_long' });
  });

  it('rejects empty input', () => {
    expect(normalizeTzPhone('   ')).toEqual({ ok: false, reason: 'empty' });
  });

  it('rejects non-Tanzanian country codes', () => {
    expect(normalizeTzPhone('+254712345678')).toEqual({ ok: false, reason: 'not_tanzanian' });
  });

  it('rejects a national number starting with 0 after the trunk prefix', () => {
    expect(normalizeTzPhone('0054123456')).toEqual({ ok: false, reason: 'invalid_prefix' });
  });
});

describe('formatPhone / maskPhone', () => {
  it('formats for display', () => {
    expect(formatPhone('+255754123456')).toBe('+255 754 123 456');
  });
  it('leaves malformed values untouched', () => {
    expect(formatPhone('nope')).toBe('nope');
  });
  it('masks for logs', () => {
    expect(maskPhone('+255754123456')).toBe('+25575****456');
    expect(maskPhone('garbage')).toBe('***');
  });
});
