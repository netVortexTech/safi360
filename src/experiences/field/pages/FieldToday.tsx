import { CalendarCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/shared/EmptyState';
import { ErrorState } from '@/components/shared/ErrorState';
import { dayKey } from '@/lib/dates';
import { useFieldJobs } from '../hooks';
import { JobCard } from '../components/JobCard';

export default function FieldToday() {
  const { t } = useTranslation();
  const jobs = useFieldJobs();
  const today = dayKey(new Date());
  const todaysJobs = (jobs.data ?? []).filter((job) => job.scheduled_start.slice(0, 10) === today);
  const activeJobs = (jobs.data ?? []).filter(
    (job) => !['COMPLETED', 'CLOSED', 'CANCELLED', 'NO_SHOW', 'EXPIRED'].includes(job.status),
  );

  if (jobs.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="h-8 w-40 animate-pulse rounded-lg bg-surface-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-surface-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-surface-muted" />
      </div>
    );
  }
  if (jobs.error) {
    return (
      <ErrorState
        onRetry={() => void jobs.refetch()}
        retrying={jobs.isFetching}
        description={t('errors.generic_body')}
      />
    );
  }

  const items = todaysJobs.length ? todaysJobs : activeJobs;
  return (
    <div className="animate-fade-in space-y-5">
      <header>
        <h1 className="text-h1">{t('field.today_title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('field.jobs_count', { count: items.length })}</p>
      </header>
      {items.length ? (
        <section className="space-y-3">
          {items.map((job) => (
            <JobCard key={job.assignment_id} job={job} />
          ))}
        </section>
      ) : (
        <EmptyState icon={<CalendarCheck aria-hidden="true" />} title={t('field.no_jobs_today')} />
      )}
    </div>
  );
}
