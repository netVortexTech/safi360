// 0039 · client accounts: customer_register / customer_password_hash, and the credentials
// table staying invisible to every client role.
import { asOwnerA, SEED, TestDb } from './harness.ts';

let db: TestDb;
const HASH = 'pbkdf2$sha256$1000$c2FsdA$aGFzaA';
const NEW_PHONE = '+255754500001';

beforeAll(async () => {
  db = await TestDb.create({ seed: true });
});
afterAll(() => db.close());

function register(phone: string, name: string | null, email: string | null = null) {
  return db.attempt<{ id: string }>(
    'service_role',
    { role: 'service_role' },
    `select public.customer_register($1, $2, $3, $4, 'sw', $5) as id`,
    [SEED.tenantA, phone, name, email, HASH],
  );
}

describe('customer_register', () => {
  it('creates a new client with the password', async () => {
    const r = await register(NEW_PHONE, 'Neema Joseph', 'Neema@Example.com');
    expect(r.ok, r.error).toBe(true);
    const [row] = await db.sql<{ name: string; email: string; first_source: string; hash: string }>(
      `select c.name, c.email, c.first_source::text, cc.password_hash as hash
       from public.customers c join public.customer_credentials cc on cc.customer_id = c.id
       where c.tenant_id = $1 and c.phone_e164 = $2`,
      [SEED.tenantA, NEW_PHONE],
    );
    expect(row).toEqual({
      name: 'Neema Joseph',
      email: 'neema@example.com',
      first_source: 'website',
      hash: HASH,
    });
  });

  it('refuses a second password on the same phone at the same business', async () => {
    const r = await register(NEW_PHONE, 'Someone Else');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already_registered/);
  });

  it('adopts an existing client record without overwriting the name the office saved', async () => {
    const [existing] = await db.sql<{ phone_e164: string; name: string }>(
      `select phone_e164, name from public.customers c
       where tenant_id = $1 and not exists (select 1 from public.customer_credentials cc where cc.customer_id = c.id)
       limit 1`,
      [SEED.tenantA],
    );
    expect(existing).toBeDefined();
    const r = await register(existing!.phone_e164, 'Different Name');
    expect(r.ok, r.error).toBe(true);
    const [after] = await db.sql<{ name: string }>(
      'select name from public.customers where tenant_id = $1 and phone_e164 = $2',
      [SEED.tenantA, existing!.phone_e164],
    );
    expect(after?.name).toBe(existing!.name);
  });

  it('needs a name to create a brand-new client', async () => {
    const r = await register('+255754500002', null);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/name_required/);
  });
});

describe('customer_password_hash', () => {
  it('returns the hash for an account and null otherwise', async () => {
    const q = (phone: string) =>
      db.attempt<{ h: string | null }>(
        'service_role',
        { role: 'service_role' },
        'select public.customer_password_hash($1, $2) as h',
        [SEED.tenantA, phone],
      );
    expect((await q(NEW_PHONE)).rows[0]?.h).toBe(HASH);
    expect((await q('+255754599999')).rows[0]?.h).toBeNull();
  });
});

describe('isolation', () => {
  it('hides credentials and both functions from staff and anonymous callers', async () => {
    const read = await db.attempt('authenticated', asOwnerA, 'select * from public.customer_credentials');
    expect(read.ok).toBe(false);
    expect(read.error).toMatch(/permission denied/i);
    for (const role of ['authenticated', 'anon'] as const) {
      const claims = role === 'anon' ? {} : asOwnerA;
      const fn = await db.attempt(role, claims, 'select public.customer_password_hash($1, $2)', [
        SEED.tenantA,
        NEW_PHONE,
      ]);
      expect(fn.ok).toBe(false);
      expect(fn.error).toMatch(/permission denied/i);
    }
  });
});
