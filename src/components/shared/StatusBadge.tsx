import {
  Ban,
  CheckCircle2,
  Circle,
  CircleCheck,
  CircleDot,
  Clock,
  Flag,
  Hourglass,
  Lock,
  MapPin,
  Navigation,
  RotateCcw,
  UserCheck,
  UserX,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BookingFlag, BookingStatus } from '@shared/enums';
import { Badge, type BadgeProps } from '@/components/ui/badge';

type Tone = NonNullable<BadgeProps['tone']>;

const STATUS_STYLE: Record<BookingStatus, { tone: Tone; icon: LucideIcon }> = {
  REQUEST_RECEIVED: { tone: 'neutral', icon: Circle },
  AWAITING_REVIEW: { tone: 'warning', icon: Clock },
  AWAITING_CUSTOMER_APPROVAL: { tone: 'warning', icon: Clock },
  AWAITING_PAYMENT: { tone: 'warning', icon: Clock },
  CONFIRMED: { tone: 'primary', icon: CheckCircle2 },
  ASSIGNED: { tone: 'info', icon: UserCheck },
  EN_ROUTE: { tone: 'info', icon: Navigation },
  ARRIVED: { tone: 'info', icon: MapPin },
  IN_PROGRESS: { tone: 'info', icon: CircleDot },
  COMPLETED: { tone: 'success', icon: CircleCheck },
  CLOSED: { tone: 'neutral', icon: Lock },
  CANCELLED: { tone: 'outline', icon: Ban },
  QUOTE_REJECTED: { tone: 'outline', icon: XCircle },
  NO_SHOW: { tone: 'outline', icon: UserX },
  EXPIRED: { tone: 'outline', icon: Hourglass },
};

export interface StatusBadgeProps {
  status: BookingStatus;
  className?: string;
}

/** Booking status: tinted pill + icon + label. Status is never conveyed by colour alone. */
export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation();
  const { tone, icon: Icon } = STATUS_STYLE[status];
  return (
    <Badge tone={tone} className={className} data-status={status}>
      <Icon aria-hidden="true" />
      {t(`status.${status}`)}
    </Badge>
  );
}

const FLAG_STYLE: Record<BookingFlag, { icon: LucideIcon }> = {
  RESCHEDULED: { icon: RotateCcw },
  NEEDS_REVIEW: { icon: Flag },
};

export interface FlagBadgeProps {
  flag: BookingFlag;
  className?: string;
}

/** Flags sit beside the status; they are attention markers, so they use the amber-outline style. */
export function FlagBadge({ flag, className }: FlagBadgeProps) {
  const { t } = useTranslation();
  const Icon = FLAG_STYLE[flag].icon;
  return (
    <Badge tone="outline" className={`border-amber text-warning-text ${className ?? ''}`} data-flag={flag}>
      <Icon aria-hidden="true" />
      {t(`flag.${flag}`)}
    </Badge>
  );
}
