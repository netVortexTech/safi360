import { asOwnerA, SEED, TestDb } from './harness.ts';

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
});
afterAll(() => db.close());

// seed.sql books one ticket for Usafi Bora through create_booking_tx (UBC-2026-00001).
describe('app.next_ticket_ref', () => {
  it('allocates {PREFIX}-{YYYY}-{00001} sequentially per tenant', async () => {
    const seeded = await db.sql<{ ticket_ref: string }>(
      `select ticket_ref from public.bookings where id = 'bbbb0000-0000-4000-8000-000000000001'`,
    );
    expect(seeded[0]?.ticket_ref).toBe('UBC-2026-00001');
    const a1 = await db.sql<{ ref: string }>(
      `select app.next_ticket_ref($1, '2026-10-14T07:00:00Z') as ref`,
      [SEED.tenantA],
    );
    const a2 = await db.sql<{ ref: string }>(
      `select app.next_ticket_ref($1, '2026-10-14T07:00:00Z') as ref`,
      [SEED.tenantA],
    );
    const b1 = await db.sql<{ ref: string }>(
      `select app.next_ticket_ref($1, '2026-10-14T07:00:00Z') as ref`,
      [SEED.tenantB],
    );
    expect(a1[0]?.ref).toBe('UBC-2026-00002');
    expect(a2[0]?.ref).toBe('UBC-2026-00003');
    expect(b1[0]?.ref).toBe('PFC-2026-00001');
  });

  it('rolls over per year using Dar es Salaam time', async () => {
    // 22:30 UTC on 31 Dec 2026 is already 01:30 on 1 Jan 2027 in Dar.
    const r = await db.sql<{ ref: string }>(`select app.next_ticket_ref($1, '2026-12-31T22:30:00Z') as ref`, [
      SEED.tenantA,
    ]);
    expect(r[0]?.ref).toBe('UBC-2027-00001');
    const r2 = await db.sql<{ ref: string }>(
      `select app.next_ticket_ref($1, '2026-12-31T20:00:00Z') as ref`,
      [SEED.tenantA],
    );
    expect(r2[0]?.ref).toBe('UBC-2026-00004');
  });

  it('never reuses a number after a rolled-back allocation', async () => {
    await expect(
      db.pg.transaction(async (tx) => {
        await tx.query(`select app.next_ticket_ref($1, '2026-10-14T07:00:00Z')`, [SEED.tenantA]);
        throw new Error('simulated failure');
      }),
    ).rejects.toThrow('simulated failure');
    // The rolled-back allocation does not leave a gap — the counter was never committed.
    const r = await db.sql<{ ref: string }>(`select app.next_ticket_ref($1, '2026-10-14T07:00:00Z') as ref`, [
      SEED.tenantA,
    ]);
    expect(r[0]?.ref).toBe('UBC-2026-00005');
  });

  it('refuses unknown or deleted tenants', async () => {
    await expect(
      db.sql(`select app.next_ticket_ref('00000000-0000-4000-8000-000000000000')`),
    ).rejects.toThrow(/tenant_not_found/);
  });

  it('cannot be called by authenticated or anon clients', async () => {
    const asUser = await db.attempt('authenticated', asOwnerA, `select app.next_ticket_ref($1)`, [
      SEED.tenantA,
    ]);
    expect(asUser.ok).toBe(false);
    expect(asUser.error).toMatch(/permission denied/i);
    const asAnon = await db.attempt('anon', {}, `select app.next_ticket_ref($1)`, [SEED.tenantA]);
    expect(asAnon.ok).toBe(false);
  });

  it('is callable by the service role', async () => {
    const r = await db.attempt<{ ref: string }>(
      'service_role',
      { role: 'service_role' },
      `select app.next_ticket_ref($1) as ref`,
      [SEED.tenantA],
    );
    expect(r.ok, r.error).toBe(true);
    expect(r.rows[0]?.ref).toMatch(/^UBC-\d{4}-\d{5}$/);
  });
});

describe('app.write_audit', () => {
  it('records the actor from JWT claims', async () => {
    const r = await db.attempt<{ id: string }>(
      'service_role',
      { role: 'service_role', sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'OWNER' },
      `select app.write_audit($1, 'tenant.branding_updated', 'tenant', $1, '{"color":"#13293D"}') as id`,
      [SEED.tenantA],
    );
    expect(r.ok, r.error).toBe(true);
    const [row] = await db.sql<{ actor_user_id: string; actor_role: string; action: string }>(
      'select actor_user_id, actor_role, action from public.audit_logs where id = $1',
      [r.rows[0]?.id],
    );
    expect(row).toMatchObject({
      actor_user_id: SEED.ownerA,
      actor_role: 'service_role',
      action: 'tenant.branding_updated',
    });
  });

  it('is not callable by clients', async () => {
    const r = await db.attempt('authenticated', asOwnerA, `select app.write_audit($1, 'x')`, [SEED.tenantA]);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/permission denied/i);
  });
});

describe('public.app_rate_limit_hit', () => {
  it('allows up to the limit in a window and refuses the next call', async () => {
    const results: boolean[] = [];
    for (let i = 0; i < 4; i++) {
      const r = await db.sql<{ ok: boolean }>(
        `select public.app_rate_limit_hit($1, 'test', 'ip:1.1.1.1', 3, 600) as ok`,
        [SEED.tenantA],
      );
      results.push(r[0]?.ok ?? false);
    }
    expect(results).toEqual([true, true, true, false]);
  });

  it('is scoped per caller and per tenant', async () => {
    const other = await db.sql<{ ok: boolean }>(
      `select public.app_rate_limit_hit($1, 'test', 'ip:2.2.2.2', 3, 600) as ok`,
      [SEED.tenantA],
    );
    expect(other[0]?.ok).toBe(true);
    const otherTenant = await db.sql<{ ok: boolean }>(
      `select public.app_rate_limit_hit($1, 'test', 'ip:1.1.1.1', 3, 600) as ok`,
      [SEED.tenantB],
    );
    expect(otherTenant[0]?.ok).toBe(true);
  });

  it('is not callable by clients', async () => {
    const r = await db.attempt(
      'anon',
      {},
      `select public.app_rate_limit_hit($1, 'test', 'ip:3.3.3.3', 3, 600)`,
      [SEED.tenantA],
    );
    expect(r.ok).toBe(false);
  });
});
