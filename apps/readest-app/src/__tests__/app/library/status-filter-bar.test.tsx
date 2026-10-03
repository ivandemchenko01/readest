import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import StatusFilterBar from '@/app/library/components/StatusFilterBar';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string) => s,
}));

const counts = { all: 9, reading: 2, unread: 3, finished: 1, library: 3 };

afterEach(() => cleanup());

describe('StatusFilterBar', () => {
  it('renders one chip per filter, in order, each with its count', () => {
    render(<StatusFilterBar value='all' counts={counts} onChange={vi.fn()} />);
    expect(screen.getAllByRole('button').map((el) => el.textContent)).toEqual([
      'All books9',
      'Reading2',
      'Want to Read3',
      'Finished1',
      'Library3',
    ]);
  });

  it('marks the active chip as pressed', () => {
    render(<StatusFilterBar value='finished' counts={counts} onChange={vi.fn()} />);
    const pressed = screen
      .getAllByRole('button')
      .filter((el) => el.getAttribute('aria-pressed') === 'true');
    expect(pressed.map((el) => el.textContent)).toEqual(['Finished1']);
  });

  it('reports the picked filter', () => {
    const onChange = vi.fn();
    render(<StatusFilterBar value='all' counts={counts} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: /Want to Read/ }));
    expect(onChange).toHaveBeenCalledWith('unread');
  });
});
