import { Phone } from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet, useLocation, useMatch, useParams } from 'react-router-dom';
import { ErrorState } from '@/components/shared/ErrorState';
import { Skeleton } from '@/components/ui/skeleton';
import { isPortalApiError, portalErrorKey } from '@/experiences/portal/api';
import { LanguageSwitch } from '@/experiences/portal/components/LanguageSwitch';
import { PortalContext, type PortalContextValue } from '@/experiences/portal/context';
import { usePortalCatalog } from '@/experiences/portal/hooks';
import { captureSource } from '@/experiences/portal/source';
import { applyExperienceLocale, type Locale } from '@/i18n';
import { brandStyle } from '@/lib/brand';
import { formatPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';

/**
 * Customer portal shell (/:slug). Swahili by default; the tenant brand colour is applied
 * through the --brand CSS variable on this root only, never deeper. The catalog is loaded
 * once here and shared with every page through PortalContext.
 */
export function PortalLayout() {
  const { t, i18n } = useTranslation();
  const { slug = '' } = useParams<{ slug: string }>();
  const location = useLocation();
  const widget = useMatch('/:slug/widget') != null;
  const catalog = usePortalCatalog(slug);
  const locale: Locale = i18n.resolvedLanguage === 'en' ? 'en' : 'sw';

  useEffect(() => {
    applyExperienceLocale('sw');
  }, []);

  const source = useMemo(
    () => captureSource(location.search, widget ? 'booking_widget' : undefined),
    [location.search, widget],
  );

  useEffect(() => {
    if (catalog.data) document.title = `${catalog.data.tenant.name} · Safi360`;
  }, [catalog.data]);

  const brand = brandStyle(catalog.data?.tenant.branding.color);

  if (catalog.isPending) {
    return (
      <div className="min-h-dvh bg-surface-page" style={brand} data-tenant={slug} aria-busy="true">
        <header className="safe-top h-16 bg-brand" />
        <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:px-6">
          <span className="sr-only">{t('common.loading')}</span>
          <Skeleton className="h-48 w-full rounded-2xl" />
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-32 w-full rounded-2xl" />
        </main>
      </div>
    );
  }

  if (catalog.isError || !catalog.data) {
    const err = catalog.error;
    const known =
      isPortalApiError(err) && (err.code === 'tenant_not_found' || err.code === 'tenant_suspended');
    return (
      <div className="min-h-dvh bg-surface-page" data-tenant={slug}>
        <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
          <h1 className="mb-5 text-h1">{slug}</h1>
          <ErrorState
            title={
              known
                ? t(err.code === 'tenant_not_found' ? 'errors.not_found_title' : 'errors.generic_title')
                : undefined
            }
            description={t(portalErrorKey(err))}
            onRetry={known ? undefined : () => void catalog.refetch()}
            retrying={catalog.isFetching}
          />
        </main>
      </div>
    );
  }

  const value: PortalContextValue = { slug, catalog: catalog.data, locale, source, widget };
  const tenant = catalog.data.tenant;
  const navItem = (to: string, label: string, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'whitespace-nowrap rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ease-premium',
          isActive
            ? 'bg-brand-foreground/15 text-brand-foreground'
            : 'text-brand-foreground/85 hover:bg-brand-foreground/10 hover:text-brand-foreground',
        )
      }
    >
      {label}
    </NavLink>
  );

  return (
    <PortalContext.Provider value={value}>
      <div
        className={cn('flex min-h-dvh flex-col bg-surface-page', widget && 'min-h-0')}
        style={brand}
        data-tenant={slug}
      >
        {!widget && (
          <header className="safe-top sticky top-0 z-30 border-b border-brand-foreground/10 bg-brand text-brand-foreground shadow-sm">
            <div className="mx-auto w-full max-w-3xl px-4 sm:px-6">
              <div className="flex h-16 items-center justify-between gap-3">
                <NavLink
                  to={`/${slug}`}
                  className="flex min-w-0 items-center gap-2.5 text-base font-semibold"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-foreground/15 text-sm font-bold">
                    {(tenant.branding.display_name || tenant.name).charAt(0)}
                  </span>
                  <span className="truncate">{tenant.branding.display_name || tenant.name}</span>
                </NavLink>
                <nav aria-label="Main" className="hidden items-center gap-1 sm:flex">
                  {navItem(`/${slug}`, t('portal.nav.home'), true)}
                  {navItem(`/${slug}/services`, t('portal.nav.services'))}
                  {navItem(`/${slug}/book`, t('portal.nav.book'))}
                  {navItem(`/${slug}/track`, t('portal.nav.track'))}
                  <LanguageSwitch locale={locale} languages={tenant.settings.languages} className="ml-2" />
                </nav>
                <div className="sm:hidden">
                  <LanguageSwitch locale={locale} languages={tenant.settings.languages} />
                </div>
              </div>
              <nav
                aria-label="Main"
                className="-mx-1 flex items-center gap-1 overflow-x-auto pb-2.5 [scrollbar-width:none] sm:hidden [&::-webkit-scrollbar]:hidden"
              >
                {navItem(`/${slug}`, t('portal.nav.home'), true)}
                {navItem(`/${slug}/services`, t('portal.nav.services'))}
                {navItem(`/${slug}/book`, t('portal.nav.book'))}
                {navItem(`/${slug}/track`, t('portal.nav.track'))}
              </nav>
            </div>
          </header>
        )}
        <main className={cn('mx-auto w-full max-w-3xl flex-1 px-4 py-6 sm:px-6 sm:py-8', widget && 'pb-8')}>
          <Outlet />
        </main>
        {!widget && (
          <footer className="mt-6 border-t border-border bg-surface">
            <div className="mx-auto flex w-full max-w-3xl flex-col items-start gap-3 px-4 py-6 text-sm text-text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
              <a
                href={`tel:${tenant.phone_e164}`}
                className="inline-flex items-center gap-2 font-medium text-primary hover:underline"
              >
                <Phone className="size-4" aria-hidden="true" />
                {t('portal.footer.call', { phone: formatPhone(tenant.phone_e164) })}
              </a>
              <span className="text-caption text-text-subtle">{t('portal.footer.powered_by')}</span>
            </div>
          </footer>
        )}
      </div>
    </PortalContext.Provider>
  );
}
