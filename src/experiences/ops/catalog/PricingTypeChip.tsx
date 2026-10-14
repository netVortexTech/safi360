import { useTranslation } from 'react-i18next';
import type { PricingType } from '@shared/enums';
import { Badge } from '@/components/ui/badge';
import { PRICING_TYPE_TONE } from './pricing-labels';

export function PricingTypeChip({ type, className }: { type: PricingType; className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge tone={PRICING_TYPE_TONE[type]} className={className} data-pricing-type={type}>
      {t(`pricing_type.${type}.label`)}
    </Badge>
  );
}
