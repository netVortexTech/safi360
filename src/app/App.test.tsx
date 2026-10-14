import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { routes } from '@/app/App';
import type { AuthState } from '@/lib/auth';

// Lazy experience chunks are transformed on first use; allow for a slow first load.
const LAZY = { timeout: 20_000 };

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
const cleaner: AuthState = { ...owner, claims: { ...owner.claims, tenant_role: 'CLEANER' } };

function renderAt(path: string, auth: AuthState = signedOut) {
  const memory = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AppProviders auth={auth}>
      <RouterProvider router={memory} />
    </AppProviders>,
  );
}

describe('route shells', () => {
  it('sends a signed-out visitor from /ops to the login page', async () => {
    renderAt('/ops');
    expect(await screen.findByRole('heading', { level: 1, name: 'Sign in' }, LAZY)).toBeInTheDocument();
    expect(screen.getByLabelText(/phone number/i)).toBeInTheDocument();
  }, 30_000);

  it('serves the ops dashboard at /ops with the sidebar for an owner', async () => {
    renderAt('/ops', owner);
    expect(await screen.findByTestId('foundation-notice', undefined, LAZY)).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0);
  }, 30_000);

  it('keeps cleaners out of the ops portal', async () => {
    renderAt('/ops/services', cleaner);
    expect(await screen.findByRole('alert', undefined, LAZY)).toHaveTextContent(/office portal/i);
    expect(screen.getByRole('link', { name: /cleaner app/i })).toHaveAttribute('href', '/field');
  }, 30_000);

  it('serves a tenant portal at /:slug', async () => {
    renderAt('/usafi-bora');
    expect(await screen.findByRole('heading', { level: 1 }, LAZY)).toBeInTheDocument();
    expect(screen.getAllByText(/usafi-bora/).length).toBeGreaterThan(0);
  }, 30_000);

  it('serves the field app at /field', async () => {
    renderAt('/field');
    expect(await screen.findByRole('heading', { level: 1 }, LAZY)).toBeInTheDocument();
  }, 30_000);

  it('serves the control center at /control', async () => {
    renderAt('/control');
    expect(await screen.findByRole('heading', { level: 1 }, LAZY)).toBeInTheDocument();
  }, 30_000);
});
