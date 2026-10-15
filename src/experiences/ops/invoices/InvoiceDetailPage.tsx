import { Link, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Banknote, Printer } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { useCurrentTenant } from '@/lib/tenant';
import { useRecordManualPayment } from '../payments/hooks';
import { ManualPaymentDialog } from '../payments/ManualPaymentDialog';
import { formatTzs } from '@/lib/money';
import { formatDay } from '@/lib/dates';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';
import { TicketChip } from '@/components/shared/TicketChip';
import { PaymentStatus, type PaymentDisplayStatus } from '@/components/shared/PaymentStatus';
import { useInvoice } from './hooks';
import { invoiceState } from './utils';

const stateTone = { paid: 'success', partial: 'warning', unpaid: 'error' } as const;

export default function InvoiceDetailPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { claims } = useAuth();
  const { data: invoice, isLoading, error, refetch } = useInvoice(id ?? '');
  const tenant = useCurrentTenant();
  const recordPayment = useRecordManualPayment();
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const canRecord = can(claims.tenant_role, 'payment.record_manual');

  if (!can(claims.tenant_role, 'payment.view')) {
    return (
      <div className="rounded-xl border border-error/30 bg-error/5 p-6 text-error">
        {t('ops.invoices_no_access')}
      </div>
    );
  }

  if (isLoading || tenant.isLoading) return <Skeleton className="h-96" />;
  if (error || !invoice) return <ErrorState onRetry={() => refetch()} />;

  const state = invoiceState(invoice.total_tzs, invoice.paid_tzs);
  const balance = Math.max(invoice.total_tzs - invoice.paid_tzs, 0);

  return (
    <div className="space-y-6">
      <PageHeader
        className="print:hidden"
        breadcrumbs={[{ label: t('nav.invoices_balances'), to: '/ops/invoices' }]}
        title={
          <span className="flex items-center gap-3">
            {t('ops.invoice_no')} <TicketChip ticketRef={invoice.ticket_ref} size="display" />
            <Badge tone={stateTone[state]}>{t(`ops.invoice_state_${state}`)}</Badge>
          </span>
        }
        subtitle={invoice.customer_name}
        actions={
          <div className="flex gap-2 print:hidden">
            <Button variant="secondary" size="sm" asChild>
              <Link to={`/ops/tickets/${invoice.id}`}>
                <ArrowLeft aria-hidden="true" />
                {t('ops.view_ticket')}
              </Link>
            </Button>
            <Button size="sm" onClick={() => window.print()}>
              <Printer aria-hidden="true" />
              {t('ops.print')}
            </Button>
          </div>
        }
      />

      <Card>
        <CardBody className="space-y-6 p-6 md:p-8">
          {/* Company + invoice meta */}
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-h2">{tenant.data?.name ?? ''}</p>
              <p className="text-sm text-text-subtle">{t('ops.bill_to')}</p>
              <p className="font-medium text-text">{invoice.customer_name}</p>
              <p className="text-sm text-text-subtle">{invoice.customer_phone}</p>
            </div>
            <dl className="space-y-1 text-right text-sm">
              <div className="flex justify-end gap-2">
                <dt className="text-text-subtle">{t('ops.issued')}:</dt>
                <dd className="font-medium">{formatDay(invoice.created_at, 'en')}</dd>
              </div>
              {invoice.scheduled_start && (
                <div className="flex justify-end gap-2">
                  <dt className="text-text-subtle">{t('ops.service_date')}:</dt>
                  <dd className="font-medium">{formatDay(invoice.scheduled_start, 'en')}</dd>
                </div>
              )}
            </dl>
          </div>

          {/* Line items */}
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-text-subtle">
                <th className="pb-2 font-medium">{t('ops.col.service')}</th>
                <th className="pb-2 text-right font-medium">{t('ops.col.qty')}</th>
                <th className="pb-2 text-right font-medium">{t('ops.col.amount')}</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((item, i) => (
                <tr key={i} className="border-b border-border/50 last:border-0">
                  <td className="py-2">{item.label}</td>
                  <td className="tabular py-2 text-right">{item.qty}</td>
                  <td className="tabular py-2 text-right">
                    {item.amount_tzs != null ? formatTzs(item.amount_tzs) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border font-semibold">
                <td className="pt-2" colSpan={2}>
                  {t('ops.total')}
                </td>
                <td className="tabular pt-2 text-right">{formatTzs(invoice.total_tzs)}</td>
              </tr>
              {invoice.deposit_tzs > 0 && (
                <tr className="text-text-muted">
                  <td colSpan={2}>{t('quote.summary.deposit')}</td>
                  <td className="tabular text-right">{formatTzs(invoice.deposit_tzs)}</td>
                </tr>
              )}
            </tfoot>
          </table>

          {/* Payments received */}
          <div>
            <h3 className="mb-2 text-sm font-medium">{t('ops.payments_received')}</h3>
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-text-subtle">{t('ops.no_payments_yet')}</p>
            ) : (
              <ul className="space-y-2">
                {invoice.payments.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <PaymentStatus status={p.status as PaymentDisplayStatus} />
                      <span className="text-text-subtle">{formatDay(p.created_at, 'en')}</span>
                      <span className="text-text-subtle">
                        {p.kind} · {p.provider}
                      </span>
                    </div>
                    <span className="tabular font-medium">{formatTzs(p.amount_tzs)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Balance */}
          <div className="flex items-center justify-between border-t-2 border-border pt-4">
            <p className="text-h3">{t('ops.balance_due')}</p>
            <p className="tabular text-h2">{formatTzs(balance)}</p>
          </div>
          {canRecord && balance > 0 && (
            <div className="print:hidden">
              <Button onClick={() => setShowRecordPayment(true)}>
                <Banknote aria-hidden="true" />
                {t('ops.record_payment')}
              </Button>
            </div>
          )}
        </CardBody>
      </Card>

      {showRecordPayment && (
        <ManualPaymentDialog
          busy={recordPayment.isPending}
          error={recordPayment.error ? String(recordPayment.error) : null}
          bookingId={invoice.id}
          bookingLabel={invoice.ticket_ref}
          suggestedAmount={balance}
          onClose={() => setShowRecordPayment(false)}
          onSubmit={(vars) => {
            void recordPayment.mutateAsync(vars).then(() => {
              setShowRecordPayment(false);
              void refetch();
            });
          }}
        />
      )}
    </div>
  );
}
