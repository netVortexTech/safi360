// Customer one-time codes: issue (hashed, 5-minute, retires earlier codes), verify
// (atomic attempt counting, constant-time compare) and the short-lived token that proves
// a phone for booking or tracking. The code never appears in a response or a log line.
import {
  hashCode,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  randomCode,
  randomSalt,
  signToken,
  timingSafeEqual,
  TOKEN_TTL_MS,
  type OtpPurpose,
} from '../otp.ts';
import { otpSendRequest, otpVerifyRequest } from '../schemas.ts';
import { otpSmsText } from '../sms/provider.ts';
import { errorResult, toErrorResult } from './errors.ts';
import type { BookingDeps, CustomerOtpRow, HandlerResult, PublicTenantInfo } from './types.ts';

export interface OtpSendResponse {
  status: 'code_sent';
  expires_at: string;
  /** True when the Mock adapter is in use: the portal shows the Sandbox badge and the fixed code. */
  sandbox: boolean;
}

export interface OtpVerifyResponse {
  token: string;
  expires_at: string;
}

/** Thrown on a wrong code so the handler can report attempts left without leaking anything else. */
export class OtpInvalidError extends Error {
  constructor(readonly attemptsLeft: number) {
    super('otp_invalid');
    this.name = 'OtpInvalidError';
  }
}

export async function issueOtp(
  deps: BookingDeps,
  tenant: PublicTenantInfo,
  phone: string,
  purpose: OtpPurpose,
  locale: 'sw' | 'en',
  scope: Record<string, unknown> = {},
): Promise<{ expires_at: string; sandbox: boolean }> {
  if (!deps.sms) throw new Error('sms_not_configured');
  const code = deps.sms.fixedCode ?? randomCode();
  const salt = randomSalt();
  const expires_at = new Date(deps.now().getTime() + OTP_TTL_MS).toISOString();
  await deps.otp.issue({
    tenant_id: tenant.id,
    phone_e164: phone,
    purpose,
    code_hash: await hashCode(code, salt),
    salt,
    expires_at,
    scope,
  });
  const sent = await deps.sms.send({ to: phone, text: otpSmsText(code, tenant.name, locale), locale });
  if (!sent.ok) throw new Error('sms_not_configured');
  return { expires_at, sandbox: deps.sms.fixedCode != null };
}

/** Spend an attempt and compare. Resolves with the consumed row; throws otp_* otherwise. */
export async function verifyOtpCode(
  deps: BookingDeps,
  tenantId: string,
  phone: string,
  purpose: OtpPurpose,
  code: string,
): Promise<CustomerOtpRow> {
  await deps.rateLimitPhone(tenantId, 'otp_verify', phone);
  const row = await deps.otp.claim(tenantId, phone, purpose);
  if (!row) {
    const latest = await deps.otp.latest(tenantId, phone, purpose);
    if (!latest || latest.consumed_at) throw new Error('otp_invalid');
    if (Date.parse(latest.expires_at) <= deps.now().getTime()) throw new Error('otp_expired');
    throw new Error('otp_exhausted');
  }
  const expected = await hashCode(code, row.salt);
  if (!timingSafeEqual(expected, row.code_hash)) {
    throw new OtpInvalidError(Math.max(0, (row.max_attempts || OTP_MAX_ATTEMPTS) - row.attempts));
  }
  await deps.otp.consume(row.id);
  return row;
}

export async function customerToken(
  deps: BookingDeps,
  tenantId: string,
  phone: string,
  purpose: OtpPurpose,
): Promise<OtpVerifyResponse> {
  const exp = deps.now().getTime() + TOKEN_TTL_MS;
  const token = await signToken({ tenant_id: tenantId, phone, purpose, exp }, deps.env.tokenSecret);
  return { token, expires_at: new Date(exp).toISOString() };
}

export function otpErrorResult(err: unknown): HandlerResult {
  if (err instanceof OtpInvalidError) {
    return errorResult('otp_invalid', 'auth.errors.invalid_code', 401, {
      field_errors: { code: 'auth.errors.invalid_code' },
      retryable: err.attemptsLeft > 0,
    });
  }
  return toErrorResult(err);
}

export async function handleOtpSend(rawBody: unknown, deps: BookingDeps): Promise<HandlerResult> {
  try {
    const input = otpSendRequest.parse(rawBody);
    const tenant = await deps.resolveTenant(input.slug);
    await deps.rateLimit(tenant.id, 'otp_send_ip');
    await deps.rateLimitPhone(tenant.id, 'otp_send', input.phone);
    const issued = await issueOtp(deps, tenant, input.phone, input.purpose, input.locale);
    const body: OtpSendResponse = { status: 'code_sent', ...issued };
    return { status: 200, body };
  } catch (err) {
    return toErrorResult(err);
  }
}

export async function handleOtpVerify(rawBody: unknown, deps: BookingDeps): Promise<HandlerResult> {
  try {
    const input = otpVerifyRequest.parse(rawBody);
    const tenant = await deps.resolveTenant(input.slug);
    await deps.rateLimit(tenant.id, 'otp_verify');
    await verifyOtpCode(deps, tenant.id, input.phone, input.purpose, input.code);
    const body = await customerToken(deps, tenant.id, input.phone, input.purpose);
    return { status: 200, body };
  } catch (err) {
    return otpErrorResult(err);
  }
}
