import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/shared/EmptyState';
import { ServiceCard } from '../components/ServiceCard';
import { pick, usePortal } from '../context';

export default function ServicesPage() {
  const { t } = useTranslation();
  const { slug, catalog, locale } = usePortal();
  const categories = [...catalog.categories].sort((a, b) => a.sort - b.sort);
  const groups = [
    ...categories.map((c) => ({
      key: c.id,
      title: pick(c, locale),
      services: catalog.services.filter((s) => s.category_id === c.id),
    })),
    {
      key: 'other',
      title: null,
      services: catalog.services.filter(
        (s) => !s.category_id || !categories.some((c) => c.id === s.category_id),
      ),
    },
  ].filter((g) => g.services.length > 0);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-caption uppercase tracking-eyebrow text-text-subtle">{t('portal.nav.services')}</p>
        <h1 className="mt-1.5 text-h1">{t('portal.services.title')}</h1>
        <p className="mt-1.5 max-w-2xl text-body text-text-muted">{t('portal.services.subtitle')}</p>
      </header>
      {groups.length === 0 ? (
        <EmptyState title={t('portal.services.empty_title')} description={t('portal.services.empty_body')} />
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-label={g.title ?? undefined} className="space-y-4">
            {g.title && (
              <h2 className="flex items-center gap-3 text-h3 text-text">
                <span className="h-4 w-1 rounded-full bg-primary" aria-hidden="true" />
                {g.title}
              </h2>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              {g.services.map((s) => (
                <ServiceCard
                  key={s.id}
                  service={s}
                  locale={locale}
                  bookTo={`/${slug}/book?service=${s.id}`}
                  detailTo={`/${slug}/services/${s.id}`}
                />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
