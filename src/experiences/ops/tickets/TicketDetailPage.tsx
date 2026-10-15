import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  Banknote,
  Calendar,
  Camera,
  CheckCircle2,
  Copy,
  Flag,
  Repeat,
  MapPin,
  MessageSquare,
  Navigation,
  RotateCcw,
  Send,
  Share2,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  useAddNote,
  useBookingAudit,
  useBookingPayments,
  useBookingQuotes,
  useJobEvents,
  useRescheduleBooking,
  useTicket,
  useTransitionBooking,
} from './hooks';
import { useRecordManualPayment } from '../payments/hooks';
import { ManualPaymentDialog } from '../payments/ManualPaymentDialog';
import { StatusBadge, FlagBadge } from '@/components/shared/StatusBadge';
import { TicketChip } from '@/components/shared/TicketChip';
import { PaymentStatus } from '@/components/shared/PaymentStatus';
import { PageHeader } from '@/components/shared/PageHeader';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ErrorState } from '@/components/shared/ErrorState';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Field } from '@/components/shared/Field';
import { formatDay, formatDateTime, formatTime, dayKey, nowInDar, buildConfirmSchedule } from '@/lib/dates';
import { formatTzs } from '@/lib/money';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';
import type { AuditLogRow, BookingFlag, JobEventRow } from './types';
import type { BookingStatus } from '@shared/enums';

interface TicketCustomer {
  name: string;
  phone_e164: string;
  email: string | null;
  locale: string;
}

interface TicketItem {
  label_en: string;
  label_sw: string;
  qty: number;
  amount_tzs: number | null;
  requires_review: boolean;
}

interface TicketAssignment {
  staff: { display_name: string } | null;
  is_lead: boolean;
  cancelled_at: string | null;
}

interface TicketAddress {
  label?: string | null;
  area?: string | null;
  street?: string | null;
  landmark?: string | null;
  lat?: number | null;
  lng?: number | null;
}

interface TicketDetail {
  id: string;
  ticket_ref: string;
  status: BookingStatus;
  flags: BookingFlag[];
  total_tzs: number;
  deposit_tzs: number;
  paid_tzs: number;
  duration_min: number;
  scheduled_start: string | null;
  scheduled_end: string | null;
  notes_customer: string | null;
  notes_internal: string | null;
  address_snapshot: TicketAddress;
  customer: TicketCustomer;
  items: TicketItem[] | null;
  assignments: TicketAssignment[] | null;
}

type Tab = 'timeline' | 'audit';

export function TicketDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { claims } = useAuth();
  const role = claims.tenant_role;
  const [tab, setTab] = useState<Tab>('timeline');
  const [showReschedule, setShowReschedule] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCancel, setShowCancel] = useState(false);
  const [showNoShow, setShowNoShow] = useState(false);
  const [showFlagReview, setShowFlagReview] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [showRecordPayment, setShowRecordPayment] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteVisible, setNoteVisible] = useState(false);

  const { data: rawTicket, isLoading, error, refetch } = useTicket(id ?? '');
  const { data: events } = useJobEvents(id ?? '');
  const completionEvidence = useQuery({
    queryKey: ['ops', 'ticket-evidence', id ?? ''],
    enabled: !!id && rawTicket?.status === 'COMPLETED',
    queryFn: async () => {
      const beforePaths = (events ?? []).flatMap((e) =>
        Array.isArray((e.data ?? {}).evidence_before)
          ? ((e.data ?? {}) as { evidence_before: string[] }).evidence_before
          : [],
      );
      const afterPaths = (events ?? []).flatMap((e) =>
        Array.isArray((e.data ?? {}).evidence_after)
          ? ((e.data ?? {}) as { evidence_after: string[] }).evidence_after
          : [],
      );
      const storage = supabase.storage.from('job-evidence');
      const before = (
        await Promise.all(
          beforePaths.map(async (path) => {
            const { data } = await storage.createSignedUrl(path, 3600);
            return data?.signedUrl ? { path, url: data.signedUrl } : null;
          }),
        )
      ).filter((item): item is { path: string; url: string } => !!item?.url);
      const after = (
        await Promise.all(
          afterPaths.map(async (path) => {
            const { data } = await storage.createSignedUrl(path, 3600);
            return data?.signedUrl ? { path, url: data.signedUrl } : null;
          }),
        )
      ).filter((item): item is { path: string; url: string } => !!item?.url);
      return { before, after };
    },
  });
  const { data: payments, refetch: refetchPayments } = useBookingPayments(id ?? '');
  const { data: quotes } = useBookingQuotes(id ?? '');
  const { data: auditLogs } = useBookingAudit(id ?? '');
  const notifications = useQuery<Record<string, unknown>[]>({
    queryKey: ['ops', 'ticket-notifications', id ?? ''],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select(
          'id, channel, template_key, status, scheduled_for, sent_at, delivered_at, read_at, failed_at, last_error, variables, created_at',
        )
        .eq('booking_id', id ?? '')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  const transition = useTransitionBooking();
  const reschedule = useRescheduleBooking();
  const addNote = useAddNote();
  const recordPayment = useRecordManualPayment();

  if (isLoading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-12 w-96" />
        <Skeleton className="h-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !rawTicket) {
    return (
      <ErrorState
        title={t('errors.generic_title')}
        description={t('errors.generic_body')}
        onRetry={() => {
          void refetch();
        }}
      />
    );
  }

  const ticket = rawTicket as unknown as TicketDetail;
  const customer = ticket.customer;
  const items = ticket.items ?? [];
  const assignments = (ticket.assignments ?? []).filter((a) => a.cancelled_at == null);
  const address = ticket.address_snapshot;

  const canManage = can(role, 'booking.cancel');
  const canAssign = can(role, 'booking.assign');
  const canReview = can(role, 'booking.review');
  const canSeeBilling = can(role, 'payment.view');
  const canRecordPayment = can(role, 'payment.record_manual');

  const primaryAction = getPrimaryAction(ticket.status, canManage, canReview, t);

  const handleCopyTicket = () => {
    void navigator.clipboard.writeText(ticket.ticket_ref);
  };

  const handleShare = () => {
    const url = `${window.location.origin}/track/${ticket.id}`;
    if (navigator.share) {
      void navigator.share({ title: ticket.ticket_ref, url });
    } else {
      void navigator.clipboard.writeText(url);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        breadcrumbs={[{ label: t('nav.tickets'), to: '/ops/tickets' }]}
        title={
          <span className="flex items-center gap-3">
            <TicketChip ticketRef={ticket.ticket_ref} size="display" />
            {ticket.flags.map((f) => (
              <FlagBadge key={f} flag={f} />
            ))}
          </span>
        }
        subtitle={customer.name}
        badges={<StatusBadge status={ticket.status} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleCopyTicket}>
              <Copy aria-hidden="true" />
              {t('common.copy')}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleShare}>
              <Share2 aria-hidden="true" />
              {t('common.share')}
            </Button>
            {primaryAction && (
              <Button
                size="sm"
                variant={primaryAction.variant}
                onClick={() => {
                  if (primaryAction.action === 'reschedule') setShowReschedule(true);
                  if (primaryAction.action === 'confirm') setShowConfirm(true);
                  if (primaryAction.action === 'cancel') setShowCancel(true);
                }}
              >
                {primaryAction.icon}
                {primaryAction.label}
              </Button>
            )}
            <Button variant="secondary" size="sm" asChild>
              <Link to={`/ops/bookings/new?repeat=${ticket.id}`}>
                <Repeat aria-hidden="true" />
                {t('ops.repeat_booking')}
              </Link>
            </Button>
          </div>
        }
      />

      {/* Status-based action bar */}
      {canManage && ['CONFIRMED', 'ASSIGNED'].includes(ticket.status) && (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => setShowNoShow(true)}>
            <XCircle aria-hidden="true" />
            {t('ops.mark_no_show')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowFlagReview(true)}>
            <Flag aria-hidden="true" />
            {t('ops.flag_needs_review')}
          </Button>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left column: Items, Quote, Location, Schedule */}
        <div className="space-y-6 lg:col-span-2">
          {/* Items & Price */}
          <Card>
            <CardHeader>
              <CardTitle>{t('ops.items_price')}</CardTitle>
            </CardHeader>
            <CardBody>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-text-subtle">
                    <th className="pb-2 font-medium">{t('ops.col.service')}</th>
                    <th className="pb-2 text-right font-medium">{t('ops.col.qty')}</th>
                    <th className="pb-2 text-right font-medium">{t('ops.col.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-border/50 last:border-0">
                      <td className="py-2">
                        {item.label_en || item.label_sw}
                        {item.requires_review && (
                          <Badge tone="warning" className="ml-2">
                            <AlertTriangle className="size-3" aria-hidden="true" />
                            {t('ops.on_review')}
                          </Badge>
                        )}
                      </td>
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
                      {t('quote.summary.total')}
                    </td>
                    <td className="tabular pt-2 text-right">{formatTzs(ticket.total_tzs)}</td>
                  </tr>
                  {ticket.deposit_tzs > 0 && (
                    <>
                      <tr className="text-text-muted">
                        <td colSpan={2}>{t('quote.summary.deposit')}</td>
                        <td className="tabular text-right">{formatTzs(ticket.deposit_tzs)}</td>
                      </tr>
                      <tr className="text-text-muted">
                        <td colSpan={2}>{t('quote.summary.balance')}</td>
                        <td className="tabular text-right">
                          {formatTzs(ticket.total_tzs - ticket.deposit_tzs)}
                        </td>
                      </tr>
                    </>
                  )}
                </tfoot>
              </table>

              {/* Quotes */}
              {quotes && quotes.length > 0 && (
                <div className="mt-4 border-t border-border pt-4">
                  <h4 className="mb-2 text-sm font-medium text-text">{t('ops.quotes')}</h4>
                  <ul className="space-y-2">
                    {quotes.map((q, i) => (
                      <li
                        key={q.id}
                        className="flex items-center justify-between rounded-lg bg-surface-muted px-3 py-2 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <Badge tone="outline">#{quotes.length - i}</Badge>
                          <span className="text-text-subtle">{formatDay(q.created_at, 'en')}</span>
                          {q.revised_from_id && <Badge tone="info">{t('ops.revised_quote')}</Badge>}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="tabular font-medium">{formatTzs(q.total_tzs)}</span>
                          <Badge
                            tone={
                              q.status === 'APPROVED'
                                ? 'success'
                                : q.status === 'REJECTED'
                                  ? 'error'
                                  : 'outline'
                            }
                          >
                            {q.status}
                          </Badge>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardBody>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="size-4" aria-hidden="true" />
                {t('ops.location')}
              </CardTitle>
            </CardHeader>
            <CardBody>
              {address && Object.keys(address).length > 0 ? (
                <dl className="space-y-2 text-sm">
                  {address.label && (
                    <div className="flex justify-between">
                      <dt className="text-text-subtle">{t('ops.address_label_field')}</dt>
                      <dd className="font-medium">{address.label}</dd>
                    </div>
                  )}
                  {address.area && (
                    <div className="flex justify-between">
                      <dt className="text-text-subtle">{t('ops.area')}</dt>
                      <dd className="font-medium">{address.area}</dd>
                    </div>
                  )}
                  {address.street && (
                    <div className="flex justify-between">
                      <dt className="text-text-subtle">{t('ops.street')}</dt>
                      <dd className="font-medium">{address.street}</dd>
                    </div>
                  )}
                  {address.landmark && (
                    <div className="flex justify-between">
                      <dt className="text-text-subtle">{t('ops.landmark')}</dt>
                      <dd className="font-medium">{address.landmark}</dd>
                    </div>
                  )}
                  {address.lat != null && address.lng != null && (
                    <a
                      href={`https://maps.google.com/?q=${address.lat},${address.lng}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-sm text-primary hover:underline"
                    >
                      <Navigation className="size-3" aria-hidden="true" />
                      {t('ops.open_in_maps')}
                    </a>
                  )}
                </dl>
              ) : (
                <p className="text-sm text-text-subtle">{t('ops.no_address')}</p>
              )}
            </CardBody>
          </Card>

          {/* Schedule & Crew */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="size-4" aria-hidden="true" />
                {t('ops.schedule_crew')}
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <p className="text-caption text-text-subtle">{t('ops.scheduled')}</p>
                  {ticket.scheduled_start ? (
                    <div className="mt-1">
                      <p className="font-medium text-text">{formatDay(ticket.scheduled_start, 'en')}</p>
                      <p className="text-sm text-text-subtle">
                        {formatTime(ticket.scheduled_start, 'en')} –{' '}
                        {ticket.scheduled_end ? formatTime(ticket.scheduled_end, 'en') : '…'}
                      </p>
                    </div>
                  ) : (
                    <p className="mt-1 text-text-subtle">—</p>
                  )}
                </div>
                <div>
                  <p className="text-caption text-text-subtle">{t('ops.crew')}</p>
                  {assignments.length > 0 ? (
                    <ul className="mt-1 space-y-1">
                      {assignments.map((a, i) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <UserCheck className="size-4 text-primary" aria-hidden="true" />
                          <span className="font-medium">{a.staff?.display_name ?? t('ops.unassigned')}</span>
                          {a.is_lead && <Badge tone="primary">{t('ops.team_lead')}</Badge>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-text-subtle">{t('ops.unassigned')}</p>
                  )}
                </div>
              </div>

              {canAssign && (
                <Button variant="secondary" size="sm" className="mt-4" asChild>
                  <Link to={`/ops/dispatch?booking=${ticket.id}`}>
                    <Users aria-hidden="true" />
                    {t('ops.assign_cleaner')}
                  </Link>
                </Button>
              )}
            </CardBody>
          </Card>

          {/* Payments Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="size-4" aria-hidden="true" />
                {t('ops.payments')}
              </CardTitle>
            </CardHeader>
            <CardBody>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-caption text-text-subtle">{t('ops.total')}</p>
                  <p className="tabular mt-1 text-h3">{formatTzs(ticket.total_tzs)}</p>
                </div>
                <div>
                  <p className="text-caption text-text-subtle">{t('ops.paid')}</p>
                  <p className="tabular mt-1 text-h3 text-success">{formatTzs(ticket.paid_tzs)}</p>
                </div>
                <div>
                  <p className="text-caption text-text-subtle">{t('ops.balance')}</p>
                  <p className="tabular mt-1 text-h3 text-warning">
                    {formatTzs(Math.max(ticket.total_tzs - ticket.paid_tzs, 0))}
                  </p>
                </div>
              </div>
              {canSeeBilling && payments && payments.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-border pt-4">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <PaymentStatus status={p.status} />
                        <span className="text-text-subtle">{formatDay(p.created_at, 'en')}</span>
                      </div>
                      <span className="tabular font-medium">{formatTzs(p.amount_tzs)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {canRecordPayment && ticket.total_tzs - ticket.paid_tzs > 0 && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  onClick={() => setShowRecordPayment(true)}
                >
                  <Banknote aria-hidden="true" />
                  {t('ops.record_payment')}
                </Button>
              )}
            </CardBody>
          </Card>

          {/* Evidence placeholder */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Camera className="size-4" aria-hidden="true" />
                {t('ops.evidence')}
              </CardTitle>
            </CardHeader>
            <CardBody>
              {ticket.status === 'COMPLETED' && completionEvidence.data ? (
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    {[
                      { label: 'Before', images: completionEvidence.data.before },
                      { label: 'After', images: completionEvidence.data.after },
                    ].map((group) => (
                      <section key={group.label} className="space-y-2">
                        <h3 className="text-sm font-semibold">{group.label} photos</h3>
                        <div className="grid grid-cols-2 gap-2">
                          {group.images.map((image) => (
                            <a key={image.path} href={image.url} target="_blank" rel="noreferrer">
                              <img
                                src={image.url}
                                alt={`${group.label} evidence`}
                                className="aspect-square rounded-lg object-cover"
                              />
                            </a>
                          ))}
                        </div>
                        {!group.images.length ? (
                          <p className="text-sm text-text-subtle">No photos uploaded.</p>
                        ) : null}
                      </section>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {ticket.total_tzs - ticket.paid_tzs > 0 && (
                      <p className="w-full text-sm text-warning">
                        {t('ops.close_out_hint', {
                          amount: formatTzs(ticket.total_tzs - ticket.paid_tzs),
                        })}
                      </p>
                    )}
                    <Button
                      loading={transition.isPending}
                      onClick={() =>
                        void transition.mutate(
                          { booking_id: ticket.id, to: 'CLOSED', reason: 'Completion approved by office' },
                          {
                            onSuccess: () => {
                              void refetch();
                            },
                          },
                        )
                      }
                    >
                      Approve and close
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        void import('@/lib/supabase').then(({ supabase }) => {
                          void supabase
                            .rpc('open_exception', {
                              p_booking_id: ticket.id,
                              p_kind: 'NEEDS_REVIEW',
                              p_details: { source: 'completion_review' },
                              p_severity: 'normal',
                            })
                            .then(() => refetch());
                        });
                      }}
                    >
                      Flag needs review
                    </Button>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-text-subtle">{t('ops.evidence_placeholder')}</p>
              )}
            </CardBody>
          </Card>

          {/* Notifications placeholder */}
          {ticket.status === 'COMPLETED' || ticket.status === 'CONFIRMED' ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="size-4" aria-hidden="true" />
                  {t('ops.notifications')}
                </CardTitle>
              </CardHeader>
              <CardBody>
                {notifications.isLoading ? (
                  <p className="text-sm text-text-muted">Loading notifications...</p>
                ) : null}
                {(notifications.data ?? []).length ? (
                  <ul className="space-y-2">
                    {(notifications.data ?? []).map((row: Record<string, unknown>) => (
                      <li
                        key={String(row.id)}
                        className="flex items-center justify-between rounded-lg border border-border p-3 text-sm"
                      >
                        <div>
                          <p className="font-medium">{String(row.template_key)}</p>
                          <p className="text-xs text-text-subtle">
                            {String(row.channel)} · {String(row.status)}
                          </p>
                        </div>
                        {String(row.status) !== 'sent' &&
                        String(row.status) !== 'delivered' &&
                        String(row.status) !== 'read' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => {
                              void supabase
                                .from('notifications')
                                .update({ status: 'queued', failed_at: null, last_error: null })
                                .eq('id', String(row.id))
                                .then(() => notifications.refetch());
                            }}
                          >
                            Resend
                          </Button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-text-subtle">{t('ops.notifications_placeholder')}</p>
                )}
              </CardBody>
            </Card>
          ) : null}
        </div>

        {/* Right column: Timeline + Audit */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex gap-1">
                <Button
                  variant={tab === 'timeline' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setTab('timeline')}
                >
                  {t('ops.timeline')}
                </Button>
                <Button
                  variant={tab === 'audit' ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setTab('audit')}
                >
                  {t('ops.audit_trail')}
                </Button>
              </div>
            </CardHeader>
            <CardBody>
              {tab === 'timeline' ? (
                <Timeline events={events ?? []} customerVisibleOnly={false} />
              ) : (
                <AuditTrail logs={auditLogs ?? []} />
              )}
            </CardBody>
          </Card>

          {/* Notes */}
          <Card>
            <CardHeader>
              <CardTitle>{t('ops.notes')}</CardTitle>
            </CardHeader>
            <CardBody>
              {ticket.notes_internal && (
                <div className="mb-3 rounded-lg bg-surface-muted p-3 text-sm">
                  <p className="text-text">{ticket.notes_internal}</p>
                  <p className="mt-1 text-xs text-text-subtle">{t('ops.internal_note')}</p>
                </div>
              )}
              {ticket.notes_customer && (
                <div className="mb-3 rounded-lg border border-border p-3 text-sm">
                  <p className="text-text">{ticket.notes_customer}</p>
                  <p className="mt-1 text-xs text-text-subtle">{t('ops.customer_note')}</p>
                </div>
              )}
              <Button variant="secondary" size="sm" onClick={() => setShowNote(true)}>
                <MessageSquare aria-hidden="true" />
                {t('ops.add_note')}
              </Button>
            </CardBody>
          </Card>
        </div>
      </div>

      {/* Reschedule Dialog */}
      {showReschedule && (
        <RescheduleDialog
          onOpenChange={setShowReschedule}
          scheduledStart={ticket.scheduled_start}
          durationMin={ticket.duration_min}
          onReschedule={(start, end, reason) => {
            reschedule.mutate(
              {
                booking_id: ticket.id,
                start,
                end,
                capacity: 10,
                reason,
              },
              {
                onSuccess: () => {
                  setShowReschedule(false);
                  void refetch();
                },
              },
            );
          }}
          loading={reschedule.isPending}
        />
      )}

      {/* Confirm Dialog (review queue: schedule + confirm in one step) */}
      {showConfirm && (
        <ConfirmBookingDialog
          onOpenChange={setShowConfirm}
          durationMin={ticket.duration_min}
          onConfirm={(start, end) => {
            reschedule.mutate(
              {
                booking_id: ticket.id,
                start,
                end,
                capacity: 10,
                reason: 'Confirmed from review',
              },
              {
                onSuccess: () => {
                  transition.mutate(
                    { booking_id: ticket.id, to: 'CONFIRMED' },
                    {
                      onSuccess: () => {
                        setShowConfirm(false);
                        void refetch();
                      },
                    },
                  );
                },
              },
            );
          }}
          loading={reschedule.isPending || transition.isPending}
        />
      )}

      {/* Record payment dialog (booking preset, balance prefilled) */}
      {showRecordPayment && (
        <ManualPaymentDialog
          busy={recordPayment.isPending}
          error={recordPayment.error ? String(recordPayment.error) : null}
          bookingId={ticket.id}
          bookingLabel={ticket.ticket_ref}
          suggestedAmount={Math.max(ticket.total_tzs - ticket.paid_tzs, 0)}
          onClose={() => setShowRecordPayment(false)}
          onSubmit={(vars) => {
            void recordPayment.mutateAsync(vars).then(() => {
              setShowRecordPayment(false);
              void refetch();
              void refetchPayments();
            });
          }}
        />
      )}

      {/* Cancel Dialog */}
      <ConfirmDialog
        open={showCancel}
        onOpenChange={setShowCancel}
        title={t('ops.cancel_booking_title')}
        description={t('ops.cancel_booking_body')}
        confirmLabel={t('ops.cancel_booking')}
        destructive
        reasonLabel={t('ops.cancel_reason')}
        loading={transition.isPending}
        onConfirm={(reason) => {
          transition.mutate(
            { booking_id: ticket.id, to: 'CANCELLED', reason },
            {
              onSuccess: () => {
                setShowCancel(false);
                void refetch();
              },
            },
          );
        }}
      />

      {/* No-show Dialog */}
      <ConfirmDialog
        open={showNoShow}
        onOpenChange={setShowNoShow}
        title={t('ops.no_show_title')}
        description={t('ops.no_show_body')}
        confirmLabel={t('ops.mark_no_show')}
        destructive
        reasonLabel={t('ops.no_show_reason')}
        loading={transition.isPending}
        onConfirm={(reason) => {
          transition.mutate(
            { booking_id: ticket.id, to: 'NO_SHOW', reason },
            {
              onSuccess: () => {
                setShowNoShow(false);
                void refetch();
              },
            },
          );
        }}
      />

      {/* Flag needs review dialog */}
      {showFlagReview && (
        <FlagReviewDialog
          onOpenChange={setShowFlagReview}
          onConfirm={(reason) => {
            // Use open_exception via RPC
            void import('@/lib/supabase').then(({ supabase }) => {
              void supabase
                .rpc('open_exception', {
                  p_booking_id: ticket.id,
                  p_kind: 'NEEDS_REVIEW',
                  p_details: { reason, source: 'manual_flag' },
                  p_severity: 'normal',
                })
                .then(() => {
                  setShowFlagReview(false);
                  void refetch();
                });
            });
          }}
        />
      )}

      {/* Add note dialog */}
      {showNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>{t('ops.add_note')}</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4">
              <Textarea
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder={t('ops.note_placeholder')}
                rows={4}
              />
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={noteVisible}
                  onChange={(e) => setNoteVisible(e.target.checked)}
                  className="size-4"
                />
                {t('ops.customer_visible')}
              </label>
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setShowNote(false)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={() => {
                    addNote.mutate(
                      { booking_id: ticket.id, note: noteText, customer_visible: noteVisible },
                      {
                        onSuccess: () => {
                          setShowNote(false);
                          setNoteText('');
                        },
                      },
                    );
                  }}
                  loading={addNote.isPending}
                >
                  {t('common.save')}
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helper components
// ---------------------------------------------------------------------------

function getPrimaryAction(
  status: BookingStatus,
  canManage: boolean,
  canReview: boolean,
  t: (key: string) => string,
): {
  label: string;
  icon: React.ReactNode;
  variant: 'primary' | 'destructive';
  action: 'reschedule' | 'confirm' | 'cancel';
} | null {
  if (canReview && status === 'AWAITING_REVIEW') {
    return {
      label: t('ops.action.confirm'),
      icon: <CheckCircle2 className="size-4" aria-hidden="true" />,
      variant: 'primary',
      action: 'confirm',
    };
  }
  if (!canManage) return null;
  if (status === 'AWAITING_PAYMENT') {
    return {
      label: t('ops.action.reschedule'),
      icon: <RotateCcw className="size-4" aria-hidden="true" />,
      variant: 'primary',
      action: 'reschedule',
    };
  }
  if (['CONFIRMED', 'ASSIGNED'].includes(status)) {
    return {
      label: t('ops.action.cancel'),
      icon: <XCircle className="size-4" aria-hidden="true" />,
      variant: 'destructive',
      action: 'cancel',
    };
  }
  return null;
}

function Timeline({ events, customerVisibleOnly }: { events: JobEventRow[]; customerVisibleOnly: boolean }) {
  const { t } = useTranslation();
  const filtered = customerVisibleOnly ? events.filter((e) => e.customer_visible) : events;

  if (filtered.length === 0) {
    return <p className="py-4 text-center text-sm text-text-subtle">{t('ops.no_events')}</p>;
  }

  return (
    <ol className="relative space-y-4 border-l-2 border-border pl-4" data-testid="timeline">
      {filtered.map((event) => (
        <li key={event.id} className="relative">
          <div
            className={cn(
              'absolute -left-[1.3rem] top-1 size-3 rounded-full border-2 border-white',
              event.customer_visible ? 'bg-primary' : 'bg-text-subtle',
            )}
            aria-hidden="true"
          />
          <div className="text-sm">
            <p className="font-medium text-text">
              {t('event.' + event.kind, { defaultValue: event.kind })}
              {event.to_status && event.to_status !== event.from_status && (
                <StatusBadge status={event.to_status} className="ml-2" />
              )}
            </p>
            <p className="mt-0.5 text-xs text-text-subtle">
              {formatDateTime(event.created_at, 'en')}
              {event.actor_label ? ` · ${event.actor_label}` : ''}
            </p>
            {!event.customer_visible && (
              <Badge tone="outline" className="mt-1 text-xs">
                {t('ops.internal')}
              </Badge>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function AuditTrail({ logs }: { logs: AuditLogRow[] }) {
  const { t } = useTranslation();
  if (logs.length === 0) {
    return <p className="py-4 text-center text-sm text-text-subtle">{t('ops.no_audit')}</p>;
  }
  return (
    <ol className="space-y-3" data-testid="audit-trail">
      {logs.map((log) => (
        <li key={log.id} className="text-sm">
          <p className="font-medium text-text">{log.action}</p>
          <p className="text-xs text-text-subtle">
            {formatDateTime(log.created_at, 'en')} · {log.actor_role}
          </p>
        </li>
      ))}
    </ol>
  );
}

function ConfirmBookingDialog({
  onOpenChange,
  durationMin,
  onConfirm,
  loading,
}: {
  onOpenChange: (open: boolean) => void;
  durationMin: number;
  onConfirm: (start: string, end: string) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(dayKey(nowInDar()));
  const [time, setTime] = useState('09:00');

  const handleSubmit = () => {
    if (!date || !time) return;
    const { start, end } = buildConfirmSchedule(date, time, durationMin);
    onConfirm(start, end);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('ops.confirm_booking_title')}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <p className="text-sm text-text-subtle">{t('ops.confirm_booking_body')}</p>
          <Field id="confirm-date" label={t('ops.date')}>
            <Input id="confirm-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field id="confirm-time" label={t('ops.time')}>
            <Input id="confirm-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit} loading={loading} disabled={!date || !time}>
              {t('ops.confirm_schedule')}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function RescheduleDialog({
  onOpenChange,
  scheduledStart,
  durationMin,
  onReschedule,
  loading,
}: {
  onOpenChange: (open: boolean) => void;
  scheduledStart: string | null;
  durationMin: number;
  onReschedule: (start: string, end: string, reason: string) => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(scheduledStart ? scheduledStart.slice(0, 10) : '');
  const [time, setTime] = useState(scheduledStart ? scheduledStart.slice(11, 16) : '09:00');
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (!date || !time) return;
    // Dar wall-clock, not browser-local: the office schedules in Dar time.
    const { start, end } = buildConfirmSchedule(date, time, durationMin);
    onReschedule(start, end, reason);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('ops.reschedule_title')}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field id="reschedule-date" label={t('ops.reschedule_date')}>
            <Input id="reschedule-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field id="reschedule-time" label={t('ops.reschedule_time')}>
            <Input id="reschedule-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </Field>
          <Field id="reschedule-reason" label={t('ops.reschedule_reason')}>
            <Textarea
              id="reschedule-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t('ops.reschedule_reason_placeholder')}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={loading}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSubmit} loading={loading}>
              {t('ops.reschedule')}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

function FlagReviewDialog({
  onOpenChange,
  onConfirm,
}: {
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
}) {
  const { t } = useTranslation();
  const [reason, setReason] = useState('');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>{t('ops.flag_needs_review')}</CardTitle>
        </CardHeader>
        <CardBody className="space-y-4">
          <Field id="flag-reason" label={t('ops.flag_reason')}>
            <Textarea
              id="flag-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              placeholder={t('ops.flag_reason_placeholder')}
            />
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => onConfirm(reason)} variant="primary">
              {t('ops.flag')}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}

export default TicketDetailPage;
