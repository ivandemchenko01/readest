import { describe, expect, it } from 'vitest';

import {
  countBooksByStatus,
  ensureLibraryStatusFilter,
  filterBooksByStatus,
  getBookStatusCategory,
} from '@/app/library/utils/libraryUtils';
import type { Book } from '@/types/book';

const createBook = (overrides: Partial<Book> = {}): Book => ({
  hash: overrides.hash ?? 'h',
  format: 'EPUB',
  title: 'T',
  author: 'A',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

const books = [
  createBook({ hash: 'never-opened' }),
  createBook({ hash: 'want', readingStatus: 'unread' }),
  createBook({ hash: 'in-progress', progress: [10, 100] }),
  createBook({ hash: 'marked-reading', readingStatus: 'reading' }),
  createBook({ hash: 'done', readingStatus: 'finished', progress: [100, 100] }),
  createBook({ hash: 'parked', readingStatus: 'abandoned', progress: [30, 100] }),
];

describe('getBookStatusCategory', () => {
  it('maps every book to exactly one UI status', () => {
    expect(Object.fromEntries(books.map((b) => [b.hash, getBookStatusCategory(b)]))).toEqual({
      'never-opened': 'none',
      want: 'unread',
      'in-progress': 'reading',
      'marked-reading': 'reading',
      done: 'finished',
      parked: 'abandoned',
    });
  });

  it('lets an explicit want-to-read flag win over leftover progress', () => {
    expect(getBookStatusCategory(createBook({ readingStatus: 'unread', progress: [5, 10] }))).toBe(
      'unread',
    );
  });
});

describe('countBooksByStatus', () => {
  it('counts every status plus the total in one pass', () => {
    expect(countBooksByStatus(books)).toEqual({
      all: 6,
      reading: 2,
      unread: 1,
      finished: 1,
      abandoned: 1,
      none: 1,
    });
  });

  it('returns zeros for an empty library', () => {
    expect(countBooksByStatus([])).toEqual({
      all: 0,
      reading: 0,
      unread: 0,
      finished: 0,
      abandoned: 0,
      none: 0,
    });
  });
});

describe('filterBooksByStatus', () => {
  it('returns the same array for "all" so memoized consumers stay stable', () => {
    expect(filterBooksByStatus(books, 'all')).toBe(books);
  });

  it('keeps only the books of the chosen status', () => {
    expect(filterBooksByStatus(books, 'reading').map((b) => b.hash)).toEqual([
      'in-progress',
      'marked-reading',
    ]);
    expect(filterBooksByStatus(books, 'none').map((b) => b.hash)).toEqual(['never-opened']);
    expect(filterBooksByStatus(books, 'unread').map((b) => b.hash)).toEqual(['want']);
  });
});

describe('ensureLibraryStatusFilter', () => {
  it('accepts known filters and falls back to "all" otherwise', () => {
    expect(ensureLibraryStatusFilter('finished')).toBe('finished');
    expect(ensureLibraryStatusFilter('none')).toBe('none');
    expect(ensureLibraryStatusFilter('bogus')).toBe('all');
    expect(ensureLibraryStatusFilter(undefined)).toBe('all');
  });
});
