export type AgeBucket = 'current' | 'due' | 'overdue';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Age of an invoice in days from its service date (falling back to creation). */
export function invoiceAgeDays(
  scheduledStart: string | null,
  createdAt: string,
  now: number = Date.now(),
): number {
  const base = scheduledStart ? new Date(scheduledStart).getTime() : new Date(createdAt).getTime();
  return Math.max(0, Math.floor((now - base) / DAY_MS));
}

/** 0–7 days: current · 8–30: due · 31+: overdue. */
export function ageBucket(
  scheduledStart: string | null,
  createdAt: string,
  now: number = Date.now(),
): AgeBucket {
  const days = invoiceAgeDays(scheduledStart, createdAt, now);
  if (days <= 7) return 'current';
  if (days <= 30) return 'due';
  return 'overdue';
}

export type InvoiceState = 'paid' | 'partial' | 'unpaid';

export function invoiceState(totalTzs: number, paidTzs: number): InvoiceState {
  if (paidTzs <= 0) return 'unpaid';
  if (paidTzs >= totalTzs) return 'paid';
  return 'partial';
}

const TERMINAL_UNCOLLECTABLE = new Set(['CANCELLED', 'EXPIRED', 'QUOTE_REJECTED', 'NO_SHOW']);

/** Still collectable: positive balance on a non-dead booking. */
export function isOutstanding(totalTzs: number, paidTzs: number, status: string): boolean {
  return totalTzs - paidTzs > 0 && !TERMINAL_UNCOLLECTABLE.has(status);
}
