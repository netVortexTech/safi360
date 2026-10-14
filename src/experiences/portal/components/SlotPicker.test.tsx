import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Slot } from '@shared/availability/slots';
import { SlotPicker } from './SlotPicker';

const slot = (date: string, hhmmUtc: string, capacity = 2): Slot => ({
  start: `${date}T${hhmmUtc}:00.000Z`,
  end: `${date}T${hhmmUtc}:00.000Z`,
  date,
  staff_ids: [],
  capacity,
});

describe('<SlotPicker>', () => {
  it('groups slots by day, shows Dar times and capacity, and reports the chosen one', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <SlotPicker
        slots={[slot('2026-10-16', '06:00'), slot('2026-10-16', '07:00', 1), slot('2026-10-17', '06:00')]}
        loading={false}
        weekStart="2026-10-16"
        minWeekStart="2026-10-16"
        onWeekChange={vi.fn()}
        selectedStart={null}
        onSelect={onSelect}
        locale="en"
      />,
    );
    const friday = within(screen.getByRole('region', { name: /Fri 16 Oct 2026/ }));
    expect(friday.getByRole('button', { name: /9:00 AM/ })).toHaveTextContent('2 teams left');
    expect(friday.getByRole('button', { name: /10:00 AM/ })).toHaveTextContent('1 team left');
    expect(screen.getByRole('region', { name: /Sat 17 Oct 2026/ })).toBeInTheDocument();
    await user.click(friday.getByRole('button', { name: /10:00 AM/ }));
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ start: '2026-10-16T07:00:00.000Z' }));
  });

  it('cannot go before the current week and explains an empty week', () => {
    const onWeekChange = vi.fn();
    render(
      <SlotPicker
        slots={[]}
        loading={false}
        weekStart="2026-10-16"
        minWeekStart="2026-10-16"
        onWeekChange={onWeekChange}
        selectedStart={null}
        onSelect={vi.fn()}
        locale="en"
      />,
    );
    expect(screen.getByRole('button', { name: /Previous week/ })).toBeDisabled();
    expect(screen.getByText(/No free slots this week/)).toBeInTheDocument();
  });
});
