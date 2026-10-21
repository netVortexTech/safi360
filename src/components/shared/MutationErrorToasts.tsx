import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/toast';
import { errorKey } from '@/lib/errors';

/**
 * Safety net so no mutation ever fails silently: any mutation error that the calling
 * screen does not handle itself (no onError of its own) surfaces as an error toast with
 * a translated, human-readable reason. Screens that render their own error UI keep it.
 */
export function MutationErrorToasts() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    return queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== 'updated' || event.action.type !== 'error') return;
      // Screens that report the failure themselves: an onError callback, or a hook
      // whose consumers render the mutation error inline (meta.errorHandled).
      if (event.mutation.options.onError || event.mutation.meta?.errorHandled) return;
      toast({
        title: t('errors.generic_title'),
        description: t(errorKey(event.action.error)),
        tone: 'error',
      });
    });
  }, [queryClient, t, toast]);

  return null;
}
