import { describe, it, expect, beforeEach } from 'vitest';
import { NodeDatabaseService } from '@/services/database/nodeDatabaseService';
import { migrate } from '@/services/database/migrate';
import { getMigrations } from '@/services/database/migrations';
import { StatisticsDb } from '@/services/statistics/statisticsDb';

const MSK = 3 * 3600; // UTC+3, no DST
// 2026-10-01 00:00 MSK as UTC epoch seconds.
const OCT1 = Date.UTC(2026, 9, 1) / 1000 - MSK;
const DAY = 86400;
const HOUR = 3600;
const dayOf = (sec: number) => Math.floor((sec + MSK) / DAY);
const GAP = 600;

describe('StatisticsDb experimental aggregates', () => {
  let stats: StatisticsDb;
  let idA: number;
  let idB: number;
  const ev = (id: number, page: number, startTime: number, duration: number) =>
    stats.insertPageEvent(id, { page, startTime, duration, totalPages: 100 });

  beforeEach(async () => {
    const db = await NodeDatabaseService.open(':memory:');
    await migrate(db, getMigrations('statistics'));
    stats = StatisticsDb.from(db);
    idA = await stats.upsertBook({ bookMd5: 'a', title: 'A', authors: '' });
    idB = await stats.upsertBook({ bookMd5: 'b', title: 'B', authors: '' });
  });

  describe('getBooksWithStats', () => {
    it('lists read books, most recently read first', async () => {
      await stats.upsertBook({ bookMd5: 'never', title: 'N', authors: '' });
      await ev(idA, 1, OCT1, 60);
      await ev(idB, 1, OCT1 + DAY, 60);
      await stats.recomputeBookTotals(idA);
      await stats.recomputeBookTotals(idB);
      expect(await stats.getBooksWithStats()).toEqual([
        { md5: 'b', title: 'B', lastRead: OCT1 + DAY + 60 },
        { md5: 'a', title: 'A', lastRead: OCT1 + 60 },
      ]);
    });
  });

  describe('getDailyPages', () => {
    it('counts distinct (book, page) pairs per local day', async () => {
      await ev(idA, 1, OCT1 + 60, 30);
      await ev(idA, 1, OCT1 + 600, 30); // same page again: counted once
      await ev(idA, 2, OCT1 + 700, 30);
      await ev(idB, 1, OCT1 + 800, 30); // other book, same page number
      await ev(idA, 3, OCT1 + DAY + 10, 30);
      await ev(idA, 4, OCT1 - 30, 30); // Sep 30 local
      expect(await stats.getDailyPages(OCT1, OCT1 + 7 * DAY, MSK)).toEqual([
        { day: dayOf(OCT1), pages: 3 },
        { day: dayOf(OCT1) + 1, pages: 1 },
      ]);
      expect(await stats.getDailyPages(OCT1, OCT1 + 7 * DAY, MSK, 'b')).toEqual([
        { day: dayOf(OCT1), pages: 1 },
      ]);
    });
  });

  describe('getSessionStats', () => {
    it('splits sessions on gaps longer than the threshold, across books', async () => {
      // Session 1: three pages back to back, the third in another book.
      await ev(idA, 1, OCT1, 60);
      await ev(idA, 2, OCT1 + 60, 60);
      await ev(idB, 1, OCT1 + 120 + GAP, 60); // gap of exactly GAP: same session
      // Session 2: after a long pause.
      await ev(idA, 3, OCT1 + HOUR, 100);
      // Session 3: two events at the very same second (two books) count once.
      await ev(idA, 4, OCT1 + 5 * HOUR, 40);
      await ev(idB, 2, OCT1 + 5 * HOUR, 40);
      expect(await stats.getSessionStats(OCT1, OCT1 + DAY, GAP)).toEqual({
        sessions: 3,
        secs: 360,
      });
    });

    it('filters by book so another book does not bridge a gap', async () => {
      await ev(idA, 1, OCT1, 60);
      await ev(idB, 1, OCT1 + 400, 400);
      await ev(idA, 2, OCT1 + 900, 60); // 840 s after A's last page ended
      expect(await stats.getSessionStats(OCT1, OCT1 + DAY, GAP)).toEqual({
        sessions: 1,
        secs: 520,
      });
      expect(await stats.getSessionStats(OCT1, OCT1 + DAY, GAP, 'a')).toEqual({
        sessions: 2,
        secs: 120,
      });
    });

    it('lets a long event bridge to the next one', async () => {
      await ev(idA, 1, OCT1, 3000); // manual backfill style event
      await ev(idA, 2, OCT1 + 3000 + 300, 60);
      expect(await stats.getSessionStats(OCT1, OCT1 + DAY, GAP)).toEqual({
        sessions: 1,
        secs: 3060,
      });
    });

    it('starts a session at the period start and returns zeros when empty', async () => {
      await ev(idA, 1, OCT1 - 60, 50);
      await ev(idA, 2, OCT1 + 10, 50);
      expect(await stats.getSessionStats(OCT1, OCT1 + DAY, GAP)).toEqual({
        sessions: 1,
        secs: 50,
      });
      expect(await stats.getSessionStats(OCT1 + DAY, OCT1 + 2 * DAY, GAP)).toEqual({
        sessions: 0,
        secs: 0,
      });
    });
  });

  describe('getStreaks', () => {
    const today = dayOf(OCT1 + 10 * DAY);

    it('finds the longest run and the run that reaches today', async () => {
      for (const d of [0, 1, 2, 3, 6, 9, 10]) await ev(idA, d + 1, OCT1 + d * DAY + 60, 60);
      await ev(idA, 50, OCT1 + 10 * DAY + 120, 60); // second event the same day
      expect(await stats.getStreaks(today, MSK)).toEqual({ current: 2, longest: 4 });
    });

    it('keeps the current streak alive until today ends', async () => {
      for (const d of [7, 8, 9]) await ev(idA, d + 1, OCT1 + d * DAY + 60, 60);
      expect(await stats.getStreaks(today, MSK)).toEqual({ current: 3, longest: 3 });
    });

    it('breaks the current streak after a missed day', async () => {
      await ev(idA, 1, OCT1 + 8 * DAY + 60, 60);
      expect(await stats.getStreaks(today, MSK)).toEqual({ current: 0, longest: 1 });
    });

    it('filters by book and handles no reading', async () => {
      await ev(idB, 1, OCT1 + 10 * DAY + 60, 60);
      expect(await stats.getStreaks(today, MSK, 'b')).toEqual({ current: 1, longest: 1 });
      expect(await stats.getStreaks(today, MSK, 'a')).toEqual({ current: 0, longest: 0 });
    });
  });

  describe('getHourlyReadingSecs', () => {
    it('sums seconds by local start hour into 24 slots', async () => {
      await ev(idA, 1, OCT1 + 60, 30); // 00:01 MSK
      await ev(idA, 2, OCT1 + 21 * HOUR + 5, 40); // 21:00 MSK
      await ev(idB, 1, OCT1 + DAY + 21 * HOUR + 59 * 60, 10); // 21:59 MSK next day
      const hours = await stats.getHourlyReadingSecs(OCT1, OCT1 + 7 * DAY, MSK);
      expect(hours).toHaveLength(24);
      expect(hours[0]).toBe(30);
      expect(hours[21]).toBe(50);
      expect(hours.reduce((s, v) => s + v, 0)).toBe(80);
      const onlyB = await stats.getHourlyReadingSecs(OCT1, OCT1 + 7 * DAY, MSK, 'b');
      expect(onlyB[21]).toBe(10);
      expect(onlyB.reduce((s, v) => s + v, 0)).toBe(10);
    });
  });
});
