// Fixed-window rate limiting backed by the public.rate_limits table (migration 0003).
// Used by every public Edge Function, keyed by tenant + action + caller (IP or phone).
import type { SupabaseClient } from '@supabase/supabase-js';

export interface RateLimitRule {
  action: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  quote: { action: 'quote', limit: 60, windowSeconds: 60 },
  create_booking: { action: 'create_booking', limit: 10, windowSeconds: 600 },
  track_request_code: { action: 'track_request_code', limit: 5, windowSeconds: 600 },
  track_verify_code: { action: 'track_verify_code', limit: 10, windowSeconds: 600 },
  payment_start: { action: 'payment_start', limit: 10, windowSeconds: 600 },
} as const satisfies Record<string, RateLimitRule>;

/** Throws Error('rate_limited') when the caller exceeds the rule. */
export async function enforceRateLimit(
  admin: SupabaseClient,
  rule: RateLimitRule,
  tenantId: string,
  caller: string,
): Promise<void> {
  const { data, error } = await admin.rpc('app_rate_limit_hit', {
    p_tenant_id: tenantId,
    p_action: rule.action,
    p_caller: caller,
    p_limit: rule.limit,
    p_window_seconds: rule.windowSeconds,
  });
  if (error) throw error;
  if (data !== true) throw new Error('rate_limited');
}

/** Best-effort client identifier for anonymous callers. */
export function callerIdFrom(req: Request): string {
  const xff = req.headers.get('x-forwarded-for');
  const ip = xff
    ? (xff.split(',')[0]?.trim() ?? 'unknown')
    : (req.headers.get('cf-connecting-ip') ?? 'unknown');
  return `ip:${ip}`;
}
