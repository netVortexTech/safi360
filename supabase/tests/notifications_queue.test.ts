// Office roles can queue customer notifications; nobody else can.
import { asOwnerA, asOwnerB, SEED, TestDb } from './harness.ts';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
});
afterAll(() => db.close());

const INSERT = 'insert into public.notifications (tenant_id, channel, template_key) values ($1, $2, $3)';

describe('notifications_queue policy (0024)', () => {
  it('owner queues for their own tenant', async () => {
    const r = await db.attempt('authenticated', asOwnerA, INSERT, [
      SEED.tenantA,
      'SMS',
      'reschedule_confirmed',
    ]);
    expect(r.ok).toBe(true);
  });

  it('owner cannot queue for another tenant', async () => {
    const r = await db.attempt('authenticated', asOwnerB, INSERT, [
      SEED.tenantA,
      'SMS',
      'reschedule_confirmed',
    ]);
    expect(r.ok).toBe(false);
  });

  it('anon cannot queue', async () => {
    const r = await db.attempt('anon', {}, INSERT, [SEED.tenantA, 'SMS', 'reschedule_confirmed']);
    expect(r.ok).toBe(false);
  });
});
