import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useNavigate, useRouteError } from 'react-router-dom';
import { ErrorState } from '@/components/shared/ErrorState';

/** Error boundary for a whole experience. Chunk-load failures are retried by reloading. */
export function RouteError() {
  const { t } = useTranslation();
  const error = useRouteError();
  const navigate = useNavigate();

  if (isRouteErrorResponse(error) && error.status === 404) {
    return (
      <div className="p-4 md:p-8">
        <ErrorState title={t('errors.not_found_title')} description={t('errors.not_found_body')} />
      </div>
    );
  }

  const isChunkError =
    error instanceof Error &&
    /Failed to fetch dynamically imported module|Loading chunk/i.test(error.message);

  return (
    <div className="p-4 md:p-8">
      <ErrorState
        onRetry={() => {
          if (isChunkError) window.location.reload();
          else void navigate(0);
        }}
      />
    </div>
  );
}
