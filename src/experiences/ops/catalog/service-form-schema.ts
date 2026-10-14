// Form model for the service editor. The form holds a "draft" rule with every possible
// field so the user can switch pricing models without losing typed values; on submit the
// draft is reduced to the exact rule shape for the chosen type and validated by the same
// zod schema the quote engine uses.
import { z, type ZodIssue } from 'zod';
import { PRICING_TYPES, type PricingType } from '@shared/enums';
import {
  PRICING_RULE_SCHEMAS,
  defaultPricingRule,
  parseDurationRule,
  type PriceOption,
} from '@shared/pricing/rules';
import type { AddonRow, ServiceInput, ServiceRow } from './types';

const text = (max: number) => z.string().trim().max(max, { message: 'validation.too_long' });
const requiredText = (max: number) => text(max).min(1, { message: 'validation.required' });
const nullableNumber = z.number().nullable();

export const priceOptionDraft = z.object({
  key: z.string().trim(),
  label_sw: z.string().trim(),
  label_en: z.string().trim(),
  price_tzs: nullableNumber,
});
export type PriceOptionDraft = z.infer<typeof priceOptionDraft>;

export const tierDraft = z.object({ up_to_sqm: nullableNumber, price_tzs: nullableNumber });
export const rangeDraft = z.object({
  key: z.string().trim(),
  label_sw: z.string().trim(),
  label_en: z.string().trim(),
  min_sqm: nullableNumber,
  max_sqm: nullableNumber,
  assumed_sqm: nullableNumber,
});

export const ruleDraft = z.object({
  unit_sw: z.string().trim(),
  unit_en: z.string().trim(),
  price_tzs: nullableNumber,
  min_charge_tzs: nullableNumber,
  min_qty: nullableNumber,
  max_qty: nullableNumber,
  min_seats: nullableNumber,
  variants: z.array(priceOptionDraft),
  rooms: z.array(priceOptionDraft),
  tiers: z.array(tierDraft),
  tier_mode: z.enum(['bracket', 'marginal']),
  ranges: z.array(rangeDraft),
  from_price_tzs: nullableNumber,
});
export type RuleDraft = z.infer<typeof ruleDraft>;

export const addonDraft = z.object({
  id: z.string().optional(),
  name_sw: requiredText(120),
  name_en: requiredText(120),
  // Annotated so TS does not infer a type predicate and strip `null` from the form type.
  price_tzs: nullableNumber.refine((v): boolean => v != null, { message: 'validation.required' }),
  per_unit: z.boolean(),
  active: z.boolean(),
});
export type AddonDraft = z.infer<typeof addonDraft>;

export const serviceFormSchema = z
  .object({
    name_sw: requiredText(120),
    name_en: requiredText(120),
    description_sw: text(600),
    description_en: text(600),
    /** '' = no category */
    category_id: z.string(),
    pricing_type: z.enum(PRICING_TYPES),
    pricing_rule: ruleDraft,
    duration: z.object({
      base_min: z.number().int().min(0).max(1440),
      per_unit_min: z.number().int().min(0).max(1440),
      per_sqm_min: z.number().min(0).max(60),
      per_room_min: z.number().int().min(0).max(1440),
    }),
    crew_size: z.number().int().min(1).max(20),
    recurrence_days: z.number().int().positive().nullable(),
    active: z.boolean(),
    addons: z.array(addonDraft),
  })
  .superRefine((v, ctx) => {
    const result = PRICING_RULE_SCHEMAS[v.pricing_type].safeParse(
      draftToRule(v.pricing_type, v.pricing_rule),
    );
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({ code: 'custom', path: ['pricing_rule', ...issue.path], message: issueMessage(issue) });
      }
    }
  });
export type ServiceFormValues = z.infer<typeof serviceFormSchema>;

/** Built-in zod messages are English; swap them for i18n keys. Custom messages are already keys. */
export function issueMessage(issue: ZodIssue): string {
  switch (issue.code) {
    case 'custom':
      return issue.message.startsWith('validation.') ? issue.message : 'validation.invalid';
    case 'invalid_type':
      return 'validation.required';
    case 'too_small':
      return issue.type === 'array'
        ? 'validation.rule.list_empty'
        : issue.minimum === 1
          ? 'validation.required'
          : 'validation.out_of_range';
    case 'too_big':
      return issue.type === 'string' ? 'validation.too_long' : 'validation.out_of_range';
    default:
      return 'validation.invalid';
  }
}

function omitNull<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v != null && v !== ''));
}

function option(o: PriceOptionDraft) {
  return omitNull({ key: o.key, label_sw: o.label_sw, label_en: o.label_en, price_tzs: o.price_tzs });
}

/** Reduce the draft to the rule shape of `type` (nulls and blanks dropped so zod reports them as missing). */
export function draftToRule(type: PricingType, d: RuleDraft): unknown {
  switch (type) {
    case 'FLAT':
      return omitNull({ price_tzs: d.price_tzs });
    case 'PER_UNIT':
      return omitNull({
        unit_sw: d.unit_sw,
        unit_en: d.unit_en,
        price_tzs: d.price_tzs,
        min_charge_tzs: d.min_charge_tzs,
        min_qty: d.min_qty,
        max_qty: d.max_qty,
      });
    case 'PER_SEAT':
      return omitNull({ price_tzs: d.price_tzs, min_charge_tzs: d.min_charge_tzs, min_seats: d.min_seats });
    case 'PER_VARIANT':
      return omitNull({ variants: d.variants.map(option), min_charge_tzs: d.min_charge_tzs });
    case 'PER_ROOM':
      return omitNull({ rooms: d.rooms.map(option), min_charge_tzs: d.min_charge_tzs });
    case 'PER_AREA':
      return omitNull({
        unit: 'sqm',
        tiers: d.tiers.map((t) => ({ up_to_sqm: t.up_to_sqm, ...omitNull({ price_tzs: t.price_tzs }) })),
        tier_mode: d.tier_mode,
        ranges: d.ranges.length
          ? d.ranges.map((r) => ({
              ...omitNull({
                key: r.key,
                label_sw: r.label_sw,
                label_en: r.label_en,
                min_sqm: r.min_sqm,
                assumed_sqm: r.assumed_sqm,
              }),
              // null is meaningful here ("and above"), so it must survive.
              max_sqm: r.max_sqm,
            }))
          : undefined,
        min_charge_tzs: d.min_charge_tzs,
      });
    case 'INSPECTION_REQUIRED':
    case 'CUSTOM_QUOTE':
      return omitNull({ from_price_tzs: d.from_price_tzs });
  }
}

export function emptyRuleDraft(): RuleDraft {
  return {
    unit_sw: '',
    unit_en: '',
    price_tzs: null,
    min_charge_tzs: null,
    min_qty: null,
    max_qty: null,
    min_seats: null,
    variants: [],
    rooms: [],
    tiers: [],
    tier_mode: 'bracket',
    ranges: [],
    from_price_tzs: null,
  };
}

/** Draft for a stored rule, falling back to the type's default when the stored rule is malformed. */
export function ruleToDraft(type: PricingType, raw: unknown): RuleDraft {
  const parsed = PRICING_RULE_SCHEMAS[type].safeParse(raw);
  const rule = (parsed.success ? parsed.data : defaultPricingRule(type)) as Record<string, unknown>;
  const d = emptyRuleDraft();
  const num = (k: string) => (typeof rule[k] === 'number' ? rule[k] : null);
  const str = (k: string) => (typeof rule[k] === 'string' ? rule[k] : '');
  const options = (k: string): PriceOptionDraft[] =>
    Array.isArray(rule[k]) ? (rule[k] as PriceOption[]).map((o) => ({ ...o })) : [];
  d.unit_sw = str('unit_sw');
  d.unit_en = str('unit_en');
  d.price_tzs = num('price_tzs');
  d.min_charge_tzs = num('min_charge_tzs');
  d.min_qty = num('min_qty');
  d.max_qty = num('max_qty');
  d.min_seats = num('min_seats');
  d.variants = options('variants');
  d.rooms = options('rooms');
  d.from_price_tzs = num('from_price_tzs');
  if (type === 'PER_AREA') {
    const r = rule as {
      tiers?: { up_to_sqm: number | null; price_tzs: number }[];
      tier_mode?: 'bracket' | 'marginal';
      ranges?: z.infer<typeof rangeDraft>[];
    };
    d.tiers = (r.tiers ?? []).map((t) => ({ ...t }));
    d.tier_mode = r.tier_mode ?? 'bracket';
    d.ranges = (r.ranges ?? []).map((x) => ({ ...x }));
  }
  return d;
}

/** Starting draft when the owner picks a pricing model. */
export function draftForType(type: PricingType, previous: RuleDraft): RuleDraft {
  const fresh = ruleToDraft(type, defaultPricingRule(type));
  // Keep money the owner already typed where it still means the same thing.
  return { ...fresh, price_tzs: previous.price_tzs, min_charge_tzs: previous.min_charge_tzs };
}

export function emptyServiceForm(): ServiceFormValues {
  return {
    name_sw: '',
    name_en: '',
    description_sw: '',
    description_en: '',
    category_id: '',
    pricing_type: 'FLAT',
    // Price starts empty so the preview asks for it and validation demands it.
    pricing_rule: { ...ruleToDraft('FLAT', defaultPricingRule('FLAT')), price_tzs: null },
    duration: { base_min: 60, per_unit_min: 0, per_sqm_min: 0, per_room_min: 0 },
    crew_size: 1,
    recurrence_days: null,
    active: true,
    addons: [],
  };
}

export function serviceToForm(row: ServiceRow, addons: AddonRow[]): ServiceFormValues {
  const duration = parseDurationRule(row.duration_rule);
  return {
    name_sw: row.name_sw,
    name_en: row.name_en,
    description_sw: row.description_sw ?? '',
    description_en: row.description_en ?? '',
    category_id: row.category_id ?? '',
    pricing_type: row.pricing_type,
    pricing_rule: ruleToDraft(row.pricing_type, row.pricing_rule),
    duration,
    crew_size: row.crew_size,
    recurrence_days: row.recurrence_days,
    active: row.active,
    addons: addons
      .filter((a) => a.service_id === row.id)
      .map((a) => ({
        id: a.id,
        name_sw: a.name_sw,
        name_en: a.name_en,
        price_tzs: a.price_tzs,
        per_unit: a.per_unit,
        active: a.active,
      })),
  };
}

export function formToService(
  values: ServiceFormValues,
  existing: { id: string; sort: number } | null,
): ServiceInput {
  const base: Omit<ServiceInput, 'id'> = {
    category_id: values.category_id || null,
    name_sw: values.name_sw,
    name_en: values.name_en,
    description_sw: values.description_sw || null,
    description_en: values.description_en || null,
    pricing_type: values.pricing_type,
    pricing_rule: draftToRule(values.pricing_type, values.pricing_rule),
    duration_rule: values.duration,
    crew_size: values.crew_size,
    recurrence_days: values.recurrence_days,
    sort: existing?.sort ?? 0,
    active: values.active,
  };
  return existing ? { ...base, id: existing.id } : base;
}

/** "5×6 ft" → "5x6_ft" for option keys the owner did not type. */
export function keyFromLabel(label: string): string {
  return label
    .toLowerCase()
    .replace(/×/g, 'x')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}
