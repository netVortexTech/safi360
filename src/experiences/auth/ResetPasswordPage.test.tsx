import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { AppProviders } from '@/app/providers';
import type { AuthState } from '@/lib/auth';
import type * as AuthApi from '@/lib/auth-api';
import ResetPasswordPage from './ResetPasswordPage';

const api = vi.hoisted(() => ({ requestOtp: vi.fn(), verifyOtp: vi.fn(), updatePassword: vi.fn() }));

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

function renderReset(state: unknown) {
  const router = createMemoryRouter(
    [
      { path: '/reset-password', element: <ResetPasswordPage /> },
      { path: '/field', element: <h1>Field app</h1> },
      { path: '/ops', element: <h1>Ops app</h1> },
    ],
    { initialEntries: [{ pathname: '/reset-password', state }] },
  );
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

describe('<ResetPasswordPage>', () => {
  it('sends a code, verifies it, saves the new password and continues to the app', async () => {
    renderReset({ back: '/field/login', next: '/field' });
    await userEvent.type(screen.getByLabelText(/phone/i), '763594105');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(api.requestOtp).toHaveBeenCalledWith('+255763594105');

    await userEvent.type((await screen.findAllByRole('textbox'))[0] as HTMLElement, '482913');
    expect(api.verifyOtp).toHaveBeenCalledWith('+255763594105', '482913');

    await userEvent.type(await screen.findByLabelText(/^New password/), 'mpya123');
    await userEvent.type(screen.getByLabelText(/^Confirm password/), 'mpya123');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(api.updatePassword).toHaveBeenCalledWith('mpya123');
    expect(await screen.findByRole('heading', { name: 'Field app' })).toBeInTheDocument();
  });

  it('ignores an off-site "next" and falls back to the ops portal', async () => {
    renderReset({ next: '//evil.example' });
    await userEvent.type(screen.getByLabelText(/phone/i), '763594105');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    await userEvent.type((await screen.findAllByRole('textbox'))[0] as HTMLElement, '482913');
    await userEvent.type(await screen.findByLabelText(/^New password/), 'mpya123');
    await userEvent.type(screen.getByLabelText(/^Confirm password/), 'mpya123');
    await userEvent.click(screen.getByRole('button', { name: 'Save new password' }));
    expect(await screen.findByRole('heading', { name: 'Ops app' })).toBeInTheDocument();
  });

  it('tells an unknown number to create an account', async () => {
    api.requestOtp.mockRejectedValue(new Error('Signups not allowed for otp'));
    renderReset(null);
    await userEvent.type(screen.getByLabelText(/phone/i), '763594105');
    await userEvent.click(screen.getByRole('button', { name: 'Send code' }));
    expect(await screen.findByText('No account uses this number yet. Create one first.')).toBeInTheDocument();
  });
});
