import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Building2, Plus } from '@/components/ui/icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, THead, TBody, TR, TH, TD } from '@/components/ui/table';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { formatDay } from '@/lib/dates';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  plan_id: string | null;
  status: string;
  created_at: string;
}

function statusTone(status: string): 'info' | 'success' | 'warning' | 'error' | 'neutral' {
  switch (status) {
    case 'TRIAL':
      return 'info';
    case 'ACTIVE':
      return 'success';
    case 'PAST_DUE':
      return 'warning';
    case 'SUSPENDED':
      return 'error';
    default:
      return 'neutral';
  }
}

export default function ControlHome() {
  const { t } = useTranslation();
  const auth = useAuth();

  const tenantsQuery = useQuery({
    queryKey: ['control', 'tenants', 'overview'],
    queryFn: async (): Promise<TenantRow[]> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, plan_id, status, created_at')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });

  const rows = useMemo(() => tenantsQuery.data ?? [], [tenantsQuery.data]);
  const total = rows.length;
  const trials = rows.filter((r) => r.status === 'TRIAL').length;
  const active = rows.filter((r) => r.status === 'ACTIVE').length;
  const pastDue = rows.filter((r) => r.status === 'PAST_DUE').length;
  const suspended = rows.filter((r) => r.status === 'SUSPENDED').length;
  const recent = rows.slice(0, 10);

  if (!auth.claims.is_super_admin) {
    return <p className="p-4 text-center text-text-muted">{t('control.overview.not_authorized')}</p>;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('control.overview.title')}
        subtitle={t('control.overview.subtitle')}
        actions={
          <>
            <Button asChild variant="secondary">
              <Link to="/control/audit">{t('control.overview.view_audit')}</Link>
            </Button>
            <Button asChild>
              <Link to="/control/companies/new">
                <Plus aria-hidden="true" />
                {t('control.overview.create_company')}
              </Link>
            </Button>
          </>
        }
      />

      {tenantsQuery.isLoading ? (
        <div className="grid gap-3 md:grid-cols-5" aria-busy="true">
          {[0, 1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardBody>
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-8 w-1/2" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : tenantsQuery.error ? (
        <ErrorState onRetry={() => void tenantsQuery.refetch()} retrying={tenantsQuery.isFetching} />
      ) : (
        <div className="grid gap-3 md:grid-cols-5">
          <Card>
            <CardBody>
              <p className="text-caption text-text-subtle">{t('control.overview.total_companies')}</p>
              <p className="tabular mt-1 text-h2">{total}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-caption text-text-subtle">{t('control.overview.active_trials')}</p>
              <p className="tabular mt-1 text-h2">{trials}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-caption text-text-subtle">{t('control.overview.active_subscriptions')}</p>
              <p className="tabular mt-1 text-h2">{active}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-caption text-text-subtle">{t('control.overview.past_due')}</p>
              <p className="tabular mt-1 text-h2">{pastDue}</p>
            </CardBody>
          </Card>
          <Card>
            <CardBody>
              <p className="text-caption text-text-subtle">{t('control.overview.suspended')}</p>
              <p className="tabular mt-1 text-h2">{suspended}</p>
            </CardBody>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('control.overview.recent_companies')}</CardTitle>
          <Button asChild variant="link" size="sm">
            <Link to="/control/companies">{t('control.overview.view_all')}</Link>
          </Button>
        </CardHeader>
        <CardBody>
          {tenantsQuery.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : tenantsQuery.error ? (
            <ErrorState onRetry={() => void tenantsQuery.refetch()} retrying={tenantsQuery.isFetching} />
          ) : recent.length === 0 ? (
            <EmptyState
              icon={<Building2 aria-hidden="true" />}
              title={t('control.overview.empty_title')}
              description={t('control.overview.empty_body')}
              actions={
                <Button asChild>
                  <Link to="/control/companies/new">{t('control.overview.create_company')}</Link>
                </Button>
              }
            />
          ) : (
            <Table>
              <THead>
                <TR>
                  <TH>{t('control.overview.col_name')}</TH>
                  <TH>{t('control.overview.col_slug')}</TH>
                  <TH>{t('control.overview.col_plan')}</TH>
                  <TH>{t('control.overview.col_status')}</TH>
                  <TH>{t('control.overview.col_created')}</TH>
                </TR>
              </THead>
              <TBody>
                {recent.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <Link
                        to={`/control/companies/${row.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.name}
                      </Link>
                    </TD>
                    <TD className="text-text-subtle">{row.slug}</TD>
                    <TD className="text-text-subtle">{row.plan_id ?? '—'}</TD>
                    <TD>
                      <Badge tone={statusTone(row.status)}>{row.status}</Badge>
                    </TD>
                    <TD className="text-xs text-text-subtle">{formatDay(row.created_at, 'en')}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
