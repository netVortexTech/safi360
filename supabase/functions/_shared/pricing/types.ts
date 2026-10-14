// Types the quote engine consumes and produces. Catalog rows arrive as plain objects
// (database rows or editor state); rules are parsed inside the engine.
import type { PricingType } from '../enums.ts';
import type { DiscountInput, QuoteAddressInput, QuoteItemInput, TaxSettings } from './rules.ts';

export interface CatalogService {
  id: string;
  name_sw: string;
  name_en: string;
  pricing_type: PricingType;
  pricing_rule: unknown;
  duration_rule: unknown;
  crew_size: number;
  active: boolean;
  deleted_at?: string | null;
}

export interface CatalogAddon {
  id: string;
  /** null = offered with every service */
  service_id: string | null;
  name_sw: string;
  name_en: string;
  price_tzs: number;
  per_unit: boolean;
  active: boolean;
}

/** GeoJSON Polygon: rings of [lng, lat]; first ring is the outer boundary, others are holes. */
export interface GeoJsonPolygon {
  type: 'Polygon';
  coordinates: number[][][];
}

export interface CatalogZone {
  id: string;
  name: string;
  areas: string[];
  polygon: GeoJsonPolygon | null;
  max_km: number | null;
  travel_fee_tzs: number;
  serviceable: boolean;
  active: boolean;
}

export interface LatLng {
  lat: number;
  lng: number;
}

export interface PricingContext {
  deposit_pct: number;
  quote_expiry_hours: number;
  tax: TaxSettings;
  /** Tenant base for distance-band zones; null disables bands. */
  base: LatLng | null;
  now: Date;
  /** Staff-applied discount; never from public input. */
  discount?: DiscountInput | null;
}

export interface QuoteInput {
  items: QuoteItemInput[];
  address?: QuoteAddressInput | null;
}

export type QuoteLineKind = 'service' | 'addon' | 'min_charge' | 'travel' | 'discount' | 'tax';

export interface BilingualLabel {
  sw: string;
  en: string;
}

export interface QuoteLine {
  kind: QuoteLineKind;
  /** service id, addon id or zone id the line belongs to */
  ref_id: string | null;
  /** index into QuoteInput.items for service/addon/min_charge lines */
  item_index: number | null;
  /** Catalog text (service/addon/variant/room names) … */
  label: BilingualLabel | null;
  /** … or an i18n key for system lines (quote.line.min_charge, quote.line.travel, …) */
  label_key: string | null;
  qty: number;
  unit: BilingualLabel | null;
  unit_price_tzs: number | null;
  /** null while the line needs a human price */
  amount_tzs: number | null;
  /** true when the amount comes from an area range rather than exact m² */
  estimate: boolean;
  requires_review: boolean;
}

export interface ZoneResolution {
  zone_id: string;
  name: string;
  travel_fee_tzs: number;
  serviceable: boolean;
  matched_by: 'polygon' | 'area' | 'distance';
  distance_km: number | null;
}

export interface QuoteResult {
  currency: 'TZS';
  lines: QuoteLine[];
  subtotal_tzs: number;
  travel_fee_tzs: number;
  discount_tzs: number;
  /** Exclusive mode: added to the total. Inclusive mode: informational, already inside the total. */
  tax_tzs: number;
  total_tzs: number;
  deposit_tzs: number;
  balance_tzs: number;
  /** At least one line needs a human; the booking routes to AWAITING_REVIEW. */
  requires_review: boolean;
  /** Some amount is an estimate (area range); staff confirm on site. */
  has_estimate: boolean;
  est_duration_min: number;
  crew_size: number;
  zone: ZoneResolution | null;
  /** An address was given but no serviceable zone matched. */
  out_of_area: boolean;
  tax: TaxSettings;
  expires_at: string;
}

export type QuoteErrorCode =
  | 'service_not_found'
  | 'service_inactive'
  | 'addon_not_found'
  | 'addon_not_applicable'
  | 'variant_required'
  | 'variant_unknown'
  | 'rooms_required'
  | 'room_unknown'
  | 'area_required'
  | 'area_range_unknown'
  | 'qty_below_min'
  | 'qty_above_max'
  | 'catalog_invalid';

/** A problem with the request (not the catalog) — maps to 422 with a field path. */
export class QuoteError extends Error {
  constructor(
    readonly code: QuoteErrorCode,
    readonly path: (string | number)[],
  ) {
    super(code);
    this.name = 'QuoteError';
  }
}
