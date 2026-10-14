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
    <div className="space-y-6">
      <header>
        <h1 className="text-h1">{t('portal.services.title')}</h1>
        <p className="text-sm text-text-muted">{t('portal.services.subtitle')}</p>
      </header>
      {groups.length === 0 ? (
        <EmptyState title={t('portal.services.empty_title')} description={t('portal.services.empty_body')} />
      ) : (
        groups.map((g) => (
          <section key={g.key} aria-label={g.title ?? undefined}>
            {g.title && <h2 className="mb-3 text-h3 text-text-muted">{g.title}</h2>}
            <div className="grid gap-3 md:grid-cols-2">
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
