// In-memory PublicDeps / BookingDeps for handler tests: a mutable catalog so "edit a
// service, quote again" can be exercised, and a small booking store that mirrors the
// rules of create_booking_tx / transition_booking closely enough to test the handlers.
import type { AvailabilityRule, BusyInterval, ReservedCrew, StaffMember } from '../availability/slots.ts';
import { ALLOWED_TRANSITIONS, transitionActors, type BookingStatus, type PaymentStatus } from '../enums.ts';
import type { OtpPurpose } from '../otp.ts';
import { MockPaymentProvider, type PaymentProvider } from '../payments/provider.ts';
import {
  FIXTURE_ADDONS,
  FIXTURE_BASE,
  FIXTURE_SERVICES,
  FIXTURE_TENANT_ID,
  FIXTURE_ZONES,
} from '../pricing/fixtures.ts';
import type { Catalog } from '../pricing/quote.ts';
import { MockSmsProvider } from '../sms/provider.ts';
import type {
  BookingDeps,
  BookingDetail,
  BookingItemRow,
  BookingRow,
  CreateBookingResult,
  CustomerOtpRow,
  JobEventRow,
  PaymentRow,
  PublicDeps,
  PublicTenantInfo,
  StaffData,
  TransitionMeta,
} from './types.ts';

export interface FakeWorld {
  tenants: PublicTenantInfo[];
  catalog: Catalog;
  staff: StaffData;
  now: Date;
  /** Calls per tenant+action, so tests can assert the limiter was consulted. */
  rateLimitCalls: string[];
  rateLimited: boolean;
}

export const FAKE_TOKEN_SECRET = 'test-secret-do-not-use';
export const FAKE_PAYMENT_SECRET = 'mock-payment-secret';

export function fakeWorld(over: Partial<FakeWorld> = {}): FakeWorld {
  return {
    tenants: [
      {
        id: FIXTURE_TENANT_ID,
        slug: 'usafi-bora',
        name: 'Usafi Bora Cleaners',
        status: 'ACTIVE',
        settings: {
          deposit_pct: 30,
          travel_buffer_min: 45,
          working_hours: {
            mon: { open: '08:00', close: '18:00' },
            tue: { open: '08:00', close: '18:00' },
            wed: { open: '08:00', close: '18:00' },
            thu: { open: '08:00', close: '18:00' },
            fri: { open: '08:00', close: '18:00' },
            sat: { open: '08:00', close: '16:00' },
          },
        },
        base_lat: FIXTURE_BASE.lat,
        base_lng: FIXTURE_BASE.lng,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        slug: 'pwani-fresh',
        name: 'Pwani Fresh Cleaning',
        status: 'SUSPENDED',
        settings: {},
        base_lat: null,
        base_lng: null,
      },
    ],
    catalog: {
      services: FIXTURE_SERVICES.map((s) => ({ ...s, pricing_rule: structuredClone(s.pricing_rule) })),
      addons: [...FIXTURE_ADDONS],
      zones: [...FIXTURE_ZONES],
    },
    staff: { staff: [], availability: [], busy: [], reserved: [] },
    now: new Date('2026-10-14T09:00:00Z'),
    rateLimitCalls: [],
    rateLimited: false,
    ...over,
  };
}

export function fakeDeps(world: FakeWorld): PublicDeps {
  return {
    resolveTenant(slug) {
      const t = world.tenants.find((x) => x.slug === slug);
      if (!t) return Promise.reject(new Error('tenant_not_found'));
      if (t.status === 'SUSPENDED') return Promise.reject(new Error('tenant_suspended'));
      return Promise.resolve(t);
    },
    rateLimit(tenantId, action) {
      world.rateLimitCalls.push(`${tenantId}:${action}`);
      return world.rateLimited ? Promise.reject(new Error('rate_limited')) : Promise.resolve();
    },
    loadCatalog() {
      return Promise.resolve(world.catalog);
    },
    loadStaff() {
      return Promise.resolve(world.staff);
    },
    now: () => world.now,
  };
}

export function staffMember(id: string, skills: string[]): StaffMember {
  return { id, skills, active: true };
}
export function weeklyRule(staff_id: string, weekday: number, start: string, end: string): AvailabilityRule {
  return { staff_id, weekday, date: null, date_to: null, start_time: start, end_time: end, is_off: false };
}
export function leaveRule(staff_id: string, date: string, date_to: string | null = null): AvailabilityRule {
  return { staff_id, weekday: null, date, date_to, start_time: null, end_time: null, is_off: true };
}
export function busyAt(staff_id: string, starts_at: string, ends_at: string): BusyInterval {
  return { staff_id, starts_at, ends_at };
}
export function reservedAt(starts_at: string, ends_at: string, crew_size = 1): ReservedCrew {
  return { starts_at, ends_at, crew_size };
}

// ---- booking store -------------------------------------------------------------------

export interface FakeBooking extends BookingRow {
  phone: string;
  name: string;
  request_hash: string;
  idempotency_key: string | null;
  items: BookingItemRow[];
  events: JobEventRow[];
  quote: unknown;
}

export interface FakeBookingWorld extends FakeWorld {
  bookings: FakeBooking[];
  otps: CustomerOtpRow[];
  payments: PaymentRow[];
  exceptions: { booking_id: string; kind: string; details: Record<string, unknown>; severity: string }[];
  feedback: {
    id: string;
    tenant_id: string;
    booking_id: string;
    kind: string;
    rating: number | null;
    body: string;
    status: string;
    response: string | null;
    created_at: string;
  }[];
  sms: MockSmsProvider | null;
  paymentProvider: PaymentProvider | null;
  tokenSecret: string;
  sandbox: boolean;
  /** Free staff the create path would compute; null = "slot missing" for every slot. */
  counters: Record<string, number>;
  expireHoldsCalls: number;
  transitions: string[];
}

export function fakeBookingWorld(over: Partial<FakeBookingWorld> = {}): FakeBookingWorld {
  return {
    ...fakeWorld(over),
    bookings: [],
    otps: [],
    payments: [],
    exceptions: [],
    feedback: [],
    sms: new MockSmsProvider(),
    paymentProvider: new MockPaymentProvider(FAKE_PAYMENT_SECRET),
    tokenSecret: FAKE_TOKEN_SECRET,
    sandbox: true,
    counters: {},
    expireHoldsCalls: 0,
    transitions: [],
    ...over,
  };
}

let ids = 0;
/** Deterministic, valid v4-shaped uuids; the prefix only picks the leading digits. */
export function fakeId(prefix = 'id'): string {
  ids += 1;
  const kind = { bk: '1', q: '2', otp: '3', pay: '4' }[prefix] ?? '9';
  return `${kind.padStart(8, '0')}-0000-4000-8000-${String(ids).padStart(12, '0')}`;
}

function holdFor(status: BookingStatus, now: Date): string | null {
  if (status === 'AWAITING_PAYMENT') return new Date(now.getTime() + 15 * 60_000).toISOString();
  if (status === 'AWAITING_REVIEW' || status === 'AWAITING_CUSTOMER_APPROVAL') {
    return new Date(now.getTime() + 144 * 3_600_000).toISOString();
  }
  return null;
}

const TERMINAL: BookingStatus[] = ['CANCELLED', 'QUOTE_REJECTED', 'NO_SHOW', 'EXPIRED'];
const RESERVING: BookingStatus[] = ['CONFIRMED', 'ASSIGNED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];
const WAITING: BookingStatus[] = [
  'REQUEST_RECEIVED',
  'AWAITING_REVIEW',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_PAYMENT',
];

function actorRole(meta: TransitionMeta): string {
  if (meta.actor.startsWith('customer:')) return 'CUSTOMER';
  if (meta.actor.startsWith('staff:')) return meta.actor_role ?? 'DISPATCHER';
  return 'SYSTEM';
}

export function fakeBookingDeps(world: FakeBookingWorld): BookingDeps {
  const base = fakeDeps(world);

  const event = (b: FakeBooking, partial: Partial<JobEventRow> & Pick<JobEventRow, 'kind'>): void => {
    b.events.push({
      id: b.events.length + 1,
      from_status: null,
      to_status: null,
      actor_kind: 'system',
      customer_visible: false,
      message_key: null,
      data: {},
      created_at: world.now.toISOString(),
      ...partial,
    });
  };

  const transition = (b: FakeBooking, to: BookingStatus, reason: string | null, meta: TransitionMeta) => {
    world.transitions.push(`${b.ticket_ref}:${b.status}->${to}:${meta.actor}`);
    if (b.status === to) return { status: b.status, changed: false };
    if (!ALLOWED_TRANSITIONS[b.status].includes(to)) throw new Error('transition_not_allowed');
    const role = actorRole(meta);
    if (!(transitionActors(b.status, to) as readonly string[]).includes(role))
      throw new Error('transition_forbidden');
    if (TERMINAL.includes(to) && !reason) throw new Error('reason_required');
    const from = b.status;
    b.status = to;
    b.hold_expires_at = holdFor(to, world.now);
    if (TERMINAL.includes(to)) {
      b.outcome_reason = reason;
      b.cancelled_at = world.now.toISOString();
    }
    if (to === 'CONFIRMED' && !b.confirmed_at) b.confirmed_at = world.now.toISOString();
    event(b, {
      kind: 'status_changed',
      from_status: from,
      to_status: to,
      actor_kind: meta.actor.startsWith('customer:')
        ? 'customer'
        : meta.actor.startsWith('staff:')
          ? 'staff'
          : 'system',
      customer_visible: meta.customer_visible ?? true,
      message_key: meta.message_key ?? `status.${to}`,
      data: { ...(meta.data ?? {}), ...(reason ? { reason } : {}) },
    });
    return { status: to, changed: true };
  };

  const find = (tenantId: string, bookingId: string) =>
    world.bookings.find((b) => b.tenant_id === tenantId && b.id === bookingId) ?? null;

  const reservedCrew = (tenantId: string, start: number, end: number, exclude?: string): number => {
    const buffer = 45 * 60_000;
    return world.bookings
      .filter((b) => b.tenant_id === tenantId && b.id !== exclude && b.scheduled_start && b.scheduled_end)
      .filter(
        (b) =>
          RESERVING.includes(b.status) ||
          (WAITING.includes(b.status) &&
            (b.hold_expires_at == null || Date.parse(b.hold_expires_at) > world.now.getTime())),
      )
      .filter(
        (b) =>
          Date.parse(b.scheduled_start as string) - buffer < end &&
          Date.parse(b.scheduled_end as string) + buffer > start,
      )
      .reduce((sum, b) => sum + b.crew_size, 0);
  };

  return {
    ...base,
    env: { sandbox: world.sandbox, tokenSecret: world.tokenSecret },
    sms: world.sms,
    payments: world.paymentProvider,

    rateLimitPhone(tenantId, action, phone) {
      world.rateLimitCalls.push(`${tenantId}:${action}:${phone}`);
      return world.rateLimited ? Promise.reject(new Error('rate_limited')) : Promise.resolve();
    },

    otp: {
      issue(row) {
        for (const o of world.otps) {
          if (
            o.tenant_id === row.tenant_id &&
            o.phone_e164 === row.phone_e164 &&
            o.purpose === row.purpose &&
            !o.consumed_at
          ) {
            o.consumed_at = world.now.toISOString();
          }
        }
        world.otps.push({ ...row, id: fakeId('otp'), attempts: 0, max_attempts: 5, consumed_at: null });
        return Promise.resolve();
      },
      claim(tenantId, phone, purpose: OtpPurpose) {
        const live = [...world.otps]
          .reverse()
          .find(
            (o) =>
              o.tenant_id === tenantId && o.phone_e164 === phone && o.purpose === purpose && !o.consumed_at,
          );
        if (
          !live ||
          Date.parse(live.expires_at) <= world.now.getTime() ||
          live.attempts >= live.max_attempts
        ) {
          return Promise.resolve(null);
        }
        live.attempts += 1;
        return Promise.resolve({ ...live });
      },
      latest(tenantId, phone, purpose: OtpPurpose) {
        const row = [...world.otps]
          .reverse()
          .find((o) => o.tenant_id === tenantId && o.phone_e164 === phone && o.purpose === purpose);
        return Promise.resolve(row ? { ...row } : null);
      },
      consume(id) {
        const row = world.otps.find((o) => o.id === id);
        if (row) row.consumed_at = world.now.toISOString();
        return Promise.resolve();
      },
    },

    createBooking(payload) {
      const p = payload as {
        tenant_id: string;
        idempotency_key: string | null;
        source: BookingRow['source'];
        locale: 'sw' | 'en';
        customer: { phone_e164: string; name: string };
        address: Record<string, unknown> | null;
        quote: {
          total_tzs: number;
          deposit_tzs: number;
          requires_review: boolean;
          est_duration_min: number;
          crew_size: number;
        };
        items: BookingItemRow[];
        schedule: { start: string; end: string; capacity: number } | null;
        payment_mode: 'DEPOSIT' | 'ON_COMPLETION';
        notes_customer: string | null;
      };
      const hash = JSON.stringify({ ...p, idempotency_key: undefined });
      const existing = p.idempotency_key
        ? world.bookings.find((b) => b.tenant_id === p.tenant_id && b.idempotency_key === p.idempotency_key)
        : undefined;
      if (existing) {
        if (existing.request_hash !== hash) return Promise.reject(new Error('idempotency_mismatch'));
        return Promise.resolve<CreateBookingResult>({
          booking_id: existing.id,
          ticket_ref: existing.ticket_ref,
          status: existing.status,
          created: false,
          hold_expires_at: existing.hold_expires_at,
        });
      }
      if (p.schedule) {
        const start = Date.parse(p.schedule.start);
        const end = Date.parse(p.schedule.end);
        if (reservedCrew(p.tenant_id, start, end) + p.quote.crew_size > p.schedule.capacity) {
          return Promise.reject(new Error('slot_unavailable'));
        }
      }
      const n = (world.counters[p.tenant_id] ?? 0) + 1;
      world.counters[p.tenant_id] = n;
      const b: FakeBooking = {
        id: fakeId('bk'),
        tenant_id: p.tenant_id,
        ticket_ref: `UBC-2026-${String(n).padStart(5, '0')}`,
        customer_id: `cust-${p.customer.phone_e164}`,
        status: 'REQUEST_RECEIVED',
        source: p.source,
        quote_id: fakeId('q'),
        scheduled_start: p.schedule?.start ?? null,
        scheduled_end: p.schedule?.end ?? null,
        duration_min: p.quote.est_duration_min,
        crew_size: p.quote.crew_size,
        flags: [],
        payment_mode: p.payment_mode,
        total_tzs: p.quote.total_tzs,
        deposit_tzs: p.quote.deposit_tzs,
        paid_tzs: 0,
        locale: p.locale,
        notes_customer: p.notes_customer,
        outcome_reason: null,
        hold_expires_at: null,
        address_snapshot: p.address ?? {},
        created_at: world.now.toISOString(),
        confirmed_at: null,
        cancelled_at: null,
        phone: p.customer.phone_e164,
        name: p.customer.name,
        request_hash: hash,
        idempotency_key: p.idempotency_key,
        items: p.items.map((it, i) => ({ ...it, item_index: i })),
        events: [],
        quote: p.quote,
      };
      event(b, {
        kind: 'created',
        to_status: 'REQUEST_RECEIVED',
        actor_kind: 'customer',
        customer_visible: true,
        message_key: 'event.created',
      });
      world.bookings.push(b);
      const target: BookingStatus = p.quote.requires_review
        ? 'AWAITING_REVIEW'
        : p.payment_mode === 'DEPOSIT' && p.quote.deposit_tzs > 0
          ? 'AWAITING_PAYMENT'
          : 'CONFIRMED';
      transition(b, target, null, { actor: 'system:create_booking' });
      if (p.quote.requires_review)
        world.exceptions.push({ booking_id: b.id, kind: 'NEEDS_REVIEW', details: {}, severity: 'normal' });
      return Promise.resolve<CreateBookingResult>({
        booking_id: b.id,
        ticket_ref: b.ticket_ref,
        status: b.status,
        created: true,
        hold_expires_at: b.hold_expires_at,
        customer_id: b.customer_id,
        ...(b.quote_id ? { quote_id: b.quote_id } : {}),
      });
    },

    expireHolds() {
      world.expireHoldsCalls += 1;
      for (const b of world.bookings) {
        if (
          (b.status === 'AWAITING_PAYMENT' || b.status === 'AWAITING_CUSTOMER_APPROVAL') &&
          b.hold_expires_at &&
          Date.parse(b.hold_expires_at) <= world.now.getTime()
        ) {
          transition(b, 'EXPIRED', 'hold_expired', { actor: 'system:expire_holds' });
        }
      }
      return Promise.resolve();
    },

    transition(bookingId, to, reason, meta) {
      const b = world.bookings.find((x) => x.id === bookingId);
      if (!b) return Promise.reject(new Error('booking_not_found'));
      try {
        return Promise.resolve(transition(b, to, reason, meta));
      } catch (err) {
        return Promise.reject(err instanceof Error ? err : new Error(String(err)));
      }
    },

    addJobEvent(bookingId, kind, customerVisible, messageKey, data, meta) {
      const b = world.bookings.find((x) => x.id === bookingId);
      if (!b) return Promise.reject(new Error('booking_not_found'));
      event(b, {
        kind,
        customer_visible: customerVisible,
        message_key: messageKey,
        data,
        actor_kind: meta.actor.startsWith('customer:') ? 'customer' : 'system',
      });
      return Promise.resolve();
    },

    openException(bookingId, kind, details, severity) {
      if (!world.bookings.some((x) => x.id === bookingId))
        return Promise.reject(new Error('booking_not_found'));
      const open = world.exceptions.find((e) => e.booking_id === bookingId && e.kind === kind);
      if (open) open.details = { ...open.details, ...details };
      else world.exceptions.push({ booking_id: bookingId, kind, details, severity });
      return Promise.resolve();
    },

    feedbackForBooking(tenantId, bookingId) {
      return Promise.resolve(
        world.feedback
          .filter((f) => f.tenant_id === tenantId && f.booking_id === bookingId)
          .map((f) => ({ ...f })),
      );
    },

    submitFeedback(input) {
      const b = world.bookings.find((x) => x.id === input.bookingId && x.tenant_id === input.tenantId);
      if (!b) return Promise.reject(new Error('booking_not_found'));
      if (input.kind !== 'COMMENT' && input.kind !== 'COMPLAINT')
        return Promise.reject(new Error('feedback_kind_invalid'));
      if (input.rating != null && (input.rating < 1 || input.rating > 5))
        return Promise.reject(new Error('feedback_rating_invalid'));
      if (!input.body || input.body.trim().length < 2)
        return Promise.reject(new Error('feedback_body_required'));
      const row = {
        id: fakeId('fb'),
        tenant_id: input.tenantId,
        booking_id: input.bookingId,
        kind: input.kind,
        rating: input.rating,
        body: input.body.trim(),
        status: 'OPEN',
        response: null,
        created_at: world.now.toISOString(),
      };
      world.feedback.push(row);
      return Promise.resolve({ id: row.id });
    },

    bookingsForPhone(tenantId, phone) {
      return Promise.resolve(
        world.bookings
          .filter((b) => b.tenant_id === tenantId && b.phone === phone)
          .map((b) => ({
            ...b,
            service_label_sw: b.items[0]?.label_sw ?? '',
            service_label_en: b.items[0]?.label_en ?? '',
          }))
          .reverse(),
      );
    },

    loadBookingDetail(tenantId, bookingId) {
      const b = find(tenantId, bookingId);
      if (!b) return Promise.resolve(null);
      const detail: BookingDetail = {
        booking: { ...b },
        customer: { phone_e164: b.phone, name: b.name, locale: b.locale },
        items: b.items,
        events: b.events,
        payments: world.payments.filter((p) => p.booking_id === b.id),
        quote: { id: b.quote_id ?? '', status: 'APPROVED', snapshot: b.quote, expires_at: null },
      };
      return Promise.resolve(detail);
    },

    insertPayment(row) {
      const p: PaymentRow = {
        id: fakeId('pay'),
        ...row,
        provider_ref: null,
        status: 'PENDING',
        created_at: world.now.toISOString(),
        completed_at: null,
      };
      world.payments.push(p);
      return Promise.resolve({ ...p });
    },
    findPaymentByKey(tenantId, key) {
      const p = world.payments.find((x) => x.tenant_id === tenantId && x.idempotency_key === key);
      return Promise.resolve(p ? { ...p } : null);
    },
    findPaymentByRef(provider, ref) {
      const p = world.payments.find((x) => x.provider === provider && x.provider_ref === ref);
      return Promise.resolve(p ? { ...p } : null);
    },
    setPaymentRef(paymentId, providerRef) {
      const p = world.payments.find((x) => x.id === paymentId);
      if (p) p.provider_ref = providerRef;
      return Promise.resolve();
    },
    applyPaymentResult(paymentId, status: PaymentStatus) {
      const p = world.payments.find((x) => x.id === paymentId);
      if (!p) return Promise.reject(new Error('payment_not_found'));
      if (p.status === status || p.status === 'SUCCESS') return Promise.resolve({ changed: false });
      p.status = status;
      const b = world.bookings.find((x) => x.id === p.booking_id);
      if (!b) return Promise.resolve({ changed: true });
      if (status === 'SUCCESS') {
        b.paid_tzs += p.amount_tzs;
        event(b, {
          kind: 'payment',
          customer_visible: true,
          message_key: 'event.payment_received',
          data: { amount_tzs: p.amount_tzs },
        });
        if (b.status === 'AWAITING_PAYMENT') transition(b, 'CONFIRMED', null, { actor: 'system:payment' });
      } else if (status === 'UNKNOWN') {
        world.exceptions.push({
          booking_id: b.id,
          kind: 'PAYMENT_UNKNOWN',
          details: { payment_id: p.id },
          severity: 'high',
        });
      }
      return Promise.resolve({ changed: true, booking_status: b.status });
    },
  };
}
