// Public availability handler: the items are priced first (same engine as the quote) to
// learn duration and crew size, then getSlots() runs over live staff data.
import { getSlots, type Slot } from '../availability/slots.ts';
import { quote } from '../pricing/quote.ts';
import { availabilityRequest } from '../schemas.ts';
import { toErrorResult } from './errors.ts';
import { pricingContext, settingsOf } from './quote.ts';
import type { HandlerResult, PublicDeps } from './types.ts';

export interface AvailabilityResponse {
  duration_min: number;
  crew_size: number;
  /** Review-priced items still get slots: staff visit, then quote. */
  requires_review: boolean;
  /** An address was given and no serviceable zone matched: no slots are offered. */
  out_of_area: boolean;
  slots: Slot[];
}

export async function handleAvailability(rawBody: unknown, deps: PublicDeps): Promise<HandlerResult> {
  try {
    const input = availabilityRequest.parse(rawBody);
    const tenant = await deps.resolveTenant(input.slug);
    await deps.rateLimit(tenant.id, 'availability');
    const settings = settingsOf(tenant);
    const now = deps.now();
    const catalog = await deps.loadCatalog(tenant.id);
    const priced = quote(
      { items: input.items, address: input.address ?? null },
      catalog,
      pricingContext(tenant, settings, now),
    );

    const base: Omit<AvailabilityResponse, 'slots'> = {
      duration_min: priced.est_duration_min,
      crew_size: priced.crew_size,
      requires_review: priced.requires_review,
      out_of_area: priced.out_of_area,
    };
    if (priced.out_of_area)
      return { status: 200, body: { ...base, slots: [] } satisfies AvailabilityResponse };

    const data = await deps.loadStaff(tenant.id, input.from, input.to);
    const slots = getSlots({
      from: input.from,
      to: input.to,
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
    });
    // Public callers never learn who is free, only that someone is.
    const publicSlots = slots.map((s) => ({ ...s, staff_ids: [] }));
    return { status: 200, body: { ...base, slots: publicSlots } satisfies AvailabilityResponse };
  } catch (err) {
    return toErrorResult(err);
  }
}
