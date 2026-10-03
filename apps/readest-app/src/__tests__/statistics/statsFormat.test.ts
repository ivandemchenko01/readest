import { describe, it, expect } from 'vitest';
import { getPeriod, shiftPeriod } from '@/utils/readingStats';
import { formatPeriodLabel, rollingDayLabels } from '@/app/statistics/utils/format';

const now = new Date(2026, 9, 3, 15);

describe('rollingDayLabels', () => {
  it('names the 7 weekdays and calls the last one today', () => {
    const labels = rollingDayLabels(getPeriod('last7', now), 'en', 'Today');
    expect(labels).toEqual(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Today']);
  });

  it('labels every 5th day of a 30-day window plus the last', () => {
    const labels = rollingDayLabels(getPeriod('last30', now), 'en', 'Today');
    expect(labels).toHaveLength(30);
    expect(labels.filter(Boolean)).toEqual(['4', '9', '14', '19', '24', '29', 'Today']);
  });

  it('keeps the date on the last label of a past window', () => {
    const labels = rollingDayLabels(shiftPeriod(getPeriod('last30', now), -1), 'en');
    expect(labels[29]).toBe('3');
  });
});

describe('formatPeriodLabel', () => {
  it('shows a rolling window as a date range', () => {
    expect(formatPeriodLabel(getPeriod('last7', now), 'en')).toBe('Sep 27 – Oct 3');
  });
});
