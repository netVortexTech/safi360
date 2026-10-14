import { useTranslation } from 'react-i18next';

/** Phase 0 placeholder for /control. */
export default function ControlHome() {
  const { t } = useTranslation();
  return (
    <section>
      <h1 className="text-h1">{t('control.title')}</h1>
      <p className="mt-2 text-text-muted">{t('control.foundation_notice')}</p>
    </section>
  );
}
