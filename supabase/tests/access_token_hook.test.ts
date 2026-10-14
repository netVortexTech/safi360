import { SEED, TestDb } from './harness.ts';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
});
afterAll(() => db.close());

async function runHook(userId: string): Promise<Record<string, unknown>> {
  const event = { user_id: userId, claims: { sub: userId, role: 'authenticated', aud: 'authenticated' } };
  const rows = await db.as('supabase_auth_admin', {}, async (tx) => {
    const r = await tx.query<{ out: { claims: Record<string, unknown> } }>(
      'select public.custom_access_token_hook($1::jsonb) as out',
      [JSON.stringify(event)],
    );
    return r.rows;
  });
  return rows[0]?.out.claims ?? {};
}

describe('custom_access_token_hook', () => {
  it('adds tenant_id and tenant_role for a member', async () => {
    const claims = await runHook(SEED.ownerA);
    expect(claims).toMatchObject({
      sub: SEED.ownerA,
      role: 'authenticated',
      tenant_id: SEED.tenantA,
      tenant_role: 'OWNER',
      is_super_admin: false,
    });
  });

  it('never overwrites the Postgres role claim', async () => {
    const claims = await runHook(SEED.ownerB);
    expect(claims.role).toBe('authenticated');
    expect(claims.tenant_role).toBe('OWNER');
  });

  it('marks super admins and leaves tenant claims null when there is no membership', async () => {
    const claims = await runHook(SEED.superAdmin);
    expect(claims).toMatchObject({ tenant_id: null, tenant_role: null, is_super_admin: true });
  });

  it('ignores inactive memberships and deleted tenants', async () => {
    await db.sql('update public.memberships set active = false where user_id = $1', [SEED.ownerB]);
    expect((await runHook(SEED.ownerB)).tenant_id).toBeNull();
    await db.sql('update public.memberships set active = true where user_id = $1', [SEED.ownerB]);
    await db.sql('update public.tenants set deleted_at = now() where id = $1', [SEED.tenantB]);
    expect((await runHook(SEED.ownerB)).tenant_id).toBeNull();
    await db.sql('update public.tenants set deleted_at = null where id = $1', [SEED.tenantB]);
  });

  it('is only executable by the auth service', async () => {
    const r = await db.attempt(
      'authenticated',
      { sub: SEED.ownerA },
      `select public.custom_access_token_hook('{}'::jsonb)`,
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/permission denied/i);
  });
});
