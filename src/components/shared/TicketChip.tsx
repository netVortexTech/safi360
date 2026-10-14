import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

export interface TicketChipProps {
  ticketRef: string;
  /** Link target; omit to render plain text (e.g. on the ticket's own page). */
  to?: string | undefined;
  size?: 'sm' | 'md' | 'display';
  className?: string;
}

const SIZE = {
  sm: 'text-sm',
  md: 'text-base',
  display: 'text-display',
} as const;

/** Ticket reference in tabular figures with a copy button; the universal identifier across all four experiences. */
export function TicketChip({ ticketRef, to, size = 'md', className }: TicketChipProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(ticketRef);
      setCopied(true);
    } catch {
      // Clipboard can be unavailable (insecure context / permissions); the text is still selectable.
    }
  };

  const label = <span className="tabular font-semibold tracking-wide">{ticketRef}</span>;

  return (
    <span className={cn('inline-flex items-center gap-1.5', SIZE[size], className)}>
      {to ? (
        <Link to={to} className="text-primary hover:underline">
          {label}
        </Link>
      ) : (
        label
      )}
      <button
        type="button"
        onClick={copy}
        aria-label={t('ticket.copy')}
        className="inline-flex size-touch items-center justify-center rounded text-text-subtle hover:bg-surface-muted hover:text-text sm:size-8"
      >
        {copied ? (
          <Check className="size-4 text-success" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
      </button>
      <span role="status" aria-live="polite" className="sr-only">
        {copied ? t('ticket.copied') : ''}
      </span>
    </span>
  );
}
