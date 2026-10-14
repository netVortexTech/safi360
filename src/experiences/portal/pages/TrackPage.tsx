import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { EmptyState } from '@/components/shared/EmptyState';
import { Field } from '@/components/shared/Field';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatDateTime } from '@/lib/dates';
import { formatTzs } from '@/lib/money';
import { portalApi } from '../api';
import { OtpVerify } from '../components/OtpVerify';
import { usePortal } from '../context';
import { loadTrackingSession, saveTrackingSession } from '../session';
import type { BookingSummary, TrackingSession } from '../types';

const TICKET = /^[A-Za-z]{2,5}-\d{4}-\d{5}$/;

/** Track my booking (/track) and lost-ticket recovery (/track/recover): phone → code → bookings. */
export default function TrackPage() {
  const { t } = useTranslation();
  const { slug, locale } = usePortal();
  const navigate = useNavigate();
  const location = useLocation();
  const recover = location.pathname.endsWith('/recover');
  const id = useId();
  const [ticketRaw, setTicketRaw] = useState('');
  const [phoneRaw, setPhoneRaw] = useState('');
  const [phoneE164, setPhoneE164] = useState<string | null>(null);
  const [session, setSession] = useState<TrackingSession | null>(() => loadTrackingSession(slug));
  const ticket = ticketRaw.trim().toUpperCase();
  const ticketError =
    !recover && ticketRaw.length > 0 && !TICKET.test(ticket) ? t('validation.ticket_ref.format') : undefined;

  const onSend = async (phone: string) => {
    if (!recover && !TICKET.test(ticket)) throw new Error('validation.ticket_ref.format');
    await portalApi.trackingStart({ slug, phone, locale, ...(recover ? {} : { ticket_ref: ticket }) });
    return { sandbox: true };
  };

  const onVerify = async (phone: string, code: string) => {
    const res = await portalApi.trackingVerify({
      slug,
      phone,
      code,
      ...(recover ? {} : { ticket_ref: ticket }),
    });
    const s: TrackingSession = {
      slug,
      token: res.token,
      expires_at: res.expires_at,
      phone,
      booking_id: res.booking_id,
      bookings: res.bookings,
    };
    saveTrackingSession(s);
    setSession(s);
    if (res.booking_id) navigate(`/${slug}/track/${res.booking_id}`);
    return { token: res.token, expires_at: res.expires_at };
  };

  if (session) {
    return (
      <div className="space-y-4" data-testid="track-list">
        <header>
          <h1 className="text-h1">{t('portal.track.your_bookings')}</h1>
        </header>
        {session.bookings.length === 0 ? (
          <EmptyState
            title={t('portal.track.no_bookings_title')}
            description={t('portal.track.no_bookings_body')}
            actions={
              <Button asChild variant="brand">
                <Link to={`/${slug}/book`}>{t('portal.hero.book')}</Link>
              </Button>
            }
          />
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {session.bookings.map((b: BookingSummary) => (
              <li key={b.id}>
                <Link
                  to={`/${slug}/track/${b.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-muted"
                >
                  <span className="min-w-0">
                    <span className="tabular block font-semibold">{b.ticket_ref}</span>
                    <span className="block text-sm text-text-muted">
                      {locale === 'en' ? b.service_label_en : b.service_label_sw}
                      {b.scheduled_start ? ` · ${formatDateTime(b.scheduled_start, locale)}` : ''}
                      {b.total_tzs > 0 ? ` · ${formatTzs(b.total_tzs)}` : ''}
                    </span>
                  </span>
                  <StatusBadge status={b.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="link"
          onClick={() => {
            saveTrackingSession(null);
            setSession(null);
          }}
        >
          {t('portal.track.change')}
        </Button>
      </div>
    );
  }

  return (
    <div
      className="mx-auto max-w-md space-y-4"
      data-testid="track-page"
      data-mode={recover ? 'recover' : 'ticket'}
    >
      <header>
        <h1 className="text-h1">{recover ? t('portal.track.lost_title') : t('portal.track.title')}</h1>
        <p className="text-sm text-text-muted">
          {recover ? t('portal.track.lost_body') : t('portal.track.body')}
        </p>
      </header>
      <div className="rounded-lg border border-border bg-surface p-4">
        <OtpVerify
          slug={slug}
          purpose="tracking"
          locale={locale}
          phoneRaw={phoneRaw}
          phoneE164={phoneE164}
          onPhoneChange={(raw, e164) => {
            setPhoneRaw(raw);
            setPhoneE164(e164);
          }}
          onVerified={() => undefined}
          onSend={onSend}
          onVerify={onVerify}
          sendLabel={t('portal.track.send_code')}
          autoFocus={recover}
          before={
            recover ? null : (
              <Field id={`${id}-ticket`} label={t('portal.track.ticket')} required error={ticketError}>
                <Input
                  id={`${id}-ticket`}
                  value={ticketRaw}
                  onChange={(e) => setTicketRaw(e.target.value)}
                  placeholder={t('portal.track.ticket_placeholder')}
                  className="tabular uppercase"
                  autoComplete="off"
                  autoFocus
                  invalid={!!ticketError}
                />
              </Field>
            )
          }
        />
      </div>
      {!recover ? (
        <Link to={`/${slug}/track/recover`} className="block text-sm text-primary hover:underline">
          {t('portal.track.lost_ticket')}
        </Link>
      ) : (
        <Link to={`/${slug}/track`} className="block text-sm text-primary hover:underline">
          {t('portal.track.title')}
        </Link>
      )}
    </div>
  );
}
