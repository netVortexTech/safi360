import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BookingStatus } from '@shared/enums';
import type * as ApiModule from '../api';
import { saveLastBooking } from '../session';
import { renderPortal } from '../test-utils';
import BookingDonePage from './BookingDonePage';

vi.mock('../api', async (importOriginal) => {
  const mod = await importOriginal<typeof ApiModule>();
  return { ...mod, portalApi: { ...mod.portalApi, trackingView: vi.fn(() => new Promise(() => undefined)) } };
});

function seed(status: BookingStatus, paymentMode: 'DEPOSIT' | 'ON_COMPLETION' = 'ON_COMPLETION') {
  saveLastBooking({
    slug: 'usafi-bora',
    ticket_ref: 'UBC-2026-00042',
    booking_id: '00000001-0000-4000-8000-000000000001',
    status,
    hold_expires_at: status === 'AWAITING_PAYMENT' ? new Date(Date.now() + 15 * 60_000).toISOString() : null,
    token: 'tok',
    token_expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    total_tzs: 75000,
    deposit_tzs: 22500,
    payment_mode: paymentMode,
    scheduled_start: '2026-10-16T06:00:00Z',
    scheduled_end: '2026-10-16T08:15:00Z',
    requires_review: status === 'AWAITING_REVIEW',
    address: { area: 'Mbezi Beach', street: '', landmark: '', ward: '' },
    source: 'website',
    created_at: new Date().toISOString(),
  });
}

describe('<BookingDonePage>', () => {
  beforeEach(() => window.sessionStorage.clear());

  it.each([
    ['CONFIRMED', 'Booking confirmed'],
    ['AWAITING_REVIEW', 'Request received'],
    ['AWAITING_PAYMENT', 'Awaiting payment'],
  ] as const)('%s reads "%s"', (status, headline) => {
    seed(status, status === 'AWAITING_PAYMENT' ? 'DEPOSIT' : 'ON_COMPLETION');
    renderPortal(<BookingDonePage />, {
      path: '/usafi-bora/book/done/UBC-2026-00042',
      routes: [{ path: '/:slug/book/done/:ticket', element: <BookingDonePage /> }],
    });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(headline);
    expect(screen.getByText('UBC-2026-00042')).toBeInTheDocument();
    if (status === 'AWAITING_PAYMENT') {
      expect(screen.getByRole('button', { name: /Pay the deposit now/ })).toBeInTheDocument();
    } else {
      expect(screen.queryByTestId('payment-flow')).not.toBeInTheDocument();
    }
  });

  it('points to tracking when this browser has no recent booking', () => {
    renderPortal(<BookingDonePage />, {
      path: '/usafi-bora/book/done/UBC-2026-00099',
      routes: [{ path: '/:slug/book/done/:ticket', element: <BookingDonePage /> }],
    });
    expect(screen.getByText(/Nothing to show/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Track my booking/ })).toHaveAttribute(
      'href',
      '/usafi-bora/track',
    );
  });
});
