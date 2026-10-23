import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardBody } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export type StatTone = 'primary' | 'success' | 'warning' | 'info' | 'neutral';

const TONES: Record<StatTone, string> = {
  primary: 'bg-primary-light text-primary',
  success: 'bg-success-tint text-success',
  warning: 'bg-warning-tint text-warning',
  info: 'bg-info-tint text-info',
  neutral: 'bg-surface-muted text-text-muted',
};

export interface StatTileProps {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  tone?: StatTone;
  /** When set the whole tile becomes a link to a filtered view. */
  to?: string;
  className?: string;
}

/** KPI tile shared by the ops and platform dashboards: eyebrow label, icon bubble, tabular value. */
export function StatTile({ label, value, icon, tone = 'primary', to, className }: StatTileProps) {
  const body = (
    <CardBody className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-caption tracking-eyebrow uppercase text-text-subtle">{label}</p>
        {icon ? (
          <span
            className={cn('flex size-9 shrink-0 items-center justify-center rounded-lg', TONES[tone])}
            aria-hidden="true"
          >
            {icon}
          </span>
        ) : null}
      </div>
      <p className="tabular mt-3 text-h1 text-text">{value}</p>
    </CardBody>
  );
  if (to) {
    return (
      <Card interactive className={className}>
        <Link to={to} className="block rounded-xl focus-visible:outline-none">
          {body}
        </Link>
      </Card>
    );
  }
  return (
    <Card role="listitem" className={className}>
      {body}
    </Card>
  );
}
