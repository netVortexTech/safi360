import type { AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/** i18n key for a Supabase auth failure. Never surfaces the raw provider message. */
export function authErrorKey(error: AuthError | Error | null | undefined): string {
  const msg = (error?.message ?? '').toLowerCase();
  const status = (error as AuthError | undefined)?.status;
  if (status === 429 || msg.includes('rate limit')) return 'auth.errors.rate_limited';
  if (msg.includes('expired')) return 'auth.errors.expired';
  if (msg.includes('invalid') || msg.includes('token')) return 'auth.errors.invalid_code';
  if (msg.includes('network') || msg.includes('fetch')) return 'errors.generic_body';
  return 'auth.errors.generic';
}

/**
 * Step 1: send a one-time code to a staff phone.
 * `shouldCreateUser` is false for office portals (a tenant must have added you first).
 * The cleaner app passes true so a new employee can create their account, then the
 * office links them to the company under Settings → Staff.
 */
export async function requestOtp(phoneE164: string, options?: { shouldCreateUser?: boolean }): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneE164,
    options: { shouldCreateUser: options?.shouldCreateUser ?? false },
  });
  if (error) throw error;
}

/** Step 2: exchange the code for a session. The access-token hook adds tenant claims. */
export async function verifyOtp(phoneE164: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone: phoneE164, token: code, type: 'sms' });
  if (error) throw error;
}

/**
 * Link the signed-in user to a staff roster row added by the office (matched by phone)
 * and grant the CLEANER membership.
 *
 * The session is ALWAYS refreshed afterwards, not only when a roster row was claimed:
 * the office may have granted access directly (Settings → Team), in which case there is
 * nothing left to claim but the current token still carries the old, empty tenant claims.
 * Without this refresh the employee stays stuck on the "no company yet" screen until they
 * sign out and back in. Returns true when a roster invite was actually claimed.
 */
export async function claimStaffInvite(): Promise<boolean> {
  let claimed = false;
  const res: { data: unknown; error: { message: string } | null } = await supabase.rpc('claim_staff_invite');
  if (!res.error) claimed = Boolean(res.data);
  // Best-effort: a failed refresh just leaves the existing (still valid) token in place.
  await supabase.auth.refreshSession();
  return claimed;
}

/**
 * Re-mint the access token and let the auth listener pick up any new tenant claims. Used
 * by the cleaner app's "check again" so access granted while the screen was open appears
 * without signing out. Never claims a roster invite — see claimStaffInvite for that.
 */
export async function refreshSessionClaims(): Promise<void> {
  await supabase.auth.refreshSession();
}
