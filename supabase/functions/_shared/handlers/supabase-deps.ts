// Supabase-backed PublicDeps / BookingDeps used by the Deno entrypoints. Runs with the
// service role after the tenant has been resolved from the slug; never trusts client
// tenant ids. Every write that must be atomic is a Postgres function (migration 0013).
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilityRule, BusyInterval, ReservedCrew, StaffMember } from '../availability/slots.ts';
import type { BookingStatus, PaymentStatus } from '../enums.ts';
import type { OtpPurpose } from '../otp.ts';
import { paymentProviderFromEnv } from '../payments/provider.ts';
import type { Catalog } from '../pricing/quote.ts';
import type { CatalogAddon, CatalogService, CatalogZone } from '../pricing/types.ts';
import { callerIdFrom, enforceRateLimit, RATE_LIMITS } from '../rate-limit.ts';
import { smsProviderFromEnv } from '../sms/provider.ts';
import { resolveTenantBySlug } from '../tenant.ts';
import type {
  BookingDeps,
  BookingDetail,
  BookingItemRow,
  BookingRow,
  CreateBookingResult,
  CustomerOtpRow,
  JobEventRow,
  PaymentRow,
  PublicAction,
  PublicDeps,
  StaffData,
  TransitionMeta,
} from './types.ts';

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

const RESERVING_STATUSES: BookingStatus[] = [
  'REQUEST_RECEIVED',
  'AWAITING_REVIEW',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'ASSIGNED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
];
const HOLD_STATUSES: BookingStatus[] = [
  'REQUEST_RECEIVED',
  'AWAITING_REVIEW',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_PAYMENT',
];

export function supabaseDeps(admin: SupabaseClient, req: Request): PublicDeps {
  const caller = callerIdFrom(req);
  return {
    resolveTenant: (slug) => resolveTenantBySlug(admin, slug),

    rateLimit: (tenantId, action: PublicAction) =>
      enforceRateLimit(admin, RATE_LIMITS[action], tenantId, caller),

    async loadCatalog(tenantId): Promise<Catalog> {
      const [services, addons, zones] = await Promise.all([
        admin
          .from('services')
          .select(
            'id, name_sw, name_en, pricing_type, pricing_rule, duration_rule, crew_size, active, deleted_at',
          )
          .eq('tenant_id', tenantId)
          .is('deleted_at', null),
        admin
          .from('service_addons')
          .select('id, service_id, name_sw, name_en, price_tzs, per_unit, active')
          .eq('tenant_id', tenantId),
        admin
          .from('service_zones')
          .select('id, name, areas, polygon, max_km, travel_fee_tzs, serviceable, active')
          .eq('tenant_id', tenantId)
          .order('sort'),
      ]);
      return {
        services: unwrap<CatalogService[]>(services),
        addons: unwrap<CatalogAddon[]>(addons),
        zones: unwrap<CatalogZone[]>(zones).map((z) => ({
          ...z,
          max_km: z.max_km == null ? null : Number(z.max_km),
        })),
      };
    },

    async loadStaff(tenantId, from, to): Promise<StaffData> {
      const rangeStart = `${from}T00:00:00+03:00`;
      const rangeEnd = `${to}T23:59:59+03:00`;
      const [staff, availability, busy, holding] = await Promise.all([
        admin.from('staff').select('id, skills, active').eq('tenant_id', tenantId).eq('active', true),
        admin
          .from('staff_availability')
          .select('staff_id, weekday, date, date_to, start_time, end_time, is_off')
          .eq('tenant_id', tenantId),
        admin
          .from('assignments')
          .select('staff_id, starts_at, ends_at')
          .eq('tenant_id', tenantId)
          .is('cancelled_at', null)
          .lt('starts_at', rangeEnd)
          .gt('ends_at', rangeStart),
        admin
          .from('bookings')
          .select(
            'id, scheduled_start, scheduled_end, crew_size, status, hold_expires_at, assignments(id, cancelled_at)',
          )
          .eq('tenant_id', tenantId)
          .in('status', RESERVING_STATUSES)
          .not('scheduled_start', 'is', null)
          .lt('scheduled_start', rangeEnd)
          .gt('scheduled_end', rangeStart),
      ]);
      const now = Date.now();
      const reserved: ReservedCrew[] = unwrap<
        {
          id: string;
          scheduled_start: string;
          scheduled_end: string;
          crew_size: number;
          status: BookingStatus;
          hold_expires_at: string | null;
          assignments: { id: string; cancelled_at: string | null }[] | null;
        }[]
      >(holding)
        .filter(
          (b) =>
            !HOLD_STATUSES.includes(b.status) ||
            b.hold_expires_at == null ||
            Date.parse(b.hold_expires_at) > now,
        )
        .map((b) => ({
          starts_at: b.scheduled_start,
          ends_at: b.scheduled_end,
          crew_size: Math.max(
            0,
            b.crew_size - (b.assignments ?? []).filter((a) => a.cancelled_at == null).length,
          ),
        }))
        .filter((r) => r.crew_size > 0);
      return {
        staff: unwrap<StaffMember[]>(staff),
        availability: unwrap<AvailabilityRule[]>(availability),
        busy: unwrap<BusyInterval[]>(busy),
        reserved,
      };
    },

    now: () => new Date(),
  };
}

export interface FunctionEnv {
  APP_ENV?: string | undefined;
  OTP_TOKEN_SECRET?: string | undefined;
  OTP_PROVIDER?: string | undefined;
  PAYMENT_PROVIDER?: string | undefined;
  MOCK_PAYMENT_SECRET?: string | undefined;
  SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
  /** Sandbox only: requests carrying `x-load-test: <secret>` get a per-request rate-limit key. */
  LOAD_TEST_SECRET?: string | undefined;
}

const BOOKING_COLUMNS =
  'id, tenant_id, ticket_ref, customer_id, status, source, quote_id, scheduled_start, scheduled_end, duration_min, crew_size, flags, payment_mode, total_tzs, deposit_tzs, paid_tzs, locale, notes_customer, outcome_reason, hold_expires_at, address_snapshot, created_at, confirmed_at, cancelled_at';
const PAYMENT_COLUMNS =
  'id, tenant_id, booking_id, kind, provider, provider_ref, amount_tzs, status, idempotency_key, created_at, completed_at';

export function bookingDeps(admin: SupabaseClient, req: Request, env: FunctionEnv): BookingDeps {
  const base = supabaseDeps(admin, req);
  const tokenSecret =
    env.OTP_TOKEN_SECRET ??
    (env.SUPABASE_SERVICE_ROLE_KEY ? `safi360-otp:${env.SUPABASE_SERVICE_ROLE_KEY}` : '');
  if (!tokenSecret) throw new Error('otp_token_secret_missing');
  const sandbox = env.APP_ENV !== 'production';

  const rpc = async <T>(fn: string, args: Record<string, unknown>): Promise<T> => {
    const res: { data: unknown; error: { message: string } | null } = await admin.rpc(fn, args);
    if (res.error) throw new Error(res.error.message);
    return res.data as T;
  };

  return {
    ...base,
    env: { sandbox, tokenSecret },
    sms: smsProviderFromEnv(env),
    payments: paymentProviderFromEnv(env),

    // The load test (scripts/load-create-booking.mjs) fires 50 creates from one machine;
    // outside production a matching secret header swaps the IP key for a random one.
    ...(sandbox && env.LOAD_TEST_SECRET && req.headers.get('x-load-test') === env.LOAD_TEST_SECRET
      ? {
          rateLimit: (tenantId: string, action: PublicAction) =>
            enforceRateLimit(admin, RATE_LIMITS[action], tenantId, `load:${crypto.randomUUID()}`),
        }
      : {}),

    rateLimitPhone: (tenantId, action, phone) =>
      enforceRateLimit(admin, RATE_LIMITS[action], tenantId, `phone:${phone}`),

    otp: {
      async issue(row) {
        unwrap(
          await admin
            .from('customer_otp_codes')
            .update({ consumed_at: new Date().toISOString() })
            .eq('tenant_id', row.tenant_id)
            .eq('phone_e164', row.phone_e164)
            .eq('purpose', row.purpose)
            .is('consumed_at', null)
            .select('id'),
        );
        unwrap(await admin.from('customer_otp_codes').insert(row).select('id'));
      },
      async claim(tenantId, phone, purpose: OtpPurpose) {
        const rows = await rpc<CustomerOtpRow[]>('customer_otp_claim', {
          p_tenant_id: tenantId,
          p_phone: phone,
          p_purpose: purpose,
        });
        return rows[0] ?? null;
      },
      async latest(tenantId, phone, purpose: OtpPurpose) {
        return unwrap<CustomerOtpRow | null>(
          await admin
            .from('customer_otp_codes')
            .select('*')
            .eq('tenant_id', tenantId)
            .eq('phone_e164', phone)
            .eq('purpose', purpose)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle(),
        );
      },
      async consume(id) {
        unwrap(
          await admin
            .from('customer_otp_codes')
            .update({ consumed_at: new Date().toISOString() })
            .eq('id', id)
            .select('id'),
        );
      },
    },

    createBooking: (payload) => rpc<CreateBookingResult>('create_booking_tx', { p: payload }),

    expireHolds: () => rpc<number>('expire_booking_holds', { p_limit: 200 }).then(() => undefined),

    transition: (bookingId, to, reason, meta: TransitionMeta) =>
      rpc<{ status: BookingStatus; changed: boolean }>('transition_booking', {
        p_booking_id: bookingId,
        p_to: to,
        p_reason: reason,
        p_meta: meta,
      }),

    addJobEvent: (bookingId, kind, customerVisible, messageKey, data, meta) =>
      rpc('add_job_event', {
        p_booking_id: bookingId,
        p_kind: kind,
        p_customer_visible: customerVisible,
        p_message_key: messageKey,
        p_data: data,
        p_meta: meta,
      }).then(() => undefined),

    openException: (bookingId, kind, details, severity, meta) =>
      rpc('open_exception', {
        p_booking_id: bookingId,
        p_kind: kind,
        p_details: details,
        p_severity: severity,
        p_meta: meta,
      }).then(() => undefined),

    feedbackForBooking: async (tenantId, bookingId) => {
      const rows = unwrap<
        {
          id: string;
          kind: string;
          rating: number | null;
          body: string;
          status: string;
          response: string | null;
          created_at: string;
        }[]
      >(
        await admin
          .from('booking_feedback')
          .select('id, kind, rating, body, status, response, created_at')
          .eq('tenant_id', tenantId)
          .eq('booking_id', bookingId)
          .order('created_at', { ascending: false }),
      );
      return rows;
    },

    submitFeedback: async (input) => {
      const row = unwrap<{ id: string } | null>(
        await admin
          .from('booking_feedback')
          .insert({
            tenant_id: input.tenantId,
            booking_id: input.bookingId,
            customer_id: input.customerId,
            kind: input.kind,
            rating: input.rating,
            body: input.body,
          })
          .select('id')
          .single(),
      );
      if (!row) throw new Error('feedback_insert_failed');
      return { id: row.id };
    },

    async bookingsForPhone(tenantId, phone) {
      const customer = unwrap<{ id: string } | null>(
        await admin
          .from('customers')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('phone_e164', phone)
          .maybeSingle(),
      );
      if (!customer) return [];
      const rows = unwrap<
        (BookingRow & { booking_items: { label_sw: string; label_en: string; item_index: number }[] })[]
      >(
        await admin
          .from('bookings')
          .select(`${BOOKING_COLUMNS}, booking_items(label_sw, label_en, item_index)`)
          .eq('tenant_id', tenantId)
          .eq('customer_id', customer.id)
          .order('created_at', { ascending: false })
          .limit(50),
      );
      return rows.map(({ booking_items, ...b }) => {
        const first = [...(booking_items ?? [])].sort((a, z) => a.item_index - z.item_index)[0];
        return { ...b, service_label_sw: first?.label_sw ?? '', service_label_en: first?.label_en ?? '' };
      });
    },

    async loadBookingDetail(tenantId, bookingId): Promise<BookingDetail | null> {
      const booking = unwrap<BookingRow | null>(
        await admin
          .from('bookings')
          .select(BOOKING_COLUMNS)
          .eq('tenant_id', tenantId)
          .eq('id', bookingId)
          .maybeSingle(),
      );
      if (!booking) return null;
      const [customer, items, events, payments, quote] = await Promise.all([
        admin.from('customers').select('phone_e164, name, locale').eq('id', booking.customer_id).single(),
        admin
          .from('booking_items')
          .select('item_index, service_id, label_sw, label_en, input, qty, amount_tzs, requires_review')
          .eq('booking_id', bookingId)
          .order('item_index'),
        admin
          .from('job_events')
          .select(
            'id, kind, from_status, to_status, actor_kind, customer_visible, message_key, data, created_at',
          )
          .eq('booking_id', bookingId)
          .order('id'),
        admin.from('payments').select(PAYMENT_COLUMNS).eq('booking_id', bookingId).order('created_at'),
        booking.quote_id
          ? admin
              .from('quotes')
              .select('id, status, snapshot, expires_at')
              .eq('id', booking.quote_id)
              .maybeSingle()
          : Promise.resolve({ data: null, error: null }),
      ]);
      return {
        booking,
        customer: unwrap<{ phone_e164: string; name: string; locale: string }>(customer),
        items: unwrap<BookingItemRow[]>(items),
        events: unwrap<JobEventRow[]>(events),
        payments: unwrap<PaymentRow[]>(payments),
        quote: unwrap<BookingDetail['quote']>(quote),
      };
    },

    async insertPayment(row) {
      return unwrap<PaymentRow>(await admin.from('payments').insert(row).select(PAYMENT_COLUMNS).single());
    },

    async findPaymentByKey(tenantId, key) {
      return unwrap<PaymentRow | null>(
        await admin
          .from('payments')
          .select(PAYMENT_COLUMNS)
          .eq('tenant_id', tenantId)
          .eq('idempotency_key', key)
          .maybeSingle(),
      );
    },

    async findPaymentByRef(provider, ref) {
      return unwrap<PaymentRow | null>(
        await admin
          .from('payments')
          .select(PAYMENT_COLUMNS)
          .eq('provider', provider)
          .eq('provider_ref', ref)
          .maybeSingle(),
      );
    },

    async setPaymentRef(paymentId, providerRef, raw) {
      unwrap(
        await admin
          .from('payments')
          .update({ provider_ref: providerRef, raw })
          .eq('id', paymentId)
          .select('id'),
      );
    },

    async applyPaymentResult(paymentId, status: PaymentStatus, providerRef, raw) {
      const out = await rpc<{ changed: boolean; booking: { status?: BookingStatus } | null }>(
        'apply_payment_result',
        {
          p_payment_id: paymentId,
          p_status: status,
          p_provider_ref: providerRef,
          p_raw: raw,
          p_meta: {},
        },
      );
      const result: { changed: boolean; booking_status?: BookingStatus } = { changed: out.changed };
      if (out.booking?.status) result.booking_status = out.booking.status;
      return result;
    },
  };
}
