// 0036 · guard_tenant_columns after the control center and self-serve signup both replaced
// it. The control-write bypass and the churn / account-manager columns must survive.
import { asOwnerA, SEED, TestDb } from './harness.ts';

let db: TestDb;

beforeAll(async () => {
  db = await TestDb.create({ seed: true });
});
afterAll(() => db.close());

describe('guard_tenant_columns', () => {
  it.each([
    ['churn_reason', `churn_reason = 'other'`],
    ['churned_at', 'churned_at = now()'],
    ['account_manager_id', `account_manager_id = '${SEED.ownerA}'`],
  ])('an OWNER cannot change %s', async (_col, set) => {
    const r = await db.attempt(
      'authenticated',
      asOwnerA,
      `update public.tenants set ${set} where id = $1 returning id`,
      [SEED.tenantA],
    );
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/immutable_column/);
  });

  it('a control_* write may change status and the trial', async () => {
    const outcome = await db
      .as('authenticated', asOwnerA, async (tx) => {
        await tx.query(`select set_config('app.control_write', 'on', true)`);
        await tx.query(
          `update public.tenants set status = 'SUSPENDED', trial_ends_at = now() where id = $1`,
          [SEED.tenantA],
        );
        return 'updated';
      })
      .catch((err: Error) => err.message);
    expect(outcome).toBe('updated');
  });

  it('select_plan still changes plan_id and nothing else', async () => {
    const outcome = await db
      .as('authenticated', asOwnerA, async (tx) => {
        await tx.query(`select set_config('app.platform_tenant_write', 'plan_id', true)`);
        await tx.query(`update public.tenants set churn_reason = 'other' where id = $1`, [SEED.tenantA]);
        return 'updated';
      })
      .catch((err: Error) => err.message);
    expect(outcome).toMatch(/immutable_column/);
  });
});
