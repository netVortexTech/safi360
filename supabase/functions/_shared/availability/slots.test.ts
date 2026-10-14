import { describe, expect, it } from 'vitest';
import {
  addDays,
  darInstant,
  daysBetween,
  getSlots,
  SlotError,
  staffWindows,
  toMinutes,
  weekdayOf,
  type AvailabilityRule,
  type BusyInterval,
  type SlotRequest,
  type StaffMember,
  type WorkingHours,
} from './slots.ts';

const SOFA = '55550000-0000-4000-8000-000000000001';
const CARPET = '55550000-0000-4000-8000-000000000002';
const FUMIGATION = '55550000-0000-4000-8000-000000000007';

const HOURS: WorkingHours = {
  mon: { open: '08:00', close: '18:00' },
  tue: { open: '08:00', close: '18:00' },
  wed: { open: '08:00', close: '18:00' },
  thu: { open: '08:00', close: '18:00' },
  fri: { open: '08:00', close: '18:00' },
  sat: { open: '08:00', close: '16:00' },
  sun: { open: '09:00', close: '13:00', closed: true },
};

const neema: StaffMember = { id: 'neema', skills: [SOFA, CARPET, FUMIGATION], active: true };
const rehema: StaffMember = { id: 'rehema', skills: [SOFA, CARPET], active: true };
const baraka: StaffMember = { id: 'baraka', skills: [FUMIGATION], active: true };
const amina: StaffMember = { id: 'amina', skills: [SOFA], active: false };

function weekly(
  staff_id: string,
  weekday: number,
  start: string | null,
  end: string | null,
  is_off = false,
): AvailabilityRule {
  return { staff_id, weekday, date: null, date_to: null, start_time: start, end_time: end, is_off };
}
function leave(staff_id: string, date: string, date_to: string | null = null): AvailabilityRule {
  return { staff_id, weekday: null, date, date_to, start_time: null, end_time: null, is_off: true };
}
function special(staff_id: string, date: string, start: string, end: string): AvailabilityRule {
  return { staff_id, weekday: null, date, date_to: null, start_time: start, end_time: end, is_off: false };
}
function busy(staff_id: string, date: string, start: string, end: string): BusyInterval {
  return {
    staff_id,
    starts_at: darInstant(date, toMinutes(start)).toISOString(),
    ends_at: darInstant(date, toMinutes(end)).toISOString(),
  };
}

// Thu 15 Oct 2026, 06:00 Dar
const NOW = new Date('2026-10-15T03:00:00Z');

function request(over: Partial<SlotRequest> = {}): SlotRequest {
  return {
    from: '2026-10-16',
    to: '2026-10-16',
    duration_min: 120,
    crew_size: 1,
    required_service_ids: [SOFA],
    working_hours: HOURS,
    travel_buffer_min: 45,
    slot_step_min: 60,
    min_lead_min: 120,
    now: NOW,
    staff: [neema, rehema, baraka, amina],
    availability: [],
    busy: [],
    ...over,
  };
}

function starts(slots: ReturnType<typeof getSlots>): string[] {
  return slots.map((s) => s.start.slice(11, 16));
}

describe('time helpers', () => {
  it('convert Dar wall-clock to UTC instants and back', () => {
    expect(darInstant('2026-10-16', 9 * 60).toISOString()).toBe('2026-10-16T06:00:00.000Z');
    expect(weekdayOf('2026-10-18')).toBe(0); // Sunday
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(daysBetween('2026-10-01', '2026-10-31')).toBe(30);
    expect(toMinutes('08:30:00')).toBe(510);
  });
});

describe('getSlots — working hours and lead time', () => {
  it('generates hourly starts that fit the duration inside tenant hours', () => {
    const slots = getSlots(request({ staff: [neema] }));
    // Fri 08:00–18:00 UTC+3, 120 min job → starts 08:00 … 16:00 (05:00Z … 13:00Z)
    expect(starts(slots)).toEqual([
      '05:00',
      '06:00',
      '07:00',
      '08:00',
      '09:00',
      '10:00',
      '11:00',
      '12:00',
      '13:00',
    ]);
    expect(slots[0]).toMatchObject({ date: '2026-10-16', staff_ids: ['neema'], capacity: 1 });
  });

  it('skips closed days and missing days', () => {
    expect(getSlots(request({ from: '2026-10-18', to: '2026-10-18', staff: [neema] }))).toEqual([]);
    const noFriday = { ...HOURS };
    delete noFriday.fri;
    expect(getSlots(request({ working_hours: noFriday, staff: [neema] }))).toEqual([]);
    const backwards: WorkingHours = { fri: { open: '18:00', close: '08:00' } };
    expect(getSlots(request({ working_hours: backwards, staff: [neema] }))).toEqual([]);
  });

  it('never offers a slot before now + lead', () => {
    const todayAt0600 = request({
      from: '2026-10-15',
      to: '2026-10-15',
      staff: [neema],
      now: new Date('2026-10-15T06:30:00Z'),
    });
    // 09:30 Dar + 120 min lead → first full-hour start 12:00 Dar (09:00Z)
    expect(starts(getSlots(todayAt0600))[0]).toBe('09:00');
  });

  it('uses a shorter step and clamps silly values', () => {
    const slots = getSlots(
      request({ staff: [neema], slot_step_min: 30, travel_buffer_min: -5, min_lead_min: -10 }),
    );
    expect(starts(slots).slice(0, 3)).toEqual(['05:00', '05:30', '06:00']);
    const clamped = getSlots(request({ staff: [neema], slot_step_min: 1 }));
    expect(starts(clamped).slice(0, 2)).toEqual(['05:00', '05:15']);
  });

  it('validates the request', () => {
    expect(() => getSlots(request({ from: '2026-10-17', to: '2026-10-16' }))).toThrow(SlotError);
    expect(() => getSlots(request({ to: '2026-12-01' }))).toThrow(/range_too_long/);
    expect(() => getSlots(request({ to: '2026-10-20', max_days: 3 }))).toThrow(/range_too_long/);
    expect(() => getSlots(request({ duration_min: 0 }))).toThrow(/duration_invalid/);
    expect(() => getSlots(request({ duration_min: Number.NaN }))).toThrow(/duration_invalid/);
    expect(() => getSlots(request({ crew_size: 0 }))).toThrow(/crew_invalid/);
    expect(() => getSlots(request({ crew_size: 1.5 }))).toThrow(/crew_invalid/);
  });
});

describe('getSlots — skills, crew and active staff', () => {
  it('counts only active staff who hold every required skill', () => {
    const fumigation = getSlots(request({ required_service_ids: [FUMIGATION] }));
    expect(fumigation[0]?.staff_ids).toEqual(['neema', 'baraka']);
    const both = getSlots(request({ required_service_ids: [SOFA, FUMIGATION] }));
    expect(both[0]?.staff_ids).toEqual(['neema']);
    const sofa = getSlots(request({ required_service_ids: [SOFA] }));
    expect(sofa[0]?.staff_ids).toEqual(['neema', 'rehema']); // amina inactive
  });

  it('requires capacity ≥ crew size', () => {
    expect(getSlots(request({ required_service_ids: [SOFA], crew_size: 2 })).length).toBeGreaterThan(0);
    expect(getSlots(request({ required_service_ids: [SOFA], crew_size: 3 }))).toEqual([]);
    expect(getSlots(request({ required_service_ids: [], crew_size: 3 }))[0]?.capacity).toBe(3);
  });
});

describe('getSlots — availability rules', () => {
  it('weekly rules narrow the day; a weekday without a rule is off', () => {
    const rules = [weekly('neema', 5, '10:00', '14:00'), weekly('neema', 6, '08:00', '12:00')];
    const fri = getSlots(request({ staff: [neema], availability: rules }));
    expect(starts(fri)).toEqual(['07:00', '08:00', '09:00']); // 10:00–14:00 Dar
    const mon = getSlots(
      request({ from: '2026-10-19', to: '2026-10-19', staff: [neema], availability: rules }),
    );
    expect(mon).toEqual([]);
  });

  it('a weekly off rule removes the day; a malformed weekly rule yields no window', () => {
    const off = getSlots(request({ staff: [neema], availability: [weekly('neema', 5, null, null, true)] }));
    expect(off).toEqual([]);
    const malformed = getSlots(
      request({ staff: [neema], availability: [weekly('neema', 5, '14:00', '10:00')] }),
    );
    expect(malformed).toEqual([]);
    const partial = getSlots(request({ staff: [neema], availability: [weekly('neema', 5, '10:00', null)] }));
    expect(partial).toEqual([]);
  });

  it('leave removes every day in the range, even with weekly hours', () => {
    const rules = [weekly('neema', 5, '08:00', '18:00'), leave('neema', '2026-10-15', '2026-10-17')];
    expect(getSlots(request({ staff: [neema], availability: rules }))).toEqual([]);
    const single = [leave('neema', '2026-10-16')];
    expect(getSlots(request({ staff: [neema], availability: single }))).toEqual([]);
    const after = getSlots(
      request({ from: '2026-10-19', to: '2026-10-19', staff: [neema], availability: rules }),
    );
    expect(after).toEqual([]); // Monday has no weekly rule
  });

  it('special dated hours override the weekly rule for that day', () => {
    const rules = [weekly('neema', 5, '08:00', '18:00'), special('neema', '2026-10-16', '08:00', '12:00')];
    expect(starts(getSlots(request({ staff: [neema], availability: rules })))).toEqual([
      '05:00',
      '06:00',
      '07:00',
    ]);
    const tenantDay = { start: 480, end: 1080 };
    expect(
      staffWindows('neema', '2026-10-16', [special('neema', '2026-10-16', '12:00', '08:00')], tenantDay),
    ).toEqual([]);
    expect(staffWindows('neema', '2026-10-16', [], tenantDay)).toEqual([tenantDay]);
  });
});

describe('getSlots — assignments and travel buffer', () => {
  it('blocks the job window plus the buffer on both sides', () => {
    const jobs = [busy('neema', '2026-10-16', '10:00', '12:00')];
    const slots = getSlots(request({ staff: [neema], busy: jobs }));
    // 120-min slots; busy 10:00–12:00 ± 45 → 09:15–12:45 blocked.
    // Starts 08:00 (ends 10:00 > 09:15 → blocked), 09…12 blocked, 13:00 ok (13:00 ≥ 12:45)
    expect(starts(slots)).toEqual(['10:00', '11:00', '12:00', '13:00']); // 13:00–16:00 Dar
  });

  it('a slot is offered when another qualified cleaner is free', () => {
    const jobs = [
      busy('neema', '2026-10-16', '08:00', '12:00'),
      busy('neema', '2026-10-16', '12:00', '18:00'),
    ];
    const slots = getSlots(request({ busy: jobs }));
    expect(slots.every((s) => s.staff_ids.every((id) => id !== 'neema'))).toBe(true);
    expect(slots[0]?.staff_ids).toEqual(['rehema']);
  });

  it('zero buffer allows back-to-back jobs', () => {
    const jobs = [busy('neema', '2026-10-16', '10:00', '12:00')];
    const slots = getSlots(request({ staff: [neema], busy: jobs, travel_buffer_min: 0 }));
    expect(starts(slots)).toContain('05:00'); // 08:00–10:00 Dar touches but does not overlap
    expect(starts(slots)).toContain('09:00'); // 12:00–14:00 Dar
    expect(starts(slots)).not.toContain('08:00'); // 11:00–13:00 overlaps
  });
});

// ---- Property test: no returned slot ever overlaps an assignment (+buffer) or leave -------

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe('getSlots — property: never overlaps assignments or leave', () => {
  it('holds across 200 random scenarios', () => {
    const rnd = lcg(20261015);
    const pick = <T>(arr: T[]) => arr[Math.floor(rnd() * arr.length)] as T;
    const dates = ['2026-10-16', '2026-10-17', '2026-10-19', '2026-10-20'];
    const staff = [neema, rehema, baraka];

    for (let scenario = 0; scenario < 200; scenario++) {
      const buffer = pick([0, 15, 45, 90]);
      const busyList: BusyInterval[] = [];
      const rules: AvailabilityRule[] = [];
      for (let i = 0; i < Math.floor(rnd() * 8); i++) {
        const startMin = 6 * 60 + Math.floor(rnd() * 12 * 4) * 15;
        const len = 30 + Math.floor(rnd() * 8) * 30;
        const date = pick(dates);
        const who = pick(staff).id;
        busyList.push({
          staff_id: who,
          starts_at: darInstant(date, startMin).toISOString(),
          ends_at: darInstant(date, startMin + len).toISOString(),
        });
      }
      for (let i = 0; i < Math.floor(rnd() * 3); i++) {
        rules.push(leave(pick(staff).id, pick(dates)));
      }
      if (rnd() < 0.5) rules.push(weekly(pick(staff).id, pick([1, 2, 5, 6]), '09:00', '15:00'));

      const req = request({
        from: '2026-10-16',
        to: '2026-10-20',
        duration_min: pick([60, 90, 120, 180]),
        crew_size: pick([1, 2]),
        required_service_ids: pick([[SOFA], [CARPET], [FUMIGATION], []]),
        travel_buffer_min: buffer,
        busy: busyList,
        availability: rules,
        staff,
      });
      const slots = getSlots(req);

      for (const slot of slots) {
        expect(slot.capacity).toBe(slot.staff_ids.length);
        expect(slot.capacity).toBeGreaterThanOrEqual(req.crew_size);
        const s = Date.parse(slot.start);
        const e = Date.parse(slot.end);
        for (const id of slot.staff_ids) {
          const member = staff.find((x) => x.id === id)!;
          for (const sid of req.required_service_ids) expect(member.skills).toContain(sid);
          for (const b of busyList.filter((b) => b.staff_id === id)) {
            const bs = Date.parse(b.starts_at) - buffer * 60_000;
            const be = Date.parse(b.ends_at) + buffer * 60_000;
            expect(s < be && bs < e, `${id} overlaps ${b.starts_at}`).toBe(false);
          }
          for (const l of rules.filter((r) => r.staff_id === id && r.is_off && r.date != null)) {
            expect(slot.date, `${id} on leave ${l.date}`).not.toBe(l.date);
          }
          const w = rules.find((r) => r.staff_id === id && r.weekday != null);
          if (w) {
            const slotWeekday = weekdayOf(slot.date);
            expect(slotWeekday).toBe(w.weekday);
            const startMin = (s - darInstant(slot.date, 0).getTime()) / 60_000;
            const endMin = (e - darInstant(slot.date, 0).getTime()) / 60_000;
            expect(startMin).toBeGreaterThanOrEqual(toMinutes(w.start_time!));
            expect(endMin).toBeLessThanOrEqual(toMinutes(w.end_time!));
          }
        }
      }
    }
  });
});
