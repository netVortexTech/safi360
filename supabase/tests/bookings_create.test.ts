// create_booking_tx: the one write path for new bookings. Everything a booking needs is
// created in one transaction, re-calls with the same key return the same ticket, and the
// slot is re-checked under the tenant lock.
import { asOwnerA, bookingPayload, createBooking, mustCreateBooking, SEED, TestDb } from './harness.ts';

const NEEMA = '88880000-0000-4000-8000-000000000001';
const SOFA = '55550000-0000-4000-8000-000000000001';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
});
afterAll(() => db.close());

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const rows = await db.sql<T>(sql, params);
  if (!rows[0]) throw new Error(`no row for ${sql}`);
  return rows[0];
}

describe('create_booking_tx — happy path', () => {
  it('creates customer, address, quote, booking, items and the first events in one call', async () => {
    const r = await mustCreateBooking(db, {
      phone: '+255715000001',
      name: 'Grace Temba',
      notes: 'Has a dog',
    });
    expect(r.created).toBe(true);
    expect(r.ticket_ref).toMatch(/^UBC-\d{4}-\d{5}$/);
    expect(r.status).toBe('CONFIRMED');

    const booking = await one<Record<string, unknown>>(`select * from public.bookings where id = $1`, [
      r.booking_id,
    ]);
    expect(booking).toMatchObject({
      tenant_id: SEED.tenantA,
      status: 'CONFIRMED',
      source: 'website',
      payment_mode: 'ON_COMPLETION',
      total_tzs: 45000,
      deposit_tzs: 13500,
      crew_size: 1,
      duration_min: 120,
      notes_customer: 'Has a dog',
      hold_expires_at: null,
    });
    expect(booking.confirmed_at).not.toBeNull();
    expect(booking.address_id).not.toBeNull();
    expect(booking.quote_id).toBe(r.quote_id);

    const customer = await one(`select * from public.customers where id = $1`, [r.customer_id]);
    expect(customer).toMatchObject({
      phone_e164: '+255715000001',
      name: 'Grace Temba',
      first_source: 'website',
    });
    expect(customer.phone_verified_at).not.toBeNull();

    const address = await one(`select * from public.customer_addresses where id = $1`, [booking.address_id]);
    expect(address).toMatchObject({ customer_id: r.customer_id, area: 'Mbezi Beach', is_default: true });

    const quote = await one(`select status, total_tzs, requires_review from public.quotes where id = $1`, [
      r.quote_id,
    ]);
    expect(quote).toEqual({ status: 'APPROVED', total_tzs: 45000, requires_review: false });

    const items = await db.sql(
      `select service_id, qty, amount_tzs from public.booking_items where booking_id = $1`,
      [r.booking_id],
    );
    expect(items).toEqual([{ service_id: SOFA, qty: 3, amount_tzs: 45000 }]);

    const events = await db.sql<{
      kind: string;
      to_status: string;
      customer_visible: boolean;
      actor_kind: string;
    }>(
      `select kind, to_status, customer_visible, actor_kind from public.job_events where booking_id = $1 order by id`,
      [r.booking_id],
    );
    expect(events).toEqual([
      { kind: 'created', to_status: 'REQUEST_RECEIVED', customer_visible: true, actor_kind: 'customer' },
      { kind: 'status_changed', to_status: 'CONFIRMED', customer_visible: true, actor_kind: 'system' },
    ]);

    const audit = await db.sql<{ action: string; actor_role: string }>(
      `select action, actor_role from public.audit_logs where entity_id = $1 order by id`,
      [r.booking_id],
    );
    expect(audit).toEqual([{ action: 'booking.transition', actor_role: 'system:create_booking' }]);
  });

  it('allocates consecutive tickets per tenant', async () => {
    const a = await mustCreateBooking(db, {
      phone: '+255715000002',
      start: '2026-10-22T06:00:00Z',
      end: '2026-10-22T08:00:00Z',
    });
    const b = await mustCreateBooking(db, {
      phone: '+255715000003',
      start: '2026-10-22T09:00:00Z',
      end: '2026-10-22T11:00:00Z',
    });
    const n = (ref: string) => Number(ref.slice(-5));
    expect(n(b.ticket_ref)).toBe(n(a.ticket_ref) + 1);
  });

  it('accepts a review request without a slot', async () => {
    const r = await mustCreateBooking(db, {
      phone: '+255715000004',
      requiresReview: true,
      start: null,
      serviceId: '55550000-0000-4000-8000-000000000009',
    });
    expect(r.status).toBe('AWAITING_REVIEW');
    const b = await one<{ scheduled_start: string | null; hold_expires_at: string }>(
      `select scheduled_start, hold_expires_at from public.bookings where id = $1`,
      [r.booking_id],
    );
    expect(b.scheduled_start).toBeNull();
    expect(b.hold_expires_at).not.toBeNull();
  });
});

describe('create_booking_tx — idempotency', () => {
  it('returns the same ticket for the same key and payload, creating nothing new', async () => {
    const spec = {
      idempotencyKey: 'booking_11111111-1111-4111-8111-aaaaaaaaaaaa',
      phone: '+255715000010',
      start: '2026-10-23T06:00:00Z',
      end: '2026-10-23T08:00:00Z',
    };
    const first = await mustCreateBooking(db, spec);
    const before = await one<{ n: string }>(
      `select count(*)::text as n from public.bookings where tenant_id = $1`,
      [SEED.tenantA],
    );
    const second = await mustCreateBooking(db, spec);
    const after = await one<{ n: string }>(
      `select count(*)::text as n from public.bookings where tenant_id = $1`,
      [SEED.tenantA],
    );
    expect(second.created).toBe(false);
    expect(second.ticket_ref).toBe(first.ticket_ref);
    expect(second.booking_id).toBe(first.booking_id);
    expect(after.n).toBe(before.n);
  });

  it('refuses a different payload under an already-used key', async () => {
    const key = 'booking_22222222-1111-4111-8111-aaaaaaaaaaaa';
    await mustCreateBooking(db, {
      idempotencyKey: key,
      phone: '+255715000011',
      start: '2026-10-23T09:00:00Z',
      end: '2026-10-23T11:00:00Z',
    });
    const r = await createBooking(db, {
      idempotencyKey: key,
      phone: '+255715000011',
      totalTzs: 99000,
      start: '2026-10-23T09:00:00Z',
      end: '2026-10-23T11:00:00Z',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/idempotency_mismatch/);
  });

  it('a rolled-back create leaves no ticket gap and no customer behind', async () => {
    await expect(
      db.pg.transaction(async (tx) => {
        await tx.query(`select public.create_booking_tx($1::jsonb)`, [
          JSON.stringify(
            bookingPayload({
              phone: '+255715000012',
              start: '2026-10-24T06:00:00Z',
              end: '2026-10-24T08:00:00Z',
            }),
          ),
        ]);
        throw new Error('simulated failure');
      }),
    ).rejects.toThrow('simulated failure');
    const gone = await db.sql(`select id from public.customers where phone_e164 = '+255715000012'`);
    expect(gone).toEqual([]);
  });
});

describe('create_booking_tx — customers', () => {
  it('reuses the customer with the same phone and keeps the name on file', async () => {
    const a = await mustCreateBooking(db, {
      phone: '+255715000020',
      name: 'Neema Joseph',
      start: '2026-10-25T06:00:00Z',
      end: '2026-10-25T08:00:00Z',
    });
    const b = await mustCreateBooking(db, {
      phone: '+255715000020',
      name: 'N. Joseph',
      start: '2026-10-25T09:00:00Z',
      end: '2026-10-25T11:00:00Z',
    });
    expect(b.customer_id).toBe(a.customer_id);
    const c = await one<{ name: string }>(`select name from public.customers where id = $1`, [a.customer_id]);
    expect(c.name).toBe('Neema Joseph');
  });

  it('flags, never merges, a new phone with a name already on file', async () => {
    const a = await mustCreateBooking(db, {
      phone: '+255715000021',
      name: 'Asha  Mwakyusa',
      start: '2026-10-26T06:00:00Z',
      end: '2026-10-26T08:00:00Z',
    });
    const dup = await db.sql<{
      customer_id: string;
      duplicate_of_id: string;
      reason: string;
      status: string;
    }>(
      `select customer_id, duplicate_of_id, reason, status from public.customer_duplicates where customer_id = $1`,
      [a.customer_id],
    );
    expect(dup).toHaveLength(1);
    expect(dup[0]).toMatchObject({ reason: 'same_name', status: 'OPEN' });
    const seededAsha = await one<{ id: string }>(
      `select id from public.customers where phone_e164 = '+255754123456'`,
    );
    expect(dup[0]?.duplicate_of_id).toBe(seededAsha.id);
    expect(a.customer_id).not.toBe(seededAsha.id);
  });
});

describe('create_booking_tx — routing', () => {
  it('a deposit holds the slot for slot_hold_minutes and waits for payment', async () => {
    const r = await mustCreateBooking(db, {
      phone: '+255715000030',
      paymentMode: 'DEPOSIT',
      start: '2026-10-27T06:00:00Z',
      end: '2026-10-27T08:00:00Z',
    });
    expect(r.status).toBe('AWAITING_PAYMENT');
    const b = await one<{ hold_expires_at: string; confirmed_at: string | null }>(
      `select hold_expires_at, confirmed_at from public.bookings where id = $1`,
      [r.booking_id],
    );
    const holdMin = (Date.parse(b.hold_expires_at) - Date.now()) / 60_000;
    expect(holdMin).toBeGreaterThan(13);
    expect(holdMin).toBeLessThanOrEqual(15.1);
    expect(b.confirmed_at).toBeNull();
  });

  it('a deposit of zero confirms immediately', async () => {
    const r = await mustCreateBooking(db, {
      phone: '+255715000031',
      paymentMode: 'DEPOSIT',
      depositTzs: 0,
      start: '2026-10-27T09:00:00Z',
      end: '2026-10-27T11:00:00Z',
    });
    expect(r.status).toBe('CONFIRMED');
  });

  it('anything needing a human goes to review with a quote-expiry hold and an exception', async () => {
    const r = await mustCreateBooking(db, {
      phone: '+255715000032',
      requiresReview: true,
      paymentMode: 'DEPOSIT',
      start: '2026-10-27T12:00:00Z',
      end: '2026-10-27T14:00:00Z',
    });
    expect(r.status).toBe('AWAITING_REVIEW');
    const b = await one<{ hold_expires_at: string }>(
      `select hold_expires_at from public.bookings where id = $1`,
      [r.booking_id],
    );
    const holdHours = (Date.parse(b.hold_expires_at) - Date.now()) / 3_600_000;
    expect(Math.round(holdHours)).toBe(144);
    const ex = await db.sql<{ kind: string; status: string }>(
      `select kind, status from public.exceptions where booking_id = $1`,
      [r.booking_id],
    );
    expect(ex).toEqual([{ kind: 'NEEDS_REVIEW', status: 'OPEN' }]);
    const q = await one<{ status: string }>(`select status from public.quotes where id = $1`, [r.quote_id]);
    expect(q.status).toBe('DRAFT');
  });
});

describe('create_booking_tx — slot capacity', () => {
  const day = '2026-11-02';
  it('refuses a slot once reserved crew would exceed the free staff', async () => {
    const ok = await createBooking(db, {
      phone: '+255715000040',
      start: `${day}T06:00:00Z`,
      end: `${day}T08:00:00Z`,
      capacity: 1,
    });
    expect(ok.ok, ok.error).toBe(true);
    const clash = await createBooking(db, {
      phone: '+255715000041',
      start: `${day}T06:00:00Z`,
      end: `${day}T08:00:00Z`,
      capacity: 1,
    });
    expect(clash.ok).toBe(false);
    expect(clash.error).toMatch(/slot_unavailable/);
    const roomy = await createBooking(db, {
      phone: '+255715000042',
      start: `${day}T06:00:00Z`,
      end: `${day}T08:00:00Z`,
      capacity: 2,
    });
    expect(roomy.ok, roomy.error).toBe(true);
  });

  it('pads the overlap with the tenant travel buffer', async () => {
    // Existing booking 06:00–08:00 with capacity 1; the buffer is 45 minutes.
    const tight = await createBooking(db, {
      phone: '+255715000043',
      start: `${day}T08:30:00Z`,
      end: `${day}T10:30:00Z`,
      capacity: 2,
    });
    expect(tight.ok).toBe(false);
    expect(tight.error).toMatch(/slot_unavailable/);
    const clear = await createBooking(db, {
      phone: '+255715000044',
      start: `${day}T08:45:00Z`,
      end: `${day}T10:45:00Z`,
      capacity: 2,
    });
    expect(clear.ok, clear.error).toBe(true);
  });

  it('crew already covered by an assignment no longer counts as reserved', async () => {
    const day2 = '2026-11-03';
    const first = await mustCreateBooking(db, {
      phone: '+255715000045',
      start: `${day2}T06:00:00Z`,
      end: `${day2}T08:00:00Z`,
      capacity: 1,
    });
    const blocked = await createBooking(db, {
      phone: '+255715000046',
      start: `${day2}T06:00:00Z`,
      end: `${day2}T08:00:00Z`,
      capacity: 1,
    });
    expect(blocked.ok).toBe(false);
    await db.sql(
      `insert into public.assignments (tenant_id, booking_id, staff_id, starts_at, ends_at) values ($1, $2, $3, $4, $5)`,
      [SEED.tenantA, first.booking_id, NEEMA, `${day2}T06:00:00Z`, `${day2}T08:00:00Z`],
    );
    // Neema is now busy in the availability engine; the capacity passed in already excludes her.
    const allowed = await createBooking(db, {
      phone: '+255715000046',
      start: `${day2}T06:00:00Z`,
      end: `${day2}T08:00:00Z`,
      capacity: 1,
    });
    expect(allowed.ok, allowed.error).toBe(true);
  });

  it('a lapsed hold frees the slot without waiting for the expiry job', async () => {
    const day3 = '2026-11-04';
    const held = await mustCreateBooking(db, {
      phone: '+255715000047',
      paymentMode: 'DEPOSIT',
      start: `${day3}T06:00:00Z`,
      end: `${day3}T08:00:00Z`,
      capacity: 1,
    });
    expect(held.status).toBe('AWAITING_PAYMENT');
    const blocked = await createBooking(db, {
      phone: '+255715000048',
      start: `${day3}T06:00:00Z`,
      end: `${day3}T08:00:00Z`,
      capacity: 1,
    });
    expect(blocked.ok).toBe(false);
    await db.sql(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [
      held.booking_id,
    ]);
    const allowed = await createBooking(db, {
      phone: '+255715000048',
      start: `${day3}T06:00:00Z`,
      end: `${day3}T08:00:00Z`,
      capacity: 1,
    });
    expect(allowed.ok, allowed.error).toBe(true);
  });
});

describe('create_booking_tx — access', () => {
  it('cannot be called by authenticated users or anon', async () => {
    const payload = JSON.stringify(bookingPayload({ phone: '+255715000050' }));
    const asUser = await db.attempt('authenticated', asOwnerA, `select public.create_booking_tx($1::jsonb)`, [
      payload,
    ]);
    expect(asUser.ok).toBe(false);
    expect(asUser.error).toMatch(/permission denied/i);
    const asAnon = await db.attempt('anon', {}, `select public.create_booking_tx($1::jsonb)`, [payload]);
    expect(asAnon.ok).toBe(false);
  });

  it('refuses unknown tenants and malformed sources', async () => {
    const r = await createBooking(db, {
      tenant: '00000000-0000-4000-8000-000000000000',
      phone: '+255715000051',
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/tenant_not_found/);
    const bad = await createBooking(db, { phone: '+255715000052', source: 'carrier_pigeon' });
    expect(bad.ok).toBe(false);
  });
});
