import { Clock, MapPin, Phone, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatTime } from '@/lib/dates';
import type { FieldJob } from '../hooks';

export function JobCard({ job }: { job: FieldJob }) {
  const { t, i18n } = useTranslation();
  const address = job.address;
  const useSw = i18n.resolvedLanguage !== 'en';
  const locale = useSw ? 'sw' : 'en';

  const serviceLabels = job.services
    .map((s) => (useSw ? s.label_sw || s.label_en : s.label_en || s.label_sw))
    .filter(Boolean);

  return (
    <Link
      to={`/field/jobs/${job.booking_id}`}
      className="block rounded-xl border border-border bg-surface p-4 shadow-card transition-[box-shadow,border-color,transform] duration-200 ease-premium hover:border-border-strong hover:shadow-lifted active:scale-[0.99]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="tabular text-caption text-text-subtle">{job.ticket_ref}</p>
          <h3 className="mt-0.5 truncate text-h3 text-text">{job.customer_first_name}</h3>
        </div>
        <StatusBadge status={job.status} className="shrink-0" />
      </div>

      <div className="mt-3 space-y-2 text-sm text-text-muted">
        <p className="flex items-center gap-2">
          <Clock className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
          <span className="tabular">
            {formatTime(job.scheduled_start, locale)} – {formatTime(job.scheduled_end, locale)}
          </span>
        </p>
        {(address.landmark || address.area) && (
          <p className="flex items-center gap-2">
            <MapPin className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
            <span className="truncate">{address.landmark ?? address.area}</span>
          </p>
        )}
        <p className="flex items-center gap-2">
          <Sparkles className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
          <span className="truncate">{serviceLabels.join(', ') || t('field.service_fallback')}</span>
        </p>
      </div>

      {job.customer_phone && (
        <a
          href={`tel:${job.customer_phone}`}
          className="mt-3 inline-flex items-center gap-2 rounded-lg py-1 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
          onClick={(e) => e.stopPropagation()}
        >
          <Phone className="size-4" aria-hidden="true" />
          <span className="tabular">{job.customer_phone}</span>
        </a>
      )}
    </Link>
  );
}
