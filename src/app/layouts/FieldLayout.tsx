import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { applyExperienceLocale } from '@/i18n';
import { brandStyle } from '@/lib/brand';
import { registerFieldServiceWorker } from '@/lib/pwa';

/**
 * Cleaner PWA shell (/field). Swahili by default, 56px targets, tenant brand in the
 * header only. The service worker is registered here and nowhere else.
 */
export function FieldLayout() {
  const { t } = useTranslation();

  useEffect(() => {
    applyExperienceLocale('sw');
  }, []);

  useEffect(() => {
    void registerFieldServiceWorker();
  }, []);

  return (
    <div className="min-h-dvh bg-surface-page" style={brandStyle(undefined)}>
      <header className="safe-top bg-brand text-brand-foreground">
        <div className="flex h-14 items-center px-4 text-base font-semibold">{t('app.name')}</div>
      </header>
      <main className="p-4 pb-24">
        <Outlet />
      </main>
    </div>
  );
}
