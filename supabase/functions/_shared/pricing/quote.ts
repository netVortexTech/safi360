// The quote engine: one pure function from (input, catalog, context) to an itemised quote.
// Shared by the service editor preview, the ops booking form and the public Edge Function,
// so every channel prices a job exactly the same way. Integer TZS throughout.
import { parseDurationRule, parsePricingRule, type DurationRule, type PerAreaRule } from './rules.ts';
import {
  QuoteError,
  type BilingualLabel,
  type CatalogAddon,
  type CatalogService,
  type CatalogZone,
  type PricingContext,
  type QuoteInput,
  type QuoteLine,
  type QuoteResult,
} from './types.ts';
import { resolveZone } from './zones.ts';

export interface Catalog {
  services: CatalogService[];
  addons: CatalogAddon[];
  zones: CatalogZone[];
}

const SEAT_UNIT: BilingualLabel = { sw: 'kiti', en: 'seat' };
const SQM_UNIT: BilingualLabel = { sw: 'm²', en: 'm²' };
const ROOM_UNIT: BilingualLabel = { sw: 'chumba', en: 'room' };

function line(partial: Partial<QuoteLine> & Pick<QuoteLine, 'kind'>): QuoteLine {
  return {
    ref_id: null,
    item_index: null,
    label: null,
    label_key: null,
    qty: 1,
    unit: null,
    unit_price_tzs: null,
    amount_tzs: null,
    estimate: false,
    requires_review: false,
    ...partial,
  };
}

function roundTzs(value: number): number {
  return Math.round(value);
}

/** Bracket: the tier the total falls into prices everything. Marginal: each tier prices its slice. */
export function priceArea(rule: PerAreaRule, sqm: number): number {
  if (rule.tier_mode === 'marginal') {
    let remaining = sqm;
    let floor = 0;
    let amount = 0;
    for (const tier of rule.tiers) {
      if (remaining <= 0) break;
      const cap = tier.up_to_sqm == null ? Infinity : tier.up_to_sqm;
      const slice = Math.min(remaining, cap - floor);
      amount += slice * tier.price_tzs;
      remaining -= slice;
      floor = cap;
    }
    return roundTzs(amount);
  }
  // Bracket: walk the tiers; the first one that fits (or the last) prices the whole area.
  let price = 0;
  for (const tier of rule.tiers) {
    price = tier.price_tzs;
    if (tier.up_to_sqm == null || sqm <= tier.up_to_sqm) break;
  }
  return roundTzs(sqm * price);
}

interface ItemOutcome {
  lines: QuoteLine[];
  /** quantity add-ons multiply by when per_unit */
  unitQty: number;
  durationMin: number;
  requiresReview: boolean;
}

function priceItem(index: number, item: QuoteInput['items'][number], service: CatalogService): ItemOutcome {
  const path = ['items', index];
  let duration: DurationRule;
  try {
    duration = parseDurationRule(service.duration_rule);
  } catch {
    throw new QuoteError('catalog_invalid', [...path, 'service_id']);
  }
  const name: BilingualLabel = { sw: service.name_sw, en: service.name_en };
  const lines: QuoteLine[] = [];
  let unitQty = item.qty;
  let base = 0;
  let minCharge: number | undefined;
  let durationMin = duration.base_min;
  let requiresReview = false;

  const parseRule = <T extends CatalogService['pricing_type']>(type: T) => {
    try {
      return parsePricingRule(type, service.pricing_rule);
    } catch {
      throw new QuoteError('catalog_invalid', [...path, 'service_id']);
    }
  };

  switch (service.pricing_type) {
    case 'PER_UNIT': {
      const rule = parseRule('PER_UNIT');
      if (rule.min_qty != null && item.qty < rule.min_qty)
        throw new QuoteError('qty_below_min', [...path, 'qty']);
      if (rule.max_qty != null && item.qty > rule.max_qty)
        throw new QuoteError('qty_above_max', [...path, 'qty']);
      base = item.qty * rule.price_tzs;
      minCharge = rule.min_charge_tzs;
      durationMin += duration.per_unit_min * item.qty;
      lines.push(
        line({
          kind: 'service',
          ref_id: service.id,
          item_index: index,
          label: name,
          qty: item.qty,
          unit: { sw: rule.unit_sw, en: rule.unit_en },
          unit_price_tzs: rule.price_tzs,
          amount_tzs: base,
        }),
      );
      break;
    }
    case 'PER_SEAT': {
      const rule = parseRule('PER_SEAT');
      if (rule.min_seats != null && item.qty < rule.min_seats)
        throw new QuoteError('qty_below_min', [...path, 'qty']);
      base = item.qty * rule.price_tzs;
      minCharge = rule.min_charge_tzs;
      durationMin += duration.per_unit_min * item.qty;
      lines.push(
        line({
          kind: 'service',
          ref_id: service.id,
          item_index: index,
          label: name,
          qty: item.qty,
          unit: SEAT_UNIT,
          unit_price_tzs: rule.price_tzs,
          amount_tzs: base,
        }),
      );
      break;
    }
    case 'PER_VARIANT': {
      const rule = parseRule('PER_VARIANT');
      if (!item.variant) throw new QuoteError('variant_required', [...path, 'variant']);
      const variant = rule.variants.find((v) => v.key === item.variant);
      if (!variant) throw new QuoteError('variant_unknown', [...path, 'variant']);
      base = item.qty * variant.price_tzs;
      minCharge = rule.min_charge_tzs;
      durationMin += duration.per_unit_min * item.qty;
      lines.push(
        line({
          kind: 'service',
          ref_id: service.id,
          item_index: index,
          label: name,
          qty: item.qty,
          unit: { sw: variant.label_sw, en: variant.label_en },
          unit_price_tzs: variant.price_tzs,
          amount_tzs: base,
        }),
      );
      break;
    }
    case 'PER_ROOM': {
      const rule = parseRule('PER_ROOM');
      const counts = Object.entries(item.rooms ?? {}).filter(([, n]) => n > 0);
      if (counts.length === 0) throw new QuoteError('rooms_required', [...path, 'rooms']);
      let roomsTotal = 0;
      for (const [key, count] of counts) {
        const room = rule.rooms.find((r) => r.key === key);
        if (!room) throw new QuoteError('room_unknown', [...path, 'rooms', key]);
        const amount = count * room.price_tzs;
        base += amount;
        roomsTotal += count;
        lines.push(
          line({
            kind: 'service',
            ref_id: service.id,
            item_index: index,
            label: { sw: `${name.sw} · ${room.label_sw}`, en: `${name.en} · ${room.label_en}` },
            qty: count,
            unit: ROOM_UNIT,
            unit_price_tzs: room.price_tzs,
            amount_tzs: amount,
          }),
        );
      }
      unitQty = roomsTotal;
      minCharge = rule.min_charge_tzs;
      durationMin += duration.per_room_min * roomsTotal;
      break;
    }
    case 'PER_AREA': {
      const rule = parseRule('PER_AREA');
      let sqm: number;
      let estimate = false;
      if (item.area_sqm != null) {
        sqm = item.area_sqm;
      } else if (item.area_range != null) {
        const range = rule.ranges?.find((r) => r.key === item.area_range);
        if (!range) throw new QuoteError('area_range_unknown', [...path, 'area_range']);
        sqm = range.assumed_sqm;
        estimate = true;
      } else {
        throw new QuoteError('area_required', [...path, 'area_sqm']);
      }
      base = priceArea(rule, sqm);
      minCharge = rule.min_charge_tzs;
      unitQty = Math.max(1, Math.round(sqm));
      durationMin += Math.round(duration.per_sqm_min * sqm);
      lines.push(
        line({
          kind: 'service',
          ref_id: service.id,
          item_index: index,
          label: name,
          qty: sqm,
          unit: SQM_UNIT,
          unit_price_tzs: sqm > 0 ? roundTzs(base / sqm) : null,
          amount_tzs: base,
          estimate,
        }),
      );
      break;
    }
    case 'FLAT': {
      const rule = parseRule('FLAT');
      base = item.qty * rule.price_tzs;
      durationMin += duration.per_unit_min * item.qty;
      lines.push(
        line({
          kind: 'service',
          ref_id: service.id,
          item_index: index,
          label: name,
          qty: item.qty,
          unit_price_tzs: rule.price_tzs,
          amount_tzs: base,
        }),
      );
      break;
    }
    case 'INSPECTION_REQUIRED':
    case 'CUSTOM_QUOTE': {
      const rule = parseRule(service.pricing_type);
      requiresReview = true;
      durationMin += duration.per_unit_min * item.qty;
      lines.push(
        line({
          kind: 'service',
          ref_id: service.id,
          item_index: index,
          label: name,
          qty: item.qty,
          unit_price_tzs: rule.from_price_tzs ?? null,
          amount_tzs: null,
          requires_review: true,
        }),
      );
      break;
    }
  }

  // Review-priced types never carry a minimum charge, so this only fires on priced lines.
  if (minCharge != null && base < minCharge) {
    lines.push(
      line({
        kind: 'min_charge',
        ref_id: service.id,
        item_index: index,
        label_key: 'quote.line.min_charge',
        unit_price_tzs: minCharge,
        amount_tzs: minCharge - base,
      }),
    );
  }

  return { lines, unitQty, durationMin, requiresReview };
}

function priceAddons(
  index: number,
  item: QuoteInput['items'][number],
  service: CatalogService,
  unitQty: number,
  addons: CatalogAddon[],
): QuoteLine[] {
  return item.addons.map((chosen, addonIndex) => {
    const path = ['items', index, 'addons', addonIndex, 'addon_id'];
    const addon = addons.find((a) => a.id === chosen.addon_id);
    if (!addon || !addon.active) throw new QuoteError('addon_not_found', path);
    if (addon.service_id != null && addon.service_id !== service.id)
      throw new QuoteError('addon_not_applicable', path);
    const qty = addon.per_unit ? unitQty : chosen.qty;
    return line({
      kind: 'addon',
      ref_id: addon.id,
      item_index: index,
      label: { sw: addon.name_sw, en: addon.name_en },
      qty,
      unit: addon.per_unit ? unitFor(service) : null,
      unit_price_tzs: addon.price_tzs,
      amount_tzs: qty * addon.price_tzs,
    });
  });
}

/** Unit label a per-unit add-on multiplies by. */
function unitFor(service: CatalogService): BilingualLabel | null {
  switch (service.pricing_type) {
    case 'PER_SEAT':
      return SEAT_UNIT;
    case 'PER_ROOM':
      return ROOM_UNIT;
    case 'PER_AREA':
      return SQM_UNIT;
    default:
      return null;
  }
}

function sum(lines: QuoteLine[], kinds: QuoteLine['kind'][]): number {
  return lines.filter((l) => kinds.includes(l.kind)).reduce((acc, l) => acc + (l.amount_tzs ?? 0), 0);
}

/** Round up to the next quarter hour, never below 30 minutes. */
export function roundDuration(minutes: number): number {
  return Math.max(30, Math.ceil(minutes / 15) * 15);
}

export function quote(input: QuoteInput, catalog: Catalog, ctx: PricingContext): QuoteResult {
  const lines: QuoteLine[] = [];
  let durationMin = 0;
  let crewSize = 1;
  let requiresReview = false;

  input.items.forEach((item, index) => {
    const service = catalog.services.find((s) => s.id === item.service_id);
    if (!service) throw new QuoteError('service_not_found', ['items', index, 'service_id']);
    if (!service.active || service.deleted_at)
      throw new QuoteError('service_inactive', ['items', index, 'service_id']);
    const outcome = priceItem(index, item, service);
    lines.push(...outcome.lines, ...priceAddons(index, item, service, outcome.unitQty, catalog.addons));
    durationMin += outcome.durationMin;
    crewSize = Math.max(crewSize, service.crew_size);
    requiresReview = requiresReview || outcome.requiresReview;
  });

  const subtotal = sum(lines, ['service', 'addon', 'min_charge']);

  const zone = resolveZone(input.address, catalog.zones, ctx.base);
  const outOfArea = input.address != null && (zone == null || !zone.serviceable);
  const travelFee = zone && zone.serviceable ? zone.travel_fee_tzs : 0;
  if (travelFee > 0 && zone) {
    lines.push(
      line({
        kind: 'travel',
        ref_id: zone.zone_id,
        label_key: 'quote.line.travel',
        label: { sw: zone.name, en: zone.name },
        unit_price_tzs: travelFee,
        amount_tzs: travelFee,
      }),
    );
  }

  let discount = 0;
  if (ctx.discount && subtotal > 0) {
    discount =
      ctx.discount.kind === 'percent'
        ? roundTzs((subtotal * ctx.discount.value) / 100)
        : Math.min(roundTzs(ctx.discount.value), subtotal);
    if (discount > 0) {
      lines.push(
        line({
          kind: 'discount',
          label_key: 'quote.line.discount',
          label: ctx.discount.code ? { sw: ctx.discount.code, en: ctx.discount.code } : null,
          amount_tzs: -discount,
        }),
      );
    }
  }

  const taxable = subtotal + travelFee - discount;
  let tax = 0;
  if (ctx.tax.mode === 'exclusive') {
    tax = roundTzs((taxable * ctx.tax.rate_pct) / 100);
    if (tax > 0) {
      lines.push(
        line({
          kind: 'tax',
          label_key: 'quote.line.tax',
          label: { sw: ctx.tax.label, en: ctx.tax.label },
          qty: ctx.tax.rate_pct,
          amount_tzs: tax,
        }),
      );
    }
  } else if (ctx.tax.mode === 'inclusive') {
    tax = roundTzs((taxable * ctx.tax.rate_pct) / (100 + ctx.tax.rate_pct));
  }

  const total = taxable + (ctx.tax.mode === 'exclusive' ? tax : 0);
  const deposit = requiresReview ? 0 : roundTzs((total * ctx.deposit_pct) / 100);

  return {
    currency: 'TZS',
    lines,
    subtotal_tzs: subtotal,
    travel_fee_tzs: travelFee,
    discount_tzs: discount,
    tax_tzs: tax,
    total_tzs: total,
    deposit_tzs: deposit,
    balance_tzs: total - deposit,
    requires_review: requiresReview,
    has_estimate: lines.some((l) => l.estimate),
    est_duration_min: roundDuration(durationMin),
    crew_size: crewSize,
    zone,
    out_of_area: outOfArea,
    tax: ctx.tax,
    expires_at: new Date(ctx.now.getTime() + ctx.quote_expiry_hours * 3_600_000).toISOString(),
  };
}
