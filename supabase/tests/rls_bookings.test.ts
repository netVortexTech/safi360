// Tenant isolation and role scope for the booking tables, plus the anonymous portal read.
import { asOwnerA, asOwnerB, asSuperAdmin, mustCreateBooking, SEED, TestDb, type Claims } from './harness.ts';

const TABLES = [
  'customers',
  'customer_addresses',
  'quotes',
  'quote_items',
  'bookings',
  'booking_items',
  'job_events',
  'exceptions',
  'payments',
] as const;

const NEEMA = '88880000-0000-4000-8000-000000000001';
const CLEANER_USER = 'cccccccc-0000-4000-8000-000000000021';
const cleaner: Claims = { sub: CLEANER_USER, tenant_id: SEED.tenantA, tenant_role: 'CLEANER' };
const dispatcher: Claims = { sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'DISPATCHER' };

let db: TestDb;
let mineA: string;
let otherA: string;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
  await db.sql(`insert into auth.users (id, phone) values ($1, '255754100001')`, [CLEANER_USER]);
  await db.sql(`insert into public.memberships (tenant_id, user_id, role) values ($1, $2, 'CLEANER')`, [
    SEED.tenantA,
    CLEANER_USER,
  ]);
  await db.sql(`update public.staff set user_id = $1 where id = $2`, [CLEANER_USER, NEEMA]);

  // Rows on both sides of the fence, each with an exception and a payment.
  const a = await mustCreateBooking(db, {
    phone: '+255717000001',
    name: 'Mine',
    requiresReview: true,
    paymentMode: 'DEPOSIT',
  });
  mineA = a.booking_id;
  const a2 = await mustCreateBooking(db, {
    phone: '+255717000002',
    name: 'Not mine',
    start: '2026-11-05T06:00:00Z',
    end: '2026-11-05T08:00:00Z',
  });
  otherA = a2.booking_id;
  const b = await mustCreateBooking(db, {
    tenant: SEED.tenantB,
    phone: '+255717000003',
    name: 'Theirs',
    requiresReview: true,
    serviceId: '55550000-0000-4000-8000-000000000101',
    address: { area: 'Stone Town' },
  });
  for (const [tenant, id] of [
    [SEED.tenantA, mineA],
    [SEED.tenantB, b.booking_id],
  ] as const) {
    await db.sql(
      `insert into public.payments (tenant_id, booking_id, kind, provider, amount_tzs) values ($1, $2, 'DEPOSIT', 'MOCK', 1000)`,
      [tenant, id],
    );
  }
  await db.sql(
    `insert into public.assignments (tenant_id, booking_id, staff_id, starts_at, ends_at) values ($1, $2, $3, '2026-11-06T06:00:00Z', '2026-11-06T08:00:00Z')`,
    [SEED.tenantA, mineA, NEEMA],
  );
});
afterAll(() => db.close());

describe('booking tables — isolation', () => {
  it.each(TABLES)('owner A sees only tenant A rows in %s', async (table) => {
    const mine = await db.attempt('authenticated', asOwnerA, `select tenant_id from public.${table}`);
    expect(mine.ok, mine.error).toBe(true);
    expect(mine.rows.length).toBeGreaterThan(0);
    for (const row of mine.rows) expect(row.tenant_id).toBe(SEED.tenantA);
  });

  it.each(TABLES)('owner B cannot read tenant A rows in %s', async (table) => {
    const r = await db.attempt(
      'authenticated',
      asOwnerB,
      `select tenant_id from public.${table} where tenant_id = $1`,
      [SEED.tenantA],
    );
    expect(r.ok, r.error).toBe(true);
    expect(r.rows).toEqual([]);
  });

  it.each(TABLES)('anon cannot read %s', async (table) => {
    const r = await db.attempt('anon', {}, `select * from public.${table}`);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/permission denied/i);
  });

  it.each(TABLES)('a super admin reads both tenants in %s', async (table) => {
    const r = await db.attempt(
      'authenticated',
      asSuperAdmin,
      `select distinct tenant_id from public.${table} order by 1`,
    );
    expect(r.ok, r.error).toBe(true);
    expect(r.rows.map((x) => x.tenant_id)).toEqual([SEED.tenantA, SEED.tenantB]);
  });

  it('a cleaner sees only the bookings, items, events and customers of their assignments', async () => {
    // Neema (the cleaner login) also holds the seeded assignment on bbbb…0001.
    const SEEDED = 'bbbb0000-0000-4000-8000-000000000001';
    const expected = [SEEDED, mineA].sort();
    const bookings = await db.attempt<{ id: string }>(
      'authenticated',
      cleaner,
      `select id from public.bookings`,
    );
    expect(bookings.ok, bookings.error).toBe(true);
    expect(bookings.rows.map((r) => r.id).sort()).toEqual(expected);
    const items = await db.attempt<{ booking_id: string }>(
      'authenticated',
      cleaner,
      `select distinct booking_id from public.booking_items`,
    );
    expect(items.rows.map((r) => r.booking_id).sort()).toEqual(expected);
    const events = await db.attempt<{ booking_id: string }>(
      'authenticated',
      cleaner,
      `select distinct booking_id from public.job_events`,
    );
    expect(events.rows.map((r) => r.booking_id).sort()).toEqual(expected);
    const customers = await db.attempt<{ name: string }>(
      'authenticated',
      cleaner,
      `select name from public.customers`,
    );
    expect(customers.rows.map((r) => r.name).sort()).toEqual(['Asha Mwakyusa', 'Mine']);
    for (const table of ['quotes', 'payments', 'exceptions'] as const) {
      const r = await db.attempt('authenticated', cleaner, `select * from public.${table}`);
      expect(r.ok, table).toBe(true);
      expect(r.rows, table).toEqual([]);
    }
    expect(otherA).toBeTruthy();
  });
});

describe('booking tables — writes', () => {
  it('office roles edit customers and resolve exceptions in their tenant only', async () => {
    const edit = await db.attempt(
      'authenticated',
      dispatcher,
      `update public.customers set notes_internal = 'VIP' where phone_e164 = '+255717000001' returning id`,
    );
    expect(edit.ok, edit.error).toBe(true);
    expect(edit.rows).toHaveLength(1);
    const cross = await db.attempt(
      'authenticated',
      asOwnerB,
      `update public.customers set notes_internal = 'x' where phone_e164 = '+255717000001' returning id`,
    );
    expect(cross.rows).toEqual([]);
    const resolve = await db.attempt(
      'authenticated',
      dispatcher,
      `update public.exceptions set status = 'RESOLVED', resolved_at = now() where booking_id = $1 returning id`,
      [mineA],
    );
    expect(resolve.ok, resolve.error).toBe(true);
    expect(resolve.rows).toHaveLength(1);
    // A cleaner has the grant but no policy row matches: the update touches nothing.
    const cleanerWrite = await db.attempt(
      'authenticated',
      cleaner,
      `update public.customers set notes_internal = 'x' returning id`,
    );
    expect(cleanerWrite.ok).toBe(true);
    expect(cleanerWrite.rows).toEqual([]);
  });

  it('nobody inserts bookings, booking items or events through the tables', async () => {
    for (const claims of [asOwnerA, dispatcher, cleaner]) {
      const r = await db.attempt(
        'authenticated',
        claims,
        `insert into public.bookings (tenant_id, ticket_ref, customer_id, duration_min) select tenant_id, 'UBC-2026-77777', customer_id, 60 from public.bookings limit 1`,
      );
      expect(r.ok).toBe(false);
      expect(r.error).toMatch(/permission denied/i);
    }
    const items = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into public.booking_items (tenant_id, booking_id, item_index, label_sw, label_en) values ($1, $2, 9, 'x', 'x')`,
      [SEED.tenantA, mineA],
    );
    expect(items.ok).toBe(false);
    const del = await db.attempt('authenticated', asOwnerA, `delete from public.bookings where id = $1`, [
      mineA,
    ]);
    expect(del.ok).toBe(false);
  });

  it('a dispatcher cannot read the payments ledger, but owners and managers can', async () => {
    const nobody: Claims = { sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'DISPATCHER' };
    const manager: Claims = { sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'MANAGER' };
    const asDispatcher = await db.attempt('authenticated', nobody, `select * from public.payments`);
    expect(asDispatcher.ok, asDispatcher.error).toBe(true);
    expect(asDispatcher.rows).toEqual([]);
    const asManager = await db.attempt(
      'authenticated',
      manager,
      `select * from public.payments where tenant_id = $1`,
      [SEED.tenantA],
    );
    expect(asManager.ok, asManager.error).toBe(true);
    expect(asManager.rows.length).toBeGreaterThan(0);
    const asOwner = await db.attempt(
      'authenticated',
      asOwnerA,
      `select * from public.payments where tenant_id = $1`,
      [SEED.tenantA],
    );
    expect(asOwner.ok, asOwner.error).toBe(true);
    expect(asOwner.rows.length).toBeGreaterThan(0);
    // The ticket money columns stay visible to dispatchers: that is what to collect.
    const totals = await db.attempt<{ total_tzs: number; paid_tzs: number }>(
      'authenticated',
      nobody,
      `select total_tzs, paid_tzs from public.bookings where id = $1`,
      [mineA],
    );
    expect(totals.ok, totals.error).toBe(true);
    expect(totals.rows).toHaveLength(1);
  });

  it('customer OTP codes are invisible to every client role', async () => {
    for (const [role, claims] of [
      ['authenticated', asOwnerA],
      ['authenticated', asSuperAdmin],
      ['anon', {}],
    ] as const) {
      const r = await db.attempt(role, claims, `select * from public.customer_otp_codes`);
      expect(r.ok).toBe(false);
    }
  });
});

describe('portal_catalog (anonymous read)', () => {
  it('returns the company, active catalog and area names, nothing private', async () => {
    const r = await db.attempt<{ out: Record<string, unknown> }>(
      'anon',
      { role: 'anon' },
      `select public.portal_catalog('usafi-bora') as out`,
    );
    expect(r.ok, r.error).toBe(true);
    const out = r.rows[0]?.out as {
      tenant: {
        slug: string;
        name: string;
        settings: Record<string, unknown>;
        branding: Record<string, unknown>;
      };
      services: { id: string; active: boolean }[];
      addons: { id: string }[];
      zones: { name: string; areas: string[] }[];
      categories: unknown[];
    };
    expect(out.tenant).toMatchObject({ slug: 'usafi-bora', name: 'Usafi Bora Cleaners' });
    expect(out.tenant.settings).toMatchObject({ deposit_pct: 30, cancel_hours: 4, slot_hold_minutes: 15 });
    expect(out.tenant.branding).toMatchObject({ color: '#0E7C7B' });
    expect(out.services).toHaveLength(10);
    expect(out.services.map((s) => s.id)).not.toContain('55550000-0000-4000-8000-000000000011');
    expect(out.addons).toHaveLength(4);
    expect(out.zones.map((z) => z.name)).toContain('Mbezi & Kimara');
    expect(out.categories).toHaveLength(5);
    expect(JSON.stringify(out)).not.toMatch(/\+2557541000|notes_internal|customer/);
  });

  it('is case-insensitive on the slug and refuses unknown or suspended companies', async () => {
    const upper = await db.attempt('anon', { role: 'anon' }, `select public.portal_catalog(' Usafi-Bora ')`);
    expect(upper.ok, upper.error).toBe(true);
    const missing = await db.attempt('anon', { role: 'anon' }, `select public.portal_catalog('nobody')`);
    expect(missing.ok).toBe(false);
    expect(missing.error).toMatch(/tenant_not_found/);
    await db.sql(`update public.tenants set status = 'SUSPENDED' where id = $1`, [SEED.tenantB]);
    const suspended = await db.attempt(
      'anon',
      { role: 'anon' },
      `select public.portal_catalog('pwani-fresh')`,
    );
    expect(suspended.ok).toBe(false);
    expect(suspended.error).toMatch(/tenant_suspended/);
    await db.sql(`update public.tenants set status = 'TRIAL' where id = $1`, [SEED.tenantB]);
  });

  it('anon still cannot read the tables behind it', async () => {
    const r = await db.attempt('anon', { role: 'anon' }, `select slug from public.tenants`);
    expect(r.ok).toBe(false);
  });
});
