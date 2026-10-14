import { CheckCircle2, Clock, Hourglass } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import type { BookingStatus } from '@shared/enums';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { TicketChip } from '@/components/shared/TicketChip';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatTimeRange } from '@/lib/dates';
import { formatTzs } from '@/lib/money';
import { PaymentFlow } from '../components/PaymentFlow';
import { usePortal } from '../context';
import { useTrackingView } from '../hooks';
import { loadLastBooking, saveLastBooking } from '../session';
import { variantFor } from '../util';

const ICON = { confirmed: CheckCircle2, request: Clock, payment: Hourglass } as const;
const TONE = {
  confirmed: 'bg-success-tint text-success-text',
  request: 'bg-warning-tint text-warning-text',
  payment: 'bg-warning-tint text-warning-text',
} as const;

/** Three clearly different outcomes: confirmed, request received, awaiting payment. */
export default function BookingDonePage() {
  const { t } = useTranslation();
  const { slug, catalog, locale } = usePortal();
  const { ticket } = useParams<{ ticket: string }>();
  const [last, setLast] = useState(() => loadLastBooking(slug, ticket));
  const live = useTrackingView(slug, last?.booking_id ?? null, last?.token ?? null);
  const status = live.data?.booking.status ?? last?.status;

  if (!last || !status) {
    return (
      <EmptyState
        title={t('portal.done.missing_title')}
        description={t('portal.done.missing_body')}
        actions={
          <Button asChild variant="brand">
            <Link to={`/${slug}/track`}>{t('portal.hero.track')}</Link>
          </Button>
        }
      />
    );
  }

  const variant = variantFor(status);
  const Icon = ICON[variant];
  const paid = live.data?.booking.paid_tzs ?? 0;
  const depositDue = last.payment_mode === 'DEPOSIT' ? Math.max(0, last.deposit_tzs - paid) : 0;

  return (
    <div className="space-y-6" data-testid="booking-done" data-variant={variant}>
      <section className="rounded-lg border border-border bg-surface p-6 text-center">
        <span
          className={`mx-auto mb-4 flex size-14 items-center justify-center rounded-full ${TONE[variant]}`}
        >
          <Icon className="size-7" aria-hidden="true" />
        </span>
        <h1 className="text-display">{t(`portal.done.${variant}_title`)}</h1>
        <p className="mx-auto mt-2 max-w-prose text-sm text-text-muted">{t(`portal.done.${variant}_body`)}</p>
        <p className="mt-6 text-xs uppercase tracking-wide text-text-subtle">{t('portal.done.ticket')}</p>
        <div className="mt-1 flex justify-center">
          <TicketChip ticketRef={last.ticket_ref} size="display" />
        </div>
        <p className="mt-1 text-xs text-text-subtle">{t('portal.done.ticket_hint')}</p>
        <div className="mt-4 flex justify-center">
          <StatusBadge status={status} />
        </div>
      </section>

      {variant === 'payment' && depositDue > 0 && (
        <PaymentFlow
          slug={slug}
          token={last.token}
          bookingId={last.booking_id}
          amountTzs={depositDue}
          holdExpiresAt={live.data?.booking.hold_expires_at ?? last.hold_expires_at}
          onResult={(_outcome, bookingStatus) => {
            void live.refetch();
            if (bookingStatus) {
              const next = { ...last, status: bookingStatus as BookingStatus };
              saveLastBooking(next);
              setLast(next);
            }
          }}
        />
      )}

      <dl className="divide-y divide-border rounded-lg border border-border bg-surface px-4">
        <div className="flex justify-between gap-4 py-3 text-sm">
          <dt className="text-text-muted">{t('portal.done.when')}</dt>
          <dd className="text-right">
            {last.scheduled_start && last.scheduled_end
              ? `${formatDateTime(last.scheduled_start, locale)} · ${formatTimeRange(last.scheduled_start, last.scheduled_end, locale)}`
              : t('portal.time.review_hint')}
          </dd>
        </div>
        {last.address && (
          <div className="flex justify-between gap-4 py-3 text-sm">
            <dt className="text-text-muted">{t('portal.done.where')}</dt>
            <dd className="text-right">
              {[last.address.area, last.address.street, last.address.landmark].filter(Boolean).join(' · ')}
            </dd>
          </div>
        )}
        {!last.requires_review && (
          <>
            <div className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-text-muted">{t('portal.done.total')}</dt>
              <dd className="tabular font-semibold">{formatTzs(last.total_tzs)}</dd>
            </div>
            {last.payment_mode === 'DEPOSIT' && (
              <div className="flex justify-between gap-4 py-3 text-sm">
                <dt className="text-text-muted">
                  {paid >= last.deposit_tzs ? t('portal.done.deposit_paid') : t('portal.done.deposit_due')}
                </dt>
                <dd className="tabular">{formatTzs(last.deposit_tzs)}</dd>
              </div>
            )}
            <div className="flex justify-between gap-4 py-3 text-sm">
              <dt className="text-text-muted">{t('portal.done.balance')}</dt>
              <dd className="tabular">{formatTzs(Math.max(0, last.total_tzs - paid))}</dd>
            </div>
          </>
        )}
      </dl>

      <div className="flex flex-wrap gap-3">
        <Button asChild variant="brand">
          <Link to={`/${slug}/track/${last.booking_id}`}>{t('portal.done.track')}</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link to={`/${slug}/book`}>{t('portal.done.book_another')}</Link>
        </Button>
        <Button asChild variant="link">
          <Link to={`/${slug}`}>{t('portal.done.home')}</Link>
        </Button>
      </div>
      <p className="text-sm text-text-subtle">
        {t('portal.track.contact_company', { phone: catalog.tenant.phone_e164 })}
      </p>
    </div>
  );
}
