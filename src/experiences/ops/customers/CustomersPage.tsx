import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useCustomers } from './hooks';
import { PageHeader } from '@/components/shared/PageHeader';
import { DataView, type DataColumn } from '@/components/shared/DataView';
import { Input } from '@/components/ui/input';
import { Card, CardBody } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { formatTzs } from '@/lib/money';
import { formatDay } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import type { CustomerRow } from '../tickets/types';

export function CustomersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const { data, isLoading, error, refetch } = useCustomers(search);

  const columns: DataColumn<CustomerRow>[] = [
    {
      key: 'name',
      header: t('ops.col.customer'),
      cell: (row) => (
        <div>
          <div className="font-medium text-text">{row.name}</div>
          <div className="text-xs text-text-subtle">{formatPhone(row.phone_e164)}</div>
        </div>
      ),
    },
    {
      key: 'phone',
      header: t('ops.col.phone'),
      cell: (row) => <span className="text-text-subtle">{formatPhone(row.phone_e164)}</span>,
    },
    {
      key: 'bookings',
      header: t('ops.col.bookings'),
      cell: (row) => <Badge tone="outline">{row.booking_count}</Badge>,
    },
    {
      key: 'total_booked',
      header: t('ops.col.total_booked'),
      align: 'right',
      cell: (row) => <span className="tabular">{formatTzs(row.total_booked_tzs)}</span>,
    },
    {
      key: 'balance',
      header: t('ops.col.balance'),
      align: 'right',
      cell: (row) => {
        const balance = row.total_booked_tzs - row.total_paid_tzs;
        return (
          <span className={`tabular ${balance > 0 ? 'text-warning' : 'text-success'}`}>
            {formatTzs(balance)}
          </span>
        );
      },
    },
    {
      key: 'last_booking',
      header: t('ops.col.last_booking'),
      cell: (row) => (
        <span className="text-text-subtle">
          {row.last_booking_at ? formatDay(row.last_booking_at, 'en') : '—'}
        </span>
      ),
    },
  ];

  const renderCard = (row: CustomerRow) => (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={() => navigate(`/ops/customers/${row.id}`)}
    >
      <CardBody className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="font-medium text-text">{row.name}</p>
            <p className="text-sm text-text-subtle">{formatPhone(row.phone_e164)}</p>
          </div>
          <Badge tone="outline">
            {row.booking_count} {t('ops.bookings_count')}
          </Badge>
        </div>
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-text-subtle">{t('ops.total_booked')}</span>
          <span className="tabular font-medium">{formatTzs(row.total_booked_tzs)}</span>
        </div>
        <div className="mt-1 flex items-center justify-between text-sm">
          <span className="text-text-subtle">{t('ops.balance')}</span>
          <span
            className={`tabular font-medium ${row.total_booked_tzs - row.total_paid_tzs > 0 ? 'text-warning' : 'text-success'}`}
          >
            {formatTzs(row.total_booked_tzs - row.total_paid_tzs)}
          </span>
        </div>
      </CardBody>
    </Card>
  );

  return (
    <div>
      <PageHeader title={t('nav.customers')} subtitle={t('ops.customers_subtitle')} />

      <div className="relative mb-4">
        <Search
          className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-subtle"
          aria-hidden="true"
        />
        <Input
          type="search"
          placeholder={t('ops.search_customer')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
          aria-label={t('common.search')}
        />
      </div>

      <DataView
        state={isLoading ? 'loading' : error ? 'error' : !data || data.length === 0 ? 'empty' : 'data'}
        rows={data ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        renderCard={renderCard}
        onRowClick={(row) => navigate(`/ops/customers/${row.id}`)}
        empty={
          <EmptyState
            icon={<Users aria-hidden="true" />}
            title={t('ops.no_customers_title')}
            description={t('ops.no_customers_body')}
          />
        }
        error={<ErrorState onRetry={() => refetch()} retrying={isLoading} />}
        caption={t('nav.customers')}
      />
    </div>
  );
}

export default CustomersPage;
