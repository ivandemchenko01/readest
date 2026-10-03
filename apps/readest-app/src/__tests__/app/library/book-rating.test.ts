import { describe, expect, it } from 'vitest';
import {
  createBookSorter,
  createGroupSorter,
  ensureLibrarySortByType,
  getBookSortValue,
  getGroupSortValue,
  withRating,
  withTimeRemainingLast,
} from '@/app/library/utils/libraryUtils';
import { BOOKSHELF_SORT_LABELS } from '@/services/bookshelves/definitions';
import { mergeBookMetadata } from '@/services/sync/file/merge';
import { stripDeviceLocalFields } from '@/services/sync/file/wire';
import { transformBookFromDB, transformBookToDB } from '@/utils/transform';
import type { Book, BooksGroup } from '@/types/book';
import { LibrarySortByType } from '@/types/settings';

const book = (over: Partial<Book> = {}): Book => ({
  hash: `h-${over.title ?? 'x'}`,
  format: 'EPUB',
  title: 'Book',
  author: 'Author',
  createdAt: 1000,
  updatedAt: 2000,
  ...over,
});

const group = (books: Book[], name = 'G'): BooksGroup => ({
  id: name,
  name,
  displayName: name,
  books,
  updatedAt: 1,
});

describe('withRating', () => {
  it('sets rating and review and stamps ratingUpdatedAt without touching updatedAt', () => {
    const original = book();
    const rated = withRating(original, { rating: 4, review: 'Great read' }, 5000);
    expect(rated).not.toBe(original);
    expect(rated.rating).toBe(4);
    expect(rated.review).toBe('Great read');
    expect(rated.ratingUpdatedAt).toBe(5000);
    // updatedAt is the "Date Read" sort key (#6414) — a rating is not a read.
    expect(rated.updatedAt).toBe(2000);
    expect(rated.metadataUpdatedAt).toBeUndefined();
  });

  it('clears the rating and drops a blank review', () => {
    const rated = book({ rating: 3, review: 'meh', ratingUpdatedAt: 10 });
    const cleared = withRating(rated, { rating: undefined, review: '   ' }, 20);
    expect(cleared.rating).toBeUndefined();
    expect(cleared.review).toBeUndefined();
    expect(cleared.ratingUpdatedAt).toBe(20);
  });

  it('trims the review text', () => {
    expect(withRating(book(), { review: '  ok  ' }, 1).review).toBe('ok');
  });

  it('rejects ratings outside 1–5 or non-integers', () => {
    expect(withRating(book(), { rating: 0 }, 1).rating).toBeUndefined();
    expect(withRating(book(), { rating: 6 }, 1).rating).toBeUndefined();
    expect(withRating(book(), { rating: 2.5 }, 1).rating).toBeUndefined();
    expect(withRating(book(), { rating: 5 }, 1).rating).toBe(5);
  });

  it('returns the same object when nothing changes', () => {
    const rated = book({ rating: 5, review: 'Top', ratingUpdatedAt: 10 });
    expect(withRating(rated, { rating: 5, review: 'Top' }, 99)).toBe(rated);
  });
});

describe('Rating library sort', () => {
  const five = book({ title: 'Five', rating: 5 });
  const two = book({ title: 'Two', rating: 2 });
  const unrated = book({ title: 'Unrated' });
  const reviewOnly = book({ title: 'ReviewOnly', review: 'text only' });

  const sortBooks = (books: Book[], ascending: boolean) =>
    [...books]
      .sort(
        withTimeRemainingLast<Book>(
          LibrarySortByType.Rating,
          createBookSorter(LibrarySortByType.Rating, 'en', 'none', ascending),
        ),
      )
      .map((b) => b.title);

  it('is a valid sort type with a label', () => {
    expect(ensureLibrarySortByType('rating', LibrarySortByType.Title)).toBe('rating');
    expect(BOOKSHELF_SORT_LABELS.rating).toBe('Rating');
  });

  it('orders by rating and keeps unrated books last in both directions', () => {
    const books = [unrated, two, reviewOnly, five];
    expect(sortBooks(books, false).slice(0, 2)).toEqual(['Five', 'Two']);
    expect(sortBooks(books, true).slice(0, 2)).toEqual(['Two', 'Five']);
    expect(sortBooks(books, false).slice(2).sort()).toEqual(['ReviewOnly', 'Unrated']);
    expect(sortBooks(books, true).slice(2).sort()).toEqual(['ReviewOnly', 'Unrated']);
  });

  it('keeps unrated books last when sorted as a secondary key', () => {
    const sorter = createBookSorter(LibrarySortByType.Format, 'en', LibrarySortByType.Rating);
    expect([unrated, five, two].sort(sorter).map((b) => b.title)).toEqual([
      'Two',
      'Five',
      'Unrated',
    ]);
  });

  it('exposes sort values for books and groups', () => {
    expect(getBookSortValue(five, LibrarySortByType.Rating)).toBe(5);
    expect(getBookSortValue(unrated, LibrarySortByType.Rating)).toBe(0);
    expect(getGroupSortValue(group([two, five, unrated]), LibrarySortByType.Rating)).toBe(5);
    expect(getGroupSortValue(group([unrated]), LibrarySortByType.Rating)).toBe(0);
  });

  it('puts groups without rated books after rated items', () => {
    const rated = group([two], 'Rated');
    const none = group([unrated], 'None');
    const items: (Book | BooksGroup)[] = [none, five, rated];
    const groupSorter = createGroupSorter(LibrarySortByType.Rating, 'en');
    const bookSorter = createBookSorter(LibrarySortByType.Rating, 'en', 'none', false);
    items.sort(
      withTimeRemainingLast<Book | BooksGroup>(LibrarySortByType.Rating, (a, b) => {
        if ('books' in a && 'books' in b) return -groupSorter(a, b);
        if (!('books' in a) && !('books' in b)) return bookSorter(a, b);
        const av = 'books' in a ? getGroupSortValue(a, 'rating') : getBookSortValue(a, 'rating');
        const bv = 'books' in b ? getGroupSortValue(b, 'rating') : getBookSortValue(b, 'rating');
        return -((av as number) - (bv as number));
      }),
    );
    expect(items.map((i) => ('books' in i ? i.name : i.title))).toEqual(['Five', 'Rated', 'None']);
  });
});

describe('rating stays local under sync', () => {
  const rated = book({ rating: 4, review: 'Loved it', ratingUpdatedAt: 3000 });

  it('is never emitted to the cloud by transformBookToDB', () => {
    const db = transformBookToDB(rated, 'user-1');
    const serialized = JSON.stringify(db);
    expect(serialized).not.toContain('Loved it');
    expect(Object.keys(db).some((k) => k.includes('rating') || k.includes('review'))).toBe(false);
  });

  it('survives the pull-merge spread of a cloud row', () => {
    const cloud = transformBookFromDB(transformBookToDB({ ...rated, updatedAt: 9000 }, 'u'));
    expect('rating' in cloud).toBe(false);
    // useBooksSync merges a newer cloud row as `{ ...oldBook, ...matchingBook }`.
    const merged = { ...rated, ...cloud };
    expect(merged.rating).toBe(4);
    expect(merged.review).toBe('Loved it');
    expect(merged.ratingUpdatedAt).toBe(3000);
  });

  it('is kept by the file-sync merge and wire stripping', () => {
    const remote = book({ updatedAt: 9000, title: 'Remote title' });
    const merged = mergeBookMetadata(rated, remote);
    expect(merged.title).toBe('Remote title');
    expect(merged.rating).toBe(4);
    expect(merged.review).toBe('Loved it');
    expect(stripDeviceLocalFields(rated).rating).toBe(4);
  });
});
