// queue_booking_reminders (0027): day-before + balance reminders for the caller's
// tenant, idempotent while a row is still queued.
import { asOwnerA, asOwnerB, mustCreateBooking, SEED, TestDb } from './harness.ts';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
});
afterAll(() => db.close());

async function queue(role: 'authenticated' | 'service_role', claims: object) {
  return db.attempt<{ queued: number }>(
    role,
    claims,
    'select public.queue_booking_reminders() as queued',
    [],
  );
}

describe('queue_booking_reminders', () => {
  it('queues a day-before reminder for a booking 24–48h out', async () => {
    const b = await mustCreateBooking(db, {
      phone: '+255717000030',
      name: 'Reminder',
      start: new Date(Date.now() + 36 * 3_600_000).toISOString(),
      end: new Date(Date.now() + 38 * 3_600_000).toISOString(),
    });
    const r = await queue('authenticated', asOwnerA);
    expect(r.ok).toBe(true);
    expect(r.rows[0]?.queued).toBeGreaterThan(0);
    const rows = await db.sql<{ template_key: string; status: string }>(
      `select template_key, status from public.notifications where booking_id = $1`,
      [b.booking_id],
    );
    expect(rows).toEqual([{ template_key: 'booking_reminder', status: 'queued' }]);
  });

  it('is idempotent: a second call queues nothing new', async () => {
    const first = await queue('authenticated', asOwnerA);
    const second = await queue('authenticated', asOwnerA);
    expect(first.ok && second.ok).toBe(true);
    expect(second.rows[0]?.queued).toBe(0);
  });

  it('refuses non-office roles; other tenants queue only their own', async () => {
    const r = await db.attempt(
      'authenticated',
      { sub: 'dddddddd-0000-4000-8000-000000000021', tenant_id: SEED.tenantA, tenant_role: 'CLEANER' },
      'select public.queue_booking_reminders() as queued',
      [],
    );
    expect(r.ok).toBe(false);
    // Tenant B's owner may call, but only queues for B — nothing for A.
    const other = await queue('authenticated', asOwnerB);
    expect(other.ok).toBe(true);
    expect(other.rows[0]?.queued).toBe(0);
  });
});
