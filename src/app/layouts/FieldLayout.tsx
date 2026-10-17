import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router-dom';
import { applyExperienceLocale } from '@/i18n';
import { brandStyle } from '@/lib/brand';
import { registerFieldServiceWorker } from '@/lib/pwa';
import { NetworkStatus } from '@/experiences/field/components/NetworkStatus';
import { FieldBottomNav } from '@/experiences/field/components/FieldBottomNav';

export function FieldLayout() {
  const { t } = useTranslation();
  const auth = useAuth();

  useEffect(() => {
    applyExperienceLocale('sw');
  }, []);

  useEffect(() => {
    void registerFieldServiceWorker();
  }, []);

  if (auth.status === 'loading') {
    return (
      <div className="min-h-dvh bg-surface-page" role="status" aria-label="loading">
        <div className="h-20 animate-pulse bg-surface-muted" />
      </div>
    );
  }
  if (auth.status !== 'signed_in' || auth.claims.tenant_role !== 'CLEANER') {
    return <Navigate to="/field/login" replace />;
  }

  return (
    <div className="min-h-dvh bg-surface-page" style={brandStyle(undefined)}>
      <header className="safe-top sticky top-0 z-20 bg-brand text-brand-foreground shadow-sm">
        <div className="flex h-16 items-center gap-3 px-4 text-base font-semibold">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-foreground/15 text-sm font-bold">
            S
          </span>
          <span className="truncate">{t('app.name')}</span>
        </div>
      </header>
      <main className="mx-auto w-full max-w-2xl px-4 py-5 pb-28">
        <NetworkStatus />
        <Outlet />
      </main>
      <FieldBottomNav />
    </div>
  );
}
