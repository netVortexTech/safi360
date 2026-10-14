import { useTranslation } from 'react-i18next';
import { dayKey } from '@/lib/dates';
import { useFieldJobs } from '../hooks';
import { JobCard } from '../components/JobCard';

export default function FieldToday() {
  const { t } = useTranslation();
  const jobs = useFieldJobs();
  const today = dayKey(new Date());
  const todaysJobs = (jobs.data ?? []).filter((job) => job.scheduled_start.slice(0, 10) === today);
  const activeJobs = (jobs.data ?? []).filter((job) => !['COMPLETED', 'CLOSED', 'CANCELLED', 'NO_SHOW', 'EXPIRED'].includes(job.status));

  if (jobs.isLoading) {
    return <div className="h-40 animate-pulse rounded-xl bg-surface-muted" aria-busy="true" />;
  }
  if (jobs.error) {
    return <p className="text-center text-error">{String(jobs.error)}</p>;
  }

  const items = todaysJobs.length ? todaysJobs : activeJobs;
  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-h1">{t('field.today_title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{items.length} jobs</p>
      </header>
      {items.length ? (
        <section className="space-y-3">
          {items.map((job) => (
            <JobCard key={job.assignment_id} job={job} />
          ))}
        </section>
      ) : (
        <div className="rounded-xl border border-border bg-surface p-6 text-center text-text-muted">No jobs today.</div>
      )}
    </div>
  );
}
