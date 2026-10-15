import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { vi } from 'vitest';
import { AppProviders } from '@/app/providers';
import { routes } from '@/app/App';
import type { AuthState } from '@/lib/auth';

// The ops dashboard reads live Supabase queries; stub the data hooks so the
// route test renders the real dashboard UI without a backend.
vi.mock('@/experiences/ops/tickets/hooks', () => {
  const query = (data: unknown) => () => ({ data, isLoading: false, error: null, refetch: () => {} });
  const mutation = () => () => ({ mutate: () => {}, isPending: false });
  return {
    ticketKeys: {
      all: ['tickets'],
      list: () => ['tickets', 'list'],
      detail: (id: string) => ['tickets', 'detail', id],
      events: (id: string) => ['tickets', 'events', id],
      payments: (id: string) => ['tickets', 'payments', id],
      quotes: (id: string) => ['tickets', 'quotes', id],
      audit: (id: string) => ['tickets', 'audit', id],
      dashboard: ['dashboard'],
      calendar: (s: string, e: string) => ['calendar', s, e],
      dispatch: (d: string) => ['dispatch', d],
      exceptions: ['exceptions'],
      sources: ['bookings-by-source'],
    },
    useTickets: query([]),
    useTicket: query(null),
    useJobEvents: query([]),
    useBookingPayments: query([]),
    useBookingQuotes: query([]),
    useBookingAudit: query([]),
    useDashboard: query({
      kpis: {
        todays_jobs: 0,
        needs_action: 0,
        booked_value_tzs: 0,
        collected_tzs: 0,
        pending_tzs: 0,
        open_exceptions: 0,
      },
      needs_action: [],
      recent_tickets: [],
      by_source: [],
    }),
    useCalendarEvents: query([]),
    useDispatchItems: query([]),
    useExceptions: query([]),
    useResolveException: mutation(),
    useAddJobEvent: mutation(),
    useQueueNotification: mutation(),
    useTransitionBooking: mutation(),
    useRescheduleBooking: mutation(),
    useAddNote: mutation(),
    useAssignmentCandidates: query([]),
    useCreateAssignment: mutation(),
    useCancelAssignment: mutation(),
  };
});

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
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' }, LAZY)).toBeInTheDocument();
    expect(screen.getAllByRole('navigation', { name: 'Main' }).length).toBeGreaterThan(0);
    expect(screen.getByText('Needs your action')).toBeInTheDocument();
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
