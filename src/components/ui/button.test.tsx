import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';

describe('<Button>', () => {
  it('renders its label and handles clicks', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Assign cleaner</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Assign cleaner' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('is disabled, busy and shows the progressive label while loading', () => {
    render(
      <Button loading loadingLabel="Assigning…">
        Assign cleaner
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByText('Assigning…')).toBeVisible();
    // The idle label stays in the DOM (reserving width) but is hidden from AT.
    expect(screen.getByText('Assign cleaner')).toHaveClass('invisible');
  });

  it('does not fire clicks while loading', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole('button'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('supports asChild for links', () => {
    render(
      <Button asChild>
        <a href="/ops/tickets">View all tickets</a>
      </Button>,
    );
    expect(screen.getByRole('link', { name: 'View all tickets' })).toHaveAttribute('href', '/ops/tickets');
  });
});
