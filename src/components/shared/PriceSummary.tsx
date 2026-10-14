import { AlertCircle, Ruler } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { QuoteLine, QuoteResult } from '@shared/pricing/types';
import { Badge } from '@/components/ui/badge';
import { formatTzs } from '@/lib/money';
import { cn } from '@/lib/utils';

export interface PriceSummaryProps {
  quote: QuoteResult | null;
  locale: 'sw' | 'en';
  title?: string | undefined;
  className?: string;
}

function lineLabel(line: QuoteLine, locale: 'sw' | 'en', t: (k: string) => string): string {
  if (line.label_key) {
    const sys = t(line.label_key);
    return line.label ? `${sys} · ${line.label[locale]}` : sys;
  }
  return line.label?.[locale] ?? '';
}

function lineDetail(line: QuoteLine, locale: 'sw' | 'en'): string | null {
  if (line.kind === 'tax') return `${line.qty}%`;
  if (line.unit_price_tzs == null) return null;
  if (line.kind === 'min_charge') return formatTzs(line.unit_price_tzs);
  const unit = line.unit ? ` ${line.unit[locale]}` : '';
  return line.qty !== 1 || line.unit
    ? `${line.qty}${unit} × ${formatTzs(line.unit_price_tzs, { withCode: false })}`
    : null;
}

/** Itemised quote card (Design system → Cards → Price summary). Amounts are always integer TZS. */
export function PriceSummary({ quote, locale, title, className }: PriceSummaryProps) {
  const { t } = useTranslation();
  if (!quote) {
    return (
      <div
        className={cn(
          'rounded-lg border border-dashed border-border p-4 text-sm text-text-subtle',
          className,
        )}
      >
        {t('quote.summary.empty')}
      </div>
    );
  }
  return (
    <div className={cn('rounded-lg border border-border bg-surface', className)} data-testid="price-summary">
      <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h3 className="text-h3">{title ?? t('quote.summary.title')}</h3>
        <div className="flex gap-1">
          {quote.has_estimate && (
            <Badge tone="warning">
              <Ruler aria-hidden="true" />
              {t('quote.summary.estimate')}
            </Badge>
          )}
          {quote.requires_review && (
            <Badge tone="amber">
              <AlertCircle aria-hidden="true" />
              {t('quote.summary.requires_review')}
            </Badge>
          )}
        </div>
      </div>
      <ul className="divide-y divide-border px-4">
        {quote.lines.map((line, i) => {
          const detail = lineDetail(line, locale);
          return (
            <li key={i} className="flex items-start justify-between gap-4 py-2 text-sm" data-line={line.kind}>
              <div className="min-w-0">
                <div className={cn('text-text', line.kind === 'min_charge' && 'text-text-muted')}>
                  {lineLabel(line, locale, t)}
                </div>
                {detail && <div className="text-xs text-text-subtle">{detail}</div>}
              </div>
              <div className="tabular shrink-0 text-right">
                {line.amount_tzs == null ? (
                  <span className="text-text-subtle">
                    {line.unit_price_tzs != null
                      ? t('quote.summary.from', { amount: formatTzs(line.unit_price_tzs) })
                      : t('quote.summary.on_review')}
                  </span>
                ) : (
                  formatTzs(line.amount_tzs)
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <dl className="space-y-1 border-t border-border px-4 py-3 text-sm">
        {quote.tax.mode === 'inclusive' && quote.tax_tzs > 0 && (
          <Row
            label={t('quote.summary.tax_included', { label: quote.tax.label, rate: quote.tax.rate_pct })}
            value={formatTzs(quote.tax_tzs)}
            muted
          />
        )}
        <Row label={t('quote.summary.total')} value={formatTzs(quote.total_tzs)} strong />
        {!quote.requires_review && quote.deposit_tzs > 0 && (
          <>
            <Row label={t('quote.summary.deposit')} value={formatTzs(quote.deposit_tzs)} />
            <Row label={t('quote.summary.balance')} value={formatTzs(quote.balance_tzs)} />
          </>
        )}
        <Row
          label={t('quote.summary.duration')}
          value={t('quote.summary.duration_value', {
            minutes: quote.est_duration_min,
            crew: quote.crew_size,
          })}
          muted
        />
      </dl>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex justify-between gap-4',
        strong && 'text-base font-semibold',
        muted && 'text-text-subtle',
      )}
    >
      <dt>{label}</dt>
      <dd className="tabular">{value}</dd>
    </div>
  );
}
