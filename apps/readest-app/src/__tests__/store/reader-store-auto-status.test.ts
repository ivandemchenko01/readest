import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { Book, PageInfo, TimeInfo } from '@/types/book';
import type { TOCItem } from '@/libs/document';

vi.mock('@/store/bookDataStore', async () => {
  const { create } = await import('zustand');
  return {
    useBookDataStore: create(() => ({
      booksData: { abc: { isFixedLayout: false, config: {} } } as Record<string, unknown>,
      clearBookData: vi.fn(),
    })),
  };
});
vi.mock('@/store/settingsStore', async () => {
  const { create } = await import('zustand');
  return { useSettingsStore: create(() => ({ settings: {} })) };
});
const library = vi.hoisted(() => ({ book: null as Book | null }));
vi.mock('@/store/libraryStore', async () => {
  const { create } = await import('zustand');
  return {
    useLibraryStore: create(() => ({
      getBookByHash: () => library.book,
      updateBookProgress: vi.fn(
        (_hash: string, progress: [number, number], readingStatus: Book['readingStatus']) => {
          library.book = { ...library.book!, progress, readingStatus };
        },
      ),
    })),
  };
});
vi.mock('@/services/nav', () => ({ updateToc: vi.fn() }));
vi.mock('@/libs/document', () => ({ DocumentLoader: vi.fn() }));
vi.mock('@/services/opds/pseStream', () => ({
  isPseStreamFileName: () => false,
  openPseStreamBook: vi.fn(),
  parsePseStreamFileName: vi.fn(),
}));
vi.mock('@/services/rss/feedBookUrl', () => ({ isFeedBookUrl: () => false }));
vi.mock('@/services/rss/feedReader', () => ({ openFeedBookDoc: vi.fn() }));

import { useReaderStore } from '@/store/readerStore';
import { useFinishPromptStore } from '@/store/finishPromptStore';

const KEY = 'abc-view1';
const TOTAL = 100;

const seed = (overrides: Partial<Book> = {}) => {
  library.book = {
    hash: 'abc',
    format: 'EPUB',
    title: 'T',
    author: 'A',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
  useReaderStore.setState({
    viewStates: {
      [KEY]: { key: KEY, isPrimary: true } as never,
    },
  });
  useFinishPromptStore.setState({ pending: null });
};

const turnTo = (page: number) => {
  const info: PageInfo = { current: page - 1, total: TOTAL };
  useReaderStore
    .getState()
    .setProgress(
      KEY,
      `loc-${page}`,
      {} as TOCItem,
      undefined,
      info,
      info,
      {} as TimeInfo,
      {} as Range,
      page / TOTAL,
    );
};

describe('reader auto status', () => {
  beforeEach(() => {
    useReaderStore.getState().clearViewState(KEY);
  });

  test('marks the book Reading on the third page turn of a session', () => {
    seed({ readingStatus: 'unread' });
    turnTo(10); // opening position: not a turn
    turnTo(11);
    turnTo(12);
    expect(library.book?.readingStatus).toBe('unread');
    turnTo(13);
    expect(library.book?.readingStatus).toBe('reading');
  });

  test('no longer clears Want to Read on the first page turn', () => {
    seed({ readingStatus: 'unread' });
    turnTo(10);
    turnTo(11);
    expect(library.book?.readingStatus).toBe('unread');
  });

  test('keeps a finished book finished', () => {
    seed({ readingStatus: 'finished' });
    for (const page of [1, 2, 3, 4, 5]) turnTo(page);
    expect(library.book?.readingStatus).toBe('finished');
    expect(useFinishPromptStore.getState().pending).toBeNull();
  });

  test('finishes the book at 100% and queues the finish prompt for after the reader', () => {
    seed({ readingStatus: 'reading' });
    turnTo(99);
    turnTo(100);
    expect(library.book?.readingStatus).toBe('finished');
    expect(useFinishPromptStore.getState().pending).toEqual({
      bookHash: 'abc',
      mode: 'finished',
      deferred: true,
    });
  });

  test('closing a book at 95% or more asks whether it was finished', () => {
    seed({ readingStatus: 'reading' });
    turnTo(96);
    useReaderStore.getState().clearViewState(KEY);
    expect(useFinishPromptStore.getState().pending).toEqual({
      bookHash: 'abc',
      mode: 'confirm',
      deferred: true,
    });
  });

  test('closing a book below 95% asks nothing', () => {
    seed({ readingStatus: 'reading' });
    turnTo(50);
    useReaderStore.getState().clearViewState(KEY);
    expect(useFinishPromptStore.getState().pending).toBeNull();
  });

  test('a new session counts its page turns from zero', () => {
    seed({ readingStatus: undefined });
    turnTo(1);
    turnTo(2);
    turnTo(3);
    useReaderStore.getState().clearViewState(KEY);
    seed({ readingStatus: undefined });
    turnTo(3);
    turnTo(4);
    expect(library.book?.readingStatus).toBeUndefined();
  });
});
