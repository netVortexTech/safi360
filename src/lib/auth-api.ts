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

/** Step 1: send a one-time code to a staff phone. */
export async function requestOtp(phoneE164: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneE164,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
}

/** Step 2: exchange the code for a session. The access-token hook adds tenant claims. */
export async function verifyOtp(phoneE164: string, code: string): Promise<void> {
  const { error } = await supabase.auth.verifyOtp({ phone: phoneE164, token: code, type: 'sms' });
  if (error) throw error;
}
