import type { Book } from '@/types/book';
import { formatTitle } from '@/utils/book';

export type RatingsSortKey = 'ratedNewest' | 'ratedOldest' | 'ratingHigh' | 'ratingLow' | 'title';

export interface RatingsFilter {
  /** Exact star count to show; 0 shows every rating. */
  stars: number;
  withReviewOnly: boolean;
}

const byRatedNewest = (a: Book, b: Book) => (b.ratingUpdatedAt ?? 0) - (a.ratingUpdatedAt ?? 0);

/**
 * Books that carry a rating or a review, filtered and sorted for the My Ratings
 * screen. Review-only books (no stars) always sort after rated ones when sorting
 * by rating; ties fall back to the most recently rated first.
 */
export const selectRatedBooks = (
  books: Book[],
  sort: RatingsSortKey,
  filter: RatingsFilter,
  locale?: string,
): Book[] => {
  const list = books.filter(
    (b) =>
      !b.deletedAt &&
      (b.rating || b.review) &&
      (!filter.stars || b.rating === filter.stars) &&
      (!filter.withReviewOnly || b.review),
  );
  switch (sort) {
    case 'ratedOldest':
      return list.sort((a, b) => -byRatedNewest(a, b));
    case 'ratingHigh':
    case 'ratingLow': {
      const direction = sort === 'ratingHigh' ? -1 : 1;
      return list.sort((a, b) => {
        if (!a.rating || !b.rating) return a.rating ? -1 : b.rating ? 1 : byRatedNewest(a, b);
        return (a.rating - b.rating) * direction || byRatedNewest(a, b);
      });
    }
    case 'title':
      return list.sort((a, b) => formatTitle(a.title).localeCompare(formatTitle(b.title), locale));
    default:
      return list.sort(byRatedNewest);
  }
};
