import { asOwnerA, asOwnerB, asSuperAdmin, mustCreateBooking, SEED, TestDb, type Claims } from './harness.ts';

const TABLES = [
  'service_categories',
  'services',
  'service_addons',
  'service_zones',
  'staff',
  'staff_availability',
  'assignments',
] as const;

const SOFA_A = '55550000-0000-4000-8000-000000000001';
const SOFA_B = '55550000-0000-4000-8000-000000000101';
const NEEMA = '88880000-0000-4000-8000-000000000001';
const REHEMA = '88880000-0000-4000-8000-000000000002';
const CLEANER_USER = 'cccccccc-0000-4000-8000-000000000001';
const DISPATCHER_USER = 'cccccccc-0000-4000-8000-000000000002';

const manager: Claims = { sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'MANAGER' };
const dispatcher: Claims = { sub: DISPATCHER_USER, tenant_id: SEED.tenantA, tenant_role: 'DISPATCHER' };
const cleaner: Claims = { sub: CLEANER_USER, tenant_id: SEED.tenantA, tenant_role: 'CLEANER' };

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
  // A cleaner login linked to Neema, and a dispatcher, so role-scoped reads can be tested.
  await db.sql(`insert into auth.users (id, phone) values ($1, '255754100001'), ($2, '255754100009')`, [
    CLEANER_USER,
    DISPATCHER_USER,
  ]);
  await db.sql(
    `insert into public.memberships (tenant_id, user_id, role) values ($1, $2, 'CLEANER'), ($1, $3, 'DISPATCHER')`,
    [SEED.tenantA, CLEANER_USER, DISPATCHER_USER],
  );
  await db.sql(`update public.staff set user_id = $1 where id = $2`, [CLEANER_USER, NEEMA]);
  // Tenant B also needs availability + an assignment so every table has rows on both sides.
  await db.sql(
    `insert into public.staff_availability (tenant_id, staff_id, weekday, start_time, end_time) values ($1, $2, 1, '08:00', '17:00')`,
    [SEED.tenantB, '88880000-0000-4000-8000-000000000101'],
  );
  // Assignments need real bookings since 0011; create them through the write path.
  const bookingB = await mustCreateBooking(db, {
    tenant: SEED.tenantB,
    phone: '+255754200010',
    name: 'Mwajuma Ali',
    serviceId: '55550000-0000-4000-8000-000000000101',
    address: { area: 'Stone Town' },
    start: '2026-10-16T06:00:00Z',
    end: '2026-10-16T08:00:00Z',
  });
  await db.sql(
    `insert into public.assignments (tenant_id, booking_id, staff_id, starts_at, ends_at)
     values ($1, $2, $3, '2026-10-16T06:00:00Z', '2026-10-16T08:00:00Z')`,
    [SEED.tenantB, bookingB.booking_id, '88880000-0000-4000-8000-000000000101'],
  );
  for (const [key, start, end] of [
    ['bookingA2', '2026-10-17T06:00:00Z', '2026-10-17T08:00:00Z'],
    ['bookingA3', '2026-10-18T06:00:00Z', '2026-10-18T08:00:00Z'],
    ['bookingA4', '2026-10-19T06:00:00Z', '2026-10-19T08:00:00Z'],
    ['bookingA5', '2026-10-21T06:00:00Z', '2026-10-21T08:00:00Z'],
  ] as const) {
    const b = await mustCreateBooking(db, { phone: `+25571500${key.slice(-1)}000`, start, end });
    bookings[key] = b.booking_id;
  }
  await db.sql(
    `insert into public.assignments (tenant_id, booking_id, staff_id, starts_at, ends_at)
     values ($1, $2, $3, '2026-10-17T06:00:00Z', '2026-10-17T08:00:00Z')`,
    [SEED.tenantA, bookings.bookingA2, REHEMA],
  );
});

const bookings: Record<string, string> = {};
afterAll(() => db.close());

describe('catalog & staff isolation — reads', () => {
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

  it('a cleaner reads the catalog and colleagues but only their own assignments', async () => {
    const services = await db.attempt('authenticated', cleaner, `select id from public.services`);
    expect(services.ok, services.error).toBe(true);
    expect(services.rows.length).toBeGreaterThan(5);

    const staff = await db.attempt('authenticated', cleaner, `select id from public.staff`);
    expect(staff.rows.length).toBe(5);

    const mine = await db.attempt<{ staff_id: string }>(
      'authenticated',
      cleaner,
      `select staff_id from public.assignments`,
    );
    expect(mine.ok, mine.error).toBe(true);
    expect(mine.rows.map((r) => r.staff_id)).toEqual([NEEMA]);

    const office = await db.attempt('authenticated', dispatcher, `select staff_id from public.assignments`);
    expect(office.rows).toHaveLength(2);
  });

  it("composite foreign key refuses an assignment on another tenant's booking", async () => {
    const r = await db.attempt(
      'authenticated',
      asOwnerB,
      `insert into public.assignments (tenant_id, booking_id, staff_id, starts_at, ends_at)
       values ($1, $2, $3, '2026-10-17T06:00:00Z', '2026-10-17T08:00:00Z')`,
      [SEED.tenantB, bookings.bookingA2, '88880000-0000-4000-8000-000000000101'],
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/foreign key/i);
  });
});

describe('catalog & staff isolation — writes', () => {
  it('owner A can create a service for tenant A but not for tenant B', async () => {
    const ok = await db.attempt<{ id: string }>(
      'authenticated',
      asOwnerA,
      `insert into public.services (tenant_id, name_sw, name_en, pricing_type, pricing_rule)
       values ($1, 'Jaribio', 'Test', 'FLAT', '{"price_tzs":1000}') returning id`,
      [SEED.tenantA],
    );
    expect(ok.ok, ok.error).toBe(true);

    const cross = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into public.services (tenant_id, name_sw, name_en, pricing_type, pricing_rule)
       values ($1, 'Jaribio', 'Test', 'FLAT', '{"price_tzs":1000}')`,
      [SEED.tenantB],
    );
    expect(cross.ok).toBe(false);
    expect(cross.error).toMatch(/row-level security/i);
  });

  it('owner A cannot update or delete tenant B services (rows are invisible)', async () => {
    const upd = await db.attempt(
      'authenticated',
      asOwnerA,
      `update public.services set name_en = 'hacked' where id = $1 returning id`,
      [SOFA_B],
    );
    expect(upd.ok).toBe(true);
    expect(upd.rows).toEqual([]);
    const del = await db.attempt(
      'authenticated',
      asOwnerA,
      `delete from public.staff where tenant_id = $1 returning id`,
      [SEED.tenantB],
    );
    expect(del.ok).toBe(true);
    expect(del.rows).toEqual([]);
  });

  it('managers edit the catalog and staff; dispatchers and cleaners cannot', async () => {
    const m = await db.attempt(
      'authenticated',
      manager,
      `update public.services set active = active where id = $1 returning id`,
      [SOFA_A],
    );
    expect(m.ok, m.error).toBe(true);
    expect(m.rows).toHaveLength(1);

    for (const claims of [dispatcher, cleaner]) {
      const role = String(claims.tenant_role);
      const r = await db.attempt(
        'authenticated',
        claims,
        `update public.services set name_en = 'x' where id = $1 returning id`,
        [SOFA_A],
      );
      expect(r.ok, role).toBe(true);
      expect(r.rows, role).toEqual([]);
      const ins = await db.attempt(
        'authenticated',
        claims,
        `insert into public.staff (tenant_id, display_name) values ($1, 'Nobody')`,
        [SEED.tenantA],
      );
      expect(ins.ok, role).toBe(false);
    }
  });

  it('dispatchers create assignments; cleaners cannot', async () => {
    const d = await db.attempt<{ id: string }>(
      'authenticated',
      dispatcher,
      `insert into public.assignments (tenant_id, booking_id, staff_id, starts_at, ends_at)
       values ($1, $3, $2, '2026-10-18T06:00:00Z', '2026-10-18T08:00:00Z') returning id`,
      [SEED.tenantA, REHEMA, bookings.bookingA3],
    );
    expect(d.ok, d.error).toBe(true);
    const c = await db.attempt(
      'authenticated',
      cleaner,
      `insert into public.assignments (tenant_id, booking_id, staff_id, starts_at, ends_at)
       values ($1, $3, $2, '2026-10-19T06:00:00Z', '2026-10-19T08:00:00Z')`,
      [SEED.tenantA, NEEMA, bookings.bookingA4],
    );
    expect(c.ok).toBe(false);
  });

  it('composite foreign keys refuse parents from another tenant', async () => {
    const r = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into public.services (tenant_id, category_id, name_sw, name_en, pricing_type, pricing_rule)
       values ($1, '44440000-0000-4000-8000-000000000101', 'X', 'X', 'FLAT', '{"price_tzs":1}')`,
      [SEED.tenantA],
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/foreign key/i);
    const addon = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into public.service_addons (tenant_id, service_id, name_sw, name_en, price_tzs) values ($1, $2, 'X', 'X', 1)`,
      [SEED.tenantA, SOFA_B],
    );
    expect(addon.ok).toBe(false);
  });
});

describe('staff_availability constraints', () => {
  const insert = (cols: string, vals: string) =>
    db.attempt(
      'authenticated',
      asOwnerA,
      `insert into public.staff_availability (tenant_id, staff_id, ${cols}) values ($1, $2, ${vals})`,
      [SEED.tenantA, NEEMA],
    );

  it('a row is weekly or dated, never both or neither', async () => {
    expect((await insert('weekday, date, is_off', `1, '2026-10-20', true`)).ok).toBe(false);
    expect((await insert('is_off', `true`)).ok).toBe(false);
  });

  it('working rows need an ordered time range; off rows carry none', async () => {
    expect((await insert('weekday, start_time, end_time', `1, '17:00', '09:00'`)).ok).toBe(false);
    expect((await insert('weekday, is_off, start_time, end_time', `1, true, '09:00', '17:00'`)).ok).toBe(
      false,
    );
    expect((await insert('date, date_to, is_off', `'2026-11-02', '2026-11-01', true`)).ok).toBe(false);
    expect((await insert('date, start_time, end_time', `'2026-11-02', '09:00', '13:00'`)).ok).toBe(true);
  });

  it('assignments must end after they start', async () => {
    const r = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into public.assignments (tenant_id, booking_id, staff_id, starts_at, ends_at)
       values ($1, $3, $2, '2026-10-21T08:00:00Z', '2026-10-21T06:00:00Z')`,
      [SEED.tenantA, NEEMA, bookings.bookingA5],
    );
    expect(r.ok).toBe(false);
  });
});
