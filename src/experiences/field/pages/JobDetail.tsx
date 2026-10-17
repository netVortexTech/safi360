import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Clock, MapPin, MessageCircle, Phone, Wrench } from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatDateTime } from '@/lib/dates';
import {
  useFieldJob,
  useFieldEvents,
  useFieldTransition,
  useOpenFieldException,
  useAddFieldJobEvent,
} from '../hooks';
import { compressImage } from '../compression';
import { listPhotos, queuePhoto, updatePhoto } from '../queue';
import { uploadQueuedPhoto } from '../uploads';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ErrorState } from '@/components/shared/ErrorState';
import { Field } from '@/components/shared/Field';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const statuses = ['ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'] as const;

const ISSUE_CATEGORIES = ['customer_absent', 'no_access', 'missing_equipment', 'extra_work'] as const;

/** Codes this screen raises itself; anything else is surfaced verbatim (network/Supabase text). */
const KNOWN_ERRORS = ['photos_required', 'action_failed', 'upload_failed', 'issue_failed'] as const;

export default function JobDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage === 'en' ? 'en' : 'sw';
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [issueCategory, setIssueCategory] = useState<string>('customer_absent');
  const [issueReason, setIssueReason] = useState('');
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

  if (jobQuery.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-40 rounded-2xl" />
        <Skeleton className="h-56 rounded-2xl" />
      </div>
    );
  }

  if (!job) {
    return (
      <ErrorState
        title={t('field.job_not_found')}
        {...(jobQuery.error ? { onRetry: () => void jobQuery.refetch() } : {})}
      />
    );
  }

  const primaryLabel = (): string | null => {
    switch (job.status) {
      case 'ASSIGNED':
        return accepted ? t('field.start_travel') : t('field.accept_job');
      case 'EN_ROUTE':
        return t('field.mark_arrived');
      case 'ARRIVED':
        return beforeCount > 0 ? t('field.start_cleaning') : t('field.capture_before');
      case 'IN_PROGRESS':
        return afterCount > 0 ? t('field.complete_job') : t('field.capture_after');
      case 'COMPLETED':
        return t('field.submit_review');
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
      setError(err instanceof Error ? err.message : 'action_failed');
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
      for (const file of Array.from(files)) {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'upload_failed');
    } finally {
      setBusy(false);
    }
  };

  const submitIssue = async () => {
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
    } catch (err) {
      setError(err instanceof Error ? err.message : 'issue_failed');
    } finally {
      setBusy(false);
    }
  };

  const address = job.address;
  const statusIndex = Math.max(0, statuses.indexOf(job.status as (typeof statuses)[number]));
  const progress = ((statusIndex + 1) / statuses.length) * 100;
  const beforeLinks = (photoLinksQuery.data ?? []).filter((item) => photoPathsBefore.includes(item.path));
  const afterLinks = (photoLinksQuery.data ?? []).filter((item) => photoPathsAfter.includes(item.path));
  const photoTotal = beforeLinks.length + afterLinks.length;
  const errorText =
    error && (KNOWN_ERRORS as readonly string[]).includes(error) ? t(`field.errors.${error}`) : error;
  const done = job.status === 'COMPLETED' || job.status === 'CLOSED';
  const useSw = locale === 'sw';
  const issueCategories = ISSUE_CATEGORIES.map((value) => ({
    value,
    label: t(`field.issue_${value}`),
  }));

  return (
    <div className="animate-fade-in space-y-4 pb-4">
      <Link
        to="/field"
        className="inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
        {t('field.back_to_jobs')}
      </Link>

      <article className="space-y-4">
        <header className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="tabular text-caption text-text-subtle">{job.ticket_ref}</p>
              <h1 className="mt-0.5 truncate text-h1">{job.customer_first_name}</h1>
            </div>
            <StatusBadge status={job.status} className="shrink-0" />
          </div>
          {job.customer_phone ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                asChild
                variant="secondary"
                size="md"
                className="border-success/30 bg-success-tint/60 text-success-text hover:border-success/40 hover:bg-success-tint"
              >
                <a href={`tel:${job.customer_phone}`}>
                  <Phone aria-hidden="true" />
                  {t('field.call')}
                </a>
              </Button>
              <Button
                asChild
                variant="secondary"
                size="md"
                className="border-success/30 bg-success-tint/60 text-success-text hover:border-success/40 hover:bg-success-tint"
              >
                <a
                  href={`https://wa.me/${job.customer_phone.replace(/\D/g, '')}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle aria-hidden="true" />
                  {t('field.whatsapp')}
                </a>
              </Button>
            </div>
          ) : null}
        </header>

        {errorText ? (
          <p
            role="alert"
            className="rounded-xl border border-error/25 bg-error-tint/60 px-4 py-3 text-sm font-medium text-error-text"
          >
            {errorText}
          </p>
        ) : null}

        <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-h3">{t('field.progress')}</h2>
            <span className="text-caption text-text-subtle">
              {t('field.progress_step', {
                n: Math.min(statusIndex + 1, statuses.length),
                total: statuses.length,
              })}
            </span>
          </div>
          <div
            className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted"
            role="progressbar"
            aria-valuemin={1}
            aria-valuemax={statuses.length}
            aria-valuenow={Math.min(statusIndex + 1, statuses.length)}
          >
            <div
              className="h-full rounded-full bg-primary transition-[width] duration-500 ease-premium"
              style={{ width: `${done ? 100 : progress}%` }}
            />
          </div>
          <Button
            size="field"
            className="mt-4 w-full"
            onClick={() => void primaryAction()}
            disabled={done}
            loading={busy}
            loadingLabel={t('common.loading')}
          >
            {primaryLabel() ?? t('field.done')}
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
          <p className="mt-3 text-caption text-text-muted">
            {t('field.photos_summary', { before: beforeCount, after: afterCount })} ·{' '}
            {t('field.camera_required')}
          </p>
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <h2 className="flex items-center gap-2 text-h3">
            <MapPin className="size-5 text-text-subtle" aria-hidden="true" />
            {t('field.location')}
          </h2>
          <p className="mt-2 font-medium text-text">
            {address.landmark ?? address.area ?? t('field.location_pending')}
          </p>
          {[address.area, address.street].filter(Boolean).length > 0 ? (
            <p className="mt-0.5 text-sm text-text-muted">
              {[address.area, address.street].filter(Boolean).join(', ')}
            </p>
          ) : null}
          <p className="mt-3 flex items-center gap-2 text-sm text-text-muted">
            <Clock className="size-4 shrink-0 text-text-subtle" aria-hidden="true" />
            <span className="tabular">{formatDateTime(job.scheduled_start, locale)}</span>
          </p>
          {address.lat != null && address.lng != null ? (
            <a
              href={`https://maps.google.com/?q=${address.lat},${address.lng}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary transition-colors hover:text-primary-hover"
            >
              {t('field.open_in_maps')}
              <ChevronRight className="size-4" aria-hidden="true" />
            </a>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <h2 className="flex items-center gap-2 text-h3">
            <Wrench className="size-5 text-text-subtle" aria-hidden="true" />
            {t('field.services')}
          </h2>
          <ul className="mt-3 divide-y divide-border">
            {job.services.map((service, index) => (
              <li key={index} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="min-w-0 truncate">
                  {useSw ? service.label_sw || service.label_en : service.label_en || service.label_sw}
                </span>
                <span className="tabular shrink-0 font-medium text-text-muted">×{service.qty}</span>
              </li>
            ))}
          </ul>
          {job.customer_note ? (
            <p className="mt-3 rounded-xl bg-surface-muted px-3 py-2 text-sm text-text-muted">
              <span className="font-medium text-text">{t('field.customer_note')}: </span>
              {job.customer_note}
            </p>
          ) : null}
          {job.instructions ? (
            <p className="mt-2 rounded-xl bg-surface-muted px-3 py-2 text-sm text-text-muted">
              <span className="font-medium text-text">{t('field.instructions')}: </span>
              {job.instructions}
            </p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-border bg-surface p-4 shadow-card">
          <h2 className="text-h3">{t('field.evidence')}</h2>
          {photoTotal > 0 ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {[...beforeLinks, ...afterLinks].map((item) => (
                <a
                  key={item.path}
                  href={item.url ?? '#'}
                  target="_blank"
                  rel="noreferrer"
                  className="overflow-hidden rounded-lg border border-border"
                >
                  <img
                    src={item.url ?? ''}
                    alt={t('field.photo_alt')}
                    loading="lazy"
                    className="aspect-square w-full object-cover"
                  />
                </a>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-text-muted">{t('field.no_photos')}</p>
          )}
        </section>

        <Button
          variant="secondary"
          size="field"
          className="w-full border-warning/30 bg-warning-tint/50 text-warning-text hover:border-warning/40 hover:bg-warning-tint"
          onClick={() => setReportOpen(true)}
        >
          {t('field.report_issue')}
        </Button>
      </article>

      <Dialog open={reportOpen} onOpenChange={setReportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('field.report_issue')}</DialogTitle>
            <DialogDescription>{t('field.report_body')}</DialogDescription>
          </DialogHeader>
          <Field id="issue-category" label={t('field.issue_category')}>
            <Select
              id="issue-category"
              value={issueCategory}
              onChange={(e) => setIssueCategory(e.target.value)}
            >
              {issueCategories.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="issue-reason" label={t('field.issue_details')} required>
            <Textarea
              id="issue-reason"
              rows={4}
              value={issueReason}
              onChange={(e) => setIssueReason(e.target.value)}
              required
            />
          </Field>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setReportOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => void submitIssue()}
              disabled={!issueReason.trim()}
              loading={busy}
              loadingLabel={t('common.loading')}
            >
              {t('field.issue_send')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
