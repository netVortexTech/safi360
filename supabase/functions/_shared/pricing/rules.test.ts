import { describe, expect, it } from 'vitest';
import { PRICING_TYPES } from '../enums.ts';
import { FIXTURE_SERVICES } from './fixtures.ts';
import {
  defaultPricingRule,
  discountInput,
  parseDurationRule,
  parsePricingRule,
  perAreaRule,
  perUnitRule,
  perVariantRule,
  PRICING_RULE_SCHEMAS,
  PRICING_TYPE_ORDER,
  quoteAddressInput,
  quoteItemInput,
} from './rules.ts';

function issues(result: {
  success: boolean;
  error?: { issues: { path: (string | number)[]; message: string }[] };
}) {
  return result.success ? [] : (result.error?.issues ?? []).map((i) => [i.path.join('.'), i.message]);
}

describe('pricing rule schemas', () => {
  it('accept every seeded rule', () => {
    for (const s of FIXTURE_SERVICES) {
      expect(() => parsePricingRule(s.pricing_type, s.pricing_rule), s.name_en).not.toThrow();
      expect(() => parseDurationRule(s.duration_rule), s.name_en).not.toThrow();
    }
  });

  it('every pricing type has a schema, a default and a place in the editor order', () => {
    for (const t of PRICING_TYPES) {
      expect(PRICING_RULE_SCHEMAS[t]).toBeDefined();
      expect(() => parsePricingRule(t, defaultPricingRule(t))).not.toThrow();
      expect(PRICING_TYPE_ORDER).toContain(t);
    }
    expect(new Set(PRICING_TYPE_ORDER).size).toBe(PRICING_TYPES.length);
  });

  it('PER_UNIT: min_qty may not exceed max_qty', () => {
    const r = perUnitRule.safeParse({
      unit_sw: 'tanki',
      unit_en: 'tank',
      price_tzs: 1000,
      min_qty: 5,
      max_qty: 2,
    });
    expect(issues(r)).toEqual([['max_qty', 'validation.rule.min_gt_max']]);
  });

  it('PER_VARIANT: keys must be unique and lowercase', () => {
    const dup = perVariantRule.safeParse({
      variants: [
        { key: 'a', label_sw: 'A', label_en: 'A', price_tzs: 1 },
        { key: 'a', label_sw: 'B', label_en: 'B', price_tzs: 2 },
      ],
    });
    expect(issues(dup)).toEqual([['variants.1.key', 'validation.rule.duplicate_key']]);
    const badKey = perVariantRule.safeParse({
      variants: [{ key: 'Big One', label_sw: 'A', label_en: 'A', price_tzs: 1 }],
    });
    expect(issues(badKey)).toEqual([['variants.0.key', 'validation.rule.key_format']]);
    expect(perVariantRule.safeParse({ variants: [] }).success).toBe(false);
  });

  it('PER_AREA: tiers ascend, only the last may be open, ranges are well-formed', () => {
    const notAscending = perAreaRule.safeParse({
      tiers: [
        { up_to_sqm: 100, price_tzs: 1 },
        { up_to_sqm: 50, price_tzs: 1 },
      ],
    });
    expect(issues(notAscending)).toEqual([['tiers.1.up_to_sqm', 'validation.rule.tiers_not_ascending']]);
    const openFirst = perAreaRule.safeParse({
      tiers: [
        { up_to_sqm: null, price_tzs: 1 },
        { up_to_sqm: 50, price_tzs: 1 },
      ],
    });
    expect(issues(openFirst)).toEqual([['tiers.0.up_to_sqm', 'validation.rule.open_tier_not_last']]);
    const badRange = perAreaRule.safeParse({
      tiers: [{ up_to_sqm: null, price_tzs: 1 }],
      ranges: [
        { key: 'a', label_sw: 'A', label_en: 'A', min_sqm: 100, max_sqm: 50, assumed_sqm: 75 },
        { key: 'a', label_sw: 'B', label_en: 'B', min_sqm: 0, max_sqm: null, assumed_sqm: 10 },
      ],
    });
    expect(issues(badRange)).toEqual([
      ['ranges.0.max_sqm', 'validation.rule.min_gt_max'],
      ['ranges.1.key', 'validation.rule.duplicate_key'],
    ]);
    const parsed = perAreaRule.parse({ tiers: [{ up_to_sqm: null, price_tzs: 1 }] });
    expect(parsed.tier_mode).toBe('bracket');
    expect(parsed.unit).toBe('sqm');
  });

  it('rejects unknown keys so typos never silently change a price', () => {
    expect(parsePricingRule.bind(null, 'FLAT', { price_tzs: 1, prize: 2 })).toThrow();
    expect(parseDurationRule(undefined)).toEqual({
      base_min: 60,
      per_unit_min: 0,
      per_sqm_min: 0,
      per_room_min: 0,
    });
  });
});

describe('quote input schemas', () => {
  it('fills defaults and rejects half a pin', () => {
    const parsed = quoteItemInput.parse({ service_id: '55550000-0000-4000-8000-000000000001' });
    expect(parsed).toEqual({ service_id: '55550000-0000-4000-8000-000000000001', qty: 1, addons: [] });
    expect(quoteAddressInput.safeParse({ lat: -6.7 }).success).toBe(false);
    expect(quoteAddressInput.safeParse({ lat: -6.7, lng: 39.2, area: 'Mbezi' }).success).toBe(true);
    expect(quoteAddressInput.safeParse({}).success).toBe(true);
  });

  it('discounts: percent is capped at 100', () => {
    expect(discountInput.safeParse({ kind: 'percent', value: 120 }).success).toBe(false);
    expect(discountInput.safeParse({ kind: 'fixed', value: 120000, reason: 'Repeat customer' }).success).toBe(
      true,
    );
  });
});
