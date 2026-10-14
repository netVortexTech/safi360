import { useTranslation } from 'react-i18next';
import type { PaymentOutcome } from '@shared/payments/provider';
import { SandboxBadge } from '@/components/shared/SandboxBadge';
import { Button } from '@/components/ui/button';
import { isSandbox } from '@/lib/env';

export interface MockPaymentPanelProps {
  outcomes: Record<PaymentOutcome, string>;
  onChoose: (outcome: PaymentOutcome, signature: string) => void;
  busy: boolean;
}

const ORDER: PaymentOutcome[] = ['SUCCESS', 'FAILED', 'EXPIRED', 'UNKNOWN'];

/**
 * The Mock provider's "checkout": the tester picks the outcome and the portal posts the
 * matching signed token to payment_callback, exactly as a real provider webhook would.
 * Never rendered in production (the provider does not exist there either).
 */
export function MockPaymentPanel({ outcomes, onChoose, busy }: MockPaymentPanelProps) {
  const { t } = useTranslation();
  if (!isSandbox) return null;
  return (
    <div className="rounded-lg border border-dashed border-amber bg-surface p-4" data-testid="mock-payment">
      <div className="mb-1 flex items-center gap-2">
        <SandboxBadge />
        <h3 className="text-h3">{t('portal.payment.mock_title')}</h3>
      </div>
      <p className="mb-3 text-sm text-text-muted">{t('portal.payment.mock_body')}</p>
      <div className="grid gap-2 sm:grid-cols-2">
        {ORDER.map((o) => (
          <Button
            key={o}
            variant={o === 'SUCCESS' ? 'primary' : 'secondary'}
            onClick={() => onChoose(o, outcomes[o])}
            disabled={busy}
            data-outcome={o}
          >
            {t(`portal.payment.outcome.${o}`)}
          </Button>
        ))}
      </div>
    </div>
  );
}
