import { describe, it, expect } from 'vitest';
import type { Book, BookNote } from '@/types/book';
import {
  countNotesInPeriod,
  elapsedDays,
  finishedInPeriod,
  getPeriod,
  isCurrentPeriod,
  localEpochDay,
  monthDayLabels,
  niceAxisMax,
  percentChange,
  rollUpByMonth,
  shiftPeriod,
  splitManualSession,
  zeroFill,
} from '@/utils/readingStats';

// Tests run in whatever zone the host has; build every date in local time so
// the assertions hold everywhere.
const d = (y: number, m: number, day: number, h = 0) => new Date(y, m - 1, day, h);

describe('getPeriod', () => {
  it('returns the Monday-based week containing the anchor', () => {
    const p = getPeriod('week', d(2026, 10, 3, 15)); // Saturday
    expect(p.start).toEqual(d(2026, 9, 28));
    expect(p.end).toEqual(d(2026, 10, 5));
    expect(p.days).toBe(7);
  });

  it('treats Sunday as the last day of the week', () => {
    const p = getPeriod('week', d(2026, 10, 4, 23));
    expect(p.start).toEqual(d(2026, 9, 28));
  });

  it('returns the calendar month containing the anchor', () => {
    const p = getPeriod('month', d(2026, 2, 14));
    expect(p.start).toEqual(d(2026, 2, 1));
    expect(p.end).toEqual(d(2026, 3, 1));
    expect(p.days).toBe(28);
  });
});

describe('shiftPeriod / isCurrentPeriod', () => {
  it('moves a week by whole weeks', () => {
    const p = shiftPeriod(getPeriod('week', d(2026, 10, 3)), -1);
    expect(p.start).toEqual(d(2026, 9, 21));
    expect(p.end).toEqual(d(2026, 9, 28));
  });

  it('moves a month across a year boundary', () => {
    const p = shiftPeriod(getPeriod('month', d(2026, 1, 10)), -1);
    expect(p.start).toEqual(d(2025, 12, 1));
    expect(p.days).toBe(31);
  });

  it('knows whether a period contains now', () => {
    const now = d(2026, 10, 3, 12);
    expect(isCurrentPeriod(getPeriod('month', now), now)).toBe(true);
    expect(isCurrentPeriod(shiftPeriod(getPeriod('month', now), -1), now)).toBe(false);
  });
});

describe('elapsedDays', () => {
  it('counts days so far, including today, for the current period', () => {
    const now = d(2026, 10, 3, 9);
    expect(elapsedDays(getPeriod('week', now), now)).toBe(6);
    expect(elapsedDays(getPeriod('month', now), now)).toBe(3);
  });

  it('counts all days of a past period', () => {
    const now = d(2026, 10, 3);
    expect(elapsedDays(shiftPeriod(getPeriod('month', now), -1), now)).toBe(30);
  });
});

describe('localEpochDay', () => {
  it('maps local midnight and the end of the same local day to one index', () => {
    expect(localEpochDay(d(2026, 10, 3, 0))).toBe(localEpochDay(d(2026, 10, 3, 23)));
    expect(localEpochDay(d(2026, 10, 4, 0)) - localEpochDay(d(2026, 10, 3, 0))).toBe(1);
  });
});

describe('percentChange', () => {
  it('returns the rounded relative change', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(100, 300)).toBe(-67);
  });

  it('returns null when there is nothing to compare with', () => {
    expect(percentChange(100, 0)).toBeNull();
  });
});

describe('niceAxisMax', () => {
  it('rounds up to a readable value', () => {
    expect(niceAxisMax(0)).toBe(10);
    expect(niceAxisMax(7)).toBe(10);
    expect(niceAxisMax(10)).toBe(10);
    expect(niceAxisMax(11)).toBe(20);
    expect(niceAxisMax(47)).toBe(60);
    expect(niceAxisMax(130)).toBe(160);
    expect(niceAxisMax(2000)).toBe(2160);
  });
});

describe('zeroFill', () => {
  it('places sums on their days and zero elsewhere', () => {
    expect(
      zeroFill(
        [
          { day: 101, secs: 60 },
          { day: 103, secs: 120 },
        ],
        100,
        5,
      ),
    ).toEqual([0, 60, 0, 120, 0]);
  });

  it('ignores rows outside the range', () => {
    expect(zeroFill([{ day: 99, secs: 5 }], 100, 2)).toEqual([0, 0]);
  });
});

describe('rollUpByMonth', () => {
  it('sums days into contiguous local months', () => {
    const jan = localEpochDay(d(2026, 1, 15));
    const mar = localEpochDay(d(2026, 3, 2));
    const mar2 = localEpochDay(d(2026, 3, 31));
    const months = rollUpByMonth(
      [
        { day: jan, secs: 60 },
        { day: mar, secs: 30 },
        { day: mar2, secs: 30 },
      ],
      d(2026, 3, 31),
    );
    expect(months).toEqual([
      { year: 2026, month: 0, secs: 60 },
      { year: 2026, month: 1, secs: 0 },
      { year: 2026, month: 2, secs: 60 },
    ]);
  });

  it('extends to the month of `until`', () => {
    const jan = localEpochDay(d(2026, 1, 15));
    expect(rollUpByMonth([{ day: jan, secs: 1 }], d(2026, 2, 3))).toHaveLength(2);
  });

  it('returns nothing without data', () => {
    expect(rollUpByMonth([], d(2026, 2, 3))).toEqual([]);
  });
});

describe('monthDayLabels', () => {
  it('labels 1, 5, 10, 15, 20, 25 and the last day', () => {
    const labels = monthDayLabels(30);
    expect(labels).toHaveLength(30);
    expect(labels.filter(Boolean)).toEqual(['1', '5', '10', '15', '20', '25', '30']);
  });
});

describe('finishedInPeriod', () => {
  const book = (hash: string, extra: Partial<Book>): Book =>
    ({
      hash,
      title: hash,
      author: '',
      format: 'EPUB',
      createdAt: 0,
      updatedAt: 0,
      ...extra,
    }) as Book;

  it('keeps finished, not-deleted books whose status changed in the period', () => {
    const from = d(2026, 10, 1).getTime();
    const to = d(2026, 11, 1).getTime();
    const books = [
      book('a', { readingStatus: 'finished', readingStatusUpdatedAt: from + 1 }),
      book('b', { readingStatus: 'finished', readingStatusUpdatedAt: from - 1 }),
      book('c', { readingStatus: 'reading', readingStatusUpdatedAt: from + 1 }),
      book('d', { readingStatus: 'finished', readingStatusUpdatedAt: from + 1, deletedAt: 5 }),
      book('e', { readingStatus: 'finished', readingStatusUpdatedAt: to }),
    ];
    expect(finishedInPeriod(books, from, to).map((b) => b.hash)).toEqual(['a']);
  });
});

describe('countNotesInPeriod', () => {
  const note = (type: BookNote['type'], createdAt: number, deletedAt?: number): BookNote => ({
    id: `${type}${createdAt}`,
    type,
    cfi: '',
    note: '',
    createdAt,
    updatedAt: createdAt,
    deletedAt,
  });

  it('counts annotations, excerpts and notebook notes created in range, not bookmarks', () => {
    const notes = [
      note('annotation', 10),
      note('excerpt', 15),
      note('notebook', 19),
      note('bookmark', 12),
      note('annotation', 20),
      note('annotation', 9),
      note('annotation', 11, 30),
    ];
    expect(countNotesInPeriod(notes, 10, 20)).toBe(3);
  });
});

describe('splitManualSession', () => {
  it('spreads pages as consecutive events covering the whole duration', () => {
    const events = splitManualSession({
      startTime: 1000,
      durationSecs: 100,
      pages: 3,
      firstPage: 7,
    });
    expect(events).toEqual([
      { page: 7, startTime: 1000, duration: 33 },
      { page: 8, startTime: 1033, duration: 33 },
      { page: 9, startTime: 1066, duration: 34 },
    ]);
  });

  it('writes one event when no pages are given', () => {
    expect(splitManualSession({ startTime: 5, durationSecs: 600, pages: 0, firstPage: 2 })).toEqual(
      [{ page: 2, startTime: 5, duration: 600 }],
    );
  });
});
