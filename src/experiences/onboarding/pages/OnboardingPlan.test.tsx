import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { AppProviders } from '@/app/providers';
import type { AuthState } from '@/lib/auth';
import {
  PAYMENT_URL,
  type SubscriptionStatus,
  type TenantSubscriptionRow,
  type UseSubscriptionStatus,
} from '@/lib/subscription';
import type * as SubscriptionModule from '@/lib/subscription';
import OnboardingPlan from './OnboardingPlan';

const mocks = vi.hoisted(() => {
  const hook: {
    status: unknown;
    isLoading: boolean;
    isFetching: boolean;
    error: Error | null;
    refetch: () => void;
  } = { status: null, isLoading: false, isFetching: false, error: null, refetch: () => {} };
  const tenantRow: unknown = null;
  return { hook, tenantRow, rpc: vi.fn() };
});

vi.mock('@/lib/subscription', async (importOriginal) => {
  const actual = await importOriginal<typeof SubscriptionModule>();
  return {
    ...actual,
    useSubscriptionStatus: () => mocks.hook as UseSubscriptionStatus,
    fetchSubscriptionStatus: () =>
      Promise.resolve(actual.deriveSubscriptionStatus(mocks.tenantRow as TenantSubscriptionRow)),
  };
});

vi.mock('@/lib/supabase', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  const plans = [{ id: 'growth', name: 'Growth', price_tzs: 95000, limits: { staff: 10 } }];
  const query = {
    select: () => query,
    eq: () => query,
    order: () => Promise.resolve({ data: plans, error: null }),
  };
  return {
    ...actual,
    supabase: { from: () => query, rpc: mocks.rpc, auth: { refreshSession: vi.fn() } },
  };
});

const owner: AuthState = {
  status: 'signed_in',
  session: null,
  userId: 'aaaaaaaa-0000-4000-8000-000000000001',
  claims: { tenant_id: '11111111-1111-4111-8111-111111111111', tenant_role: 'OWNER', is_super_admin: false },
};

const trialRow = (endsAt: string): TenantSubscriptionRow => ({
  status: 'TRIAL',
  plan_id: null,
  trial_ends_at: endsAt,
  deleted_at: null,
});

function sub(partial: Partial<SubscriptionStatus>): SubscriptionStatus {
  return {
    status: 'TRIAL',
    planId: null,
    trialEndsAt: null,
    daysRemaining: null,
    isTrialExpired: false,
    canAccessSystem: true,
    paymentUrl: PAYMENT_URL,
    ...partial,
  };
}

function renderPlan(auth: AuthState = owner) {
  const router = createMemoryRouter(
    [
      { path: '/onboarding/plan', element: <OnboardingPlan /> },
      { path: '/ops', element: <h1>Ops shell</h1> },
      { path: '/signup', element: <h1>Signup page</h1> },
    ],
    { initialEntries: ['/onboarding/plan'] },
  );
  return render(
    <AppProviders auth={auth}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.rpc.mockResolvedValue({ data: null, error: null });
});

describe('<OnboardingPlan>', () => {
  it('enters the portal when the trial is still running', async () => {
    mocks.hook.status = sub({ daysRemaining: 5 });
    mocks.tenantRow = trialRow('2099-01-01T00:00:00Z');
    renderPlan();
    await userEvent.click(await screen.findByRole('button', { name: 'Choose this plan' }));
    expect(await screen.findByRole('heading', { name: 'Ops shell' })).toBeInTheDocument();
    expect(mocks.rpc).toHaveBeenCalledWith('select_plan', { p_plan_id: 'growth' });
  });

  it('shows the payment step instead of looping back when the trial has expired', async () => {
    mocks.hook.status = sub({ isTrialExpired: true, canAccessSystem: false });
    mocks.tenantRow = trialRow('2000-01-01T00:00:00Z');
    renderPlan();
    expect(screen.queryByRole('link', { name: 'Continue with free trial' })).not.toBeInTheDocument();
    await userEvent.click(await screen.findByRole('button', { name: 'Choose this plan' }));
    expect(
      await screen.findByRole('heading', { name: 'Plan saved. Complete payment to continue' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Pay now/ })).toHaveAttribute('href', PAYMENT_URL);
    await userEvent.click(screen.getByRole('button', { name: "I've paid, check again" }));
    expect(await screen.findByText(/Payment not confirmed yet/)).toBeInTheDocument();
  });

  it('sends an account without a company back to signup', async () => {
    renderPlan({ ...owner, claims: { tenant_id: null, tenant_role: null, is_super_admin: false } });
    expect(await screen.findByRole('heading', { name: 'Signup page' })).toBeInTheDocument();
  });

  it('sends employees to the ops portal', async () => {
    renderPlan({ ...owner, claims: { ...owner.claims, tenant_role: 'MANAGER' } });
    expect(await screen.findByRole('heading', { name: 'Ops shell' })).toBeInTheDocument();
  });
});
