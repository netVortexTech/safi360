import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface Crumb {
  label: string;
  to?: string;
}

export interface PageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  breadcrumbs?: Crumb[];
  /** Chips next to the title (e.g. StatusBadge, SandboxBadge). */
  badges?: ReactNode;
  /** Right-aligned actions; wrap on mobile. */
  actions?: ReactNode;
  className?: string;
}

export function PageHeader({ title, subtitle, breadcrumbs, badges, actions, className }: PageHeaderProps) {
  // Browser tab mirrors the page title, so history and open tabs stay tellable apart.
  useEffect(() => {
    if (typeof title !== 'string' || !title) return;
    const previous = document.title;
    document.title = `${title} · Safi360`;
    return () => {
      document.title = previous;
    };
  }, [title]);
  return (
    <header className={cn('mb-6', className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 text-sm text-text-subtle">
          <ol className="flex flex-wrap items-center gap-1">
            {breadcrumbs.map((c, i) => (
              <li key={`${c.label}-${i}`} className="flex items-center gap-1">
                {i > 0 && <span aria-hidden="true">/</span>}
                {c.to ? (
                  <Link to={c.to} className="hover:text-text hover:underline">
                    {c.label}
                  </Link>
                ) : (
                  <span aria-current="page">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-h1 text-text">{title}</h1>
            {badges}
          </div>
          {subtitle && <p className="mt-1 text-body text-text-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
      </div>
    </header>
  );
}
