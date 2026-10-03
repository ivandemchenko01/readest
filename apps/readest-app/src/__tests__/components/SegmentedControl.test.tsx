import { describe, test, expect, vi, afterEach } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import SegmentedControl from '@/components/SegmentedControl';

const options = [
  { value: 'a', label: 'A' },
  { value: 'b', label: 'B' },
] as const;

describe('SegmentedControl', () => {
  afterEach(cleanup);

  test('primary tone fills the active segment with the primary colour', () => {
    render(<SegmentedControl options={options} value='a' onChange={vi.fn()} />);
    const active = screen.getByRole('radio', { name: 'A' });
    expect(active.className).toContain('bg-primary');
    expect(active.className).toContain('eink-inverted');
  });

  test('contrast tone fills the active segment with the text colour', () => {
    render(<SegmentedControl options={options} value='b' onChange={vi.fn()} tone='contrast' />);
    const active = screen.getByRole('radio', { name: 'B' });
    expect(active.className).toContain('bg-base-content');
    expect(active.className).toContain('text-base-100');
    expect(active.className).not.toContain('bg-primary');
    expect(screen.getByRole('radio', { name: 'A' }).className).not.toContain('bg-base-content');
  });
});
