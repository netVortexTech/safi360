// 0028 · a new cleaner signs in with their own phone: GoTrue creates the auth user and
// the trigger creates the matching profile, so the office can find them by phone and add
// a membership. No membership means no tenant data.
import { SEED, TestDb } from './harness.ts';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
});
afterAll(() => db.close());

describe('staff self-provisioning', () => {
  const newUser = 'cccccccc-0000-4000-8000-000000000042';

  it('creates a profile from the auth user phone and name', async () => {
    await db.sql(
      `insert into auth.users (id, phone, raw_user_meta_data) values ($1, '255754100042', '{"name":"Amina Juma"}')`,
      [newUser],
    );
    const rows = await db.sql<{ phone_e164: string; name: string; locale: string }>(
      `select phone_e164, name, locale from public.profiles where id = $1`,
      [newUser],
    );
    expect(rows).toEqual([{ phone_e164: '+255754100042', name: 'Amina Juma', locale: 'sw' }]);
  });

  it('stores a non-Tanzanian phone as null instead of failing', async () => {
    const other = 'cccccccc-0000-4000-8000-000000000043';
    await db.sql(`insert into auth.users (id, phone) values ($1, '447700900123')`, [other]);
    const rows = await db.sql<{ phone_e164: string | null }>(
      `select phone_e164 from public.profiles where id = $1`,
      [other],
    );
    expect(rows).toEqual([{ phone_e164: null }]);
  });

  it('the office can then find the phone and link a CLEANER membership', async () => {
    const found = await db.sql<{ id: string }>(
      `select id from public.profiles where phone_e164 = '+255754100042'`,
    );
    expect(found[0]?.id).toBe(newUser);

    await db.sql(`insert into public.memberships (tenant_id, user_id, role) values ($1, $2, 'CLEANER')`, [
      SEED.tenantA,
      newUser,
    ]);
    const link = await db.sql<{ role: string; active: boolean }>(
      `select role, active from public.memberships where tenant_id = $1 and user_id = $2`,
      [SEED.tenantA, newUser],
    );
    expect(link).toEqual([{ role: 'CLEANER', active: true }]);
  });

  it('the seeded owner keeps a single profile (trigger has no conflict)', async () => {
    const rows = await db.sql<{ n: number }>(
      `select count(*)::int as n from public.profiles where phone_e164 = '+255754000001'`,
    );
    expect(rows[0]?.n).toBe(1);
  });
});

describe('claim_staff_invite', () => {
  const user = 'cccccccc-0000-4000-8000-000000000050';
  let staffId: string;

  beforeAll(async () => {
    await db.sql(
      `insert into auth.users (id, phone, raw_user_meta_data) values ($1, '255754100050', '{"name":"Claim Tester"}')`,
      [user],
    );
    const rows = await db.sql<{ id: string }>(
      `insert into public.staff (tenant_id, display_name, phone_e164)
       values ($1, 'Claim Tester', '+255754100050') returning id`,
      [SEED.tenantA],
    );
    staffId = rows[0]!.id;
  });

  async function claim() {
    return db.attempt<{ claim_staff_invite: string | null }>(
      'authenticated',
      { sub: user },
      'select public.claim_staff_invite() as claim_staff_invite',
    );
  }

  it('links the roster row by phone and grants CLEANER', async () => {
    const res = await claim();
    expect(res.ok).toBe(true);
    expect(res.rows[0]?.claim_staff_invite).toBe(staffId);
    const staff = await db.sql<{ user_id: string }>(`select user_id from public.staff where id = $1`, [
      staffId,
    ]);
    expect(staff[0]?.user_id).toBe(user);
    const member = await db.sql<{ role: string }>(
      `select role from public.memberships where tenant_id = $1 and user_id = $2`,
      [SEED.tenantA, user],
    );
    expect(member[0]?.role).toBe('CLEANER');
  });

  it('returns null on the second call (no roster row left to claim)', async () => {
    const res = await claim();
    expect(res.ok).toBe(true);
    expect(res.rows[0]?.claim_staff_invite).toBeNull();
  });

  it('cannot claim a roster row that is already linked to another user', async () => {
    const other = 'cccccccc-0000-4000-8000-000000000051';
    await db.sql(
      `insert into auth.users (id, phone, raw_user_meta_data) values ($1, '255754100051', '{"name":"Other"}')`,
      [other],
    );
    // A roster row for the same phone already linked to someone else must stay untouched.
    await db.sql(
      `insert into public.staff (tenant_id, user_id, display_name, phone_e164)
       values ($1, $2, 'Linked', '+255754100051')`,
      [SEED.tenantA, SEED.ownerA],
    );
    const res = await db.attempt<{ claim_staff_invite: string | null }>(
      'authenticated',
      { sub: other },
      'select public.claim_staff_invite() as claim_staff_invite',
    );
    expect(res.ok).toBe(true);
    expect(res.rows[0]?.claim_staff_invite).toBeNull();
    const still = await db.sql<{ user_id: string }>(
      `select user_id from public.staff where phone_e164 = '+255754100051'`,
    );
    expect(still[0]?.user_id).toBe(SEED.ownerA);
  });
});

describe('invite_staff_by_phone', () => {
  const newUser = 'cccccccc-0000-4000-8000-000000000060';

  function invite(claims: object, phone: string, role: string) {
    return db.attempt<{ invite_staff_by_phone: string }>(
      'authenticated',
      claims,
      'select public.invite_staff_by_phone($1, $2::public.member_role) as invite_staff_by_phone',
      [phone, role],
    );
  }

  beforeAll(async () => {
    await db.sql(
      `insert into auth.users (id, phone, raw_user_meta_data) values ($1, '255754100060', '{"name":"Invitee"}')`,
      [newUser],
    );
  });

  it('lets an owner invite by phone and links the cleaner roster row', async () => {
    const res = await invite(
      { sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'OWNER' },
      '+255754100060',
      'CLEANER',
    );
    expect(res.ok).toBe(true);
    expect(res.rows[0]?.invite_staff_by_phone).toBe(newUser);
    const member = await db.sql<{ role: string }>(
      `select role from public.memberships where tenant_id = $1 and user_id = $2`,
      [SEED.tenantA, newUser],
    );
    expect(member[0]?.role).toBe('CLEANER');
    const staff = await db.sql<{ user_id: string; display_name: string }>(
      `select user_id, display_name from public.staff where tenant_id = $1 and phone_e164 = '+255754100060'`,
      [SEED.tenantA],
    );
    expect(staff[0]).toEqual({ user_id: newUser, display_name: 'Invitee' });
  });

  it('rejects a cleaner caller, and manager may invite a dispatcher', async () => {
    const denied = await invite(
      { sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'CLEANER' },
      '+255754100060',
      'DISPATCHER',
    );
    expect(denied.ok).toBe(false);

    const other = 'cccccccc-0000-4000-8000-000000000061';
    await db.sql(`insert into auth.users (id, phone) values ($1, '255754100061')`, [other]);
    const ok = await invite(
      { sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'MANAGER' },
      '+255754100061',
      'DISPATCHER',
    );
    expect(ok.ok).toBe(true);
  });

  it('never grants OWNER and never edits your own membership', async () => {
    const owner = await invite(
      { sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'OWNER' },
      '+255754100060',
      'OWNER',
    );
    expect(owner.ok).toBe(false);
    expect(owner.error).toContain('invalid_role');

    const self = await invite(
      { sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'OWNER' },
      '+255754000001',
      'MANAGER',
    );
    expect(self.ok).toBe(false);
    expect(self.error).toContain('cannot_edit_self');
  });

  it('reports an unknown phone instead of failing silently', async () => {
    const res = await invite(
      { sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'OWNER' },
      '+255754100099',
      'CLEANER',
    );
    expect(res.ok).toBe(false);
    expect(res.error).toContain('profile_not_found');
  });
});
