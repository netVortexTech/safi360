import { createClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

// One browser client for the whole app. The anon key is public by design; every
// row the client can see is governed by RLS on the server. Customers on the portal
// never use this client for table access — they go through Edge Functions.
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
  global: {
    headers: { 'x-client-info': 'safi360-web' },
  },
});

/** Claims added by the custom access-token hook (supabase/migrations/0005). */
export interface Safi360Claims {
  tenant_id: string | null;
  /** Named tenant_role, not role: Supabase reserves `role` for the Postgres role. */
  tenant_role: 'OWNER' | 'MANAGER' | 'DISPATCHER' | 'CLEANER' | null;
  is_super_admin: boolean;
}

/** Decode the custom claims from the current session's access token (no verification — the server verifies). */
export function readClaims(accessToken: string | undefined): Safi360Claims {
  const empty: Safi360Claims = { tenant_id: null, tenant_role: null, is_super_admin: false };
  if (!accessToken) return empty;
  const payload = accessToken.split('.')[1];
  if (!payload) return empty;
  try {
    const json = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as Partial<Safi360Claims>;
    return {
      tenant_id: typeof json.tenant_id === 'string' ? json.tenant_id : null,
      tenant_role: json.tenant_role ?? null,
      is_super_admin: json.is_super_admin === true,
    };
  } catch {
    return empty;
  }
}
