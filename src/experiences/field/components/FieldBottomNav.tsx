import { AlertTriangle, CalendarClock, CalendarDays, History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';

export function FieldBottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const tabs = [
    { to: '/field', label: t('field.nav_today'), icon: CalendarDays },
    { to: '/field/upcoming', label: t('field.nav_upcoming'), icon: CalendarClock },
    { to: '/field/history', label: t('field.nav_history'), icon: History },
    { to: '/field/alerts', label: t('field.nav_alerts'), icon: AlertTriangle },
  ];
  return (
    <nav
      className="safe-bottom bar-blur fixed inset-x-0 bottom-0 z-20 border-t border-border"
      aria-label="Main"
    >
      <ul className="mx-auto flex max-w-md items-center justify-around">
        {tabs.map((tab) => {
          const active =
            tab.to === '/field' ? location.pathname === '/field' : location.pathname.startsWith(tab.to);
          return (
            <li key={tab.to} className="flex-1">
              <Link
                to={tab.to}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'text-caption flex h-16 flex-col items-center justify-center gap-0.5 font-medium transition-colors',
                  active ? 'text-primary' : 'text-text-subtle',
                )}
              >
                <span
                  className={cn(
                    'flex h-7 w-12 items-center justify-center rounded-full transition-colors',
                    active && 'bg-primary-light',
                  )}
                >
                  <tab.icon className="size-5" aria-hidden="true" />
                </span>
                {tab.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
