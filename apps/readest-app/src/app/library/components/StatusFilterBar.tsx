import clsx from 'clsx';
import { memo } from 'react';
import type { LibraryStatusFilterType } from '@/types/settings';
import { useTranslation } from '@/hooks/useTranslation';
import { BOOK_STATUS_LABELS } from '../utils/libraryUtils';
import { stubTranslation } from '@/utils/misc';

const FILTERS: LibraryStatusFilterType[] = [
  'all',
  'reading',
  'unread',
  'finished',
  'abandoned',
  'none',
];

const FILTER_LABELS: Record<LibraryStatusFilterType, string> = {
  all: stubTranslation('All'),
  ...BOOK_STATUS_LABELS,
};

interface StatusFilterBarProps {
  value: LibraryStatusFilterType;
  counts: Record<LibraryStatusFilterType, number>;
  onChange: (value: LibraryStatusFilterType) => void;
}

/**
 * One-line row of status chips above the bookshelf. Scrolls horizontally on a
 * narrow screen (no visible scrollbar) and has no transitions, so an e-ink
 * panel only redraws the chips that changed.
 */
const StatusFilterBar: React.FC<StatusFilterBarProps> = ({ value, counts, onChange }) => {
  const _ = useTranslation();
  return (
    <div
      role='toolbar'
      aria-label={_('Reading status')}
      className='no-scrollbar flex shrink-0 gap-2 overflow-x-auto px-4 pb-2 sm:px-6'
    >
      {FILTERS.map((filter) => {
        const active = filter === value;
        return (
          <button
            key={filter}
            type='button'
            aria-pressed={active}
            onClick={() => onChange(filter)}
            className={clsx(
              'flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm',
              active
                ? 'border-base-content bg-base-content text-base-100'
                : 'border-base-content/20 text-base-content eink:border-base-content',
            )}
          >
            <span className='whitespace-nowrap'>{_(FILTER_LABELS[filter])}</span>
            <span
              className={clsx(
                'tabular-nums',
                !active && 'text-base-content/60 eink:text-base-content',
              )}
            >
              {counts[filter]}
            </span>
          </button>
        );
      })}
    </div>
  );
};

export default memo(StatusFilterBar);
