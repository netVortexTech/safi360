import {
  AlertTriangle,
  Check,
  Clock,
  Hourglass,
  PenLine,
  RotateCcw,
  Send,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { PaymentStatus as PaymentStatusEnum } from '@shared/enums';
import { Badge, type BadgeProps } from '@/components/ui/badge';

type Tone = NonNullable<BadgeProps['tone']>;

/** Display states: the six enum values plus two UI-only states shown in the design system. */
export type PaymentDisplayStatus = PaymentStatusEnum | 'NOT_REQUESTED' | 'MANUAL';

const STYLE: Record<PaymentDisplayStatus, { tone: Tone; icon: LucideIcon }> = {
  PENDING: { tone: 'warning', icon: Clock },
  SUCCESS: { tone: 'success', icon: Check },
  FAILED: { tone: 'error', icon: XCircle },
  EXPIRED: { tone: 'outline', icon: Hourglass },
  UNKNOWN: { tone: 'warning', icon: AlertTriangle },
  REFUNDED: { tone: 'neutral', icon: RotateCcw },
  NOT_REQUESTED: { tone: 'neutral', icon: Send },
  MANUAL: { tone: 'neutral', icon: PenLine },
};

export interface PaymentStatusProps {
  status: PaymentDisplayStatus;
  className?: string;
}

/**
 * Payment status comes only from verified provider callbacks, polling or reconciliation.
 * UNKNOWN is shown as "checking" — it never offers the customer a retry.
 */
export function PaymentStatus({ status, className }: PaymentStatusProps) {
  const { t } = useTranslation();
  const { tone, icon: Icon } = STYLE[status];
  return (
    <Badge tone={tone} className={className} data-payment-status={status}>
      <Icon aria-hidden="true" />
      {t(`payment_status.${status}`)}
    </Badge>
  );
}
