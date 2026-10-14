import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { TicketChip } from './TicketChip';

describe('<TicketChip>', () => {
  it('renders the reference as a link when `to` is given', () => {
    render(
      <MemoryRouter>
        <TicketChip ticketRef="UBC-2026-00042" to="/ops/tickets/UBC-2026-00042" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'UBC-2026-00042' })).toHaveAttribute(
      'href',
      '/ops/tickets/UBC-2026-00042',
    );
  });

  it('copies the reference and announces it', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <MemoryRouter>
        <TicketChip ticketRef="UBC-2026-00042" />
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Copy ticket number' }));
    expect(writeText).toHaveBeenCalledWith('UBC-2026-00042');
    expect(await screen.findByRole('status')).toHaveTextContent('Ticket number copied');
  });
});
