import { render, screen } from '@testing-library/react';
import { Progress } from './progress';

describe('<Progress>', () => {
  it('exposes its value through the progressbar role', () => {
    render(<Progress value={40} label="Uploading" />);
    const bar = screen.getByRole('progressbar', { name: 'Uploading' });
    expect(bar).toHaveAttribute('aria-valuenow', '40');
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '100');
  });

  it('clamps the fill between 0% and 100%', () => {
    const { rerender } = render(<Progress value={150} label="x" />);
    const fill = () => screen.getByRole('progressbar', { name: 'x' }).firstElementChild as HTMLElement;
    expect(fill().style.width).toBe('100%');
    rerender(<Progress value={-20} label="x" />);
    expect(fill().style.width).toBe('0%');
  });

  it('supports a custom max', () => {
    render(<Progress value={1} max={4} label="steps" />);
    const bar = screen.getByRole('progressbar', { name: 'steps' });
    expect(bar).toHaveAttribute('aria-valuemax', '4');
    expect((bar.firstElementChild as HTMLElement).style.width).toBe('25%');
  });
});
