// booking_feedback (0026): office reads and works the queue; customers have no
// direct access (portal submits through the Edge Function); cross-tenant is denied.
import { asOwnerA, asOwnerB, mustCreateBooking, SEED, TestDb } from './harness.ts';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
  const b = await mustCreateBooking(db, { phone: '+255717000020', name: 'Feedback' });
  await db.sql(
    `insert into public.booking_feedback (tenant_id, booking_id, kind, rating, body)
     values ($1, $2, 'COMMENT', 5, 'Safi sana')`,
    [SEED.tenantA, b.booking_id],
  );
});
afterAll(() => db.close());

describe('booking_feedback RLS (0026)', () => {
  it('owner reads own-tenant feedback', async () => {
    const r = await db.attempt('authenticated', asOwnerA, 'select id from public.booking_feedback');
    expect(r.ok).toBe(true);
    expect(r.rows.length).toBeGreaterThan(0);
  });

  it('owner updates status and response', async () => {
    const r = await db.attempt(
      'authenticated',
      asOwnerA,
      `update public.booking_feedback set status = 'ACKNOWLEDGED' where tenant_id = $1`,
      [SEED.tenantA],
    );
    expect(r.ok).toBe(true);
  });

  it('other tenant reads nothing and cannot write', async () => {
    const read = await db.attempt('authenticated', asOwnerB, 'select id from public.booking_feedback');
    expect(read.ok).toBe(true);
    expect(read.rows).toEqual([]);
    const write = await db.attempt(
      'authenticated',
      asOwnerB,
      `update public.booking_feedback set status = 'DISMISSED' where tenant_id = $1`,
      [SEED.tenantA],
    );
    // Blocked by RLS: no rows match, none touched.
    expect(write.ok).toBe(true);
    const check = await db.sql<{ status: string }>('select status from public.booking_feedback');
    expect(check.every((row) => row.status !== 'DISMISSED')).toBe(true);
  });

  it('anon has no access', async () => {
    const read = await db.attempt('anon', {}, 'select id from public.booking_feedback');
    expect(read.rows).toEqual([]);
  });

  it('authenticated cannot insert directly (Edge Function only)', async () => {
    const r = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into public.booking_feedback (tenant_id, booking_id, kind, body)
       values ($1, $1, 'COMMENT', 'direct')`,
      [SEED.tenantA],
    );
    expect(r.ok).toBe(false);
  });
});
