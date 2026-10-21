import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MessageSquareWarning, Star } from '@/components/ui/icons';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useToast } from '@/components/ui/toast';
import { formatDateTime } from '@/lib/dates';
import { TicketChip } from '@/components/shared/TicketChip';
import { useAddJobEvent } from '../tickets/hooks';
import { useFeedbackList, useUpdateFeedback, type FeedbackRow, type FeedbackStatus } from './hooks';

type Filter = 'OPEN' | 'ALL' | 'COMPLAINT' | 'COMMENT';

const statusTone = {
  OPEN: 'warning',
  ACKNOWLEDGED: 'info',
  RESOLVED: 'success',
  DISMISSED: 'outline',
} as const;

export default function ReviewsPage() {
  const { t } = useTranslation();
  const { data, isLoading, error, refetch } = useFeedbackList();
  const update = useUpdateFeedback();
  const addEvent = useAddJobEvent();
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>('OPEN');
  const [respondId, setRespondId] = useState<string | null>(null);

  const rows = useMemo(() => {
    const all = data ?? [];
    if (filter === 'ALL') return all;
    if (filter === 'OPEN') return all.filter((f) => f.status === 'OPEN' || f.status === 'ACKNOWLEDGED');
    return all.filter((f) => f.kind === filter);
  }, [data, filter]);

  const openCount = (data ?? []).filter((f) => f.status === 'OPEN').length;

  const setStatus = (row: FeedbackRow, status: FeedbackStatus, resp?: string) => {
    void update.mutateAsync({ id: row.id, status, response: resp }).then(() => {
      // Mirror the response into the tracking timeline so the customer sees it.
      if (resp && (status === 'RESOLVED' || status === 'ACKNOWLEDGED')) {
        void addEvent
          .mutateAsync({
            booking_id: row.booking_id,
            kind: 'customer_action',
            customer_visible: true,
            message_key: 'event.feedback_response',
            data: { response: resp },
          })
          .catch(() => undefined);
      }
      toast({ title: t('ops.feedback_updated') });
      void refetch();
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('nav.reviews_complaints')}
        subtitle={t('ops.reviews_subtitle')}
        badges={
          openCount > 0 && (
            <Badge tone="warning">
              <MessageSquareWarning className="size-3" aria-hidden="true" />
              {openCount} {t('ops.open')}
            </Badge>
          )
        }
        actions={
          <div className="flex rounded-lg border border-border">
            {(['OPEN', 'COMPLAINT', 'COMMENT', 'ALL'] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {t(`ops.feedback_filter_${f.toLowerCase()}`)}
              </Button>
            ))}
          </div>
        }
      />

      {isLoading && <Skeleton className="h-96" />}
      {error && <ErrorState onRetry={() => refetch()} />}

      {!isLoading && !error && rows.length === 0 && (
        <EmptyState
          icon={<Star aria-hidden="true" />}
          title={t('ops.no_feedback_title')}
          description={t('ops.no_feedback_body')}
        />
      )}

      {!isLoading && !error && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row) => (
            <Card key={row.id}>
              <CardBody className="space-y-2 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={row.kind === 'COMPLAINT' ? 'error' : 'info'}>
                    {t(`ops.feedback_kind_${row.kind.toLowerCase()}`)}
                  </Badge>
                  <Badge tone={statusTone[row.status]}>
                    {t(`ops.feedback_status_${row.status.toLowerCase()}`)}
                  </Badge>
                  {row.rating != null && (
                    <span className="text-sm text-warning" aria-label={`${row.rating}/5`}>
                      {'★'.repeat(row.rating)}
                      {'☆'.repeat(5 - row.rating)}
                    </span>
                  )}
                  <span className="ml-auto text-xs text-text-subtle">
                    {formatDateTime(row.created_at, 'en')}
                  </span>
                </div>
                <p className="text-sm text-text">{row.body}</p>
                <p className="text-xs text-text-subtle">
                  {row.customer_name ?? ''} ·{' '}
                  {row.ticket_ref && (
                    <TicketChip ticketRef={row.ticket_ref} to={`/ops/tickets/${row.booking_id}`} size="sm" />
                  )}
                </p>
                {row.response && (
                  <p className="rounded-lg bg-surface-muted p-2 text-sm">
                    <span className="font-medium">{t('ops.feedback_response_label')}: </span>
                    {row.response}
                  </p>
                )}
                {(row.status === 'OPEN' || row.status === 'ACKNOWLEDGED') && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {row.status === 'OPEN' && (
                      <Button
                        variant="secondary"
                        size="sm"
                        loading={update.isPending}
                        onClick={() => setStatus(row, 'ACKNOWLEDGED', row.response ?? undefined)}
                      >
                        {t('ops.feedback_acknowledge')}
                      </Button>
                    )}
                    <Button size="sm" loading={update.isPending} onClick={() => setRespondId(row.id)}>
                      {t('ops.feedback_respond')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={update.isPending}
                      onClick={() => setStatus(row, 'DISMISSED')}
                    >
                      {t('ops.dismiss')}
                    </Button>
                  </div>
                )}
              </CardBody>
            </Card>
          ))}
        </div>
      )}

      {/* Respond + resolve dialog (response is required, shown to the customer) */}
      <ConfirmDialog
        open={respondId !== null}
        onOpenChange={(open) => {
          if (!open) setRespondId(null);
        }}
        title={t('ops.feedback_respond_title')}
        description={t('ops.feedback_respond_body')}
        confirmLabel={t('ops.feedback_resolve')}
        reasonLabel={t('ops.feedback_response_label')}
        loading={update.isPending || addEvent.isPending}
        onConfirm={(reason) => {
          const target = (data ?? []).find((f) => f.id === respondId);
          if (target && reason && reason.trim().length >= 2) {
            setStatus(target, 'RESOLVED', reason.trim());
            setRespondId(null);
          }
        }}
      />
    </div>
  );
}
