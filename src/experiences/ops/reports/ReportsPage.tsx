import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download } from '@/components/ui/icons';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { formatTzs } from '@/lib/money';
import { formatDay } from '@/lib/dates';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { Field } from '@/components/shared/Field';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Table, TBody, TD, TH, THead, TR } from '@/components/ui/table';
import { useReports, exportCsv } from './hooks';

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function defaultRange(): { from: string; to: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 29);
  return { from: dateKey(start), to: dateKey(end) };
}

export default function ReportsPage() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const role = claims.tenant_role;
  const canView = can(role, 'report.view');
  const canExport = can(role, 'report.export');

  const initial = defaultRange();
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);

  const query = useReports(from, to);
  const data = query.data;

  if (!canView) {
    return (
      <div className="space-y-6">
        <PageHeader title={t('reports.title')} subtitle={t('reports.subtitle')} />
        <ErrorState title={t('reports.no_access_title')} description={t('reports.no_access_body')} />
      </div>
    );
  }

  const maxService = Math.max(...(data?.by_service.map((s) => s.count) ?? [0]), 1);
  const maxSource = Math.max(...(data?.by_source.map((s) => s.count) ?? [0]), 1);

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('reports.title')}
        subtitle={t('reports.subtitle')}
        actions={
          data && canExport ? (
            <Button variant="secondary" onClick={() => exportCsv(data, from, to)}>
              <Download aria-hidden="true" />
              {t('reports.export')}
            </Button>
          ) : null
        }
      />

      <Card>
        <CardBody className="flex flex-col gap-3 md:flex-row md:items-end">
          <Field id="reports-from" label={t('reports.from')}>
            <Input
              id="reports-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => setFrom(e.target.value)}
            />
          </Field>
          <Field id="reports-to" label={t('reports.to')}>
            <Input
              id="reports-to"
              type="date"
              value={to}
              min={from}
              onChange={(e) => setTo(e.target.value)}
            />
          </Field>
        </CardBody>
      </Card>

      {query.isPending ? (
        <div className="space-y-4" aria-busy="true">
          <div className="grid gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-64" />
        </div>
      ) : null}

      {query.isError ? (
        <ErrorState
          description={String(query.error)}
          onRetry={() => void query.refetch()}
          retrying={query.isFetching}
        />
      ) : null}

      {data && data.kpis.received === 0 ? (
        <EmptyState title={t('reports.empty_title')} description={t('reports.empty_body')} />
      ) : null}

      {data && data.kpis.received > 0 ? (
        <>
          <div className="grid gap-3 md:grid-cols-4">
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('reports.received')}</p>
                <p className="tabular mt-1 text-h2">{data.kpis.received}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('reports.confirmed')}</p>
                <p className="tabular mt-1 text-h2">{data.kpis.confirmed}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('reports.cancelled')}</p>
                <p className="tabular mt-1 text-h2">{data.kpis.cancelled}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('reports.completed')}</p>
                <p className="tabular mt-1 text-h2">{data.kpis.completed}</p>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('reports.booked_value')}</p>
                <p className="tabular mt-1 text-h2">{formatTzs(data.revenue.booked_tzs)}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('reports.collected')}</p>
                <p className="tabular mt-1 text-h2">{formatTzs(data.revenue.collected_tzs)}</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('reports.outstanding')}</p>
                <p className="tabular mt-1 text-h2">
                  {formatTzs(data.revenue.booked_tzs - data.revenue.collected_tzs)}
                </p>
              </CardBody>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>{t('reports.by_service')}</CardTitle>
              </CardHeader>
              <CardBody>
                {data.by_service.length === 0 ? (
                  <p className="py-4 text-center text-sm text-text-subtle">{t('reports.no_data')}</p>
                ) : (
                  <ul className="space-y-3">
                    {data.by_service.map((s) => (
                      <li key={s.service}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <span className="font-medium text-text">{s.service || t('reports.unknown')}</span>
                          <span className="tabular text-text-muted">{s.count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${(s.count / maxService) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{t('reports.by_source')}</CardTitle>
              </CardHeader>
              <CardBody>
                {data.by_source.length === 0 ? (
                  <p className="py-4 text-center text-sm text-text-subtle">{t('reports.no_data')}</p>
                ) : (
                  <ul className="space-y-3">
                    {data.by_source.map((s) => (
                      <li key={s.source}>
                        <div className="mb-1 flex items-center justify-between text-sm">
                          <Badge tone="outline">{s.source || t('reports.unknown')}</Badge>
                          <span className="tabular text-text-muted">{s.count}</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                          <div
                            className="h-full rounded-full bg-primary transition-all"
                            style={{ width: `${(s.count / maxSource) * 100}%` }}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('reports.by_cleaner')}</CardTitle>
            </CardHeader>
            <CardBody>
              {data.by_cleaner.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-subtle">{t('reports.no_data')}</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('reports.col_cleaner')}</TH>
                      <TH>{t('reports.col_jobs')}</TH>
                      <TH>{t('reports.col_completion')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.by_cleaner.map((c) => (
                      <TR key={c.cleaner}>
                        <TD className="font-medium">{c.cleaner || t('reports.unknown')}</TD>
                        <TD className="tabular">{c.jobs}</TD>
                        <TD className="tabular">{c.completion_rate}%</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('reports.cancellation_rate')}</p>
                <p className="tabular mt-1 text-h2">{data.cancellation.rate}%</p>
              </CardBody>
            </Card>
            <Card>
              <CardBody>
                <p className="text-caption text-text-subtle">{t('reports.avg_confirm_hours')}</p>
                <p className="tabular mt-1 text-h2">{data.confirmation.avg_hours}h</p>
              </CardBody>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t('reports.unpaid')}</CardTitle>
            </CardHeader>
            <CardBody>
              {data.unpaid.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-subtle">{t('reports.no_unpaid')}</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('reports.col_customer')}</TH>
                      <TH>{t('reports.col_ticket')}</TH>
                      <TH>{t('reports.col_balance')}</TH>
                      <TH>{t('reports.col_days')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.unpaid.map((u) => (
                      <TR key={u.ticket}>
                        <TD className="font-medium">{u.customer || t('reports.unknown')}</TD>
                        <TD>{u.ticket}</TD>
                        <TD className="tabular">{formatTzs(u.amount_tzs)}</TD>
                        <TD className="tabular">{u.days_outstanding}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t('reports.repeat_customers')}</CardTitle>
            </CardHeader>
            <CardBody>
              {data.repeat_customers.length === 0 ? (
                <p className="py-4 text-center text-sm text-text-subtle">{t('reports.no_repeat')}</p>
              ) : (
                <Table>
                  <THead>
                    <TR>
                      <TH>{t('reports.col_customer')}</TH>
                      <TH>{t('reports.col_bookings')}</TH>
                      <TH>{t('reports.col_total')}</TH>
                      <TH>{t('reports.col_last')}</TH>
                    </TR>
                  </THead>
                  <TBody>
                    {data.repeat_customers.map((r) => (
                      <TR key={r.customer}>
                        <TD className="font-medium">{r.customer}</TD>
                        <TD className="tabular">{r.bookings}</TD>
                        <TD className="tabular">{formatTzs(r.total_spent_tzs)}</TD>
                        <TD className="text-xs text-text-subtle">{formatDay(r.last_booking, 'en')}</TD>
                      </TR>
                    ))}
                  </TBody>
                </Table>
              )}
            </CardBody>
          </Card>
        </>
      ) : null}
    </div>
  );
}
