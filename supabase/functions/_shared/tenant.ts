// Resolve the tenant for a public (anonymous) request from the URL slug.
// Public Edge Functions never trust a tenant_id from the client.
import type { SupabaseClient } from '@supabase/supabase-js';
import { tenantSlug } from './schemas.ts';

export interface PublicTenant {
  id: string;
  slug: string;
  name: string;
  status: 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'SUSPENDED';
  branding: Record<string, unknown>;
  settings: Record<string, unknown>;
  base_lat: number | null;
  base_lng: number | null;
}

export class TenantNotFound extends Error {
  constructor() {
    super('tenant_not_found');
  }
}

export class TenantSuspended extends Error {
  constructor() {
    super('tenant_suspended');
  }
}

/** Look up a tenant by slug with the service-role client. Suspended tenants are refused. */
export async function resolveTenantBySlug(admin: SupabaseClient, rawSlug: string): Promise<PublicTenant> {
  const slug = tenantSlug.parse(rawSlug);
  const { data, error } = await admin
    .from('tenants')
    .select('id, slug, name, status, branding, settings, base_lat, base_lng')
    .eq('slug', slug)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new TenantNotFound();
  if (data.status === 'SUSPENDED') throw new TenantSuspended();
  return data as PublicTenant;
}

/** Same lookup by id, for staff sessions whose tenant comes from the JWT claims. */
export async function resolveTenantById(admin: SupabaseClient, tenantId: string): Promise<PublicTenant> {
  const { data, error } = await admin
    .from('tenants')
    .select('id, slug, name, status, branding, settings, base_lat, base_lng')
    .eq('id', tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new TenantNotFound();
  if (data.status === 'SUSPENDED') throw new TenantSuspended();
  return data as PublicTenant;
}
