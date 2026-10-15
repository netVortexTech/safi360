import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Printer } from 'lucide-react';
import type { BookingStatus } from '@shared/enums';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { formatTzs } from '@/lib/money';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TicketChip } from '@/components/shared/TicketChip';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { useInvoices, type InvoiceRow } from './hooks';
import { ageBucket, invoiceAgeDays, isOutstanding, type AgeBucket } from './utils';

type Filter = 'outstanding' | 'paid' | 'all';

const bucketTone: Record<AgeBucket, 'success' | 'warning' | 'error'> = {
  current: 'success',
  due: 'warning',
  overdue: 'error',
};

export default function InvoicesPage() {
  const { t } = useTranslation();
  const { claims } = useAuth();
  const { data, isLoading, error, refetch } = useInvoices();
  const [filter, setFilter] = useState<Filter>('outstanding');
  const [search, setSearch] = useState('');

  const rows = useMemo(() => data ?? [], [data]);

  const outstanding = useMemo(
    () => rows.filter((r) => isOutstanding(r.total_tzs, r.paid_tzs, r.status)),
    [rows],
  );
  const outstandingTotal = outstanding.reduce((s, r) => s + (r.total_tzs - r.paid_tzs), 0);
  const collectedTotal = rows.reduce((s, r) => s + r.paid_tzs, 0);
  const overdueCount = outstanding.filter(
    (r) => ageBucket(r.scheduled_start, r.created_at) === 'overdue',
  ).length;

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((r) => {
      const out = isOutstanding(r.total_tzs, r.paid_tzs, r.status);
      if (filter === 'outstanding' && !out) return false;
      if (filter === 'paid' && out) return false;
      if (needle && !`${r.ticket_ref} ${r.customer_name}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [rows, filter, search]);

  if (!can(claims.tenant_role, 'payment.view')) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-error">
        {t('ops.invoices_no_access')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader title={t('nav.invoices_balances')} subtitle={t('ops.invoice_subtitle')} />

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-caption text-text-subtle">{t('ops.outstanding')}</p>
            <p className="tabular mt-1 text-h2">{formatTzs(outstandingTotal)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-caption text-text-subtle">{t('ops.collected')}</p>
            <p className="tabular mt-1 text-h2">{formatTzs(collectedTotal)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-caption text-text-subtle">{t('ops.overdue')}</p>
            <p className="tabular mt-1 text-h2">{overdueCount}</p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="space-y-4">
          <div className="flex flex-col gap-3 md:flex-row">
            <Input
              placeholder={t('ops.invoice_search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={filter} onChange={(e) => setFilter(e.target.value as Filter)}>
              <option value="outstanding">{t('ops.outstanding')}</option>
              <option value="paid">{t('ops.paid_filter')}</option>
              <option value="all">{t('common.all')}</option>
            </Select>
          </div>

          {isLoading && <div className="h-40 animate-pulse rounded bg-surface-muted" />}
          {error && <ErrorState onRetry={() => refetch()} />}

          {!isLoading && !error && filtered.length === 0 && (
            <EmptyState
              icon={<FileText aria-hidden="true" />}
              title={t('ops.no_invoices_title')}
              description={t('ops.no_invoices_body')}
            />
          )}

          {!isLoading && !error && filtered.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-text-subtle">
                    <th className="py-2">{t('ops.invoice_no')}</th>
                    <th className="py-2">{t('ops.col.customer')}</th>
                    <th className="py-2 text-right">{t('ops.col.total')}</th>
                    <th className="py-2 text-right">{t('ops.paid')}</th>
                    <th className="py-2 text-right">{t('ops.balance_due')}</th>
                    <th className="py-2">{t('ops.age')}</th>
                    <th className="py-2">{t('ops.col.status')}</th>
                    <th className="py-2">
                      <span className="sr-only">{t('common.view')}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row) => (
                    <InvoiceTableRow key={row.id} row={row} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

function InvoiceTableRow({ row }: { row: InvoiceRow }) {
  const { t } = useTranslation();
  const balance = row.total_tzs - row.paid_tzs;
  const bucket = ageBucket(row.scheduled_start, row.created_at);
  const days = invoiceAgeDays(row.scheduled_start, row.created_at);
  return (
    <tr className="border-t border-border/50">
      <td className="py-2">
        <TicketChip ticketRef={row.ticket_ref} size="sm" />
      </td>
      <td className="py-2">{row.customer_name}</td>
      <td className="tabular py-2 text-right">{formatTzs(row.total_tzs)}</td>
      <td className="tabular py-2 text-right">{formatTzs(row.paid_tzs)}</td>
      <td className="tabular py-2 text-right font-medium">{formatTzs(Math.max(balance, 0))}</td>
      <td className="py-2">
        {balance > 0 ? (
          <Badge tone={bucketTone[bucket]}>
            {t(`ops.age_${bucket}`)} · {days}d
          </Badge>
        ) : (
          <span className="text-text-subtle">—</span>
        )}
      </td>
      <td className="py-2">
        <StatusBadge status={row.status as BookingStatus} />
      </td>
      <td className="py-2 text-right">
        <Button variant="ghost" size="sm" asChild>
          <Link to={`/ops/invoices/${row.id}`}>
            <Printer className="size-3" aria-hidden="true" />
            {t('common.view')}
          </Link>
        </Button>
      </td>
    </tr>
  );
}
