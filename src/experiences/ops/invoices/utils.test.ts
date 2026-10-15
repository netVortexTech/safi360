import { ageBucket, invoiceAgeDays, invoiceState, isOutstanding } from './utils';

describe('invoice buckets and states', () => {
  const created = '2026-10-01T06:00:00.000Z';
  it('ages from the service date', () => {
    const now = new Date('2026-10-11T06:00:00.000Z').getTime();
    expect(invoiceAgeDays('2026-10-10T06:00:00.000Z', created, now)).toBe(1);
    expect(ageBucket('2026-10-10T06:00:00.000Z', created, now)).toBe('current');
  });
  it('falls back to creation when unscheduled', () => {
    const now = new Date('2026-10-20T06:00:00.000Z').getTime();
    expect(ageBucket(null, created, now)).toBe('due');
  });
  it('marks 31+ days overdue', () => {
    const now = new Date('2026-11-05T06:00:00.000Z').getTime();
    expect(ageBucket(null, created, now)).toBe('overdue');
  });
  it('classifies paid / partial / unpaid', () => {
    expect(invoiceState(100, 100)).toBe('paid');
    expect(invoiceState(100, 40)).toBe('partial');
    expect(invoiceState(100, 0)).toBe('unpaid');
  });
  it('excludes dead bookings from outstanding', () => {
    expect(isOutstanding(100, 40, 'CONFIRMED')).toBe(true);
    expect(isOutstanding(100, 100, 'CONFIRMED')).toBe(false);
    expect(isOutstanding(100, 40, 'CANCELLED')).toBe(false);
  });
});
