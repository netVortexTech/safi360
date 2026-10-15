import { useTranslation } from 'react-i18next';
import { useFieldJobs } from '../hooks';
import { JobCard } from '../components/JobCard';

export default function FieldUpcoming() {
  const { t } = useTranslation();
  const jobs = useFieldJobs();
  const now = new Date().toISOString();
  const items = (jobs.data ?? []).filter(
    (job) =>
      !['COMPLETED', 'CLOSED', 'CANCELLED', 'NO_SHOW', 'EXPIRED'].includes(job.status) &&
      job.scheduled_start > now,
  );
  return (
    <section className="space-y-4">
      <h1 className="text-h1">{t('field.upcoming_title', { defaultValue: 'Upcoming jobs' })}</h1>
      {items.map((job) => (
        <JobCard key={job.assignment_id} job={job} />
      ))}
      {!items.length && (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-text-muted">
          {t('field.no_upcoming')}
        </p>
      )}
    </section>
  );
}
