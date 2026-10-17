import { Bell, LogOut, Menu, Plus, Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { OPS_BOTTOM_NAV, OPS_NAV, type NavGroup } from '@/app/layouts/nav';
import { RouteLoading } from '@/app/RouteLoading';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { applyExperienceLocale } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { useCurrentTenant } from '@/lib/tenant';
import { cn } from '@/lib/utils';

/**
 * Operations portal shell: ink sidebar ≥768px, bottom nav below. Requires a signed-in
 * office role; cleaners are sent to the field app.
 */
export function OpsLayout() {
  const auth = useAuth();
  const location = useLocation();

  // Staff language: saved preference wins (profile-backed from Phase 2), else English.
  useEffect(() => {
    applyExperienceLocale('en');
  }, []);

  if (auth.status === 'loading') return <RouteLoading />;
  if (auth.status === 'signed_out')
    return <Navigate to="/ops/login" replace state={{ from: location.pathname }} />;
  if (!can(auth.claims.tenant_role, 'customer.view')) return <NoAccess />;

  return <Shell />;
}

function NoAccess() {
  const { t } = useTranslation();
  const auth = useAuth();
  const isCleaner = auth.claims.tenant_role === 'CLEANER';
  return (
    <main className="mx-auto max-w-lg p-4 md:p-8">
      <ErrorState
        title={t(isCleaner ? 'auth.cleaner_title' : 'auth.no_access_title')}
        description={t(isCleaner ? 'auth.cleaner_body' : 'auth.no_access_body')}
      />
      <div className="mt-4 flex justify-center gap-2">
        {isCleaner && (
          <Button asChild>
            <NavLink to="/field">{t('auth.go_to_field')}</NavLink>
          </Button>
        )}
        <Button variant="secondary" onClick={() => void auth.signOut()}>
          <LogOut aria-hidden="true" />
          {t('auth.sign_out')}
        </Button>
      </div>
    </main>
  );
}

function BrandMark({ label, sublabel }: { label: string; sublabel?: string | undefined }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary text-base font-bold text-primary-foreground shadow-xs">
        S
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold leading-tight text-navy-foreground">{label}</div>
        {sublabel ? (
          <div className="truncate text-caption text-navy-foreground/60">{sublabel}</div>
        ) : (
          <Skeleton className="mt-1 h-3 w-24 bg-navy-foreground/15" />
        )}
      </div>
    </div>
  );
}

function NavGroups({
  groups,
  onNavigate,
  className,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <nav className={cn('space-y-5', className)} aria-label="Main">
      {groups.map((group) => (
        <div key={group.key}>
          <div className="px-3 pb-1.5 text-caption uppercase tracking-eyebrow text-navy-foreground/45">
            {t(`nav.${group.key}`)}
          </div>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.key}>
                <NavLink
                  to={item.to}
                  end={item.to === '/ops'}
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
                  <span className="truncate">{t(`nav.${item.key}`)}</span>
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
  const tenant = useCurrentTenant();
  const tenantName = tenant.data?.name;
  const [moreOpen, setMoreOpen] = useState(false);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [term, setTerm] = useState('');

  const submitSearch = () => {
    const q = term.trim();
    void navigate(q ? `/ops/tickets?q=${encodeURIComponent(q)}` : '/ops/tickets');
  };

  return (
    <div className="flex min-h-dvh bg-surface-page">
      <aside className="hidden w-64 shrink-0 flex-col bg-navy text-navy-foreground md:flex print:hidden">
        <div className="px-4 py-5">
          <BrandMark label={t('app.name')} sublabel={tenantName} />
        </div>
        <div className="flex-1 overflow-y-auto px-3 pb-6">
          <NavGroups groups={OPS_NAV} />
        </div>
        <div className="border-t border-navy-foreground/10 p-3">
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="flex h-10 w-full items-center gap-3 rounded-lg px-3 text-sm text-navy-foreground/70 transition-colors hover:bg-navy-foreground/10 hover:text-navy-foreground"
          >
            <LogOut className="size-[18px]" aria-hidden="true" />
            <span className="truncate">
              {t('auth.sign_out')}
              {auth.claims.tenant_role && (
                <span className="ml-1 text-navy-foreground/45">· {t(`role.${auth.claims.tenant_role}`)}</span>
              )}
            </span>
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-top bar-blur sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border px-4 md:px-8 print:hidden">
          <div className="flex min-w-0 items-center gap-2 md:hidden">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
              S
            </span>
            <span className="truncate text-sm font-semibold">{tenantName ?? t('app.name')}</span>
          </div>
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle"
              aria-hidden="true"
            />
            <Input
              type="search"
              defaultValue={searchParams.get('q') ?? ''}
              onChange={(e) => setTerm(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') submitSearch();
              }}
              placeholder={t('ops.search_placeholder')}
              className="h-10 rounded-lg border-border bg-surface-muted/70 pl-10 shadow-none hover:bg-surface-muted"
              aria-label={t('common.search')}
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Button className="hidden md:inline-flex" asChild>
              <NavLink to="/ops/bookings/new">
                <Plus aria-hidden="true" />
                {t('nav.create_booking')}
              </NavLink>
            </Button>
            <Button asChild size="icon" aria-label={t('nav.create_booking')} className="md:hidden">
              <NavLink to="/ops/bookings/new">
                <Plus aria-hidden="true" />
              </NavLink>
            </Button>
            <Button
              variant="secondary"
              size="icon"
              aria-label={t('common.search')}
              className="md:hidden"
              onClick={() => void navigate('/ops/tickets')}
            >
              <Search aria-hidden="true" />
            </Button>
            <Button variant="secondary" size="icon" aria-label={t('ops.notifications')} className="relative">
              <Bell aria-hidden="true" />
              <span
                className="absolute right-2.5 top-2.5 size-1.5 rounded-full bg-amber"
                aria-hidden="true"
              />
            </Button>
          </div>
        </header>

        <main className="flex-1 px-4 py-6 pb-28 md:px-8 md:py-8 md:pb-10">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>

        <nav
          className="safe-bottom bar-blur fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t border-border md:hidden print:hidden"
          aria-label="Main"
        >
          {OPS_BOTTOM_NAV.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === '/ops'}
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
                  {t(`nav.${item.key}`)}
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex h-14 flex-col items-center justify-center gap-0.5 text-caption text-text-subtle transition-colors hover:text-text"
          >
            <span className="flex h-6 w-9 items-center justify-center rounded-full">
              <Menu className="size-5" aria-hidden="true" />
            </span>
            {t('nav.more')}
          </button>
        </nav>
      </div>

      <Dialog open={moreOpen} onOpenChange={setMoreOpen}>
        <DialogContent variant="sheet" className="md:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('nav.more')}</DialogTitle>
          </DialogHeader>
          <div className="rounded-xl bg-navy p-3 text-navy-foreground">
            <NavGroups groups={OPS_NAV} onNavigate={() => setMoreOpen(false)} />
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
