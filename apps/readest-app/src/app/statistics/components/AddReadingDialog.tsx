import React, { useMemo, useState } from 'react';
import type { Book } from '@/types/book';
import { useTranslation } from '@/hooks/useTranslation';
import { formatTitle } from '@/utils/book';
import Dialog from '@/components/Dialog';

export interface ManualReadingInput {
  book: Book;
  date: Date; // local midnight
  minutes: number;
  pages: number; // 0 = not given
}

interface AddReadingDialogProps {
  books: Book[];
  initialBook?: Book;
  onClose: () => void;
  onSave: (input: ManualReadingInput) => Promise<void>;
}

const MAX_RESULTS = 30;

const toInputDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** Backfill form: book, date (not in the future), minutes (1–1440), optional pages. */
const AddReadingDialog: React.FC<AddReadingDialogProps> = ({
  books,
  initialBook,
  onClose,
  onSave,
}) => {
  const _ = useTranslation();
  const today = toInputDate(new Date());
  const [book, setBook] = useState<Book | undefined>(initialBook);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(today);
  const [minutes, setMinutes] = useState('');
  const [pages, setPages] = useState('');
  const [saving, setSaving] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    const found = q
      ? books.filter((b) => b.title.toLowerCase().includes(q) || b.author.toLowerCase().includes(q))
      : books;
    return found.slice(0, MAX_RESULTS);
  }, [books, query]);

  const minutesNum = Number(minutes);
  const pagesNum = pages === '' ? 0 : Number(pages);
  const minutesValid = Number.isInteger(minutesNum) && minutesNum >= 1 && minutesNum <= 1440;
  const pagesValid =
    pages === '' || (Number.isInteger(pagesNum) && pagesNum >= 1 && pagesNum <= minutesNum * 60);
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date) && date <= today;
  const canSave = !!book && minutesValid && pagesValid && dateValid && !saving;

  const handleSave = async () => {
    if (!book || !canSave) return;
    const [y, m, d] = date.split('-').map(Number);
    setSaving(true);
    try {
      await onSave({
        book,
        date: new Date(y ?? 0, (m ?? 1) - 1, d ?? 1),
        minutes: minutesNum,
        pages: pagesNum,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'input input-bordered eink-bordered h-11 w-full';

  return (
    <Dialog isOpen title={_('Add Reading')} onClose={onClose} aboveKeyboard>
      <div className='flex flex-col gap-4 px-6 py-4'>
        <div className='flex flex-col gap-2'>
          <span className='text-sm font-semibold'>{_('Book')}</span>
          {book ? (
            <div className='flex items-center justify-between gap-2'>
              <span className='line-clamp-2 break-words'>{formatTitle(book.title)}</span>
              <button
                type='button'
                className='btn btn-ghost eink-bordered h-11 min-h-11 shrink-0'
                onClick={() => setBook(undefined)}
              >
                {_('Change')}
              </button>
            </div>
          ) : (
            <>
              <input
                type='search'
                className={inputClass}
                placeholder={_('Search books')}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              <ul className='border-base-content/20 max-h-56 overflow-y-auto rounded-lg border'>
                {matches.map((b) => (
                  <li key={b.hash}>
                    <button
                      type='button'
                      className='flex min-h-11 w-full items-center px-3 py-2 text-start'
                      onClick={() => setBook(b)}
                    >
                      <span className='line-clamp-2 break-words'>{formatTitle(b.title)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
        <label className='flex flex-col gap-2'>
          <span className='text-sm font-semibold'>{_('Date')}</span>
          <input
            type='date'
            className={inputClass}
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </label>
        <div className='flex gap-4'>
          <label className='flex flex-1 flex-col gap-2'>
            <span className='text-sm font-semibold'>{_('Minutes')}</span>
            <input
              type='number'
              inputMode='numeric'
              min={1}
              max={1440}
              className={inputClass}
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
          <label className='flex flex-1 flex-col gap-2'>
            <span className='text-sm font-semibold'>{_('Pages (optional)')}</span>
            <input
              type='number'
              inputMode='numeric'
              min={1}
              className={inputClass}
              value={pages}
              onChange={(e) => setPages(e.target.value)}
            />
          </label>
        </div>
        <div className='flex justify-end gap-2'>
          <button type='button' className='btn btn-ghost h-11 min-h-11' onClick={onClose}>
            {_('Cancel')}
          </button>
          <button
            type='button'
            className='btn btn-contrast h-11 min-h-11'
            disabled={!canSave}
            onClick={handleSave}
          >
            {_('Save')}
          </button>
        </div>
      </div>
    </Dialog>
  );
};

export default AddReadingDialog;
