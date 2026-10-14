import type { PricingType } from '@shared/enums';
import { PRICING_RULE_SCHEMAS } from '@shared/pricing/rules';
import type { BilingualLabel } from '@shared/pricing/types';

export interface StartingPrice {
  amount_tzs: number;
  /** Unit the amount is per; null for flat prices. */
  per: BilingualLabel | null;
  /** Review types: shown as "from". */
  from: boolean;
}

const SEAT: BilingualLabel = { sw: 'kiti', en: 'seat' };
const SQM: BilingualLabel = { sw: 'm²', en: 'm²' };
const ROOM: BilingualLabel = { sw: 'chumba', en: 'room' };

/** "From TZS 15,000 / seat" for list rows and the booking page. Null when the rule is invalid or has no price. */
export function startingPrice(type: PricingType, rawRule: unknown): StartingPrice | null {
  const parsed = PRICING_RULE_SCHEMAS[type].safeParse(rawRule);
  if (!parsed.success) return null;
  const rule = parsed.data;
  switch (type) {
    case 'FLAT':
      return { amount_tzs: (rule as { price_tzs: number }).price_tzs, per: null, from: false };
    case 'PER_UNIT': {
      const r = rule as { price_tzs: number; unit_sw: string; unit_en: string };
      return { amount_tzs: r.price_tzs, per: { sw: r.unit_sw, en: r.unit_en }, from: false };
    }
    case 'PER_SEAT':
      return { amount_tzs: (rule as { price_tzs: number }).price_tzs, per: SEAT, from: false };
    case 'PER_VARIANT': {
      const r = rule as { variants: { price_tzs: number }[] };
      return { amount_tzs: Math.min(...r.variants.map((v) => v.price_tzs)), per: null, from: true };
    }
    case 'PER_ROOM': {
      const r = rule as { rooms: { price_tzs: number }[] };
      return { amount_tzs: Math.min(...r.rooms.map((v) => v.price_tzs)), per: ROOM, from: true };
    }
    case 'PER_AREA': {
      const r = rule as { tiers: { price_tzs: number }[] };
      return { amount_tzs: Math.min(...r.tiers.map((v) => v.price_tzs)), per: SQM, from: true };
    }
    case 'INSPECTION_REQUIRED':
    case 'CUSTOM_QUOTE': {
      const r = rule as { from_price_tzs?: number };
      return r.from_price_tzs == null ? null : { amount_tzs: r.from_price_tzs, per: null, from: true };
    }
  }
}

export const PRICING_TYPE_TONE = {
  FLAT: 'primary',
  PER_UNIT: 'info',
  PER_SEAT: 'info',
  PER_VARIANT: 'info',
  PER_ROOM: 'info',
  PER_AREA: 'info',
  INSPECTION_REQUIRED: 'warning',
  CUSTOM_QUOTE: 'warning',
} as const satisfies Record<PricingType, string>;
