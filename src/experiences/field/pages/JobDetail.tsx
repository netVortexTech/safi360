import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, ArrowLeft, ChevronRight, Clock, MapPin, Phone, Wrench } from '@/components/ui/icons';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import {
  useFieldJob,
  useFieldEvents,
  useFieldTransition,
  useOpenFieldException,
  useAddFieldJobEvent,
} from '../hooks';
import { ErrorState } from '@/components/shared/ErrorState';
import { errorKey } from '@/lib/errors';
import { compressImage } from '../compression';
import { listPhotos, queuePhoto, updatePhoto } from '../queue';
import { uploadQueuedPhoto } from '../uploads';

const statuses = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'] as const;

export default function JobDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const { toast } = useToast();
  const auth = useAuth();
  const qc = useQueryClient();
  const jobQuery = useFieldJob(id);
  const eventsQuery = useFieldEvents(id);
  const transition = useFieldTransition();
  const openException = useOpenFieldException();
  const addEvent = useAddFieldJobEvent();
  const job = jobQuery.data;

  const [beforeCount, setBeforeCount] = useState(0);
  const [afterCount, setAfterCount] = useState(0);
  const [upload, setUpload] = useState<{ current: number; total: number; pct: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [issueCategory, setIssueCategory] = useState('customer_absent');
  const [issueReason, setIssueReason] = useState('');
  const [issueTouched, setIssueTouched] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const beforeInput = useRef<HTMLInputElement>(null);
  const afterInput = useRef<HTMLInputElement>(null);

  const events = useMemo(() => eventsQuery.data ?? [], [eventsQuery.data]);
  useEffect(() => {
    setAccepted(events.some((event) => event.data?.field_action === 'field_accepted'));
  }, [events]);

  const photoPathsBefore = events.flatMap((e) =>
    Array.isArray(e.data?.evidence_before) ? (e.data?.evidence_before as string[]) : [],
  );
  const photoPathsAfter = events.flatMap((e) =>
    Array.isArray(e.data?.evidence_after) ? (e.data?.evidence_after as string[]) : [],
  );

  const photoLinksQuery = useQuery({
    queryKey: ['field', 'evidence-links', id],
    queryFn: async () => {
      const storage = supabase.storage.from('job-evidence');
      const results = await Promise.all(
        [...photoPathsBefore, ...photoPathsAfter].map(async (path) => {
          const { data } = await storage.createSignedUrl(path, 3600);
          return { path, url: data?.signedUrl ?? null };
        }),
      );
      return results;
    },
    enabled: photoPathsBefore.length + photoPathsAfter.length > 0,
  });

  useEffect(() => {
    void listPhotos(id, 'before').then((photos) => setBeforeCount(photos.length));
    void listPhotos(id, 'after').then((photos) => setAfterCount(photos.length));
  }, [id]);

  if (jobQuery.isLoading) return <div className="h-48 animate-pulse rounded-xl bg-surface-muted" />;
  if (jobQuery.error || !job)
    return <ErrorState onRetry={() => void jobQuery.refetch()} />;

  const primaryLabel = () => {
    switch (job.status) {
      case 'ASSIGNED':
        return accepted ? 'Start travel' : 'Accept job';
      case 'EN_ROUTE':
        return 'I have arrived';
      case 'ARRIVED':
        return beforeCount > 0 ? 'Start cleaning' : 'Take before photos';
      case 'IN_PROGRESS':
        return afterCount > 0 ? 'Complete job' : 'Take after photos';
      case 'COMPLETED':
        return 'Submitted for review';
      default:
        return null;
    }
  };

  const primaryAction = async () => {
    setBusy(true);
    setError(null);
    try {
      switch (job.status) {
        case 'ASSIGNED':
          if (!accepted) {
            await addEvent.mutateAsync({
              booking_id: job.booking_id,
              kind: 'note',
              customer_visible: false,
              data: { field_action: 'field_accepted', at: new Date().toISOString() },
            });
            setAccepted(true);
          } else {
            await transition.mutateAsync({
              booking_id: job.booking_id,
              to: 'EN_ROUTE',
              reason: 'Cleaner travelling',
            });
          }
          break;
        case 'EN_ROUTE':
          await transition.mutateAsync({
            booking_id: job.booking_id,
            to: 'ARRIVED',
            reason: 'Cleaner arrived',
          });
          break;
        case 'ARRIVED':
          if (beforeCount === 0) {
            beforeInput.current?.click();
          } else {
            await transition.mutateAsync({
              booking_id: job.booking_id,
              to: 'IN_PROGRESS',
              reason: 'Cleaning started',
            });
          }
          break;
        case 'IN_PROGRESS':
          if (afterCount === 0) {
            afterInput.current?.click();
          } else {
            if (beforeCount < 1 || afterCount < 1) throw new Error('photos_required');
            await transition.mutateAsync({
              booking_id: job.booking_id,
              to: 'COMPLETED',
              reason: 'Cleaner completed job',
            });
          }
          break;
        default:
          break;
      }
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const handleCapture = async (phase: 'before' | 'after', files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const tenantId = auth.claims.tenant_id ?? 'tenant';
      const staffId = job.staff_id;
      const uploadedPaths: string[] = [];
      const fileList = Array.from(files);
      for (const [index, file] of fileList.entries()) {
        setUpload({ current: index + 1, total: fileList.length, pct: 0 });
        const compressed = await compressImage(file);
        const clientId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const photo = {
          id: clientId,
          bookingId: job.booking_id,
          staffId,
          tenantId,
          phase,
          blob: compressed.blob,
          fileName: `${clientId}.jpg`,
          status: 'queued' as const,
          progress: 0,
          attempts: 0,
          remotePath: null,
          error: null,
          createdAt: new Date().toISOString(),
        };
        await queuePhoto(photo);
        if (phase === 'before') setBeforeCount((value) => value + 1);
        else setAfterCount((value) => value + 1);
        await updatePhoto(clientId, { status: 'uploading', progress: 40 });
        const remotePath = await uploadQueuedPhoto(photo, tenantId, (progress) => {
          void updatePhoto(clientId, { progress });
          setUpload((state) => (state ? { ...state, pct: progress } : state));
        });
        uploadedPaths.push(remotePath);
        await updatePhoto(clientId, { status: 'uploaded', remotePath, progress: 100 });
      }
      await addEvent.mutateAsync({
        booking_id: job.booking_id,
        kind: 'note',
        customer_visible: false,
        data: {
          field_action: 'field_photo',
          phase,
          [phase === 'before' ? 'evidence_before' : 'evidence_after']: uploadedPaths,
        },
      });
      await qc.invalidateQueries({ queryKey: ['field', 'events', job.booking_id] });
      toast({ title: t('field.photos_uploaded') });
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setUpload(null);
      setBusy(false);
    }
  };

  const submitIssue = async () => {
    if (issueReason.trim().length < 3) {
      setIssueTouched(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await openException.mutateAsync({
        booking_id: job.booking_id,
        category: issueCategory,
        reason: issueReason,
      });
      setReportOpen(false);
      setIssueReason('');
      toast({ title: t('field.issue_reported') });
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  };

  const address = job.address;
  const statusIndex = Math.max(0, statuses.indexOf(job.status as (typeof statuses)[number]));
  const beforeLinks = (photoLinksQuery.data ?? []).filter((item) => photoPathsBefore.includes(item.path));
  const afterLinks = (photoLinksQuery.data ?? []).filter((item) => photoPathsAfter.includes(item.path));

  return (
    <div className="space-y-4">
      <Link to="/field" className="text-sm text-primary">
        Back to jobs
      </Link>
      <article className="space-y-4">
        <Link to="/field" className="inline-flex items-center gap-2 text-sm font-medium text-primary">
          <ArrowLeft className="size-4" aria-hidden="true" /> {t('field.nav_today', { defaultValue: 'Today' })}
        </Link>

        <header className="rounded-xl bg-surface p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-text-muted">{job.ticket_ref}</p>
              <h1 className="mt-1 text-h1">{job.customer_first_name}</h1>
            </div>
            <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold">
              {job.status.replace(/_/g, ' ')}
            </span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {job.customer_phone ? (
              <>
                <a
                  href={`tel:${job.customer_phone}`}
                  className="inline-flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success"
                >
                  <Phone className="size-4" /> Call
                </a>
                <a
                  href={`https://wa.me/${job.customer_phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-success/10 px-3 py-2 text-sm font-medium text-success"
                >
                  WhatsApp
                </a>
              </>
            ) : null}
          </div>
        </header>

        {error ? (
          <p role="alert" className="rounded-lg border border-error/30 bg-error/5 p-3 text-sm text-error">
            {error}
          </p>
        ) : null}

        <section className="rounded-xl bg-surface p-4 shadow-card">
          <h2 className="flex items-center gap-2 text-h3">
            <MapPin className="size-5" /> Location
          </h2>
          <p className="mt-2 text-sm">{address.landmark ?? address.area ?? 'Location pending'}</p>
          <p className="mt-1 text-sm text-text-muted">
            {[address.area, address.street].filter(Boolean).join(', ')}
          </p>
          {address.lat != null && address.lng != null ? (
            <a
              href={`https://maps.google.com/?q=${address.lat},${address.lng}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-primary"
            >
              Open in Maps <ChevronRight className="size-4" />
            </a>
          ) : null}
          <p className="mt-3 text-sm">
            <Clock className="inline size-4" /> {new Date(job.scheduled_start).toLocaleString()}
          </p>
        </section>

        <section className="rounded-xl bg-surface p-4 shadow-card">
          <h2 className="flex items-center gap-2 text-h3">
            <Wrench className="size-5" /> Services
          </h2>
          <ul className="mt-3 space-y-2 text-sm">
            {job.services.map((service, index) => (
              <li key={index} className="flex justify-between gap-3">
                <span>{service.label_en || service.label_sw}</span>
                <span className="text-text-muted">x{service.qty}</span>
              </li>
            ))}
          </ul>
          {job.customer_note ? (
            <p className="mt-3 text-sm text-text-muted">Customer note: {job.customer_note}</p>
          ) : null}
          {job.instructions ? (
            <p className="mt-3 text-sm text-text-muted">Instructions: {job.instructions}</p>
          ) : null}
        </section>

        <section className="rounded-xl bg-surface p-4 shadow-card">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-h3">Progress</h2>
            <span className="text-xs text-text-muted">
              Step {Math.min(statusIndex + 1, statuses.length)} of {statuses.length}
            </span>
          </div>
          <Button
            size="field"
            className="w-full rounded-xl font-semibold"
            onClick={() => void primaryAction()}
            disabled={job.status === 'COMPLETED' || job.status === 'CLOSED'}
            loading={busy}
          >
            {primaryLabel() ?? 'Done'}
          </Button>
          <input
            ref={beforeInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handleCapture('before', e.target.files)}
          />
          <input
            ref={afterInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => void handleCapture('after', e.target.files)}
          />
          {upload && (
            <div className="mt-3 space-y-1">
              <p className="text-xs text-text-muted">
                {t('field.uploading_photo', { current: upload.current, total: upload.total })}
              </p>
              <Progress value={upload.pct} label={t('field.uploading_photo', { current: upload.current, total: upload.total })} />
            </div>
          )}
          <p className="mt-2 text-xs text-text-muted">
            Before: {beforeCount} photo(s), after: {afterCount} photo(s). Camera photos required before
            completion.
          </p>
        </section>

        <section className="rounded-xl bg-surface p-4 shadow-card">
          <h2 className="text-h3">Evidence</h2>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[...beforeLinks, ...afterLinks].map((item) => (
              <a key={item.path} href={item.url ?? '#'} target="_blank" rel="noreferrer">
                <img
                  src={item.url ?? ''}
                  alt="job evidence"
                  loading="lazy"
                  className="aspect-square w-full rounded-lg object-cover"
                />
              </a>
            ))}
          </div>
          {beforeLinks.length + afterLinks.length === 0 ? (
            <p className="text-sm text-text-muted">No photos uploaded yet.</p>
          ) : null}
        </section>

        <section className="rounded-xl bg-surface p-4 shadow-card">
          <button
            type="button"
            onClick={() => {
              setIssueTouched(false);
              setReportOpen(true);
            }}
            className="w-full rounded-xl border border-warning/40 bg-warning/5 px-4 py-3 text-sm font-medium text-warning"
          >
            Report an issue
          </button>
        </section>
      </article>

      {reportOpen ? (
        <div className="fixed inset-0 z-50 flex items-end bg-navy/60 p-4 sm:items-center">
          <div className="w-full rounded-2xl bg-surface p-5 shadow-xl">
            <h2 className="flex items-center gap-2 text-h2">
              <AlertTriangle className="size-5 text-warning" /> Report issue
            </h2>
            <label className="mt-4 block text-sm font-medium">Category</label>
            <select
              value={issueCategory}
              onChange={(e) => setIssueCategory(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border bg-surface p-3"
            >
              <option value="customer_absent">Customer absent</option>
              <option value="no_access">No access</option>
              <option value="missing_equipment">Missing equipment</option>
              <option value="extra_work">Extra work needed</option>
            </select>
            <label htmlFor="issue-details" className="mt-4 block text-sm font-medium">
              Details
            </label>
            <textarea
              id="issue-details"
              value={issueReason}
              onChange={(e) => setIssueReason(e.target.value)}
              onBlur={() => setIssueTouched(true)}
              rows={4}
              aria-invalid={issueTouched && issueReason.trim().length < 3 ? true : undefined}
              aria-describedby={issueTouched && issueReason.trim().length < 3 ? 'issue-details-error' : undefined}
              className={`mt-1 w-full rounded-lg border bg-surface p-3 ${issueTouched && issueReason.trim().length < 3 ? 'border-error' : 'border-border'}`}
              required
            />
            {issueTouched && issueReason.trim().length < 3 && (
              <p id="issue-details-error" className="mt-1 text-sm text-error" role="alert">
                {t('validation.reason_required')}
              </p>
            )}
            <div className="mt-4 flex gap-3">
              <Button variant="secondary" size="field" className="flex-1 rounded-lg" onClick={() => setReportOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="field"
                className="flex-1 rounded-lg"
                onClick={() => void submitIssue()}
                loading={busy}
              >
                Send
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
