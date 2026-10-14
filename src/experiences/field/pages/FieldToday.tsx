import { useTranslation } from 'react-i18next';

/** Phase 0 placeholder for /field. The job queue and lifecycle arrive in Phase 5. */
export default function FieldToday() {
  const { t } = useTranslation();
  return (
    <section>
      <h1 className="text-h1">{t('field.today_title')}</h1>
      <p className="mt-2 text-text-muted">{t('field.foundation_notice')}</p>
    </section>
  );
}
