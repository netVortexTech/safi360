import { describe, expect, it } from 'vitest';
import { verifyToken } from '../otp.ts';
import { hashPassword, verifyPassword } from '../password.ts';
import type { ApiError } from '../schemas.ts';
import {
  ACCOUNT_TOKEN_TTL_MS,
  handleCustomerAuth,
  type CustomerAuthDeps,
  type CustomerAuthResponse,
} from './customer-auth.ts';
import { fakeBookingDeps, fakeBookingWorld } from './fake-deps.ts';
import { PHONE, seedBooking, withStaff } from './fake-bookings.ts';

// Fast hashes in tests; the real iteration count is exercised in password.test.ts.
async function quickHash(password: string) {
  return hashPassword(password, 1_000);
}

function setup() {
  const world = withStaff(fakeBookingWorld());
  const accounts = new Map<string, { hash: string; name: string | null; email: string | null }>();
  const deps: CustomerAuthDeps = {
    ...fakeBookingDeps(world),
    accounts: {
      register(input) {
        const key = `${input.tenant_id}:${input.phone}`;
        if (accounts.has(key)) return Promise.reject(new Error('already_registered'));
        accounts.set(key, { hash: input.password_hash, name: input.name, email: input.email });
        return Promise.resolve();
      },
      passwordHash: (tenantId, phone) => Promise.resolve(accounts.get(`${tenantId}:${phone}`)?.hash ?? null),
    },
  };
  return { world, deps, accounts, tenantId: world.tenants[0]!.id };
}

const signup = { action: 'signup', slug: 'usafi-bora', phone: PHONE, password: 'siri123', name: 'Neema' };
const login = { action: 'login', slug: 'usafi-bora', phone: PHONE, password: 'siri123' };

describe('customer_auth', () => {
  it('signs a new client up and returns a booking token for the phone at that business', async () => {
    const { deps, accounts, tenantId, world } = setup();
    const res = await handleCustomerAuth({ ...signup, email: 'Neema@Example.com' }, deps);
    expect(res.status).toBe(200);
    const body = res.body as CustomerAuthResponse;
    const payload = await verifyToken(body.token, deps.env.tokenSecret, deps.now());
    expect(payload).toMatchObject({ tenant_id: tenantId, phone: PHONE, purpose: 'booking' });
    expect(Date.parse(body.expires_at) - deps.now().getTime()).toBe(ACCOUNT_TOKEN_TTL_MS);
    expect(body.bookings).toEqual([]);

    const stored = accounts.get(`${tenantId}:${PHONE}`);
    expect(stored).toMatchObject({ name: 'Neema', email: 'neema@example.com' });
    expect(stored?.hash).toMatch(/^pbkdf2\$sha256\$/);
    expect(await verifyPassword('siri123', stored!.hash)).toBe(true);
    expect(world.rateLimitCalls).toContain(`${tenantId}:customer_auth:${PHONE}`);
  });

  it('signs an existing client in and lists their bookings, matching a ticket when given', async () => {
    const { deps, accounts, tenantId, world } = setup();
    accounts.set(`${tenantId}:${PHONE}`, { hash: await quickHash('siri123'), name: 'Neema', email: null });
    const booking = await seedBooking(world);
    const res = await handleCustomerAuth({ ...login, ticket_ref: booking.ticket_ref }, deps);
    expect(res.status).toBe(200);
    const body = res.body as CustomerAuthResponse;
    expect(body.booking_id).toBe(booking.id);
    expect(body.bookings.map((b) => b.ticket_ref)).toEqual([booking.ticket_ref]);
  });

  it('gives the same answer for a wrong password and an unknown phone', async () => {
    const { deps, accounts, tenantId } = setup();
    accounts.set(`${tenantId}:${PHONE}`, { hash: await quickHash('siri123'), name: 'Neema', email: null });
    const wrong = await handleCustomerAuth({ ...login, password: 'nope123' }, deps);
    const unknown = await handleCustomerAuth({ ...login, phone: '+255713908115' }, deps);
    for (const res of [wrong, unknown]) {
      expect(res.status).toBe(401);
      expect((res.body as ApiError).code).toBe('wrong_credentials');
    }
  });

  it('refuses a second signup on the same phone', async () => {
    const { deps } = setup();
    await handleCustomerAuth(signup, deps);
    const again = await handleCustomerAuth(signup, deps);
    expect(again.status).toBe(409);
    expect((again.body as ApiError).code).toBe('already_registered');
  });

  it('validates the password length and unknown fields', async () => {
    const { deps } = setup();
    expect((await handleCustomerAuth({ ...login, password: '123' }, deps)).status).toBe(422);
    expect((await handleCustomerAuth({ ...login, otp: '123456' }, deps)).status).toBe(422);
  });
});
