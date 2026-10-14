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

// ---- booking write path -------------------------------------------------------------

export interface BookingSpec {
  tenant?: string;
  bookingId?: string;
  idempotencyKey?: string;
  phone?: string;
  name?: string;
  email?: string;
  /** ISO instants; omit both for a review-only request without a slot. */
  start?: string | null;
  end?: string | null;
  /** Free qualified staff the Edge Function computed for the slot. */
  capacity?: number;
  crew?: number;
  durationMin?: number;
  totalTzs?: number;
  depositTzs?: number;
  requiresReview?: boolean;
  paymentMode?: 'DEPOSIT' | 'ON_COMPLETION';
  source?: string;
  serviceId?: string;
  createdBy?: string | null;
  address?: Record<string, unknown> | null;
  notes?: string;
}

export interface BookingResult {
  booking_id: string;
  ticket_ref: string;
  status: string;
  created: boolean;
  hold_expires_at: string | null;
  customer_id?: string;
  quote_id?: string;
}

let bookingSeq = 0;

/** The jsonb payload create_booking_tx expects, with sensible test defaults. */
export function bookingPayload(spec: BookingSpec = {}): Record<string, unknown> {
  bookingSeq += 1;
  const start = spec.start === undefined ? '2026-10-20T06:00:00Z' : spec.start;
  const end = spec.end === undefined ? (start ? '2026-10-20T08:00:00Z' : null) : spec.end;
  const total = spec.totalTzs ?? 45000;
  const deposit = spec.depositTzs ?? Math.round(total * 0.3);
  const serviceId = spec.serviceId ?? '55550000-0000-4000-8000-000000000001';
  return {
    tenant_id: spec.tenant ?? SEED.tenantA,
    ...(spec.bookingId ? { booking_id: spec.bookingId } : {}),
    idempotency_key:
      spec.idempotencyKey ??
      `booking_${String(bookingSeq).padStart(8, '0')}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0')}`,
    source: spec.source ?? 'website',
    locale: 'sw',
    created_by: spec.createdBy ?? null,
    customer: {
      phone_e164: spec.phone ?? '+255715880342',
      name: spec.name ?? 'Daudi Lyimo',
      email: spec.email ?? null,
      phone_verified: true,
    },
    address:
      spec.address === undefined
        ? {
            area: 'Mbezi Beach',
            street: 'Sinza Road',
            landmark: 'near Sinza Mori bus stop',
            zone_id: '77770000-0000-4000-8000-000000000001',
          }
        : spec.address,
    quote: {
      currency: 'TZS',
      subtotal_tzs: total,
      travel_fee_tzs: 0,
      discount_tzs: 0,
      tax_tzs: 0,
      total_tzs: total,
      deposit_tzs: deposit,
      balance_tzs: total - deposit,
      requires_review: spec.requiresReview ?? false,
      has_estimate: false,
      est_duration_min: spec.durationMin ?? 120,
      crew_size: spec.crew ?? 1,
      zone:
        spec.tenant === SEED.tenantB
          ? null
          : {
              zone_id: '77770000-0000-4000-8000-000000000001',
              name: 'Mbezi & Kimara',
              travel_fee_tzs: 0,
              serviceable: true,
              matched_by: 'area',
            },
      out_of_area: false,
      lines: [],
    },
    items: [
      {
        service_id: serviceId,
        label_sw: 'Usafi wa sofa',
        label_en: 'Sofa cleaning',
        input: { service_id: serviceId, qty: 3 },
        qty: 3,
        amount_tzs: spec.requiresReview ? null : total,
        requires_review: spec.requiresReview ?? false,
      },
    ],
    schedule: start ? { start, end, capacity: spec.capacity ?? 3 } : null,
    payment_mode: spec.paymentMode ?? 'ON_COMPLETION',
    notes_customer: spec.notes ?? null,
  };
}

/** Run create_booking_tx as the service role (the way the Edge Function calls it). */
export async function createBooking(
  db: TestDb,
  spec: BookingSpec = {},
): Promise<Attempt<{ out: BookingResult }>> {
  return db.attempt<{ out: BookingResult }>(
    'service_role',
    { role: 'service_role' },
    'select public.create_booking_tx($1::jsonb) as out',
    [JSON.stringify(bookingPayload(spec))],
  );
}

/** Like createBooking but throws on failure and returns the result body. */
export async function mustCreateBooking(db: TestDb, spec: BookingSpec = {}): Promise<BookingResult> {
  const r = await createBooking(db, spec);
  if (!r.ok || !r.rows[0]) throw new Error(`create_booking_tx failed: ${r.error}`);
  return r.rows[0].out;
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
