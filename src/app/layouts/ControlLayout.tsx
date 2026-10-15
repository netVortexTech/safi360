import { LogOut, Menu } from 'lucide-react';
import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { CONTROL_NAV } from '@/app/layouts/nav';
import { RouteLoading } from '@/app/RouteLoading';
import { applyExperienceLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

/**
 * Control center shell (/control). Super-admin only. English by default.
 * Sidebar with grouped navigation, responsive with a mobile menu.
 */
export function ControlLayout() {
  const auth = useAuth();
  const location = useLocation();

  useEffect(() => {
    applyExperienceLocale('en');
  }, []);

  if (auth.status === 'loading') return <RouteLoading />;
  if (auth.status === 'signed_out')
    return <Navigate to="/control/login" replace state={{ from: location.pathname }} />;
  if (!auth.claims.is_super_admin) return <NoAccess />;

  return <Shell />;
}

function NoAccess() {
  const { t } = useTranslation();
  const auth = useAuth();
  return (
    <main className="mx-auto max-w-lg p-4 md:p-8">
      <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-center">
        <p className="text-h2">{t('control.no_access_title')}</p>
        <p className="mt-2 text-body text-text-muted">{t('control.no_access_body')}</p>
        <Button variant="secondary" className="mt-4" onClick={() => void auth.signOut()}>
          <LogOut aria-hidden="true" />
          {t('auth.sign_out')}
        </Button>
      </div>
    </main>
  );
}

function Shell() {
  const { t } = useTranslation();
  const auth = useAuth();

  return (
    <div className="flex min-h-dvh bg-surface-page">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-navy text-navy-foreground lg:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="flex size-9 items-center justify-center rounded bg-primary text-base font-bold">
            S
          </span>
          <div className="min-w-0">
            <div className="text-base font-semibold leading-tight">{t('app.name')}</div>
            <div className="text-xs text-navy-foreground/70">{t('control.title')}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6" aria-label="Main">
          {CONTROL_NAV.map((group) => (
            <div key={group.key} className="mb-4">
              <div className="px-3 pb-1 pt-2 text-xs font-medium text-navy-foreground/60">
                {t(`control.nav.${group.key}`)}
              </div>
              <ul>
                {group.items.map((item) => (
                  <li key={item.key}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/control'}
                      className={({ isActive }) =>
                        cn(
                          'flex h-touch items-center gap-3 rounded px-3 text-sm font-medium text-navy-foreground/90 hover:bg-navy-foreground/10',
                          isActive && 'bg-primary text-primary-foreground hover:bg-primary',
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{t(`control.nav.${item.key}`)}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="border-t border-navy-foreground/10 px-3 py-3">
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="flex h-touch w-full items-center gap-3 rounded px-3 text-sm text-navy-foreground/80 hover:bg-navy-foreground/10"
          >
            <LogOut className="size-4" aria-hidden="true" />
            <span className="truncate">{t('auth.sign_out')}</span>
          </button>
        </div>
      </aside>

      {/* Mobile menu button */}
      <div className="safe-top sticky top-0 z-20 flex h-14 w-full items-center gap-3 border-b border-border bg-surface px-4 lg:hidden">
        <Menu className="size-5" aria-hidden="true" />
        <span className="text-sm font-semibold">{t('control.title')}</span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
          <Outlet />
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="safe-bottom fixed inset-x-0 bottom-0 z-10 grid grid-cols-4 border-t border-border bg-surface lg:hidden"
          aria-label="Main"
        >
          {CONTROL_NAV.flatMap((g) => g.items)
            .slice(0, 4)
            .map((item) => (
              <NavLink
                key={item.key}
                to={item.to}
                end={item.to === '/control'}
                className={({ isActive }) =>
                  cn(
                    'flex h-14 flex-col items-center justify-center gap-0.5 text-xs text-text-subtle',
                    isActive && 'text-primary',
                  )
                }
              >
                <item.icon className="size-5" aria-hidden="true" />
                {t(`control.nav.${item.key}`)}
              </NavLink>
            ))}
        </nav>
      </div>
    </div>
  );
}


