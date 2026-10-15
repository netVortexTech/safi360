import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { Link } from 'react-router-dom';

export function FieldBottomNav() {
  const { t } = useTranslation();
  const location = useLocation();
  const tabs = [
    { to: '/field', label: t('field.nav_today') },
    { to: '/field/upcoming', label: t('field.nav_upcoming') },
    { to: '/field/history', label: t('field.nav_history') },
    { to: '/field/alerts', label: t('field.nav_alerts') },
  ];
  return (
    <nav className="fixed bottom-0 left-0 right-0 border-t border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex max-w-md items-center justify-around">
        {tabs.map((tab) => {
          const active =
            tab.to === '/field' ? location.pathname === '/field' : location.pathname.startsWith(tab.to);
          return (
            <Link
              key={tab.to}
              to={tab.to}
              className={`flex h-16 w-full items-center justify-center text-xs font-medium ${active ? 'text-primary' : 'text-text-subtle'}`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
