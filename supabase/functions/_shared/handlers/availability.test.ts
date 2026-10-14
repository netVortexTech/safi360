import { describe, expect, it } from 'vitest';
import { SERVICE_IDS } from '../pricing/fixtures.ts';
import type { ApiError } from '../schemas.ts';
import { handleAvailability, type AvailabilityResponse } from './availability.ts';
import { busyAt, fakeDeps, fakeWorld, leaveRule, staffMember, weeklyRule } from './fake-deps.ts';

const NEEMA = 'neema';
const REHEMA = 'rehema';

function world() {
  return fakeWorld({
    staff: {
      staff: [staffMember(NEEMA, [SERVICE_IDS.sofa, SERVICE_IDS.fumigation]), staffMember(REHEMA, [SERVICE_IDS.sofa])],
      availability: [weeklyRule(REHEMA, 5, '08:00', '12:00'), leaveRule(NEEMA, '2026-10-17')],
      busy: [busyAt(NEEMA, '2026-10-16T06:00:00Z', '2026-10-16T09:00:00Z')],
    },
  });
}

const sofa5 = { service_id: SERVICE_IDS.sofa, qty: 5 };
const base = { slug: 'usafi-bora', from: '2026-10-16', to: '2026-10-17' };

describe('handleAvailability', () => {
  it('returns slots for the priced duration without exposing staff ids', async () => {
    const res = await handleAvailability({ ...base, items: [sofa5] }, fakeDeps(world()));
    expect(res.status).toBe(200);
    const body = res.body as AvailabilityResponse;
    expect(body.duration_min).toBe(135);
    expect(body.crew_size).toBe(1);
    expect(body.requires_review).toBe(false);
    expect(body.out_of_area).toBe(false);
    expect(body.slots.length).toBeGreaterThan(0);
    for (const s of body.slots) {
      expect(s.staff_ids).toEqual([]);
      expect(s.capacity).toBeGreaterThanOrEqual(1);
    }
  });

  it('never offers a slot overlapping an assignment or leave', async () => {
    const res = await handleAvailability({ ...base, items: [{ service_id: SERVICE_IDS.fumigation }] }, fakeDeps(world()));
    const body = res.body as AvailabilityResponse;
    // Only Neema can fumigate: busy 09:00–12:00 Dar on the 16th (+45 min buffer), on leave the 17th.
    expect(body.slots.every((s) => s.date === '2026-10-16')).toBe(true);
    for (const s of body.slots) {
      const start = Date.parse(s.start);
      const end = Date.parse(s.end);
      const blockedStart = Date.parse('2026-10-16T06:00:00Z') - 45 * 60_000;
      const blockedEnd = Date.parse('2026-10-16T09:00:00Z') + 45 * 60_000;
      expect(start < blockedEnd && blockedStart < end).toBe(false);
    }
  });

  it('respects weekly hours and crew size', async () => {
    const w = world();
    w.staff.busy = [];
    const two = await handleAvailability({ ...base, items: [sofa5], from: '2026-10-16', to: '2026-10-16' }, fakeDeps(w));
    const body = two.body as AvailabilityResponse;
    // Rehema only works Fri 08:00–12:00; 135-min jobs → capacity 2 only for the 08:00 and 09:00 starts.
    const capacity2 = body.slots.filter((s) => s.capacity === 2).map((s) => s.start.slice(11, 16));
    expect(capacity2).toEqual(['05:00', '06:00']);
  });

  it('returns no slots outside the service area', async () => {
    const res = await handleAvailability({ ...base, items: [sofa5], address: { area: 'Dodoma' } }, fakeDeps(world()));
    const body = res.body as AvailabilityResponse;
    expect(body.out_of_area).toBe(true);
    expect(body.slots).toEqual([]);
  });

  it('validates dates and ranges', async () => {
    const bad = await handleAvailability({ ...base, items: [sofa5], from: '16/10/2026' }, fakeDeps(world()));
    expect(bad.status).toBe(422);
    expect((bad.body as ApiError).field_errors).toEqual({ from: 'validation.date.format' });
    const backwards = await handleAvailability({ ...base, items: [sofa5], from: '2026-10-18' }, fakeDeps(world()));
    expect(backwards.status).toBe(422);
    expect((backwards.body as ApiError).code).toBe('range_invalid');
  });

  it('prices first, so catalog problems surface as 422 before any staff lookup', async () => {
    const res = await handleAvailability({ ...base, items: [{ service_id: SERVICE_IDS.carpet }] }, fakeDeps(world()));
    expect(res.status).toBe(422);
    expect((res.body as ApiError).code).toBe('variant_required');
  });

  it('applies the rate limit per tenant and action', async () => {
    const w = world();
    await handleAvailability({ ...base, items: [sofa5] }, fakeDeps(w));
    expect(w.rateLimitCalls).toEqual([`${w.tenants[0]?.id}:availability`]);
    const limited = await handleAvailability({ ...base, items: [sofa5] }, fakeDeps(fakeWorld({ rateLimited: true })));
    expect(limited.status).toBe(429);
  });
});
