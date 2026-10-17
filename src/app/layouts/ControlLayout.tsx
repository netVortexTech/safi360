import { LogOut, Menu, ShieldCheck } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, NavLink, Outlet, useLocation } from 'react-router-dom';
import { CONTROL_NAV, type NavGroup } from '@/app/layouts/nav';
import { RouteLoading } from '@/app/RouteLoading';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { applyExperienceLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

/**
 * Control center shell (/control). Super-admin only. English by default.
 * Ink sidebar with grouped navigation; a real menu sheet on mobile.
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
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center p-6 text-center">
      <div className="flex size-14 items-center justify-center rounded-2xl bg-error-tint text-error">
        <ShieldCheck className="size-6" aria-hidden="true" />
      </div>
      <p className="mt-4 text-h2">{t('control.no_access_title')}</p>
      <p className="mt-2 text-body text-text-muted">{t('control.no_access_body')}</p>
      <Button variant="secondary" className="mt-5" onClick={() => void auth.signOut()}>
        <LogOut aria-hidden="true" />
        {t('auth.sign_out')}
      </Button>
    </main>
  );
}

function NavGroups({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <nav className="space-y-5" aria-label="Main">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="px-3 pb-1.5 text-caption uppercase tracking-eyebrow text-navy-foreground/45">
            {t(`control.nav.${group.key}`)}
          </div>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.key}>
                <NavLink
                  to={item.to}
                  end={item.to === '/control'}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cn(
                      'flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-200 ease-premium',
                      isActive
                        ? 'bg-primary text-primary-foreground shadow-xs'
                        : 'text-navy-foreground/70 hover:bg-navy-foreground/10 hover:text-navy-foreground',
                    )
                  }
                >
                  <item.icon className="size-[18px] shrink-0" aria-hidden="true" />
                  <span className="truncate">{t(`control.nav.${item.key}`)}</span>
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Shell() {
  const { t } = useTranslation();
  const auth = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="flex min-h-dvh bg-surface-page">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col bg-navy text-navy-foreground lg:flex print:hidden">
        <div className="flex items-center gap-3 px-4 py-5">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-xs">
            S
          </span>
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold leading-tight">{t('app.name')}</div>
            <div className="truncate text-caption text-navy-foreground/60">{t('control.title')}</div>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <NavGroups groups={CONTROL_NAV} />
        </div>
        <div className="border-t border-navy-foreground/10 p-3">
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-navy-foreground/70 transition-colors hover:bg-navy-foreground/10 hover:text-navy-foreground"
          >
            <LogOut className="size-[18px]" aria-hidden="true" />
            <span className="truncate">{t('auth.sign_out')}</span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar with a real menu */}
        <header className="safe-top bar-blur sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border px-4 lg:hidden print:hidden">
          <Button
            variant="secondary"
            size="icon"
            aria-label={t('common.menu')}
            onClick={() => setMenuOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            S
          </span>
          <span className="text-sm font-semibold">{t('control.title')}</span>
        </header>

        <main className="flex-1 px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-10">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>

        {/* Mobile bottom nav */}
        <nav
          className="safe-bottom bar-blur fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t border-border lg:hidden print:hidden"
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
                    'flex h-14 flex-col items-center justify-center gap-0.5 text-caption transition-colors',
                    isActive ? 'text-primary' : 'text-text-subtle',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={cn(
                        'flex h-6 w-9 items-center justify-center rounded-full transition-colors',
                        isActive && 'bg-primary-light',
                      )}
                    >
                      <item.icon className="size-5" aria-hidden="true" />
                    </span>
                    {t(`control.nav.${item.key}`)}
                  </>
                )}
              </NavLink>
            ))}
        </nav>
      </div>

      <Dialog open={menuOpen} onOpenChange={setMenuOpen}>
        <DialogContent variant="sheet" className="md:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('control.title')}</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl bg-navy p-3 text-navy-foreground">
            <NavGroups groups={CONTROL_NAV} onNavigate={() => setMenuOpen(false)} />
          </div>
          <Button variant="secondary" onClick={() => void auth.signOut()} className="w-full">
            <LogOut aria-hidden="true" />
            {t('auth.sign_out')}
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
