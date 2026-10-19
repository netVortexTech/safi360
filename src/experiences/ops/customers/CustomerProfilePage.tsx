import { useParams } from 'react-router-dom';
import { AlertTriangle, Calendar, CreditCard, MapPin, Phone, User } from '@/components/ui/icons';
import { useTranslation } from 'react-i18next';
import {
  useCustomer,
  useCustomerAddresses,
  useCustomerBookings,
  useCustomerDuplicates,
  useResolveDuplicate,
} from './hooks';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SourceChip } from '@/components/shared/SourceChip';
import { TicketChip } from '@/components/shared/TicketChip';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { formatTzs } from '@/lib/money';
import { formatDay } from '@/lib/dates';
import { formatPhone } from '@/lib/phone';
import { useState } from 'react';
import type { CustomerDuplicate } from '../tickets/types';

export function CustomerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [mergeTarget, setMergeTarget] = useState<CustomerDuplicate | null>(null);

  const { data: customer, isLoading, error, refetch } = useCustomer(id ?? '');
  const { data: addresses } = useCustomerAddresses(id ?? '');
  const { data: bookings } = useCustomerBookings(id ?? '');
  const { data: duplicates } = useCustomerDuplicates(id ?? '');
  const resolveDuplicate = useResolveDuplicate();

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-12 w-96" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !customer) {
    return (
      <ErrorState
        title={t('errors.generic_title')}
        description={t('errors.generic_body')}
        onRetry={() => refetch()}
      />
    );
  }

  const totalBooked = bookings?.reduce((s, b) => s + b.total_tzs, 0) ?? 0;
  const totalPaid = bookings?.reduce((s, b) => s + b.paid_tzs, 0) ?? 0;
  const balance = totalBooked - totalPaid;

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: t('nav.customers'), to: '/ops/customers' }]}
        title={customer.name}
        subtitle={formatPhone(customer.phone_e164)}
        badges={
          <>
            {customer.phone_verified_at && (
              <Badge tone="success">
                <Phone className="size-3" aria-hidden="true" />
                {t('ops.verified')}
              </Badge>
            )}
            {customer.tags.map((tag) => (
              <Badge key={tag} tone="outline">
                {tag}
              </Badge>
            ))}
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left: Customer info */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="size-4" aria-hidden="true" />
                {t('ops.customer_info')}
              </CardTitle>
            </CardHeader>
            <CardBody>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-text-subtle">{t('ops.phone')}</dt>
                  <dd className="font-medium">{formatPhone(customer.phone_e164)}</dd>
                </div>
                {customer.email && (
                  <div className="flex justify-between">
                    <dt className="text-text-subtle">{t('ops.email')}</dt>
                    <dd className="font-medium">{customer.email}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-text-subtle">{t('ops.locale')}</dt>
                  <dd className="font-medium">{customer.locale === 'sw' ? 'Kiswahili' : 'English'}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-subtle">{t('ops.first_source')}</dt>
                  <dd>
                    <SourceChip source={customer.first_source} />
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-text-subtle">{t('ops.since')}</dt>
                  <dd className="font-medium">{formatDay(customer.created_at, 'en')}</dd>
                </div>
              </dl>
            </CardBody>
          </Card>

          {/* Addresses */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4" aria-hidden="true" />
                {t('ops.addresses')}
              </CardTitle>
            </CardHeader>
            <CardBody>
              {addresses && addresses.length > 0 ? (
                <ul className="space-y-3">
                  {addresses.map((addr) => (
                    <li key={addr.id} className="rounded-lg border border-border p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-text">{addr.label || t('ops.address')}</span>
                        {addr.is_default && <Badge tone="primary">{t('ops.default')}</Badge>}
                      </div>
                      <p className="mt-1 text-text-subtle">
                        {[addr.area, addr.street, addr.landmark].filter(Boolean).join(', ')}
                      </p>
                      {addr.lat != null && addr.lng != null && (
                        <a
                          href={`https://maps.google.com/?q=${addr.lat},${addr.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 inline-block text-xs text-primary hover:underline"
                        >
                          {t('ops.open_in_maps')}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-text-subtle">{t('ops.no_addresses')}</p>
              )}
            </CardBody>
          </Card>

          {/* Duplicates */}
          {duplicates && duplicates.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
                  {t('ops.possible_duplicates')}
                </CardTitle>
              </CardHeader>
              <CardBody>
                <ul className="space-y-3">
                  {duplicates.map((dup) => (
                    <li key={dup.id} className="rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-text">{dup.other_name}</p>
                          <p className="text-text-subtle">{formatPhone(dup.other_phone)}</p>
                        </div>
                        <Badge tone="warning">{dup.reason}</Badge>
                      </div>
                      <div className="mt-2 flex gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setMergeTarget(dup)}>
                          {t('ops.merge')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => resolveDuplicate.mutate({ id: dup.id, action: 'DISMISSED' })}
                        >
                          {t('ops.dismiss')}
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </div>

        {/* Right: Bookings & Balance */}
        <div className="space-y-6 lg:col-span-2">
          {/* Balance summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="size-4" aria-hidden="true" />
                {t('ops.balance_summary')}
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-caption text-text-subtle">{t('ops.total_booked')}</p>
                  <p className="tabular mt-1 text-h3">{formatTzs(totalBooked)}</p>
                </div>
                <div>
                  <p className="text-caption text-text-subtle">{t('ops.total_paid')}</p>
                  <p className="tabular mt-1 text-h3 text-success">{formatTzs(totalPaid)}</p>
                </div>
                <div>
                  <p className="text-caption text-text-subtle">{t('ops.balance')}</p>
                  <p className={`tabular mt-1 text-h3 ${balance > 0 ? 'text-warning' : 'text-success'}`}>
                    {formatTzs(balance)}
                  </p>
                </div>
              </div>
            </CardBody>
          </Card>

          {/* All bookings */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="size-4" aria-hidden="true" />
                {t('ops.all_bookings')}
              </CardTitle>
            </CardHeader>
            <CardBody>
              {bookings && bookings.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-text-subtle">
                        <th className="pb-2 pr-4 font-medium">{t('ops.col.ticket')}</th>
                        <th className="pb-2 pr-4 font-medium">{t('ops.col.status')}</th>
                        <th className="pb-2 pr-4 font-medium">{t('ops.col.when')}</th>
                        <th className="pb-2 pr-4 font-medium">{t('ops.col.source')}</th>
                        <th className="pb-2 text-right font-medium">{t('ops.col.total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bookings.map((booking) => (
                        <tr key={booking.id} className="border-b border-border/50 last:border-0">
                          <td className="py-3 pr-4">
                            <TicketChip
                              ticketRef={booking.ticket_ref}
                              to={`/ops/tickets/${booking.id}`}
                              size="sm"
                            />
                          </td>
                          <td className="py-3 pr-4">
                            <StatusBadge status={booking.status} />
                          </td>
                          <td className="py-3 pr-4 text-text-subtle">
                            {booking.scheduled_start ? formatDay(booking.scheduled_start, 'en') : '—'}
                          </td>
                          <td className="py-3 pr-4">
                            <SourceChip source={booking.source} />
                          </td>
                          <td className="tabular py-3 text-right font-medium">
                            {formatTzs(booking.total_tzs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <EmptyState
                  icon={<Calendar aria-hidden="true" />}
                  title={t('ops.no_bookings_title')}
                  description={t('ops.no_bookings_body')}
                />
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Merge confirmation */}
      <ConfirmDialog
        open={!!mergeTarget}
        onOpenChange={(open) => !open && setMergeTarget(null)}
        title={t('ops.merge_customers_title')}
        description={t('ops.merge_customers_body', {
          name: mergeTarget?.other_name,
          phone: mergeTarget?.other_phone,
        })}
        confirmLabel={t('ops.merge')}
        destructive
        onConfirm={() => {
          if (mergeTarget) {
            resolveDuplicate.mutate(
              { id: mergeTarget.id, action: 'MERGED' },
              { onSuccess: () => setMergeTarget(null) },
            );
          }
        }}
      />
    </div>
  );
}

export default CustomerProfilePage;
