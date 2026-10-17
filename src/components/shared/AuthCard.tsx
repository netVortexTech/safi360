import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface AuthCardProps {
  /** Small line under the product name (e.g. "Operations" or "Control center"). */
  subtitle?: string | undefined;
  children: ReactNode;
  className?: string;
}

/**
 * Shared sign-in shell: a centred card on a soft canvas wash. Used by the ops, control
 * and cleaner sign-in screens so all four experiences open with the same calm frame.
 */
export function AuthCard({ subtitle, children, className }: AuthCardProps) {
  const { t } = useTranslation();
  return (
    <main className="canvas-wash flex min-h-dvh items-center justify-center bg-surface-page p-4 sm:p-6">
      <div
        className={cn(
          'w-full max-w-[400px] animate-fade-up rounded-2xl border border-border bg-surface p-7 shadow-lifted sm:p-8',
          className,
        )}
      >
        <div className="mb-7 flex items-center gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-bold text-primary-foreground shadow-xs">
            S
          </span>
          <div className="min-w-0">
            <div className="text-base font-semibold leading-tight text-text">{t('app.name')}</div>
            {subtitle && <div className="truncate text-caption text-text-subtle">{subtitle}</div>}
          </div>
        </div>
        {children}
      </div>
    </main>
  );
}
