import { useTranslation } from 'react-i18next';
import type { QuoteResult } from '@shared/pricing/types';
import { PriceSummary } from '@/components/shared/PriceSummary';
import { formatDateTime, formatTimeRange } from '@/lib/dates';
import { formatTzs } from '@/lib/money';
import { formatPhone } from '@/lib/phone';
import { cn } from '@/lib/utils';
import { pick, usePortal } from '../context';
import type { BookingDraft, DraftAction, Step } from './state';

export interface ReviewStepProps {
  draft: BookingDraft;
  quote: QuoteResult;
  dispatch: (action: DraftAction) => void;
  /** The server's fresh quote after a quote_changed refusal. */
  changedQuote: QuoteResult | null;
}

function Row({
  label,
  children,
  onEdit,
  editLabel,
}: {
  label: string;
  children: React.ReactNode;
  onEdit: () => void;
  editLabel: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3 py-3">
      <div className="min-w-0">
        <dt className="text-xs uppercase tracking-wide text-text-subtle">{label}</dt>
        <dd className="mt-0.5 text-sm text-text">{children}</dd>
      </div>
      <button type="button" onClick={onEdit} className="shrink-0 text-sm text-primary hover:underline">
        {editLabel}
      </button>
    </div>
  );
}

/** Step 5: everything on one screen, payment choice, then confirm (the button lives in the sticky bar). */
export function ReviewStep({ draft, quote, dispatch, changedQuote }: ReviewStepProps) {
  const { t } = useTranslation();
  const { catalog, locale } = usePortal();
  const go = (step: Step) => () => dispatch({ type: 'go', step });
  const shown = changedQuote ?? quote;
  const review = shown.requires_review;
  const depositPossible = !review && shown.deposit_tzs > 0;
  const services = new Map(catalog.services.map((s) => [s.id, s]));

  return (
    <section aria-labelledby="step-review" className="space-y-4">
      <div>
        <h2 id="step-review" className="text-h2">
          {t('portal.review.title')}
        </h2>
        <p className="text-sm text-text-muted">{t('portal.review.body')}</p>
      </div>

      {changedQuote && (
        <div
          role="alert"
          className="rounded-lg border border-warning/40 bg-warning-tint/50 p-4"
          data-testid="quote-changed"
        >
          <h3 className="text-h3 text-warning-text">{t('portal.review.quote_changed_title')}</h3>
          <p className="mt-1 text-sm text-text-muted">{t('portal.review.quote_changed_body')}</p>
        </div>
      )}

      <dl className="divide-y divide-border rounded-lg border border-border bg-surface px-4">
        <Row label={t('portal.review.services')} onEdit={go('services')} editLabel={t('portal.review.edit')}>
          <ul>
            {draft.items.map((i) => {
              const s = services.get(i.service_id);
              return <li key={i.key}>{s ? pick(s, locale) : i.service_id}</li>;
            })}
          </ul>
        </Row>
        <Row label={t('portal.review.when')} onEdit={go('time')} editLabel={t('portal.review.edit')}>
          {draft.slot ? (
            <>
              {formatDateTime(draft.slot.start, locale)} ·{' '}
              {formatTimeRange(draft.slot.start, draft.slot.end, locale)}
            </>
          ) : (
            t('portal.time.review_hint')
          )}
        </Row>
        <Row label={t('portal.review.where')} onEdit={go('location')} editLabel={t('portal.review.edit')}>
          {[draft.address.area, draft.address.street, draft.address.ward, draft.address.landmark]
            .filter(Boolean)
            .join(' · ')}
        </Row>
        <Row label={t('portal.review.contact')} onEdit={go('contact')} editLabel={t('portal.review.edit')}>
          {draft.contact.name} ·{' '}
          <span className="tabular">{draft.verify ? formatPhone(draft.verify.phone) : ''}</span>
          {draft.contact.email && <> · {draft.contact.email}</>}
        </Row>
      </dl>

      <PriceSummary quote={shown} locale={locale} />

      <fieldset className="rounded-lg border border-border bg-surface p-4" data-testid="payment-mode">
        <legend className="px-1 text-sm font-medium text-text">{t('portal.review.payment_title')}</legend>
        {review ? (
          <p className="text-sm text-text-muted">{t('portal.review.request_hint')}</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {depositPossible && (
              <label
                className={cn(
                  'flex cursor-pointer gap-3 rounded border p-3',
                  draft.payment_mode === 'DEPOSIT' ? 'border-primary bg-primary-light' : 'border-border',
                )}
              >
                <input
                  type="radio"
                  name="payment_mode"
                  value="DEPOSIT"
                  checked={draft.payment_mode === 'DEPOSIT'}
                  onChange={() => dispatch({ type: 'set_payment_mode', mode: 'DEPOSIT' })}
                  className="mt-1"
                />
                <span>
                  <span className="block text-sm font-medium text-text">
                    {t('portal.review.pay_deposit')}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {t('portal.review.pay_deposit_hint', {
                      amount: formatTzs(shown.deposit_tzs),
                      minutes: catalog.tenant.settings.slot_hold_minutes,
                    })}
                  </span>
                </span>
              </label>
            )}
            <label
              className={cn(
                'flex cursor-pointer gap-3 rounded border p-3',
                draft.payment_mode === 'ON_COMPLETION' || !depositPossible
                  ? 'border-primary bg-primary-light'
                  : 'border-border',
              )}
            >
              <input
                type="radio"
                name="payment_mode"
                value="ON_COMPLETION"
                checked={draft.payment_mode === 'ON_COMPLETION' || !depositPossible}
                onChange={() => dispatch({ type: 'set_payment_mode', mode: 'ON_COMPLETION' })}
                className="mt-1"
              />
              <span>
                <span className="block text-sm font-medium text-text">{t('portal.review.pay_later')}</span>
                <span className="block text-xs text-text-muted">{t('portal.review.pay_later_hint')}</span>
              </span>
            </label>
          </div>
        )}
      </fieldset>
      <p className="text-xs text-text-subtle">{t('portal.review.terms')}</p>
    </section>
  );
}
