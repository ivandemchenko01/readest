import clsx from 'clsx';
import React from 'react';
import type { Book, BookStatusCategory } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useLibraryStore } from '@/store/libraryStore';
import { requestFinishPrompt } from '@/store/finishPromptStore';
import { useTranslation } from '@/hooks/useTranslation';
import { getBookStatusCategory } from '@/utils/book';
import { BOOK_STATUS_LABELS, withReadingStatus } from '@/app/library/utils/libraryUtils';

const STATUSES: BookStatusCategory[] = ['unread', 'reading', 'finished', 'library'];

/**
 * Segmented status picker for the book details dialog. Reads the live book
 * from the library store so a change shows at once, and saves through
 * `withReadingStatus` like the library menus so sync keeps working. Library
 * clears the status; Finished also asks for a rating.
 */
const BookStatusSelector: React.FC<{ book: Book }> = ({ book }) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const liveBook = useLibraryStore((state) => state.getBookByHash(book.hash)) ?? book;
  const current = getBookStatusCategory(liveBook);

  const handleSelect = async (status: BookStatusCategory) => {
    if (status === current) return;
    const next = status === 'library' ? undefined : status;
    await useLibraryStore.getState().updateBooks(envConfig, [withReadingStatus(liveBook, next)]);
    if (status === 'finished') requestFinishPrompt(liveBook.hash, 'finished');
  };

  return (
    <div role='group' aria-label={_('Reading status')} className='mb-4 flex w-full'>
      {STATUSES.map((status, index) => {
        const active = status === current;
        return (
          <button
            key={status}
            type='button'
            aria-pressed={active}
            onClick={() => handleSelect(status)}
            className={clsx(
              'border-base-content/30 eink:border-base-content min-h-11 flex-1 border px-1 text-xs sm:text-sm',
              index > 0 && '-ms-px',
              index === 0 && 'rounded-s-lg',
              index === STATUSES.length - 1 && 'rounded-e-lg',
              active
                ? 'eink-inverted bg-base-content text-base-100 font-semibold'
                : 'text-base-content',
            )}
          >
            {_(BOOK_STATUS_LABELS[status])}
          </button>
        );
      })}
    </div>
  );
};

export default BookStatusSelector;
