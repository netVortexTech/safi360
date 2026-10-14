// SMS delivery behind one interface. Phase 2 ships only the Mock adapter, which is
// selected explicitly with OTP_PROVIDER=mock and never in production. Without a
// provider the OTP functions fail closed (503 sms_not_configured) rather than pretend.
import { log } from '../log.ts';
import { SANDBOX_OTP_CODE } from '../otp.ts';

export interface SmsMessage {
  to: string; // E.164
  text: string;
  locale: 'sw' | 'en';
}

export interface SmsProvider {
  readonly id: 'MOCK' | 'AFRICASTALKING' | 'BEEM';
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

/** Resolve the provider from function secrets. `mock` is refused in production. */
export function smsProviderFromEnv(env: {
  OTP_PROVIDER?: string | undefined;
  APP_ENV?: string | undefined;
}): SmsProvider | null {
  const provider = (env.OTP_PROVIDER ?? '').toLowerCase();
  if (provider === 'mock') {
    if (env.APP_ENV === 'production') return null;
    return new MockSmsProvider();
  }
  return null;
}

export function otpSmsText(code: string, tenantName: string, locale: 'sw' | 'en'): string {
  return locale === 'en'
    ? `${code} is your ${tenantName} verification code. It expires in 5 minutes.`
    : `${code} ni msimbo wako wa uthibitisho wa ${tenantName}. Unaisha baada ya dakika 5.`;
}
