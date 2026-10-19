// 0031–0033 · the hardening that closed the audit findings stays closed:
// the profile phone is immutable to clients, claiming a staff invite trusts only the
// OTP-verified auth phone, default grants (TRUNCATE!) are gone, support messages and
// impersonation sessions bind their author, a MANAGER cannot demote the OWNER, and
// job-evidence storage is tenant-scoped.
import { SEED, TestDb, asOwnerA } from './harness.ts';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
});
afterAll(() => db.close());

describe('profile phone is immutable to clients (0031)', () => {
  it('rejects a self-service phone change', async () => {
    const res = await db.attempt(
      'authenticated',
      asOwnerA,
      `update public.profiles set phone_e164 = '+255754999999' where id = $1 returning id`,
      [SEED.ownerA],
    );
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/immutable_column/);
  });

  it('still allows harmless self-edits', async () => {
    const res = await db.attempt(
      'authenticated',
      asOwnerA,
      `update public.profiles set name = 'Owner A' where id = $1 returning id`,
      [SEED.ownerA],
    );
    expect(res.ok).toBe(true);
    expect(res.rows).toHaveLength(1);
  });
});

describe('claim_staff_invite uses the verified auth phone (0031)', () => {
  const attacker = 'cccccccc-0000-4000-8000-000000000071';

  beforeAll(async () => {
    // Signs up with their real phone; the trigger copies it to the profile.
    await db.sql(`insert into auth.users (id, phone) values ($1, '255754100071')`, [attacker]);
    // Tenant B has an unlinked cleaner on the roster with a different phone.
    await db.sql(
      `insert into public.staff (tenant_id, display_name, phone_e164)
       values ($1, 'Pending Cleaner', '+255754100072')`,
      [SEED.tenantB],
    );
    // Even if the profile phone were tampered with (service role can), the claim
    // must follow auth.users, not the profile row.
    await db.sql(`update public.profiles set phone_e164 = '+255754100072' where id = $1`, [attacker]);
  });

  it('does not hand over a roster row for a tampered profile phone', async () => {
    const res = await db.attempt<{ id: string | null }>(
      'authenticated',
      { sub: attacker, tenant_id: null, tenant_role: null },
      `select public.claim_staff_invite() as id`,
    );
    expect(res.ok).toBe(true);
    expect(res.rows[0]?.id).toBeNull();
    const member = await db.sql(
      `select 1 from public.memberships where user_id = $1 and tenant_id = $2`,
      [attacker, SEED.tenantB],
    );
    expect(member).toHaveLength(0);
  });

  it('claims the roster row that matches the auth phone', async () => {
    await db.sql(
      `insert into public.staff (tenant_id, display_name, phone_e164)
       values ($1, 'Real Hire', '+255754100071')`,
      [SEED.tenantB],
    );
    const res = await db.attempt<{ id: string | null }>(
      'authenticated',
      { sub: attacker, tenant_id: null, tenant_role: null },
      `select public.claim_staff_invite() as id`,
    );
    expect(res.ok).toBe(true);
    expect(res.rows[0]?.id).not.toBeNull();
    const member = await db.sql<{ role: string }>(
      `select role from public.memberships where user_id = $1 and tenant_id = $2`,
      [attacker, SEED.tenantB],
    );
    expect(member).toEqual([{ role: 'CLEANER' }]);
  });
});

describe('default grants are revoked (0032)', () => {
  it('authenticated cannot TRUNCATE shared tables (RLS never covers TRUNCATE)', async () => {
    for (const table of ['notifications', 'support_requests', 'notification_templates']) {
      const res = await db.attempt('authenticated', asOwnerA, `truncate public.${table}`);
      expect(res.ok).toBe(false);
      expect(res.error).toMatch(/permission denied/);
    }
  });

  it('authenticated cannot DELETE support messages', async () => {
    const res = await db.attempt('authenticated', asOwnerA, `delete from public.support_messages`);
    expect(res.ok).toBe(false);
    expect(res.error).toMatch(/permission denied/);
  });
});

describe('authorship bindings (0032)', () => {
  let requestId: string;

  beforeAll(async () => {
    const rows = await db.sql<{ id: string }>(
      `insert into public.support_requests (tenant_id, subject, body, created_by)
       values ($1, 'Printer on fire', 'Please advise', $2) returning id`,
      [SEED.tenantA, SEED.ownerA],
    );
    requestId = rows[0]!.id;
  });

  it('a tenant owner cannot post as platform staff or as somebody else', async () => {
    const asStaff = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into public.support_messages (request_id, tenant_id, body, author_id, is_staff)
       values ($1, $2, 'hello', $3, true) returning id`,
      [requestId, SEED.tenantA, SEED.ownerA],
    );
    expect(asStaff.ok).toBe(false);

    const asOther = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into public.support_messages (request_id, tenant_id, body, author_id, is_staff)
       values ($1, $2, 'hello', $3, false) returning id`,
      [requestId, SEED.tenantA, SEED.ownerB],
    );
    expect(asOther.ok).toBe(false);

    const honest = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into public.support_messages (request_id, tenant_id, body, author_id, is_staff)
       values ($1, $2, 'hello', $3, false) returning id`,
      [requestId, SEED.tenantA, SEED.ownerA],
    );
    expect(honest.ok).toBe(true);
  });

  it('an impersonation session always records its real admin', async () => {
    const spoofed = await db.attempt(
      'authenticated',
      { sub: SEED.superAdmin, tenant_id: null, tenant_role: null, is_super_admin: true },
      `insert into public.impersonation_sessions (admin_user_id, target_tenant_id, target_role, reason)
       values ($1, $2, 'OWNER', 'support') returning id`,
      [SEED.ownerA, SEED.tenantA],
    );
    expect(spoofed.ok).toBe(false);

    const honest = await db.attempt(
      'authenticated',
      { sub: SEED.superAdmin, tenant_id: null, tenant_role: null, is_super_admin: true },
      `insert into public.impersonation_sessions (admin_user_id, target_tenant_id, target_role, reason)
       values ($1, $2, 'OWNER', 'support') returning id`,
      [SEED.superAdmin, SEED.tenantA],
    );
    expect(honest.ok).toBe(true);
  });
});

describe('the OWNER row is untouchable below OWNER (0032)', () => {
  const manager = 'cccccccc-0000-4000-8000-000000000072';

  beforeAll(async () => {
    await db.sql(`insert into auth.users (id, phone) values ($1, '255754100073')`, [manager]);
    await db.sql(
      `insert into public.memberships (tenant_id, user_id, role) values ($1, $2, 'MANAGER')`,
      [SEED.tenantA, manager],
    );
  });

  it('a MANAGER cannot demote the OWNER', async () => {
    const res = await db.attempt(
      'authenticated',
      { sub: manager, tenant_id: SEED.tenantA, tenant_role: 'MANAGER' },
      `update public.memberships set role = 'CLEANER'
       where tenant_id = $1 and user_id = $2 returning id`,
      [SEED.tenantA, SEED.ownerA],
    );
    expect(res.ok && res.rows.length === 0).toBe(true);
    const owner = await db.sql<{ role: string }>(
      `select role from public.memberships where tenant_id = $1 and user_id = $2`,
      [SEED.tenantA, SEED.ownerA],
    );
    expect(owner).toEqual([{ role: 'OWNER' }]);
  });

  it('invite_staff_by_phone cannot overwrite the OWNER role either', async () => {
    const ownerPhone = await db.sql<{ phone_e164: string }>(
      `select phone_e164 from public.profiles where id = $1`,
      [SEED.ownerA],
    );
    const res = await db.attempt(
      'authenticated',
      { sub: manager, tenant_id: SEED.tenantA, tenant_role: 'MANAGER' },
      `select public.invite_staff_by_phone($1, 'DISPATCHER')`,
      [ownerPhone[0]!.phone_e164],
    );
    expect(res.ok).toBe(true);
    const owner = await db.sql<{ role: string }>(
      `select role from public.memberships where tenant_id = $1 and user_id = $2`,
      [SEED.tenantA, SEED.ownerA],
    );
    expect(owner).toEqual([{ role: 'OWNER' }]);
  });
});

describe('job-evidence storage is tenant-scoped (0033)', () => {
  it('the bucket exists and is private', async () => {
    const rows = await db.sql<{ public: boolean }>(
      `select public from storage.buckets where id = 'job-evidence'`,
    );
    expect(rows).toEqual([{ public: false }]);
  });

  it('an office role writes only under its own tenant folder', async () => {
    const own = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into storage.objects (bucket_id, name) values ('job-evidence', $1) returning id`,
      [`${SEED.tenantA}/staff/booking/photo.jpg`],
    );
    expect(own.ok).toBe(true);

    const foreign = await db.attempt(
      'authenticated',
      asOwnerA,
      `insert into storage.objects (bucket_id, name) values ('job-evidence', $1) returning id`,
      [`${SEED.tenantB}/staff/booking/photo.jpg`],
    );
    expect(foreign.ok).toBe(false);
  });

  it('nobody deletes evidence from a client', async () => {
    const res = await db.attempt(
      'authenticated',
      asOwnerA,
      `delete from storage.objects where bucket_id = 'job-evidence' returning id`,
    );
    // Either the grant is missing entirely (permission denied) or no DELETE policy
    // matches (zero rows) — both mean evidence cannot be removed from a client.
    expect(res.ok ? res.rows.length : 0).toBe(0);
  });
});
