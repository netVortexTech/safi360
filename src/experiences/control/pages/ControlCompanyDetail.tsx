import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
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
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatTzs } from '@/lib/money';
import { formatDay } from '@/lib/dates';

interface TenantRow {
  id: string;
  name: string;
  slug: string;
  phone_e164: string;
  city: string | null;
  ticket_prefix: string;
  plan_id: string | null;
  status: string;
  trial_ends_at: string | null;
  created_at: string;
}

interface BookingRow {
  id: string;
  ticket_ref: string;
  status: string;
  total_tzs: number;
  scheduled_start: string | null;
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

async function countWhere(table: string, tenantId: string): Promise<number> {
  const { count, error } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export default function ControlCompanyDetail() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [suspendOpen, setSuspendOpen] = useState(false);

  const tenantQuery = useQuery({
    queryKey: ['control', 'tenant', id],
    enabled: id != null,
    queryFn: async (): Promise<TenantRow> => {
      const { data, error } = await supabase
        .from('tenants')
        .select('id, name, slug, phone_e164, city, ticket_prefix, plan_id, status, trial_ends_at, created_at')
        .eq('id', id as string)
        .single();
      if (error) throw new Error(error.message);
      return data;
    },
  });

  const bookingsCount = useQuery({
    queryKey: ['control', 'tenant', id, 'bookings-count'],
    enabled: id != null,
    queryFn: () => countWhere('bookings', id as string),
  });

  const staffCount = useQuery({
    queryKey: ['control', 'tenant', id, 'staff-count'],
    enabled: id != null,
    queryFn: () => countWhere('memberships', id as string),
  });

  const servicesCount = useQuery({
    queryKey: ['control', 'tenant', id, 'services-count'],
    enabled: id != null,
    queryFn: () => countWhere('services', id as string),
  });

  const recentBookings = useQuery({
    queryKey: ['control', 'tenant', id, 'recent-bookings'],
    enabled: id != null,
    queryFn: async (): Promise<BookingRow[]> => {
      const { data, error } = await supabase
        .from('bookings')
        .select('id, ticket_ref, status, total_tzs, scheduled_start, created_at')
        .eq('tenant_id', id as string)
        .order('created_at', { ascending: false })
        .limit(8);
      if (error) throw new Error(error.message);
      return (data ?? []);
    },
  });

  const statusMutation = useMutation({
    mutationFn: async (next: string) => {
      const { error } = await supabase.from('tenants').update({ status: next }).eq('id', id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      setSuspendOpen(false);
      void queryClient.invalidateQueries({ queryKey: ['control', 'tenant', id] });
      void queryClient.invalidateQueries({ queryKey: ['control', 'tenants'] });
    },
  });

  if (!auth.claims.is_super_admin) {
    return <p className="p-4 text-center text-text-muted">{t('control.company_detail.not_authorized')}</p>;
  }

  const tenant = tenantQuery.data;
  const suspended = tenant?.status === 'SUSPENDED';

  return (
    <div className="space-y-6">
      <PageHeader
        title={tenant?.name ?? t('control.company_detail.title')}
        subtitle={tenant ? `${tenant.slug} · ${tenant.ticket_prefix}` : undefined}
        breadcrumbs={[
          { label: t('control.company_detail.crumbs_companies'), to: '/control/companies' },
          { label: tenant?.name ?? '…' },
        ]}
        badges={tenant ? <Badge tone={statusTone(tenant.status)}>{tenant.status}</Badge> : undefined}
        actions={
          tenant ? (
            <>
              <Button asChild variant="secondary">
                <Link to={`/control/impersonation?tenant=${tenant.id}`}>{t('control.company_detail.impersonate')}</Link>
              </Button>
              {suspended ? (
                <Button
                  onClick={() => statusMutation.mutate('ACTIVE')}
                  loading={statusMutation.isPending}
                  loadingLabel={t('control.company_detail.activating')}
                >
                  {t('control.company_detail.activate')}
                </Button>
              ) : (
                <Button variant="destructive" onClick={() => setSuspendOpen(true)}>
                  {t('control.company_detail.suspend')}
                </Button>
              )}
            </>
          ) : undefined
        }
      />

      {tenantQuery.isLoading ? (
        <div className="grid gap-3 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <Card key={i}>
              <CardBody>
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="mt-2 h-8 w-3/4" />
              </CardBody>
            </Card>
          ))}
        </div>
      ) : tenantQuery.error || !tenant ? (
        <ErrorState onRetry={() => void tenantQuery.refetch()} retrying={tenantQuery.isFetching} />
      ) : (
        <>
          {statusMutation.error ? (
            <p role="alert" className="text-sm text-error">
              {String(statusMutation.error)}
            </p>
          ) : null}
          <div className="grid gap-3 md:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>{t('control.company_detail.info_title')}</CardTitle>
              </CardHeader>
              <CardBody className="space-y-1 text-sm">
                <p>
                  <span className="text-text-subtle">{t('control.company_detail.phone')}: </span>
                  {tenant.phone_e164}
                </p>
                <p>
                  <span className="text-text-subtle">{t('control.company_detail.city')}: </span>
                  {tenant.city ?? '—'}
                </p>
                <p>
                  <span className="text-text-subtle">{t('control.company_detail.ticket_prefix')}: </span>
                  {tenant.ticket_prefix}
                </p>
                <p>
                  <span className="text-text-subtle">{t('control.company_detail.created')}: </span>
                  {formatDay(tenant.created_at, 'en')}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('control.company_detail.subscription_title')}</CardTitle>
              </CardHeader>
              <CardBody className="space-y-1 text-sm">
                <p>
                  <span className="text-text-subtle">{t('control.company_detail.plan')}: </span>
                  {tenant.plan_id ?? '—'}
                </p>
                <p>
                  <span className="text-text-subtle">{t('control.company_detail.status')}: </span>
                  <Badge tone={statusTone(tenant.status)}>{tenant.status}</Badge>
                </p>
                <p>
                  <span className="text-text-subtle">{t('control.company_detail.trial_ends')}: </span>
                  {tenant.trial_ends_at ? formatDay(tenant.trial_ends_at, 'en') : '—'}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>{t('control.company_detail.stats_title')}</CardTitle>
              </CardHeader>
              <CardBody className="space-y-1 text-sm">
                <p>
                  <span className="text-text-subtle">{t('control.company_detail.bookings')}: </span>
                  <span className="tabular font-medium">{bookingsCount.isLoading ? '…' : (bookingsCount.data ?? 0)}</span>
                </p>
                <p>
                  <span className="text-text-subtle">{t('control.company_detail.staff')}: </span>
                  <span className="tabular font-medium">{staffCount.isLoading ? '…' : (staffCount.data ?? 0)}</span>
                </p>
                <p>
                  <span className="text-text-subtle">{t('control.company_detail.services')}: </span>
                  <span className="tabular font-medium">{servicesCount.isLoading ? '…' : (servicesCount.data ?? 0)}</span>
                </p>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('control.company_detail.recent_bookings')}</CardTitle>
            </CardHeader>
            <CardBody>
              {recentBookings.isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : recentBookings.error ? (
                <ErrorState onRetry={() => void recentBookings.refetch()} retrying={recentBookings.isFetching} />
              ) : (recentBookings.data ?? []).length === 0 ? (
                <EmptyState
                  title={t('control.company_detail.no_bookings_title')}
                  description={t('control.company_detail.no_bookings_body')}
                />
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('control.company_detail.col_ticket')}</TH>
                      <TH>{t('control.company_detail.col_status')}</TH>
                      <TH>{t('control.company_detail.col_total')}</TH>
                      <TH>{t('control.company_detail.col_scheduled')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {(recentBookings.data ?? []).map((b) => (
                      <TR key={b.id}>
                        <TD className="font-medium">{b.ticket_ref}</TD>
                        <TD>
                          <Badge tone="outline">{b.status}</Badge>
                        </TD>
                        <TD className="tabular">{formatTzs(b.total_tzs)}</TD>
                        <TD className="text-xs text-text-subtle">
                          {b.scheduled_start ? formatDay(b.scheduled_start, 'en') : '—'}
                        </TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      )}

      <ConfirmDialog
        open={suspendOpen}
        onOpenChange={setSuspendOpen}
        title={t('control.company_detail.suspend_title')}
        description={t('control.company_detail.suspend_body')}
        confirmLabel={t('control.company_detail.suspend_confirm')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={statusMutation.isPending}
        reasonLabel={t('control.company_detail.suspend_reason')}
        onConfirm={() => statusMutation.mutate('SUSPENDED')}
      />
    </div>
  );
}
