import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, XCircle } from '@/components/ui/icons';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  useAddJobEvent,
  useExceptions,
  useQueueNotification,
  useRescheduleBooking,
  useResolveException,
} from '../tickets/hooks';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { useToast } from '@/components/ui/toast';
import { formatDateTime, formatTime } from '@/lib/dates';
import { useAuth } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { TicketChip } from '@/components/shared/TicketChip';
import type { ExceptionRow } from '../tickets/types';

export function ExceptionsPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'OPEN' | 'RESOLVED' | 'DISMISSED' | 'ALL'>('OPEN');

  const { data: exceptions, isLoading, error, refetch } = useExceptions();
  const resolveException = useResolveException();
  const reschedule = useRescheduleBooking();
  const addEvent = useAddJobEvent();
  const queueNotification = useQueueNotification();
  const { toast } = useToast();
  const { claims } = useAuth();
  const [declineId, setDeclineId] = useState<string | null>(null);

  const filtered = (exceptions ?? []).filter((e) => {
    if (filter === 'ALL') return true;
    return e.status === filter;
  });

  const openCount = (exceptions ?? []).filter((e) => e.status === 'OPEN').length;

  /** Best-effort SMS queue: the timeline event is the real client update; if the
   *  notifications insert policy has not been pushed yet, approval still succeeds. */
  const notifyQuietly = (
    booking_id: string | null,
    customer_id: string | null,
    locale: 'sw' | 'en',
    template_key: string,
    variables: Record<string, unknown>,
  ) => {
    if (!claims.tenant_id) return;
    void queueNotification
      .mutateAsync({
        tenant_id: claims.tenant_id,
        booking_id,
        customer_id,
        channel: 'SMS',
        template_key,
        locale,
        variables,
      })
      .catch((err: unknown) => {
        logger.warn('notification_queue_failed', { template_key, error: String(err) });
      });
  };

  const handleApproveReschedule = (exception: ExceptionRow) => {
    const r = exception.reschedule;
    if (!exception.booking_id || !r) return;
    const start = new Date(r.preferred_start);
    const end = new Date(start.getTime() + (r.duration_min ?? 60) * 60000);
    void reschedule.mutate(
      {
        booking_id: exception.booking_id,
        start: start.toISOString(),
        end: end.toISOString(),
        capacity: 10,
        reason: 'Customer request approved',
      },
      {
        // reschedule_booking resolves the exception and writes the
        // customer-visible "rescheduled" timeline event itself.
        onSuccess: () => {
          notifyQuietly(exception.booking_id, r.customer_id, r.locale, 'reschedule_confirmed', {
            ticket_ref: exception.ticket_ref,
            new_time: start.toISOString(),
          });
          toast({
            title: t('ops.reschedule_approved_title'),
            description: t('ops.reschedule_approved_body'),
          });
          void refetch();
        },
        onError: () => {
          toast({ title: t('errors.generic_title'), tone: 'error' });
        },
      },
    );
  };

  const handleDeclineReschedule = (exception: ExceptionRow, reason: string | undefined) => {
    if (!exception.booking_id) return;
    const r = exception.reschedule;
    void resolveException.mutate(
      { id: exception.id, action: 'DISMISSED' },
      {
        onSuccess: () => {
          // Customer-visible decision in the tracking timeline.
          void addEvent
            .mutateAsync({
              booking_id: exception.booking_id as string,
              kind: 'customer_action',
              customer_visible: true,
              message_key: 'event.reschedule_declined',
              data: reason ? { reason } : {},
            })
            .catch((err: unknown) => {
              logger.warn('decline_event_failed', { error: String(err) });
            });
          notifyQuietly(
            exception.booking_id,
            r?.customer_id ?? null,
            r?.locale ?? 'sw',
            'reschedule_declined',
            {
              ticket_ref: exception.ticket_ref,
              reason: reason ?? '',
            },
          );
          toast({ title: t('ops.reschedule_declined_title') });
          setDeclineId(null);
          void refetch();
        },
        onError: () => {
          toast({ title: t('errors.generic_title'), tone: 'error' });
        },
      },
    );
  };

  return (
    <div>
      <PageHeader
        title={t('nav.exceptions')}
        subtitle={t('ops.exceptions_subtitle')}
        badges={
          openCount > 0 && (
            <Badge tone="warning">
              <AlertTriangle className="size-3" aria-hidden="true" />
              {openCount} {t('ops.open')}
            </Badge>
          )
        }
        actions={
          <div className="flex rounded-lg border border-border">
            {(['OPEN', 'RESOLVED', 'DISMISSED', 'ALL'] as const).map((f) => (
              <Button
                key={f}
                variant={filter === f ? 'primary' : 'ghost'}
                size="sm"
                onClick={() => setFilter(f)}
              >
                {t(`ops.exception_status.${f}`)}
              </Button>
            ))}
          </div>
        }
      />

      {isLoading && <Skeleton className="h-96" />}
      {error && <ErrorState onRetry={() => refetch()} />}

      {!isLoading && !error && (
        <>
          {filtered.length > 0 ? (
            <div className="space-y-3">
              {filtered.map((exception) => (
                <ExceptionCard
                  key={exception.id}
                  exception={exception}
                  busy={reschedule.isPending || resolveException.isPending}
                  onApprove={() => handleApproveReschedule(exception)}
                  onDecline={() => setDeclineId(exception.id)}
                  onResolve={(action) => {
                    void resolveException.mutate(
                      { id: exception.id, action },
                      {
                        onSuccess: () => {
                          void refetch();
                        },
                      },
                    );
                  }}
                  resolving={resolveException.isPending}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<CheckCircle2 aria-hidden="true" />}
              title={t('ops.no_exceptions_title')}
              description={t('ops.no_exceptions_body')}
            />
          )}
        </>
      )}

      {/* Decline dialog: reason is shown to the customer in their timeline */}
      <ConfirmDialog
        open={declineId !== null}
        onOpenChange={(open) => {
          if (!open) setDeclineId(null);
        }}
        title={t('ops.decline_reschedule_title')}
        description={t('ops.decline_reschedule_body')}
        confirmLabel={t('ops.decline_request')}
        reasonLabel={t('ops.decline_reason')}
        loading={resolveException.isPending}
        onConfirm={(reason) => {
          const target = (exceptions ?? []).find((e) => e.id === declineId);
          if (target) handleDeclineReschedule(target, reason);
        }}
      />
    </div>
  );
}

function ExceptionCard({
  exception,
  onResolve,
  resolving,
  busy,
  onApprove,
  onDecline,
}: {
  exception: ExceptionRow;
  onResolve: (action: 'RESOLVED' | 'DISMISSED') => void;
  resolving: boolean;
  busy: boolean;
  onApprove: () => void;
  onDecline: () => void;
}) {
  const { t } = useTranslation();
  const details = exception.details;
  const r = exception.reschedule;
  const preferredDate = r ? new Date(r.preferred_start) : null;
  const preferredLapsed = preferredDate ? preferredDate.getTime() < Date.now() : false;

  const kindIcon = {
    NEEDS_REVIEW: <AlertTriangle className="size-4 text-warning" aria-hidden="true" />,
    SLOT_CONFLICT: <Clock className="size-4 text-error" aria-hidden="true" />,
    RESCHEDULE_REQUESTED: <Clock className="size-4 text-info" aria-hidden="true" />,
    CANCEL_OUTSIDE_POLICY: <XCircle className="size-4 text-error" aria-hidden="true" />,
    PAYMENT_UNKNOWN: <AlertTriangle className="size-4 text-warning" aria-hidden="true" />,
    OUT_OF_AREA: <AlertTriangle className="size-4 text-warning" aria-hidden="true" />,
    POSSIBLE_DUPLICATE: <AlertTriangle className="size-4 text-info" aria-hidden="true" />,
  }[exception.kind] ?? <AlertTriangle className="size-4" aria-hidden="true" />;

  return (
    <Card>
      <CardBody className="p-4">
        <div className="flex items-start gap-3">
          <div className="mt-0.5">{kindIcon}</div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <Badge
                tone={
                  exception.severity === 'high'
                    ? 'error'
                    : exception.severity === 'normal'
                      ? 'warning'
                      : 'outline'
                }
              >
                {exception.kind}
              </Badge>
              <Badge
                tone={
                  exception.status === 'OPEN'
                    ? 'warning'
                    : exception.status === 'RESOLVED'
                      ? 'success'
                      : 'outline'
                }
              >
                {t(`ops.exception_status.${exception.status}`)}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-text">
              {(details.reason as string) || t(`ops.exception_kind.${exception.kind}`)}
            </p>
            {r && preferredDate && (
              <div className="mt-2 space-y-1 rounded-lg bg-surface-muted p-3 text-sm">
                <p>
                  <span className="text-text-subtle">{t('ops.requested_time')}: </span>
                  <span className="font-medium text-text">
                    {formatDateTime(preferredDate, 'en')} ({formatTime(preferredDate, 'en')})
                  </span>
                </p>
                {r.note && (
                  <p>
                    <span className="text-text-subtle">{t('ops.request_note')}: </span>
                    <span className="text-text">{r.note}</span>
                  </p>
                )}
                {r.current_start && (
                  <p>
                    <span className="text-text-subtle">{t('ops.current_schedule')}: </span>
                    <span className="text-text">{formatDateTime(r.current_start, 'en')}</span>
                  </p>
                )}
                {preferredLapsed && <p className="text-warning">{t('ops.preferred_time_passed')}</p>}
              </div>
            )}
            {exception.ticket_ref && (
              <div className="mt-2">
                <TicketChip
                  ticketRef={exception.ticket_ref}
                  to={`/ops/tickets/${exception.booking_id}`}
                  size="sm"
                />
              </div>
            )}
            <p className="mt-2 text-xs text-text-subtle">{formatDateTime(exception.created_at, 'en')}</p>
          </div>
          {exception.status === 'OPEN' && (
            <div className="flex shrink-0 gap-2">
              {r && !preferredLapsed ? (
                <>
                  <Button variant="secondary" size="sm" onClick={onDecline} disabled={busy}>
                    {t('ops.decline_request')}
                  </Button>
                  <Button size="sm" onClick={onApprove} disabled={busy}>
                    <CheckCircle2 aria-hidden="true" />
                    {t('ops.approve_apply')}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => onResolve('DISMISSED')}
                    disabled={resolving}
                  >
                    {t('ops.dismiss')}
                  </Button>
                  <Button size="sm" onClick={() => onResolve('RESOLVED')} disabled={resolving}>
                    <CheckCircle2 aria-hidden="true" />
                    {t('ops.resolve')}
                  </Button>
                </>
              )}
              {r && (
                <Button variant="ghost" size="sm" asChild>
                  <Link to={`/ops/dispatch?booking=${exception.booking_id}`}>{t('nav.dispatch_board')}</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export default ExceptionsPage;
