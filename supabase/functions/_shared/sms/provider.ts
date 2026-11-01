// SMS delivery behind one interface. OTP_PROVIDER picks the adapter: `briq` sends through
// Briq (karibu.briq.tz), `mock` is the sandbox stand-in and is refused in production.
// Without a configured provider the OTP functions fail closed (503 sms_not_configured)
// rather than pretend.
import { log } from '../log.ts';
import { SANDBOX_OTP_CODE } from '../otp.ts';

export interface SmsMessage {
  to: string; // E.164
  text: string;
  locale: 'sw' | 'en';
}

export interface SmsProvider {
  readonly id: 'MOCK' | 'BRIQ' | 'AFRICASTALKING' | 'BEEM';
  /** True when the provider substitutes a fixed test code for the real one. */
  readonly fixedCode: string | null;
  send(message: SmsMessage): Promise<{ ok: boolean; provider_ref?: string }>;
}

/** Logs the (masked) message and "delivers" the sandbox code. Nothing leaves the process. */
export class MockSmsProvider implements SmsProvider {
  readonly id = 'MOCK' as const;
  readonly fixedCode = SANDBOX_OTP_CODE;
  readonly sent: SmsMessage[] = [];

  send(message: SmsMessage): Promise<{ ok: boolean; provider_ref?: string }> {
    this.sent.push(message);
    log.info('sms_mock_sent', { to: message.to, locale: message.locale });
    return Promise.resolve({ ok: true, provider_ref: `mock_${this.sent.length}` });
  }
}

export const BRIQ_SEND_URL = 'https://karibu.briq.tz/v1/message/send-instant';

/**
 * Briq instant SMS. POST { content, recipients: [msisdn], sender_id } with X-API-Key; a
 * 200 with success: true carries a job_id. The sender ID must be registered and active
 * on the Briq account. The API key never reaches a log line.
 */
export class BriqSmsProvider implements SmsProvider {
  readonly id = 'BRIQ' as const;
  readonly fixedCode = null;
  constructor(
    private readonly apiKey: string,
    private readonly senderId: string,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async send(message: SmsMessage): Promise<{ ok: boolean; provider_ref?: string }> {
    let res: Response;
    try {
      res = await this.fetchFn(BRIQ_SEND_URL, {
        method: 'POST',
        headers: { 'X-API-Key': this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: message.text,
          // Briq takes digits with the country code; strip the E.164 '+'.
          recipients: [message.to.replace(/^\+/, '')],
          sender_id: this.senderId,
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err) {
      log.error('sms_briq_unreachable', { message: err instanceof Error ? err.message : 'unknown' });
      return { ok: false };
    }
    const body = (await res.json().catch(() => null)) as {
      success?: unknown;
      job_id?: unknown;
      errors?: { code?: unknown }[] | null;
    } | null;
    if (!res.ok || body?.success !== true) {
      log.error('sms_briq_rejected', {
        to: message.to,
        status: res.status,
        code: body?.errors?.[0]?.code ?? null,
      });
      return { ok: false };
    }
    const ref = typeof body.job_id === 'string' ? body.job_id : undefined;
    log.info('sms_briq_sent', { to: message.to, job_id: ref ?? null });
    return ref ? { ok: true, provider_ref: ref } : { ok: true };
  }
}

/** Resolve the provider from function secrets. `mock` is refused in production. */
export function smsProviderFromEnv(env: {
  OTP_PROVIDER?: string | undefined;
  APP_ENV?: string | undefined;
  BRIQ_API_KEY?: string | undefined;
  BRIQ_SENDER_ID?: string | undefined;
}): SmsProvider | null {
  const provider = (env.OTP_PROVIDER ?? '').toLowerCase();
  if (provider === 'mock') {
    if (env.APP_ENV === 'production') return null;
    return new MockSmsProvider();
  }
  if (provider === 'briq') {
    if (!env.BRIQ_API_KEY || !env.BRIQ_SENDER_ID) return null;
    return new BriqSmsProvider(env.BRIQ_API_KEY, env.BRIQ_SENDER_ID);
  }
  return null;
}

/** Staff sign-in code (Supabase Auth send-SMS hook). Bilingual: the user's locale is unknown here. */
export function loginSmsText(code: string): string {
  return `${code} ni msimbo wako wa kuingia Safi360 / is your Safi360 sign-in code. Usimpe mtu yeyote. Don't share it.`;
}

export function otpSmsText(code: string, tenantName: string, locale: 'sw' | 'en'): string {
  return locale === 'en'
    ? `${code} is your ${tenantName} verification code. It expires in 5 minutes.`
    : `${code} ni msimbo wako wa uthibitisho wa ${tenantName}. Unaisha baada ya dakika 5.`;
}
