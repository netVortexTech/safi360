// transition_booking(), the allowed-transition table, hold expiry, payments and the
// privilege rules that make the function the only way a booking changes state.
import { ALLOWED_TRANSITIONS, TRANSITION_ACTORS, type BookingStatus } from '../functions/_shared/enums.ts';
import {
  asOwnerA,
  asOwnerB,
  createBooking,
  mustCreateBooking,
  SEED,
  TestDb,
  type Claims,
} from './harness.ts';

const NEEMA = '88880000-0000-4000-8000-000000000001';
const CLEANER_USER = 'cccccccc-0000-4000-8000-000000000011';
const DISPATCHER_USER = 'cccccccc-0000-4000-8000-000000000012';
const dispatcher: Claims = { sub: DISPATCHER_USER, tenant_id: SEED.tenantA, tenant_role: 'DISPATCHER' };
const cleaner: Claims = { sub: CLEANER_USER, tenant_id: SEED.tenantA, tenant_role: 'CLEANER' };
const service: Claims = { role: 'service_role' };

let db: TestDb;
beforeAll(async () => {
  db = await TestDb.create({ seed: true });
  await db.sql(`insert into auth.users (id, phone) values ($1, '255754100001'), ($2, '255754100019')`, [
    CLEANER_USER,
    DISPATCHER_USER,
  ]);
  await db.sql(
    `insert into public.memberships (tenant_id, user_id, role) values ($1, $2, 'CLEANER'), ($1, $3, 'DISPATCHER')`,
    [SEED.tenantA, CLEANER_USER, DISPATCHER_USER],
  );
  await db.sql(`update public.staff set user_id = $1 where id = $2`, [CLEANER_USER, NEEMA]);
});
afterAll(() => db.close());

let phoneSeq = 100;
function booking(spec: Parameters<typeof mustCreateBooking>[1] = {}) {
  phoneSeq += 1;
  const day = 10 + (phoneSeq % 15);
  return mustCreateBooking(db, {
    phone: `+2557160${String(phoneSeq).padStart(5, '0')}`,
    start: `2026-11-${String(day).padStart(2, '0')}T06:00:00Z`,
    end: `2026-11-${String(day).padStart(2, '0')}T08:00:00Z`,
    capacity: 10,
    ...spec,
  });
}

function transition(
  role: 'authenticated' | 'service_role',
  claims: Claims,
  id: string,
  to: string,
  reason: string | null = null,
  meta: unknown = {},
) {
  return db.attempt<{ out: { status: string; changed: boolean; flags: string[] } }>(
    role,
    claims,
    `select public.transition_booking($1, $2::public.booking_status, $3, $4::jsonb) as out`,
    [id, to, reason, JSON.stringify(meta)],
  );
}

async function status(id: string): Promise<string> {
  const [r] = await db.sql<{ status: string }>(`select status::text from public.bookings where id = $1`, [
    id,
  ]);
  return r?.status ?? 'missing';
}

describe('app.booking_transitions mirrors _shared/enums.ts', () => {
  it('has exactly the allowed pairs with the same actors', async () => {
    const rows = await db.sql<{ from_status: string; to_status: string; roles: string[] }>(
      `select from_status::text, to_status::text, roles from app.booking_transitions order by 1, 2`,
    );
    const expectedPairs = Object.entries(ALLOWED_TRANSITIONS)
      .flatMap(([from, tos]) => tos.map((to) => `${from}->${to}`))
      .sort();
    expect(rows.map((r) => `${r.from_status}->${r.to_status}`).sort()).toEqual(expectedPairs);
    for (const r of rows) {
      const key = `${r.from_status as BookingStatus}->${r.to_status as BookingStatus}` as const;
      expect([...r.roles].sort(), key).toEqual([...(TRANSITION_ACTORS[key] ?? [])].sort());
    }
  });
});

describe('transition_booking — who may do what', () => {
  it('an owner moves a confirmed booking to assigned; the event names them', async () => {
    const b = await booking();
    const r = await transition('authenticated', asOwnerA, b.booking_id, 'ASSIGNED');
    expect(r.ok, r.error).toBe(true);
    expect(r.rows[0]?.out).toMatchObject({ status: 'ASSIGNED', changed: true });
    const [ev] = await db.sql<{ actor_kind: string; actor_user_id: string; actor_label: string }>(
      `select actor_kind, actor_user_id, actor_label from public.job_events where booking_id = $1 and to_status = 'ASSIGNED'`,
      [b.booking_id],
    );
    expect(ev).toEqual({
      actor_kind: 'staff',
      actor_user_id: SEED.ownerA,
      actor_label: `user:${SEED.ownerA}`,
    });
    const [audit] = await db.sql<{ actor_role: string; actor_user_id: string }>(
      `select actor_role, actor_user_id from public.audit_logs where entity_id = $1 order by id desc limit 1`,
      [b.booking_id],
    );
    // is_service_role() is false inside the definer function for a signed-in user.
    expect(audit).toEqual({ actor_role: `user:${SEED.ownerA}`, actor_user_id: SEED.ownerA });
  });

  it('a dispatcher may assign; a cleaner may not', async () => {
    const b = await booking();
    const d = await transition('authenticated', dispatcher, b.booking_id, 'ASSIGNED');
    expect(d.ok, d.error).toBe(true);
    const b2 = await booking();
    const c = await transition('authenticated', cleaner, b2.booking_id, 'ASSIGNED');
    expect(c.ok).toBe(false);
    expect(c.error).toMatch(/transition_forbidden/);
  });

  it('a cleaner moves only bookings they are assigned to', async () => {
    const b = await booking();
    await transition('authenticated', dispatcher, b.booking_id, 'ASSIGNED');
    const notMine = await transition('authenticated', cleaner, b.booking_id, 'EN_ROUTE');
    expect(notMine.ok).toBe(false);
    expect(notMine.error).toMatch(/transition_forbidden/);
    await db.sql(
      `insert into public.assignments (tenant_id, booking_id, staff_id, starts_at, ends_at) select tenant_id, id, $2, scheduled_start, scheduled_end from public.bookings where id = $1`,
      [b.booking_id, NEEMA],
    );
    const mine = await transition('authenticated', cleaner, b.booking_id, 'EN_ROUTE');
    expect(mine.ok, mine.error).toBe(true);
    expect(await status(b.booking_id)).toBe('EN_ROUTE');
  });

  it('a customer (service role acting for a verified phone) may cancel but not assign', async () => {
    const b = await booking();
    const assign = await transition('service_role', service, b.booking_id, 'ASSIGNED', null, {
      actor: 'customer:+255716000001',
    });
    expect(assign.ok).toBe(false);
    const cancel = await transition(
      'service_role',
      service,
      b.booking_id,
      'CANCELLED',
      'customer_cancelled',
      { actor: 'customer:+255716000001' },
    );
    expect(cancel.ok, cancel.error).toBe(true);
    const [audit] = await db.sql<{ actor_role: string }>(
      `select actor_role from public.audit_logs where entity_id = $1 order by id desc limit 1`,
      [b.booking_id],
    );
    expect(audit?.actor_role).toBe('customer:+255716000001');
  });

  it('refuses transitions outside the table and terminal outcomes without a reason', async () => {
    const b = await booking();
    const skip = await transition('authenticated', asOwnerA, b.booking_id, 'COMPLETED');
    expect(skip.ok).toBe(false);
    expect(skip.error).toMatch(/transition_not_allowed/);
    const noReason = await transition('authenticated', asOwnerA, b.booking_id, 'CANCELLED');
    expect(noReason.ok).toBe(false);
    expect(noReason.error).toMatch(/reason_required/);
    const ok = await transition('authenticated', asOwnerA, b.booking_id, 'CANCELLED', 'Customer travelling');
    expect(ok.ok, ok.error).toBe(true);
    const [row] = await db.sql<{ outcome_reason: string; cancelled_at: string }>(
      `select outcome_reason, cancelled_at from public.bookings where id = $1`,
      [b.booking_id],
    );
    expect(row?.outcome_reason).toBe('Customer travelling');
    expect(row?.cancelled_at).not.toBeNull();
  });

  it('is a no-op for a replayed transition to the current status', async () => {
    const b = await booking();
    const r = await transition('service_role', service, b.booking_id, 'CONFIRMED');
    expect(r.ok, r.error).toBe(true);
    expect(r.rows[0]?.out.changed).toBe(false);
  });

  it('another tenant sees the booking as not found', async () => {
    const b = await booking();
    const r = await transition('authenticated', asOwnerB, b.booking_id, 'ASSIGNED');
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/booking_not_found/);
  });

  it('cancelling releases live assignments', async () => {
    const b = await booking();
    await transition('authenticated', dispatcher, b.booking_id, 'ASSIGNED');
    await db.sql(
      `insert into public.assignments (tenant_id, booking_id, staff_id, starts_at, ends_at) select tenant_id, id, $2, scheduled_start, scheduled_end from public.bookings where id = $1`,
      [b.booking_id, NEEMA],
    );
    await transition('authenticated', asOwnerA, b.booking_id, 'CANCELLED', 'No longer needed');
    const [a] = await db.sql<{ cancelled_at: string | null }>(
      `select cancelled_at from public.assignments where booking_id = $1`,
      [b.booking_id],
    );
    expect(a?.cancelled_at).not.toBeNull();
  });
});

describe('bookings.status is unreachable without the function', () => {
  it('authenticated users cannot update status, schedule or totals', async () => {
    const b = await booking();
    for (const col of [
      "status = 'CANCELLED'",
      'scheduled_start = now()',
      'total_tzs = 1',
      "ticket_ref = 'UBC-2026-99999'",
    ]) {
      const r = await db.attempt(
        'authenticated',
        asOwnerA,
        `update public.bookings set ${col} where id = $1`,
        [b.booking_id],
      );
      expect(r.ok, col).toBe(false);
      expect(r.error, col).toMatch(/permission denied/i);
    }
    const notes = await db.attempt(
      'authenticated',
      asOwnerA,
      `update public.bookings set notes_internal = 'Call first' where id = $1 returning id`,
      [b.booking_id],
    );
    expect(notes.ok, notes.error).toBe(true);
    expect(notes.rows).toHaveLength(1);
  });

  it('the service role cannot insert bookings or update their status either', async () => {
    const b = await booking();
    const upd = await db.attempt(
      'service_role',
      service,
      `update public.bookings set status = 'CANCELLED' where id = $1`,
      [b.booking_id],
    );
    expect(upd.ok).toBe(false);
    expect(upd.error).toMatch(/permission denied/i);
    const ins = await db.attempt(
      'service_role',
      service,
      `insert into public.bookings (tenant_id, ticket_ref, customer_id, duration_min) select tenant_id, 'UBC-2026-99998', customer_id, 60 from public.bookings where id = $1`,
      [b.booking_id],
    );
    expect(ins.ok).toBe(false);
    expect(ins.error).toMatch(/permission denied/i);
    const ev = await db.attempt(
      'service_role',
      service,
      `insert into public.job_events (tenant_id, booking_id, kind, actor_kind) values ($1, $2, 'note', 'system')`,
      [SEED.tenantA, b.booking_id],
    );
    expect(ev.ok).toBe(false);
  });

  it('every booking starts as REQUEST_RECEIVED', async () => {
    const r = await db.sql(`select 1 from public.bookings where status = 'REQUEST_RECEIVED'`);
    expect(r).toEqual([]);
    await expect(
      db.sql(
        `insert into public.bookings (tenant_id, ticket_ref, customer_id, duration_min, status)
         select tenant_id, 'UBC-2026-99997', customer_id, 60, 'CONFIRMED' from public.bookings limit 1`,
      ),
    ).rejects.toThrow(/bookings_must_start_as_request_received/);
  });
});

describe('holds and expiry', () => {
  it('expire_booking_holds turns lapsed payment holds and unanswered quotes into EXPIRED', async () => {
    const paid = await booking({ paymentMode: 'DEPOSIT' });
    const review = await booking({ requiresReview: true });
    await transition('authenticated', asOwnerA, review.booking_id, 'AWAITING_CUSTOMER_APPROVAL');
    const stillReview = await booking({ requiresReview: true });
    const fresh = await booking({ paymentMode: 'DEPOSIT' });
    await db.sql(
      `update public.bookings set hold_expires_at = now() - interval '1 minute' where id = any($1::uuid[])`,
      [[paid.booking_id, review.booking_id, stillReview.booking_id]],
    );
    const r = await db.attempt<{ n: number }>(
      'service_role',
      service,
      `select public.expire_booking_holds(100) as n`,
    );
    expect(r.ok, r.error).toBe(true);
    expect(r.rows[0]?.n).toBe(2);
    expect(await status(paid.booking_id)).toBe('EXPIRED');
    expect(await status(review.booking_id)).toBe('EXPIRED');
    expect(await status(stillReview.booking_id)).toBe('AWAITING_REVIEW');
    expect(await status(fresh.booking_id)).toBe('AWAITING_PAYMENT');
    const [q] = await db.sql<{ status: string }>(`select status from public.quotes where id = $1`, [
      review.quote_id,
    ]);
    expect(q?.status).toBe('EXPIRED');
    const denied = await db.attempt('authenticated', asOwnerA, `select public.expire_booking_holds(10)`);
    expect(denied.ok).toBe(false);
  });

  it('a payment that lands after the hold lapsed confirms with NEEDS_REVIEW when the slot is gone', async () => {
    const day = '2026-12-01';
    const held = await mustCreateBooking(db, {
      phone: '+255716100001',
      paymentMode: 'DEPOSIT',
      start: `${day}T06:00:00Z`,
      end: `${day}T08:00:00Z`,
      capacity: 1,
    });
    await db.sql(`update public.bookings set hold_expires_at = now() - interval '1 minute' where id = $1`, [
      held.booking_id,
    ]);
    const taker = await mustCreateBooking(db, {
      phone: '+255716100002',
      start: `${day}T06:00:00Z`,
      end: `${day}T08:00:00Z`,
      capacity: 1,
    });
    expect(taker.status).toBe('CONFIRMED');
    const late = await transition('service_role', service, held.booking_id, 'CONFIRMED', null, {
      actor: 'system:payment',
      capacity: 1,
    });
    expect(late.ok, late.error).toBe(true);
    expect(late.rows[0]?.out.flags).toContain('NEEDS_REVIEW');
    const ex = await db.sql<{ kind: string }>(`select kind from public.exceptions where booking_id = $1`, [
      held.booking_id,
    ]);
    expect(ex).toEqual([{ kind: 'SLOT_CONFLICT' }]);
  });
});

describe('apply_payment_result', () => {
  async function pendingPayment(bookingId: string, amount: number): Promise<string> {
    const r = await db.attempt<{ id: string }>(
      'service_role',
      service,
      `insert into public.payments (tenant_id, booking_id, kind, provider, amount_tzs, idempotency_key)
       values ($1, $2, 'DEPOSIT', 'MOCK', $3, $4) returning id`,
      [SEED.tenantA, bookingId, amount, `payment_${crypto.randomUUID()}`],
    );
    if (!r.ok || !r.rows[0]) throw new Error(r.error);
    return r.rows[0].id;
  }

  it('SUCCESS confirms an awaiting-payment booking exactly once', async () => {
    const b = await booking({ paymentMode: 'DEPOSIT' });
    const pay = await pendingPayment(b.booking_id, 13500);
    const r = await db.attempt<{ out: { changed: boolean } }>(
      'service_role',
      service,
      `select public.apply_payment_result($1, 'SUCCESS', 'mock-1', '{"ref":"mock-1"}') as out`,
      [pay],
    );
    expect(r.ok, r.error).toBe(true);
    expect(await status(b.booking_id)).toBe('CONFIRMED');
    const [row] = await db.sql<{ paid_tzs: number }>(`select paid_tzs from public.bookings where id = $1`, [
      b.booking_id,
    ]);
    expect(row?.paid_tzs).toBe(13500);
    const replay = await db.attempt<{ out: { changed: boolean } }>(
      'service_role',
      service,
      `select public.apply_payment_result($1, 'SUCCESS', 'mock-1', '{}') as out`,
      [pay],
    );
    expect(replay.rows[0]?.out.changed).toBe(false);
    const [again] = await db.sql<{ paid_tzs: number }>(`select paid_tzs from public.bookings where id = $1`, [
      b.booking_id,
    ]);
    expect(again?.paid_tzs).toBe(13500);
    const lateFail = await db.attempt<{ out: { changed: boolean } }>(
      'service_role',
      service,
      `select public.apply_payment_result($1, 'FAILED') as out`,
      [pay],
    );
    expect(lateFail.rows[0]?.out.changed).toBe(false);
  });

  it('UNKNOWN opens an exception and never confirms', async () => {
    const b = await booking({ paymentMode: 'DEPOSIT' });
    const pay = await pendingPayment(b.booking_id, 13500);
    await db.attempt('service_role', service, `select public.apply_payment_result($1, 'UNKNOWN')`, [pay]);
    expect(await status(b.booking_id)).toBe('AWAITING_PAYMENT');
    const ex = await db.sql<{ kind: string }>(`select kind from public.exceptions where booking_id = $1`, [
      b.booking_id,
    ]);
    expect(ex).toEqual([{ kind: 'PAYMENT_UNKNOWN' }]);
  });

  it('nobody updates payments.status directly and clients cannot call the function', async () => {
    const b = await booking({ paymentMode: 'DEPOSIT' });
    const pay = await pendingPayment(b.booking_id, 13500);
    const svc = await db.attempt(
      'service_role',
      service,
      `update public.payments set status = 'SUCCESS' where id = $1`,
      [pay],
    );
    expect(svc.ok).toBe(false);
    const user = await db.attempt(
      'authenticated',
      asOwnerA,
      `select public.apply_payment_result($1, 'SUCCESS')`,
      [pay],
    );
    expect(user.ok).toBe(false);
    expect(user.error).toMatch(/permission denied/i);
  });
});

describe('add_job_event and open_exception', () => {
  it('office roles add internal notes; unassigned cleaners cannot', async () => {
    const b = await booking();
    const note = await db.attempt<{ id: string }>(
      'authenticated',
      dispatcher,
      `select public.add_job_event($1, 'note', false, null, '{"text":"Call before arrival"}') as id`,
      [b.booking_id],
    );
    expect(note.ok, note.error).toBe(true);
    const c = await db.attempt('authenticated', cleaner, `select public.add_job_event($1, 'note')`, [
      b.booking_id,
    ]);
    expect(c.ok).toBe(false);
    const other = await db.attempt('authenticated', asOwnerB, `select public.add_job_event($1, 'note')`, [
      b.booking_id,
    ]);
    expect(other.ok).toBe(false);
    expect(other.error).toMatch(/booking_not_found/);
    const bad = await db.attempt(
      'authenticated',
      asOwnerA,
      `select public.add_job_event($1, 'status_changed')`,
      [b.booking_id],
    );
    expect(bad.ok).toBe(false);
  });

  it('open_exception is idempotent per (booking, kind) while open', async () => {
    const b = await booking();
    const first = await db.attempt<{ id: string }>(
      'service_role',
      service,
      `select public.open_exception($1, 'RESCHEDULE_REQUESTED', '{"preferred":"2026-11-20"}', 'normal', '{"actor":"customer:+255716000009"}') as id`,
      [b.booking_id],
    );
    const second = await db.attempt<{ id: string }>(
      'service_role',
      service,
      `select public.open_exception($1, 'RESCHEDULE_REQUESTED', '{"note":"morning"}') as id`,
      [b.booking_id],
    );
    expect(first.ok, first.error).toBe(true);
    expect(second.rows[0]?.id).toBe(first.rows[0]?.id);
    const rows = await db.sql<{ details: Record<string, unknown> }>(
      `select details from public.exceptions where booking_id = $1`,
      [b.booking_id],
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.details).toEqual({ preferred: '2026-11-20', note: 'morning' });
  });

  it('reschedule_booking moves the slot under the capacity check and syncs assignments', async () => {
    const b = await booking();
    await transition('authenticated', dispatcher, b.booking_id, 'ASSIGNED');
    await db.sql(
      `insert into public.assignments (tenant_id, booking_id, staff_id, starts_at, ends_at) select tenant_id, id, $2, scheduled_start, scheduled_end from public.bookings where id = $1`,
      [b.booking_id, NEEMA],
    );
    const r = await db.attempt(
      'authenticated',
      dispatcher,
      `select public.reschedule_booking($1, '2026-12-10T07:00:00Z', '2026-12-10T09:00:00Z', 5, 'Customer asked')`,
      [b.booking_id],
    );
    expect(r.ok, r.error).toBe(true);
    const [row] = await db.sql<{ scheduled_start: string; flags: string[] }>(
      `select scheduled_start, flags from public.bookings where id = $1`,
      [b.booking_id],
    );
    expect(new Date(row?.scheduled_start ?? 0).toISOString()).toBe('2026-12-10T07:00:00.000Z');
    expect(row?.flags).toContain('RESCHEDULED');
    const [a] = await db.sql<{ starts_at: string }>(
      `select starts_at from public.assignments where booking_id = $1`,
      [b.booking_id],
    );
    expect(new Date(a?.starts_at ?? 0).toISOString()).toBe('2026-12-10T07:00:00.000Z');
    const full = await db.attempt(
      'authenticated',
      dispatcher,
      `select public.reschedule_booking($1, '2026-12-10T07:00:00Z', '2026-12-10T09:00:00Z', 0)`,
      [b.booking_id],
    );
    expect(full.ok).toBe(false);
    expect(full.error).toMatch(/slot_unavailable/);
    const c = await db.attempt(
      'authenticated',
      cleaner,
      `select public.reschedule_booking($1, '2026-12-11T07:00:00Z', '2026-12-11T09:00:00Z', 5)`,
      [b.booking_id],
    );
    expect(c.ok).toBe(false);
  });

  it('a slot_unavailable failure inside create_booking_tx is a clean 409-style error', async () => {
    const r = await createBooking(db, {
      phone: '+255716200001',
      start: '2026-12-12T06:00:00Z',
      end: '2026-12-12T08:00:00Z',
      capacity: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/slot_unavailable/);
  });
});
