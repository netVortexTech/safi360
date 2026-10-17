import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { EmptyState } from '@/components/shared/EmptyState';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { formatDateTime } from '@/lib/dates';
import { useFieldJobs } from '../hooks';

export default function FieldAlerts() {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'sw';
  const jobs = useFieldJobs();
  const now = new Date().toISOString();
  const alerts = (jobs.data ?? []).filter(
    (job) => !['COMPLETED', 'CLOSED'].includes(job.status) && job.scheduled_start < now,
  );
  return (
    <section className="animate-fade-in space-y-5">
      <header>
        <h1 className="text-h1">{t('field.alerts_title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('field.jobs_count', { count: alerts.length })}</p>
      </header>
      {alerts.length === 0 ? (
        <EmptyState icon={<CheckCircle2 aria-hidden="true" />} title={t('field.no_alerts')} />
      ) : (
        <div className="space-y-3">
          {alerts.map((job) => (
            <Link
              key={job.assignment_id}
              to={`/field/jobs/${job.booking_id}`}
              className="flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-tint/60 p-4 transition-colors hover:border-warning/50"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-warning shadow-xs">
                <AlertTriangle className="size-5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="tabular text-sm font-semibold text-text">{job.ticket_ref}</span>
                  <StatusBadge status={job.status} />
                </div>
                <p className="mt-1 text-sm text-text-muted">
                  {t('field.alert_overdue', {
                    name: job.customer_first_name,
                    time: formatDateTime(job.scheduled_start, locale),
                  })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
