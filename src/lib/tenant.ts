import { useQuery } from '@tanstack/react-query';
import { tenantSettings, type TenantSettings } from '@shared/schemas';
import { useAuth } from '@/lib/auth';
import { asError } from '@/lib/errors';
import { supabase } from '@/lib/supabase';

export interface CurrentTenant {
  id: string;
  slug: string;
  name: string;
  ticket_prefix: string;
  settings: TenantSettings;
  base_lat: number | null;
  base_lng: number | null;
}

export const tenantKeys = { current: (id: string | null) => ['tenant', id] as const };

/** The signed-in staff member's tenant, read through RLS (only their own row is visible). */
export function useCurrentTenant() {
  const { claims } = useAuth();
  const id = claims.tenant_id;
  return useQuery({
    queryKey: tenantKeys.current(id),
    enabled: id != null,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<CurrentTenant> => {
      const res: { data: unknown; error: unknown } = await supabase
        .from('tenants')
        .select('id, slug, name, ticket_prefix, settings, base_lat, base_lng')
        .eq('id', id as string)
        .single();
      if (res.error) throw asError(res.error);
      const row = res.data as Omit<CurrentTenant, 'settings'> & { settings: unknown };
      return { ...row, settings: tenantSettings.parse(row.settings ?? {}) };
    },
  });
}
