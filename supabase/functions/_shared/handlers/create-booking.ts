// Public create_booking: verified phone → fresh server price → slot re-check → one RPC.
// The RPC (create_booking_tx) owns idempotency, the ticket, routing and the capacity check
// under the tenant lock; this handler prepares an honest payload for it.
import { getSlots } from '../availability/slots.ts';
import { verifyToken } from '../otp.ts';
import { quote } from '../pricing/quote.ts';
import type { QuoteResult } from '../pricing/types.ts';
import { createBookingRequest, type CreateBookingRequest } from '../schemas.ts';
import { errorResult, toErrorResult } from './errors.ts';
import { pricingContext, settingsOf } from './quote.ts';
import type { BookingDeps, CreateBookingResult, HandlerResult } from './types.ts';

export interface CreateBookingResponse extends CreateBookingResult {
  quote: QuoteResult;
  schedule: { start: string; end: string } | null;
}

const DAR_OFFSET_MS = 3 * 3_600_000;

/** Dar es Salaam calendar date of an instant. */
export function darDateKey(instant: Date): string {
  return new Date(instant.getTime() + DAR_OFFSET_MS).toISOString().slice(0, 10);
}

/** Per-item amounts for the booking_items rows, derived from the priced lines. */
export function itemRows(
  input: CreateBookingRequest,
  priced: QuoteResult,
  labels: Map<string, { sw: string; en: string }>,
) {
  return input.items.map((item, index) => {
    const lines = priced.lines.filter((l) => l.item_index === index);
    const review = lines.some((l) => l.requires_review);
    const amount = review ? null : lines.reduce((sum, l) => sum + (l.amount_tzs ?? 0), 0);
    const label = labels.get(item.service_id) ?? { sw: '', en: '' };
    const qty = item.qty ?? 1;
    return {
      service_id: item.service_id,
      label_sw: label.sw,
      label_en: label.en,
      input: item,
      qty,
      amount_tzs: amount,
      requires_review: review,
    };
  });
}

export async function handleCreateBooking(rawBody: unknown, deps: BookingDeps): Promise<HandlerResult> {
  try {
    const input = createBookingRequest.parse(rawBody);
    const tenant = await deps.resolveTenant(input.slug);
    await deps.rateLimit(tenant.id, 'create_booking');
    const now = deps.now();

    const token = await verifyToken(input.verify_token, deps.env.tokenSecret, now);
    if (token.tenant_id !== tenant.id || token.purpose !== 'booking') throw new Error('phone_not_verified');

    const settings = settingsOf(tenant);
    const catalog = await deps.loadCatalog(tenant.id);
    const address = input.address
      ? { lat: input.address.lat, lng: input.address.lng, area: input.address.area }
      : null;
    const priced = quote({ items: input.items, address }, catalog, pricingContext(tenant, settings, now));
    if (priced.out_of_area) throw new Error('out_of_area');
    if (
      input.expected_total_tzs != null &&
      !priced.requires_review &&
      priced.total_tzs !== input.expected_total_tzs
    ) {
      return {
        status: 409,
        body: {
          ...(errorResult('quote_changed', 'booking.error.quote_changed', 409, { retryable: true })
            .body as object),
          quote: priced,
        },
      };
    }

    // The slot: required unless a human prices the job first.
    let schedule: { start: string; end: string; capacity: number } | null = null;
    if (input.slot) {
      const start = new Date(input.slot.start);
      if (Number.isNaN(start.getTime())) throw new Error('slot_required');
      if (start.getTime() < now.getTime()) throw new Error('slot_in_past');
      const day = darDateKey(start);
      const data = await deps.loadStaff(tenant.id, day, day);
      const slots = getSlots({
        from: day,
        to: day,
        duration_min: priced.est_duration_min,
        crew_size: priced.crew_size,
        required_service_ids: input.items.map((i) => i.service_id),
        working_hours: settings.working_hours,
        travel_buffer_min: settings.travel_buffer_min,
        slot_step_min: settings.slot_step_min,
        min_lead_min: settings.min_lead_minutes,
        now,
        staff: data.staff,
        availability: data.availability,
        busy: data.busy,
        reserved: data.reserved,
      });
      const match = slots.find((s) => Date.parse(s.start) === start.getTime());
      if (!match) {
        if (!priced.requires_review) throw new Error('slot_unavailable');
      } else {
        schedule = { start: match.start, end: match.end, capacity: match.capacity };
      }
    } else if (!priced.requires_review) {
      throw new Error('slot_required');
    }

    const labels = new Map(catalog.services.map((s) => [s.id, { sw: s.name_sw, en: s.name_en }]));
    const payload = {
      tenant_id: tenant.id,
      idempotency_key: input.idempotency_key,
      source: input.source,
      locale: input.locale,
      created_by: null,
      customer: {
        phone_e164: token.phone,
        name: input.customer.name,
        email: input.customer.email ?? null,
        phone_verified: true,
      },
      address: input.address ?? null,
      quote: priced,
      items: itemRows(input, priced, labels),
      schedule,
      payment_mode: input.payment_mode,
      notes_customer: input.notes ?? null,
    };
    const result = await deps.createBooking(payload);
    try {
      await deps.expireHolds();
    } catch {
      // Hold expiry is a courtesy here; the reserving predicate already ignores lapsed holds.
    }
    const body: CreateBookingResponse = {
      ...result,
      quote: priced,
      schedule: schedule ? { start: schedule.start, end: schedule.end } : null,
    };
    return { status: result.created ? 201 : 200, body };
  } catch (err) {
    return toErrorResult(err);
  }
}
