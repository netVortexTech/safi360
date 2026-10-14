import { useTranslation } from 'react-i18next';
import { NavLink } from 'react-router-dom';
import { cn } from '@/lib/utils';

const TABS = [
  { key: 'services', to: '/ops/services', end: true },
  { key: 'service_areas', to: '/ops/services/areas', end: false },
] as const;

export function CatalogTabs() {
  const { t } = useTranslation();
  return (
    <nav aria-label={t('nav.catalog')} className="mb-4 flex gap-1 border-b border-border">
      {TABS.map((tab) => (
        <NavLink
          key={tab.key}
          to={tab.to}
          end={tab.end}
          className={({ isActive }) =>
            cn(
              '-mb-px flex h-touch items-center border-b-2 px-3 text-sm font-medium',
              isActive ? 'border-primary text-primary' : 'border-transparent text-text-muted hover:text-text',
            )
          }
        >
          {t(`nav.${tab.key}`)}
        </NavLink>
      ))}
    </nav>
  );
}
