import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { quote, type Catalog } from '@shared/pricing/quote';
import { QuoteError, type QuoteResult } from '@shared/pricing/types';
import type { QuoteItemInput } from '@shared/pricing/rules';
import { fetchPortalCatalog, portalApi, type AvailabilityArgs } from './api';
import type { BookingDraftAddress, BookingDraftItem, PortalCatalog } from './types';

export const portalKeys = {
  catalog: (slug: string) => ['portal', slug, 'catalog'] as const,
  availability: (args: AvailabilityArgs) => ['portal', args.slug, 'availability', args] as const,
  tracking: (slug: string, bookingId: string, token: string) =>
    ['portal', slug, 'tracking', bookingId, token.slice(-12)] as const,
};

export function usePortalCatalog(slug: string | undefined) {
  return useQuery({
    queryKey: portalKeys.catalog(slug ?? ''),
    queryFn: () => fetchPortalCatalog(slug as string),
    enabled: !!slug,
    staleTime: 60_000,
    retry: (count, err) => {
      const status = (err as unknown as { status?: number }).status;
      return !status || status >= 500 ? count < 2 : false;
    },
  });
}

/** Draft items → the engine's input (drops empty optional fields). */
export function toQuoteItems(items: BookingDraftItem[]): QuoteItemInput[] {
  return items.map((i) => ({
    service_id: i.service_id,
    qty: i.qty,
    ...(i.variant ? { variant: i.variant } : {}),
    ...(i.rooms && Object.values(i.rooms).some((n) => n > 0) ? { rooms: i.rooms } : {}),
    ...(i.area_sqm ? { area_sqm: i.area_sqm } : {}),
    ...(i.area_range ? { area_range: i.area_range } : {}),
    addons: i.addons,
  }));
}

export function toQuoteAddress(address: BookingDraftAddress | null) {
  if (!address) return null;
  const a: { area?: string; lat?: number; lng?: number } = {};
  if (address.area.trim()) a.area = address.area.trim();
  if (address.lat != null && address.lng != null) {
    a.lat = address.lat;
    a.lng = address.lng;
  }
  return Object.keys(a).length ? a : null;
}

export interface LocalQuote {
  quote: QuoteResult | null;
  /** i18n key explaining why there is no price yet. */
  reason: string | null;
  /** Path of the offending item (e.g. "items.0.variant") for inline hints. */
  path: string | null;
}

/**
 * The sticky total, priced in the browser with the very same engine the server runs at
 * create time. The server re-prices and refuses a changed total, so this is a preview
 * that can never bill differently.
 */
export function useLocalQuote(
  catalog: PortalCatalog | undefined,
  items: BookingDraftItem[],
  address: BookingDraftAddress | null,
): LocalQuote {
  return useMemo<LocalQuote>(() => {
    if (!catalog) return { quote: null, reason: 'common.loading', path: null };
    if (items.length === 0) return { quote: null, reason: 'quote.summary.empty', path: null };
    const engineCatalog: Catalog = {
      services: catalog.services.map((s) => ({
        id: s.id,
        name_sw: s.name_sw,
        name_en: s.name_en,
        pricing_type: s.pricing_type,
        pricing_rule: s.pricing_rule,
        duration_rule: s.duration_rule,
        crew_size: s.crew_size,
        active: s.active,
      })),
      addons: catalog.addons,
      zones: catalog.zones,
    };
    try {
      const q = quote({ items: toQuoteItems(items), address: toQuoteAddress(address) }, engineCatalog, {
        deposit_pct: catalog.tenant.settings.deposit_pct,
        quote_expiry_hours: catalog.tenant.settings.quote_expiry_hours,
        tax: catalog.tenant.settings.tax,
        base: catalog.tenant.base,
        now: new Date(),
      });
      return { quote: q, reason: null, path: null };
    } catch (err) {
      if (err instanceof QuoteError)
        return { quote: null, reason: `quote.error.${err.code}`, path: err.path.join('.') };
      return { quote: null, reason: 'quote.error.catalog_invalid', path: null };
    }
  }, [catalog, items, address]);
}

export function useAvailability(args: AvailabilityArgs | null) {
  return useQuery({
    queryKey: portalKeys.availability(args ?? { slug: '', items: [], from: '', to: '' }),
    queryFn: () => portalApi.availability(args as AvailabilityArgs),
    enabled: !!args && args.items.length > 0,
    staleTime: 20_000,
  });
}

export function useTrackingView(slug: string, bookingId: string | null, token: string | null) {
  return useQuery({
    queryKey: portalKeys.tracking(slug, bookingId ?? '', token ?? ''),
    queryFn: () => portalApi.trackingView({ slug, token: token as string, booking_id: bookingId as string }),
    enabled: !!bookingId && !!token,
    staleTime: 10_000,
    refetchInterval: 30_000,
  });
}

export function useOtpSend() {
  return useMutation({ mutationFn: portalApi.otpSend, meta: { errorHandled: true } });
}
export function useOtpVerify() {
  return useMutation({ mutationFn: portalApi.otpVerify, meta: { errorHandled: true } });
}
export function useCreateBooking() {
  return useMutation({ mutationFn: portalApi.createBooking, meta: { errorHandled: true } });
}
export function useTrackingStart() {
  return useMutation({ mutationFn: portalApi.trackingStart, meta: { errorHandled: true } });
}
export function useTrackingVerify() {
  return useMutation({ mutationFn: portalApi.trackingVerify, meta: { errorHandled: true } });
}
export function useCustomerAction() {
  return useMutation({ mutationFn: portalApi.customerAction, meta: { errorHandled: true } });
}
export function usePaymentStart() {
  return useMutation({ mutationFn: portalApi.paymentStart, meta: { errorHandled: true } });
}
export function usePaymentCallback() {
  return useMutation({ mutationFn: portalApi.paymentCallback, meta: { errorHandled: true } });
}
