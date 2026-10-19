import { Check } from '@/components/ui/icons';
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

/** Numbered steps with ticks for the ones done (Create booking stepper); compact text on phones. */
export function StepIndicator({ labels, current, reachable, onSelect, className }: StepIndicatorProps) {
  const { t } = useTranslation();
  return (
    <nav
      aria-label={t('portal.stepper.title')}
      className={cn('rounded-lg border border-border bg-surface', className)}
    >
      <p className="px-4 pt-3 text-sm text-text-muted md:hidden">
        {t('portal.steps.step_of', { n: current + 1, total: labels.length })} ·{' '}
        <span className="font-medium text-text">{labels[current]}</span>
      </p>
      <ol className="flex items-center gap-2 overflow-x-auto px-4 py-3">
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
                  'flex items-center gap-2 rounded px-1 py-0.5 text-sm disabled:cursor-default',
                  canGo && 'hover:bg-surface-muted',
                )}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
                    active && 'border-primary bg-primary text-primary-foreground',
                    done && 'border-primary bg-primary-light text-primary',
                    !active && !done && 'border-border text-text-subtle',
                  )}
                >
                  {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
                </span>
                <span
                  className={cn(
                    'hidden truncate md:inline',
                    active ? 'font-medium text-text' : 'text-text-muted',
                  )}
                >
                  {label}
                </span>
              </button>
              {i < labels.length - 1 && (
                <span className="hidden h-px flex-1 bg-border md:block" aria-hidden="true" />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
