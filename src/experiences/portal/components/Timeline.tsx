import { CheckCircle2, Circle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { TrackingViewResponse } from '@shared/handlers/tracking';
import { formatDateTime } from '@/lib/dates';
import { formatTzs } from '@/lib/money';

export interface TimelineProps {
  events: TrackingViewResponse['timeline'];
  locale: 'sw' | 'en';
}

/** Customer tracking timeline (Design system → Timelines): what happened, when. */
export function Timeline({ events, locale }: TimelineProps) {
  const { t } = useTranslation();
  return (
    <ol className="relative space-y-4 border-l border-border pl-6" data-testid="timeline">
      {events.map((e, i) => {
        const last = i === events.length - 1;
        const Icon = last ? CheckCircle2 : Circle;
        const amount = typeof e.data.amount_tzs === 'number' ? formatTzs(e.data.amount_tzs) : null;
        const reason =
          typeof e.data.reason === 'string' && !/^[a-z_]+$/.test(e.data.reason) ? e.data.reason : null;
        return (
          <li key={`${e.at}-${i}`} className="relative">
            <Icon
              className={`absolute -left-[1.85rem] top-0.5 size-5 ${last ? 'text-primary' : 'text-text-subtle'}`}
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-text">
              {t(e.message_key ?? (e.to_status ? `status.${e.to_status}` : `event.${e.kind}`))}
              {amount && <span className="tabular text-text-muted"> · {amount}</span>}
            </p>
            {reason && <p className="text-sm text-text-muted">{reason}</p>}
            <p className="text-xs text-text-subtle">{formatDateTime(e.at, locale)}</p>
          </li>
        );
      })}
    </ol>
  );
}
