'use client';

import clsx from 'clsx';
import { memo, useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

import type { Book } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useTheme } from '@/hooks/useTheme';
import { useLibrary } from '@/hooks/useLibrary';
import { useTranslation } from '@/hooks/useTranslation';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import { useThemeStore } from '@/store/themeStore';
import { formatAuthors, formatTitle } from '@/utils/book';
import { navigateToLibrary } from '@/utils/nav';
import BookCover from '@/components/BookCover';
import BookDetailModal from '@/components/metadata/BookDetailModal';
import FinishPromptHost from '@/components/metadata/FinishPromptHost';
import Header from '@/app/user/components/Header';
import { type RatingsSortKey, selectRatedBooks } from './utils/ratingsList';

const STAR_FILTERS = [0, 5, 4, 3, 2, 1];

interface RatingRowProps {
  book: Book;
  expanded: boolean;
  onToggle: (hash: string) => void;
  onOpen: (book: Book) => void;
}

const RatingRow = memo<RatingRowProps>(({ book, expanded, onToggle, onOpen }) => {
  const _ = useTranslation();
  const rating = book.rating ?? 0;
  return (
    <li className='border-base-300 flex gap-3 border-b py-3'>
      <button
        type='button'
        aria-label={_('Book Details')}
        className='aspect-[28/41] w-14 shrink-0'
        onClick={() => onOpen(book)}
      >
        <BookCover mode='list' book={book} />
      </button>
      <div className='min-w-0 flex-1'>
        <button type='button' className='block w-full text-start' onClick={() => onOpen(book)}>
          <p className='text-base-content line-clamp-2 break-words font-bold'>
            {formatTitle(book.title) || _('Untitled')}
          </p>
          <p className='text-neutral-content line-clamp-1 text-sm'>
            {formatAuthors(book.author, book.primaryLanguage) || _('Unknown')}
          </p>
        </button>
        {rating > 0 && (
          <p
            className='text-base-content text-lg tracking-wider'
            aria-label={_('{{rating}} out of 5', { rating })}
          >
            {'★'.repeat(rating) + '☆'.repeat(5 - rating)}
          </p>
        )}
        {book.review && (
          <button
            type='button'
            aria-expanded={expanded}
            className='block w-full text-start'
            onClick={() => onToggle(book.hash)}
          >
            <p
              className={clsx(
                'text-base-content whitespace-pre-line break-words text-sm',
                !expanded && 'line-clamp-3',
              )}
            >
              {book.review}
            </p>
          </button>
        )}
      </div>
    </li>
  );
});
RatingRow.displayName = 'RatingRow';

const RatingsPage = () => {
  const _ = useTranslation();
  const router = useRouter();
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const { safeAreaInsets, isRoundedWindow } = useThemeStore();
  const library = useLibraryStore((s) => s.library);
  const { libraryLoaded } = useLibrary();
  const [sort, setSort] = useState<RatingsSortKey>('ratedNewest');
  const [stars, setStars] = useState(0);
  const [withReviewOnly, setWithReviewOnly] = useState(false);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());
  const [detailsHash, setDetailsHash] = useState<string | null>(null);

  useTheme({ systemUIVisible: false });

  const uiLanguage = settings.globalViewSettings?.uiLanguage;
  const books = useMemo(
    () => selectRatedBooks(library, sort, { stars, withReviewOnly }, uiLanguage || undefined),
    [library, sort, stars, withReviewOnly, uiLanguage],
  );
  const detailsBook = detailsHash ? library.find((b) => b.hash === detailsHash) : undefined;

  const handleToggle = useCallback((hash: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(hash)) next.add(hash);
      return next;
    });
  }, []);
  const handleOpen = useCallback((book: Book) => setDetailsHash(book.hash), []);
  const handleCloseDetails = useCallback(() => setDetailsHash(null), []);

  const sortOptions: { value: RatingsSortKey; label: string }[] = [
    { value: 'ratedNewest', label: _('Date rated (newest)') },
    { value: 'ratedOldest', label: _('Date rated (oldest)') },
    { value: 'ratingHigh', label: _('Rating (high to low)') },
    { value: 'ratingLow', label: _('Rating (low to high)') },
    { value: 'title', label: _('Title') },
  ];

  return (
    <div
      className={clsx(
        'bg-base-100 full-height inset-0 select-none overflow-hidden',
        appService?.hasRoundedWindow && isRoundedWindow && 'window-border rounded-window',
      )}
    >
      <div
        className='flex h-full w-full flex-col items-center overflow-y-auto'
        style={{
          paddingTop: `${safeAreaInsets?.top || 0}px`,
          paddingBottom: `${safeAreaInsets?.bottom || 0}px`,
        }}
      >
        <Header onGoBack={() => navigateToLibrary(router, '', undefined, true)} />
        <div className='w-full max-w-3xl px-4 pt-14'>
          <h1 className='text-base-content mb-3 text-xl font-bold'>{_('My Ratings')}</h1>
          <div className='mb-2 flex flex-wrap items-center gap-2'>
            <select
              aria-label={_('Sort by')}
              className='select select-bordered eink-bordered h-11 min-w-0'
              value={sort}
              onChange={(e) => setSort(e.target.value as RatingsSortKey)}
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              aria-label={_('Rating')}
              className='select select-bordered eink-bordered h-11 min-w-0'
              value={stars}
              onChange={(e) => setStars(Number(e.target.value))}
            >
              {STAR_FILTERS.map((value) => (
                <option key={value} value={value}>
                  {value ? '★'.repeat(value) : _('All')}
                </option>
              ))}
            </select>
            <label className='flex h-11 items-center gap-2 text-sm'>
              <input
                type='checkbox'
                className='checkbox eink-bordered'
                checked={withReviewOnly}
                onChange={(e) => setWithReviewOnly(e.target.checked)}
              />
              {_('With review only')}
            </label>
          </div>
          {libraryLoaded && books.length === 0 ? (
            <p className='text-neutral-content py-10 text-center'>
              {_('No rated books yet. Rate a book from its Book Details.')}
            </p>
          ) : (
            <ul>
              {books.map((book) => (
                <RatingRow
                  key={book.hash}
                  book={book}
                  expanded={expanded.has(book.hash)}
                  onToggle={handleToggle}
                  onOpen={handleOpen}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
      {detailsBook && <BookDetailModal isOpen book={detailsBook} onClose={handleCloseDetails} />}
      <FinishPromptHost immediateOnly />
    </div>
  );
};

export default RatingsPage;
