import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorState } from './ErrorState';

describe('<ErrorState>', () => {
  it('explains what happened with generic copy by default', () => {
    render(<ErrorState />);
    expect(screen.getByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('only offers Retry when the caller says it is safe', async () => {
    const onRetry = vi.fn();
    render(<ErrorState onRetry={onRetry} />);
    await userEvent.click(screen.getByRole('button', { name: /retry/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it('has offline copy', () => {
    render(<ErrorState offline />);
    expect(screen.getByText('You are offline')).toBeInTheDocument();
  });
});
