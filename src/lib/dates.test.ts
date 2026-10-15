import {
  darDayRange,
  darYear,
  dayKey,
  formatDateTime,
  formatDay,
  formatTime,
  formatTimeRange,
  fromDarLocal,
} from './dates';

// 2026-10-17T06:00:00Z is 09:00 in Dar es Salaam (UTC+3).
const instant = '2026-10-17T06:00:00.000Z';

describe('dates in Africa/Dar_es_Salaam', () => {
  it('formats the day', () => {
    expect(formatDay(instant)).toBe('Sat 17 Oct 2026');
  });
  it('formats the time in Dar, not UTC', () => {
    expect(formatTime(instant)).toBe('9:00 AM');
  });
  it('formats date and time together', () => {
    expect(formatDateTime(instant)).toBe('Sat 17 Oct 2026, 9:00 AM');
  });
  it('formats a time range with an en dash', () => {
    expect(formatTimeRange(instant, '2026-10-17T09:00:00.000Z')).toBe('9:00 AM – 12:00 PM');
  });
  it('groups by Dar day even when UTC date differs', () => {
    // 22:30 UTC on the 16th is 01:30 on the 17th in Dar
    expect(dayKey('2026-10-16T22:30:00.000Z')).toBe('2026-10-17');
  });
  it('builds a UTC instant from Dar wall-clock', () => {
    expect(fromDarLocal('2026-10-17', '09:00').toISOString()).toBe(instant);
  });
  it('covers the full Dar day for range queries', () => {
    // 2026-10-17 in Dar runs 2026-10-16T21:00Z → 2026-10-17T21:00Z
    expect(darDayRange('2026-10-17')).toEqual({
      start: '2026-10-16T21:00:00.000Z',
      end: '2026-10-17T21:00:00.000Z',
    });
  });
  it('keeps early-morning jobs on their Dar date', () => {
    // 01:30 EAT on the 17th is 22:30Z on the 16th — inside the 17th's range,
    // outside the UTC-midnight window the dispatch board used before.
    const { start, end } = darDayRange('2026-10-17');
    const job = new Date('2026-10-16T22:30:00.000Z').toISOString();
    expect(job >= start && job < end).toBe(true);
    expect(job >= '2026-10-17T00:00:00.000Z').toBe(false);
  });
  it('resolves the ticket year in Dar time', () => {
    // 23:00 UTC on 31 Dec 2025 is already 2026 in Dar
    expect(darYear('2025-12-31T23:00:00.000Z')).toBe(2026);
  });
  it('formats Swahili day names and time-of-day words', () => {
    expect(formatDay(instant, 'sw')).toBe('Jumamosi 17 Okt 2026');
    expect(formatTime(instant, 'sw')).toBe('9:00 asubuhi');
    expect(formatTime('2026-10-17T11:00:00.000Z', 'sw')).toBe('2:00 mchana');
    expect(formatTime('2026-10-17T15:30:00.000Z', 'sw')).toBe('6:30 jioni');
    expect(formatTime('2026-10-17T19:00:00.000Z', 'sw')).toBe('10:00 usiku');
  });
});
