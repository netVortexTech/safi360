import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string | undefined;
  /** Primary and secondary actions, rendered side by side. */
  actions?: ReactNode;
  className?: string;
}

/** Purposeful empty state: says what will appear here and offers the next action. */
export function EmptyState({ icon, title, description, actions, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex animate-fade-in flex-col items-center justify-center px-6 py-14 text-center',
        className,
      )}
      data-state="empty"
    >
      {icon && (
        <div className="mb-5 flex size-14 items-center justify-center rounded-2xl bg-surface-muted text-text-subtle [&_svg]:size-6 [&_svg]:stroke-[1.5]">
          {icon}
        </div>
      )}
      <h3 className="text-h3 text-text">{title}</h3>
      {description && <p className="mt-2 max-w-md text-pretty text-body text-text-muted">{description}</p>}
      {actions && <div className="mt-6 flex flex-wrap items-center justify-center gap-3">{actions}</div>}
    </div>
  );
}
