import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { Book } from '@/types/book';
import { useLibraryStore } from '@/store/libraryStore';
import { useFinishPromptStore } from '@/store/finishPromptStore';
import FinishBookDialog from '@/components/metadata/FinishBookDialog';
import FinishPromptHost from '@/components/metadata/FinishPromptHost';

const saveLibraryBooks = vi.hoisted(() => vi.fn(async () => {}));
const db = vi.hoisted(() => ({
  getDailyReadingSecs: vi.fn(async () => [{ day: 20000, secs: 3600 }]),
  getBookSummary: vi.fn(async () => ({
    totalSecs: 5400,
    days: 3,
    firstRead: 0,
    lastRead: 0,
    pages: 10,
  })),
}));
const openDb = vi.hoisted(() => vi.fn(async () => db));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string, o?: Record<string, unknown>) =>
    o ? s.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k])) : s,
}));
const env = vi.hoisted(() => ({
  envConfig: { getAppService: async () => ({ saveLibraryBooks }) },
  appService: {},
}));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => env }));
vi.mock('@/services/statistics/statisticsDb', () => ({ StatisticsDb: { open: openDb } }));
vi.mock('@/components/Dialog', () => ({
  __esModule: true,
  default: ({ children, isOpen }: { children: React.ReactNode; isOpen: boolean }) =>
    isOpen ? <div>{children}</div> : null,
}));
vi.mock('@/components/stats/MinutesLineChart', () => ({
  __esModule: true,
  default: ({ values }: { values: (number | null)[] }) => (
    <div data-testid='chart'>{values.join(',')}</div>
  ),
}));

const book: Book = {
  hash: 'abc',
  format: 'EPUB',
  title: 'Dune',
  author: 'Frank Herbert',
  createdAt: 0,
  updatedAt: 0,
  readingStatus: 'reading',
  progress: [97, 100],
};

const stored = () => useLibraryStore.getState().getBookByHash('abc')!;
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  saveLibraryBooks.mockClear();
  openDb.mockClear();
  useLibraryStore.getState().setLibrary([book]);
  useFinishPromptStore.setState({ pending: null });
});
afterEach(() => cleanup());

describe('FinishBookDialog', () => {
  it('asks whether the book was finished, with 5 stars, a review box and its history', async () => {
    await act(async () => {
      render(<FinishBookDialog book={book} mode='confirm' onClose={vi.fn()} />);
    });
    expect(screen.getByRole('heading', { name: 'Finished «Dune»?' })).toBeTruthy();
    expect(screen.getByText('How was it?')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /out of 5/ })).toHaveLength(5);
    expect(screen.getByRole('textbox', { name: 'My review' })).toBeTruthy();
    expect(screen.getByTestId('chart').textContent).toBe('60');
    expect(screen.getByText('1h 30m')).toBeTruthy();
    expect(screen.getByText('3')).toBeTruthy();
    expect(button('Mark as Finished')).toBeTruthy();
    expect(button('Still reading')).toBeTruthy();
    expect(openDb).toHaveBeenCalledTimes(1);
  });

  it('marks the book finished with its rating and review', async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(<FinishBookDialog book={book} mode='confirm' onClose={onClose} />);
    });
    fireEvent.click(button('Rate 4 out of 5'));
    fireEvent.change(screen.getByRole('textbox', { name: 'My review' }), {
      target: { value: 'Spice!' },
    });
    await act(async () => fireEvent.click(button('Mark as Finished')));

    expect(stored()).toMatchObject({ readingStatus: 'finished', rating: 4, review: 'Spice!' });
    expect(stored().ratingUpdatedAt).toBeGreaterThan(0);
    expect(saveLibraryBooks).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the status when the reader is still reading', async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(<FinishBookDialog book={book} mode='confirm' onClose={onClose} />);
    });
    fireEvent.click(button('Still reading'));
    expect(stored().readingStatus).toBe('reading');
    expect(saveLibraryBooks).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('saves only the rating of an already finished book, without bumping updatedAt', async () => {
    const finished = { ...book, readingStatus: 'finished' as const, readingStatusUpdatedAt: 5 };
    useLibraryStore.getState().setLibrary([finished]);
    await act(async () => {
      render(<FinishBookDialog book={finished} mode='finished' onClose={vi.fn()} />);
    });
    expect(button('Skip')).toBeTruthy();
    fireEvent.click(button('Rate 5 out of 5'));
    await act(async () => fireEvent.click(button('Save')));

    expect(stored()).toMatchObject({ rating: 5, updatedAt: 0, readingStatusUpdatedAt: 5 });
  });

  it('skips without saving anything', async () => {
    const onClose = vi.fn();
    await act(async () => {
      render(<FinishBookDialog book={book} mode='finished' onClose={onClose} />);
    });
    fireEvent.click(button('Skip'));
    expect(saveLibraryBooks).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });
});

describe('FinishPromptHost', () => {
  it('shows the pending prompt and clears it on close', async () => {
    useFinishPromptStore.setState({
      pending: { bookHash: 'abc', mode: 'finished', deferred: true },
    });
    await act(async () => {
      render(<FinishPromptHost />);
    });
    fireEvent.click(button('Skip'));
    expect(useFinishPromptStore.getState().pending).toBeNull();
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
  });

  it('leaves a deferred prompt for the library when told to show immediate ones only', async () => {
    useFinishPromptStore.setState({
      pending: { bookHash: 'abc', mode: 'finished', deferred: true },
    });
    await act(async () => {
      render(<FinishPromptHost immediateOnly />);
    });
    expect(screen.queryByRole('button', { name: 'Skip' })).toBeNull();
    expect(openDb).not.toHaveBeenCalled();
  });
});
