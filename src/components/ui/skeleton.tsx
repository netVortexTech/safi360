import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Deterministic skeleton: give it the same box as the content it replaces to avoid layout shift. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn('relative overflow-hidden rounded bg-surface-muted', className)}
      {...props}
    >
      <span className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-surface/70 to-transparent" />
    </div>
  );
}
