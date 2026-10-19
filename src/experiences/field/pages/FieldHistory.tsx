import { useTranslation } from 'react-i18next';
import { Skeleton } from '@/components/ui/skeleton';
import { useFieldJobs } from '../hooks';
import { JobCard } from '../components/JobCard';

export default function FieldHistory() {
  const { t } = useTranslation();
  const jobs = useFieldJobs();
  if (jobs.isLoading) {
    return (
      <section className="space-y-4" aria-busy="true">
        <h1 className="text-h1">{t('field.history_title', { defaultValue: 'History' })}</h1>
        <Skeleton className="h-40 rounded-xl" />
      </section>
    );
  }
  const items = (jobs.data ?? []).filter((job) =>
    ['COMPLETED', 'CLOSED', 'CANCELLED', 'NO_SHOW', 'EXPIRED'].includes(job.status),
  );
  return (
    <section className="space-y-4">
      <h1 className="text-h1">{t('field.history_title', { defaultValue: 'History' })}</h1>
      {items.map((job) => (
        <JobCard key={job.assignment_id} job={job} />
      ))}
      {!items.length && (
        <p className="rounded-xl border border-border bg-surface p-6 text-center text-text-muted">
          {t('field.no_history')}
        </p>
      )}
    </section>
  );
}
