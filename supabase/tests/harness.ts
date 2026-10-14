import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite, type Transaction } from '@electric-sql/pglite';

const ROOT = join(import.meta.dirname, '..');
const MIGRATIONS_DIR = join(ROOT, 'migrations');

export type DbRole = 'anon' | 'authenticated' | 'service_role' | 'supabase_auth_admin';

export interface Claims {
  sub?: string;
  role?: DbRole;
  tenant_id?: string | null;
  tenant_role?: 'OWNER' | 'MANAGER' | 'DISPATCHER' | 'CLEANER' | null;
  is_super_admin?: boolean;
}

export interface Attempt<T = unknown> {
  ok: boolean;
  rows: T[];
  error?: string;
}

/** A fresh in-memory Postgres with the Supabase shims, all migrations and (optionally) the seed applied. */
export class TestDb {
  private constructor(readonly pg: PGlite) {}

  static async create(opts: { seed?: boolean } = {}): Promise<TestDb> {
    const pg = new PGlite();
    await pg.exec(readFileSync(join(import.meta.dirname, '_bootstrap_pglite.sql'), 'utf8'));
    for (const file of migrationFiles()) {
      try {
        await pg.exec(readFileSync(join(MIGRATIONS_DIR, file), 'utf8'));
      } catch (err) {
        throw new Error(`migration ${file} failed: ${(err as Error).message}`);
      }
    }
    if (opts.seed ?? true) {
      await pg.exec(readFileSync(join(ROOT, 'seed.sql'), 'utf8'));
    }
    return new TestDb(pg);
  }

  async close(): Promise<void> {
    await this.pg.close();
  }

  /** Run `fn` as the given API role with JWT claims, exactly as PostgREST would. */
  async as<T>(role: DbRole, claims: Claims, fn: (tx: Transaction) => Promise<T>): Promise<T> {
    return this.pg.transaction(async (tx) => {
      await tx.exec(`set local role ${role}`);
      const full = { role, ...claims };
      await tx.query('select set_config($1, $2, true)', ['request.jwt.claims', JSON.stringify(full)]);
      return fn(tx);
    });
  }

  /** Like `as`, but returns success/failure instead of throwing (a failed statement aborts the tx). */
  async attempt<T = Record<string, unknown>>(
    role: DbRole,
    claims: Claims,
    sql: string,
    params: unknown[] = [],
  ): Promise<Attempt<T>> {
    try {
      const rows = await this.as(role, claims, async (tx) => (await tx.query<T>(sql, params)).rows);
      return { ok: true, rows };
    } catch (err) {
      return { ok: false, rows: [], error: (err as Error).message };
    }
  }

  /** Superuser query (test setup / assertions only). */
  async sql<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.pg.query<T>(sql, params)).rows;
  }
}

export function migrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();
}

// Seeded identities (see supabase/seed.sql)
export const SEED = {
  tenantA: '11111111-1111-4111-8111-111111111111', // Usafi Bora Cleaners (UBC)
  tenantB: '22222222-2222-4222-8222-222222222222', // Pwani Fresh Cleaning (PFC)
  ownerA: 'aaaaaaaa-0000-4000-8000-000000000001',
  ownerB: 'aaaaaaaa-0000-4000-8000-000000000002',
  superAdmin: 'aaaaaaaa-0000-4000-8000-000000000003',
} as const;

export const asOwnerA: Claims = { sub: SEED.ownerA, tenant_id: SEED.tenantA, tenant_role: 'OWNER' };
export const asOwnerB: Claims = { sub: SEED.ownerB, tenant_id: SEED.tenantB, tenant_role: 'OWNER' };
export const asSuperAdmin: Claims = {
  sub: SEED.superAdmin,
  tenant_id: null,
  tenant_role: null,
  is_super_admin: true,
};
