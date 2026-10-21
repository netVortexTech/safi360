import { cn } from '@/lib/utils';

export interface ProgressProps {
  /** 0–max. */
  value: number;
  max?: number;
  /** Accessible name; required because the bar has no visible label of its own. */
  label: string;
  className?: string;
}

/** Determinate progress bar for uploads and other long-running work with a known fraction. */
export function Progress({ value, max = 100, label, className }: ProgressProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      aria-label={label}
      className={cn('h-2 w-full overflow-hidden rounded-full bg-surface-muted', className)}
    >
      <div
        className="h-full rounded-full bg-primary transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
