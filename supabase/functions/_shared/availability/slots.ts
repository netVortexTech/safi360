// Slot generator: working hours × staff capacity × skills × availability × existing
// assignments × travel buffer. Pure and dependency-free so the Edge Function, the ops
// calendar and the tests share one implementation.
//
// Time model: all wall-clock inputs are Africa/Dar_es_Salaam (UTC+3, no DST). Instants
// (assignments, `now`, slot boundaries) are ISO strings / Date in UTC.

export const DAR_OFFSET_MIN = 3 * 60;
const DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export interface WorkingHoursDay {
  open: string; // "HH:mm"
  close: string;
  closed?: boolean | undefined;
}
export type WorkingHours = Partial<Record<DayKey, WorkingHoursDay>>;

export interface StaffMember {
  id: string;
  skills: string[];
  active: boolean;
}

export interface AvailabilityRule {
  staff_id: string;
  /** 0 = Sunday … 6 = Saturday; null for dated rules */
  weekday: number | null;
  date: string | null; // "YYYY-MM-DD"
  date_to: string | null;
  start_time: string | null; // "HH:mm" or "HH:mm:ss"
  end_time: string | null;
  is_off: boolean;
}

export interface BusyInterval {
  staff_id: string;
  starts_at: string; // ISO instant
  ends_at: string;
}

export interface SlotRequest {
  from: string; // "YYYY-MM-DD" inclusive, Dar date
  to: string; // inclusive
  duration_min: number;
  crew_size: number;
  /** Every listed service must be in a staff member's skills for them to count. */
  required_service_ids: string[];
  working_hours: WorkingHours;
  travel_buffer_min: number;
  slot_step_min: number;
  /** Earliest bookable start is now + min_lead_min. */
  min_lead_min: number;
  now: Date;
  staff: StaffMember[];
  availability: AvailabilityRule[];
  busy: BusyInterval[];
  /** Guard against runaway ranges; default 31 days. */
  max_days?: number;
}

export interface Slot {
  start: string; // ISO instant
  end: string;
  /** Dar date "YYYY-MM-DD" for grouping */
  date: string;
  staff_ids: string[];
  capacity: number;
}

export class SlotError extends Error {
  constructor(readonly code: 'range_invalid' | 'range_too_long' | 'duration_invalid' | 'crew_invalid') {
    super(code);
    this.name = 'SlotError';
  }
}

interface Window {
  start: number; // minutes since local midnight
  end: number;
}

export function parseDateKey(key: string): { y: number; m: number; d: number } {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number];
  return { y, m, d };
}

/** UTC instant for a Dar wall-clock date + minutes since midnight. */
export function darInstant(dateKey: string, minutes: number): Date {
  const { y, m, d } = parseDateKey(dateKey);
  return new Date(Date.UTC(y, m - 1, d, 0, minutes - DAR_OFFSET_MIN));
}

export function weekdayOf(dateKey: string): number {
  const { y, m, d } = parseDateKey(dateKey);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function addDays(dateKey: string, days: number): string {
  const { y, m, d } = parseDateKey(dateKey);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

function dayWindow(hours: WorkingHours, dateKey: string): Window | null {
  const day = hours[DAY_KEYS[weekdayOf(dateKey)] as DayKey];
  if (!day || day.closed) return null;
  const start = toMinutes(day.open);
  const end = toMinutes(day.close);
  return end > start ? { start, end } : null;
}

/**
 * Windows a staff member can work on a date:
 *  - a dated rule covering the day wins: leave (is_off) → none, special hours → those
 *  - else weekly rules for that weekday; a person with weekly rules but none for this
 *    weekday is off; a person with no weekly rules at all follows the tenant hours
 */
export function staffWindows(
  staffId: string,
  dateKey: string,
  rules: AvailabilityRule[],
  tenantDay: Window,
): Window[] {
  const mine = rules.filter((r) => r.staff_id === staffId);
  const dated = mine.filter((r) => r.date != null && r.date <= dateKey && (r.date_to ?? r.date) >= dateKey);
  if (dated.length > 0) {
    if (dated.some((r) => r.is_off)) return [];
    return dated.map(toWindow).filter((w): w is Window => w != null);
  }
  const weekly = mine.filter((r) => r.weekday != null);
  if (weekly.length === 0) return [tenantDay];
  const today = weekly.filter((r) => r.weekday === weekdayOf(dateKey));
  if (today.length === 0 || today.some((r) => r.is_off)) return [];
  return today.map(toWindow).filter((w): w is Window => w != null);
}

function toWindow(rule: AvailabilityRule): Window | null {
  if (rule.start_time == null || rule.end_time == null) return null;
  const start = toMinutes(rule.start_time);
  const end = toMinutes(rule.end_time);
  return end > start ? { start, end } : null;
}

function overlaps(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function getSlots(req: SlotRequest): Slot[] {
  if (req.from > req.to) throw new SlotError('range_invalid');
  const maxDays = req.max_days ?? 31;
  if (daysBetween(req.from, req.to) >= maxDays) throw new SlotError('range_too_long');
  if (!Number.isFinite(req.duration_min) || req.duration_min <= 0) throw new SlotError('duration_invalid');
  if (!Number.isInteger(req.crew_size) || req.crew_size < 1) throw new SlotError('crew_invalid');

  const step = Math.max(15, req.slot_step_min);
  const buffer = Math.max(0, req.travel_buffer_min);
  const earliest = req.now.getTime() + Math.max(0, req.min_lead_min) * 60_000;
  const required = new Set(req.required_service_ids);
  const qualified = req.staff.filter((s) => s.active && [...required].every((id) => s.skills.includes(id)));
  const busyByStaff = new Map<string, { start: number; end: number }[]>();
  for (const b of req.busy) {
    const list = busyByStaff.get(b.staff_id) ?? [];
    list.push({
      start: Date.parse(b.starts_at) - buffer * 60_000,
      end: Date.parse(b.ends_at) + buffer * 60_000,
    });
    busyByStaff.set(b.staff_id, list);
  }

  const slots: Slot[] = [];
  for (let date = req.from; date <= req.to; date = addDays(date, 1)) {
    const tenantDay = dayWindow(req.working_hours, date);
    if (!tenantDay) continue;
    const windows = new Map(
      qualified.map((s) => [s.id, staffWindows(s.id, date, req.availability, tenantDay)]),
    );

    for (let start = tenantDay.start; start + req.duration_min <= tenantDay.end; start += step) {
      const end = start + req.duration_min;
      const startAt = darInstant(date, start);
      if (startAt.getTime() < earliest) continue;
      const endAt = darInstant(date, end);

      const free = qualified.filter((s) => {
        // `windows` was built from `qualified`, so every id is present.
        const inWindow = (windows.get(s.id) as Window[]).some((w) => w.start <= start && end <= w.end);
        if (!inWindow) return false;
        const busy = busyByStaff.get(s.id) ?? [];
        return !busy.some((b) => overlaps(startAt.getTime(), endAt.getTime(), b.start, b.end));
      });

      if (free.length >= req.crew_size) {
        slots.push({
          start: startAt.toISOString(),
          end: endAt.toISOString(),
          date,
          staff_ids: free.map((s) => s.id),
          capacity: free.length,
        });
      }
    }
  }
  return slots;
}

export function daysBetween(from: string, to: string): number {
  return Math.round((darInstant(to, 0).getTime() - darInstant(from, 0).getTime()) / 86_400_000);
}
