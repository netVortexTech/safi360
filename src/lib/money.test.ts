import { depositFor, formatTzs, parseTzs } from './money';

describe('formatTzs', () => {
  it('formats with thousands separators and the TZS code', () => {
    expect(formatTzs(1665000)).toBe('TZS 1,665,000');
    expect(formatTzs(0)).toBe('TZS 0');
  });
  it('can omit the code', () => {
    expect(formatTzs(120000, { withCode: false })).toBe('120,000');
  });
  it('renders refunds with a proper minus sign', () => {
    expect(formatTzs(-5000)).toBe('−TZS 5,000');
  });
  it('refuses fractional amounts', () => {
    expect(() => formatTzs(10.5)).toThrow(TypeError);
  });
});

describe('parseTzs', () => {
  it.each([
    ['75,000', 75000],
    ['75 000', 75000],
    ['TZS 75000', 75000],
    ['0', 0],
  ])('parses %s', (input, expected) => {
    expect(parseTzs(input)).toBe(expected);
  });
  it('returns null for decimals and junk', () => {
    expect(parseTzs('75.50')).toBeNull();
    expect(parseTzs('abc')).toBeNull();
    expect(parseTzs('')).toBeNull();
  });
});

describe('depositFor', () => {
  it('rounds to the nearest shilling', () => {
    expect(depositFor(100000, 30)).toBe(30000);
    expect(depositFor(85000, 30)).toBe(25500);
    expect(depositFor(33333, 30)).toBe(10000);
  });
});
