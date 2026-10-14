import type { PricingType } from '@shared/enums';
import type { GeoJsonPolygon } from '@shared/pricing/types';

export interface CategoryRow {
  id: string;
  name_sw: string;
  name_en: string;
  sort: number;
}

export interface ServiceRow {
  id: string;
  category_id: string | null;
  name_sw: string;
  name_en: string;
  description_sw: string | null;
  description_en: string | null;
  pricing_type: PricingType;
  pricing_rule: unknown;
  duration_rule: unknown;
  crew_size: number;
  recurrence_days: number | null;
  sort: number;
  active: boolean;
  deleted_at: string | null;
  updated_at: string;
}

export interface AddonRow {
  id: string;
  service_id: string | null;
  name_sw: string;
  name_en: string;
  price_tzs: number;
  per_unit: boolean;
  sort: number;
  active: boolean;
}

export interface ZoneRow {
  id: string;
  name: string;
  areas: string[];
  polygon: GeoJsonPolygon | null;
  max_km: number | null;
  travel_fee_tzs: number;
  serviceable: boolean;
  sort: number;
  active: boolean;
}

export type ServiceInput = Omit<ServiceRow, 'id' | 'deleted_at' | 'updated_at'> & { id?: string | undefined };
export type AddonInput = Omit<AddonRow, 'id' | 'service_id'> & { id?: string | undefined };
export type ZoneInput = Omit<ZoneRow, 'id'> & { id?: string | undefined };
export type CategoryInput = Omit<CategoryRow, 'id'> & { id?: string | undefined };
