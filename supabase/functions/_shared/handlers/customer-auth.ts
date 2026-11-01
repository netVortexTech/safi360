// Client accounts at one business: sign up (phone, password, optional name/email) or sign
// in (phone + password). Replaces the SMS code step while the Briq sender ID is pending.
// Answers exactly like tracking_verify — a customer token plus the phone's bookings — so the
// booking, tracking, action and payment functions accept it unchanged.
import { signToken } from '../otp.ts';
import { dummyVerify, hashPassword, verifyPassword } from '../password.ts';
import { customerAuthRequest } from '../schemas.ts';
import { toErrorResult } from './errors.ts';
import { summarise, type TrackingVerifyResponse } from './tracking.ts';
import type { BookingDeps, HandlerResult } from './types.ts';

/** A signed-in client stays signed in for a working day on that tab. */
export const ACCOUNT_TOKEN_TTL_MS = 12 * 3_600_000;

export interface CustomerAccountStore {
  /** customer_register(): throws Error('already_registered' | 'name_required'). */
  register(input: {
    tenant_id: string;
    phone: string;
    name: string | null;
    email: string | null;
    locale: 'sw' | 'en';
    password_hash: string;
  }): Promise<void>;
  /** The stored hash, or null when the phone has no account at this business. */
  passwordHash(tenantId: string, phone: string): Promise<string | null>;
}

export type CustomerAuthDeps = Pick<
  BookingDeps,
  'resolveTenant' | 'rateLimit' | 'rateLimitPhone' | 'bookingsForPhone' | 'now' | 'env'
> & { accounts: CustomerAccountStore };

export type CustomerAuthResponse = TrackingVerifyResponse;

export async function handleCustomerAuth(rawBody: unknown, deps: CustomerAuthDeps): Promise<HandlerResult> {
  try {
    const input = customerAuthRequest.parse(rawBody);
    const tenant = await deps.resolveTenant(input.slug);
    await deps.rateLimit(tenant.id, 'customer_auth_ip');
    await deps.rateLimitPhone(tenant.id, 'customer_auth', input.phone);

    if (input.action === 'signup') {
      await deps.accounts.register({
        tenant_id: tenant.id,
        phone: input.phone,
        name: input.name ?? null,
        email: input.email ?? null,
        locale: input.locale,
        password_hash: await hashPassword(input.password),
      });
    } else {
      const stored = await deps.accounts.passwordHash(tenant.id, input.phone);
      if (stored == null) {
        await dummyVerify(input.password);
        throw new Error('wrong_credentials');
      }
      if (!(await verifyPassword(input.password, stored))) throw new Error('wrong_credentials');
    }

    const exp = deps.now().getTime() + ACCOUNT_TOKEN_TTL_MS;
    // purpose 'booking': create_booking requires it, tracking/action/payment accept it.
    const token = await signToken(
      { tenant_id: tenant.id, phone: input.phone, purpose: 'booking', exp },
      deps.env.tokenSecret,
    );
    const bookings = await deps.bookingsForPhone(tenant.id, input.phone);
    const matched = input.ticket_ref
      ? (bookings.find((b) => b.ticket_ref === input.ticket_ref) ?? null)
      : null;
    const body: CustomerAuthResponse = {
      token,
      expires_at: new Date(exp).toISOString(),
      booking_id: matched?.id ?? null,
      bookings: bookings.map(summarise),
    };
    return { status: 200, body };
  } catch (err) {
    return toErrorResult(err);
  }
}
