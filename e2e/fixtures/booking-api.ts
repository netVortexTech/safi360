// Hermetic backend for the portal e2e specs: every /functions/v1/* call and the
// portal_catalog RPC are answered from an in-memory store that mirrors the server rules
// the UI depends on (idempotency, slot taken, OTP 123456, tracking gate, mock payment).
// With E2E_LIVE=1 nothing is intercepted and the same specs run against the real stack.
import { test as base, expect, type Page, type Route } from '@playwright/test';
import {
  FIXTURE_ADDONS,
  FIXTURE_SERVICES,
  FIXTURE_TENANT_ID,
  FIXTURE_ZONES,
  SERVICE_IDS,
} from '../../supabase/functions/_shared/pricing/fixtures.ts';
import { quote, type Catalog } from '../../supabase/functions/_shared/pricing/quote.ts';
import { quoteItemInput } from '../../supabase/functions/_shared/pricing/rules.ts';
import type { QuoteResult } from '../../supabase/functions/_shared/pricing/types.ts';

export const LIVE = process.env.E2E_LIVE === '1';
export const SANDBOX_CODE = '123456';
export const PHONE_NATIONAL = '715880342';
export const PHONE = '+255715880342';

interface StoredBooking {
  id: string;
  ticket_ref: string;
  status: string;
  phone: string;
  name: string;
  idempotency_key: string;
  slot: { start: string; end: string } | null;
  quote: QuoteResult;
  payment_mode: string;
  hold_expires_at: string | null;
  paid_tzs: number;
  events: { kind: string; to_status: string | null; message_key: string; at: string }[];
  address: Record<string, string>;
}

export interface FakeBackend {
  bookings: StoredBooking[];
  calls: Record<string, number>;
  /** Refuse the next create_booking for this slot start (ISO) once. */
  takeSlot(start: string): void;
  /** Make the next create_booking create the booking but answer 500 (a lost response). */
  failNextCreateAfterWrite(): void;
}

const CATALOG: Catalog = { services: FIXTURE_SERVICES, addons: FIXTURE_ADDONS, zones: FIXTURE_ZONES };

function catalogPayload() {
  return {
    tenant: {
      id: FIXTURE_TENANT_ID,
      slug: 'usafi-bora',
      name: 'Usafi Bora Cleaners',
      city: 'Dar es Salaam',
      phone_e164: '+255754000001',
      ticket_prefix: 'UBC',
      status: 'ACTIVE',
      branding: {
        display_name: 'Usafi Bora Cleaners',
        color: '#0E7C7B',
        greeting_sw: 'Karibu Usafi Bora!',
        greeting_en: 'Welcome to Usafi Bora!',
      },
      base: { lat: -6.7199, lng: 39.2113 },
      settings: {
        deposit_pct: 30,
        cancel_hours: 4,
        slot_hold_minutes: 15,
        quote_expiry_hours: 144,
        min_lead_minutes: 120,
        slot_step_min: 60,
        languages: ['sw', 'en'],
        default_locale: 'sw',
        working_hours: {
          mon: { open: '08:00', close: '18:00' },
          tue: { open: '08:00', close: '18:00' },
          wed: { open: '08:00', close: '18:00' },
          thu: { open: '08:00', close: '18:00' },
          fri: { open: '08:00', close: '18:00' },
          sat: { open: '08:00', close: '16:00' },
        },
        tax: { mode: 'none', rate_pct: 18, label: 'VAT' },
      },
    },
    categories: [
      { id: 'c1', name_sw: 'Sofa na makochi', name_en: 'Sofa & upholstery', sort: 1 },
      { id: 'c2', name_sw: 'Kufukiza na matibabu', name_en: 'Fumigation & treatment', sort: 2 },
    ],
    services: FIXTURE_SERVICES.filter((s) => s.active).map((s, i) => ({
      ...s,
      category_id: s.id === SERVICE_IDS.mould ? 'c2' : 'c1',
      description_sw: null,
      description_en: null,
      recurrence_days: null,
      sort: i,
    })),
    addons: FIXTURE_ADDONS,
    zones: FIXTURE_ZONES,
  };
}

function priced(items: unknown[], address: { area?: string } | null): QuoteResult {
  return quote({ items: quoteItemInput.array().parse(items), address }, CATALOG, {
    deposit_pct: 30,
    quote_expiry_hours: 144,
    tax: { mode: 'none', rate_pct: 18, label: 'VAT' },
    base: { lat: -6.7199, lng: 39.2113 },
    now: new Date(),
  });
}

/** Slots for every weekday in [from, to] at 09:00, 10:00 and 12:00 Dar, two days from now onwards. */
function slotsFor(from: string, to: string, durationMin: number, taken: Set<string>) {
  const out: { start: string; end: string; date: string; staff_ids: string[]; capacity: number }[] = [];
  const earliest = Date.now() + 2 * 3_600_000;
  for (
    let d = new Date(`${from}T00:00:00Z`);
    d.toISOString().slice(0, 10) <= to;
    d.setUTCDate(d.getUTCDate() + 1)
  ) {
    const date = d.toISOString().slice(0, 10);
    if (d.getUTCDay() === 0) continue;
    for (const hourUtc of [6, 7, 9]) {
      const start = new Date(`${date}T${String(hourUtc).padStart(2, '0')}:00:00Z`);
      if (start.getTime() < earliest) continue;
      const iso = start.toISOString();
      if (taken.has(iso)) continue;
      out.push({
        start: iso,
        end: new Date(start.getTime() + durationMin * 60_000).toISOString(),
        date,
        staff_ids: [],
        capacity: 2,
      });
    }
  }
  return out;
}

/** A fully-formed stored booking for specs that seed the store directly (real quote shape). */
export function seededBooking(
  over: Partial<StoredBooking> & { id: string; ticket_ref: string },
): StoredBooking {
  const now = new Date().toISOString();
  const q = priced([{ service_id: SERVICE_IDS.sofa, qty: 5 }], { area: 'Mbezi Beach' });
  const status = over.status ?? 'CONFIRMED';
  return {
    status,
    phone: PHONE,
    name: 'Daudi Lyimo',
    idempotency_key: `booking_seed_${over.id}`,
    slot: null,
    quote: q,
    payment_mode: 'ON_COMPLETION',
    hold_expires_at: null,
    paid_tzs: 0,
    events: [
      { kind: 'created', to_status: 'REQUEST_RECEIVED', message_key: 'event.created', at: now },
      { kind: 'status_changed', to_status: status, message_key: `status.${status}`, at: now },
    ],
    address: { area: 'Mbezi Beach' },
    ...over,
  };
}

async function json(route: Route, status: number, body: unknown) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

export async function installFakeBackend(page: Page): Promise<FakeBackend> {
  const state = {
    bookings: [] as StoredBooking[],
    calls: {} as Record<string, number>,
    takenSlots: new Set<string>(),
    takeAny: false,
    failAfterWrite: false,
    seq: 0,
    reserved: new Set<string>(),
  };
  const backend: FakeBackend = {
    bookings: state.bookings,
    calls: state.calls,
    takeSlot: (start) => {
      state.takenSlots.add(start);
    },
    failNextCreateAfterWrite: () => {
      state.failAfterWrite = true;
    },
  };
  const count = (name: string) => {
    state.calls[name] = (state.calls[name] ?? 0) + 1;
  };
  const tokenFor = (phone: string, purpose: string) => `tok.${purpose}.${phone}`;
  const exp = () => new Date(Date.now() + 15 * 60_000).toISOString();

  await page.route('**/rest/v1/rpc/portal_catalog', async (route) => {
    count('portal_catalog');
    await json(route, 200, catalogPayload());
  });

  await page.route('**/functions/v1/*', async (route) => {
    const name = new URL(route.request().url()).pathname.split('/').pop() ?? '';
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    count(name);

    switch (name) {
      case 'availability': {
        const q = priced(body.items as unknown[], (body.address as { area?: string } | null) ?? null);
        const slots = slotsFor(
          String(body.from),
          String(body.to),
          q.est_duration_min,
          state.takeAny ? new Set() : state.takenSlots,
        );
        return json(route, 200, {
          duration_min: q.est_duration_min,
          crew_size: q.crew_size,
          requires_review: q.requires_review,
          out_of_area: q.out_of_area,
          slots,
        });
      }
      case 'otp_send':
        return json(route, 200, {
          status: 'code_sent',
          expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          sandbox: true,
        });
      case 'otp_verify':
        if (body.code !== SANDBOX_CODE) {
          return json(route, 401, {
            code: 'otp_invalid',
            message: 'auth.errors.invalid_code',
            retryable: true,
            field_errors: { code: 'auth.errors.invalid_code' },
          });
        }
        return json(route, 200, {
          token: tokenFor(String(body.phone), String(body.purpose)),
          expires_at: exp(),
        });
      case 'create_booking': {
        const key = String(body.idempotency_key);
        const existing = state.bookings.find((b) => b.idempotency_key === key);
        if (existing) {
          return json(route, 200, {
            booking_id: existing.id,
            ticket_ref: existing.ticket_ref,
            status: existing.status,
            created: false,
            hold_expires_at: existing.hold_expires_at,
            quote: existing.quote,
            schedule: existing.slot,
          });
        }
        const token = String(body.verify_token);
        if (!token.startsWith('tok.booking.'))
          return json(route, 401, {
            code: 'phone_not_verified',
            message: 'errors.phone_not_verified',
            retryable: false,
          });
        const phone = token.slice('tok.booking.'.length);
        const q = priced(body.items as unknown[], (body.address as { area?: string } | null) ?? null);
        const slot = body.slot as { start: string } | null;
        if (slot && (state.takeAny || state.takenSlots.has(slot.start) || state.reserved.has(slot.start))) {
          state.takeAny = false;
          state.takenSlots.add(slot.start);
          return json(route, 409, {
            code: 'slot_unavailable',
            message: 'booking.error.slot_unavailable',
            retryable: true,
          });
        }
        if (
          body.expected_total_tzs != null &&
          !q.requires_review &&
          body.expected_total_tzs !== q.total_tzs
        ) {
          return json(route, 409, {
            code: 'quote_changed',
            message: 'booking.error.quote_changed',
            retryable: true,
            quote: q,
          });
        }
        state.seq += 1;
        const status = q.requires_review
          ? 'AWAITING_REVIEW'
          : body.payment_mode === 'DEPOSIT' && q.deposit_tzs > 0
            ? 'AWAITING_PAYMENT'
            : 'CONFIRMED';
        const hold = status === 'AWAITING_PAYMENT' ? new Date(Date.now() + 15 * 60_000).toISOString() : null;
        const now = new Date().toISOString();
        const booking: StoredBooking = {
          id: `00000000-0000-4000-8000-${String(state.seq).padStart(12, '0')}`,
          ticket_ref: `UBC-2026-${String(state.seq).padStart(5, '0')}`,
          status,
          phone,
          name: String((body.customer as { name: string }).name),
          idempotency_key: key,
          slot: slot
            ? {
                start: slot.start,
                end: new Date(Date.parse(slot.start) + q.est_duration_min * 60_000).toISOString(),
              }
            : null,
          quote: q,
          payment_mode: typeof body.payment_mode === 'string' ? body.payment_mode : 'ON_COMPLETION',
          hold_expires_at: hold,
          paid_tzs: 0,
          events: [
            { kind: 'created', to_status: 'REQUEST_RECEIVED', message_key: 'event.created', at: now },
            { kind: 'status_changed', to_status: status, message_key: `status.${status}`, at: now },
          ],
          address: (body.address as Record<string, string> | null) ?? {},
        };
        state.bookings.push(booking);
        if (slot) state.reserved.add(slot.start);
        if (state.failAfterWrite) {
          state.failAfterWrite = false;
          return json(route, 500, { code: 'internal', message: 'errors.internal', retryable: true });
        }
        return json(route, 201, {
          booking_id: booking.id,
          ticket_ref: booking.ticket_ref,
          status,
          created: true,
          hold_expires_at: hold,
          quote: q,
          schedule: booking.slot,
        });
      }
      case 'tracking_start':
        return json(route, 200, { status: 'code_sent' });
      case 'tracking_verify': {
        if (body.code !== SANDBOX_CODE) {
          return json(route, 401, {
            code: 'otp_invalid',
            message: 'auth.errors.invalid_code',
            retryable: true,
            field_errors: { code: 'auth.errors.invalid_code' },
          });
        }
        const mine = state.bookings.filter((b) => b.phone === body.phone).reverse();
        const matched = body.ticket_ref ? (mine.find((b) => b.ticket_ref === body.ticket_ref) ?? null) : null;
        return json(route, 200, {
          token: tokenFor(String(body.phone), 'tracking'),
          expires_at: exp(),
          booking_id: matched?.id ?? null,
          bookings: mine.map((b) => ({
            id: b.id,
            ticket_ref: b.ticket_ref,
            status: b.status,
            scheduled_start: b.slot?.start ?? null,
            service_label_sw: 'Usafi wa sofa',
            service_label_en: 'Sofa cleaning',
            total_tzs: b.quote.total_tzs,
            created_at: b.events[0]?.at,
          })),
        });
      }
      case 'tracking_view': {
        const token = String(body.token);
        const phone = token.replace(/^tok\.(booking|tracking)\./, '');
        if (!/^tok\.(booking|tracking)\./.test(token))
          return json(route, 401, {
            code: 'token_invalid',
            message: 'errors.token_invalid',
            retryable: false,
          });
        const b = state.bookings.find((x) => x.id === body.booking_id && x.phone === phone);
        if (!b)
          return json(route, 404, {
            code: 'booking_not_found',
            message: 'errors.booking_not_found',
            retryable: false,
          });
        const actions =
          b.status === 'AWAITING_PAYMENT'
            ? ['pay_deposit', 'cancel', 'request_reschedule']
            : b.status === 'CONFIRMED'
              ? ['cancel', 'request_reschedule']
              : b.status === 'AWAITING_REVIEW'
                ? ['cancel']
                : [];
        return json(route, 200, {
          booking: {
            id: b.id,
            ticket_ref: b.ticket_ref,
            status: b.status,
            source: 'website',
            scheduled_start: b.slot?.start ?? null,
            scheduled_end: b.slot?.end ?? null,
            duration_min: b.quote.est_duration_min,
            crew_size: b.quote.crew_size,
            flags: [],
            payment_mode: b.payment_mode,
            total_tzs: b.quote.total_tzs,
            deposit_tzs: b.quote.deposit_tzs,
            paid_tzs: b.paid_tzs,
            balance_tzs: b.quote.total_tzs - b.paid_tzs,
            locale: 'sw',
            hold_expires_at: b.hold_expires_at,
            created_at: b.events[0]?.at,
            outcome_reason: null,
            address: b.address,
            notes_customer: null,
          },
          customer: { name: b.name, phone_masked: '+25571****342' },
          items: [
            {
              label_sw: 'Usafi wa sofa',
              label_en: 'Sofa cleaning',
              qty: 1,
              amount_tzs: b.quote.total_tzs,
              requires_review: b.quote.requires_review,
            },
          ],
          quote: b.quote,
          timeline: b.events.map((e) => ({
            kind: e.kind,
            to_status: e.to_status,
            message_key: e.message_key,
            at: e.at,
            data: {},
          })),
          payments: [],
          actions,
          policy: {
            cancel_hours: 4,
            cancel_within_policy: true,
            cancel_deadline: b.slot ? new Date(Date.parse(b.slot.start) - 4 * 3_600_000).toISOString() : null,
          },
        });
      }
      case 'customer_action': {
        const b = state.bookings.find((x) => x.id === body.booking_id);
        if (!b)
          return json(route, 404, {
            code: 'booking_not_found',
            message: 'errors.booking_not_found',
            retryable: false,
          });
        if (body.action === 'cancel') {
          b.status = 'CANCELLED';
          b.events.push({
            kind: 'status_changed',
            to_status: 'CANCELLED',
            message_key: 'event.customer_cancelled',
            at: new Date().toISOString(),
          });
          return json(route, 200, {
            action: 'cancel',
            outcome: 'status_changed',
            booking_status: 'CANCELLED',
          });
        }
        b.events.push({
          kind: 'reschedule_requested',
          to_status: null,
          message_key: 'event.reschedule_requested',
          at: new Date().toISOString(),
        });
        return json(route, 200, { action: body.action, outcome: 'request_logged', booking_status: b.status });
      }
      case 'payment_start': {
        const b = state.bookings.find((x) => x.id === body.booking_id);
        if (!b || b.status !== 'AWAITING_PAYMENT')
          return json(route, 409, {
            code: 'action_not_allowed',
            message: 'tracking.error.action_not_allowed',
            retryable: false,
          });
        const id = `pay-${b.id}`;
        return json(route, 200, {
          payment_id: id,
          provider: 'MOCK',
          amount_tzs: b.quote.deposit_tzs,
          status: 'PENDING',
          instructions: {
            kind: 'mock',
            outcomes: {
              SUCCESS: 'sig-success',
              FAILED: 'sig-failed',
              EXPIRED: 'sig-expired',
              UNKNOWN: 'sig-unknown',
            },
          },
        });
      }
      case 'payment_callback': {
        const ref = String(body.provider_ref);
        const b = state.bookings.find((x) => `mock_pay-${x.id}` === ref);
        if (!b)
          return json(route, 404, {
            code: 'payment_not_found',
            message: 'errors.payment_not_found',
            retryable: false,
          });
        if (body.signature !== `sig-${String(body.outcome).toLowerCase()}`)
          return json(route, 401, {
            code: 'signature_invalid',
            message: 'errors.forbidden',
            retryable: false,
          });
        if (body.outcome === 'SUCCESS') {
          b.status = 'CONFIRMED';
          b.paid_tzs = b.quote.deposit_tzs;
          b.hold_expires_at = null;
          b.events.push({
            kind: 'payment',
            to_status: null,
            message_key: 'event.payment_received',
            at: new Date().toISOString(),
          });
          b.events.push({
            kind: 'status_changed',
            to_status: 'CONFIRMED',
            message_key: 'status.CONFIRMED',
            at: new Date().toISOString(),
          });
        }
        return json(route, 200, {
          payment_id: `pay-${b.id}`,
          status: body.outcome,
          booking_status: b.status,
        });
      }
      default:
        return json(route, 404, { code: 'not_found', message: 'errors.internal', retryable: false });
    }
  });

  return backend;
}

export const test = base.extend<{ backend: FakeBackend | null }>({
  // auto: every test gets the fake backend, whether or not it reads `backend`.
  backend: [
    async ({ page }, provide) => {
      const backend = LIVE ? null : await installFakeBackend(page);
      await provide(backend);
    },
    { auto: true },
  ],
});

export { expect };
