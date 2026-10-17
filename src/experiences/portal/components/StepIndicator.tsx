import { Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

export interface StepIndicatorProps {
  labels: string[];
  current: number;
  /** Indexes the visitor may jump back to. */
  reachable: number;
  onSelect: (index: number) => void;
  className?: string;
}

/** Numbered steps with ticks for the ones done. A slim progress bar stands in on phones. */
export function StepIndicator({ labels, current, reachable, onSelect, className }: StepIndicatorProps) {
  const { t } = useTranslation();
  const progress = labels.length ? ((current + 1) / labels.length) * 100 : 0;
  return (
    <nav
      aria-label={t('portal.stepper.title')}
      className={cn('rounded-xl border border-border bg-surface p-3 shadow-card', className)}
    >
      {/* Phones: the step name plus a progress bar reads better than five cramped circles. */}
      <div className="md:hidden">
        <div className="flex items-center justify-between gap-3">
          <span className="truncate text-sm font-medium text-text">{labels[current]}</span>
          <span className="shrink-0 text-caption text-text-subtle">
            {t('portal.steps.step_of', { n: current + 1, total: labels.length })}
          </span>
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-muted"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={labels.length}
          aria-valuenow={current + 1}
        >
          <div
            className="h-full rounded-full bg-primary transition-[width] duration-500 ease-premium"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ol className="hidden items-center gap-2 md:flex">
        {labels.map((label, i) => {
          const done = i < current;
          const active = i === current;
          const canGo = i <= reachable && i !== current;
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-2">
              <button
                type="button"
                onClick={() => canGo && onSelect(i)}
                disabled={!canGo}
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'flex items-center gap-2 rounded-lg px-1.5 py-1 text-sm transition-colors duration-200 ease-premium disabled:cursor-default',
                  canGo && 'hover:bg-surface-muted',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border text-caption font-semibold transition-colors',
                    active && 'border-primary bg-primary text-primary-foreground',
                    done && 'border-primary bg-primary-light text-primary',
                    !active && !done && 'border-border-strong text-text-subtle',
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                </span>
                <span className={cn('truncate', active ? 'font-medium text-text' : 'text-text-muted')}>
                  {label}
                </span>
              </button>
              {i < labels.length - 1 && (
                <span
                  className={cn('h-px flex-1', done ? 'bg-primary/40' : 'bg-border')}
                  aria-hidden="true"
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
