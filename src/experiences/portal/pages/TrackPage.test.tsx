import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PortalApiError } from '../api';
import type * as ApiModule from '../api';
import { renderPortal } from '../test-utils';
import TrackPage from './TrackPage';

const api = vi.hoisted(() => ({
  trackingStart: vi.fn(),
  trackingVerify: vi.fn(),
  trackingView: vi.fn(),
}));

vi.mock('../api', async (importOriginal) => {
  const mod = await importOriginal<typeof ApiModule>();
  return { ...mod, portalApi: { ...mod.portalApi, ...api } };
});

describe('<TrackPage>', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    api.trackingStart.mockReset();
    api.trackingVerify.mockReset();
    api.trackingView.mockReset();
  });

  it('shows no booking data before the phone is verified, and none on a wrong code', async () => {
    const user = userEvent.setup();
    api.trackingStart.mockResolvedValue({ status: 'code_sent' });
    api.trackingVerify.mockRejectedValue(
      new PortalApiError('otp_invalid', 'auth.errors.invalid_code', 401, true, {
        code: 'auth.errors.invalid_code',
      }),
    );
    renderPortal(<TrackPage />, {
      path: '/usafi-bora/track',
      routes: [{ path: '/:slug/track', element: <TrackPage /> }],
    });

    expect(screen.queryByTestId('timeline')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Ticket number/), 'ubc-2026-00042');
    await user.type(screen.getByLabelText(/Phone number/), '715880342');
    await user.click(screen.getByRole('button', { name: /Send code/ }));
    await waitFor(() =>
      expect(api.trackingStart).toHaveBeenCalledWith(
        expect.objectContaining({ ticket_ref: 'UBC-2026-00042', phone: '+255715880342' }),
      ),
    );
    expect(await screen.findByText(/Enter the code/)).toBeInTheDocument();

    await user.type(screen.getByLabelText(/Verification code 1\/6/), '000000');
    expect(await screen.findByText(/That code is not right/)).toBeInTheDocument();
    expect(api.trackingView).not.toHaveBeenCalled();
    expect(screen.queryByText(/UBC-2026-00042/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('track-list')).not.toBeInTheDocument();
  });

  it('lists every booking on the phone after a lost-ticket verification', async () => {
    const user = userEvent.setup();
    api.trackingStart.mockResolvedValue({ status: 'code_sent' });
    api.trackingVerify.mockResolvedValue({
      token: 'tok',
      expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
      booking_id: null,
      bookings: [
        {
          id: 'b1',
          ticket_ref: 'UBC-2026-00042',
          status: 'CONFIRMED',
          scheduled_start: '2026-10-16T06:00:00Z',
          service_label_sw: 'Usafi wa sofa',
          service_label_en: 'Sofa cleaning',
          total_tzs: 75000,
          created_at: '2026-10-14T09:00:00Z',
        },
        {
          id: 'b2',
          ticket_ref: 'UBC-2026-00010',
          status: 'COMPLETED',
          scheduled_start: '2026-10-01T06:00:00Z',
          service_label_sw: 'Usafi wa zulia',
          service_label_en: 'Carpet cleaning',
          total_tzs: 35000,
          created_at: '2026-09-28T09:00:00Z',
        },
      ],
    });
    renderPortal(<TrackPage />, {
      path: '/usafi-bora/track/recover',
      routes: [{ path: '/:slug/track/recover', element: <TrackPage /> }],
    });
    expect(screen.queryByLabelText(/Ticket number/)).not.toBeInTheDocument();
    await user.type(screen.getByLabelText(/Phone number/), '715880342');
    await user.click(screen.getByRole('button', { name: /Send code/ }));
    await screen.findByText(/Enter the code/);
    await user.type(screen.getByLabelText(/Verification code 1\/6/), '123456');
    expect(await screen.findByTestId('track-list')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /UBC-2026-00042/ })).toHaveAttribute(
      'href',
      '/usafi-bora/track/b1',
    );
    expect(screen.getByRole('link', { name: /UBC-2026-00010/ })).toBeInTheDocument();
  });
});
