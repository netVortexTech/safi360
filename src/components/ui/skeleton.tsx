import type { HTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

/** Deterministic skeleton: give it the same box as the content it replaces to avoid layout shift. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded bg-surface-muted', className)} {...props} />;
}
