import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { Book } from '@/types/book';
import { useLibraryStore } from '@/store/libraryStore';
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
});

afterEach(() => cleanup());

describe('BookStatusSelector', () => {
  it('renders the four statuses with none active for a statusless book', () => {
    render(<BookStatusSelector book={book} />);
    for (const name of ['Want to Read', 'Reading', 'Finished', 'On hold']) {
      expect(button(name).getAttribute('aria-pressed')).toBe('false');
    }
  });

  it('saves the picked status via withReadingStatus and reflects it immediately', async () => {
    render(<BookStatusSelector book={book} />);

    await act(async () => fireEvent.click(button('Finished')));

    expect(storedBook()?.readingStatus).toBe('finished');
    expect(storedBook()?.readingStatusUpdatedAt).toBeGreaterThan(0);
    expect(saveLibraryBooks).toHaveBeenCalledTimes(1);
    expect(button('Finished').getAttribute('aria-pressed')).toBe('true');
  });

  it('clears the status when the active one is tapped again', async () => {
    useLibraryStore.getState().setLibrary([{ ...book, readingStatus: 'unread' }]);
    render(<BookStatusSelector book={book} />);
    expect(button('Want to Read').getAttribute('aria-pressed')).toBe('true');

    await act(async () => fireEvent.click(button('Want to Read')));

    expect(storedBook()?.readingStatus).toBeUndefined();
    expect(button('Want to Read').getAttribute('aria-pressed')).toBe('false');
  });

  it('shows a statusless book with progress as Reading', () => {
    useLibraryStore.getState().setLibrary([{ ...book, progress: [3, 10] }]);
    render(<BookStatusSelector book={book} />);
    expect(button('Reading').getAttribute('aria-pressed')).toBe('true');
  });
});
