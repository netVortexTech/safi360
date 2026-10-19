import { useTranslation } from 'react-i18next';
import { AlertTriangle } from '@/components/ui/icons';
import { useFieldJobs } from '../hooks';

export default function FieldAlerts() {
  const { t } = useTranslation();
  const jobs = useFieldJobs();
  const now = new Date().toISOString();
  const alerts = (jobs.data ?? []).filter(
    (job) => !['COMPLETED', 'CLOSED'].includes(job.status) && job.scheduled_start < now,
  );
  return (
    <section className="space-y-4">
      <h1 className="text-h1">{t('field.alerts_title', { defaultValue: 'Alerts' })}</h1>
      {!alerts.length && (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-text-muted">
          {t('field.no_alerts')}
        </p>
      )}
      {alerts.map((job) => (
        <a
          key={job.assignment_id}
          href={`/field/jobs/${job.booking_id}`}
          className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/5 p-4"
        >
          <AlertTriangle className="size-5 text-warning" />
          <div>
            <p className="font-semibold">{job.ticket_ref}</p>
            <p className="text-sm text-text-muted">
              {job.customer_first_name} is overdue since {job.scheduled_start.replace('T', ' ').slice(0, 16)}
            </p>
          </div>
        </a>
      ))}
    </section>
  );
}
