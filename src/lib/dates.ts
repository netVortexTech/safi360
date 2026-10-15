import { formatInTimeZone, fromZonedTime, toZonedTime } from 'date-fns-tz';

// Timestamps are stored in UTC and displayed in Africa/Dar_es_Salaam (UTC+3, no DST).
export const TZ = 'Africa/Dar_es_Salaam';

export type Locale = 'sw' | 'en';
export type DateInput = Date | string | number;

// date-fns ships no Swahili locale, so the names live here. Full day names are the norm
// in Swahili UIs ("Jumamosi"), abbreviations in English ("Sat").
const DAYS_SW = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'] as const;
const MONTHS_SW = [
  'Jan',
  'Feb',
  'Mac',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Ago',
  'Sep',
  'Okt',
  'Nov',
  'Des',
] as const;

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value);
}

function part(value: DateInput, pattern: string): string {
  return formatInTimeZone(toDate(value), TZ, pattern);
}

/** Swahili time-of-day word for an hour in Dar time. */
export function timeOfDaySw(hour: number): 'asubuhi' | 'mchana' | 'jioni' | 'usiku' {
  if (hour >= 5 && hour < 12) return 'asubuhi';
  if (hour >= 12 && hour < 16) return 'mchana';
  if (hour >= 16 && hour < 20) return 'jioni';
  return 'usiku';
}

/** en: "Sat 17 Oct 2026" · sw: "Jumamosi 17 Okt 2026" */
export function formatDay(value: DateInput, locale: Locale = 'en'): string {
  if (locale === 'en') return part(value, 'EEE d MMM yyyy');
  const day = DAYS_SW[Number(part(value, 'c')) - 1] ?? '';
  const month = MONTHS_SW[Number(part(value, 'M')) - 1] ?? '';
  return `${day} ${part(value, 'd')} ${month} ${part(value, 'yyyy')}`;
}

/** en: "9:00 AM" · sw: "9:00 asubuhi" */
export function formatTime(value: DateInput, locale: Locale = 'en'): string {
  if (locale === 'en') return part(value, 'h:mm a');
  return `${part(value, 'h:mm')} ${timeOfDaySw(Number(part(value, 'H')))}`;
}

/** "Sat 17 Oct 2026, 9:00 AM" */
export function formatDateTime(value: DateInput, locale: Locale = 'en'): string {
  return `${formatDay(value, locale)}, ${formatTime(value, locale)}`;
}

/** "9:00 AM – 12:00 PM" */
export function formatTimeRange(start: DateInput, end: DateInput, locale: Locale = 'en'): string {
  return `${formatTime(start, locale)} – ${formatTime(end, locale)}`;
}

/** Local-date key "2026-10-17" for grouping and calendar cells, computed in Dar time. */
export function dayKey(value: DateInput): string {
  return part(value, 'yyyy-MM-dd');
}

/** Build a UTC instant from a Dar es Salaam wall-clock date + "HH:mm". */
export function fromDarLocal(dateKey: string, time: string): Date {
  return fromZonedTime(`${dateKey}T${time}:00`, TZ);
}

/**
 * UTC half-open bounds `[start, end)` of a Dar es Salaam calendar day, for
 * `scheduled_start` range queries. Dar es Salaam is UTC+3 with no DST, so the
 * day always spans exactly 24h starting at 21:00Z the previous day.
 */
export function darDayRange(dateKey: string): { start: string; end: string } {
  const start = fromDarLocal(dateKey, '00:00');
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** First-time schedule from a Dar wall-clock date + "HH:mm" and a duration in minutes. */
export function buildConfirmSchedule(
  dateKey: string,
  time: string,
  durationMin: number,
): { start: string; end: string } {
  const start = fromDarLocal(dateKey, time);
  const end = new Date(start.getTime() + durationMin * 60000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/** Current wall-clock Date in Dar es Salaam (for "today" comparisons). */
export function nowInDar(): Date {
  return toZonedTime(new Date(), TZ);
}

/** Year in Dar time — used for ticket numbering parity with the database. */
export function darYear(value: DateInput = new Date()): number {
  return Number(part(value, 'yyyy'));
}
