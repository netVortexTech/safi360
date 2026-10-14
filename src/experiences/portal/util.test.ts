import { describe, expect, it } from 'vitest';
import i18next from 'i18next';
import { FIXTURE_SERVICES, SERVICE_IDS } from '@shared/pricing/fixtures';
import type { PortalService } from './types';
import { addDaysKey, formatRemaining, priceLabel, variantFor } from './util';

const service = (id: string): PortalService => {
  const s = FIXTURE_SERVICES.find((x) => x.id === id)!;
  return {
    ...s,
    category_id: null,
    description_sw: null,
    description_en: null,
    recurrence_days: null,
    sort: 0,
  };
};

describe('portal helpers', () => {
  it('adds calendar days across month ends', () => {
    expect(addDaysKey('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysKey('2026-10-16', -7)).toBe('2026-10-09');
  });

  it('formats remaining time as m:ss and never below zero', () => {
    expect(formatRemaining(754_000)).toBe('12:34');
    expect(formatRemaining(5_000)).toBe('0:05');
    expect(formatRemaining(-10)).toBe('0:00');
  });

  it('labels starting prices per pricing model', () => {
    const t = i18next.getFixedT('en');
    expect(priceLabel(service(SERVICE_IDS.sofa), 'en', t)).toBe('TZS 15,000 / seat');
    expect(priceLabel(service(SERVICE_IDS.carpet), 'en', t)).toBe('from TZS 35,000');
    expect(priceLabel(service(SERVICE_IDS.fumigation), 'en', t)).toBe('TZS 120,000');
    expect(priceLabel(service(SERVICE_IDS.mould), 'en', t)).toBe('from TZS 50,000');
    expect(priceLabel(service(SERVICE_IDS.commercial), 'en', t)).toBe('Price after inspection');
    expect(priceLabel(service(SERVICE_IDS.sofa), 'sw', t)).toBe('TZS 15,000 / kiti');
  });

  it('maps statuses to the three confirmation headlines', () => {
    expect(variantFor('CONFIRMED')).toBe('confirmed');
    expect(variantFor('ASSIGNED')).toBe('confirmed');
    expect(variantFor('AWAITING_PAYMENT')).toBe('payment');
    expect(variantFor('AWAITING_REVIEW')).toBe('request');
    expect(variantFor('AWAITING_CUSTOMER_APPROVAL')).toBe('request');
  });
});
