import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  to?: string;
}

export interface PageHeaderProps {
  /** Small uppercase label above the title (e.g. a section or category). */
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Chips next to the title (e.g. StatusBadge, SandboxBadge). */
  badges?: ReactNode;
  /** Right-aligned actions; wrap on mobile. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  breadcrumbs,
  badges,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn('mb-7 animate-fade-up', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-3">
          <ol className="flex flex-wrap items-center gap-1 text-small text-text-subtle">
            {breadcrumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && (
                  <ChevronRight className="size-3.5 shrink-0 text-text-subtle/60" aria-hidden="true" />
                )}
                {c.to ? (
                  <Link to={c.to} className="rounded transition-colors hover:text-text">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page" className="text-text-muted">
                    {c.label}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          {eyebrow && (
            <p className="mb-1.5 text-caption uppercase tracking-eyebrow text-text-subtle">{eyebrow}</p>
          )}
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-h1 text-text">{title}</h1>
            {badges}
          </div>
          {subtitle && <p className="mt-1.5 max-w-2xl text-body text-text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
      </div>
    </header>
  );
}
