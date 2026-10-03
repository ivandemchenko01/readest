import { describe, it, expect, beforeEach } from 'vitest';
import { NodeDatabaseService } from '@/services/database/nodeDatabaseService';
import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import type { DatabaseService } from '@/types/database';
import { StatisticsDb } from '@/services/statistics/statisticsDb';

const MSK = 3 * 3600; // UTC+3, no DST
// 2026-10-01 00:00 MSK as UTC epoch seconds.
const OCT1 = Date.UTC(2026, 9, 1) / 1000 - MSK;
const DAY = 86400;
const dayOf = (sec: number) => Math.floor((sec + MSK) / DAY);

describe('StatisticsDb aggregates', () => {
  let db: DatabaseService;
  let stats: StatisticsDb;
  let idA: number;
  let idB: number;

  beforeEach(async () => {
    db = await NodeDatabaseService.open(':memory:');
    await migrate(db, getMigrations('statistics'));
    stats = StatisticsDb.from(db);
    idA = await stats.upsertBook({ bookMd5: 'a', title: 'A', authors: '' });
    idB = await stats.upsertBook({ bookMd5: 'b', title: 'B', authors: '' });
    const ev = (id: number, page: number, startTime: number, duration: number) =>
      stats.insertPageEvent(id, { page, startTime, duration, totalPages: 100 });
    // Book A: read in September (first read) and on Oct 1 and Oct 3.
    await ev(idA, 1, OCT1 - 10 * DAY, 60);
    await ev(idA, 2, OCT1 + 60, 30); // Oct 1 00:01 MSK
    await ev(idA, 3, OCT1 + 120, 30);
    await ev(idA, 3, OCT1 + 2 * DAY + 3600, 100); // Oct 3, page 3 again
    // Book B: first read Oct 2, 23:59 MSK (= Oct 2 20:59 UTC).
    await ev(idB, 10, OCT1 + 2 * DAY - 60, 50);
    // Just before Oct 1 local midnight: belongs to Sep 30.
    await ev(idB, 11, OCT1 - 30, 20);
  });

  it('sums seconds per local day using the given offset', async () => {
    const rows = await stats.getDailyReadingSecs(OCT1, OCT1 + 31 * DAY, MSK);
    expect(rows).toEqual([
      { day: dayOf(OCT1), secs: 60 },
      { day: dayOf(OCT1) + 1, secs: 50 },
      { day: dayOf(OCT1) + 2, secs: 100 },
    ]);
  });

  it('filters daily seconds by book', async () => {
    const rows = await stats.getDailyReadingSecs(OCT1, OCT1 + 31 * DAY, MSK, 'b');
    expect(rows).toEqual([{ day: dayOf(OCT1) + 1, secs: 50 }]);
  });

  it('returns no rows for an unknown book', async () => {
    expect(await stats.getDailyReadingSecs(OCT1, OCT1 + DAY, MSK, 'zzz')).toEqual([]);
  });

  it('totals a period: seconds, distinct pages and books', async () => {
    expect(await stats.getPeriodTotals(OCT1, OCT1 + 31 * DAY)).toEqual({
      secs: 210,
      pages: 3, // A:2, A:3, B:10
      books: 2,
    });
    expect(await stats.getPeriodTotals(OCT1, OCT1 + 31 * DAY, 'a')).toEqual({
      secs: 160,
      pages: 2,
      books: 1,
    });
    expect(await stats.getPeriodTotals(OCT1 + 40 * DAY, OCT1 + 41 * DAY)).toEqual({
      secs: 0,
      pages: 0,
      books: 0,
    });
  });

  it('lists books whose first ever read falls in the period', async () => {
    expect(await stats.getBooksStartedInPeriod(OCT1, OCT1 + 31 * DAY)).toEqual([]);
    expect((await stats.getBooksStartedInPeriod(OCT1 - 30 * DAY, OCT1)).sort()).toEqual(['a', 'b']);
  });

  it('lists books read in a period', async () => {
    expect((await stats.getBooksReadInPeriod(OCT1, OCT1 + 31 * DAY)).sort()).toEqual(['a', 'b']);
    expect(await stats.getBooksReadInPeriod(OCT1 + DAY, OCT1 + 2 * DAY)).toEqual(['b']);
  });

  it('summarises one book', async () => {
    expect(await stats.getBookSummary('a', MSK)).toEqual({
      totalSecs: 220,
      days: 3,
      firstRead: OCT1 - 10 * DAY,
      lastRead: OCT1 + 2 * DAY + 3600 + 100,
      pages: 3,
    });
    expect(await stats.getBookSummary('nope', MSK)).toBeNull();
  });
});

describe('StatisticsDb manual sessions', () => {
  let db: DatabaseService;
  let stats: StatisticsDb;
  const book = { bookMd5: 'm', title: 'Manual', authors: 'X' };
  const noon = OCT1 + 12 * 3600;

  beforeEach(async () => {
    db = await NodeDatabaseService.open(':memory:');
    await migrate(db, getMigrations('statistics'));
    stats = StatisticsDb.from(db);
  });

  it('writes events after the highest page read and updates totals', async () => {
    const id = await stats.upsertBook(book);
    await stats.insertPageEvent(id, {
      page: 4,
      startTime: OCT1 - DAY,
      duration: 10,
      totalPages: 50,
    });

    await stats.addManualSession({
      book,
      dayStart: OCT1,
      durationSecs: 600,
      pages: 3,
      totalPages: 40,
    });

    const rows = await db.select<{
      page: number;
      start_time: number;
      duration: number;
      total_pages: number;
    }>(
      `SELECT page, start_time, duration, total_pages FROM page_stat_data
       WHERE id_book = ? AND start_time >= ? ORDER BY start_time`,
      [id, OCT1],
    );
    expect(rows).toEqual([
      { page: 5, start_time: noon, duration: 200, total_pages: 50 },
      { page: 6, start_time: noon + 200, duration: 200, total_pages: 50 },
      { page: 7, start_time: noon + 400, duration: 200, total_pages: 50 },
    ]);
    const bookRow = await stats.getBookByMd5('m');
    expect(bookRow?.total_read_time).toBe(610);
    expect(bookRow?.total_read_pages).toBe(4);
  });

  it('creates the book row when missing and writes one event without pages', async () => {
    await stats.addManualSession({
      book,
      dayStart: OCT1,
      durationSecs: 1800,
      pages: 0,
      totalPages: 0,
    });
    const bookRow = await stats.getBookByMd5('m');
    expect(bookRow?.title).toBe('Manual');
    expect(bookRow?.authors).toBe('X');
    expect(bookRow?.total_read_time).toBe(1800);
    const sessions = await stats.getManualSessions('m');
    expect(sessions).toEqual([
      expect.objectContaining({ startTime: noon, durationSecs: 1800, pages: 0 }),
    ]);
  });

  it('places a second session of the same day after the first one', async () => {
    await stats.addManualSession({
      book,
      dayStart: OCT1,
      durationSecs: 600,
      pages: 0,
      totalPages: 0,
    });
    await stats.addManualSession({
      book,
      dayStart: OCT1,
      durationSecs: 300,
      pages: 0,
      totalPages: 0,
    });
    const sessions = await stats.getManualSessions('m');
    expect(sessions.map((s) => s.startTime)).toEqual([noon + 600, noon]);
    expect((await stats.getBookByMd5('m'))?.total_read_time).toBe(900);
  });

  it('deletes a session with exactly its events and recomputes totals', async () => {
    const id = await stats.upsertBook(book);
    // A tracked event inside the manual window on another page survives.
    await stats.insertPageEvent(id, { page: 1, startTime: noon + 10, duration: 5, totalPages: 50 });
    await stats.addManualSession({
      book,
      dayStart: OCT1,
      durationSecs: 100,
      pages: 2,
      totalPages: 50,
    });
    const [session] = await stats.getManualSessions('m');
    await stats.deleteManualSession(session!.id);

    expect(await stats.getManualSessions('m')).toEqual([]);
    const rows = await db.select<{ page: number }>(`SELECT page FROM page_stat_data`);
    expect(rows).toEqual([{ page: 1 }]);
    expect((await stats.getBookByMd5('m'))?.total_read_time).toBe(5);
  });
});
