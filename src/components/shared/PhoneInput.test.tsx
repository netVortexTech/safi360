import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { PhoneInput } from './PhoneInput';

function Harness({ onE164 }: { onE164: (v: string | null) => void }) {
  const [raw, setRaw] = useState('');
  return (
    <PhoneInput
      label="Phone number"
      required
      value={raw}
      onChange={(r, e164) => {
        setRaw(r);
        onE164(e164);
      }}
    />
  );
}

describe('<PhoneInput>', () => {
  it('normalises to E.164 and shows the formatted hint', async () => {
    const onE164 = vi.fn();
    render(<Harness onE164={onE164} />);
    await userEvent.type(screen.getByLabelText(/phone number/i), '754 123 456');
    expect(onE164).toHaveBeenLastCalledWith('+255754123456');
    expect(screen.getByText('Shown as +255 754 123 456')).toBeInTheDocument();
  });

  it('shows an inline error after blur when the number is short', async () => {
    const onE164 = vi.fn();
    render(<Harness onE164={onE164} />);
    const input = screen.getByLabelText(/phone number/i);
    await userEvent.type(input, '754 12');
    await userEvent.tab();
    expect(onE164).toHaveBeenLastCalledWith(null);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter 9 digits after +255.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
  });

  it('prefers a server error over local validation', () => {
    render(<PhoneInput label="Phone" value="754123456" onChange={() => {}} error="Already used" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Already used');
  });
});
