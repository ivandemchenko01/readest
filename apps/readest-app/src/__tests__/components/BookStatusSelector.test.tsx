import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { Book } from '@/types/book';
import { useLibraryStore } from '@/store/libraryStore';
import { useFinishPromptStore } from '@/store/finishPromptStore';
import BookStatusSelector from '@/components/metadata/BookStatusSelector';

const saveLibraryBooks = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (s: string) => s,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({
    envConfig: { getAppService: async () => ({ saveLibraryBooks }) },
    appService: null,
  }),
}));

const book: Book = {
  hash: 'abc',
  format: 'EPUB',
  title: 'T',
  author: 'A',
  createdAt: 0,
  updatedAt: 0,
};

const storedBook = () => useLibraryStore.getState().getBookByHash('abc');
const button = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  saveLibraryBooks.mockClear();
  useLibraryStore.getState().setLibrary([book]);
  useFinishPromptStore.setState({ pending: null });
});

afterEach(() => cleanup());

describe('BookStatusSelector', () => {
  it('renders the four buckets with Library active for a statusless book', () => {
    render(<BookStatusSelector book={book} />);
    for (const name of ['Want to Read', 'Reading', 'Finished']) {
      expect(button(name).getAttribute('aria-pressed')).toBe('false');
    }
    expect(button('Library').getAttribute('aria-pressed')).toBe('true');
  });

  it('inverts the active segment in e-ink mode so its label stays visible', () => {
    useLibraryStore.getState().setLibrary([{ ...book, readingStatus: 'reading' }]);
    render(<BookStatusSelector book={book} />);
    expect(button('Reading').className).toContain('eink-inverted');
    expect(button('Finished').className).not.toContain('eink-inverted');
  });

  it('saves the picked status via withReadingStatus and reflects it immediately', async () => {
    render(<BookStatusSelector book={book} />);

    await act(async () => fireEvent.click(button('Reading')));

    expect(storedBook()?.readingStatus).toBe('reading');
    expect(storedBook()?.readingStatusUpdatedAt).toBeGreaterThan(0);
    expect(saveLibraryBooks).toHaveBeenCalledTimes(1);
    expect(button('Reading').getAttribute('aria-pressed')).toBe('true');
    expect(useFinishPromptStore.getState().pending).toBeNull();
  });

  it('marks the book finished and asks for a rating', async () => {
    render(<BookStatusSelector book={book} />);

    await act(async () => fireEvent.click(button('Finished')));

    expect(storedBook()?.readingStatus).toBe('finished');
    expect(useFinishPromptStore.getState().pending).toEqual({
      bookHash: 'abc',
      mode: 'finished',
      deferred: false,
    });
  });

  it('moves the book to Library by clearing its status', async () => {
    useLibraryStore.getState().setLibrary([{ ...book, readingStatus: 'unread' }]);
    render(<BookStatusSelector book={book} />);
    expect(button('Want to Read').getAttribute('aria-pressed')).toBe('true');

    await act(async () => fireEvent.click(button('Library')));

    expect(storedBook()?.readingStatus).toBeUndefined();
    expect(button('Library').getAttribute('aria-pressed')).toBe('true');
  });

  it('does nothing when the active bucket is tapped again', async () => {
    useLibraryStore.getState().setLibrary([{ ...book, readingStatus: 'unread' }]);
    render(<BookStatusSelector book={book} />);

    await act(async () => fireEvent.click(button('Want to Read')));

    expect(storedBook()?.readingStatus).toBe('unread');
    expect(saveLibraryBooks).not.toHaveBeenCalled();
  });

  it('shows a statusless book with progress, or a legacy on-hold one, as Library', () => {
    useLibraryStore.getState().setLibrary([{ ...book, progress: [3, 10] }]);
    const { unmount } = render(<BookStatusSelector book={book} />);
    expect(button('Library').getAttribute('aria-pressed')).toBe('true');
    unmount();
    useLibraryStore.getState().setLibrary([{ ...book, readingStatus: 'abandoned' }]);
    render(<BookStatusSelector book={book} />);
    expect(button('Library').getAttribute('aria-pressed')).toBe('true');
  });
});
