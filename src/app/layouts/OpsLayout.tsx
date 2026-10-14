import { Bell, Menu, Plus, Search } from 'lucide-react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { OPS_BOTTOM_NAV, OPS_NAV } from '@/app/layouts/nav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { applyExperienceLocale } from '@/i18n';
import { cn } from '@/lib/utils';

// Placeholder tenant identity until auth lands (Phase 1). Not a data source.
const TENANT_NAME = 'Usafi Bora Cleaners';

/**
 * Operations portal shell: navy sidebar ≥768px, bottom nav below. Matches Stitch
 * "Dashboard — desktop" / "Dashboard — mobile".
 */
export function OpsLayout() {
  const { t } = useTranslation();

  // Staff language: saved preference wins (profile-backed from Phase 1), else English.
  useEffect(() => {
    applyExperienceLocale('en');
  }, []);

  return (
    <div className="flex min-h-dvh bg-surface-page">
      <aside className="hidden w-64 shrink-0 flex-col bg-navy text-navy-foreground md:flex">
        <div className="flex items-center gap-3 px-5 py-5">
          <span className="flex size-9 items-center justify-center rounded bg-primary text-base font-bold">
            S
          </span>
          <div className="min-w-0">
            <div className="text-base font-semibold leading-tight">{t('app.name')}</div>
            <div className="truncate text-xs text-navy-foreground/70">{TENANT_NAME}</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto px-3 pb-6" aria-label="Main">
          {OPS_NAV.map((group) => (
            <div key={group.key} className="mb-4">
              <div className="px-3 pb-1 pt-2 text-xs font-medium text-navy-foreground/60">
                {t(`nav.${group.key}`)}
              </div>
              <ul>
                {group.items.map((item) => (
                  <li key={item.key}>
                    <NavLink
                      to={item.to}
                      end={item.to === '/ops'}
                      className={({ isActive }) =>
                        cn(
                          'flex h-touch items-center gap-3 rounded px-3 text-sm font-medium text-navy-foreground/90 hover:bg-navy-foreground/10',
                          isActive && 'bg-primary text-primary-foreground hover:bg-primary',
                        )
                      }
                    >
                      <item.icon className="size-4 shrink-0" aria-hidden="true" />
                      <span className="truncate">{t(`nav.${item.key}`)}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="safe-top sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border bg-surface px-4 md:px-6">
          <div className="flex items-center gap-2 md:hidden">
            <span className="flex size-8 items-center justify-center rounded bg-primary text-sm font-bold text-primary-foreground">
              S
            </span>
            <span className="truncate text-sm font-semibold">{TENANT_NAME}</span>
          </div>
          <div className="relative hidden max-w-xl flex-1 md:block">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle"
              aria-hidden="true"
            />
            <Input
              type="search"
              placeholder={t('ops.search_placeholder')}
              className="pl-9"
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
            <Button variant="secondary" size="icon" aria-label={t('common.search')} className="md:hidden">
              <Search aria-hidden="true" />
            </Button>
            <Button variant="secondary" size="icon" aria-label="Notifications">
              <Bell aria-hidden="true" />
            </Button>
          </div>
        </header>

        <main className="flex-1 p-4 pb-24 md:p-8 md:pb-8">
          <Outlet />
        </main>

        <nav
          className="safe-bottom fixed inset-x-0 bottom-0 z-10 grid grid-cols-5 border-t border-border bg-surface md:hidden"
          aria-label="Main"
        >
          {OPS_BOTTOM_NAV.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              end={item.to === '/ops'}
              className={({ isActive }) =>
                cn(
                  'flex h-14 flex-col items-center justify-center gap-0.5 text-xs text-text-subtle',
                  isActive && 'text-primary',
                )
              }
            >
              <item.icon className="size-5" aria-hidden="true" />
              {t(`nav.${item.key}`)}
            </NavLink>
          ))}
          <button
            type="button"
            className="flex h-14 flex-col items-center justify-center gap-0.5 text-xs text-text-subtle"
          >
            <Menu className="size-5" aria-hidden="true" />
            {t('nav.more')}
          </button>
        </nav>
      </div>
    </div>
  );
}
