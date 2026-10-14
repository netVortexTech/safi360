import { describe, expect, it } from 'vitest';
import { SANDBOX_OTP_CODE, verifyToken } from '../otp.ts';
import { FIXTURE_TENANT_ID } from '../pricing/fixtures.ts';
import type { ApiError } from '../schemas.ts';
import { fakeBookingDeps, fakeBookingWorld } from './fake-deps.ts';
import { PHONE } from './fake-bookings.ts';
import { handleOtpSend, handleOtpVerify, type OtpSendResponse, type OtpVerifyResponse } from './otp.ts';

const send = { slug: 'usafi-bora', phone: PHONE, purpose: 'booking' as const };

describe('otp_send', () => {
  it('stores a hashed code, retires the previous one and sends through the provider', async () => {
    const world = fakeBookingWorld();
    const deps = fakeBookingDeps(world);
    const first = await handleOtpSend(send, deps);
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({
      status: 'code_sent',
      sandbox: true,
    } satisfies Partial<OtpSendResponse>);
    const second = await handleOtpSend(send, deps);
    expect(second.status).toBe(200);
    expect(world.otps).toHaveLength(2);
    expect(world.otps[0]?.consumed_at).not.toBeNull();
    expect(world.otps[1]?.consumed_at).toBeNull();
    expect(world.otps[1]?.code_hash).not.toContain(SANDBOX_OTP_CODE);
    expect(world.sms?.sent).toHaveLength(2);
    expect(world.sms?.sent[0]?.to).toBe(PHONE);
    expect(world.rateLimitCalls).toContain(`${FIXTURE_TENANT_ID}:otp_send:${PHONE}`);
    expect(world.rateLimitCalls).toContain(`${FIXTURE_TENANT_ID}:otp_send_ip`);
  });

  it('fails closed without an SMS provider', async () => {
    const world = fakeBookingWorld({ sms: null });
    const res = await handleOtpSend(send, fakeBookingDeps(world));
    expect(res.status).toBe(503);
    expect((res.body as ApiError).code).toBe('sms_not_configured');
    expect(world.otps).toEqual([]);
  });

  it('validates the phone and purpose', async () => {
    const res = await handleOtpSend({ ...send, phone: '0715880342' }, fakeBookingDeps(fakeBookingWorld()));
    expect(res.status).toBe(422);
    expect((res.body as ApiError).field_errors).toEqual({ phone: 'validation.phone.invalid' });
    const bad = await handleOtpSend({ ...send, purpose: 'login' }, fakeBookingDeps(fakeBookingWorld()));
    expect(bad.status).toBe(422);
  });
});

describe('otp_verify', () => {
  it('turns the right code into a signed token scoped to tenant, phone and purpose', async () => {
    const world = fakeBookingWorld();
    const deps = fakeBookingDeps(world);
    await handleOtpSend(send, deps);
    const res = await handleOtpVerify({ ...send, code: SANDBOX_OTP_CODE }, deps);
    expect(res.status).toBe(200);
    const body = res.body as OtpVerifyResponse;
    const payload = await verifyToken(body.token, world.tokenSecret, world.now);
    expect(payload).toMatchObject({ tenant_id: FIXTURE_TENANT_ID, phone: PHONE, purpose: 'booking' });
    expect(Date.parse(body.expires_at) - world.now.getTime()).toBe(15 * 60_000);
    expect(world.otps[0]?.consumed_at).not.toBeNull();
    // A consumed code cannot be replayed.
    const again = await handleOtpVerify({ ...send, code: SANDBOX_OTP_CODE }, deps);
    expect(again.status).toBe(401);
    expect((again.body as ApiError).code).toBe('otp_invalid');
  });

  it('counts attempts and locks after five wrong codes', async () => {
    const world = fakeBookingWorld();
    const deps = fakeBookingDeps(world);
    await handleOtpSend(send, deps);
    for (let i = 1; i <= 5; i++) {
      const res = await handleOtpVerify({ ...send, code: '000000' }, deps);
      expect(res.status, `attempt ${i}`).toBe(401);
      expect((res.body as ApiError).retryable, `attempt ${i}`).toBe(i < 5);
    }
    const locked = await handleOtpVerify({ ...send, code: SANDBOX_OTP_CODE }, deps);
    expect(locked.status).toBe(429);
    expect((locked.body as ApiError).code).toBe('otp_exhausted');
  });

  it('reports expired codes and never leaks which part failed', async () => {
    const world = fakeBookingWorld();
    const deps = fakeBookingDeps(world);
    await handleOtpSend(send, deps);
    world.now = new Date(world.now.getTime() + 6 * 60_000);
    const res = await handleOtpVerify({ ...send, code: SANDBOX_OTP_CODE }, deps);
    expect(res.status).toBe(401);
    expect((res.body as ApiError).code).toBe('otp_expired');
    const never = await handleOtpVerify({ ...send, phone: '+255713000000', code: SANDBOX_OTP_CODE }, deps);
    expect(never.status).toBe(401);
    expect((never.body as ApiError).code).toBe('otp_invalid');
  });

  it('a booking code does not unlock tracking', async () => {
    const world = fakeBookingWorld();
    const deps = fakeBookingDeps(world);
    await handleOtpSend(send, deps);
    const res = await handleOtpVerify({ ...send, purpose: 'tracking', code: SANDBOX_OTP_CODE }, deps);
    expect(res.status).toBe(401);
  });
});
