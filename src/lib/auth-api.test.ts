import { beforeEach, describe, expect, it, vi } from 'vitest';

const { rpc, refreshSession } = vi.hoisted(() => ({
  rpc: vi.fn(),
  refreshSession: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  supabase: { rpc, auth: { refreshSession } },
}));

import { authErrorKey, claimStaffInvite, refreshSessionClaims } from './auth-api';

describe('claimStaffInvite', () => {
  beforeEach(() => {
    rpc.mockReset();
    refreshSession.mockReset();
    refreshSession.mockResolvedValue({ data: {}, error: null });
  });

  it('refreshes the session even when there is nothing to claim', async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(claimStaffInvite()).resolves.toBe(false);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('reports a claimed invite and still refreshes', async () => {
    rpc.mockResolvedValue({ data: 'staff-1', error: null });
    await expect(claimStaffInvite()).resolves.toBe(true);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('refreshes after an rpc error too, in case access was granted directly', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'function not found' } });
    await expect(claimStaffInvite()).resolves.toBe(false);
    expect(refreshSession).toHaveBeenCalledTimes(1);
  });

  it('refreshSessionClaims re-mints the token without touching the rpc', async () => {
    await refreshSessionClaims();
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('authErrorKey', () => {
  it.each([
    ['invalid_credentials', 'Invalid login credentials', 'auth.errors.wrong_credentials'],
    ['user_already_exists', 'User already registered', 'auth.errors.already_registered'],
    ['weak_password', 'Password should be at least 6 characters.', 'auth.errors.weak_password'],
    ['phone_not_confirmed', 'Phone not confirmed', 'auth.errors.not_confirmed'],
  ])('maps the %s auth error', (code, message, key) => {
    expect(authErrorKey(Object.assign(new Error(message), { code }))).toBe(key);
  });

  it('points an unknown number on an office portal to signup', () => {
    expect(authErrorKey(new Error('Signups not allowed for otp'))).toBe('auth.errors.no_account');
  });
});
