import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { AppProviders } from '@/app/providers';
import type { AuthState } from '@/lib/auth';
import type * as AuthApi from '@/lib/auth-api';
import { PasswordSignIn } from './PasswordSignIn';
import { PhoneSignup } from './PhoneSignup';

const api = vi.hoisted(() => ({
  signInWithPassword: vi.fn(),
  signUpWithPassword: vi.fn(),
  resendSignupCode: vi.fn(),
  verifyOtp: vi.fn(),
}));

vi.mock('@/lib/auth-api', async (importOriginal) => ({
  ...(await importOriginal<typeof AuthApi>()),
  ...api,
}));

const signedOut: AuthState = {
  status: 'signed_out',
  session: null,
  userId: null,
  claims: { tenant_id: null, tenant_role: null, is_super_admin: false },
};

function renderWithShell(node: ReactNode) {
  const router = createMemoryRouter([{ path: '/', element: node }], { initialEntries: ['/'] });
  return render(
    <AppProviders auth={signedOut}>
      <RouterProvider router={router} />
    </AppProviders>,
  );
}

beforeEach(() => {
  for (const fn of Object.values(api)) {
    fn.mockReset();
    fn.mockResolvedValue(undefined);
  }
});

describe('<PasswordSignIn>', () => {
  it('signs in with the E.164 phone and password, then runs onSignedIn', async () => {
    const onSignedIn = vi.fn().mockResolvedValue(undefined);
    renderWithShell(<PasswordSignIn reset={{ back: '/ops/login', next: '/ops' }} onSignedIn={onSignedIn} />);
    await userEvent.type(screen.getByLabelText(/phone/i), '763594105');
    await userEvent.type(screen.getByLabelText(/^Password/), 'siri123');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(api.signInWithPassword).toHaveBeenCalledWith('+255763594105', 'siri123');
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('shows a translated error for a wrong password', async () => {
    api.signInWithPassword.mockRejectedValue(
      Object.assign(new Error('Invalid login credentials'), { code: 'invalid_credentials', status: 400 }),
    );
    renderWithShell(<PasswordSignIn reset={{ back: '/ops/login', next: '/ops' }} />);
    await userEvent.type(screen.getByLabelText(/phone/i), '763594105');
    await userEvent.type(screen.getByLabelText(/^Password/), 'wrong1');
    await userEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Wrong phone number or password.')).toBeInTheDocument();
  });

  it('links to the reset page', () => {
    renderWithShell(<PasswordSignIn reset={{ back: '/ops/login', next: '/ops' }} />);
    expect(screen.getByRole('link', { name: 'Forgot password?' })).toHaveAttribute('href', '/reset-password');
  });
});

describe('<PhoneSignup>', () => {
  async function fillAccount(password: string, confirm: string) {
    await userEvent.type(screen.getByLabelText(/phone/i), '763594105');
    await userEvent.type(screen.getByLabelText(/^Password/), password);
    await userEvent.type(screen.getByLabelText(/^Confirm password/), confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }));
  }

  it('refuses a short or mismatched password before calling Supabase', async () => {
    renderWithShell(<PhoneSignup title="Create" body="Body" />);
    await fillAccount('abc', 'abd');
    expect(screen.getByText('Password must be at least 6 characters.')).toBeInTheDocument();
    expect(screen.getByText('Passwords do not match.')).toBeInTheDocument();
    expect(api.signUpWithPassword).not.toHaveBeenCalled();
  });

  it('creates the account, then verifies the SMS code and runs onVerified', async () => {
    const onVerified = vi.fn().mockResolvedValue(undefined);
    renderWithShell(<PhoneSignup title="Create" body="Body" onVerified={onVerified} />);
    await fillAccount('siri123', 'siri123');
    expect(api.signUpWithPassword).toHaveBeenCalledWith('+255763594105', 'siri123');

    expect(await screen.findByRole('heading', { name: 'Enter the code' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Send the code again' }));
    expect(api.resendSignupCode).toHaveBeenCalledWith('+255763594105');

    await userEvent.type(screen.getAllByRole('textbox')[0] as HTMLElement, '482913');
    expect(api.verifyOtp).toHaveBeenCalledWith('+255763594105', '482913');
    expect(onVerified).toHaveBeenCalledTimes(1);
  });

  it('tells an existing user to sign in instead', async () => {
    api.signUpWithPassword.mockRejectedValue(
      Object.assign(new Error('User already registered'), { code: 'user_already_exists', status: 422 }),
    );
    renderWithShell(<PhoneSignup title="Create" body="Body" />);
    await fillAccount('siri123', 'siri123');
    expect(
      await screen.findByText('This number already has an account. Sign in instead.'),
    ).toBeInTheDocument();
  });
});
