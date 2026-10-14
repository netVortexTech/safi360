import {
  BOOKING_SOURCES,
  BOOKING_STATUSES,
  MEMBER_ROLES,
  NOTIFICATION_STATUSES,
  PAYMENT_STATUSES,
  PRICING_TYPES,
  TENANT_STATUSES,
} from '../functions/_shared/enums.ts';
import { TestDb } from './harness.ts';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
});
afterAll(() => db.close());

async function enumLabels(name: string): Promise<string[]> {
  const rows = await db.sql<{ enumlabel: string }>(
    `select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = $1 order by e.enumsortorder`,
    [name],
  );
  return rows.map((r) => r.enumlabel);
}

describe('migrations', () => {
  it('apply cleanly and seed loads', async () => {
    const rows = await db.sql<{ count: string }>('select count(*)::text as count from public.tenants');
    expect(Number(rows[0]?.count)).toBe(2);
  });

  it.each([
    ['booking_status', BOOKING_STATUSES],
    ['booking_source', BOOKING_SOURCES],
    ['payment_status', PAYMENT_STATUSES],
    ['notification_status', NOTIFICATION_STATUSES],
    ['member_role', MEMBER_ROLES],
    ['pricing_type', PRICING_TYPES],
    ['tenant_status', TENANT_STATUSES],
  ])('enum %s matches _shared/enums.ts', async (name, expected) => {
    expect(await enumLabels(name)).toEqual([...expected]);
  });

  it('every public table has RLS enabled', async () => {
    const rows = await db.sql<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' order by 1`,
    );
    expect(rows.length).toBeGreaterThan(0);
    const unprotected = rows.filter((r) => !r.relrowsecurity).map((r) => r.relname);
    expect(unprotected).toEqual([]);
  });

  it('every tenant table has a NOT NULL tenant_id', async () => {
    const platformOnly = new Set(['plans', 'profiles', 'tenants']); // tenants is keyed by id
    const nullableAllowed = new Set(['audit_logs']); // platform-level actions have no tenant
    const tables = await db.sql<{ relname: string }>(
      `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    );
    for (const { relname } of tables) {
      if (platformOnly.has(relname)) continue;
      const [col] = await db.sql<{ is_nullable: string }>(
        `select is_nullable from information_schema.columns where table_schema='public' and table_name=$1 and column_name='tenant_id'`,
        [relname],
      );
      expect(col, `${relname} is missing tenant_id`).toBeDefined();
      if (!nullableAllowed.has(relname)) expect(col?.is_nullable, `${relname}.tenant_id nullable`).toBe('NO');
    }
  });

  it('anon has no table privileges in public', async () => {
    const rows = await db.sql<{ table_name: string; privilege_type: string }>(
      `select table_name, privilege_type from information_schema.role_table_grants
       where grantee = 'anon' and table_schema = 'public'`,
    );
    expect(rows).toEqual([]);
  });

  it('secrets, counters and rate limits are not granted to authenticated', async () => {
    const rows = await db.sql<{ table_name: string }>(
      `select distinct table_name from information_schema.role_table_grants
       where grantee = 'authenticated' and table_schema = 'public'
         and table_name in ('tenant_integration_secrets', 'tenant_counters', 'rate_limits')`,
    );
    expect(rows).toEqual([]);
  });
});
