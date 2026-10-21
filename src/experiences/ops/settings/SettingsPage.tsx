import { Link, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ChevronRight } from '@/components/ui/icons';
import { useAuth } from '@/lib/auth';
import { can, type Permission } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card, CardBody } from '@/components/ui/card';

interface SettingsTab {
  to: string;
  labelKey: string;
  descKey: string;
  perm: Permission;
}

const settingsTabs: SettingsTab[] = [
  {
    to: '/ops/settings/profile',
    labelKey: 'settings.tab_profile',
    descKey: 'settings.tab_profile_desc',
    perm: 'settings.edit',
  },
  {
    to: '/ops/settings/branding',
    labelKey: 'settings.tab_branding',
    descKey: 'settings.tab_branding_desc',
    perm: 'settings.edit',
  },
  {
    to: '/ops/settings/channels',
    labelKey: 'settings.tab_channels',
    descKey: 'settings.tab_channels_desc',
    perm: 'settings.edit',
  },
  {
    to: '/ops/settings/templates',
    labelKey: 'settings.tab_templates',
    descKey: 'settings.tab_templates_desc',
    perm: 'settings.edit',
  },
  {
    to: '/ops/settings/team',
    labelKey: 'settings.tab_team',
    descKey: 'settings.tab_team_desc',
    perm: 'staff.manage',
  },
  {
    to: '/ops/settings/onboarding',
    labelKey: 'settings.tab_onboarding',
    descKey: 'settings.tab_onboarding_desc',
    perm: 'settings.edit',
  },
];

export function SettingsTabs({ className }: { className?: string }) {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const role = claims.tenant_role;
  const visible = settingsTabs.filter((tab) => can(role, tab.perm));
  if (visible.length === 0) return null;
  return (
    <nav
      aria-label={t('settings.title')}
      className={cn(
        '-mb-1 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        className,
      )}
    >
      {visible.map((tab) => (
        <NavLink
          key={tab.to}
          to={tab.to}
          className={({ isActive }) =>
            cn(
              'whitespace-nowrap rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors duration-200 ease-premium',
              isActive
                ? 'border-primary bg-primary-light text-primary'
                : 'border-border bg-surface text-text-muted hover:border-border-strong hover:bg-surface-muted hover:text-text',
            )
          }
        >
          {t(tab.labelKey)}
        </NavLink>
      ))}
    </nav>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const role = claims.tenant_role;
  const visible = settingsTabs.filter((tab) => can(role, tab.perm));

  return (
    <div className="space-y-6">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <SettingsTabs />
      {visible.length === 0 ? (
        <EmptyState title={t('settings.no_access_title')} description={t('settings.no_access_body')} />
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((tab) => (
            <Link key={tab.to} to={tab.to}>
              <Card interactive>
                <CardBody className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-text">{t(tab.labelKey)}</p>
                    <p className="mt-1 text-sm text-text-muted">{t(tab.descKey)}</p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
                </CardBody>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
