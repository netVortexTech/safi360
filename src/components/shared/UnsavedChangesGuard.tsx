import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBlocker } from 'react-router-dom';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

/**
 * Blocks in-app navigation and tab close while a long form has unsaved edits.
 * Mount inside a data router (createBrowserRouter / createMemoryRouter).
 */
export function UnsavedChangesGuard({ when }: { when: boolean }) {
  const { t } = useTranslation();
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) => when && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!when) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [when]);

  useEffect(() => {
    if (blocker.state === 'blocked' && !when) blocker.reset();
  }, [blocker, when]);

  return (
    <ConfirmDialog
      open={blocker.state === 'blocked'}
      onOpenChange={(open) => {
        if (!open && blocker.state === 'blocked') blocker.reset();
      }}
      title={t('common.unsaved_title')}
      description={t('common.unsaved_body')}
      confirmLabel={t('common.discard')}
      cancelLabel={t('common.keep_editing')}
      destructive
      onConfirm={() => blocker.state === 'blocked' && blocker.proceed()}
    />
  );
}
