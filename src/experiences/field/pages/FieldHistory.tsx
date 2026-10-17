import { History } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/shared/EmptyState';
import { useFieldJobs } from '../hooks';
import { JobCard } from '../components/JobCard';

export default function FieldHistory() {
  const { t } = useTranslation();
  const jobs = useFieldJobs();
  const items = (jobs.data ?? []).filter((job) =>
    ['COMPLETED', 'CLOSED', 'CANCELLED', 'NO_SHOW', 'EXPIRED'].includes(job.status),
  );
  return (
    <section className="animate-fade-in space-y-5">
      <header>
        <h1 className="text-h1">{t('field.history_title')}</h1>
        <p className="mt-1 text-sm text-text-muted">{t('field.jobs_count', { count: items.length })}</p>
      </header>
      {items.length ? (
        <div className="space-y-3">
          {items.map((job) => (
            <JobCard key={job.assignment_id} job={job} />
          ))}
        </div>
      ) : (
        <EmptyState icon={<History aria-hidden="true" />} title={t('field.no_history')} />
      )}
    </section>
  );
}
