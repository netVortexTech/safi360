import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';

/** Route-level skeleton while a lazy chunk loads. Mirrors a page header + card so nothing jumps. */
export function RouteLoading() {
  const { t } = useTranslation();
  return (
    <div className="p-4 md:p-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t('common.loading')}</span>
      <Skeleton className="mb-2 h-4 w-40" />
      <Skeleton className="mb-6 h-8 w-64" />
      <Skeleton className="h-48 w-full rounded-lg" />
    </div>
  );
}
