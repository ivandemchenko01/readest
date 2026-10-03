import { useEffect, useState } from 'react';
import { useEnv } from '@/context/EnvContext';
import { StatisticsDb } from '@/services/statistics/statisticsDb';
import {
  type DaySecs,
  rollUpByMonth,
  toEpochSecs,
  tzOffsetSecs,
  zeroFill,
} from '@/utils/readingStats';

/** Histories up to this many days are charted per day, longer ones per month. */
export const DAILY_HISTORY_MAX_DAYS = 60;

export interface BookHistorySeries {
  unit: 'day' | 'month';
  /** Seconds read per bucket. */
  secs: number[];
  /** Start date of each bucket. */
  dates: Date[];
}

const DAY_SECS = 86400;

// Noon of the local day avoids landing on a neighbour day at offset edges.
const dayToDate = (day: number, offsetSecs: number) =>
  new Date((day * DAY_SECS - offsetSecs + DAY_SECS / 2) * 1000);

/** A book's whole reading history (rows sorted by day), from the first to the last day read. */
export const buildBookHistorySeries = (rows: DaySecs[], now: Date): BookHistorySeries | null => {
  if (rows.length === 0) return null;
  const offset = tzOffsetSecs(now);
  const first = rows[0]!.day;
  const last = rows[rows.length - 1]!.day;
  const span = last - first + 1;
  if (span <= DAILY_HISTORY_MAX_DAYS) {
    return {
      unit: 'day',
      secs: zeroFill(rows, first, span),
      dates: Array.from({ length: span }, (_v, i) => dayToDate(first + i, offset)),
    };
  }
  const months = rollUpByMonth(rows, dayToDate(last, offset));
  return {
    unit: 'month',
    secs: months.map((m) => m.secs),
    dates: months.map((m) => new Date(m.year, m.month, 1)),
  };
};

export interface BookHistory {
  series: BookHistorySeries | null;
  totalSecs: number;
  days: number;
}

/**
 * Load one book's whole reading history. statistics.db is opened only when a
 * component using this mounts (two aggregate queries, no raw events in JS).
 */
export const useBookHistory = (bookHash: string): BookHistory | null => {
  const { appService } = useEnv();
  const [history, setHistory] = useState<BookHistory | null>(null);

  useEffect(() => {
    if (!appService) return;
    let cancelled = false;
    const load = async () => {
      const now = new Date();
      const db = await StatisticsDb.open(appService);
      const [rows, summary] = await Promise.all([
        db.getDailyReadingSecs(0, toEpochSecs(now) + 1, tzOffsetSecs(now), bookHash),
        db.getBookSummary(bookHash, tzOffsetSecs(now)),
      ]);
      if (cancelled) return;
      setHistory({
        series: buildBookHistorySeries(rows, now),
        totalSecs: summary?.totalSecs ?? 0,
        days: summary?.days ?? 0,
      });
    };
    void load().catch((err) => console.warn('[stats] book history failed:', err));
    return () => {
      cancelled = true;
    };
  }, [appService, bookHash]);

  return history;
};
