import { CalendarClock, CalendarPlus, ClipboardList, MapPin, Phone, PhoneCall, Search } from 'lucide-react';
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

  const steps = [
    { key: 'services', icon: ClipboardList },
    { key: 'location', icon: MapPin },
    { key: 'time', icon: CalendarClock },
    { key: 'contact', icon: PhoneCall },
  ] as const;

  return (
    <div className="space-y-12">
      <section className="relative overflow-hidden rounded-2xl bg-brand px-6 py-10 text-brand-foreground shadow-lifted sm:px-10 sm:py-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-24 size-64 rounded-full bg-brand-foreground/10 blur-2xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-28 -left-12 size-56 rounded-full bg-brand-foreground/5 blur-2xl"
        />
        <div className="relative max-w-xl animate-fade-up">
          <p className="text-caption uppercase tracking-eyebrow text-brand-foreground/70">
            {tenant.branding.display_name || tenant.name}
          </p>
          <h1 className="mt-3 text-hero">{t('portal.home_title')}</h1>
          <p className="mt-4 text-pretty text-base text-brand-foreground/85 sm:text-lg">
            {greeting || t('portal.greeting_default')}
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            <Button asChild size="lg" className="bg-brand-foreground text-brand hover:bg-brand-foreground/90">
              <Link to={`/${slug}/book`} data-testid="cta-book">
                <CalendarPlus aria-hidden="true" />
                {t('portal.hero.book')}
              </Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="secondary"
              className="border-transparent bg-brand-foreground/15 text-brand-foreground shadow-none hover:bg-brand-foreground/25"
            >
              <Link to={`/${slug}/track`} data-testid="cta-track">
                <Search aria-hidden="true" />
                {t('portal.hero.track')}
              </Link>
            </Button>
          </div>
          <a
            href={`tel:${tenant.phone_e164}`}
            className="mt-6 inline-flex items-center gap-2 text-sm text-brand-foreground/80 hover:text-brand-foreground"
          >
            <Phone className="size-4" aria-hidden="true" />
            {t('portal.hero.call', { phone: tenant.phone_e164 })}
          </a>
        </div>
      </section>

      <section aria-labelledby="home-services">
        <div className="mb-4 flex items-end justify-between gap-3">
          <h2 id="home-services" className="text-h2">
            {t('portal.hero.services_title')}
          </h2>
          <Link
            to={`/${slug}/services`}
            className="whitespace-nowrap text-sm font-medium text-primary hover:underline"
          >
            {t('portal.services.all_services')}
          </Link>
        </div>
        {featured.length === 0 ? (
          <EmptyState
            title={t('portal.services.empty_title')}
            description={t('portal.services.empty_body')}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
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

      <section
        aria-labelledby="home-how"
        className="rounded-2xl border border-border bg-surface p-6 shadow-card sm:p-8"
      >
        <h2 id="home-how" className="text-h2">
          {t('portal.how.title')}
        </h2>
        <p className="mt-1.5 max-w-2xl text-body text-text-muted">{t('portal.how.body')}</p>
        <ol className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <li key={step.key} className="flex gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-light text-sm font-semibold text-primary">
                {i + 1}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-sm font-semibold text-text">
                  <step.icon className="size-4 text-text-subtle" aria-hidden="true" />
                  {t(`portal.steps.${step.key}`)}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative overflow-hidden rounded-2xl border border-border bg-surface-muted/60 px-6 py-8 text-center sm:px-10">
        <h2 className="text-h2">{t('portal.home_title')}</h2>
        <p className="mx-auto mt-2 max-w-md text-body text-text-muted">{t('portal.greeting_default')}</p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <Button asChild size="lg">
            <Link to={`/${slug}/book`}>
              <CalendarPlus aria-hidden="true" />
              {t('portal.hero.book')}
            </Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <a href={`tel:${tenant.phone_e164}`}>
              <Phone aria-hidden="true" />
              {t('portal.hero.call', { phone: tenant.phone_e164 })}
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
