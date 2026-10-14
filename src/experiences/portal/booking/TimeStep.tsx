import { CalendarCheck } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/shared/ErrorState';
import { dayKey, formatDateTime } from '@/lib/dates';
import { portalErrorKey } from '../api';
import { usePortal } from '../context';
import { SlotPicker } from '../components/SlotPicker';
import { addDaysKey } from '../util';
import { toQuoteAddress, toQuoteItems, useAvailability, type LocalQuote } from '../hooks';
import type { BookingDraft } from './state';
import type { DraftAction } from './state';

export interface TimeStepProps {
  draft: BookingDraft;
  quote: LocalQuote;
  dispatch: (action: DraftAction) => void;
  /** Shown when the server refused the chosen slot on submit. */
  slotTaken: boolean;
}

/** Step 3: a week of real slots from the team's calendar. */
export function TimeStep({ draft, quote, dispatch, slotTaken }: TimeStepProps) {
  const { t } = useTranslation();
  const { slug, locale } = usePortal();
  const today = dayKey(new Date());
  const [weekStart, setWeekStart] = useState(() => (draft.slot ? dayKey(draft.slot.start) : today));
  const availability = useAvailability({
    slug,
    items: toQuoteItems(draft.items),
    from: weekStart,
    to: addDaysKey(weekStart, 6),
    address: toQuoteAddress(draft.address),
  });
  const review = quote.quote?.requires_review === true;

  return (
    <section aria-labelledby="step-time" className="space-y-4">
      <div>
        <h2 id="step-time" className="text-h2">
          {t('portal.time.title')}
        </h2>
        <p className="text-sm text-text-muted">
          {review ? t('portal.time.review_hint') : t('portal.time.body')}
        </p>
      </div>
      {slotTaken && (
        <div
          role="alert"
          className="rounded-lg border border-warning/40 bg-warning-tint/50 p-4"
          data-testid="slot-taken"
        >
          <h3 className="text-h3 text-warning-text">{t('portal.time.slot_taken_title')}</h3>
          <p className="mt-1 text-sm text-text-muted">{t('portal.time.slot_taken_body')}</p>
        </div>
      )}
      {draft.slot && (
        <p
          className="inline-flex items-center gap-2 rounded-full bg-primary-light px-3 py-1 text-sm text-primary"
          data-testid="chosen-slot"
        >
          <CalendarCheck className="size-4" aria-hidden="true" />
          {t('portal.time.chosen', { when: formatDateTime(draft.slot.start, locale) })}
        </p>
      )}
      {availability.isError ? (
        <ErrorState
          description={t(portalErrorKey(availability.error))}
          onRetry={() => void availability.refetch()}
          retrying={availability.isFetching}
        />
      ) : (
        <SlotPicker
          slots={availability.data?.slots ?? []}
          loading={availability.isPending}
          weekStart={weekStart}
          minWeekStart={today}
          onWeekChange={setWeekStart}
          selectedStart={draft.slot?.start ?? null}
          onSelect={(s) => dispatch({ type: 'set_slot', slot: { start: s.start, end: s.end } })}
          locale={locale}
        />
      )}
    </section>
  );
}
