import { describe, expect, it } from 'vitest';
import { selectRatedBooks } from '@/app/ratings/utils/ratingsList';
import type { Book } from '@/types/book';

const book = (title: string, over: Partial<Book> = {}): Book => ({
  hash: title,
  format: 'EPUB',
  title,
  author: 'A',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const alpha = book('Alpha', { rating: 3, ratingUpdatedAt: 300 });
const bravo = book('Bravo', { rating: 5, review: 'Superb', ratingUpdatedAt: 100 });
const charlie = book('Charlie', { review: 'Only words', ratingUpdatedAt: 400 });
const delta = book('Delta', { rating: 5, ratingUpdatedAt: 200 });
const unrated = book('Unrated');
const deleted = book('Deleted', { rating: 4, deletedAt: 5, ratingUpdatedAt: 999 });
const books = [unrated, alpha, bravo, charlie, delta, deleted];

const titles = (list: Book[]) => list.map((b) => b.title);
const all = { stars: 0, withReviewOnly: false };

describe('selectRatedBooks', () => {
  it('lists only live books that carry a rating or a review, newest rating first', () => {
    expect(titles(selectRatedBooks(books, 'ratedNewest', all))).toEqual([
      'Charlie',
      'Alpha',
      'Delta',
      'Bravo',
    ]);
  });

  it('sorts by date rated, oldest first', () => {
    expect(titles(selectRatedBooks(books, 'ratedOldest', all))).toEqual([
      'Bravo',
      'Delta',
      'Alpha',
      'Charlie',
    ]);
  });

  it('sorts by rating with unrated (review-only) books last, ties newest first', () => {
    expect(titles(selectRatedBooks(books, 'ratingHigh', all))).toEqual([
      'Delta',
      'Bravo',
      'Alpha',
      'Charlie',
    ]);
    expect(titles(selectRatedBooks(books, 'ratingLow', all))).toEqual([
      'Alpha',
      'Delta',
      'Bravo',
      'Charlie',
    ]);
  });

  it('sorts by title', () => {
    expect(titles(selectRatedBooks(books, 'title', all, 'en'))).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
    ]);
  });

  it('filters by star count and by having a review', () => {
    expect(titles(selectRatedBooks(books, 'title', { stars: 5, withReviewOnly: false }))).toEqual([
      'Bravo',
      'Delta',
    ]);
    expect(titles(selectRatedBooks(books, 'title', { stars: 0, withReviewOnly: true }))).toEqual([
      'Bravo',
      'Charlie',
    ]);
    expect(titles(selectRatedBooks(books, 'title', { stars: 5, withReviewOnly: true }))).toEqual([
      'Bravo',
    ]);
    expect(selectRatedBooks(books, 'title', { stars: 1, withReviewOnly: false })).toEqual([]);
  });
});
