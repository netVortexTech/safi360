// 0034 · self-serve signup. A new owner creates their company and picks a plan through
// SECURITY DEFINER functions, because the direct table writes the browser used to attempt
// are (correctly) rejected by the grants, the memberships policy and the column guard.
import { asOwnerA, SEED, TestDb, type Claims } from './harness.ts';

let db: TestDb;

const newOwner = 'dddddddd-0000-4000-8000-000000000001';
const noPhone = 'dddddddd-0000-4000-8000-000000000002';
const second = 'dddddddd-0000-4000-8000-000000000003';
const employee = 'dddddddd-0000-4000-8000-000000000004';

const asNewOwner: Claims = { sub: newOwner, tenant_id: null, tenant_role: null };
const asNoPhone: Claims = { sub: noPhone, tenant_id: null, tenant_role: null };
const asSecond: Claims = { sub: second, tenant_id: null, tenant_role: null };
const asEmployee: Claims = { sub: employee, tenant_id: SEED.tenantA, tenant_role: 'CLEANER' };

let tenantId: string;

beforeAll(async () => {
  db = await TestDb.create({ seed: true });
  await db.sql(
    `insert into auth.users (id, phone, raw_user_meta_data) values
       ($1, '255754300001', '{"name":"Neema Joseph"}'),
       ($2, '255754300003', '{}'),
       ($3, '255754300004', '{}')`,
    [newOwner, second, employee],
  );
  await db.sql(`insert into auth.users (id, email) values ($1, 'nophone@example.com')`, [noPhone]);
  await db.sql(`insert into public.memberships (tenant_id, user_id, role) values ($1, $2, 'CLEANER')`, [
    SEED.tenantA,
    employee,
  ]);
});
afterAll(() => db.close());

function signup(
  claims: Claims,
  args: { name?: string; slug?: string; prefix?: string; city?: string | null } = {},
) {
  return db.attempt<{ id: string }>(
    'authenticated',
    claims,
    'select public.signup_tenant($1, $2, $3, $4) as id',
    [
      args.name ?? 'Neema Cleaners',
      args.slug ?? 'neema-cleaners',
      args.prefix ?? 'NMC',
      args.city === undefined ? 'Arusha' : args.city,
    ],
  );
}

function selectPlan(claims: Claims, planId: string) {
  return db.attempt('authenticated', claims, 'select public.select_plan($1)', [planId]);
}

async function hookClaims(userId: string): Promise<Record<string, unknown>> {
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

describe('the direct writes the browser used to attempt are rejected', () => {
  it('a signed-in user without a company cannot insert a tenant', async () => {
    const r = await db.attempt(
      'authenticated',
      asNewOwner,
      `insert into public.tenants (slug, name, phone_e164, ticket_prefix)
       values ('direct', 'Direct', '+255754300001', 'DRC') returning id`,
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/permission denied/i);
  });

  it('cannot grant themselves a membership', async () => {
    const r = await db.attempt(
      'authenticated',
      asNewOwner,
      `insert into public.memberships (tenant_id, user_id, role) values ($1, $2, 'OWNER')`,
      [SEED.tenantA, newOwner],
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/row-level security/i);
  });

  it('an OWNER cannot change plan_id, status or trial_ends_at directly', async () => {
    const r = await db.attempt(
      'authenticated',
      asOwnerA,
      `update public.tenants set plan_id = 'pro', status = 'ACTIVE', trial_ends_at = null where id = $1 returning id`,
      [SEED.tenantA],
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/immutable_column/);
  });

  it('a slug lookup through RLS cannot see other companies, so it cannot check availability', async () => {
    const r = await db.attempt(
      'authenticated',
      asNewOwner,
      `select id from public.tenants where slug = 'usafi-bora'`,
    );
    expect(r.ok).toBe(true);
    expect(r.rows).toEqual([]);
  });
});

describe('tenant_slug_available / tenant_prefix_available', () => {
  it('see every company and normalise case and whitespace', async () => {
    const r = await db.attempt<{
      slug_taken: boolean;
      slug_free: boolean;
      prefix_taken: boolean;
      prefix_free: boolean;
    }>(
      'authenticated',
      asNewOwner,
      `select not public.tenant_slug_available(' Usafi-Bora ') as slug_taken,
              public.tenant_slug_available('fresh-start')       as slug_free,
              not public.tenant_prefix_available('ubc')         as prefix_taken,
              public.tenant_prefix_available('ZZZ')             as prefix_free`,
    );
    expect(r.ok, r.error).toBe(true);
    expect(r.rows[0]).toEqual({ slug_taken: true, slug_free: true, prefix_taken: true, prefix_free: true });
  });

  it('are not callable anonymously', async () => {
    const r = await db.attempt('anon', {}, `select public.tenant_slug_available('usafi-bora')`);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/permission denied/i);
  });
});

describe('signup_tenant', () => {
  it('is not callable anonymously', async () => {
    const r = await db.attempt('anon', {}, `select public.signup_tenant('X Co', 'x-co', 'XCO', null)`);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/permission denied/i);
  });

  it('needs the OTP-verified +255 phone', async () => {
    const r = await signup(asNoPhone, { slug: 'no-phone', prefix: 'NPH' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/phone_required/);
  });

  it('creates the company on a 7-day trial with the caller as OWNER', async () => {
    const r = await signup(asNewOwner);
    expect(r.ok, r.error).toBe(true);
    tenantId = r.rows[0]!.id;

    const [tenant] = await db.sql<{
      slug: string;
      name: string;
      phone_e164: string;
      city: string;
      ticket_prefix: string;
      status: string;
      plan_id: string | null;
      branding: Record<string, unknown>;
      settings: Record<string, unknown>;
      trial_days: string | number;
    }>(
      `select slug, name, phone_e164, city, ticket_prefix, status::text, plan_id, branding, settings,
              extract(epoch from (trial_ends_at - now())) / 86400 as trial_days
       from public.tenants where id = $1`,
      [tenantId],
    );
    expect(tenant).toMatchObject({
      slug: 'neema-cleaners',
      name: 'Neema Cleaners',
      phone_e164: '+255754300001',
      city: 'Arusha',
      ticket_prefix: 'NMC',
      status: 'TRIAL',
      plan_id: null,
      branding: { display_name: 'Neema Cleaners' },
    });
    expect(Number(tenant!.trial_days)).toBeGreaterThan(6.9);
    expect(Number(tenant!.trial_days)).toBeLessThanOrEqual(7);
    expect(tenant!.settings).toMatchObject({ deposit_pct: 30, default_locale: 'sw' });
    expect((tenant!.settings.working_hours as Record<string, unknown>).mon).toEqual({
      open: '08:00',
      close: '18:00',
    });

    const members = await db.sql<{ role: string; active: boolean }>(
      `select role::text, active from public.memberships where tenant_id = $1`,
      [tenantId],
    );
    expect(members).toEqual([{ role: 'OWNER', active: true }]);

    // 0028 created the profile at auth signup; signup_tenant leaves it intact.
    const profile = await db.sql(`select phone_e164, name from public.profiles where id = $1`, [newOwner]);
    expect(profile).toEqual([{ phone_e164: '+255754300001', name: 'Neema Joseph' }]);
  });

  it('the access-token hook then issues the tenant claims', async () => {
    expect(await hookClaims(newOwner)).toMatchObject({ tenant_id: tenantId, tenant_role: 'OWNER' });
  });

  it('refuses a second company for the same account', async () => {
    const r = await signup(asNewOwner, { slug: 'neema-two', prefix: 'NMT' });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/already_member/);
  });

  it('refuses an existing owner and an employee alike', async () => {
    const owner = await signup(asOwnerA, { slug: 'another-co', prefix: 'ANO' });
    expect(owner.ok).toBe(false);
    expect(owner.error).toMatch(/already_member/);
    const staff = await signup(asEmployee, { slug: 'staff-co', prefix: 'STC' });
    expect(staff.ok).toBe(false);
    expect(staff.error).toMatch(/already_member/);
  });

  it('names the unique index when the slug or prefix is taken', async () => {
    const slug = await signup(asSecond, { slug: 'usafi-bora', prefix: 'SEC' });
    expect(slug.ok).toBe(false);
    expect(slug.error).toMatch(/tenants_slug_key/);
    const prefix = await signup(asSecond, { slug: 'second-co', prefix: 'UBC' });
    expect(prefix.ok).toBe(false);
    expect(prefix.error).toMatch(/tenants_ticket_prefix_key/);
  });

  it('enforces the format rules from the table constraints', async () => {
    const slug = await signup(asSecond, { slug: 'Bad Slug!', prefix: 'SEC' });
    expect(slug.ok).toBe(false);
    expect(slug.error).toMatch(/tenants_slug_check/);
    const prefix = await signup(asSecond, { slug: 'second-co', prefix: 'x' });
    expect(prefix.ok).toBe(false);
    expect(prefix.error).toMatch(/tenants_ticket_prefix_check/);
    const name = await signup(asSecond, { name: 'A', slug: 'second-co', prefix: 'SEC' });
    expect(name.ok).toBe(false);
    expect(name.error).toMatch(/tenants_name_check/);
    // Nothing leaked through from the failed attempts.
    const rows = await db.sql(`select id from public.memberships where user_id = $1`, [second]);
    expect(rows).toEqual([]);
  });
});

describe('select_plan', () => {
  it('records the plan for the owner without touching status or the trial', async () => {
    // No tenant claims on purpose: the token right after signup does not have them yet.
    const r = await selectPlan(asNewOwner, 'growth');
    expect(r.ok, r.error).toBe(true);
    const [row] = await db.sql<{ plan_id: string; status: string; trial_ends_at: string | null }>(
      `select plan_id, status::text, trial_ends_at from public.tenants where id = $1`,
      [tenantId],
    );
    expect(row).toMatchObject({ plan_id: 'growth', status: 'TRIAL' });
    expect(row!.trial_ends_at).not.toBeNull();
  });

  it('rejects an unknown or inactive plan', async () => {
    const unknown = await selectPlan(asNewOwner, 'nope');
    expect(unknown.ok).toBe(false);
    expect(unknown.error).toMatch(/plan_not_found/);

    await db.sql(`update public.plans set active = false where id = 'pro'`);
    const inactive = await selectPlan(asNewOwner, 'pro');
    expect(inactive.ok).toBe(false);
    expect(inactive.error).toMatch(/plan_not_found/);
    await db.sql(`update public.plans set active = true where id = 'pro'`);
  });

  it('cannot revive an expired trial', async () => {
    await db.sql(`update public.tenants set trial_ends_at = now() - interval '1 day' where id = $1`, [
      tenantId,
    ]);
    const r = await selectPlan(asNewOwner, 'starter');
    expect(r.ok, r.error).toBe(true);
    const [row] = await db.sql<{ plan_id: string; status: string; expired: boolean }>(
      `select plan_id, status::text, trial_ends_at < now() as expired from public.tenants where id = $1`,
      [tenantId],
    );
    expect(row).toEqual({ plan_id: 'starter', status: 'TRIAL', expired: true });
  });

  it('the platform-write flag unlocks plan_id only, never status or the trial', async () => {
    const outcome = await db
      .as('authenticated', asOwnerA, async (tx) => {
        await tx.query(`select set_config('app.platform_tenant_write', 'plan_id', true)`);
        await tx.query(
          `update public.tenants set status = 'SUSPENDED', trial_ends_at = now() where id = $1`,
          [SEED.tenantA],
        );
        return 'updated';
      })
      .catch((err: Error) => err.message);
    expect(outcome).toMatch(/immutable_column/);
  });

  it('rejects anyone who is not the OWNER of a live company', async () => {
    const staff = await selectPlan(asEmployee, 'growth');
    expect(staff.ok).toBe(false);
    expect(staff.error).toMatch(/owner_required/);
    const nobody = await selectPlan(asNoPhone, 'growth');
    expect(nobody.ok).toBe(false);
    expect(nobody.error).toMatch(/owner_required/);
    const anon = await db.attempt('anon', {}, `select public.select_plan('growth')`);
    expect(anon.ok).toBe(false);
    expect(anon.error).toMatch(/permission denied/i);
  });
});
