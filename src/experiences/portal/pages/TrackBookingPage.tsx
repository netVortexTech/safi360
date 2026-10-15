import { ArrowLeft } from 'lucide-react';
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { CustomerActionKind } from '@shared/handlers/tracking';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { ErrorState } from '@/components/shared/ErrorState';
import { Field } from '@/components/shared/Field';
import { PriceSummary } from '@/components/shared/PriceSummary';
import { FlagBadge, StatusBadge } from '@/components/shared/StatusBadge';
import { TicketChip } from '@/components/shared/TicketChip';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/toast';
import { formatDateTime, formatTimeRange } from '@/lib/dates';
import { formatTzs } from '@/lib/money';
import { isPortalApiError, portalErrorKey } from '../api';
import { PaymentFlow } from '../components/PaymentFlow';
import { Timeline } from '../components/Timeline';
import { usePortal } from '../context';
import { useCustomerAction, useTrackingView } from '../hooks';
import { usableToken } from '../session';

type Dialogs = 'approve' | 'reject' | 'cancel' | 'reschedule' | null;

/** One booking: status, timeline, details, and only the actions the policy allows. */
export default function TrackBookingPage() {
  const { t } = useTranslation();
  const { slug, catalog, locale } = usePortal();
  const { bookingId } = useParams<{ bookingId: string }>();
  const token = bookingId ? usableToken(slug, bookingId) : null;
  const view = useTrackingView(slug, bookingId ?? null, token);
  const act = useCustomerAction();
  const { toast } = useToast();
  const [dialog, setDialog] = useState<Dialogs>(null);
  const [preferred, setPreferred] = useState('');
  const [note, setNote] = useState('');
  const [fbKind, setFbKind] = useState<'COMMENT' | 'COMPLAINT'>('COMMENT');
  const [fbRating, setFbRating] = useState(5);
  const [fbBody, setFbBody] = useState('');
  const id = useId();
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    if (
      view.isError &&
      isPortalApiError(view.error) &&
      (view.error.code === 'token_expired' || view.error.code === 'token_invalid')
    ) {
      setExpired(true);
    }
  }, [view.isError, view.error]);

  if (!bookingId || !token || expired) {
    return <Navigate to={`/${slug}/track`} replace state={{ expired: true }} />;
  }

  const run = async (action: CustomerActionKind, extra: Record<string, string | undefined> = {}) => {
    if (!token) return;
    try {
      const res = await act.mutateAsync({
        slug,
        token,
        booking_id: bookingId,
        action: action as 'approve_quote' | 'reject_quote' | 'cancel' | 'request_reschedule',
        ...Object.fromEntries(Object.entries(extra).filter(([, v]) => v)),
      });
      setDialog(null);
      const key =
        res.outcome === 'request_logged'
          ? 'portal.track.done_requested'
          : action === 'approve_quote'
            ? 'portal.track.done_approved'
            : action === 'reject_quote'
              ? 'portal.track.done_rejected'
              : 'portal.track.done_cancelled';
      toast({ title: t(key) });
      await view.refetch();
    } catch (err) {
      toast({ title: t(portalErrorKey(err)), tone: 'error' });
    }
  };

  if (view.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (view.isError || !view.data) {
    return (
      <ErrorState
        description={t(portalErrorKey(view.error))}
        onRetry={() => void view.refetch()}
        retrying={view.isFetching}
      />
    );
  }

  const { booking, items, quote, timeline, payments, feedback, actions, policy } = view.data;
  const deadline = policy.cancel_deadline ? formatDateTime(policy.cancel_deadline, locale) : '';
  const depositDue = Math.max(0, booking.deposit_tzs - booking.paid_tzs);

  return (
    <div className="space-y-6" data-testid="track-booking" data-status={booking.status}>
      <Link
        to={`/${slug}/track`}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('portal.track.your_bookings')}
      </Link>
      <header className="space-y-2">
        <h1 className="text-h1">{t('portal.track.result_title', { ticket: '' }).trim()}</h1>
        <TicketChip ticketRef={booking.ticket_ref} size="display" />
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={booking.status} />
          {booking.flags.map((f) =>
            f === 'RESCHEDULED' || f === 'NEEDS_REVIEW' ? <FlagBadge key={f} flag={f} /> : null,
          )}
        </div>
      </header>

      {actions.includes('pay_deposit') && depositDue > 0 && (
        <PaymentFlow
          slug={slug}
          token={token}
          bookingId={bookingId}
          amountTzs={depositDue}
          holdExpiresAt={booking.hold_expires_at}
          onResult={() => void view.refetch()}
        />
      )}

      <section aria-labelledby="track-actions" className="rounded-lg border border-border bg-surface p-4">
        <h2 id="track-actions" className="mb-2 text-h3">
          {t('portal.track.actions')}
        </h2>
        {actions.filter((a) => a !== 'pay_deposit').length === 0 ? (
          <p className="text-sm text-text-muted">{t('portal.track.no_actions')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {actions.includes('approve_quote') && (
              <Button variant="brand" onClick={() => setDialog('approve')}>
                {t('portal.track.approve')}
              </Button>
            )}
            {actions.includes('reject_quote') && (
              <Button variant="secondary" onClick={() => setDialog('reject')}>
                {t('portal.track.reject')}
              </Button>
            )}
            {actions.includes('request_reschedule') && (
              <Button variant="secondary" onClick={() => setDialog('reschedule')}>
                {t('portal.track.reschedule')}
              </Button>
            )}
            {actions.includes('cancel') && (
              <Button
                variant={policy.cancel_within_policy ? 'destructive' : 'secondary'}
                onClick={() => setDialog('cancel')}
              >
                {policy.cancel_within_policy ? t('portal.track.cancel') : t('portal.track.request_cancel')}
              </Button>
            )}
          </div>
        )}
        <p className="mt-2 text-xs text-text-subtle">
          {t('portal.track.policy_hint', { hours: policy.cancel_hours })}
        </p>
      </section>

      <section aria-labelledby="track-timeline">
        <h2 id="track-timeline" className="mb-3 text-h3">
          {t('portal.track.timeline')}
        </h2>
        <Timeline events={timeline} locale={locale} />
      </section>

      {actions.includes('submit_feedback') && (
        <section
          aria-labelledby="track-feedback"
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
        >
          <h2 id="track-feedback" className="text-h3">
            {t('portal.track.feedback_title')}
          </h2>
          {feedback.length > 0 && (
            <ul className="space-y-2">
              {feedback.map((f) => (
                <li key={f.id} className="rounded-lg bg-surface-muted p-3 text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      {t(`portal.track.feedback_kind_${f.kind.toLowerCase()}`)}
                    </span>
                    {f.rating != null && (
                      <span className="text-warning" aria-label={`${f.rating}/5`}>
                        {'★'.repeat(f.rating)}
                        {'☆'.repeat(5 - f.rating)}
                      </span>
                    )}
                    <span className="ml-auto text-xs text-text-subtle">
                      {formatDateTime(f.created_at, locale)}
                    </span>
                  </div>
                  <p className="mt-1 text-text">{f.body}</p>
                  {f.response && (
                    <p className="mt-2 rounded bg-surface p-2 text-text">
                      <span className="font-medium">{t('portal.track.feedback_response')}: </span>
                      {f.response}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            {(['COMMENT', 'COMPLAINT'] as const).map((k) => (
              <Button
                key={k}
                variant={fbKind === k ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setFbKind(k)}
              >
                {t(`portal.track.feedback_kind_${k.toLowerCase()}`)}
              </Button>
            ))}
          </div>
          {fbKind === 'COMMENT' && (
            <div className="flex items-center gap-1" role="radiogroup" aria-label={t('portal.track.rating')}>
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  role="radio"
                  aria-checked={fbRating === n}
                  aria-label={`${n}/5`}
                  onClick={() => setFbRating(n)}
                  className="text-xl text-warning"
                >
                  {n <= fbRating ? '★' : '☆'}
                </button>
              ))}
            </div>
          )}
          <Field id={`${id}-fb-body`} label={t('portal.track.feedback_body')}>
            <Textarea
              id={`${id}-fb-body`}
              value={fbBody}
              onChange={(e) => setFbBody(e.target.value.slice(0, 2000))}
              rows={3}
            />
          </Field>
          <Button
            loading={act.isPending}
            disabled={fbBody.trim().length < 2}
            onClick={() =>
              void act
                .mutateAsync({
                  slug,
                  token: token ?? '',
                  booking_id: bookingId,
                  action: 'submit_feedback',
                  feedback_kind: fbKind,
                  rating: fbKind === 'COMMENT' ? fbRating : undefined,
                  body: fbBody.trim(),
                })
                .then(() => {
                  setFbBody('');
                  toast({ title: t('portal.track.feedback_sent') });
                  return view.refetch();
                })
                .catch((err) => {
                  toast({ title: t(portalErrorKey(err)), tone: 'error' });
                })
            }
          >
            {t('portal.track.feedback_send')}
          </Button>
        </section>
      )}

      <section aria-labelledby="track-details" className="space-y-3">
        <h2 id="track-details" className="text-h3">
          {t('portal.track.details')}
        </h2>
        <dl className="divide-y divide-border rounded-lg border border-border bg-surface px-4 text-sm">
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-text-muted">{t('portal.done.when')}</dt>
            <dd className="text-right">
              {booking.scheduled_start && booking.scheduled_end
                ? `${formatDateTime(booking.scheduled_start, locale)} · ${formatTimeRange(booking.scheduled_start, booking.scheduled_end, locale)}`
                : t('portal.time.review_hint')}
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-text-muted">{t('portal.done.where')}</dt>
            <dd className="text-right">
              {[booking.address.area, booking.address.street, booking.address.landmark]
                .filter(Boolean)
                .join(' · ')}
            </dd>
          </div>
          <div className="flex justify-between gap-4 py-3">
            <dt className="text-text-muted">{t('portal.review.services')}</dt>
            <dd className="text-right">
              {items.map((i) => (
                <div key={`${i.label_en}-${i.qty}`}>
                  {locale === 'en' ? i.label_en : i.label_sw}
                  {i.amount_tzs != null && (
                    <span className="tabular text-text-muted"> · {formatTzs(i.amount_tzs)}</span>
                  )}
                </div>
              ))}
            </dd>
          </div>
          {booking.paid_tzs > 0 && (
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-text-muted">{t('portal.track.paid')}</dt>
              <dd className="tabular">{formatTzs(booking.paid_tzs)}</dd>
            </div>
          )}
          {booking.total_tzs > 0 && (
            <div className="flex justify-between gap-4 py-3">
              <dt className="text-text-muted">{t('portal.track.balance')}</dt>
              <dd className="tabular font-semibold">{formatTzs(booking.balance_tzs)}</dd>
            </div>
          )}
        </dl>
        {quote && Array.isArray(quote.lines) && <PriceSummary quote={quote} locale={locale} />}
        {payments.length > 0 && (
          <ul className="text-sm text-text-muted">
            {payments.map((p) => (
              <li key={p.id} className="flex justify-between gap-3 py-1">
                <span>
                  {t(`payment_status.${p.status}`)} · {formatDateTime(p.created_at, locale)}
                </span>
                <span className="tabular">{formatTzs(p.amount_tzs)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="text-sm text-text-subtle">
        {t('portal.track.contact_company', { phone: catalog.tenant.phone_e164 })}
      </p>

      <ConfirmDialog
        open={dialog === 'approve'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('portal.track.approve_title')}
        description={t('portal.track.approve_body', { amount: formatTzs(booking.total_tzs) })}
        confirmLabel={t('portal.track.approve')}
        loading={act.isPending}
        onConfirm={() => void run('approve_quote')}
      />
      <ConfirmDialog
        open={dialog === 'reject'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={t('portal.track.reject_title')}
        description={t('portal.track.reject_body')}
        confirmLabel={t('portal.track.reject')}
        destructive
        loading={act.isPending}
        reasonLabel={t('portal.track.reject_reason')}
        onConfirm={(reason) => void run('reject_quote', { reason })}
      />
      <ConfirmDialog
        open={dialog === 'cancel'}
        onOpenChange={(o) => !o && setDialog(null)}
        title={
          policy.cancel_within_policy
            ? t('portal.track.cancel_title')
            : t('portal.track.cancel_outside_title')
        }
        description={
          policy.cancel_within_policy
            ? t('portal.track.cancel_body', { deadline })
            : t('portal.track.cancel_outside_body', { deadline })
        }
        confirmLabel={
          policy.cancel_within_policy ? t('portal.track.cancel') : t('portal.track.request_cancel')
        }
        destructive={policy.cancel_within_policy}
        loading={act.isPending}
        reasonLabel={t('portal.track.cancel_reason')}
        onConfirm={(reason) => void run('cancel', { reason })}
      />
      <Dialog open={dialog === 'reschedule'} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('portal.track.reschedule_title')}</DialogTitle>
            <DialogDescription>{t('portal.track.reschedule_body')}</DialogDescription>
          </DialogHeader>
          <Field id={`${id}-preferred`} label={t('portal.track.preferred_start')}>
            <Input
              id={`${id}-preferred`}
              type="datetime-local"
              value={preferred}
              onChange={(e) => setPreferred(e.target.value)}
            />
          </Field>
          <Field id={`${id}-note`} label={t('portal.track.note')}>
            <Textarea
              id={`${id}-note`}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, 500))}
              rows={3}
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setDialog(null)} disabled={act.isPending}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={() =>
                void run('request_reschedule', {
                  preferred_start: preferred ? new Date(preferred).toISOString() : undefined,
                  note: note.trim() || undefined,
                })
              }
              loading={act.isPending}
              loadingLabel={t('portal.track.reschedule')}
            >
              {t('portal.track.reschedule')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
