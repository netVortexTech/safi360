// Pricing rule shapes, one per pricing_type (blueprint §2.3 + brief). These schemas run on
// every write (service editor, Edge Functions) and on every read (quote engine), so a
// malformed rule can never silently price a job. Dependency-free apart from zod.
import { z } from 'zod';
import type { PricingType } from '../enums.ts';

const int = z.number().int();
export const tzs = int.nonnegative({ message: 'validation.money.nonnegative' }).max(1_000_000_000);
const positiveInt = int.positive();
/** Machine key for variants, rooms and ranges: lowercase, digits, underscore. */
export const ruleKey = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_]+$/, { message: 'validation.rule.key_format' });
const label = z.string().trim().min(1, { message: 'validation.required' }).max(80);

function uniqueKeys<T extends { key: string }>(field: string, items: T[], ctx: z.RefinementCtx) {
  const seen = new Set<string>();
  items.forEach((it, i) => {
    if (seen.has(it.key)) {
      ctx.addIssue({ code: 'custom', path: [field, i, 'key'], message: 'validation.rule.duplicate_key' });
    }
    seen.add(it.key);
  });
}

const minCharge = { min_charge_tzs: tzs.optional() };

export const perUnitRule = z
  .object({
    unit_sw: label,
    unit_en: label,
    price_tzs: tzs,
    ...minCharge,
    min_qty: positiveInt.max(999).optional(),
    max_qty: positiveInt.max(999).optional(),
  })
  .strict()
  .refine((r) => r.min_qty == null || r.max_qty == null || r.min_qty <= r.max_qty, {
    message: 'validation.rule.min_gt_max',
    path: ['max_qty'],
  });

export const perSeatRule = z
  .object({
    price_tzs: tzs,
    ...minCharge,
    min_seats: positiveInt.max(99).optional(),
  })
  .strict();

export const priceOption = z
  .object({ key: ruleKey, label_sw: label, label_en: label, price_tzs: tzs })
  .strict();
export type PriceOption = z.infer<typeof priceOption>;

export const perVariantRule = z
  .object({
    variants: z.array(priceOption).min(1, { message: 'validation.rule.variants_empty' }).max(30),
    ...minCharge,
  })
  .strict()
  .superRefine((r, ctx) => uniqueKeys('variants', r.variants, ctx));

export const perRoomRule = z
  .object({
    rooms: z.array(priceOption).min(1, { message: 'validation.rule.rooms_empty' }).max(30),
    ...minCharge,
  })
  .strict()
  .superRefine((r, ctx) => uniqueKeys('rooms', r.rooms, ctx));

export const areaTier = z
  .object({
    /** Upper bound of the tier in m²; null = everything above the previous tier. */
    up_to_sqm: z.number().positive().max(1_000_000).nullable(),
    price_tzs: tzs,
  })
  .strict();

export const areaRange = z
  .object({
    key: ruleKey,
    label_sw: label,
    label_en: label,
    min_sqm: z.number().nonnegative(),
    max_sqm: z.number().positive().nullable(),
    /** Area used for the estimate when the customer picks this range. */
    assumed_sqm: z.number().positive(),
  })
  .strict()
  .refine((r) => r.max_sqm == null || r.max_sqm > r.min_sqm, {
    message: 'validation.rule.min_gt_max',
    path: ['max_sqm'],
  });

export const perAreaRule = z
  .object({
    unit: z.literal('sqm').default('sqm'),
    tiers: z.array(areaTier).min(1, { message: 'validation.rule.tiers_empty' }).max(10),
    /**
     * bracket  — the tier the total area falls into prices the whole area ("over 100 m²: 2,000/m²")
     * marginal — each tier prices its own slice, like tax brackets
     */
    tier_mode: z.enum(['bracket', 'marginal']).default('bracket'),
    /** Customers rarely know exact m²; ranges let them pick a bracket and get an estimate. */
    ranges: z.array(areaRange).max(10).optional(),
    ...minCharge,
  })
  .strict()
  .superRefine((r, ctx) => {
    let last = 0;
    r.tiers.forEach((t, i) => {
      const isLast = i === r.tiers.length - 1;
      if (t.up_to_sqm == null && !isLast) {
        ctx.addIssue({ code: 'custom', path: ['tiers', i, 'up_to_sqm'], message: 'validation.rule.open_tier_not_last' });
      }
      if (t.up_to_sqm != null) {
        if (t.up_to_sqm <= last) {
          ctx.addIssue({ code: 'custom', path: ['tiers', i, 'up_to_sqm'], message: 'validation.rule.tiers_not_ascending' });
        }
        last = t.up_to_sqm;
      }
    });
    if (r.ranges) uniqueKeys('ranges', r.ranges, ctx);
  });

export const flatRule = z.object({ price_tzs: tzs }).strict();

export const reviewRule = z
  .object({
    /** Shown as "from TZS X" on the booking page; never charged automatically. */
    from_price_tzs: tzs.optional(),
  })
  .strict();

export const durationRule = z
  .object({
    base_min: int.nonnegative().max(24 * 60).default(60),
    per_unit_min: int.nonnegative().max(24 * 60).default(0),
    per_sqm_min: z.number().nonnegative().max(60).default(0),
    per_room_min: int.nonnegative().max(24 * 60).default(0),
  })
  .strict();
export type DurationRule = z.infer<typeof durationRule>;

export const PRICING_RULE_SCHEMAS = {
  PER_UNIT: perUnitRule,
  PER_SEAT: perSeatRule,
  PER_VARIANT: perVariantRule,
  PER_AREA: perAreaRule,
  PER_ROOM: perRoomRule,
  FLAT: flatRule,
  INSPECTION_REQUIRED: reviewRule,
  CUSTOM_QUOTE: reviewRule,
} as const satisfies Record<PricingType, z.ZodTypeAny>;

export type PerUnitRule = z.infer<typeof perUnitRule>;
export type PerSeatRule = z.infer<typeof perSeatRule>;
export type PerVariantRule = z.infer<typeof perVariantRule>;
export type PerRoomRule = z.infer<typeof perRoomRule>;
export type PerAreaRule = z.infer<typeof perAreaRule>;
export type FlatRule = z.infer<typeof flatRule>;
export type ReviewRule = z.infer<typeof reviewRule>;

export type PricingRuleOf<T extends PricingType> = z.infer<(typeof PRICING_RULE_SCHEMAS)[T]>;

/** Parse a stored rule. Throws ZodError — callers decide whether that is a 422 or a 500. */
export function parsePricingRule<T extends PricingType>(type: T, raw: unknown): PricingRuleOf<T> {
  return PRICING_RULE_SCHEMAS[type].parse(raw);
}

export function parseDurationRule(raw: unknown): DurationRule {
  return durationRule.parse(raw ?? {});
}

/** Starting rule for the service editor when the owner picks a pricing model. */
export function defaultPricingRule(type: PricingType): PricingRuleOf<typeof type> {
  switch (type) {
    case 'PER_UNIT':
      return { unit_sw: 'kipande', unit_en: 'item', price_tzs: 0 } satisfies PerUnitRule;
    case 'PER_SEAT':
      return { price_tzs: 0 } satisfies PerSeatRule;
    case 'PER_VARIANT':
      return { variants: [{ key: 'standard', label_sw: 'Kawaida', label_en: 'Standard', price_tzs: 0 }] };
    case 'PER_ROOM':
      return {
        rooms: [
          { key: 'bedroom', label_sw: 'Chumba cha kulala', label_en: 'Bedroom', price_tzs: 0 },
          { key: 'bathroom', label_sw: 'Bafu', label_en: 'Bathroom', price_tzs: 0 },
          { key: 'kitchen', label_sw: 'Jiko', label_en: 'Kitchen', price_tzs: 0 },
          { key: 'sitting', label_sw: 'Sebule', label_en: 'Sitting room', price_tzs: 0 },
        ],
      };
    case 'PER_AREA':
      return { unit: 'sqm', tiers: [{ up_to_sqm: null, price_tzs: 0 }], tier_mode: 'bracket' } satisfies PerAreaRule;
    case 'FLAT':
      return { price_tzs: 0 } satisfies FlatRule;
    case 'INSPECTION_REQUIRED':
    case 'CUSTOM_QUOTE':
      return {} satisfies ReviewRule;
  }
}

/** Display order in the editor: simplest first, "needs a human" last. */
export const PRICING_TYPE_ORDER = [
  'FLAT',
  'PER_UNIT',
  'PER_SEAT',
  'PER_VARIANT',
  'PER_ROOM',
  'PER_AREA',
  'INSPECTION_REQUIRED',
  'CUSTOM_QUOTE',
] as const satisfies readonly PricingType[];

// ---- quote input (public) -----------------------------------------------------------

export const quoteItemInput = z
  .object({
    service_id: z.string().uuid(),
    qty: positiveInt.max(999).default(1),
    /** PER_VARIANT */
    variant: ruleKey.optional(),
    /** PER_ROOM: room key → count */
    rooms: z.record(ruleKey, int.nonnegative().max(99)).optional(),
    /** PER_AREA: exact m² … */
    area_sqm: z.number().positive().max(100_000).optional(),
    /** … or a range key from the rule */
    area_range: ruleKey.optional(),
    addons: z
      .array(z.object({ addon_id: z.string().uuid(), qty: positiveInt.max(999).default(1) }).strict())
      .max(20)
      .default([]),
  })
  .strict();
export type QuoteItemInput = z.infer<typeof quoteItemInput>;

export const quoteAddressInput = z
  .object({
    lat: z.number().min(-90).max(90).optional(),
    lng: z.number().min(-180).max(180).optional(),
    /** Typed or reverse-geocoded area/ward name, e.g. "Mbezi Beach" */
    area: z.string().trim().max(120).optional(),
  })
  .strict()
  .refine((a) => (a.lat == null) === (a.lng == null), { message: 'validation.address.pin_incomplete', path: ['lng'] });
export type QuoteAddressInput = z.infer<typeof quoteAddressInput>;

/** Staff-applied discount (ops create booking). Public callers cannot send one. */
export const discountInput = z
  .object({
    kind: z.enum(['percent', 'fixed']),
    value: z.number().nonnegative().max(1_000_000_000),
    code: z.string().trim().max(40).optional(),
    reason: z.string().trim().max(200).optional(),
  })
  .strict()
  .refine((d) => d.kind !== 'percent' || d.value <= 100, { message: 'validation.discount.percent_range', path: ['value'] });
export type DiscountInput = z.infer<typeof discountInput>;

export const taxSettings = z
  .object({
    mode: z.enum(['none', 'inclusive', 'exclusive']).default('none'),
    rate_pct: z.number().min(0).max(100).default(18),
    label: z.string().trim().min(1).max(20).default('VAT'),
  })
  .strict();
export type TaxSettings = z.infer<typeof taxSettings>;
