import { Clock, MapPin, Phone, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { FieldJob } from '../hooks';

export function JobCard({ job }: { job: FieldJob }) {
  const address = job.address;
  return (
    <Link to={`/field/jobs/${job.booking_id}`} className="block rounded-xl border border-border bg-surface p-4 shadow-card active:scale-[0.99]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-text-subtle">{job.ticket_ref}</p>
          <h3 className="mt-1 text-base font-semibold">{job.customer_first_name}</h3>
        </div>
        <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium">{String(job.status).replace(/_/g, ' ')}</span>
      </div>
      <div className="mt-3 space-y-2 text-sm text-text-muted">
        <p className="flex items-center gap-2"><Clock className="size-4" /> {job.scheduled_start.replace('T', ' ').slice(11, 16)} - {job.scheduled_end.replace('T', ' ').slice(11, 16)}</p>
        {address.landmark || address.area ? <p className="flex items-center gap-2"><MapPin className="size-4" /> {address.landmark ?? address.area}</p> : null}
        <p className="flex items-center gap-2"><Wrench className="size-4" /> {job.services.map((s) => s.label_en).join(', ') || tFallback(job)}</p>
      </div>
      {job.customer_phone ? (
        <a href={`tel:${job.customer_phone}`} className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary" onClick={(e) => e.stopPropagation()}>
          <Phone className="size-4" /> {job.customer_phone}
        </a>
      ) : null}
    </Link>
  );
}

function tFallback(job: FieldJob) {
  return job.services.length ? '' : 'Service';
}
