// record_manual_payment(): owner/manager receipts move paid_tzs and log the
// event; explicit staff actor meta (0025) is honored; cleaners are refused.
import { asOwnerA, mustCreateBooking, SEED, TestDb, type Claims } from './harness.ts';

let db: TestDb;
let bookingId: string;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
  const b = await mustCreateBooking(db, { phone: '+255717000010', name: 'Closeout' });
  bookingId = b.booking_id;
});
afterAll(() => db.close());

const cleaner: Claims = {
  sub: 'cccccccc-0000-4000-8000-000000000021',
  tenant_id: SEED.tenantA,
  tenant_role: 'CLEANER',
};

function record(role: 'authenticated' | 'service_role', claims: Claims, amount: number, meta: unknown = {}) {
  return db.attempt(
    role,
    claims,
    'select public.record_manual_payment($1, $2, $3, $4, now(), $5::jsonb) as pay_id',
    [bookingId, amount, 'cash', 'closeout test', JSON.stringify(meta)],
  );
}

async function paidTzs(): Promise<number> {
  const rows = await db.sql<{ paid_tzs: number }>('select paid_tzs from public.bookings where id = $1', [
    bookingId,
  ]);
  return rows[0]?.paid_tzs ?? -1;
}

describe('record_manual_payment', () => {
  it('owner receipt moves paid_tzs and logs a visible event', async () => {
    const before = await paidTzs();
    const r = await record('authenticated', asOwnerA, 5000);
    expect(r.ok).toBe(true);
    expect(await paidTzs()).toBe(before + 5000);
    const events = await db.sql<{ kind: string; customer_visible: boolean }>(
      `select kind, customer_visible from public.job_events where booking_id = $1 and kind = 'payment'`,
      [bookingId],
    );
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.customer_visible).toBe(true);
  });

  it('honors explicit staff actor meta', async () => {
    const r = await record('service_role', { role: 'service_role' }, 1000, {
      actor: `staff:${SEED.ownerA}`,
      actor_role: 'OWNER',
    });
    expect(r.ok).toBe(true);
  });

  it('service role without actor meta is refused', async () => {
    const r = await record('service_role', { role: 'service_role' }, 1000);
    expect(r.ok).toBe(false);
  });

  it('cleaner cannot record', async () => {
    const r = await record('authenticated', cleaner, 1000);
    expect(r.ok).toBe(false);
  });

  it('rejects non-positive amounts', async () => {
    const r = await record('authenticated', asOwnerA, 0);
    expect(r.ok).toBe(false);
  });
});
