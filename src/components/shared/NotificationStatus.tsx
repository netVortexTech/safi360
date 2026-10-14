import { Check, CheckCheck, Clock, Eye, XCircle, type LucideIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { NotificationStatus as NotificationStatusEnum } from '@shared/enums';
import { Badge, type BadgeProps } from '@/components/ui/badge';

type Tone = NonNullable<BadgeProps['tone']>;

const STYLE: Record<NotificationStatusEnum, { tone: Tone; icon: LucideIcon }> = {
  queued: { tone: 'neutral', icon: Clock },
  sent: { tone: 'info', icon: Check },
  delivered: { tone: 'success', icon: CheckCheck },
  read: { tone: 'success', icon: Eye },
  failed: { tone: 'error', icon: XCircle },
};

export interface NotificationStatusProps {
  status: NotificationStatusEnum;
  /** Provider-reported detail, e.g. "Reported by WhatsApp, 8:10 PM" or the failure reason. */
  detail?: string | undefined;
  className?: string;
}

/** Delivery status is only what the provider reported; the UI never claims "delivered" on its own. */
export function NotificationStatus({ status, detail, className }: NotificationStatusProps) {
  const { t } = useTranslation();
  const { tone, icon: Icon } = STYLE[status];
  return (
    <span className={`inline-flex flex-col items-start gap-0.5 ${className ?? ''}`}>
      <Badge tone={tone} data-notification-status={status}>
        <Icon aria-hidden="true" />
        {t(`notification_status.${status}`)}
      </Badge>
      {detail && (
        <span className={`text-xs ${status === 'failed' ? 'text-error-text' : 'text-text-subtle'}`}>
          {detail}
        </span>
      )}
    </span>
  );
}
