import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatDay } from '@/lib/dates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';
import { EmptyState } from '@/components/shared/EmptyState';

async function countTable(table: string, gte?: { column: string; value: string }): Promise<number | null> {
  let q = supabase.from(table).select('id', { count: 'exact', head: true });
  if (gte) q = q.gte(gte.column, gte.value);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

export default function ControlHealth() {
  const auth = useAuth();
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'sw' ? 'sw' : 'en';

  const tenantsQuery = useQuery({
    queryKey: ['control', 'health', 'tenants'],
    queryFn: () => countTable('tenants'),
    enabled: auth.claims.is_super_admin,
  });
  const bookingsQuery = useQuery({
    queryKey: ['control', 'health', 'bookings24h'],
    queryFn: () =>
      countTable('bookings', {
        column: 'created_at',
        value: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      }),
    enabled: auth.claims.is_super_admin,
  });
  const paymentsQuery = useQuery({
    queryKey: ['control', 'health', 'payments'],
    queryFn: () => countTable('payments'),
    enabled: auth.claims.is_super_admin,
  });

  if (!auth.claims.is_super_admin) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-error">
        {t('control.health.forbidden')}
      </div>
    );
  }

  const loading = tenantsQuery.isLoading || bookingsQuery.isLoading || paymentsQuery.isLoading;
  const error = tenantsQuery.error ?? bookingsQuery.error ?? paymentsQuery.error;

  const refetchAll = () => {
    void tenantsQuery.refetch();
    void bookingsQuery.refetch();
    void paymentsQuery.refetch();
  };

  const nowLabel = formatDay(new Date(), locale);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('control.health.title')}
        subtitle={t('control.health.subtitle')}
        actions={
          <Button
            variant="secondary"
            onClick={refetchAll}
            loading={loading}
            loadingLabel={t('common.loading')}
          >
            <RefreshCw aria-hidden="true" />
            {t('control.health.refresh')}
          </Button>
        }
      />
      {loading ? (
        <div className="grid gap-3 md:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i}><CardBody><Skeleton className="h-16 w-full" /></CardBody></Card>
          ))}
        </div>
      ) : null}
      {error ? (
        <ErrorState
          title={t('control.health.load_error')}
          description={String(error)}
          onRetry={refetchAll}
        />
      ) : null}
      {!loading && !error ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('control.health.uptime')}</p>
                <p className="mt-1 flex items-center gap-2">
                  <Badge tone="success">{t('control.health.operational')}</Badge>
                </p>
                <p className="mt-1 text-xs text-text-subtle">{t('control.health.uptime_hint')}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('control.health.tenants')}</p>
                <p className="mt-1 text-h2 tabular">{tenantsQuery.data ?? 0}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('control.health.bookings_24h')}</p>
                <p className="mt-1 text-h2 tabular">{bookingsQuery.data ?? 0}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('control.health.payments')}</p>
                <p className="mt-1 text-h2 tabular">{paymentsQuery.data ?? 0}</p>
              </CardBody>
            </Card>
          </div>
          <Card>
            <CardHeader><CardTitle>{t('control.health.db_tables')}</CardTitle></CardHeader>
            <CardBody className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">tenants</span>
                <span className="tabular">{tenantsQuery.data ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">bookings ({t('control.health.bookings_24h')})</span>
                <span className="tabular">{bookingsQuery.data ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">payments</span>
                <span className="tabular">{paymentsQuery.data ?? 0}</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-text-muted">{t('control.health.last_check')}</span>
                <span className="text-xs text-text-subtle">{nowLabel}</span>
              </div>
            </CardBody>
          </Card>
          {(tenantsQuery.data ?? 0) === 0 && (bookingsQuery.data ?? 0) === 0 ? (
            <EmptyState
              title={t('control.health.empty')}
              description={t('control.health.empty_hint')}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
