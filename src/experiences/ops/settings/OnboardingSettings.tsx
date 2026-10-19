import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Circle } from '@/components/ui/icons';
import { supabase } from '@/lib/supabase';
import { useCurrentTenant } from '@/lib/tenant';
import { PageHeader } from '@/components/shared/PageHeader';
import { ErrorState } from '@/components/shared/ErrorState';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { SettingsTabs } from './SettingsPage';

async function tableHasRows(table: string, tenantId: string): Promise<boolean> {
  const res = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (res.error) throw res.error;
  return (res.count ?? 0) > 0;
}

export default function OnboardingSettings() {
  const { t } = useTranslation();
  const tenant = useCurrentTenant();
  const tenantId = tenant.data?.id ?? null;

  const checks = useQuery({
    queryKey: ['settings', 'onboarding', tenantId],
    enabled: tenantId != null,
    queryFn: async () => {
      const id = tenantId as string;
      const [services, zones, staff, bookings] = await Promise.all([
        tableHasRows('services', id).catch(() => false),
        Promise.all([
          tableHasRows('service_zones', id).catch(() => null),
          tableHasRows('zones', id).catch(() => false),
        ]).then(([a, b]) => (a ?? false) || b),
        tableHasRows('staff', id).catch(() => false),
        tableHasRows('bookings', id).catch(() => false),
      ]);
      return { services, zones, staff, bookings };
    },
  });

  const workingHoursSet =
    tenant.data?.settings != null &&
    typeof tenant.data.settings === 'object' &&
    'working_hours' in tenant.data.settings &&
    Object.keys((tenant.data.settings as { working_hours?: Record<string, unknown> }).working_hours ?? {})
      .length > 0;

  const items = [
    { key: 'services', done: checks.data?.services ?? false, to: '/ops/services' },
    { key: 'zones', done: checks.data?.zones ?? false, to: '/ops/services/areas' },
    { key: 'staff', done: checks.data?.staff ?? false, to: '/ops/staff' },
    { key: 'hours', done: workingHoursSet, to: '/ops/settings/profile' },
    { key: 'booking', done: checks.data?.bookings ?? false, to: '/ops/bookings/new' },
  ];
  const done = items.filter((i) => i.done).length;
  const total = items.length;
  const pct = Math.round((done / total) * 100);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('settings.tab_onboarding')}
        subtitle={t('settings.tab_onboarding_desc')}
        breadcrumbs={[
          { label: t('settings.title'), to: '/ops/settings' },
          { label: t('settings.tab_onboarding') },
        ]}
      />
      <SettingsTabs />
      {checks.isPending || tenant.isPending ? (
        <Skeleton className="h-64" />
      ) : checks.isError ? (
        <ErrorState
          description={String(checks.error)}
          onRetry={() => void checks.refetch()}
          retrying={checks.isFetching}
        />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{t('settings.onboarding_heading')}</CardTitle>
          </CardHeader>
          <CardBody className="space-y-4">
            <div>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="text-text-muted">{t('settings.onboarding_progress', { done, total })}</span>
                <Badge tone={done === total ? 'success' : 'primary'}>{pct}%</Badge>
              </div>
              <div
                className="h-2 overflow-hidden rounded-full bg-surface-muted"
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <ul className="space-y-2">
              {items.map((item) => (
                <li key={item.key} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  {item.done ? (
                    <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <Circle className="size-5 shrink-0 text-text-subtle" aria-hidden="true" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-text">{t(`settings.onboarding_${item.key}`)}</p>
                    <p className="text-sm text-text-muted">{t(`settings.onboarding_${item.key}_desc`)}</p>
                  </div>
                  <Badge tone={item.done ? 'success' : 'neutral'}>
                    {t(item.done ? 'settings.done' : 'settings.pending')}
                  </Badge>
                  <Link to={item.to} className="shrink-0 text-sm text-primary hover:underline">
                    {t('settings.open')}
                  </Link>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
