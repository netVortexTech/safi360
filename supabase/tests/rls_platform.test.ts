import { asOwnerA, asOwnerB, asSuperAdmin, SEED, TestDb, type Claims } from './harness.ts';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
  // Give both tenants an audit row and a secret so cross-tenant reads have something to miss.
  await db.sql(`insert into public.audit_logs (tenant_id, action) values ($1, 'seed.a'), ($2, 'seed.b')`, [
    SEED.tenantA,
    SEED.tenantB,
  ]);
  await db.sql(
    `insert into public.tenant_integrations (tenant_id, kind, config) values ($1, 'SMS', '{"sender_id":"PFC"}')`,
    [SEED.tenantB],
  );
  await db.sql(
    `insert into public.tenant_integration_secrets (tenant_id, kind, secret_enc) values ($1, 'WHATSAPP', '\\x00'), ($2, 'SMS', '\\x00')`,
    [SEED.tenantA, SEED.tenantB],
  );
});
afterAll(() => db.close());

const TENANT_TABLES = ['tenants', 'memberships', 'tenant_integrations', 'audit_logs'] as const;
const HIDDEN_TABLES = ['tenant_counters', 'tenant_integration_secrets', 'rate_limits'] as const;

function tenantColumn(table: string): string {
  return table === 'tenants' ? 'id' : 'tenant_id';
}

describe('tenant isolation — reads', () => {
  it.each(TENANT_TABLES)('tenant A cannot read tenant B rows in %s', async (table) => {
    const col = tenantColumn(table);
    const mine = await db.attempt('authenticated', asOwnerA, `select ${col} from public.${table}`);
    expect(mine.ok, mine.error).toBe(true);
    expect(mine.rows.length).toBeGreaterThan(0);
    for (const row of mine.rows) expect(row[col]).toBe(SEED.tenantA);

    const theirs = await db.attempt(
      'authenticated',
      asOwnerA,
      `select ${col} from public.${table} where ${col} = $1`,
      [SEED.tenantB],
    );
    expect(theirs.ok).toBe(true);
    expect(theirs.rows).toEqual([]);
  });

  it.each(TENANT_TABLES)('tenant B cannot read tenant A rows in %s', async (table) => {
    const col = tenantColumn(table);
    const theirs = await db.attempt(
      'authenticated',
      asOwnerB,
      `select ${col} from public.${table} where ${col} = $1`,
      [SEED.tenantA],
    );
    expect(theirs.ok).toBe(true);
    expect(theirs.rows).toEqual([]);
  });

  it.each(HIDDEN_TABLES)('no authenticated user can read %s, even for their own tenant', async (table) => {
    const r = await db.attempt('authenticated', asOwnerA, `select * from public.${table}`);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/permission denied/i);
  });

  it.each([...TENANT_TABLES, ...HIDDEN_TABLES, 'plans', 'profiles'])('anon cannot read %s', async (table) => {
    const r = await db.attempt('anon', {}, `select * from public.${table}`);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/permission denied/i);
  });

  it('a user with no tenant claim sees no tenant rows', async () => {
    const claims: Claims = { sub: SEED.ownerA, tenant_id: null, tenant_role: null };
    const r = await db.attempt('authenticated', claims, 'select id from public.tenants');
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([]);
  });

  it('a super admin reads every tenant', async () => {
    const r = await db.attempt('authenticated', asSuperAdmin, 'select id from public.tenants order by slug');
    expect(r.ok).toBe(true);
    expect(r.rows.map((x) => x.id)).toEqual([SEED.tenantB, SEED.tenantA]);
  });

  it('profiles: colleagues are visible, strangers are not', async () => {
    const r = await db.attempt('authenticated', asOwnerA, 'select id from public.profiles order by id');
    expect(r.ok).toBe(true);
    expect(r.rows.map((x) => x.id)).toEqual([SEED.ownerA]);
  });
});

describe('tenant isolation — writes', () => {
  it('tenant A cannot update tenant B', async () => {
    const r = await db.attempt(
      'authenticated',
      asOwnerA,
      `update public.tenants set name = 'hacked' where id = $1 returning id`,
      [SEED.tenantB],
    );
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([]); // RLS filters the row; nothing updated
    const [row] = await db.sql<{ name: string }>('select name from public.tenants where id = $1', [
      SEED.tenantB,
    ]);
    expect(row?.name).toBe('Pwani Fresh Cleaning');
  });

  it('tenant A cannot insert a membership into tenant B', async () => {
    const r = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into public.memberships (tenant_id, user_id, role) values ($1, $2, 'CLEANER')`,
      [SEED.tenantB, SEED.ownerA],
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/row-level security/i);
  });

  it('tenant A cannot delete tenant B memberships', async () => {
    const r = await db.attempt(
      'authenticated',
      asOwnerA,
      `delete from public.memberships where tenant_id = $1 returning id`,
      [SEED.tenantB],
    );
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([]);
  });

  it('nobody can write audit_logs directly, and rows are append-only', async () => {
    const ins = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into public.audit_logs (tenant_id, action) values ($1, 'x')`,
      [SEED.tenantA],
    );
    expect(ins.ok).toBe(false);
    await expect(db.sql(`update public.audit_logs set action = 'tampered'`)).rejects.toThrow(/append-only/);
    await expect(db.sql(`delete from public.audit_logs`)).rejects.toThrow(/append-only/);
  });

  it('anon cannot insert anywhere', async () => {
    const r = await db.attempt(
      'anon',
      {},
      `insert into public.tenants (slug, name, phone_e164, ticket_prefix) values ('x-y', 'X', '+255700000000', 'XY')`,
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/permission denied/i);
  });
});

describe('tenant self-service limits', () => {
  it('an owner may update branding and settings', async () => {
    const r = await db.attempt(
      'authenticated',
      asOwnerA,
      `update public.tenants set branding = branding || '{"color":"#13293D"}' where id = $1 returning branding->>'color' as color`,
      [SEED.tenantA],
    );
    expect(r.ok, r.error).toBe(true);
    expect(r.rows[0]?.color).toBe('#13293D');
  });

  it('an owner may not change the ticket prefix, plan or status', async () => {
    for (const set of [
      `ticket_prefix = 'ZZZ'`,
      `plan_id = 'pro'`,
      `status = 'SUSPENDED'`,
      `slug = 'other'`,
      `deleted_at = now()`,
    ]) {
      const r = await db.attempt(
        'authenticated',
        asOwnerA,
        `update public.tenants set ${set} where id = $1`,
        [SEED.tenantA],
      );
      expect(r.ok, set).toBe(false);
      expect(r.error).toMatch(/immutable_column/);
    }
  });

  it('a manager may not grant OWNER, and nobody edits their own membership', async () => {
    const newUser = 'bbbbbbbb-0000-4000-8000-000000000009';
    await db.sql(`insert into auth.users (id, phone) values ($1, '255700000009')`, [newUser]);
    const manager: Claims = { sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'MANAGER' };

    const grantOwner = await db.attempt(
      'authenticated',
      manager,
      `insert into public.memberships (tenant_id, user_id, role) values ($1, $2, 'OWNER')`,
      [SEED.tenantA, newUser],
    );
    expect(grantOwner.ok).toBe(false);

    const grantCleaner = await db.attempt(
      'authenticated',
      manager,
      `insert into public.memberships (tenant_id, user_id, role) values ($1, $2, 'CLEANER') returning role`,
      [SEED.tenantA, newUser],
    );
    expect(grantCleaner.ok, grantCleaner.error).toBe(true);

    const selfPromote = await db.attempt(
      'authenticated',
      manager,
      `update public.memberships set role = 'OWNER' where user_id = $1 returning role`,
      [SEED.ownerA],
    );
    expect(selfPromote.ok).toBe(true);
    expect(selfPromote.rows).toEqual([]);
  });

  it('a user may not make themselves super admin', async () => {
    const r = await db.attempt(
      'authenticated',
      asOwnerA,
      `update public.profiles set is_super_admin = true where id = $1`,
      [SEED.ownerA],
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/immutable_column/);
  });
});
