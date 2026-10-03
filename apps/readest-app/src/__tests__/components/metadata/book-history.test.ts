import { describe, expect, it } from 'vitest';

import { buildBookHistorySeries } from '@/components/metadata/bookHistory';
import { localEpochDay } from '@/utils/readingStats';

const now = new Date(2026, 9, 3, 12);
const today = localEpochDay(now);

describe('buildBookHistorySeries', () => {
  it('returns null for a book never read', () => {
    expect(buildBookHistorySeries([], now)).toBeNull();
  });

  it('charts by day from the first to the last day read when the span is 60 days or less', () => {
    const series = buildBookHistorySeries(
      [
        { day: today - 59, secs: 600 },
        { day: today - 57, secs: 120 },
        { day: today, secs: 60 },
      ],
      now,
    )!;
    expect(series.unit).toBe('day');
    expect(series.secs).toHaveLength(60);
    expect(series.secs.slice(0, 3)).toEqual([600, 0, 120]);
    expect(series.secs[59]).toBe(60);
    expect(series.dates[59]!.getDate()).toBe(3);
    expect(series.dates[59]!.getMonth()).toBe(9);
  });

  it('charts by month when the history spans more than 60 days', () => {
    const series = buildBookHistorySeries(
      [
        { day: localEpochDay(new Date(2026, 5, 10, 12)), secs: 600 },
        { day: localEpochDay(new Date(2026, 5, 20, 12)), secs: 300 },
        { day: localEpochDay(new Date(2026, 8, 1, 12)), secs: 60 },
      ],
      now,
    )!;
    expect(series.unit).toBe('month');
    // June through September: the history ends at the last month read.
    expect(series.secs).toEqual([900, 0, 0, 60]);
    expect(series.dates.map((d) => d.getMonth())).toEqual([5, 6, 7, 8]);
  });
});
