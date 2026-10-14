// Supabase-backed PublicDeps used by the Deno entrypoints. Runs with the service role
// after the tenant has been resolved from the slug; never trusts client tenant ids.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AvailabilityRule, BusyInterval, StaffMember } from '../availability/slots.ts';
import type { Catalog } from '../pricing/quote.ts';
import type { CatalogAddon, CatalogService, CatalogZone } from '../pricing/types.ts';
import { callerIdFrom, enforceRateLimit, RATE_LIMITS } from '../rate-limit.ts';
import { resolveTenantBySlug } from '../tenant.ts';
import type { PublicAction, PublicDeps, StaffData } from './types.ts';

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

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
      const [staff, availability, busy] = await Promise.all([
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
          .lt('starts_at', `${to}T23:59:59+03:00`)
          .gt('ends_at', `${from}T00:00:00+03:00`),
      ]);
      return {
        staff: unwrap<StaffMember[]>(staff),
        availability: unwrap<AvailabilityRule[]>(availability),
        busy: unwrap<BusyInterval[]>(busy),
      };
    },

    now: () => new Date(),
  };
}
