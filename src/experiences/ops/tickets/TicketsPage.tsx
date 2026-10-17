import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Filter, Search, SlidersHorizontal } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useTickets } from './hooks';
import { emptyTicketFilters, type TicketFilters } from './types';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SourceChip } from '@/components/shared/SourceChip';
import { TicketChip } from '@/components/shared/TicketChip';
import { PaymentStatus } from '@/components/shared/PaymentStatus';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataView, type DataColumn } from '@/components/shared/DataView';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Field } from '@/components/shared/Field';
import { Card, CardBody } from '@/components/ui/card';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { formatDay, formatTime } from '@/lib/dates';
import { formatTzs } from '@/lib/money';
import { BOOKING_SOURCES, BOOKING_STATUSES, PAYMENT_STATUSES } from '@shared/enums';
import type { BookingSource, BookingStatus, PaymentStatus as PaymentStatusEnum } from '@shared/enums';
import type { TicketRow } from './types';

export function TicketsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [filters, setFilters] = useState<TicketFilters>(() => ({
    ...emptyTicketFilters,
    search: params.get('q') ?? '',
  }));
  const [showFilters, setShowFilters] = useState(false);

  // The global ops search box lives in the shell header; keep this list in step with it.
  useEffect(() => {
    const q = params.get('q') ?? '';
    setFilters((f) => (f.search === q ? f : { ...f, search: q }));
  }, [params]);

  const { data, isLoading, error, refetch } = useTickets(filters);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.source) count++;
    if (filters.status) count++;
    if (filters.date_from || filters.date_to) count++;
    if (filters.service_id) count++;
    if (filters.team_id) count++;
    if (filters.payment_status) count++;
    return count;
  }, [filters]);

  const columns: DataColumn<TicketRow>[] = [
    {
      key: 'ticket',
      header: t('ops.col.ticket'),
      cell: (row) => <TicketChip ticketRef={row.ticket_ref} to={`/ops/tickets/${row.id}`} size="sm" />,
    },
    {
      key: 'customer',
      header: t('ops.col.customer'),
      cell: (row) => (
        <div>
          <div className="font-medium text-text">{row.customer_name}</div>
          <div className="text-xs text-text-subtle">{row.customer_phone}</div>
        </div>
      ),
    },
    {
      key: 'status',
      header: t('ops.col.status'),
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: 'when',
      header: t('ops.col.when'),
      cell: (row) =>
        row.scheduled_start ? (
          <div>
            <div>{formatDay(row.scheduled_start, 'en')}</div>
            <div className="text-xs text-text-subtle">{formatTime(row.scheduled_start, 'en')}</div>
          </div>
        ) : (
          <span className="text-text-subtle">—</span>
        ),
    },
    {
      key: 'source',
      header: t('ops.col.source'),
      cell: (row) => <SourceChip source={row.source} />,
    },
    {
      key: 'payment',
      header: t('ops.col.payment'),
      cell: (row) => {
        if (row.paid_tzs > 0) {
          return <PaymentStatus status="SUCCESS" />;
        }
        if (row.total_tzs > 0) {
          return <PaymentStatus status="NOT_REQUESTED" />;
        }
        return <span className="text-text-subtle">—</span>;
      },
    },
    {
      key: 'total',
      header: t('ops.col.total'),
      align: 'right',
      cell: (row) => <span className="tabular font-medium">{formatTzs(row.total_tzs)}</span>,
    },
  ];

  const renderCard = (row: TicketRow) => (
    <Card interactive className="cursor-pointer" onClick={() => navigate(`/ops/tickets/${row.id}`)}>
      <CardBody className="p-4">
        <div className="flex items-start justify-between gap-2">
          <TicketChip ticketRef={row.ticket_ref} size="sm" />
          <StatusBadge status={row.status} />
        </div>
        <div className="mt-2">
          <p className="font-medium text-text">{row.customer_name}</p>
          <p className="tabular text-sm text-text-subtle">{row.customer_phone}</p>
        </div>
        <div className="mt-2 flex items-center justify-between">
          <SourceChip source={row.source} />
          <span className="tabular font-semibold">{formatTzs(row.total_tzs)}</span>
        </div>
        {row.scheduled_start && (
          <p className="mt-2 text-caption text-text-subtle">
            {formatDay(row.scheduled_start, 'en')} · {formatTime(row.scheduled_start, 'en')}
          </p>
        )}
      </CardBody>
    </Card>
  );

  return (
    <div>
      <PageHeader
        eyebrow={t('nav.overview')}
        title={t('nav.tickets')}
        subtitle={t('ops.tickets_subtitle')}
        actions={
          <Button variant="secondary" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal aria-hidden="true" />
            {t('common.filters')}
            {activeFilterCount > 0 && (
              <span className="ml-1 flex size-5 items-center justify-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
        }
      />

      {/* Search + result count */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search
            className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-text-subtle"
            aria-hidden="true"
          />
          <Input
            type="search"
            placeholder={t('ops.search_placeholder')}
            value={filters.search}
            onChange={(e) => {
              const value = e.target.value;
              setFilters((f) => ({ ...f, search: value }));
              setParams(
                (prev) => {
                  const next = new URLSearchParams(prev);
                  if (value) next.set('q', value);
                  else next.delete('q');
                  return next;
                },
                { replace: true },
              );
            }}
            className="pl-10"
            aria-label={t('common.search')}
          />
        </div>
        {!isLoading && !error && data && (
          <p className="shrink-0 text-sm text-text-muted sm:text-right">
            {t('ops.results_count', { count: data.length })}
          </p>
        )}
      </div>

      {/* Filters */}
      {showFilters && (
        <Card className="mb-4">
          <CardBody className="p-4">
            <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
              <Field id="filter-source" label={t('ops.col.source')}>
                <Select
                  id="filter-source"
                  value={filters.source}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, source: e.target.value as BookingSource | '' }))
                  }
                >
                  <option value="">{t('common.all')}</option>
                  {BOOKING_SOURCES.map((s) => (
                    <option key={s} value={s}>
                      {t(`source.${s}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="filter-status" label={t('ops.col.status')}>
                <Select
                  id="filter-status"
                  value={filters.status}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, status: e.target.value as BookingStatus | '' }))
                  }
                >
                  <option value="">{t('common.all')}</option>
                  {BOOKING_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`status.${s}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="filter-date-from" label={t('ops.filter.date_from')}>
                <Input
                  id="filter-date-from"
                  type="date"
                  value={filters.date_from}
                  onChange={(e) => setFilters((f) => ({ ...f, date_from: e.target.value }))}
                />
              </Field>
              <Field id="filter-date-to" label={t('ops.filter.date_to')}>
                <Input
                  id="filter-date-to"
                  type="date"
                  value={filters.date_to}
                  onChange={(e) => setFilters((f) => ({ ...f, date_to: e.target.value }))}
                />
              </Field>
              <Field id="filter-payment" label={t('ops.col.payment')}>
                <Select
                  id="filter-payment"
                  value={filters.payment_status}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, payment_status: e.target.value as PaymentStatusEnum | '' }))
                  }
                >
                  <option value="">{t('common.all')}</option>
                  {PAYMENT_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {t(`payment_status.${s}`)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Button
                variant="ghost"
                onClick={() => setFilters({ ...emptyTicketFilters })}
                className="self-end"
              >
                {t('common.clear_filters')}
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {/* Results */}
      <DataView
        state={isLoading ? 'loading' : error ? 'error' : !data || data.length === 0 ? 'empty' : 'data'}
        rows={data ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        renderCard={renderCard}
        onRowClick={(row) => navigate(`/ops/tickets/${row.id}`)}
        empty={
          <EmptyState
            icon={<Filter aria-hidden="true" />}
            title={t('ops.no_tickets_title')}
            description={t('ops.no_tickets_body')}
          />
        }
        error={<ErrorState onRetry={() => refetch()} retrying={isLoading} />}
        caption={t('nav.tickets')}
      />
    </div>
  );
}

export default TicketsPage;
