import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { QuoteResult } from '@shared/pricing/types';
import { ErrorState } from '@/components/shared/ErrorState';
import { Button } from '@/components/ui/button';
import { isPortalApiError, portalErrorKey } from '../api';
import { StepIndicator } from '../components/StepIndicator';
import { StickyTotalBar } from '../components/StickyTotalBar';
import { usePortal } from '../context';
import { toQuoteItems, useCreateBooking, useLocalQuote } from '../hooks';
import { saveLastBooking } from '../session';
import { ContactStep } from './ContactStep';
import { LocationStep } from './LocationStep';
import { ReviewStep } from './ReviewStep';
import { ServicesStep } from './ServicesStep';
import { TimeStep } from './TimeStep';
import {
  clearDraft,
  defaultItem,
  reachableStep,
  stepComplete,
  stepIndex,
  STEPS,
  useBookingDraft,
  type Step,
} from './state';

type Banner =
  | { kind: 'slot_taken' }
  | { kind: 'session_expired' }
  | { kind: 'error'; key: string; retryable: boolean }
  | null;

/** The five-step booking flow; also the /widget body. */
export function BookingStepper() {
  const { t } = useTranslation();
  const { slug, catalog, locale, source, widget } = usePortal();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [draft, dispatch, { restored }] = useBookingDraft(slug);
  const create = useCreateBooking();
  const queryClient = useQueryClient();
  const [banner, setBanner] = useState<Banner>(null);
  const [changedQuote, setChangedQuote] = useState<QuoteResult | null>(null);

  const quote = useLocalQuote(catalog, draft.items, draft.address.area.trim() ? draft.address : null);
  const gate = useMemo(() => ({ draft, quote: quote.quote }), [draft, quote.quote]);
  const reachable = reachableStep(gate);
  const current: Step = stepIndex(draft.step) <= stepIndex(reachable) ? draft.step : reachable;
  const currentIndex = stepIndex(current);
  const complete = stepComplete(current, gate);

  // "Book this service" deep link: ?service=<id> seeds the draft once.
  useEffect(() => {
    const id = params.get('service');
    if (!id) return;
    const service = catalog.services.find((s) => s.id === id);
    if (service && !draft.items.some((i) => i.service_id === id)) {
      dispatch({ type: 'add_item', item: defaultItem(service) });
    }
    params.delete('service');
    setParams(params, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one-off seed on mount
  }, []);

  const go = (step: Step) => {
    setBanner(null);
    dispatch({ type: 'go', step });
    window.scrollTo({ top: 0 });
  };

  const next = () => {
    if (!complete) return;
    if (current === 'review') {
      void submit();
      return;
    }
    go(STEPS[currentIndex + 1] as Step);
  };

  const back = () => {
    if (currentIndex === 0) return;
    go(STEPS[currentIndex - 1] as Step);
  };

  const submit = async () => {
    if (!quote.quote || !draft.verify) return;
    const q = changedQuote ?? quote.quote;
    setBanner(null);
    const address = Object.fromEntries(
      Object.entries({
        area: draft.address.area.trim(),
        street: draft.address.street.trim(),
        ward: draft.address.ward.trim(),
        landmark: draft.address.landmark.trim(),
      }).filter(([, v]) => v),
    );
    try {
      const res = await create.mutateAsync({
        slug,
        idempotency_key: draft.idempotency_key,
        verify_token: draft.verify.token,
        customer: {
          name: draft.contact.name.trim(),
          ...(draft.contact.email.trim() ? { email: draft.contact.email.trim() } : {}),
        },
        address: Object.keys(address).length ? address : null,
        items: toQuoteItems(draft.items),
        slot: draft.slot ? { start: draft.slot.start } : null,
        payment_mode: q.requires_review || q.deposit_tzs === 0 ? 'ON_COMPLETION' : draft.payment_mode,
        source,
        locale,
        ...(draft.notes.trim() ? { notes: draft.notes.trim() } : {}),
        ...(q.requires_review ? {} : { expected_total_tzs: q.total_tzs }),
      });
      saveLastBooking({
        slug,
        ticket_ref: res.ticket_ref,
        booking_id: res.booking_id,
        status: res.status,
        hold_expires_at: res.hold_expires_at,
        token: draft.verify.token,
        token_expires_at: draft.verify.expires_at,
        total_tzs: res.quote.total_tzs,
        deposit_tzs: res.quote.deposit_tzs,
        payment_mode: q.requires_review || q.deposit_tzs === 0 ? 'ON_COMPLETION' : draft.payment_mode,
        scheduled_start: res.schedule?.start ?? null,
        scheduled_end: res.schedule?.end ?? null,
        requires_review: res.quote.requires_review,
        address: draft.address,
        source,
        created_at: new Date().toISOString(),
      });
      clearDraft(slug);
      navigate(`/${slug}/book/done/${res.ticket_ref}`, { replace: true });
    } catch (err) {
      if (isPortalApiError(err)) {
        if (err.code === 'slot_unavailable') {
          // The cached week is stale by definition: fetch fresh slots before offering any.
          void queryClient.invalidateQueries({ queryKey: ['portal', slug, 'availability'] });
          dispatch({ type: 'set_slot', slot: null });
          dispatch({ type: 'go', step: 'time' });
          setBanner({ kind: 'slot_taken' });
          return;
        }
        if (err.code === 'quote_changed') {
          setChangedQuote((err.data.quote as QuoteResult | undefined) ?? null);
          return;
        }
        if (
          err.code === 'token_expired' ||
          err.code === 'token_invalid' ||
          err.code === 'phone_not_verified'
        ) {
          dispatch({ type: 'set_verify', verify: null });
          dispatch({ type: 'go', step: 'contact' });
          setBanner({ kind: 'session_expired' });
          return;
        }
        setBanner({ kind: 'error', key: err.messageKey, retryable: err.retryable });
        return;
      }
      setBanner({ kind: 'error', key: portalErrorKey(err), retryable: true });
    }
  };

  const labels = STEPS.map((s) => t(`portal.steps.${s}`));
  const primaryLabel =
    current === 'review'
      ? quote.quote?.requires_review
        ? t('portal.review.request')
        : t('portal.review.confirm')
      : t('portal.stepper.continue');
  const primaryLoading =
    current === 'review'
      ? quote.quote?.requires_review
        ? t('portal.review.requesting')
        : t('portal.review.confirming')
      : undefined;

  return (
    <div className="space-y-4" data-testid="booking-stepper" data-step={current}>
      {!widget && <h1 className="text-h1">{t('portal.stepper.title')}</h1>}
      <StepIndicator
        labels={labels}
        current={currentIndex}
        reachable={stepIndex(reachable)}
        onSelect={(i) => go(STEPS[i] as Step)}
      />
      {restored && current === 'services' && (
        <p
          className="flex items-center justify-between gap-3 rounded-lg bg-primary-light px-3 py-2 text-sm text-primary"
          data-testid="draft-restored"
        >
          {t('portal.stepper.saved_draft')}
          <Button variant="link" size="sm" onClick={() => dispatch({ type: 'reset' })}>
            {t('portal.stepper.start_over')}
          </Button>
        </p>
      )}
      {banner?.kind === 'error' && (
        <ErrorState
          description={t(banner.key)}
          onRetry={banner.retryable ? () => void submit() : undefined}
          retrying={create.isPending}
        />
      )}

      {current === 'services' && <ServicesStep items={draft.items} quote={quote} dispatch={dispatch} />}
      {current === 'location' && <LocationStep address={draft.address} quote={quote} dispatch={dispatch} />}
      {current === 'time' && (
        <TimeStep draft={draft} quote={quote} dispatch={dispatch} slotTaken={banner?.kind === 'slot_taken'} />
      )}
      {current === 'contact' && (
        <ContactStep draft={draft} dispatch={dispatch} sessionExpired={banner?.kind === 'session_expired'} />
      )}
      {current === 'review' && quote.quote && (
        <ReviewStep draft={draft} quote={quote.quote} dispatch={dispatch} changedQuote={changedQuote} />
      )}

      <StickyTotalBar
        quote={changedQuote ?? quote.quote}
        reason={quote.reason}
        locale={locale}
        primaryLabel={primaryLabel}
        primaryLoadingLabel={primaryLoading}
        onPrimary={next}
        primaryDisabled={!complete}
        primaryLoading={create.isPending}
        onBack={currentIndex > 0 ? back : undefined}
      />
    </div>
  );
}
