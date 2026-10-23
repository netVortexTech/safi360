import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { AppProviders } from '@/app/providers';
import type { AuthState } from '@/lib/auth';
import { PAYMENT_URL, type SubscriptionStatus, type UseSubscriptionStatus } from '@/lib/subscription';
import type * as SubscriptionModule from '@/lib/subscription';
import { SubscriptionGate } from './SubscriptionGate';

const hook = vi.hoisted(() => {
  const value: UseSubscriptionStatus = {
    status: null,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: () => {},
  };
  return { value };
});

vi.mock('@/lib/subscription', async (importOriginal) => {
  const actual = await importOriginal<typeof SubscriptionModule>();
  return { ...actual, useSubscriptionStatus: () => hook.value };
});

const signedOut: AuthState = {
  status: 'signed_out',
  session: null,
  userId: null,
  claims: { tenant_id: null, tenant_role: null, is_super_admin: false },
};
const owner: AuthState = {
  status: 'signed_in',
  session: null,
  userId: 'aaaaaaaa-0000-4000-8000-000000000001',
  claims: { tenant_id: '11111111-1111-4111-8111-111111111111', tenant_role: 'OWNER', is_super_admin: false },
};
const employee: AuthState = { ...owner, claims: { ...owner.claims, tenant_role: 'CLEANER' } };
const noCompany: AuthState = {
  ...owner,
  claims: { tenant_id: null, tenant_role: null, is_super_admin: false },
};

function sub(partial: Partial<SubscriptionStatus>): SubscriptionStatus {
  return {
    status: 'ACTIVE',
    planId: 'growth',
    trialEndsAt: null,
    daysRemaining: null,
    isTrialExpired: false,
    canAccessSystem: true,
    paymentUrl: PAYMENT_URL,
    ...partial,
  };
}

function set(partial: Partial<UseSubscriptionStatus>) {
  hook.value = {
    status: null,
    isLoading: false,
    isFetching: false,
    error: null,
    refetch: () => {},
    ...partial,
  };
}

function renderGate(auth: AuthState) {
  const router = createMemoryRouter(
    [
      {
        path: '/ops',
        element: (
          <SubscriptionGate>
            <h1>Shell</h1>
          </SubscriptionGate>
        ),
      },
      { path: '/onboarding/plan', element: <h1>Choose your plan</h1> },
    ],
    { initialEntries: ['/ops'] },
  );
  return render(
    <AppProviders auth={auth}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

beforeEach(() => set({}));

describe('<SubscriptionGate>', () => {
  it('lets the layout handle visitors who are not signed in', async () => {
    renderGate(signedOut);
    expect(await screen.findByRole('heading', { name: 'Shell' })).toBeInTheDocument();
  });

  it('lets the layout handle accounts without a company', async () => {
    renderGate(noCompany);
    expect(await screen.findByRole('heading', { name: 'Shell' })).toBeInTheDocument();
  });

  it('renders the shell with a countdown during the trial', async () => {
    set({
      status: sub({ status: 'TRIAL', planId: null, trialEndsAt: '2099-01-01T00:00:00Z', daysRemaining: 3 }),
    });
    renderGate(owner);
    expect(await screen.findByRole('heading', { name: 'Shell' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('3 days');
    expect(screen.getByRole('link', { name: 'Choose plan now' })).toHaveAttribute('href', '/onboarding/plan');
  });

  it('hides the plan call to action from employees', async () => {
    set({
      status: sub({ status: 'TRIAL', planId: null, trialEndsAt: '2099-01-01T00:00:00Z', daysRemaining: 3 }),
    });
    renderGate(employee);
    expect(await screen.findByRole('heading', { name: 'Shell' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Choose plan now' })).not.toBeInTheDocument();
  });

  it('blocks an expired trial and offers the payment link', async () => {
    set({
      status: sub({
        status: 'TRIAL',
        planId: null,
        trialEndsAt: '2020-01-01T00:00:00Z',
        isTrialExpired: true,
      }),
    });
    renderGate(owner);
    expect(await screen.findByRole('heading', { name: 'Trial expired' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Choose a plan' })).toHaveAttribute('href', '/onboarding/plan');
    expect(screen.getByRole('link', { name: /pay directly/i })).toHaveAttribute('href', PAYMENT_URL);
    expect(screen.queryByRole('heading', { name: 'Shell' })).not.toBeInTheDocument();
  });

  it('sends an active owner without a plan to choose one', async () => {
    set({ status: sub({ planId: null }) });
    renderGate(owner);
    expect(await screen.findByRole('heading', { name: 'Choose your plan' })).toBeInTheDocument();
  });

  it('keeps an employee of an active company without a plan on the shell', async () => {
    set({ status: sub({ planId: null }) });
    renderGate(employee);
    expect(await screen.findByRole('heading', { name: 'Shell' })).toBeInTheDocument();
  });

  it('blocks suspended and past-due companies', async () => {
    set({ status: sub({ status: 'SUSPENDED', canAccessSystem: false }) });
    const first = renderGate(owner);
    expect(await screen.findByRole('heading', { name: 'Account suspended' })).toBeInTheDocument();
    first.unmount();

    set({ status: sub({ status: 'PAST_DUE', canAccessSystem: false }) });
    renderGate(owner);
    expect(await screen.findByRole('heading', { name: 'Payment overdue' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /pay now/i })).toHaveAttribute('href', PAYMENT_URL);
  });

  it('shows a retryable error instead of redirecting when the status cannot be read', async () => {
    const refetch = vi.fn();
    set({ error: new Error('network down'), refetch });
    renderGate(owner);
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Shell' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
