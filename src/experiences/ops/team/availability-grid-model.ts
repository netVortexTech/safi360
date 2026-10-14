import type { AvailabilityRow, WeeklyRuleInput } from './api';

/** Monday-first for display; stored as 0 = Sunday. */
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 0] as const;

export interface DayRow {
  weekday: number;
  works: boolean;
  start: string;
  end: string;
}

export interface GridState {
  /** false = follow company working hours (no weekly rows stored) */
  custom: boolean;
  days: DayRow[];
}

const DEFAULT_START = '08:00';
const DEFAULT_END = '17:00';

export function gridFromRows(rows: AvailabilityRow[]): GridState {
  const weekly = rows.filter((r) => r.weekday != null);
  const days = WEEKDAYS.map((weekday) => {
    const rule = weekly.find((r) => r.weekday === weekday);
    if (!rule || rule.is_off || !rule.start_time || !rule.end_time) {
      return { weekday, works: false, start: DEFAULT_START, end: DEFAULT_END };
    }
    return { weekday, works: true, start: rule.start_time.slice(0, 5), end: rule.end_time.slice(0, 5) };
  });
  return { custom: weekly.length > 0, days };
}

export function gridToRules(state: GridState): WeeklyRuleInput[] {
  if (!state.custom) return [];
  return state.days.map((d) =>
    d.works
      ? { weekday: d.weekday, start_time: d.start, end_time: d.end, is_off: false }
      : { weekday: d.weekday, start_time: null, end_time: null, is_off: true },
  );
}

export function gridErrors(state: GridState): Record<number, string> {
  const out: Record<number, string> = {};
  if (!state.custom) return out;
  for (const d of state.days) {
    if (d.works && (!d.start || !d.end || d.end <= d.start)) out[d.weekday] = 'validation.time_range';
  }
  return out;
}
