import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BellRing, CheckCircle2, Clock, Repeat } from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { useToast } from '@/components/ui/toast';
import { formatTzs } from '@/lib/money';
import { formatDateTime } from '@/lib/dates';
import { TicketChip } from '@/components/shared/TicketChip';
import { useInvoices, type InvoiceRow } from '../invoices/hooks';
import { isOutstanding } from '../invoices/utils';
import { useQueueReminders, useQueuedReminders } from './hooks';

export default function RemindersPage() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queue = useQueueReminders();
  const { data: queued, isLoading, error, refetch } = useQueuedReminders();
  const { data: invoices } = useInvoices();
  const [queueing, setQueueing] = useState(false);

  const outstanding = useMemo(
    () => (invoices ?? []).filter((r) => isOutstanding(r.total_tzs, r.paid_tzs, r.status)),
    [invoices],
  );

  const handleQueue = async () => {
    setQueueing(true);
    try {
      const count = await queue.mutateAsync();
      toast({
        title: t('ops.reminders_queued_title'),
        description: t('ops.reminders_queued_body', { count }),
      });
      await refetch();
    } catch (err) {
      toast({ title: t('errors.generic_title'), description: String(err), tone: 'error' });
    } finally {
      setQueueing(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.reminders_recurring')}
        subtitle={t('ops.reminders_subtitle')}
        actions={
          <Button onClick={() => void handleQueue()} loading={queueing || queue.isPending}>
            <BellRing aria-hidden="true" />
            {t('ops.queue_reminders')}
          </Button>
        }
      />

      <div className="grid gap-3 md:grid-cols-3">
        <Card>
          <CardBody>
            <p className="text-caption text-text-subtle">{t('ops.queued_count')}</p>
            <p className="tabular mt-1 text-h2">{(queued ?? []).length}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-caption text-text-subtle">{t('ops.balance_count')}</p>
            <p className="tabular mt-1 text-h2">{outstanding.length}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-caption text-text-subtle">{t('ops.balance_total')}</p>
            <p className="tabular mt-1 text-h2">
              {formatTzs(outstanding.reduce((s, r) => s + (r.total_tzs - r.paid_tzs), 0))}
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="text-h3">{t('ops.queued_title')}</h2>
          {isLoading && <Skeleton className="h-32" />}
          {error && <ErrorState onRetry={() => refetch()} />}
          {!isLoading && !error && (queued ?? []).length === 0 && (
            <EmptyState
              icon={<Clock aria-hidden="true" />}
              title={t('ops.no_reminders_title')}
              description={t('ops.no_reminders_body')}
            />
          )}
          {!isLoading && !error && (queued ?? []).length > 0 && (
            <ul className="space-y-2">
              {(queued ?? []).map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {r.template_key === 'booking_reminder' ? (
                      <BellRing className="size-4 text-primary" aria-hidden="true" />
                    ) : (
                      <Repeat className="size-4 text-warning" aria-hidden="true" />
                    )}
                    <span className="font-medium">{t(`ops.reminder_${r.template_key}`)}</span>
                    {r.ticket_ref && <TicketChip ticketRef={r.ticket_ref} size="sm" />}
                  </div>
                  <span className="text-text-subtle">
                    {formatDateTime(r.scheduled_for, 'en')} · {r.status}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardBody className="space-y-4">
          <h2 className="text-h3">{t('ops.balance_title')}</h2>
          {outstanding.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 aria-hidden="true" />}
              title={t('ops.no_balance_title')}
              description={t('ops.no_balance_body')}
            />
          ) : (
            <ul className="space-y-2">
              {outstanding.map((row: InvoiceRow) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <TicketChip ticketRef={row.ticket_ref} size="sm" />
                    <span>{row.customer_name}</span>
                  </div>
                  <Badge tone={row.total_tzs - row.paid_tzs > 0 ? 'warning' : 'outline'}>
                    {formatTzs(row.total_tzs - row.paid_tzs)}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
