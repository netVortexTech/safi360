// Shapes the customer portal works with. Server responses are typed from the handler
// modules (type-only imports: no server code reaches the bundle).
import type { BookingSource, BookingStatus, PricingType } from '@shared/enums';
import type { CatalogAddon, CatalogZone, QuoteResult } from '@shared/pricing/types';
import type { TenantSettings } from '@shared/schemas';
import type { AvailabilityResponse } from '@shared/handlers/availability';
import type { CreateBookingResponse } from '@shared/handlers/create-booking';
import type { OtpSendResponse, OtpVerifyResponse } from '@shared/handlers/otp';
import type { PaymentCallbackResponse, PaymentStartResponse } from '@shared/handlers/payment';
import type { CustomerActionResponse } from '@shared/handlers/customer-action';
import type {
  BookingSummary,
  TrackingStartResponse,
  TrackingVerifyResponse,
  TrackingViewResponse,
} from '@shared/handlers/tracking';

export type {
  AvailabilityResponse,
  BookingSummary,
  CreateBookingResponse,
  CustomerActionResponse,
  OtpSendResponse,
  OtpVerifyResponse,
  PaymentCallbackResponse,
  PaymentStartResponse,
  TrackingStartResponse,
  TrackingVerifyResponse,
  TrackingViewResponse,
  QuoteResult,
};

export interface PortalService {
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
}

export interface PortalCategory {
  id: string;
  name_sw: string;
  name_en: string;
  sort: number;
}

export interface PortalTenant {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  phone_e164: string;
  ticket_prefix: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';
  branding: {
    display_name?: string;
    color?: string;
    greeting_sw?: string;
    greeting_en?: string;
    terms_sw?: string;
    terms_en?: string;
  };
  base: { lat: number; lng: number } | null;
  settings: Pick<
    TenantSettings,
    | 'deposit_pct'
    | 'cancel_hours'
    | 'slot_hold_minutes'
    | 'quote_expiry_hours'
    | 'min_lead_minutes'
    | 'slot_step_min'
    | 'languages'
    | 'default_locale'
    | 'working_hours'
    | 'tax'
  >;
}

/** public.portal_catalog(slug) */
export interface PortalCatalog {
  tenant: PortalTenant;
  categories: PortalCategory[];
  services: PortalService[];
  addons: CatalogAddon[];
  zones: CatalogZone[];
}

export type Locale = 'sw' | 'en';

export interface BookingDraftItem {
  /** Stable key for React lists and removal. */
  key: string;
  service_id: string;
  qty: number;
  variant?: string | undefined;
  rooms?: Record<string, number> | undefined;
  area_sqm?: number | undefined;
  area_range?: string | undefined;
  addons: { addon_id: string; qty: number }[];
}

export interface BookingDraftAddress {
  area: string;
  street: string;
  landmark: string;
  ward: string;
  lat?: number;
  lng?: number;
}

export type PaymentMode = 'DEPOSIT' | 'ON_COMPLETION';

export interface LastBooking {
  slug: string;
  ticket_ref: string;
  booking_id: string;
  status: BookingStatus;
  hold_expires_at: string | null;
  /** The booking verify token also opens tracking_view for 15 minutes. */
  token: string;
  token_expires_at: string;
  total_tzs: number;
  deposit_tzs: number;
  payment_mode: PaymentMode;
  scheduled_start: string | null;
  scheduled_end: string | null;
  requires_review: boolean;
  address: BookingDraftAddress | null;
  source: BookingSource;
  created_at: string;
}

export interface TrackingSession {
  slug: string;
  token: string;
  expires_at: string;
  phone: string;
  booking_id: string | null;
  bookings: BookingSummary[];
}
