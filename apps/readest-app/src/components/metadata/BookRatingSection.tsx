import React, { useState } from 'react';
import { MdStar, MdStarBorder } from 'react-icons/md';

import type { Book } from '@/types/book';
import type { BookRatingEdit } from '@/app/library/utils/libraryUtils';
import { useTranslation } from '@/hooks/useTranslation';

interface BookRatingSectionProps {
  book: Book;
  onChange: (edit: BookRatingEdit) => void;
}

const STARS = [1, 2, 3, 4, 5];

const BookRatingSection: React.FC<BookRatingSectionProps> = ({ book, onChange }) => {
  const _ = useTranslation();
  const rating = book.rating ?? 0;
  // `null` while not editing an existing review. A book without a review shows
  // the editor straight away, so there is nothing to "edit" yet.
  const [draft, setDraft] = useState<string | null>(null);
  const editing = draft !== null || !book.review;
  const draftText = draft ?? book.review ?? '';

  const handleStar = (value: number) => {
    onChange({ rating: value === rating ? undefined : value, review: book.review });
  };

  const handleSave = () => {
    onChange({ rating: book.rating, review: draftText });
    setDraft(null);
  };

  return (
    <div className='metadata-rating px-4 py-3'>
      <span className='text-neutral-content/85 text-base font-semibold'>{_('Rating')}</span>
      <div className='mt-1 flex items-center'>
        {STARS.map((value) => (
          <button
            key={value}
            type='button'
            aria-label={_('Rate {{rating}} out of 5', { rating: value })}
            aria-pressed={value <= rating}
            className='flex h-12 w-12 items-center justify-center'
            onClick={() => handleStar(value)}
          >
            {value <= rating ? (
              <MdStar className='text-base-content h-9 w-9' />
            ) : (
              <MdStarBorder className='text-base-content h-9 w-9' />
            )}
          </button>
        ))}
      </div>
      <div className='mt-3'>
        <span className='text-neutral-content/85 text-base font-semibold'>{_('My review')}</span>
        {editing ? (
          <div className='mt-1 flex flex-col gap-2'>
            <textarea
              aria-label={_('My review')}
              className='textarea textarea-bordered eink-bordered min-h-24 w-full text-sm'
              placeholder={_('Write your review…')}
              value={draftText}
              onChange={(e) => setDraft(e.target.value)}
            />
            <div className='flex justify-end gap-2'>
              {book.review && (
                <button type='button' className='btn btn-ghost h-11' onClick={() => setDraft(null)}>
                  {_('Cancel')}
                </button>
              )}
              <button
                type='button'
                className='btn btn-contrast h-11'
                disabled={draftText.trim() === (book.review ?? '')}
                onClick={handleSave}
              >
                {_('Save')}
              </button>
            </div>
          </div>
        ) : (
          <div className='mt-1 flex items-start justify-between gap-2'>
            <p className='text-base-content whitespace-pre-line break-words text-sm'>
              {book.review}
            </p>
            <button
              type='button'
              className='btn btn-ghost eink-bordered h-11 shrink-0'
              onClick={() => setDraft(book.review ?? '')}
            >
              {_('Edit')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default BookRatingSection;
