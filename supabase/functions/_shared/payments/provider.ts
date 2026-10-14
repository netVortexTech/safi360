// Payment providers behind one interface. Phase 2 ships the Mock adapter only, selected
// explicitly outside production. Real adapters (Selcom, AzamPay) arrive in Phase 5 and
// plug into the same two calls: start an intent, verify a callback.
//
// Rule: a payment's status only ever changes from a verified callback (or reconciliation)
// through apply_payment_result(). The adapter's job is to prove the callback is genuine.
import { hmac, timingSafeEqual } from '../otp.ts';

export type PaymentOutcome = 'SUCCESS' | 'FAILED' | 'EXPIRED' | 'UNKNOWN';

export interface PaymentIntent {
  payment_id: string;
  booking_id: string;
  ticket_ref: string;
  amount_tzs: number;
  phone: string;
  locale: 'sw' | 'en';
}

export interface PaymentStartResult {
  provider_ref: string;
  /** What the portal shows next: a redirect, a USSD prompt, or the sandbox chooser. */
  instructions:
    | { kind: 'redirect'; url: string }
    | { kind: 'push'; message_key: string }
    | { kind: 'mock'; outcomes: Record<PaymentOutcome, string> };
}

export interface VerifiedCallback {
  provider_ref: string;
  status: PaymentOutcome;
  raw: Record<string, unknown>;
}

export interface PaymentProvider {
  readonly id: 'MOCK' | 'SELCOM' | 'AZAMPAY';
  start(intent: PaymentIntent): Promise<PaymentStartResult>;
  /** Throws Error('signature_invalid') when the callback is not genuine. */
  verifyCallback(body: unknown): Promise<VerifiedCallback>;
}

/**
 * Sandbox adapter. `start` hands the portal one signed token per outcome; the tester picks
 * one and the portal posts it to payment_callback, which verifies the signature exactly like
 * a real provider webhook. The secret never leaves the function runtime.
 */
export class MockPaymentProvider implements PaymentProvider {
  readonly id = 'MOCK' as const;
  constructor(private readonly secret: string) {}

  private sign(ref: string, outcome: PaymentOutcome): Promise<string> {
    return hmac(this.secret, `${ref}:${outcome}`);
  }

  async start(intent: PaymentIntent): Promise<PaymentStartResult> {
    const ref = `mock_${intent.payment_id}`;
    const outcomes = {} as Record<PaymentOutcome, string>;
    for (const o of ['SUCCESS', 'FAILED', 'EXPIRED', 'UNKNOWN'] as const)
      outcomes[o] = await this.sign(ref, o);
    return { provider_ref: ref, instructions: { kind: 'mock', outcomes } };
  }

  async verifyCallback(body: unknown): Promise<VerifiedCallback> {
    const b = (body ?? {}) as { provider_ref?: unknown; outcome?: unknown; signature?: unknown };
    const ref = typeof b.provider_ref === 'string' ? b.provider_ref : '';
    const outcome = b.outcome as PaymentOutcome;
    const signature = typeof b.signature === 'string' ? b.signature : '';
    if (!ref || !['SUCCESS', 'FAILED', 'EXPIRED', 'UNKNOWN'].includes(outcome))
      throw new Error('signature_invalid');
    if (!timingSafeEqual(await this.sign(ref, outcome), signature)) throw new Error('signature_invalid');
    return { provider_ref: ref, status: outcome, raw: { outcome, mock: true } };
  }
}

export function paymentProviderFromEnv(env: {
  PAYMENT_PROVIDER?: string | undefined;
  MOCK_PAYMENT_SECRET?: string | undefined;
  APP_ENV?: string | undefined;
}): PaymentProvider | null {
  const provider = (env.PAYMENT_PROVIDER ?? '').toLowerCase();
  if (provider === 'mock') {
    if (env.APP_ENV === 'production' || !env.MOCK_PAYMENT_SECRET) return null;
    return new MockPaymentProvider(env.MOCK_PAYMENT_SECRET);
  }
  return null;
}
