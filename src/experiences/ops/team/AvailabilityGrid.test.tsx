import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AvailabilityRow } from './api';
import { gridErrors, gridFromRows, gridToRules, WEEKDAYS } from './availability-grid-model';
import { AvailabilityGrid } from './AvailabilityGrid';

function row(partial: Partial<AvailabilityRow>): AvailabilityRow {
  return {
    id: 'x',
    staff_id: 's',
    weekday: null,
    date: null,
    date_to: null,
    start_time: null,
    end_time: null,
    is_off: false,
    reason: null,
    ...partial,
  };
}

describe('availability grid model', () => {
  it('no weekly rows means company hours', () => {
    const g = gridFromRows([row({ date: '2026-10-20', is_off: true })]);
    expect(g.custom).toBe(false);
    expect(gridToRules(g)).toEqual([]);
  });

  it('reads weekly rows Monday-first and writes every weekday back', () => {
    const g = gridFromRows([
      row({ weekday: 1, start_time: '08:00:00', end_time: '17:00:00' }),
      row({ weekday: 6, is_off: true }),
    ]);
    expect(g.custom).toBe(true);
    expect(g.days.map((d) => d.weekday)).toEqual([...WEEKDAYS]);
    expect(g.days[0]).toEqual({ weekday: 1, works: true, start: '08:00', end: '17:00' });
    expect(g.days[5]?.works).toBe(false);
    const rules = gridToRules(g);
    expect(rules).toHaveLength(7);
    expect(rules[0]).toEqual({ weekday: 1, start_time: '08:00', end_time: '17:00', is_off: false });
    expect(rules[6]).toEqual({ weekday: 0, start_time: null, end_time: null, is_off: true });
  });

  it('flags inverted or missing time ranges', () => {
    const g = gridFromRows([row({ weekday: 1, start_time: '09:00', end_time: '17:00' })]);
    g.days[0]!.end = '08:00';
    expect(gridErrors(g)).toEqual({ 1: 'validation.time_range' });
    g.custom = false;
    expect(gridErrors(g)).toEqual({});
  });
});

describe('<AvailabilityGrid>', () => {
  it('saves the edited pattern and refuses invalid ranges', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    render(<AvailabilityGrid initial={gridFromRows([])} saving={false} onSave={onSave} />);

    expect(screen.queryByTestId('availability-grid')).not.toBeInTheDocument();
    await user.click(screen.getByRole('switch', { name: /Custom weekly hours/ }));
    expect(screen.getByTestId('availability-grid')).toBeInTheDocument();

    await user.click(screen.getByRole('switch', { name: 'Monday' }));
    const end = screen.getByLabelText('Monday end');
    await user.clear(end);
    await user.type(end, '07:00');
    await user.click(screen.getByRole('button', { name: /Save hours/ }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText(/End time must be after start time/)).toBeInTheDocument();

    await user.clear(end);
    await user.type(end, '16:00');
    await user.click(screen.getByRole('button', { name: /Save hours/ }));
    expect(onSave).toHaveBeenCalledTimes(1);
    const rules = onSave.mock.calls[0]?.[0] as ReturnType<typeof gridToRules>;
    expect(rules.find((r) => r.weekday === 1)).toEqual({
      weekday: 1,
      start_time: '08:00',
      end_time: '16:00',
      is_off: false,
    });
    expect(rules.filter((r) => r.is_off)).toHaveLength(6);
  }, 20_000);
});
