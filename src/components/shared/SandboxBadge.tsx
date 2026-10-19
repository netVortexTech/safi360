import { FlaskConical } from '@/components/ui/icons';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { isSandbox } from '@/lib/env';

/**
 * Visible marker that a mock/sandbox adapter is in use. Renders nothing in production,
 * so a production bundle can never show "Sandbox" by accident — and a mock adapter is
 * never wired up there in the first place.
 */
export function SandboxBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  if (!isSandbox) return null;
  return (
    <Badge tone="amber" className={className} data-sandbox>
      <FlaskConical aria-hidden="true" />
      {t('common.sandbox')}
    </Badge>
  );
}

/** "Sample data" marker used on screens showing seeded demo data. */
export function SampleDataBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <Badge tone="outline" className={`border-dashed ${className ?? ''}`}>
      {t('common.sample_data')}
    </Badge>
  );
}
