import type { AppService } from '@/types/system';
import type { DatabaseService, DatabaseRow } from '@/types/database';
import { DEFAULT_STATS_TRACKING_CONFIG } from '@/types/statistics';
import type { PageStatEvent, StatBook } from '@/types/statistics';
import { splitManualSession, type DaySecs } from '@/utils/readingStats';

interface BookRow extends DatabaseRow {
  id: number;
  title: string;
  authors: string;
  md5: string;
  total_read_time: number;
  total_read_pages: number;
  last_open: number;
  pages: number;
}

type CursorKey = 'push' | 'pull' | 'bookorbit-push';

export interface PeriodTotals {
  secs: number;
  pages: number;
  books: number;
}

export interface BookSummary {
  totalSecs: number;
  days: number;
  firstRead: number; // epoch secs
  lastRead: number; // epoch secs
  pages: number;
}

export interface ManualSession {
  id: number;
  startTime: number;
  durationSecs: number;
  pages: number;
}

// Restricts `page_stat_data p` to one book by md5. The id_book lookup uses the
// UNIQUE(id_book, page, start_time) index.
const BOOK_FILTER = 'AND p.id_book = (SELECT id FROM book WHERE md5 = ? LIMIT 1)';

// Readest caps one page visit at this, so a longer event spans several pages
// (a CrossPoint session recorded in whole percents) and says nothing about pace.
const MAX_PAGE_SECONDS = DEFAULT_STATS_TRACKING_CONFIG.maxEventSeconds;

/**
 * Per-tab singleton open promise. OPFS permits only ONE access handle per file
 * across the whole origin, so a second `connect()` to statistics.db throws
 * `NoModificationAllowedError`. Every ReadingStatsTracker instance (and split-
 * view books) must therefore share a single connection — we memoise the open
 * and never thrash it.
 */
let sharedDb: Promise<StatisticsDb> | null = null;
let lifecycleBound = false;

function bindLifecycle(): void {
  if (lifecycleBound || typeof document === 'undefined') return;
  lifecycleBound = true;
  // Fold the WAL into the main db when the tab is backgrounded/closed — the
  // most reliable point for best-effort async OPFS work before teardown.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && sharedDb) {
      void sharedDb.then((s) => s.checkpoint()).catch(() => {});
    }
  });
}

/**
 * Typed wrapper over the KOReader-compatible `statistics.db`. All identity is
 * keyed on `book_hash` (= Book.hash); the local autoincrement `id_book` never
 * leaves this class.
 */
export class StatisticsDb {
  // Serializes applyRemoteEvents so two concurrent pulls can't nest BEGINs.
  private applyRemoteLock: Promise<void> = Promise.resolve();

  private constructor(private readonly db: DatabaseService) {}

  /** Production entry point — opens + migrates statistics.db (per-tab singleton). */
  static async open(appService: AppService): Promise<StatisticsDb> {
    bindLifecycle();
    if (!sharedDb) {
      const opening = (async () => {
        const db = await appService.openDatabase('statistics', 'statistics.db', 'Data');
        return new StatisticsDb(db);
      })();
      sharedDb = opening;
      void opening.catch(() => {
        if (sharedDb === opening) sharedDb = null;
      });
    }
    return sharedDb;
  }

  /** Test/advanced entry point — wrap an already-migrated DatabaseService. */
  static from(db: DatabaseService): StatisticsDb {
    return new StatisticsDb(db);
  }

  /**
   * Fold the WAL into the main db file and truncate it. The Turso engine does
   * NOT implement `PRAGMA wal_autocheckpoint` (so there's no auto threshold to
   * rely on), but `wal_checkpoint(TRUNCATE)` works — verified folding a 688 KB
   * WAL back to 0 B. We call this when the tab is hidden so the WAL stays bounded.
   */
  async checkpoint(): Promise<void> {
    await this.db.execute('PRAGMA wal_checkpoint(TRUNCATE)');
  }

  /** Checkpoint, close the underlying connection, and reset the singleton. */
  async close(): Promise<void> {
    try {
      await this.checkpoint();
    } catch {
      // best-effort — a checkpoint failure must not block close
    }
    await this.db.close();
    sharedDb = null;
  }

  async upsertBook(book: StatBook): Promise<number> {
    const existing = await this.db.select<BookRow>(`SELECT id FROM book WHERE md5 = ? LIMIT 1`, [
      book.bookMd5,
    ]);
    if (existing[0]) {
      // md5 is the identity; keep the latest title/authors (LWW, matches server stat_books).
      await this.db.execute(`UPDATE book SET title = ?, authors = ? WHERE id = ?`, [
        book.title,
        book.authors,
        existing[0].id,
      ]);
      return existing[0].id;
    }
    await this.db.execute(
      `INSERT INTO book (title, authors, md5, notes, last_open, highlights, pages, total_read_time, total_read_pages)
       VALUES (?, ?, ?, 0, 0, 0, 0, 0, 0)
       ON CONFLICT(title, authors, md5) DO NOTHING`,
      [book.title, book.authors, book.bookMd5],
    );
    const rows = await this.db.select<BookRow>(`SELECT id FROM book WHERE md5 = ? LIMIT 1`, [
      book.bookMd5,
    ]);
    return rows[0]!.id;
  }

  async insertPageEvent(
    idBook: number,
    e: { page: number; startTime: number; duration: number; totalPages: number },
  ): Promise<void> {
    await this.db.execute(
      `INSERT INTO page_stat_data (id_book, page, start_time, duration, total_pages)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id_book, page, start_time)
       DO UPDATE SET duration = max(duration, excluded.duration), total_pages = excluded.total_pages`,
      [idBook, e.page, e.startTime, e.duration, e.totalPages],
    );
  }

  async recomputeBookTotals(idBook: number): Promise<void> {
    await this.db.execute(
      `UPDATE book SET
         total_read_time  = COALESCE((SELECT SUM(duration) FROM page_stat_data WHERE id_book = ?), 0),
         total_read_pages = COALESCE((SELECT COUNT(DISTINCT page) FROM page_stat_data WHERE id_book = ?), 0),
         last_open        = COALESCE((SELECT MAX(start_time + duration) FROM page_stat_data WHERE id_book = ?), last_open),
         pages            = COALESCE((SELECT total_pages FROM page_stat_data WHERE id_book = ? ORDER BY start_time DESC LIMIT 1), pages)
       WHERE id = ?`,
      [idBook, idBook, idBook, idBook, idBook],
    );
  }

  /**
   * Returns the median duration of time spent on each page in seconds. Returns
   * `null` if sufficient data is not available.
   *
   * Use the median since reading times are skewed; thus the median must be
   * used to get the middle value.
   */
  async getMedianPageDurationSecs(idBook: number): Promise<number | null> {
    const PAGE_THRESHOLD = 5;
    const rows = await this.db.select<{ duration: number }>(
      `SELECT duration
         FROM page_stat_data
         WHERE id_book = ? AND duration <= ?
         ORDER BY start_time DESC, page DESC
         LIMIT 50`,
      [idBook, MAX_PAGE_SECONDS],
    );
    if (rows.length < PAGE_THRESHOLD) return null;
    // The query orders by recency; sort by value so the middle is the true median.
    const pageDurations = rows.map((d) => d['duration']).sort((a, b) => a - b);
    const mid = Math.floor(pageDurations.length / 2);
    return pageDurations.length % 2 !== 0
      ? (pageDurations[mid] ?? 0)
      : ((pageDurations[mid - 1] ?? 0) + (pageDurations[mid] ?? 0)) / 2;
  }

  /** Load shelf paces in one query, using the same last-50 sample as book labels. */
  async getMedianPageDurationsSecs(): Promise<Record<string, number>> {
    const rows = await this.db.select<{ md5: string; duration: number }>(
      `SELECT md5, duration FROM (
         SELECT b.md5, p.duration,
           ROW_NUMBER() OVER (PARTITION BY p.id_book ORDER BY p.start_time DESC, p.page DESC) AS recency
         FROM page_stat_data p JOIN book b ON b.id = p.id_book
         WHERE p.duration <= ?
       ) WHERE recency <= 50 ORDER BY md5, duration`,
      [MAX_PAGE_SECONDS],
    );
    const samples = new Map<string, number[]>();
    for (const { md5, duration } of rows) {
      const durations = samples.get(md5) ?? [];
      durations.push(duration);
      samples.set(md5, durations);
    }
    const medians: Record<string, number> = {};
    for (const [md5, durations] of samples) {
      if (durations.length < 5) continue;
      const mid = Math.floor(durations.length / 2);
      medians[md5] =
        durations.length % 2 ? durations[mid]! : (durations[mid - 1]! + durations[mid]!) / 2;
    }
    return medians;
  }

  /**
   * Seconds read per LOCAL day in [fromSec, toSec). `day` is
   * `(start_time + tzOffsetSecs) / 86400` (see `localEpochDay`); days without
   * reading are absent. Optional book filter by md5.
   */
  async getDailyReadingSecs(
    fromSec: number,
    toSec: number,
    tzOffsetSecs: number,
    md5?: string,
  ): Promise<DaySecs[]> {
    const rows = await this.db.select<{ day: number; secs: number }>(
      `SELECT (p.start_time + ?) / 86400 AS day, SUM(p.duration) AS secs
       FROM page_stat_data p
       WHERE p.start_time >= ? AND p.start_time < ? ${md5 ? BOOK_FILTER : ''}
       GROUP BY day ORDER BY day`,
      md5 ? [tzOffsetSecs, fromSec, toSec, md5] : [tzOffsetSecs, fromSec, toSec],
    );
    return rows.map((r) => ({ day: Number(r.day), secs: Number(r.secs) }));
  }

  /** Total seconds, distinct (book, page) pairs and distinct books in [fromSec, toSec). */
  async getPeriodTotals(fromSec: number, toSec: number, md5?: string): Promise<PeriodTotals> {
    const rows = await this.db.select<{ secs: number | null; pages: number; books: number }>(
      `SELECT SUM(duration) AS secs,
              (SELECT COUNT(*) FROM (SELECT DISTINCT id_book, page FROM page_stat_data p
                 WHERE p.start_time >= ? AND p.start_time < ? ${md5 ? BOOK_FILTER : ''})) AS pages,
              COUNT(DISTINCT id_book) AS books
       FROM page_stat_data p
       WHERE p.start_time >= ? AND p.start_time < ? ${md5 ? BOOK_FILTER : ''}`,
      md5 ? [fromSec, toSec, md5, fromSec, toSec, md5] : [fromSec, toSec, fromSec, toSec],
    );
    const r = rows[0];
    return {
      secs: Number(r?.secs ?? 0),
      pages: Number(r?.pages ?? 0),
      books: Number(r?.books ?? 0),
    };
  }

  /** md5s of books whose first-ever read falls in [fromSec, toSec). */
  async getBooksStartedInPeriod(fromSec: number, toSec: number): Promise<string[]> {
    const rows = await this.db.select<{ md5: string }>(
      `SELECT b.md5 AS md5 FROM book b
       JOIN (SELECT id_book, MIN(start_time) AS first FROM page_stat_data GROUP BY id_book) f
         ON f.id_book = b.id
       WHERE f.first >= ? AND f.first < ?`,
      [fromSec, toSec],
    );
    return rows.map((r) => String(r.md5));
  }

  /** md5s of books with any reading in [fromSec, toSec). */
  async getBooksReadInPeriod(fromSec: number, toSec: number): Promise<string[]> {
    const rows = await this.db.select<{ md5: string }>(
      `SELECT b.md5 AS md5 FROM book b
       WHERE b.id IN (SELECT DISTINCT id_book FROM page_stat_data WHERE start_time >= ? AND start_time < ?)`,
      [fromSec, toSec],
    );
    return rows.map((r) => String(r.md5));
  }

  /** All-time figures for one book, or null when it has never been read. */
  async getBookSummary(md5: string, tzOffsetSecs: number): Promise<BookSummary | null> {
    const rows = await this.db.select<{
      secs: number | null;
      days: number;
      first: number | null;
      last: number | null;
      pages: number;
    }>(
      `SELECT SUM(p.duration) AS secs,
              COUNT(DISTINCT (p.start_time + ?) / 86400) AS days,
              MIN(p.start_time) AS first,
              MAX(p.start_time + p.duration) AS last,
              COUNT(DISTINCT p.page) AS pages
       FROM page_stat_data p WHERE 1 = 1 ${BOOK_FILTER}`,
      [tzOffsetSecs, md5],
    );
    const r = rows[0];
    if (!r || r.first === null) return null;
    return {
      totalSecs: Number(r.secs ?? 0),
      days: Number(r.days),
      firstRead: Number(r.first),
      lastRead: Number(r.last),
      pages: Number(r.pages),
    };
  }

  /**
   * Backfill a reading session (e.g. from another device). Events start at
   * local noon of `dayStart` (local midnight, epoch secs), after any earlier
   * manual session of that book on the same day, and use pages after the
   * book's highest page read so distinct-page counts add up. See
   * `splitManualSession` for the event layout.
   */
  async addManualSession(input: {
    book: StatBook;
    dayStart: number;
    durationSecs: number;
    pages: number;
    totalPages: number;
  }): Promise<void> {
    const { book, dayStart, durationSecs, pages } = input;
    const idBook = await this.upsertBook(book);
    const [prior] = await this.db.select<{ end: number | null }>(
      `SELECT MAX(start_time + duration) AS end FROM readest_manual_session
       WHERE book_hash = ? AND start_time >= ? AND start_time < ?`,
      [book.bookMd5, dayStart, dayStart + 86400],
    );
    const startTime = Math.max(dayStart + 12 * 3600, Number(prior?.end ?? 0));
    const [known] = await this.db.select<{ maxPage: number | null; pages: number | null }>(
      `SELECT (SELECT MAX(page) FROM page_stat_data WHERE id_book = ?) AS maxPage,
              (SELECT total_pages FROM page_stat_data WHERE id_book = ? ORDER BY start_time DESC LIMIT 1) AS pages`,
      [idBook, idBook],
    );
    const firstPage = Number(known?.maxPage ?? 0) + 1;
    const events = splitManualSession({ startTime, durationSecs, pages, firstPage });
    const lastPage = firstPage + events.length - 1;
    const totalPages = Math.max(input.totalPages, Number(known?.pages ?? 0), lastPage);
    // One multi-row statement: a session can hold hundreds of page events.
    await this.db.execute(
      `INSERT INTO page_stat_data (id_book, page, start_time, duration, total_pages)
       VALUES ${events.map(() => '(?, ?, ?, ?, ?)').join(', ')}
       ON CONFLICT(id_book, page, start_time)
       DO UPDATE SET duration = max(duration, excluded.duration), total_pages = excluded.total_pages`,
      events.flatMap((e) => [idBook, e.page, e.startTime, e.duration, totalPages]),
    );
    await this.db.execute(
      `INSERT INTO readest_manual_session (book_hash, start_time, duration, pages, first_page, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [book.bookMd5, startTime, durationSecs, pages, firstPage, Date.now()],
    );
    await this.recomputeBookTotals(idBook);
  }

  /** Manually added sessions of a book, newest first. */
  async getManualSessions(md5: string): Promise<ManualSession[]> {
    const rows = await this.db.select<{
      id: number;
      start_time: number;
      duration: number;
      pages: number;
    }>(
      `SELECT id, start_time, duration, pages FROM readest_manual_session
       WHERE book_hash = ? ORDER BY start_time DESC`,
      [md5],
    );
    return rows.map((r) => ({
      id: Number(r.id),
      startTime: Number(r.start_time),
      durationSecs: Number(r.duration),
      pages: Number(r.pages),
    }));
  }

  /** Delete a manual session and exactly the events it wrote. */
  async deleteManualSession(id: number): Promise<void> {
    const [s] = await this.db.select<{
      book_hash: string;
      start_time: number;
      duration: number;
      pages: number;
      first_page: number;
    }>(
      `SELECT book_hash, start_time, duration, pages, first_page FROM readest_manual_session WHERE id = ?`,
      [id],
    );
    if (!s) return;
    const book = await this.getBookByMd5(s.book_hash);
    if (book) {
      // Re-derive the keys splitManualSession produced: page first_page + i
      // starts at start_time + i * floor(duration / count).
      const count = Math.max(1, Number(s.pages));
      const each = Math.floor(Number(s.duration) / count);
      const firstPage = Number(s.first_page);
      await this.db.execute(
        `DELETE FROM page_stat_data
         WHERE id_book = ? AND page BETWEEN ? AND ? AND start_time = ? + (page - ?) * ?`,
        [book.id, firstPage, firstPage + count - 1, Number(s.start_time), firstPage, each],
      );
    }
    await this.db.execute(`DELETE FROM readest_manual_session WHERE id = ?`, [id]);
    if (book) await this.recomputeBookTotals(book.id);
  }

  async getBookByMd5(md5: string): Promise<BookRow | null> {
    const rows = await this.db.select<BookRow>(`SELECT * FROM book WHERE md5 = ? LIMIT 1`, [md5]);
    return rows[0] ?? null;
  }

  /**
   * Ensure a book row exists for an event whose metadata record isn't in the
   * current batch (paged pull can deliver an event before its `stat_books`
   * record). Unlike `upsertBook`, this NEVER overwrites an existing real title
   * with the hash placeholder — the real record, arriving in any page, wins.
   */
  private async ensureBookId(bookMd5: string): Promise<number> {
    const existing = await this.db.select<BookRow>(`SELECT id FROM book WHERE md5 = ? LIMIT 1`, [
      bookMd5,
    ]);
    if (existing[0]) return existing[0].id;
    return this.upsertBook({ bookMd5, title: bookMd5, authors: '' });
  }

  /** Events with start_time > cursor, joined to their md5, for pushing. */
  async getEventsForPush(
    sinceStartTime: number,
  ): Promise<{ events: PageStatEvent[]; books: StatBook[] }> {
    const rows = await this.db.select<DatabaseRow>(
      `SELECT b.md5 AS bookMd5, b.title AS title, b.authors AS authors,
              p.page AS page, p.start_time AS startTime, p.duration AS duration, p.total_pages AS totalPages
       FROM page_stat_data p JOIN book b ON b.id = p.id_book
       WHERE p.start_time > ?
       ORDER BY p.start_time ASC`,
      [sinceStartTime],
    );
    const events: PageStatEvent[] = rows.map((r) => ({
      bookMd5: String(r['bookMd5']),
      page: Number(r['page']),
      startTime: Number(r['startTime']),
      duration: Number(r['duration']),
      totalPages: Number(r['totalPages']),
    }));
    const bookMap = new Map<string, StatBook>();
    for (const r of rows) {
      const md5 = String(r['bookMd5']);
      if (!bookMap.has(md5)) {
        bookMap.set(md5, {
          bookMd5: md5,
          title: String(r['title']),
          authors: String(r['authors']),
        });
      }
    }
    return { events, books: [...bookMap.values()] };
  }

  async applyRemoteEvents(books: StatBook[], events: PageStatEvent[]): Promise<void> {
    if (books.length === 0 && events.length === 0) return;
    // Serialize against other pulls: the statistics connection is shared across
    // ReadingStatsTracker instances (split view), and a second concurrent pull
    // would open a BEGIN inside this one's still-open BEGIN ("cannot start a
    // transaction within a transaction", Sentry READEST-N). The per-op native
    // lock can't make this multi-statement transaction atomic on its own.
    const prev = this.applyRemoteLock;
    let release!: () => void;
    this.applyRemoteLock = new Promise<void>((resolve) => (release = resolve));
    await prev;
    try {
      // One transaction for the whole pulled batch: a single commit instead of
      // O(rows) fsyncs, and the apply is atomic (a failed pull leaves no partial
      // state). Critical when a fresh device backfills tens of thousands of rows.
      await this.db.execute('BEGIN');
      try {
        const idByMd5 = new Map<string, number>();
        for (const b of books) idByMd5.set(b.bookMd5, await this.upsertBook(b));
        // Books referenced only by events (no metadata record) get a placeholder row.
        const touched = new Set<number>();
        for (const e of events) {
          let id = idByMd5.get(e.bookMd5);
          if (id === undefined) {
            id = await this.ensureBookId(e.bookMd5);
            idByMd5.set(e.bookMd5, id);
          }
          await this.insertPageEvent(id, e);
          touched.add(id);
        }
        for (const id of touched) await this.recomputeBookTotals(id);
        await this.db.execute('COMMIT');
      } catch (err) {
        await this.db.execute('ROLLBACK');
        throw err;
      }
    } finally {
      release();
    }
  }

  async getCursor(key: CursorKey): Promise<number> {
    const rows = await this.db.select<{ value: number }>(
      `SELECT value FROM readest_stat_sync_state WHERE key = ?`,
      [key],
    );
    return rows[0]?.value ?? 0;
  }

  async setCursor(key: CursorKey, value: number): Promise<void> {
    await this.db.execute(
      `INSERT INTO readest_stat_sync_state (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [key, value],
    );
  }
}
