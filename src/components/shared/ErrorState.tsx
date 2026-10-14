import { AlertTriangle, RefreshCw, WifiOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface ErrorStateProps {
  /** What happened. Defaults to the generic message. */
  title?: string | undefined;
  /** What to do about it. */
  description?: string | undefined;
  /** Only pass when retrying is safe (reads, idempotent writes). */
  onRetry?: (() => void) | undefined;
  retrying?: boolean | undefined;
  offline?: boolean | undefined;
  className?: string;
}

/** Contextual error: explains what happened and what to do; Retry only appears when the caller says it is safe. */
export function ErrorState({ title, description, onRetry, retrying, offline, className }: ErrorStateProps) {
  const { t } = useTranslation();
  const Icon = offline ? WifiOff : AlertTriangle;
  return (
    <div
      role="alert"
      className={cn(
        'flex flex-col items-center justify-center rounded-lg border border-error/30 bg-error-tint/40 px-6 py-10 text-center',
        className,
      )}
      data-state="error"
    >
      <Icon className="mb-3 size-8 text-error" aria-hidden="true" />
      <h3 className="text-h3 text-text">
        {title ?? (offline ? t('errors.offline_title') : t('errors.generic_title'))}
      </h3>
      <p className="mt-2 max-w-md text-body text-text-muted">
        {description ?? (offline ? t('errors.offline_body') : t('errors.generic_body'))}
      </p>
      {onRetry && (
        <Button
          variant="secondary"
          className="mt-5"
          onClick={onRetry}
          loading={retrying ?? false}
          loadingLabel={t('common.loading')}
        >
          <RefreshCw aria-hidden="true" />
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}
