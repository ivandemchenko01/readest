import type { Book, BookNote } from '@/types/book';

// Pure helpers for the reading-statistics screen. Periods are LOCAL calendar
// weeks (Monday first) and months, or rolling windows of the last 7 / 30 days
// ending today; the DB stores UTC epoch seconds.

export type StatsPeriodKind = 'week' | 'month' | 'last7' | 'last30';

export interface StatsPeriod {
  kind: StatsPeriodKind;
  start: Date; // local midnight, inclusive
  end: Date; // local midnight, exclusive
  days: number;
}

const DAY_SECS = 86400;

export const toEpochSecs = (date: Date) => Math.floor(date.getTime() / 1000);

/** Local UTC offset in seconds (east positive), as used for SQL day bucketing. */
export const tzOffsetSecs = (date: Date) => -date.getTimezoneOffset() * 60;

/** Local day index: the same number SQL computes as `(start_time + offset) / 86400`. */
export const localEpochDay = (date: Date) =>
  Math.floor((toEpochSecs(date) + tzOffsetSecs(date)) / DAY_SECS);

const daysBetween = (from: Date, to: Date) => localEpochDay(to) - localEpochDay(from);

/** Length in days of the fixed-length kinds (a month varies). */
const FIXED_DAYS: Record<Exclude<StatsPeriodKind, 'month'>, number> = {
  week: 7,
  last7: 7,
  last30: 30,
};

const addDays = (date: Date, days: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);

const makePeriod = (kind: StatsPeriodKind, start: Date): StatsPeriod => {
  const end =
    kind === 'month'
      ? new Date(start.getFullYear(), start.getMonth() + 1, 1)
      : addDays(start, FIXED_DAYS[kind]);
  return { kind, start, end, days: daysBetween(start, end) };
};

export const getPeriod = (kind: StatsPeriodKind, anchor: Date): StatsPeriod => {
  if (kind === 'month')
    return makePeriod(kind, new Date(anchor.getFullYear(), anchor.getMonth(), 1));
  if (kind === 'week') return makePeriod(kind, addDays(anchor, -((anchor.getDay() + 6) % 7)));
  // Rolling window: ends with the anchor's day, inclusive.
  return makePeriod(kind, addDays(anchor, 1 - FIXED_DAYS[kind]));
};

/** Moves a period by whole periods; rolling windows move by their length. */
export const shiftPeriod = (period: StatsPeriod, delta: number): StatsPeriod => {
  const { kind, start } = period;
  return kind === 'month'
    ? makePeriod(kind, new Date(start.getFullYear(), start.getMonth() + delta, 1))
    : makePeriod(kind, addDays(start, FIXED_DAYS[kind] * delta));
};

export const isCurrentPeriod = (period: StatsPeriod, now: Date) =>
  now >= period.start && now < period.end;

/** Days counted for averages: the days so far (incl. today) for the current period. */
export const elapsedDays = (period: StatsPeriod, now: Date) => {
  if (now >= period.end) return period.days;
  if (now < period.start) return 0;
  return daysBetween(period.start, now) + 1;
};

/** Rounded % change, or null when the previous value is zero. */
export const percentChange = (current: number, previous: number): number | null =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

const NICE_STEPS = [10, 20, 30, 40, 60, 80, 120, 160, 240, 320, 480, 600, 720, 960, 1200, 1440];

/** A readable y-axis maximum (minutes) >= `max`; halves stay whole numbers. */
export const niceAxisMax = (max: number) =>
  NICE_STEPS.find((step) => step >= max) ?? Math.ceil(max / 240) * 240;

export interface DaySecs {
  day: number;
  secs: number;
}

export const zeroFill = (rows: DaySecs[], firstDay: number, days: number): number[] => {
  const values = new Array<number>(days).fill(0);
  for (const { day, secs } of rows) {
    const i = day - firstDay;
    if (i >= 0 && i < days) values[i] = secs;
  }
  return values;
};

export interface MonthSecs {
  year: number;
  month: number; // 0-11
  secs: number;
}

/** Roll per-day sums into contiguous months, from the first read to `until`'s month. */
export const rollUpByMonth = (rows: DaySecs[], until: Date): MonthSecs[] => {
  if (rows.length === 0) return [];
  const offset = tzOffsetSecs(until);
  const sums = new Map<number, number>();
  let first = Infinity;
  for (const { day, secs } of rows) {
    // Noon of the local day avoids landing on a neighbour day at offset edges.
    const date = new Date((day * DAY_SECS - offset + DAY_SECS / 2) * 1000);
    const key = date.getFullYear() * 12 + date.getMonth();
    sums.set(key, (sums.get(key) ?? 0) + secs);
    first = Math.min(first, key);
  }
  const last = Math.max(until.getFullYear() * 12 + until.getMonth(), ...sums.keys());
  const months: MonthSecs[] = [];
  for (let key = first; key <= last; key++) {
    months.push({ year: Math.floor(key / 12), month: key % 12, secs: sums.get(key) ?? 0 });
  }
  return months;
};

/** X labels for a month chart: 1, 5, 10, 15, 20, 25 and the last day. */
export const monthDayLabels = (days: number): string[] =>
  Array.from({ length: days }, (_, i) => {
    const day = i + 1;
    return day === 1 || day === days || (day % 5 === 0 && day <= 25) ? String(day) : '';
  });

/** Keeps every `every`-th label and the last one, dropping a label that would crowd the last. */
export const sparseLabels = (labels: string[], every: number): string[] => {
  const last = labels.length - 1;
  return labels.map((label, i) =>
    i === last || (i % every === 0 && last - i >= Math.ceil(every / 2)) ? label : '',
  );
};

/** Distinct pages per hour of reading, or null below a minute of reading. */
export const pagesPerHour = (pages: number, secs: number): number | null =>
  secs >= 60 ? Math.round(pages / (secs / 3600)) : null;

export const finishedInPeriod = (books: Book[], fromMs: number, toMs: number): Book[] =>
  books.filter(
    (b) =>
      !b.deletedAt &&
      b.readingStatus === 'finished' &&
      b.readingStatusUpdatedAt !== undefined &&
      b.readingStatusUpdatedAt >= fromMs &&
      b.readingStatusUpdatedAt < toMs,
  );

/** Annotations, excerpts and notebook notes (not bookmarks) created in [from, to). */
export const countNotesInPeriod = (notes: BookNote[], fromMs: number, toMs: number) =>
  notes.filter(
    (n) => n.type !== 'bookmark' && !n.deletedAt && n.createdAt >= fromMs && n.createdAt < toMs,
  ).length;

export interface ManualSessionLayout {
  startTime: number;
  durationSecs: number;
  pages: number; // 0 = not given
  firstPage: number;
}

/**
 * KOReader rows for a manually added session: one event per page read, laid
 * out back to back from `startTime`; the last page takes the remainder. With
 * no page count, one event holds the whole duration.
 */
export const splitManualSession = ({
  startTime,
  durationSecs,
  pages,
  firstPage,
}: ManualSessionLayout) => {
  const count = Math.max(1, pages);
  const each = Math.floor(durationSecs / count);
  return Array.from({ length: count }, (_, i) => ({
    page: firstPage + i,
    startTime: startTime + i * each,
    duration: i === count - 1 ? durationSecs - each * (count - 1) : each,
  }));
};
