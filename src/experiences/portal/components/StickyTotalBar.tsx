import { ChevronUp } from '@/components/ui/icons';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { QuoteResult } from '@shared/pricing/types';
import { PriceSummary } from '@/components/shared/PriceSummary';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatTzs } from '@/lib/money';
import { cn } from '@/lib/utils';

export interface StickyTotalBarProps {
  quote: QuoteResult | null;
  /** i18n key when there is no quote yet. */
  reason?: string | null | undefined;
  locale: 'sw' | 'en';
  primaryLabel: string;
  primaryLoadingLabel?: string | undefined;
  onPrimary: () => void;
  primaryDisabled?: boolean | undefined;
  primaryLoading?: boolean | undefined;
  onBack?: (() => void) | undefined;
  /** Anything to show above the bar (e.g. a chosen slot). */
  children?: ReactNode;
  className?: string;
}

/** Total always in view; tap to open the itemised summary as a sheet. */
export function StickyTotalBar({
  quote,
  reason,
  locale,
  primaryLabel,
  primaryLoadingLabel,
  onPrimary,
  primaryDisabled,
  primaryLoading,
  onBack,
  children,
  className,
}: StickyTotalBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const review = quote?.requires_review === true;
  return (
    <>
      <div
        className={cn(
          'safe-bottom md:shadow-lifted sticky bottom-0 z-30 -mx-4 border-t border-border bg-surface/95 px-4 py-3 shadow-sheet backdrop-blur-md sm:-mx-6 sm:px-6 md:mx-0 md:rounded-xl md:border md:px-5',
          className,
        )}
        data-testid="sticky-total"
      >
        {children}
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => quote && setOpen(true)}
            disabled={!quote}
            className="min-w-0 rounded-lg text-left disabled:cursor-default"
            aria-label={quote ? t('portal.stepper.view_summary') : undefined}
          >
            <span className="text-caption tracking-eyebrow block uppercase text-text-subtle">
              {t('portal.stepper.total')}
            </span>
            {quote ? (
              <span className="flex items-center gap-1">
                <span className="tabular text-h2 text-text" data-testid="sticky-total-amount">
                  {review && quote.total_tzs === 0
                    ? t('quote.summary.on_review')
                    : formatTzs(quote.total_tzs)}
                </span>
                <ChevronUp className="size-4 text-text-subtle" aria-hidden="true" />
              </span>
            ) : (
              <span className="text-sm text-text-muted">{t(reason ?? 'portal.stepper.no_price_yet')}</span>
            )}
            {quote && !review && quote.deposit_tzs > 0 && (
              <span className="text-caption block text-text-muted">
                {t('portal.stepper.deposit')} {formatTzs(quote.deposit_tzs)}
              </span>
            )}
          </button>
          <div className="flex shrink-0 items-center gap-2">
            {onBack && (
              <Button variant="secondary" onClick={onBack}>
                {t('portal.stepper.back')}
              </Button>
            )}
            <Button
              variant="brand"
              onClick={onPrimary}
              disabled={primaryDisabled ?? false}
              loading={primaryLoading ?? false}
              loadingLabel={primaryLoadingLabel}
            >
              {primaryLabel}
            </Button>
          </div>
        </div>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent variant="sheet">
          <DialogHeader>
            <DialogTitle>{t('quote.summary.title')}</DialogTitle>
          </DialogHeader>
          <PriceSummary quote={quote} locale={locale} />
        </DialogContent>
      </Dialog>
    </>
  );
}
