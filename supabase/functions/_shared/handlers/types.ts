// Dependency interfaces for the public request handlers. The Deno entrypoints supply a
// Supabase-backed implementation (supabase-deps.ts); tests supply in-memory fakes.
import type { Catalog } from '../pricing/quote.ts';
import type { AvailabilityRule, BusyInterval, StaffMember } from '../availability/slots.ts';

export interface PublicTenantInfo {
  id: string;
  slug: string;
  name: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';
  settings: unknown;
  base_lat: number | null;
  base_lng: number | null;
}

export interface StaffData {
  staff: StaffMember[];
  availability: AvailabilityRule[];
  busy: BusyInterval[];
}

export type PublicAction = 'quote' | 'availability';

export interface PublicDeps {
  /** Throws Error('tenant_not_found') / Error('tenant_suspended'). */
  resolveTenant(slug: string): Promise<PublicTenantInfo>;
  /** Throws Error('rate_limited'). */
  rateLimit(tenantId: string, action: PublicAction): Promise<void>;
  /** Active, non-deleted catalog rows for the tenant, read fresh on every call. */
  loadCatalog(tenantId: string): Promise<Catalog>;
  /** Active staff, every availability rule, and live assignments touching [from, to]. */
  loadStaff(tenantId: string, from: string, to: string): Promise<StaffData>;
  now(): Date;
}

export interface HandlerResult {
  status: number;
  body: unknown;
}
