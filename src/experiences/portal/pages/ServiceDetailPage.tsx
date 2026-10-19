import { ArrowLeft, Clock, Users } from '@/components/ui/icons';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { parseDurationRule } from '@shared/pricing/rules';
import { ErrorState } from '@/components/shared/ErrorState';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { formatTzs } from '@/lib/money';
import { priceLabel } from '../util';
import { pick, usePortal } from '../context';

export default function ServiceDetailPage() {
  const { t } = useTranslation();
  const { slug, catalog, locale } = usePortal();
  const { id } = useParams<{ id: string }>();
  const service = catalog.services.find((s) => s.id === id);
  if (!service) {
    return (
      <ErrorState title={t('portal.services.not_found')} description={t('portal.services.empty_body')} />
    );
  }
  const addons = catalog.addons.filter(
    (a) => a.active && (a.service_id == null || a.service_id === service.id),
  );
  const description = locale === 'en' ? service.description_en : service.description_sw;
  const duration = (() => {
    try {
      return parseDurationRule(service.duration_rule).base_min;
    } catch {
      return null;
    }
  })();
  const review = service.pricing_type === 'INSPECTION_REQUIRED' || service.pricing_type === 'CUSTOM_QUOTE';

  return (
    <article className="space-y-5">
      <Link
        to={`/${slug}/services`}
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden="true" />
        {t('portal.services.all_services')}
      </Link>
      <header className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-h1">{pick(service, locale)}</h1>
          {review && <Badge tone="warning">{t('quote.summary.requires_review')}</Badge>}
        </div>
        <p className="tabular text-h3">{priceLabel(service, locale, t)}</p>
        <p className="flex flex-wrap gap-4 text-sm text-text-subtle">
          {duration != null && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-4" aria-hidden="true" />
              {t('portal.services.duration', { minutes: duration })}
            </span>
          )}
          <span className="inline-flex items-center gap-1">
            <Users className="size-4" aria-hidden="true" />
            {t('portal.services.crew', { count: service.crew_size })}
          </span>
        </p>
      </header>
      {description && <p className="max-w-prose text-base text-text-muted">{description}</p>}
      {review && <p className="text-sm text-text-muted">{t('portal.stepper.review_hint')}</p>}
      {addons.length > 0 && (
        <section>
          <h2 className="mb-2 text-h3">{t('portal.services.addons')}</h2>
          <ul className="divide-y divide-border rounded-lg border border-border bg-surface">
            {addons.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span>{pick(a, locale)}</span>
                <span className="tabular text-text-muted">
                  {formatTzs(a.price_tzs)}
                  {a.per_unit ? ` ${t('portal.services.per_unit')}` : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Button asChild variant="brand" size="lg">
        <Link to={`/${slug}/book?service=${service.id}`}>{t('portal.services.book_this')}</Link>
      </Button>
    </article>
  );
}
