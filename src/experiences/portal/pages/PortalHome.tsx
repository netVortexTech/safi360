import { CalendarPlus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/shared/EmptyState';
import { Button } from '@/components/ui/button';
import { ServiceCard } from '../components/ServiceCard';
import { usePortal } from '../context';

/** Company homepage: book, track, and the catalog at a glance. */
export default function PortalHome() {
  const { t } = useTranslation();
  const { slug, catalog, locale } = usePortal();
  const { tenant } = catalog;
  const greeting = locale === 'en' ? tenant.branding.greeting_en : tenant.branding.greeting_sw;
  const featured = catalog.services.slice(0, 6);
  return (
    <div className="space-y-8">
      <section className="rounded-lg bg-brand px-5 py-8 text-brand-foreground">
        <h1 className="text-display">{t('portal.home_title')}</h1>
        <p className="mt-2 max-w-prose text-base opacity-90">{greeting || t('portal.greeting_default')}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button asChild size="lg" className="bg-brand-foreground text-brand hover:brightness-95">
            <Link to={`/${slug}/book`} data-testid="cta-book">
              <CalendarPlus aria-hidden="true" />
              {t('portal.hero.book')}
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="secondary"
            className="border-brand-foreground/50 bg-transparent text-brand-foreground hover:bg-brand-foreground/10"
          >
            <Link to={`/${slug}/track`} data-testid="cta-track">
              <Search aria-hidden="true" />
              {t('portal.hero.track')}
            </Link>
          </Button>
        </div>
      </section>

      <section aria-labelledby="home-services">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="home-services" className="text-h2">
            {t('portal.hero.services_title')}
          </h2>
          <Link to={`/${slug}/services`} className="text-sm text-primary hover:underline">
            {t('portal.services.all_services')}
          </Link>
        </div>
        {featured.length === 0 ? (
          <EmptyState
            title={t('portal.services.empty_title')}
            description={t('portal.services.empty_body')}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {featured.map((s) => (
              <ServiceCard
                key={s.id}
                service={s}
                locale={locale}
                bookTo={`/${slug}/book?service=${s.id}`}
                detailTo={`/${slug}/services/${s.id}`}
                compact
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
