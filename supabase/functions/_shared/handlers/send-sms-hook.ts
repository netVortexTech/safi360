// Supabase Auth "Send SMS" hook: GoTrue hands us the staff sign-in code and we deliver it
// through our own SMS provider (Briq) instead of Twilio. Runtime-neutral so Vitest can run
// it; the Deno entrypoint is functions/send_sms_hook/index.ts.
//
// GoTrue signs every call with Standard Webhooks: headers webhook-id, webhook-timestamp and
// webhook-signature ("v1,<base64 HMAC-SHA256 of `${id}.${timestamp}.${body}`>", possibly
// several, space separated). The secret is shown in the dashboard as "v1,whsec_<base64>".
import { timingSafeEqual } from '../otp.ts';
import { loginSmsText, type SmsProvider } from '../sms/provider.ts';

/** Reject replays and clock-skewed calls older or newer than this. */
const TOLERANCE_SEC = 5 * 60;

export interface SendSmsHookDeps {
  /** "v1,whsec_<base64>" (or the bare base64 part). */
  secret: string | undefined;
  sms: SmsProvider | null;
  now: () => Date;
}

export interface HookResult {
  status: number;
  body: Record<string, unknown>;
}

const fail = (status: number, message: string): HookResult => ({
  status,
  body: { error: { http_code: status, message } },
});

function base64ToBytes(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

/** True when the Standard Webhooks signature over the raw body is genuine and fresh. */
export async function verifyWebhook(
  secret: string,
  headers: Headers,
  rawBody: string,
  now: Date,
): Promise<boolean> {
  const id = headers.get('webhook-id');
  const timestamp = headers.get('webhook-timestamp');
  const signatures = headers.get('webhook-signature');
  if (!id || !timestamp || !signatures) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(now.getTime() / 1000 - ts) > TOLERANCE_SEC) return false;

  let keyBytes: Uint8Array<ArrayBuffer>;
  try {
    keyBytes = base64ToBytes(secret.replace(/^v1,/, '').replace(/^whsec_/, ''));
  } catch {
    return false;
  }
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${id}.${timestamp}.${rawBody}`),
  );
  const expected = bytesToBase64(new Uint8Array(mac));
  return signatures
    .split(' ')
    .map((s) => s.split(',', 2))
    .some(([version, sig]) => version === 'v1' && sig != null && timingSafeEqual(sig, expected));
}

export async function handleSendSmsHook(
  rawBody: string,
  headers: Headers,
  deps: SendSmsHookDeps,
): Promise<HookResult> {
  if (!deps.secret) return fail(500, 'hook_secret_missing');
  if (!(await verifyWebhook(deps.secret, headers, rawBody, deps.now()))) {
    return fail(401, 'signature_invalid');
  }
  if (!deps.sms) return fail(503, 'sms_not_configured');

  let payload: { user?: { phone?: unknown }; sms?: { otp?: unknown } };
  try {
    payload = JSON.parse(rawBody) as typeof payload;
  } catch {
    return fail(400, 'invalid_payload');
  }
  const digits = typeof payload.user?.phone === 'string' ? payload.user.phone.replace(/\D/g, '') : '';
  const otp = typeof payload.sms?.otp === 'string' ? payload.sms.otp : '';
  if (!digits || !otp) return fail(400, 'invalid_payload');

  const sent = await deps.sms.send({ to: `+${digits}`, text: loginSmsText(otp), locale: 'sw' });
  return sent.ok ? { status: 200, body: {} } : fail(502, 'sms_send_failed');
}
