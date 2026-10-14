import { Clock, Users } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { parseDurationRule } from '@shared/pricing/rules';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { pick } from '../context';
import type { Locale, PortalService } from '../types';
import { priceLabel } from '../util';

export interface ServiceCardProps {
  service: PortalService;
  locale: Locale;
  /** Where "Book this service" goes. */
  bookTo: string;
  detailTo?: string | undefined;
  compact?: boolean | undefined;
}

/** One service in the catalog list: name, blurb, starting price, time, crew. */
export function ServiceCard({ service, locale, bookTo, detailTo, compact }: ServiceCardProps) {
  const { t } = useTranslation();
  const duration = (() => {
    try {
      return parseDurationRule(service.duration_rule).base_min;
    } catch {
      return null;
    }
  })();
  const description = locale === 'en' ? service.description_en : service.description_sw;
  const review = service.pricing_type === 'INSPECTION_REQUIRED' || service.pricing_type === 'CUSTOM_QUOTE';
  return (
    <article
      className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4 shadow-card"
      data-testid="service-card"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-h3">
          {detailTo ? (
            <Link to={detailTo} className="hover:underline">
              {pick(service, locale)}
            </Link>
          ) : (
            pick(service, locale)
          )}
        </h3>
        {review && <Badge tone="warning">{t('quote.summary.requires_review')}</Badge>}
      </div>
      {!compact && description && <p className="text-sm text-text-muted">{description}</p>}
      <p className="tabular text-base font-semibold text-text">{priceLabel(service, locale, t)}</p>
      <p className="flex flex-wrap gap-3 text-xs text-text-subtle">
        {duration != null && (
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden="true" />
            {t('portal.services.duration', { minutes: duration })}
          </span>
        )}
        <span className="inline-flex items-center gap-1">
          <Users className="size-3.5" aria-hidden="true" />
          {t('portal.services.crew', { count: service.crew_size })}
        </span>
      </p>
      <Button asChild variant="brand" className="mt-1 self-start">
        <Link to={bookTo}>{t('portal.services.book_this')}</Link>
      </Button>
    </article>
  );
}
