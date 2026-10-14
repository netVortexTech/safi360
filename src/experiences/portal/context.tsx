import { createContext, useContext } from 'react';
import type { BookingSource } from '@shared/enums';
import type { Locale, PortalCatalog } from './types';

export interface PortalContextValue {
  slug: string;
  catalog: PortalCatalog;
  locale: Locale;
  source: BookingSource;
  /** The stepper without portal chrome (iframe embed). */
  widget: boolean;
}

export const PortalContext = createContext<PortalContextValue | null>(null);

export function usePortal(): PortalContextValue {
  const ctx = useContext(PortalContext);
  if (!ctx) throw new Error('usePortal must be used inside the portal layout');
  return ctx;
}

/** Bilingual catalog text in the active language. */
export function pick<T extends { name_sw: string; name_en: string }>(row: T, locale: Locale): string {
  return locale === 'en' ? row.name_en : row.name_sw;
}
