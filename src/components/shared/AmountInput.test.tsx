import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { AmountInput } from './AmountInput';

function Harness({ onValue }: { onValue: (v: number | null) => void }) {
  const [v, setV] = useState<number | null>(null);
  return (
    <AmountInput
      label="Quote amount"
      value={v}
      onChange={(n) => {
        setV(n);
        onValue(n);
      }}
    />
  );
}

describe('<AmountInput>', () => {
  it('groups digits as you type and emits an integer', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText(/quote amount/i);
    await userEvent.type(input, '75000');
    expect(input).toHaveValue('75,000');
    expect(onValue).toHaveBeenLastCalledWith(75000);
  });

  it('ignores decimal input', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    const input = screen.getByLabelText(/quote amount/i);
    await userEvent.type(input, '75.5');
    expect(input).toHaveValue('755');
  });

  it('shows the TZS prefix and server error', () => {
    render(<AmountInput label="Amount" value={1000} onChange={() => {}} error="Minimum TZS 45,000." />);
    expect(screen.getByText('TZS')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Minimum TZS 45,000.');
  });
});
