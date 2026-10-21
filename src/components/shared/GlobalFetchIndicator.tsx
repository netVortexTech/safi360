import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * Thin indeterminate bar along the top of the viewport whenever any query or mutation is in
 * flight, so background refetches are visible even on screens that render stale data meanwhile.
 * Appears only after 200ms so fast responses never flash it.
 */
export function GlobalFetchIndicator() {
  const { t } = useTranslation();
  const active = useIsFetching() + useIsMutating() > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!active) {
      setVisible(false);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 200);
    return () => clearTimeout(timer);
  }, [active]);

  if (!visible) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden bg-primary-light"
      role="progressbar"
      aria-label={t('common.loading')}
    >
      <div className="h-full w-1/3 animate-progress rounded-full bg-primary" />
    </div>
  );
}
