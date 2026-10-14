// Service-role client for Edge Functions. Bypasses RLS — only ever used server-side,
// after the request has been validated and the tenant resolved from a trusted source.
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export function adminClient(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('missing_supabase_env');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
