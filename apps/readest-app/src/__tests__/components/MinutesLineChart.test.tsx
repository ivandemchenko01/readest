import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import MinutesLineChart from '@/components/stats/MinutesLineChart';

afterEach(() => cleanup());

describe('MinutesLineChart', () => {
  it('draws one point per known value and stops at null (future) days', () => {
    const { container } = render(
      <MinutesLineChart
        values={[10, 0, 45, null, null]}
        labels={['M', 'T', 'W', 'T', 'F']}
        describe={(i) => `day ${i}`}
      />,
    );
    const line = container.querySelector('path')!;
    // Move + one cubic segment per following known point.
    expect(line.getAttribute('d')!.match(/C/g)).toHaveLength(2);
    expect(line.getAttribute('stroke-width')).toBe('1.5');
    expect(container.querySelectorAll('circle')).toHaveLength(3);
  });

  it('renders without a describe callback', () => {
    const { container } = render(<MinutesLineChart values={[1, 2, 3]} labels={['a', 'b', 'c']} />);
    expect(container.querySelectorAll('circle')).toHaveLength(3);
  });

  it('anchors the last x label at its end so it stays inside the chart', () => {
    const { getByText } = render(
      <MinutesLineChart values={[1, 2, 3]} labels={['a', '', 'Today']} describe={() => ''} />,
    );
    expect(getByText('Today').getAttribute('text-anchor')).toBe('end');
    expect(getByText('a').getAttribute('text-anchor')).toBe('middle');
  });

  it('labels the y axis with a nice maximum and its half', () => {
    const { getByText } = render(
      <MinutesLineChart values={[10, 47]} labels={['a', 'b']} describe={() => ''} />,
    );
    expect(getByText('60')).toBeTruthy();
    expect(getByText('30')).toBeTruthy();
    expect(getByText('a')).toBeTruthy();
  });

  it('shows the tapped point description under the chart', () => {
    const { getAllByRole, getByText } = render(
      <MinutesLineChart values={[10, 20]} labels={['a', 'b']} describe={(i) => `value ${i}`} />,
    );
    fireEvent.click(getAllByRole('button')[1]!);
    expect(getByText('value 1')).toBeTruthy();
  });
});
