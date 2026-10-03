import React, { useState } from 'react';
import { MdStar, MdStarBorder } from 'react-icons/md';

import type { Book } from '@/types/book';
import type { FinishPromptMode } from '@/utils/readingSession';
import { useEnv } from '@/context/EnvContext';
import { useLibraryStore } from '@/store/libraryStore';
import { useTranslation } from '@/hooks/useTranslation';
import { formatTitle } from '@/utils/book';
import { withRating, withReadingStatus } from '@/app/library/utils/libraryUtils';
import { formatDuration } from '@/app/statistics/utils/format';
import MinutesLineChart from '@/components/stats/MinutesLineChart';
import Dialog from '@/components/Dialog';
import { type BookHistorySeries, useBookHistory } from './bookHistory';

const STARS = [1, 2, 3, 4, 5];

const bucketLabel = (series: BookHistorySeries, i: number) => {
  const date = series.dates[i]!;
  return series.unit === 'day'
    ? date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    : date.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
};

interface FinishBookDialogProps {
  book: Book;
  /** 'finished': the book is (being) marked finished; 'confirm': it may be. */
  mode: FinishPromptMode;
  onClose: () => void;
}

/**
 * "Finished this book?" prompt: a rating, a review and the book's whole reading
 * history. Saving marks the book finished when needed and stores the rating via
 * `withRating` (which leaves `updatedAt` alone). statistics.db is opened only
 * while the dialog is mounted.
 */
const FinishBookDialog: React.FC<FinishBookDialogProps> = ({ book, mode, onClose }) => {
  const _ = useTranslation();
  const { envConfig } = useEnv();
  const history = useBookHistory(book.hash);
  const [rating, setRating] = useState(book.rating ?? 0);
  const [review, setReview] = useState(book.review ?? '');
  const title = formatTitle(book.title).replace(/ /g, ' ') || _('Untitled');
  const series = history?.series;

  const handleSave = async () => {
    const { getBookByHash, updateBooks } = useLibraryStore.getState();
    const live = getBookByHash(book.hash) ?? book;
    const base = live.readingStatus === 'finished' ? live : withReadingStatus(live, 'finished');
    const next = withRating(base, { rating: rating || undefined, review });
    if (next !== live) await updateBooks(envConfig, [next]);
    onClose();
  };

  return (
    <Dialog isOpen onClose={onClose} boxClassName='sm:min-w-[440px] sm:max-w-[440px] sm:h-auto'>
      <div className='flex w-full flex-col gap-3 px-2 pb-2'>
        <div>
          <h2 className='text-base-content line-clamp-2 break-words text-lg font-bold'>
            {mode === 'confirm'
              ? _('Finished «{{title}}»?', { title })
              : _('You finished «{{title}}»', { title })}
          </h2>
          <p className='text-neutral-content text-sm'>{_('How was it?')}</p>
        </div>
        <div className='flex items-center justify-center'>
          {STARS.map((value) => (
            <button
              key={value}
              type='button'
              aria-label={_('Rate {{rating}} out of 5', { rating: value })}
              aria-pressed={value <= rating}
              className='flex h-14 w-14 items-center justify-center'
              onClick={() => setRating(value === rating ? 0 : value)}
            >
              {value <= rating ? (
                <MdStar className='text-base-content h-11 w-11' />
              ) : (
                <MdStarBorder className='text-base-content h-11 w-11' />
              )}
            </button>
          ))}
        </div>
        <textarea
          aria-label={_('My review')}
          className='textarea textarea-bordered eink-bordered min-h-20 w-full text-sm'
          placeholder={_('Write your review…')}
          value={review}
          onChange={(e) => setReview(e.target.value)}
        />
        {series && (
          <MinutesLineChart
            values={series.secs.map((s) => Math.round(s / 60))}
            labels={series.secs.map((_s, i) =>
              i === 0 || i === series.secs.length - 1 ? bucketLabel(series, i) : '',
            )}
            describe={(i) =>
              `${bucketLabel(series, i)} · ${formatDuration(_, series.secs[i] ?? 0)}`
            }
            height={110}
          />
        )}
        <div className='flex justify-between text-sm'>
          <span>{_('Total time')}</span>
          <span className='font-semibold'>
            {history ? formatDuration(_, history.totalSecs) : '—'}
          </span>
        </div>
        <div className='flex justify-between text-sm'>
          <span>{_('Days read')}</span>
          <span className='font-semibold'>{history ? history.days : '—'}</span>
        </div>
        <div className='mt-1 flex justify-end gap-2'>
          <button
            type='button'
            className='btn btn-ghost eink-bordered h-12 min-h-12 px-4'
            onClick={onClose}
          >
            {mode === 'confirm' ? _('Still reading') : _('Skip')}
          </button>
          <button
            type='button'
            className='btn btn-contrast h-12 min-h-12 px-4'
            onClick={handleSave}
          >
            {mode === 'confirm' ? _('Mark as Finished') : _('Save')}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

export default FinishBookDialog;
