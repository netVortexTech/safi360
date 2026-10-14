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
    return <div className="min-h-dvh bg-surface-page" role="status" aria-label="loading"><div className="h-20 animate-pulse bg-surface-muted" /></div>;
  }
  if (auth.status !== 'signed_in' || auth.claims.tenant_role !== 'CLEANER') {
    return <Navigate to="/field/login" replace />;
  }

  return (
    <div className="min-h-dvh bg-surface-page" style={brandStyle(undefined)}>
      <header className="safe-top bg-brand text-brand-foreground">
        <div className="flex h-14 items-center justify-between px-4 text-base font-semibold">
          <span>{t('app.name')}</span>
        </div>
      </header>
      <main className="p-4 pb-24">
        <NetworkStatus />
        <Outlet />
      </main>
      <FieldBottomNav />
    </div>
  );
}
