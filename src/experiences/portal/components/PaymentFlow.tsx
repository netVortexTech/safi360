import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaymentOutcome } from '@shared/payments/provider';
import { PaymentStatus } from '@/components/shared/PaymentStatus';
import { Button } from '@/components/ui/button';
import { newIdempotencyKey } from '@/lib/idempotency';
import { formatTzs } from '@/lib/money';
import { isPortalApiError, portalErrorKey } from '../api';
import { usePaymentCallback, usePaymentStart } from '../hooks';
import type { PaymentStartResponse } from '../types';
import { Countdown } from './Countdown';
import { MockPaymentPanel } from './MockPaymentPanel';

export interface PaymentFlowProps {
  slug: string;
  token: string;
  bookingId: string;
  amountTzs: number;
  holdExpiresAt: string | null;
  /** Called with the booking status after the provider answered. */
  onResult: (outcome: PaymentOutcome, bookingStatus: string | null) => void;
  onPayLater?: (() => void) | undefined;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'started'; payment: PaymentStartResponse }
  | { kind: 'result'; outcome: PaymentOutcome; bookingStatus: string | null }
  | { kind: 'error'; key: string };

/** Deposit payment through the provider interface. Every state the provider can report is shown. */
export function PaymentFlow({
  slug,
  token,
  bookingId,
  amountTzs,
  holdExpiresAt,
  onResult,
  onPayLater,
}: PaymentFlowProps) {
  const { t } = useTranslation();
  const start = usePaymentStart();
  const callback = usePaymentCallback();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [key, setKey] = useState(() => newIdempotencyKey('payment'));
  const [expired, setExpired] = useState(false);

  const begin = async () => {
    try {
      const payment = await start.mutateAsync({
        slug,
        token,
        booking_id: bookingId,
        kind: 'DEPOSIT',
        idempotency_key: key,
      });
      setPhase({ kind: 'started', payment });
    } catch (err) {
      setPhase({ kind: 'error', key: portalErrorKey(err) });
    }
  };

  const choose = async (outcome: PaymentOutcome, signature: string) => {
    if (phase.kind !== 'started') return;
    try {
      const res = await callback.mutateAsync({
        provider: 'MOCK',
        provider_ref: `mock_${phase.payment.payment_id}`,
        outcome,
        signature,
      });
      setPhase({ kind: 'result', outcome, bookingStatus: res.booking_status });
      onResult(outcome, res.booking_status);
    } catch (err) {
      setPhase({ kind: 'error', key: isPortalApiError(err) ? err.messageKey : portalErrorKey(err) });
    }
  };

  const retry = () => {
    setKey(newIdempotencyKey('payment'));
    setPhase({ kind: 'idle' });
  };

  return (
    <section
      className="space-y-3 rounded-lg border border-border bg-surface p-4"
      aria-labelledby="payment-title"
      data-testid="payment-flow"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 id="payment-title" className="text-h3">
            {t('portal.payment.title')}
          </h3>
          <p className="tabular text-sm text-text-muted">
            {t('portal.payment.amount')}: {formatTzs(amountTzs)}
          </p>
        </div>
        {holdExpiresAt && phase.kind !== 'result' && (
          <Countdown
            until={holdExpiresAt}
            onExpire={() => setExpired(true)}
            render={(text, isExpired) => (
              <span
                className={`inline-flex items-center gap-1 text-sm ${isExpired ? 'text-warning-text' : 'text-text-muted'}`}
                data-testid="hold-countdown"
              >
                <Clock className="size-4" aria-hidden="true" />
                {isExpired
                  ? t('portal.payment.hold_expired')
                  : t('portal.payment.hold_expires', { time: text })}
              </span>
            )}
          />
        )}
      </div>

      {phase.kind === 'idle' && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="brand"
            onClick={() => void begin()}
            loading={start.isPending}
            loadingLabel={t('portal.payment.processing')}
          >
            {t('portal.done.payment_now')}
          </Button>
          {onPayLater && (
            <Button variant="secondary" onClick={onPayLater}>
              {t('portal.payment.pay_later')}
            </Button>
          )}
        </div>
      )}

      {phase.kind === 'started' && (
        <>
          <PaymentStatus status="PENDING" />
          {phase.payment.instructions.kind === 'mock' && (
            <MockPaymentPanel
              outcomes={phase.payment.instructions.outcomes}
              onChoose={(o, s) => void choose(o, s)}
              busy={callback.isPending}
            />
          )}
          {phase.payment.instructions.kind === 'push' && (
            <p className="text-sm text-text-muted">{t(phase.payment.instructions.message_key)}</p>
          )}
          {phase.payment.instructions.kind === 'redirect' && (
            <Button asChild variant="brand">
              <a href={phase.payment.instructions.url}>{t('portal.payment.continue')}</a>
            </Button>
          )}
        </>
      )}

      {phase.kind === 'result' && (
        <div role="status" className="space-y-2" data-payment-outcome={phase.outcome}>
          <PaymentStatus status={phase.outcome} />
          {phase.outcome === 'SUCCESS' && (
            <p className="inline-flex items-center gap-2 text-sm text-success-text">
              <CheckCircle2 className="size-4" aria-hidden="true" />
              {t('portal.payment.success')}
            </p>
          )}
          {(phase.outcome === 'FAILED' || phase.outcome === 'EXPIRED') && (
            <>
              <p className="inline-flex items-center gap-2 text-sm text-error-text">
                <XCircle className="size-4" aria-hidden="true" />
                {t(phase.outcome === 'FAILED' ? 'portal.payment.failed' : 'portal.payment.expired')}
              </p>
              <p className="text-sm text-text-muted">{t('portal.payment.failed_body')}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="brand" onClick={retry} disabled={expired}>
                  {t('portal.payment.retry')}
                </Button>
                {onPayLater && (
                  <Button variant="secondary" onClick={onPayLater}>
                    {t('portal.payment.pay_later')}
                  </Button>
                )}
              </div>
            </>
          )}
          {phase.outcome === 'UNKNOWN' && (
            <>
              <p className="inline-flex items-center gap-2 text-sm text-warning-text">
                <AlertTriangle className="size-4" aria-hidden="true" />
                {t('portal.payment.unknown')}
              </p>
              <p className="text-sm text-text-muted">{t('portal.payment.unknown_body')}</p>
            </>
          )}
        </div>
      )}

      {phase.kind === 'error' && (
        <div role="alert" className="space-y-2">
          <p className="text-sm text-error-text">{t(phase.key)}</p>
          <Button variant="secondary" onClick={retry}>
            {t('common.retry')}
          </Button>
        </div>
      )}
    </section>
  );
}
