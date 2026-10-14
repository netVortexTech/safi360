import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { emptyServiceForm, type ServiceFormValues } from './service-form-schema';
import { ServiceForm, type ServiceFormProps } from './ServiceForm';

const settings = {
  deposit_pct: 30,
  quote_expiry_hours: 144,
  tax: { mode: 'none' as const, rate_pct: 18, label: 'VAT' },
};

function renderForm(over: Partial<ServiceFormProps> = {}) {
  const onSubmit = vi.fn();
  const props: ServiceFormProps = {
    initial: emptyServiceForm(),
    categories: [{ id: 'c1', name_sw: 'Sofa', name_en: 'Sofa & upholstery', sort: 0 }],
    settings,
    locale: 'en',
    isNew: true,
    saving: false,
    onSubmit,
    onCancel: vi.fn(),
    onAddCategory: vi.fn(),
    ...over,
  };
  const router = createMemoryRouter([{ path: '/', element: <ServiceForm {...props} /> }]);
  render(<RouterProvider router={router} />);
  return { onSubmit };
}

describe('<ServiceForm>', () => {
  it('shows only the fields of the chosen pricing model', async () => {
    const user = userEvent.setup();
    renderForm();
    const fields = () => within(screen.getByTestId('pricing-rule-fields'));
    expect(fields().getByLabelText(/^Price/)).toBeInTheDocument();
    expect(fields().queryByLabelText(/Minimum seats/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Per seat/ }));
    expect(fields().getByLabelText(/Price per seat/)).toBeInTheDocument();
    expect(fields().getByLabelText(/Minimum seats/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /By size or type/ }));
    expect(screen.getByRole('button', { name: /Add size or type/ })).toBeInTheDocument();
    expect(fields().queryByLabelText(/Price per seat/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Quote after inspection/ }));
    expect(fields().getByLabelText(/Starting price/)).toBeInTheDocument();
    expect(screen.getByText(/no price is charged until your team inspects/)).toBeInTheDocument();
  }, 20_000);

  it('previews the customer price live from the same engine', async () => {
    const user = userEvent.setup();
    renderForm();
    const preview = () => within(screen.getByTestId('price-preview'));
    expect(preview().getByText(/Finish the pricing fields/)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: /Per seat/ }));
    await user.type(screen.getByLabelText(/Price per seat/), '15000');
    await user.type(screen.getByLabelText(/Minimum charge/), '45000');
    await user.clear(preview().getByLabelText(/Seats/));
    await user.type(preview().getByLabelText(/Seats/), '2');

    const summary = within(screen.getByTestId('price-summary'));
    expect(summary.getByText('TZS 30,000')).toBeInTheDocument(); // 2 × 15,000
    expect(summary.getByText(/Minimum charge adjustment/)).toBeInTheDocument();
    expect(summary.getAllByText('TZS 45,000').length).toBeGreaterThan(0);
  }, 20_000);

  it('blocks submit with inline errors and keeps typed values', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText(/Name \(English\)/), 'Sofa cleaning');
    await user.click(screen.getByRole('button', { name: /Create service/ }));

    await waitFor(() => {
      const alerts = screen.getAllByRole('alert').filter((a) => a.textContent?.trim());
      expect(alerts.length).toBeGreaterThanOrEqual(2); // Swahili name + price
    });
    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Name \(English\)/)).toHaveValue('Sofa cleaning');
  }, 20_000);

  it('submits a reduced rule for the chosen model', async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await user.type(screen.getByLabelText(/Name \(English\)/), 'Fumigation');
    await user.type(screen.getByLabelText(/Name \(Swahili\)/), 'Kufukiza');
    await user.type(within(screen.getByTestId('pricing-rule-fields')).getByLabelText(/^Price/), '120000');
    await user.click(screen.getByRole('button', { name: /Create service/ }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const values = onSubmit.mock.calls[0]?.[0] as ServiceFormValues;
    expect(values.pricing_type).toBe('FLAT');
    expect(values.pricing_rule.price_tzs).toBe(120000);
    expect(values.name_sw).toBe('Kufukiza');
  }, 20_000);
});
