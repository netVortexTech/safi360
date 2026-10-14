import { useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useExceptions, useResolveException } from '../tickets/hooks';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { formatDateTime } from '@/lib/dates';
import { TicketChip } from '@/components/shared/TicketChip';
import type { ExceptionRow } from '../tickets/types';

export function ExceptionsPage() {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'OPEN' | 'RESOLVED' | 'DISMISSED' | 'ALL'>('OPEN');

  const { data: exceptions, isLoading, error, refetch } = useExceptions();
  const resolveException = useResolveException();

  const filtered = (exceptions ?? []).filter((e) => {
    if (filter === 'ALL') return true;
    return e.status === filter;
  });

  const openCount = (exceptions ?? []).filter((e) => e.status === 'OPEN').length;

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
                  onResolve={(action) => {
                    void resolveException.mutate(
                      { id: exception.id, action },
                      { onSuccess: () => { void refetch(); } },
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
    </div>
  );
}

function ExceptionCard({
  exception,
  onResolve,
  resolving,
}: {
  exception: ExceptionRow;
  onResolve: (action: 'RESOLVED' | 'DISMISSED') => void;
  resolving: boolean;
}) {
  const { t } = useTranslation();
  const details = exception.details;

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
              <Badge tone={
                exception.severity === 'high' ? 'error' :
                exception.severity === 'normal' ? 'warning' : 'outline'
              }>
                {exception.kind}
              </Badge>
              <Badge tone={
                exception.status === 'OPEN' ? 'warning' :
                exception.status === 'RESOLVED' ? 'success' : 'outline'
              }>
                {t(`ops.exception_status.${exception.status}`)}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-text">
              {details.reason as string || t(`ops.exception_kind.${exception.kind}`)}
            </p>
            {exception.ticket_ref && (
              <div className="mt-2">
                <TicketChip ticketRef={exception.ticket_ref} to={`/ops/tickets/${exception.booking_id}`} size="sm" />
              </div>
            )}
            <p className="mt-2 text-xs text-text-subtle">
              {formatDateTime(exception.created_at, 'en')}
            </p>
          </div>
          {exception.status === 'OPEN' && (
            <div className="flex shrink-0 gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onResolve('DISMISSED')}
                disabled={resolving}
              >
                {t('ops.dismiss')}
              </Button>
              <Button
                size="sm"
                onClick={() => onResolve('RESOLVED')}
                disabled={resolving}
              >
                <CheckCircle2 aria-hidden="true" />
                {t('ops.resolve')}
              </Button>
            </div>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

export default ExceptionsPage;
