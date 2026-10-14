// All money is integer TZS. There are no decimals anywhere in the system.

export function assertTzs(value: number): asserts value is number {
  if (!Number.isInteger(value)) throw new TypeError(`TZS amounts must be integers, got ${value}`);
}

/** 1665000 → "TZS 1,665,000". Negative amounts (refunds) render as "−TZS 5,000". */
export function formatTzs(amountTzs: number, opts: { withCode?: boolean } = {}): string {
  assertTzs(amountTzs);
  const withCode = opts.withCode ?? true;
  const abs = Math.abs(amountTzs).toLocaleString('en-US');
  const sign = amountTzs < 0 ? '−' : '';
  return withCode ? `${sign}TZS ${abs}` : `${sign}${abs}`;
}

/** Parse "75,000", "75 000", "TZS 75000" → 75000. Returns null for anything non-integer. */
export function parseTzs(input: string): number | null {
  const cleaned = input.replace(/tzs/i, '').replace(/[\s,]/g, '').trim();
  if (!/^-?\d+$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isSafeInteger(n) ? n : null;
}

/** Deposit = round(total × pct / 100) — rounded to the nearest shilling, never fractional. */
export function depositFor(totalTzs: number, depositPct: number): number {
  assertTzs(totalTzs);
  return Math.round((totalTzs * depositPct) / 100);
}
