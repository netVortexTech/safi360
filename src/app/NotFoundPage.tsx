import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/shared/ErrorState';

export function NotFoundPage() {
  const { t } = useTranslation();
  return (
    <main className="mx-auto max-w-lg p-4 md:p-8">
      <ErrorState title={t('errors.not_found_title')} description={t('errors.not_found_body')} />
    </main>
  );
}
