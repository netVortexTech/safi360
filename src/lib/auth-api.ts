import type { AuthError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/** Supabase refuses anything shorter (Auth → minimum password length). */
export const MIN_PASSWORD_LENGTH = 6;

/**
 * Whether the app can text codes right now. FALSE until Briq approves our SMS sender ID:
 * Briq refuses every send ("Sender ID is not available for this workspace"), so signup
 * skips phone confirmation and "Forgot password?" stays hidden. When the sender is
 * active: set BRIQ_SENDER_ID on the functions, turn phone confirmations back on
 * (Auth → sms_autoconfirm = false), and flip this to true.
 */
export const SMS_AVAILABLE = false;

/** i18n key for a Supabase auth failure. Never surfaces the raw provider message. */
export function authErrorKey(error: AuthError | Error | null | undefined): string {
  const msg = (error?.message ?? '').toLowerCase();
  const status = (error as AuthError | undefined)?.status;
  const code = (error as AuthError | undefined)?.code;
  if (status === 429 || msg.includes('rate limit')) return 'auth.errors.rate_limited';
  if (code === 'invalid_credentials' || msg.includes('invalid login credentials'))
    return 'auth.errors.wrong_credentials';
  if (code === 'user_already_exists' || msg.includes('already registered'))
    return 'auth.errors.already_registered';
  if (code === 'weak_password' || msg.includes('password should be')) return 'auth.errors.weak_password';
  if (code === 'phone_not_confirmed' || msg.includes('phone not confirmed'))
    return 'auth.errors.not_confirmed';
  // Reset codes never create accounts, so an unknown number is refused here.
  if (msg.includes('signups not allowed')) return 'auth.errors.no_account';
  if (msg.includes('expired')) return 'auth.errors.expired';
  if (msg.includes('invalid') || msg.includes('token')) return 'auth.errors.invalid_code';
  if (msg.includes('network') || msg.includes('fetch')) return 'errors.generic_body';
  return 'auth.errors.generic';
}

/**
 * Send a one-time sign-in code to an existing account (password reset). Never creates
 * an account: new users go through signUpWithPassword so they choose a password.
 */
export async function requestOtp(phoneE164: string): Promise<void> {
  const { error } = await supabase.auth.signInWithOtp({
    phone: phoneE164,
    options: { shouldCreateUser: false },
  });
  if (error) throw error;
}

/** Everyday sign-in: phone + password, no SMS. The access-token hook adds tenant claims. */
export async function signInWithPassword(phoneE164: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ phone: phoneE164, password });
  if (error) throw error;
}

/**
 * New account: phone + password, with an optional contact email (stored on the profile,
 * never verified). Resolves `needsCode: false` when Supabase signs the account straight
 * in (phone confirmations off), `true` when it texted a confirmation code instead.
 *
 * Phone confirmations are OFF on the live project until Briq approves our SMS sender ID:
 * a number is not proven to belong to whoever registers it. Turning them back on
 * (Auth → sms_autoconfirm = false) brings the code step back with no code change.
 */
export async function signUpWithPassword(
  phoneE164: string,
  password: string,
  contactEmail?: string,
): Promise<{ needsCode: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    phone: phoneE164,
    password,
    options: contactEmail ? { data: { contact_email: contactEmail } } : {},
  });
  if (error) throw error;
  return { needsCode: data.session == null };
}

/** Re-send the confirmation code of a signup that has not been verified yet. */
export async function resendSignupCode(phoneE164: string): Promise<void> {
  const { error } = await supabase.auth.resend({ type: 'sms', phone: phoneE164 });
  if (error) throw error;
}

/** Set a new password for the signed-in user (after a reset code, or from Settings). */
export async function updatePassword(password: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

/** Exchange an SMS code for a session: signup confirmation and password reset both use it. */
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
