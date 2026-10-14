import { beforeEach, describe, expect, it } from 'vitest';
import { captureSource, currentSource, parseSource } from './source';

describe('booking source capture', () => {
  beforeEach(() => window.sessionStorage.clear());

  it('accepts only customer-facing sources from ?src=', () => {
    expect(parseSource('instagram')).toBe('instagram');
    expect(parseSource('WhatsApp')).toBe('whatsapp');
    expect(parseSource('admin_created')).toBeNull();
    expect(parseSource('carrier_pigeon')).toBeNull();
    expect(parseSource(null)).toBeNull();
  });

  it('defaults to website, remembers the query for the session and lets the widget force its own', () => {
    expect(captureSource('')).toBe('website');
    expect(captureSource('?src=facebook&x=1')).toBe('facebook');
    expect(captureSource('')).toBe('facebook');
    expect(currentSource()).toBe('facebook');
    expect(captureSource('?src=facebook', 'booking_widget')).toBe('booking_widget');
  });
});
