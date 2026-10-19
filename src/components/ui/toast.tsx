import { CheckCircle2, Info, X, XCircle } from '@/components/ui/icons';
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastInput {
  title: string;
  description?: string | undefined;
  tone?: ToastTone;
  /** ms; errors stay until dismissed by default */
  duration?: number;
}

interface ToastItem extends ToastInput {
  id: number;
  tone: ToastTone;
}

interface ToastApi {
  toast: (input: ToastInput) => void;
  dismiss: (id: number) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICON = { success: CheckCircle2, error: XCircle, info: Info } as const;
const STYLE = {
  success: 'border-success/40 [&_svg.tone]:text-success',
  error: 'border-error/40 [&_svg.tone]:text-error',
  info: 'border-info/40 [&_svg.tone]:text-info',
} as const;

/**
 * Lightweight toasts for routine success/failure. Final state must also be visible on
 * the page itself (ui-spec); a toast is confirmation, never the only evidence.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setItems((list) => list.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    (input: ToastInput) => {
      const id = ++seq.current;
      const tone = input.tone ?? 'success';
      const duration = input.duration ?? (tone === 'error' ? 0 : 5000);
      setItems((list) => [...list, { ...input, id, tone }]);
      if (duration > 0) timers.current.set(id, setTimeout(() => dismiss(id), duration));
    },
    [dismiss],
  );

  const api = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <ToastViewport items={items} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

function ToastViewport({ items, onDismiss }: { items: ToastItem[]; onDismiss: (id: number) => void }) {
  const { t } = useTranslation();
  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed inset-x-4 bottom-20 z-50 flex flex-col items-end gap-2 md:inset-x-auto md:bottom-4 md:right-4"
    >
      {items.map((item) => {
        const Icon = ICON[item.tone];
        return (
          <div
            key={item.id}
            role={item.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border bg-surface p-3 shadow-sheet',
              STYLE[item.tone],
            )}
            data-toast={item.tone}
          >
            <Icon className="tone mt-0.5 size-5 shrink-0" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-text">{item.title}</p>
              {item.description && <p className="mt-0.5 text-sm text-text-muted">{item.description}</p>}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(item.id)}
              aria-label={t('common.close')}
              className="-m-1 rounded p-1 text-text-subtle hover:bg-surface-muted hover:text-text"
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error('useToast must be used inside <ToastProvider>');
  return api;
}
