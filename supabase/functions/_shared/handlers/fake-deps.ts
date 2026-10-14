// In-memory PublicDeps for handler tests: a mutable catalog so "edit a service, quote
// again" can be exercised without a database.
import type { AvailabilityRule, BusyInterval, StaffMember } from '../availability/slots.ts';
import { FIXTURE_ADDONS, FIXTURE_BASE, FIXTURE_SERVICES, FIXTURE_TENANT_ID, FIXTURE_ZONES } from '../pricing/fixtures.ts';
import type { Catalog } from '../pricing/quote.ts';
import type { PublicDeps, PublicTenantInfo, StaffData } from './types.ts';

export interface FakeWorld {
  tenants: PublicTenantInfo[];
  catalog: Catalog;
  staff: StaffData;
  now: Date;
  /** Calls per tenant+action, so tests can assert the limiter was consulted. */
  rateLimitCalls: string[];
  rateLimited: boolean;
}

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
    staff: { staff: [], availability: [], busy: [] },
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
