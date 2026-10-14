import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { AppProviders } from '@/app/providers';
import { routes } from '@/app/App';

// Lazy experience chunks are transformed on first use; allow for a slow first load.
const LAZY = { timeout: 20_000 };

function renderAt(path: string) {
  const memory = createMemoryRouter(routes, { initialEntries: [path] });
  return render(
    <AppProviders>
      <RouterProvider router={memory} />
    </AppProviders>,
  );
}

describe('route shells', () => {
  it('serves the ops dashboard at /ops with the sidebar', async () => {
    renderAt('/ops');
    expect(await screen.findByTestId('foundation-notice', undefined, LAZY)).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0);
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
