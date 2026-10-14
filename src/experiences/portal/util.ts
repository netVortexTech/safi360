// Small pure helpers shared by portal components (kept out of component files so
// React Fast Refresh keeps working).
import type { TFunction } from 'i18next';
import type { BookingStatus } from '@shared/enums';
import { startingPrice } from '@/experiences/ops/catalog/pricing-labels';
import { formatTzs } from '@/lib/money';
import type { Locale, PortalService } from './types';

/** "YYYY-MM-DD" + n days, calendar arithmetic only. */
export function addDaysKey(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** 754321 ms → "12:34"; never negative. */
export function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

/** "from TZS 35,000", "TZS 15,000 / seat" or "Price after inspection". */
export function priceLabel(service: PortalService, locale: Locale, t: TFunction): string {
  const sp = startingPrice(service.pricing_type, service.pricing_rule);
  if (!sp) return t('portal.services.on_inspection');
  const price = formatTzs(sp.amount_tzs);
  if (sp.from) {
    return t('portal.services.from', { price: sp.per ? `${price} / ${sp.per[locale]}` : price });
  }
  return sp.per ? t('portal.services.per', { price, unit: sp.per[locale] }) : price;
}

export type DoneVariant = 'confirmed' | 'request' | 'payment';

/** Which of the three confirmation headlines a status gets. */
export function variantFor(status: BookingStatus): DoneVariant {
  if (status === 'AWAITING_PAYMENT') return 'payment';
  if (
    status === 'AWAITING_REVIEW' ||
    status === 'AWAITING_CUSTOMER_APPROVAL' ||
    status === 'REQUEST_RECEIVED'
  ) {
    return 'request';
  }
  return 'confirmed';
}
