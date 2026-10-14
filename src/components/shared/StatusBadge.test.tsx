import { render, screen } from '@testing-library/react';
import { BOOKING_STATUSES } from '@shared/enums';
import { FlagBadge, StatusBadge } from './StatusBadge';

describe('<StatusBadge>', () => {
  it.each(BOOKING_STATUSES)('renders a label and icon for %s', (status) => {
    const { container } = render(<StatusBadge status={status} />);
    expect(screen.getByText(/\S/)).toBeInTheDocument();
    expect(container.querySelector('svg')).not.toBeNull();
    expect(container.firstChild).toHaveAttribute('data-status', status);
  });

  it('uses translated copy', () => {
    render(<StatusBadge status="AWAITING_CUSTOMER_APPROVAL" />);
    expect(screen.getByText('Awaiting customer approval')).toBeInTheDocument();
  });

  it('renders flags', () => {
    render(<FlagBadge flag="NEEDS_REVIEW" />);
    expect(screen.getByText('Needs review')).toBeInTheDocument();
  });
});
