import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, fireEvent, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  open: vi.fn(),
  push: vi.fn(),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, o?: Record<string, number>) =>
    o ? `${s}:${JSON.stringify(o)}` : s,
}));
vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: {} }),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('@/services/statistics/statisticsDb', () => ({
  StatisticsDb: { open: mocks.open },
}));

import { useState } from 'react';
import BookStatsSection from '@/components/metadata/BookStatsSection';

const Harness = ({ initial = false }: { initial?: boolean }) => {
  const [expanded, setExpanded] = useState(initial);
  return (
    <BookStatsSection bookHash='h1' expanded={expanded} onToggle={() => setExpanded((e) => !e)} />
  );
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('BookStatsSection', () => {
  it('does not open the statistics DB while collapsed', () => {
    render(<Harness />);
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it('loads the book figures when expanded and links to the full screen', async () => {
    mocks.open.mockResolvedValue({
      getDailyReadingSecs: vi.fn().mockResolvedValue([]),
      getBookSummary: vi.fn().mockResolvedValue({
        totalSecs: 3900,
        days: 4,
        firstRead: 0,
        lastRead: 0,
        pages: 10,
      }),
    });
    const { getByText } = render(<Harness />);
    fireEvent.click(getByText('Statistics'));
    await waitFor(() => expect(getByText('4')).toBeTruthy());
    expect(getByText('{{hours}}h {{minutes}}m:{"hours":1,"minutes":5}')).toBeTruthy();
    fireEvent.click(getByText('More'));
    expect(mocks.push).toHaveBeenCalledWith('/statistics?book=h1');
  });
});
