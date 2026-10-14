import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

/** Phase 0 placeholder for /:slug. Booking flow and tracking arrive in Phase 3. */
export default function PortalHome() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  return (
    <section>
      <h1 className="text-h1">{t('portal.home_title')}</h1>
      <p className="mt-2 text-text-muted">{t('portal.coming_soon', { tenant: slug })}</p>
    </section>
  );
}
