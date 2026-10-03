import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import HourBars from '@/components/stats/HourBars';

afterEach(() => cleanup());

describe('HourBars', () => {
  it('draws one bar per hour, scaled to the busiest hour', () => {
    const secs = new Array<number>(24).fill(0);
    secs[8] = 600;
    secs[21] = 1200;
    const { container } = render(<HourBars secs={secs} />);
    const bars = container.querySelectorAll('rect[data-hour]');
    expect(bars).toHaveLength(24);
    const height = (h: number) => Number(bars[h]!.getAttribute('height'));
    expect(height(21)).toBeGreaterThan(height(8));
    expect(height(8)).toBeCloseTo(height(21) / 2, 5);
    expect(height(0)).toBe(0);
  });

  it('labels the quarter hours of the day', () => {
    const { getByText } = render(<HourBars secs={new Array<number>(24).fill(0)} />);
    for (const label of ['0', '6', '12', '18']) expect(getByText(label)).toBeTruthy();
  });
});
