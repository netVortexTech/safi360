import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { applyExperienceLocale } from '@/i18n';

/** Safi360 team control center shell (/control). English by default. */
export function ControlLayout() {
  const { t } = useTranslation();

  useEffect(() => {
    applyExperienceLocale('en');
  }, []);

  return (
    <div className="flex min-h-dvh bg-surface-page">
      <aside className="hidden w-60 shrink-0 bg-navy p-5 text-navy-foreground md:block" aria-label="Main">
        <div className="text-base font-semibold">{t('app.name')}</div>
        <div className="text-xs text-navy-foreground/70">{t('control.title')}</div>
      </aside>
      <main className="flex-1 p-4 md:p-8">
        <Outlet />
      </main>
    </div>
  );
}
