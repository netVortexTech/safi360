import { can } from './permissions';

describe('can(role, permission)', () => {
  it('owners can do everything office-side', () => {
    expect(can('OWNER', 'settings.edit')).toBe(true);
    expect(can('OWNER', 'payment.refund')).toBe(true);
    expect(can('OWNER', 'booking.assign')).toBe(true);
  });
  it('dispatchers manage bookings but not money rules or settings', () => {
    expect(can('DISPATCHER', 'booking.assign')).toBe(true);
    expect(can('DISPATCHER', 'payment.record_manual')).toBe(false);
    expect(can('DISPATCHER', 'settings.edit')).toBe(false);
  });
  it('managers cannot change gateway keys or billing', () => {
    expect(can('MANAGER', 'integration.manage')).toBe(false);
    expect(can('MANAGER', 'billing.manage')).toBe(false);
    expect(can('MANAGER', 'payment.record_manual')).toBe(true);
  });
  it('cleaners only execute jobs', () => {
    expect(can('CLEANER', 'field.execute')).toBe(true);
    expect(can('CLEANER', 'customer.view')).toBe(false);
    expect(can('CLEANER', 'payment.view')).toBe(false);
  });
  it('no role means no permission', () => {
    expect(can(null, 'booking.view')).toBe(false);
    expect(can(undefined, 'booking.view')).toBe(false);
  });
});
