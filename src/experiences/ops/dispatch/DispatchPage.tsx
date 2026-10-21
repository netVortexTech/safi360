import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  MapPin,
  RefreshCw,
  UserCheck,
  Users,
  Wifi,
  WifiOff,
} from '@/components/ui/icons';
import { useTranslation } from 'react-i18next';
import {
  useAssignmentCandidates,
  useCancelAssignment,
  useCreateAssignment,
  useDispatchItems,
  useTransitionBooking,
} from '../tickets/hooks';
import { PageHeader } from '@/components/shared/PageHeader';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { formatTime, dayKey } from '@/lib/dates';
import { cn } from '@/lib/utils';
import { TicketChip } from '@/components/shared/TicketChip';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { supabase } from '@/lib/supabase';
import type { DispatchItem } from '../tickets/types';

export function DispatchPage() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const preselectedBooking = searchParams.get('booking');
  const [selectedDate, setSelectedDate] = useState(dayKey(new Date()));
  const [selectedBooking, setSelectedBooking] = useState<string | null>(preselectedBooking);
  const [realtimeStatus, setRealtimeStatus] = useState<'connected' | 'disconnected'>('connected');

  const { data: items, isLoading, error, refetch } = useDispatchItems(selectedDate);

  // Realtime subscription
  useEffect(() => {
    const channel = supabase
      .channel('dispatch-bookings')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'bookings' }, () => {
        void refetch();
      })
      .subscribe((status: string) => {
        if (status === 'SUBSCRIBED') setRealtimeStatus('connected');
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') setRealtimeStatus('disconnected');
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refetch]);

  const selectedItem = useMemo(
    () => items?.find((i) => i.booking_id === selectedBooking) ?? null,
    [items, selectedBooking],
  );

  return (
    <div>
      <PageHeader
        title={t('nav.dispatch_board')}
        subtitle={t('ops.dispatch_subtitle')}
        badges={
          <Badge tone={realtimeStatus === 'connected' ? 'success' : 'warning'}>
            {realtimeStatus === 'connected' ? (
              <Wifi className="size-3" aria-hidden="true" />
            ) : (
              <WifiOff className="size-3" aria-hidden="true" />
            )}
            {realtimeStatus === 'connected' ? t('ops.realtime_connected') : t('ops.realtime_disconnected')}
          </Badge>
        }
        actions={
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="rounded-lg border border-border px-3 py-2 text-sm"
              aria-label={t('ops.select_date')}
            />
            <Button variant="secondary" size="sm" onClick={() => refetch()}>
              <RefreshCw className="size-4" aria-hidden="true" />
            </Button>
          </div>
        }
      />

      {/* Stale connection warning */}
      {realtimeStatus === 'disconnected' && (
        <div
          className="mb-4 flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/5 p-3 text-sm"
          role="alert"
        >
          <AlertTriangle className="size-4 text-warning" aria-hidden="true" />
          <p className="text-text">{t('ops.realtime_stale_warning')}</p>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Dispatch items */}
        <div className="lg:col-span-2">
          {isLoading && <Skeleton className="h-96" />}
          {error && <ErrorState onRetry={() => refetch()} />}
          {!isLoading && !error && (
            <>
              {items && items.length > 0 ? (
                <div className="space-y-3">
                  {items.map((item) => (
                    <DispatchCard
                      key={item.booking_id}
                      item={item}
                      selected={selectedBooking === item.booking_id}
                      onSelect={() => setSelectedBooking(item.booking_id)}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  icon={<Calendar aria-hidden="true" />}
                  title={t('ops.no_dispatch_title')}
                  description={t('ops.no_dispatch_body')}
                />
              )}
            </>
          )}
        </div>

        {/* Assignment drawer */}
        <div>
          {selectedItem ? (
            <AssignmentDrawer item={selectedItem} onClose={() => setSelectedBooking(null)} />
          ) : (
            <Card>
              <CardBody className="py-12 text-center text-text-subtle">
                <Users className="mx-auto mb-2 size-8" aria-hidden="true" />
                <p className="text-sm">{t('ops.select_booking_hint')}</p>
              </CardBody>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

function DispatchCard({
  item,
  selected,
  onSelect,
}: {
  item: DispatchItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const address = item.address_snapshot;
  const area = typeof address.area === 'string' ? address.area : null;

  return (
    <Card
      className={cn('cursor-pointer transition-all', selected && 'ring-2 ring-primary')}
      onClick={onSelect}
    >
      <CardBody className="p-4">
        <div className="flex items-start justify-between">
          <div>
            <TicketChip ticketRef={item.ticket_ref} size="sm" />
            <p className="mt-1 font-medium text-text">{item.customer_name}</p>
          </div>
          <StatusBadge status={item.status} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-subtle">
          <span className="flex items-center gap-1">
            <Clock className="size-3" aria-hidden="true" />
            {formatTime(item.scheduled_start, 'en')} – {formatTime(item.scheduled_end, 'en')}
          </span>
          {area && (
            <span className="flex items-center gap-1">
              <MapPin className="size-3" aria-hidden="true" />
              {area}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Users className="size-3" aria-hidden="true" />
            {item.assignee_ids.length > 0
              ? `${item.assignee_ids.length}/${item.crew_size}`
              : t('ops.unassigned')}
          </span>
        </div>
      </CardBody>
    </Card>
  );
}

function AssignmentDrawer({ item, onClose }: { item: DispatchItem; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [selectedStaff, setSelectedStaff] = useState<string | null>(null);

  const { data: candidates, isLoading } = useAssignmentCandidates(
    item.booking_id,
    item.scheduled_start,
    item.scheduled_end,
    item.crew_size,
  );

  const createAssignment = useCreateAssignment();
  const cancelAssignment = useCancelAssignment();
  const transition = useTransitionBooking();

  const handleAssign = () => {
    if (!selectedStaff) return;
    void createAssignment.mutate(
      {
        booking_id: item.booking_id,
        staff_id: selectedStaff,
        starts_at: item.scheduled_start,
        ends_at: item.scheduled_end,
        is_lead: item.assignee_ids.length === 0,
      },
      {
        onSuccess: () => {
          toast({ title: t('ops.toast_assigned') });
          setSelectedStaff(null);
        },
      },
    );
  };

  const handleTransition = (to: 'ASSIGNED' | 'EN_ROUTE' | 'ARRIVED' | 'IN_PROGRESS' | 'COMPLETED') => {
    void transition.mutate(
      { booking_id: item.booking_id, to },
      { onSuccess: () => toast({ title: t('ops.toast_status_updated') }) },
    );
  };

  return (
    <Card className="sticky top-4">
      <CardHeader>
        <CardTitle>{t('ops.assign_cleaner')}</CardTitle>
      </CardHeader>
      <CardBody className="space-y-4">
        {/* Booking info */}
        <div className="rounded-lg bg-surface-muted p-3 text-sm">
          <TicketChip ticketRef={item.ticket_ref} size="sm" />
          <p className="mt-1 font-medium">{item.customer_name}</p>
          <p className="text-text-subtle">
            {formatTime(item.scheduled_start, 'en')} – {formatTime(item.scheduled_end, 'en')}
          </p>
        </div>

        {/* Current assignments */}
        {item.assignees.length > 0 && (
          <div>
            <h4 className="mb-2 text-sm font-medium">{t('ops.current_assignments')}</h4>
            <ul className="space-y-1">
              {item.assignees.map((assignee) => (
                <li
                  key={assignee.assignment_id}
                  className="flex items-center justify-between rounded-lg border border-border p-2 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <UserCheck className="size-4 text-success" aria-hidden="true" />
                    {assignee.name}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={cancelAssignment.isPending}
                    onClick={() =>
                      cancelAssignment.mutate(assignee.assignment_id, {
                        onSuccess: () => toast({ title: t('ops.toast_assignment_removed') }),
                      })
                    }
                  >
                    {t('common.remove')}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Candidates */}
        <div>
          <h4 className="mb-2 text-sm font-medium">{t('ops.available_cleaners')}</h4>
          {isLoading && <Skeleton className="h-20" />}
          {!isLoading && candidates && (
            <ul className="space-y-2">
              {candidates.map((c) => (
                <li key={c.staff_id}>
                  <button
                    type="button"
                    disabled={!c.available}
                    onClick={() => setSelectedStaff(c.staff_id)}
                    className={cn(
                      'w-full rounded-lg border p-3 text-left text-sm transition-colors',
                      c.available
                        ? selectedStaff === c.staff_id
                          ? 'border-primary bg-primary/5'
                          : 'border-border hover:bg-surface-muted'
                        : 'cursor-not-allowed border-border bg-surface-muted opacity-60',
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-text">{c.name}</span>
                      {c.available ? (
                        <Badge tone="success">
                          <CheckCircle2 className="size-3" aria-hidden="true" />
                          {t('ops.available')}
                        </Badge>
                      ) : (
                        <Badge tone="warning">
                          <AlertTriangle className="size-3" aria-hidden="true" />
                          {t('ops.busy')}
                        </Badge>
                      )}
                    </div>
                    {c.conflict_reason && <p className="mt-1 text-xs text-warning">{c.conflict_reason}</p>}
                    <p className="mt-1 text-xs text-text-subtle">
                      {t('ops.current_load')}: {c.current_load}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 border-t border-border pt-4">
          <Button
            onClick={handleAssign}
            disabled={!selectedStaff}
            loading={createAssignment.isPending}
            className="flex-1"
          >
            {t('ops.assign')}
          </Button>
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>

        {/* Quick transitions */}
        {item.status === 'CONFIRMED' && (
          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            onClick={() => handleTransition('ASSIGNED')}
            loading={transition.isPending}
          >
            {t('ops.mark_assigned')}
          </Button>
        )}
      </CardBody>
    </Card>
  );
}

export default DispatchPage;
