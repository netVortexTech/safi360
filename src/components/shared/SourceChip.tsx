import {
  Code2,
  Facebook,
  Globe,
  Instagram,
  MessageCircle,
  PenLine,
  Phone,
  Share2,
  Store,
  type Icon,
} from '@/components/ui/icons';
import { useTranslation } from 'react-i18next';
import type { BookingSource } from '@shared/enums';
import { Badge } from '@/components/ui/badge';

const ICON: Record<BookingSource, Icon> = {
  website: Globe,
  booking_widget: Code2,
  whatsapp: MessageCircle,
  instagram: Instagram,
  facebook: Facebook,
  phone: Phone,
  walk_in: Store,
  referral: Share2,
  admin_created: PenLine,
};

export interface SourceChipProps {
  source: BookingSource;
  className?: string;
}

/** Where the booking came from. Outlined chip, same on every ticket row and card. */
export function SourceChip({ source, className }: SourceChipProps) {
  const { t } = useTranslation();
  const Icon = ICON[source];
  return (
    <Badge tone="outline" className={className} data-source={source}>
      <Icon aria-hidden="true" />
      {t(`source.${source}`)}
    </Badge>
  );
}
