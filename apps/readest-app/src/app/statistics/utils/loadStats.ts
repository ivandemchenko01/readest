import type { Book } from '@/types/book';
import type { AppService } from '@/types/system';
import type { SystemSettings } from '@/types/settings';
import type { StatisticsDb } from '@/services/statistics/statisticsDb';
import {
  type MonthSecs,
  type StatsPeriod,
  countNotesInPeriod,
  elapsedDays,
  localEpochDay,
  rollUpByMonth,
  shiftPeriod,
  toEpochSecs,
  tzOffsetSecs,
  zeroFill,
} from '@/utils/readingStats';

export interface PeriodStats {
  /** Seconds per day of the period; null for days after today. */
  daily: (number | null)[];
  totalSecs: number;
  /** Previous period, cut to the same number of days as elapsed in this one. */
  prevSecs: number;
  elapsed: number;
}

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

/** Epoch-second bounds of a period; without one (All time), everything up to the end of today. */
export const periodRange = (period: StatsPeriod | null, now: Date) =>
  period
    ? { from: toEpochSecs(period.start), to: toEpochSecs(period.end) }
    : {
        from: 0,
        to: toEpochSecs(addDays(new Date(now.getFullYear(), now.getMonth(), now.getDate()), 1)),
      };

/** Chart series + totals for one week/month: two SQL aggregates. */
export const loadPeriodStats = async (
  db: StatisticsDb,
  period: StatsPeriod,
  now: Date,
  md5?: string,
): Promise<PeriodStats> => {
  const from = toEpochSecs(period.start);
  const rows = await db.getDailyReadingSecs(
    from,
    toEpochSecs(period.end),
    tzOffsetSecs(period.start),
    md5,
  );
  const elapsed = elapsedDays(period, now);
  const prev = shiftPeriod(period, -1);
  const prevEnd = addDays(prev.start, Math.min(elapsed, prev.days));
  const { secs: prevSecs } = await db.getPeriodTotals(
    toEpochSecs(prev.start),
    toEpochSecs(prevEnd),
    md5,
  );
  const values = zeroFill(rows, localEpochDay(period.start), period.days);
  return {
    daily: values.map((v, i) => (i < elapsed ? v : null)),
    totalSecs: values.reduce((sum, v) => sum + v, 0),
    prevSecs,
    elapsed,
  };
};

/** Distinct pages per day of the period (one aggregate); null for days after today. */
export const loadDailyPages = async (
  db: StatisticsDb,
  period: StatsPeriod,
  now: Date,
  md5?: string,
): Promise<(number | null)[]> => {
  const { from, to } = periodRange(period, now);
  const rows = await db.getDailyPages(from, to, tzOffsetSecs(period.start), md5);
  const values = zeroFill(
    rows.map((r) => ({ day: r.day, secs: r.pages })),
    localEpochDay(period.start),
    period.days,
  );
  const elapsed = elapsedDays(period, now);
  return values.map((v, i) => (i < elapsed ? v : null));
};

/** All-time distinct pages of a book by month (daily aggregate rolled up in JS). */
export const loadMonthlyPages = async (
  db: StatisticsDb,
  now: Date,
  md5: string,
): Promise<MonthSecs[]> => {
  const { from, to } = periodRange(null, now);
  const rows = await db.getDailyPages(from, to, tzOffsetSecs(now), md5);
  return rollUpByMonth(
    rows.map((r) => ({ day: r.day, secs: r.pages })),
    now,
  );
};

export const loadTodaySecs = async (db: StatisticsDb, now: Date, md5?: string) => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const { secs } = await db.getPeriodTotals(
    toEpochSecs(start),
    toEpochSecs(addDays(start, 1)),
    md5,
  );
  return secs;
};

/** All-time series of one book by month (one daily aggregate rolled up in JS). */
export const loadAllTimeMonths = async (
  db: StatisticsDb,
  now: Date,
  md5: string,
): Promise<MonthSecs[]> => {
  const rows = await db.getDailyReadingSecs(0, toEpochSecs(now) + 1, tzOffsetSecs(now), md5);
  return rollUpByMonth(rows, now);
};

/** Books started in the period (first-ever read inside it). */
export const loadStartedCount = async (db: StatisticsDb, period: StatsPeriod) =>
  (await db.getBooksStartedInPeriod(toEpochSecs(period.start), toEpochSecs(period.end))).length;

/**
 * Notes created in the period, counted only over books read in it: loads just
 * those books' configs, in parallel.
 */
export const loadNotesCount = async (
  db: StatisticsDb,
  appService: AppService,
  settings: SystemSettings,
  getBookByHash: (hash: string) => Book | undefined,
  period: StatsPeriod,
): Promise<number> => {
  const md5s = await db.getBooksReadInPeriod(toEpochSecs(period.start), toEpochSecs(period.end));
  const counts = await Promise.all(
    md5s.map(async (md5) => {
      const book = getBookByHash(md5);
      if (!book) return 0;
      try {
        const config = await appService.loadBookConfig(book, settings);
        return countNotesInPeriod(
          config.booknotes ?? [],
          period.start.getTime(),
          period.end.getTime(),
        );
      } catch {
        return 0;
      }
    }),
  );
  return counts.reduce((sum, c) => sum + c, 0);
};
