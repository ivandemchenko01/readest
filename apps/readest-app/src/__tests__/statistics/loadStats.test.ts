import { describe, it, expect, beforeEach } from 'vitest';
import { NodeDatabaseService } from '@/services/database/nodeDatabaseService';
import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import { StatisticsDb } from '@/services/statistics/statisticsDb';
import { getPeriod, toEpochSecs } from '@/utils/readingStats';
import {
  loadAllTimeMonths,
  loadPeriodStats,
  loadTodaySecs,
} from '@/app/statistics/utils/loadStats';

const at = (y: number, m: number, d: number, h = 12) => toEpochSecs(new Date(y, m - 1, d, h));

describe('loadPeriodStats', () => {
  let stats: StatisticsDb;
  let id: number;

  beforeEach(async () => {
    const db = await NodeDatabaseService.open(':memory:');
    await migrate(db, getMigrations('statistics'));
    stats = StatisticsDb.from(db);
    id = await stats.upsertBook({ bookMd5: 'a', title: 'A', authors: '' });
    const ev = (page: number, startTime: number, duration: number) =>
      stats.insertPageEvent(id, { page, startTime, duration, totalPages: 10 });
    await ev(1, at(2026, 9, 1), 600); // previous month, day 1
    await ev(2, at(2026, 9, 2), 600); // previous month, day 2
    await ev(3, at(2026, 9, 20), 6000); // previous month, outside compared days
    await ev(4, at(2026, 10, 1), 300);
    await ev(5, at(2026, 10, 2), 900);
  });

  it('fills the current month up to today and compares with the same days before', async () => {
    const now = new Date(2026, 9, 2, 18);
    const result = await loadPeriodStats(stats, getPeriod('month', now), now);
    expect(result.elapsed).toBe(2);
    expect(result.daily).toHaveLength(31);
    expect(result.daily.slice(0, 3)).toEqual([300, 900, null]);
    expect(result.totalSecs).toBe(1200);
    expect(result.prevSecs).toBe(1200);
  });

  it('compares a past period with the whole previous one', async () => {
    const now = new Date(2026, 10, 15);
    const result = await loadPeriodStats(stats, getPeriod('month', new Date(2026, 9, 5)), now);
    expect(result.prevSecs).toBe(7200);
    expect(result.daily.every((v) => v !== null)).toBe(true);
  });

  it('reads today and the all-time months of a book', async () => {
    const now = new Date(2026, 9, 2, 18);
    expect(await loadTodaySecs(stats, now)).toBe(900);
    expect(await loadAllTimeMonths(stats, now, 'a')).toEqual([
      { year: 2026, month: 8, secs: 7200 },
      { year: 2026, month: 9, secs: 1200 },
    ]);
  });
});
