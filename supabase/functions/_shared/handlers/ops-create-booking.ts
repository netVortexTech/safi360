// Office-created booking: staff identity from the request JWT, tenant from the
// staff membership — never trusted from the body. Pricing is office-set (the
// quote comes in the payload); the RPC owns the ticket, routing and capacity
// under the tenant lock.
import { opsCreateBookingRequest, type OpsCreateBookingRequest } from '../schemas.ts';
import { toErrorResult } from './errors.ts';
import type { BookingDeps, CreateBookingResult, HandlerResult } from './types.ts';

function roleAllowed(role: string | undefined): boolean {
  return role === 'OWNER' || role === 'MANAGER' || role === 'DISPATCHER';
}

function assertQuote(q: OpsCreateBookingRequest['quote']): void {
  if (q.subtotal_tzs + q.travel_fee_tzs - q.discount_tzs + q.tax_tzs !== q.total_tzs) {
    throw Error('quote_invalid');
  }
  if (q.deposit_tzs > q.total_tzs) throw Error('quote_invalid');
}

export async function handleOpsCreateBooking(rawBody: unknown, deps: BookingDeps): Promise<HandlerResult> {
  try {
    const input = opsCreateBookingRequest.parse(rawBody);
    await deps.verifyStaffAuth();
    const role = deps.staffTenantRole();
    if (!roleAllowed(role)) throw Error('booking_forbidden');
    assertQuote(input.quote);

    const tenant = await deps.resolveTenantById(deps.staffTenantId());
    await deps.rateLimit(tenant.id, 'create_booking');

    const start = input.schedule ? new Date(input.schedule.start) : null;
    const end = input.schedule ? new Date(input.schedule.end) : null;
    if (input.schedule && (!Number.isFinite(start?.getTime()) || start! >= end!)) {
      throw Error('schedule_invalid');
    }
    if (start && start.getTime() < Date.now() - 5 * 60_000) throw Error('slot_in_past');

    const result = await deps.createBooking({
      tenant_id: tenant.id,
      idempotency_key: input.idempotency_key ?? undefined,
      source: input.source,
      locale: input.locale,
      created_by: deps.staffUserId(),
      customer: {
        phone_e164: input.customer.phone_e164,
        name: input.customer.name,
        email: input.customer.email ?? null,
        phone_verified: input.customer.phone_verified,
      },
      address: input.address
        ? {
            label: input.address.label ?? null,
            area: input.address.area ?? null,
            street: input.address.street ?? null,
            landmark: input.address.landmark ?? null,
          }
        : null,
      quote: {
        currency: 'TZS',
        subtotal_tzs: input.quote.subtotal_tzs,
        travel_fee_tzs: input.quote.travel_fee_tzs,
        discount_tzs: input.quote.discount_tzs,
        tax_tzs: input.quote.tax_tzs,
        total_tzs: input.quote.total_tzs,
        deposit_tzs: input.quote.deposit_tzs,
        balance_tzs: Math.max(input.quote.total_tzs - input.quote.deposit_tzs, 0),
        requires_review: input.quote.requires_review,
        has_estimate: input.quote.has_estimate,
        est_duration_min: input.quote.est_duration_min,
        crew_size: input.quote.crew_size,
      },
      items: input.items.map((item, index) => ({
        service_id: item.service_id ?? null,
        label_sw: item.label_sw,
        label_en: item.label_en,
        input: item.input,
        qty: item.qty,
        amount_tzs: item.amount_tzs ?? null,
        requires_review: item.requires_review,
        item_index: index,
      })),
      schedule: input.schedule
        ? { start: input.schedule.start, end: input.schedule.end, capacity: input.schedule.capacity }
        : null,
      payment_mode: input.payment_mode,
      notes_customer: input.notes_customer ?? null,
    });
    await deps.expireHolds();
    return { status: 200, body: { ...result, created: true } };
  } catch (err) {
    return toErrorResult(err);
  }
}

/** Response mirrors the customer-facing shape so one UI can render either. */
export interface OpsCreateBookingResponse extends CreateBookingResult {
  created: boolean;
}
