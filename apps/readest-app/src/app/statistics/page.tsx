'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MdChevronLeft, MdChevronRight } from 'react-icons/md';
import type { Book } from '@/types/book';
import { useEnv } from '@/context/EnvContext';
import { useTheme } from '@/hooks/useTheme';
import { useLibrary } from '@/hooks/useLibrary';
import { useTranslation } from '@/hooks/useTranslation';
import { useThemeStore } from '@/store/themeStore';
import { useLibraryStore } from '@/store/libraryStore';
import { useSettingsStore } from '@/store/settingsStore';
import {
  StatisticsDb,
  type BookSummary,
  type ManualSession,
  type PeriodTotals,
  type StatBookEntry,
} from '@/services/statistics/statisticsDb';
import {
  type MonthSecs,
  type StatsPeriodKind,
  finishedInPeriod,
  getPeriod,
  isCurrentPeriod,
  monthDayLabels,
  pagesPerHour,
  percentChange,
  shiftPeriod,
  toEpochSecs,
  tzOffsetSecs,
} from '@/utils/readingStats';
import { formatTitle } from '@/utils/book';
import { getLocale } from '@/utils/misc';
import { navigateToLibrary } from '@/utils/nav';
import BookCover from '@/components/BookCover';
import SegmentedControl from '@/components/SegmentedControl';
import MinutesLineChart from '@/components/stats/MinutesLineChart';
import ProfileHeader from '@/app/user/components/Header';
import AddReadingDialog, { type ManualReadingInput } from './components/AddReadingDialog';
import ExperimentalStats from './components/ExperimentalStats';
import {
  type PeriodStats,
  loadAllTimeMonths,
  loadNotesCount,
  loadPeriodStats,
  loadStartedCount,
  loadTodaySecs,
  periodRange,
} from './utils/loadStats';
import {
  PLACEHOLDER,
  formatDate,
  formatDuration,
  formatMonth,
  formatPeriodLabel,
  rollingDayLabels,
  weekdayLabels,
} from './utils/format';

type Mode = StatsPeriodKind | 'all';

const MODE_KEY = 'readest-stats-mode';
const MODES: readonly Mode[] = ['last7', 'last30', 'week', 'month', 'all'];

const readStoredMode = (): Mode => {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    return MODES.find((m) => m === stored) ?? 'week';
  } catch {
    return 'week';
  }
};

const storeMode = (mode: Mode) => {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // a remembered tab is a convenience only
  }
};

const MAX_TITLE = 40;
const shortTitle = (title: string) =>
  title.length > MAX_TITLE ? `${title.slice(0, MAX_TITLE - 1)}…` : title;

interface MainData {
  today: number;
  period: PeriodStats | null; // null in All time mode
  months: MonthSecs[];
  started: number;
  summary: BookSummary | null;
  manual: ManualSession[];
  /** The selected book's totals for the period (reading pace); null otherwise. */
  bookPeriod: PeriodTotals | null;
}

const Tile = ({ label, value }: { label: string; value: string }) => (
  <div className='eink-bordered border-base-content/20 flex flex-col gap-1 rounded-lg border p-3'>
    <span className='text-base-content/80 text-xs'>{label}</span>
    <span className='text-lg font-semibold'>{value}</span>
  </div>
);

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className='flex justify-between py-2'>
    <span>{label}</span>
    <span className='font-semibold'>{value}</span>
  </div>
);

const StatisticsScreen = () => {
  const _ = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const bookHash = searchParams?.get('book') || undefined;
  const { appService } = useEnv();
  const { settings } = useSettingsStore();
  const { safeAreaInsets } = useThemeStore();
  const { libraryLoaded } = useLibrary();
  const library = useLibraryStore((s) => s.library);
  const getBookByHash = useLibraryStore((s) => s.getBookByHash);
  useTheme({ systemUIVisible: false });

  const locale = getLocale();
  const [now] = useState(() => new Date());
  const [storedMode, setMode] = useState<Mode>(readStoredMode);
  // All time exists only for one book.
  const mode: Mode = storedMode === 'all' && !bookHash ? 'week' : storedMode;
  const [offset, setOffset] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [main, setMain] = useState<MainData | null>(null);
  const [notes, setNotes] = useState<number | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [statBooks, setStatBooks] = useState<StatBookEntry[] | null>(null);

  const book = bookHash && libraryLoaded ? getBookByHash(bookHash) : undefined;
  const books = useMemo(() => library.filter((b) => !b.deletedAt), [library]);
  const period = useMemo(
    () => (mode === 'all' ? null : shiftPeriod(getPeriod(mode, now), offset)),
    [mode, offset, now],
  );

  useEffect(() => {
    if (!appService) return;
    let cancelled = false;
    setMain(null);
    setNotes(null);
    const load = async () => {
      const db = await StatisticsDb.open(appService);
      const range = periodRange(period, now);
      const [today, periodStats, months, started, summary, manual, bookPeriod] = await Promise.all([
        loadTodaySecs(db, now, bookHash),
        period ? loadPeriodStats(db, period, now, bookHash) : null,
        !period && bookHash ? loadAllTimeMonths(db, now, bookHash) : [],
        period && !bookHash ? loadStartedCount(db, period) : 0,
        bookHash ? db.getBookSummary(bookHash, tzOffsetSecs(now)) : null,
        bookHash ? db.getManualSessions(bookHash) : [],
        period && bookHash ? db.getPeriodTotals(range.from, range.to, bookHash) : null,
      ]);
      if (cancelled) return;
      setMain({ today, period: periodStats, months, started, summary, manual, bookPeriod });
      // Notes need book configs: load them only after the main figures show.
      if (period && !bookHash && libraryLoaded) {
        const count = await loadNotesCount(db, appService, settings, getBookByHash, period);
        if (!cancelled) setNotes(count);
      }
    };
    void load().catch((err) => console.warn('[stats] statistics screen failed:', err));
    return () => {
      cancelled = true;
    };
    // settings only feeds config loading; reloading on every settings change is wasteful.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appService, period, bookHash, now, reloadKey, libraryLoaded, getBookByHash]);

  // Book picker: books with reading time (book table only), joined to the library.
  useEffect(() => {
    if (!appService) return;
    let cancelled = false;
    StatisticsDb.open(appService)
      .then((db) => db.getBooksWithStats())
      .then((rows) => {
        if (!cancelled) setStatBooks(rows);
      })
      .catch((err) => console.warn('[stats] book list failed:', err));
    return () => {
      cancelled = true;
    };
  }, [appService, reloadKey]);

  const pickerBooks = useMemo(() => {
    if (!libraryLoaded || !statBooks) return [];
    const list = statBooks.flatMap(({ md5 }) => {
      const b = getBookByHash(md5);
      return b && !b.deletedAt ? [{ hash: md5, title: shortTitle(formatTitle(b.title)) }] : [];
    });
    // A book opened from its details page may have no reading yet: keep it selectable.
    if (bookHash && !list.some((b) => b.hash === bookHash)) {
      const b = getBookByHash(bookHash);
      list.unshift({ hash: bookHash, title: shortTitle(b ? formatTitle(b.title) : bookHash) });
    }
    return list;
  }, [statBooks, libraryLoaded, getBookByHash, bookHash]);

  // Replace, not push: switching books never grows the history, so Back still
  // leaves the statistics screen.
  const selectBook = (hash: string) =>
    router.replace(hash ? `/statistics?book=${hash}` : '/statistics');

  const finished = useMemo(
    () =>
      period && !bookHash
        ? finishedInPeriod(books, period.start.getTime(), period.end.getTime())
        : [],
    [books, period, bookHash],
  );

  const handleBack = () => {
    if (bookHash && window.history.length > 1) router.back();
    else navigateToLibrary(router, '', undefined, true);
  };

  const handleSave = useCallback(
    async ({ book: target, date, minutes, pages }: ManualReadingInput) => {
      if (!appService) return;
      const db = await StatisticsDb.open(appService);
      await db.addManualSession({
        book: { bookMd5: target.hash, title: target.title, authors: target.author },
        dayStart: toEpochSecs(date),
        durationSecs: minutes * 60,
        pages,
        totalPages: target.progress?.[1] ?? 0,
      });
      setReloadKey((k) => k + 1);
    },
    [appService],
  );

  const handleDeleteManual = async (id: number) => {
    if (!appService) return;
    const db = await StatisticsDb.open(appService);
    await db.deleteManualSession(id);
    setReloadKey((k) => k + 1);
  };

  const changeMode = (next: Mode) => {
    setMode(next);
    storeMode(next);
    setOffset(0);
  };

  // ---- derived figures ----
  const fmt = (secs: number | undefined | null) =>
    secs === undefined || secs === null ? PLACEHOLDER : formatDuration(_, secs);
  const totalSecs = main ? (main.period ? main.period.totalSecs : main.summary?.totalSecs) : null;
  const avgDays = main?.period ? main.period.elapsed : main?.summary?.days;
  const avg = totalSecs != null && avgDays ? fmt(totalSecs / avgDays) : PLACEHOLDER;
  const change = main?.period ? percentChange(main.period.totalSecs, main.period.prevSecs) : null;
  const changeText =
    change === null ? PLACEHOLDER : `${change >= 0 ? '▲' : '▼'} ${Math.abs(change)}%`;

  const isCurrent = !period || isCurrentPeriod(period, now);
  let values: (number | null)[] = [];
  let labels: string[] = [];
  let bucketName = (_i: number) => '';
  let describe = (_i: number) => '';
  if (period) {
    values = (main?.period?.daily ?? new Array<null>(period.days).fill(null)).map((v) =>
      v === null ? null : v / 60,
    );
    if (period.kind === 'week') labels = weekdayLabels(locale);
    else if (period.kind === 'month') labels = monthDayLabels(period.days);
    else labels = rollingDayLabels(period, locale, isCurrent ? _('Today') : undefined);
    bucketName = (i) =>
      formatDate(
        new Date(period.start.getFullYear(), period.start.getMonth(), period.start.getDate() + i),
        locale,
      );
    describe = (i) => `${bucketName(i)}: ${fmt(main?.period?.daily[i])}`;
  } else if (main) {
    const months = main.months;
    const every = Math.max(1, Math.ceil(months.length / 6));
    values = months.map((m) => m.secs / 60);
    labels = months.map((m, i) => (i % every === 0 ? formatMonth(m.year, m.month, locale) : ''));
    bucketName = (i) => {
      const m = months[i];
      return m ? formatMonth(m.year, m.month, locale) : '';
    };
    describe = (i) => `${bucketName(i)}: ${fmt(months[i]?.secs)}`;
  }

  const summary = main?.summary;
  const allTimePace = summary ? pagesPerHour(summary.pages, summary.totalSecs) : null;
  const bookPeriod = main?.bookPeriod;
  const periodPace = bookPeriod ? pagesPerHour(bookPeriod.pages, bookPeriod.secs) : null;
  const minutesPerDay =
    bookPeriod && main?.period?.elapsed
      ? String(Math.round(bookPeriod.secs / 60 / main.period.elapsed))
      : PLACEHOLDER;
  const progress =
    book?.progress && book.progress[1] > 0
      ? `${Math.round((book.progress[0] / book.progress[1]) * 100)}%`
      : PLACEHOLDER;

  const modeOptions: { value: Mode; label: string }[] = [
    { value: 'last7', label: _('7 days') },
    { value: 'last30', label: _('30 days') },
    { value: 'week', label: _('Week') },
    { value: 'month', label: _('Month') },
    ...(bookHash ? [{ value: 'all' as const, label: _('All time') }] : []),
  ];
  const changeLabels: Record<StatsPeriodKind, string> = {
    last7: _('vs previous 7 days'),
    last30: _('vs previous 30 days'),
    week: _('vs previous week'),
    month: _('vs previous month'),
  };
  const changeLabel = period ? changeLabels[period.kind] : '';

  return (
    <div className='bg-base-100 full-height inset-0 select-none overflow-hidden'>
      <div
        className='flex h-full w-full flex-col items-center overflow-y-auto'
        style={{ paddingTop: `${safeAreaInsets?.top || 0}px` }}
      >
        <ProfileHeader onGoBack={handleBack} />
        <div
          className='text-base-content flex w-full max-w-2xl flex-col gap-5 px-4 pt-16'
          style={{ paddingBottom: `${(safeAreaInsets?.bottom || 0) + 24}px` }}
        >
          {bookHash ? (
            <div className='flex items-start gap-4'>
              {book && (
                <div className='aspect-[28/41] h-24 shrink-0'>
                  <BookCover mode='list' book={book} />
                </div>
              )}
              <div className='min-w-0'>
                <h1 className='line-clamp-2 break-words text-lg font-bold'>
                  {book ? formatTitle(book.title) : _('Unknown book')}
                </h1>
                <p className='text-base-content/80 line-clamp-1 text-sm'>{book?.author}</p>
              </div>
            </div>
          ) : (
            <h1 className='text-xl font-bold'>{_('Reading Statistics')}</h1>
          )}

          <select
            className='select eink-bordered border-base-content/40 h-11 min-h-11 w-full truncate'
            aria-label={_('Book')}
            value={bookHash ?? ''}
            onChange={(e) => selectBook(e.target.value)}
          >
            <option value=''>{_('All books')}</option>
            {pickerBooks.map((b) => (
              <option key={b.hash} value={b.hash}>
                {b.title}
              </option>
            ))}
          </select>

          <div className='flex flex-wrap items-center justify-between gap-2'>
            <SegmentedControl<Mode>
              options={modeOptions}
              value={mode}
              onChange={changeMode}
              size='md'
              ariaLabel={_('Period')}
            />
            <button
              type='button'
              className='btn btn-outline h-11 min-h-11'
              onClick={() => setShowAdd(true)}
            >
              {_('+ Add reading')}
            </button>
          </div>

          {period && (
            <div className='flex items-center justify-between'>
              <button
                type='button'
                aria-label={_('Previous period')}
                className='btn btn-ghost h-11 min-h-11 w-11 p-0'
                onClick={() => setOffset((o) => o - 1)}
              >
                <MdChevronLeft className='h-6 w-6' />
              </button>
              <span className='font-semibold'>{formatPeriodLabel(period, locale)}</span>
              <button
                type='button'
                aria-label={_('Next period')}
                className='btn btn-ghost h-11 min-h-11 w-11 p-0 disabled:invisible'
                disabled={isCurrent}
                onClick={() => setOffset((o) => o + 1)}
              >
                <MdChevronRight className='h-6 w-6' />
              </button>
            </div>
          )}

          <div className='grid grid-cols-2 gap-3'>
            <Tile label={_('Today')} value={fmt(main?.today)} />
            <Tile label={period ? _('Total for period') : _('Total time')} value={fmt(totalSecs)} />
            <Tile label={period ? _('Avg per day') : _('Avg per reading day')} value={avg} />
            {period && <Tile label={changeLabel} value={main ? changeText : PLACEHOLDER} />}
          </div>

          <MinutesLineChart values={values} labels={labels} describe={describe} height={110} />
          <p className='text-base-content/80 -mt-3 text-center text-xs'>{_('Minutes per day')}</p>

          {bookHash && period && (
            <section className='flex flex-col'>
              <h2 className='font-semibold'>{_('Reading pace for the period')}</h2>
              <div className='divide-base-content/20 flex flex-col divide-y'>
                <Row
                  label={_('Pages per hour')}
                  value={periodPace === null ? PLACEHOLDER : String(periodPace)}
                />
                <Row label={_('Minutes per day')} value={minutesPerDay} />
              </div>
            </section>
          )}

          {bookHash ? (
            <section className='divide-base-content/20 flex flex-col divide-y'>
              <Row label={_('Total time')} value={fmt(summary?.totalSecs)} />
              <Row label={_('Days read')} value={summary ? String(summary.days) : PLACEHOLDER} />
              <Row
                label={_('Pages per hour')}
                value={allTimePace === null ? PLACEHOLDER : String(allTimePace)}
              />
              <Row
                label={_('First read')}
                value={
                  summary ? formatDate(new Date(summary.firstRead * 1000), locale) : PLACEHOLDER
                }
              />
              <Row
                label={_('Last read')}
                value={
                  summary ? formatDate(new Date(summary.lastRead * 1000), locale) : PLACEHOLDER
                }
              />
              <Row label={_('Progress')} value={progress} />
            </section>
          ) : (
            <section className='divide-base-content/20 flex flex-col divide-y'>
              <Row label={_('Books started')} value={main ? String(main.started) : PLACEHOLDER} />
              <Row label={_('Books finished')} value={String(finished.length)} />
              <Row label={_('Total time')} value={fmt(totalSecs)} />
              <Row label={_('Notes')} value={notes === null ? PLACEHOLDER : String(notes)} />
            </section>
          )}

          {!bookHash && finished.length > 0 && (
            <section className='flex flex-col gap-3'>
              <h2 className='font-semibold'>{_('Finished books')}</h2>
              <div className='grid grid-cols-3 gap-3 sm:grid-cols-5'>
                {finished.map((b: Book) => (
                  <button
                    key={b.hash}
                    type='button'
                    className='flex flex-col gap-1 text-start'
                    onClick={() => router.push(`/statistics?book=${b.hash}`)}
                  >
                    <div className='aspect-[28/41] w-full'>
                      <BookCover mode='grid' book={b} />
                    </div>
                    <span className='line-clamp-2 break-words text-xs'>{formatTitle(b.title)}</span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <ExperimentalStats
            period={period}
            now={now}
            bookHash={bookHash}
            labels={labels}
            bucketName={bucketName}
          />

          {bookHash && main && main.manual.length > 0 && (
            <section className='flex flex-col gap-2'>
              <h2 className='font-semibold'>{_('Manually added')}</h2>
              <ul className='divide-base-content/20 flex flex-col divide-y'>
                {main.manual.map((s) => (
                  <li key={s.id} className='flex items-center justify-between gap-2 py-1'>
                    <span>
                      {formatDate(new Date(s.startTime * 1000), locale)} · {fmt(s.durationSecs)}
                      {s.pages > 0 ? ` · ${_('{{pages}} pages', { pages: s.pages })}` : ''}
                    </span>
                    <button
                      type='button'
                      className='btn btn-ghost eink-bordered h-11 min-h-11'
                      onClick={() => handleDeleteManual(s.id)}
                    >
                      {_('Delete')}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
      {showAdd && (
        <AddReadingDialog
          books={books}
          initialBook={book}
          onClose={() => setShowAdd(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
};

const StatisticsPage = () => (
  <Suspense>
    <StatisticsScreen />
  </Suspense>
);

export default StatisticsPage;
