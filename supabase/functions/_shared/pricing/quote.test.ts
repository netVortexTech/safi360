import { describe, expect, it } from 'vitest';
import {
  ADDON_IDS,
  FIXTURE_ADDONS,
  FIXTURE_BASE,
  FIXTURE_CATALOG,
  FIXTURE_SERVICES,
  FIXTURE_ZONES,
  SERVICE_IDS,
  ZONE_IDS,
} from './fixtures.ts';
import { priceArea, quote, roundDuration, type Catalog } from './quote.ts';
import type { PerAreaRule } from './rules.ts';
import { QuoteError, type CatalogService, type PricingContext, type QuoteInput } from './types.ts';

const NOW = new Date('2026-10-14T09:00:00Z');

function ctx(over: Partial<PricingContext> = {}): PricingContext {
  return {
    deposit_pct: 30,
    quote_expiry_hours: 144,
    tax: { mode: 'none', rate_pct: 18, label: 'VAT' },
    base: FIXTURE_BASE,
    now: NOW,
    ...over,
  };
}

function item(
  partial: Partial<QuoteInput['items'][number]> & { service_id: string },
): QuoteInput['items'][number] {
  return { qty: 1, addons: [], ...partial };
}

function run(
  items: QuoteInput['items'],
  over: Partial<PricingContext> = {},
  catalog: Catalog = FIXTURE_CATALOG,
) {
  return quote({ items }, catalog, ctx(over));
}

function amounts(items: QuoteInput['items'], over: Partial<PricingContext> = {}) {
  return run(items, over).lines.map((l) => [l.kind, l.amount_tzs]);
}

function expectError(fn: () => unknown, code: string, path: (string | number)[]) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(QuoteError);
    expect((err as QuoteError).code).toBe(code);
    expect((err as QuoteError).path).toEqual(path);
    return;
  }
  throw new Error(`expected QuoteError ${code}`);
}

describe('PER_SEAT (sofa)', () => {
  it('prices seats × rate', () => {
    const q = run([item({ service_id: SERVICE_IDS.sofa, qty: 5 })]);
    expect(q.lines).toHaveLength(1);
    expect(q.lines[0]).toMatchObject({ kind: 'service', qty: 5, unit_price_tzs: 15000, amount_tzs: 75000 });
    expect(q.lines[0]?.unit).toEqual({ sw: 'kiti', en: 'seat' });
    expect(q.subtotal_tzs).toBe(75000);
    expect(q.total_tzs).toBe(75000);
    expect(q.deposit_tzs).toBe(22500);
    expect(q.balance_tzs).toBe(52500);
    expect(q.requires_review).toBe(false);
    expect(q.est_duration_min).toBe(135); // 30 + 5×20 = 130 → next quarter hour
    expect(q.expires_at).toBe('2026-10-20T09:00:00.000Z');
  });

  it('adds a minimum-charge line when seats × rate is below the minimum', () => {
    expect(amounts([item({ service_id: SERVICE_IDS.sofa, qty: 2 })])).toEqual([
      ['service', 30000],
      ['min_charge', 15000],
    ]);
    const q = run([item({ service_id: SERVICE_IDS.sofa, qty: 2 })]);
    expect(q.lines[1]).toMatchObject({ label_key: 'quote.line.min_charge', unit_price_tzs: 45000 });
    expect(q.subtotal_tzs).toBe(45000);
  });

  it('rejects fewer seats than the minimum', () => {
    const catalog: Catalog = {
      ...FIXTURE_CATALOG,
      services: [
        {
          ...FIXTURE_SERVICES[0]!,
          pricing_rule: { price_tzs: 15000, min_seats: 3 },
        },
      ],
    };
    expectError(() => run([item({ service_id: SERVICE_IDS.sofa, qty: 2 })], {}, catalog), 'qty_below_min', [
      'items',
      0,
      'qty',
    ]);
  });
});

describe('add-ons', () => {
  it('per-unit add-ons multiply by the item quantity; flat add-ons use their own qty', () => {
    const q = run([
      item({
        service_id: SERVICE_IDS.sofa,
        qty: 5,
        addons: [
          { addon_id: ADDON_IDS.stain, qty: 1 },
          { addon_id: ADDON_IDS.odour, qty: 2 },
        ],
      }),
    ]);
    expect(q.lines.map((l) => [l.kind, l.qty, l.amount_tzs])).toEqual([
      ['service', 5, 75000],
      ['addon', 5, 25000],
      ['addon', 2, 30000],
    ]);
    expect(q.lines[1]?.unit).toEqual({ sw: 'kiti', en: 'seat' });
    expect(q.lines[2]?.unit).toBeNull();
    expect(q.subtotal_tzs).toBe(130000);
  });

  it('rejects unknown, inactive and non-applicable add-ons', () => {
    const base = { service_id: SERVICE_IDS.carpet, variant: '5x6' };
    expectError(
      () => run([item({ ...base, addons: [{ addon_id: '00000000-0000-4000-8000-000000000000', qty: 1 }] })]),
      'addon_not_found',
      ['items', 0, 'addons', 0, 'addon_id'],
    );
    expectError(
      () => run([item({ ...base, addons: [{ addon_id: ADDON_IDS.retiredInactive, qty: 1 }] })]),
      'addon_not_found',
      ['items', 0, 'addons', 0, 'addon_id'],
    );
    expectError(
      () => run([item({ ...base, addons: [{ addon_id: ADDON_IDS.stain, qty: 1 }] })]),
      'addon_not_applicable',
      ['items', 0, 'addons', 0, 'addon_id'],
    );
  });

  it('labels per-unit add-ons with the unit of the service they attach to', () => {
    const perUnitGlobal = { ...FIXTURE_ADDONS[1]!, per_unit: true };
    const catalog: Catalog = { ...FIXTURE_CATALOG, addons: [perUnitGlobal, FIXTURE_ADDONS[3]!] };
    const rooms = run(
      [
        item({
          service_id: SERVICE_IDS.deepClean,
          rooms: { bedroom: 2, bathroom: 1 },
          addons: [{ addon_id: ADDON_IDS.odour, qty: 1 }],
        }),
      ],
      {},
      catalog,
    );
    const addonLine = rooms.lines.find((l) => l.kind === 'addon');
    expect(addonLine).toMatchObject({ qty: 3, amount_tzs: 45000, unit: { sw: 'chumba', en: 'room' } });

    const area = run(
      [
        item({
          service_id: SERVICE_IDS.office,
          area_sqm: 120,
          addons: [{ addon_id: ADDON_IDS.odour, qty: 1 }],
        }),
      ],
      {},
      catalog,
    );
    expect(area.lines.find((l) => l.kind === 'addon')).toMatchObject({
      qty: 120,
      unit: { sw: 'm²', en: 'm²' },
    });

    const variant = run(
      [
        item({
          service_id: SERVICE_IDS.carpet,
          variant: '6x6',
          qty: 2,
          addons: [{ addon_id: ADDON_IDS.protection, qty: 1 }],
        }),
      ],
      {},
      catalog,
    );
    expect(variant.lines.find((l) => l.kind === 'addon')).toMatchObject({
      qty: 2,
      amount_tzs: 16000,
      unit: null,
    });
  });
});

describe('PER_VARIANT (carpets, mattresses)', () => {
  it('prices the chosen variant × qty and applies a minimum charge', () => {
    expect(amounts([item({ service_id: SERVICE_IDS.carpet, variant: '8x10', qty: 2 })])).toEqual([
      ['service', 120000],
    ]);
    expect(amounts([item({ service_id: SERVICE_IDS.mattress, variant: 'single' })])).toEqual([
      ['service', 30000],
      ['min_charge', 10000],
    ]);
    const q = run([item({ service_id: SERVICE_IDS.carpet, variant: '5x6' })]);
    expect(q.lines[0]?.unit).toEqual({ sw: 'Futi 5×6', en: '5×6 ft' });
  });

  it('requires a known variant', () => {
    expectError(() => run([item({ service_id: SERVICE_IDS.carpet })]), 'variant_required', [
      'items',
      0,
      'variant',
    ]);
    expectError(() => run([item({ service_id: SERVICE_IDS.carpet, variant: '9x9' })]), 'variant_unknown', [
      'items',
      0,
      'variant',
    ]);
  });
});

describe('PER_ROOM (deep clean)', () => {
  it('emits one line per room type and sums them', () => {
    const q = run([
      item({ service_id: SERVICE_IDS.deepClean, rooms: { bedroom: 3, bathroom: 2, kitchen: 1, dining: 0 } }),
    ]);
    expect(q.lines.map((l) => [l.label?.en, l.qty, l.amount_tzs])).toEqual([
      ['Residential deep clean · Bedroom', 3, 90000],
      ['Residential deep clean · Bathroom', 2, 40000],
      ['Residential deep clean · Kitchen', 1, 35000],
    ]);
    expect(q.subtotal_tzs).toBe(165000);
    expect(q.crew_size).toBe(2);
    expect(q.est_duration_min).toBe(330); // 60 + 6×45
  });

  it('applies the minimum charge to small jobs', () => {
    expect(amounts([item({ service_id: SERVICE_IDS.deepClean, rooms: { bathroom: 1 } })])).toEqual([
      ['service', 20000],
      ['min_charge', 60000],
    ]);
  });

  it('requires at least one room and known room keys', () => {
    expectError(() => run([item({ service_id: SERVICE_IDS.deepClean })]), 'rooms_required', [
      'items',
      0,
      'rooms',
    ]);
    expectError(
      () => run([item({ service_id: SERVICE_IDS.deepClean, rooms: { bedroom: 0 } })]),
      'rooms_required',
      ['items', 0, 'rooms'],
    );
    expectError(
      () => run([item({ service_id: SERVICE_IDS.deepClean, rooms: { garage: 1 } })]),
      'room_unknown',
      ['items', 0, 'rooms', 'garage'],
    );
  });
});

describe('PER_AREA', () => {
  const bracket: PerAreaRule = {
    unit: 'sqm',
    tier_mode: 'bracket',
    tiers: [
      { up_to_sqm: 100, price_tzs: 2500 },
      { up_to_sqm: 300, price_tzs: 2200 },
      { up_to_sqm: null, price_tzs: 2000 },
    ],
  };
  const marginal: PerAreaRule = { ...bracket, tier_mode: 'marginal' };

  it('bracket mode prices the whole area at the matching tier', () => {
    expect(priceArea(bracket, 80)).toBe(200000);
    expect(priceArea(bracket, 100)).toBe(250000);
    expect(priceArea(bracket, 101)).toBe(222200);
    expect(priceArea(bracket, 500)).toBe(1000000);
    // No open tier: the last tier prices anything larger.
    expect(priceArea({ ...bracket, tiers: [{ up_to_sqm: 100, price_tzs: 2500 }] }, 150)).toBe(375000);
  });

  it('marginal mode prices each slice', () => {
    expect(priceArea(marginal, 80)).toBe(200000);
    expect(priceArea(marginal, 150)).toBe(250000 + 50 * 2200);
    expect(priceArea(marginal, 500)).toBe(250000 + 200 * 2200 + 200 * 2000);
    expect(priceArea(marginal, 12.5)).toBe(31250);
  });

  it('exact area: office (marginal) and post-construction (bracket) with minimum charge', () => {
    const office = run([item({ service_id: SERVICE_IDS.office, area_sqm: 250 })]);
    expect(office.lines[0]).toMatchObject({
      qty: 250,
      unit_price_tzs: 1440,
      amount_tzs: 360000,
      estimate: false,
    });
    expect(office.has_estimate).toBe(false);
    expect(office.est_duration_min).toBe(270); // 60 + 200 → 260 → 270

    expect(amounts([item({ service_id: SERVICE_IDS.postConstruction, area_sqm: 40 })])).toEqual([
      ['service', 100000],
      ['min_charge', 50000],
    ]);
  });

  it('area ranges produce an estimate from the assumed size', () => {
    const q = run([item({ service_id: SERVICE_IDS.postConstruction, area_range: '100_200' })]);
    expect(q.lines[0]).toMatchObject({ qty: 150, amount_tzs: 330000, estimate: true });
    expect(q.has_estimate).toBe(true);
  });

  it('a zero area is priced as zero and hits the minimum charge', () => {
    const q = run([item({ service_id: SERVICE_IDS.office, area_sqm: 0 })]);
    expect(q.lines[0]).toMatchObject({ amount_tzs: 0, unit_price_tzs: null });
    expect(q.subtotal_tzs).toBe(100000);
  });

  it('requires an exact area or a known range', () => {
    expectError(() => run([item({ service_id: SERVICE_IDS.office })]), 'area_required', [
      'items',
      0,
      'area_sqm',
    ]);
    expectError(
      () => run([item({ service_id: SERVICE_IDS.office, area_range: 'huge' })]),
      'area_range_unknown',
      ['items', 0, 'area_range'],
    );
  });
});

describe('PER_UNIT and FLAT', () => {
  it('water tanks: qty × rate within the allowed range', () => {
    const q = run([item({ service_id: SERVICE_IDS.waterTank, qty: 2 })]);
    expect(q.lines[0]).toMatchObject({ amount_tzs: 120000, unit: { sw: 'tanki', en: 'tank' } });
    expect(q.est_duration_min).toBe(240);
    expectError(() => run([item({ service_id: SERVICE_IDS.waterTank, qty: 11 })]), 'qty_above_max', [
      'items',
      0,
      'qty',
    ]);
  });

  it('enforces a minimum quantity when the rule has one', () => {
    const catalog: Catalog = {
      ...FIXTURE_CATALOG,
      services: [
        {
          ...FIXTURE_SERVICES[7]!,
          pricing_rule: { unit_sw: 'tanki', unit_en: 'tank', price_tzs: 60000, min_qty: 2 },
        },
      ],
    };
    expectError(
      () => run([item({ service_id: SERVICE_IDS.waterTank, qty: 1 })], {}, catalog),
      'qty_below_min',
      ['items', 0, 'qty'],
    );
  });

  it('flat price × qty', () => {
    expect(amounts([item({ service_id: SERVICE_IDS.fumigation, qty: 2 })])).toEqual([['service', 240000]]);
  });
});

describe('review-priced types', () => {
  it('INSPECTION_REQUIRED shows a from-price, no amount, no deposit', () => {
    const q = run([item({ service_id: SERVICE_IDS.mould })]);
    expect(q.lines[0]).toMatchObject({ amount_tzs: null, unit_price_tzs: 50000, requires_review: true });
    expect(q.requires_review).toBe(true);
    expect(q.subtotal_tzs).toBe(0);
    expect(q.deposit_tzs).toBe(0);
    expect(q.balance_tzs).toBe(0);
  });

  it('CUSTOM_QUOTE has no from-price and flags the whole quote', () => {
    const q = run([
      item({ service_id: SERVICE_IDS.commercial }),
      item({ service_id: SERVICE_IDS.sofa, qty: 4 }),
    ]);
    expect(q.lines[0]).toMatchObject({ amount_tzs: null, unit_price_tzs: null, requires_review: true });
    expect(q.requires_review).toBe(true);
    expect(q.subtotal_tzs).toBe(60000);
    expect(q.deposit_tzs).toBe(0);
    expect(q.crew_size).toBe(4);
  });
});

describe('catalog guards', () => {
  it('rejects unknown, inactive and soft-deleted services', () => {
    expectError(
      () => run([item({ service_id: '00000000-0000-4000-8000-000000000000' })]),
      'service_not_found',
      ['items', 0, 'service_id'],
    );
    expectError(() => run([item({ service_id: SERVICE_IDS.curtainsInactive })]), 'service_inactive', [
      'items',
      0,
      'service_id',
    ]);
    const deleted: CatalogService = { ...FIXTURE_SERVICES[0]!, deleted_at: '2026-10-01T00:00:00Z' };
    expectError(
      () => run([item({ service_id: SERVICE_IDS.sofa })], {}, { ...FIXTURE_CATALOG, services: [deleted] }),
      'service_inactive',
      ['items', 0, 'service_id'],
    );
  });

  it('reports a malformed stored rule as catalog_invalid instead of pricing it', () => {
    const badRule: CatalogService = { ...FIXTURE_SERVICES[0]!, pricing_rule: { price_tzs: -5 } };
    expectError(
      () => run([item({ service_id: SERVICE_IDS.sofa })], {}, { ...FIXTURE_CATALOG, services: [badRule] }),
      'catalog_invalid',
      ['items', 0, 'service_id'],
    );
    const badDuration: CatalogService = { ...FIXTURE_SERVICES[0]!, duration_rule: { base_min: -1 } };
    expectError(
      () =>
        run([item({ service_id: SERVICE_IDS.sofa })], {}, { ...FIXTURE_CATALOG, services: [badDuration] }),
      'catalog_invalid',
      ['items', 0, 'service_id'],
    );
  });
});

describe('zones and travel fee', () => {
  const sofa5 = item({ service_id: SERVICE_IDS.sofa, qty: 5 });

  it('no address → no zone, not out of area', () => {
    const q = run([sofa5]);
    expect(q.zone).toBeNull();
    expect(q.out_of_area).toBe(false);
    expect(q.travel_fee_tzs).toBe(0);
  });

  it('a zone with a fee adds a travel line', () => {
    const q = quote({ items: [sofa5], address: { area: 'Mikocheni' } }, FIXTURE_CATALOG, ctx());
    expect(q.zone).toMatchObject({ zone_id: ZONE_IDS.kinondoni, travel_fee_tzs: 5000, matched_by: 'area' });
    expect(q.lines.at(-1)).toMatchObject({
      kind: 'travel',
      label_key: 'quote.line.travel',
      amount_tzs: 5000,
    });
    expect(q.total_tzs).toBe(80000);
    expect(q.deposit_tzs).toBe(24000);
  });

  it('a free zone adds no line', () => {
    const q = quote({ items: [sofa5], address: { area: 'Kimara' } }, FIXTURE_CATALOG, ctx());
    expect(q.zone?.zone_id).toBe(ZONE_IDS.mbezi);
    expect(q.lines.some((l) => l.kind === 'travel')).toBe(false);
  });

  it('an unserviceable or unmatched address is out of area with no fee', () => {
    const bagamoyo = quote({ items: [sofa5], address: { area: 'Bagamoyo' } }, FIXTURE_CATALOG, ctx());
    expect(bagamoyo.out_of_area).toBe(true);
    expect(bagamoyo.travel_fee_tzs).toBe(0);
    const nowhere = quote({ items: [sofa5], address: { area: 'Dodoma' } }, FIXTURE_CATALOG, ctx());
    expect(nowhere.zone).toBeNull();
    expect(nowhere.out_of_area).toBe(true);
  });
});

describe('discounts and tax', () => {
  const sofa5 = item({ service_id: SERVICE_IDS.sofa, qty: 5 });

  it('percent discount on the subtotal, before travel', () => {
    const q = quote(
      { items: [sofa5], address: { area: 'Masaki' } },
      FIXTURE_CATALOG,
      ctx({ discount: { kind: 'percent', value: 10, code: 'KARIBU10' } }),
    );
    expect(q.discount_tzs).toBe(7500);
    expect(q.lines.find((l) => l.kind === 'discount')).toMatchObject({
      amount_tzs: -7500,
      label: { en: 'KARIBU10' },
    });
    expect(q.total_tzs).toBe(75000 + 5000 - 7500);
  });

  it('fixed discount is capped at the subtotal and a zero discount adds no line', () => {
    const capped = run([sofa5], { discount: { kind: 'fixed', value: 999999 } });
    expect(capped.discount_tzs).toBe(75000);
    expect(capped.total_tzs).toBe(0);
    expect(capped.lines.find((l) => l.kind === 'discount')?.label).toBeNull();
    const zero = run([sofa5], { discount: { kind: 'percent', value: 0 } });
    expect(zero.discount_tzs).toBe(0);
    expect(zero.lines.some((l) => l.kind === 'discount')).toBe(false);
  });

  it('ignores a discount when nothing is priced yet', () => {
    const q = run([item({ service_id: SERVICE_IDS.commercial })], {
      discount: { kind: 'percent', value: 50 },
    });
    expect(q.discount_tzs).toBe(0);
  });

  it('exclusive tax adds a line; a zero rate adds none', () => {
    const q = run([sofa5], { tax: { mode: 'exclusive', rate_pct: 18, label: 'VAT' } });
    expect(q.tax_tzs).toBe(13500);
    expect(q.lines.at(-1)).toMatchObject({ kind: 'tax', qty: 18, amount_tzs: 13500, label: { en: 'VAT' } });
    expect(q.total_tzs).toBe(88500);
    expect(q.deposit_tzs).toBe(26550);
    const zero = run([sofa5], { tax: { mode: 'exclusive', rate_pct: 0, label: 'VAT' } });
    expect(zero.tax_tzs).toBe(0);
    expect(zero.lines.some((l) => l.kind === 'tax')).toBe(false);
  });

  it('inclusive tax is informational and leaves the total alone', () => {
    const q = run([sofa5], { tax: { mode: 'inclusive', rate_pct: 18, label: 'VAT' } });
    expect(q.total_tzs).toBe(75000);
    expect(q.tax_tzs).toBe(11441); // 75000 × 18 / 118
    expect(q.lines.some((l) => l.kind === 'tax')).toBe(false);
  });
});

describe('multi-item quotes', () => {
  it('sums items, takes the largest crew and rounds the duration', () => {
    const q = run([
      item({ service_id: SERVICE_IDS.sofa, qty: 7, addons: [{ addon_id: ADDON_IDS.petHair, qty: 1 }] }),
      item({ service_id: SERVICE_IDS.carpet, variant: '6x6', qty: 2 }),
      item({ service_id: SERVICE_IDS.fumigation }),
    ]);
    expect(q.subtotal_tzs).toBe(105000 + 10000 + 80000 + 120000);
    expect(q.crew_size).toBe(1);
    expect(q.est_duration_min).toBe(roundDuration(30 + 140 + 30 + 60 + 90));
  });

  it('roundDuration never goes below 30 and rounds up to quarter hours', () => {
    expect(roundDuration(0)).toBe(30);
    expect(roundDuration(31)).toBe(45);
    expect(roundDuration(60)).toBe(60);
  });
});

describe('fixture sanity', () => {
  it('every fixture service parses under its rule schema', () => {
    for (const s of FIXTURE_SERVICES.filter((s) => s.active)) {
      const input = item({
        service_id: s.id,
        qty: 1,
        ...(s.pricing_type === 'PER_VARIANT'
          ? { variant: s.id === SERVICE_IDS.carpet ? '5x6' : 'single' }
          : {}),
        ...(s.pricing_type === 'PER_ROOM' ? { rooms: { bedroom: 1 } } : {}),
        ...(s.pricing_type === 'PER_AREA' ? { area_sqm: 100 } : {}),
      });
      expect(() => run([input])).not.toThrow();
    }
    expect(FIXTURE_ZONES.filter((z) => z.serviceable)).toHaveLength(3);
  });
});
