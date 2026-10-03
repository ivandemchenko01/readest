# Reading statistics screen — design (fork feature 3)

Approved 2026-10-03. Target device: Onyx Boox Go 7 (e-ink, slow CPU). Performance is rule #1.

## Constraints

- Zero added work on app start, page turns and library render. `statistics.db` is opened only when
  the statistics screen or the per-book statistics section (book details) is opened.
- Every figure is one indexed SQL aggregate; raw events are never pulled into JS loops.
- No chart libraries: hand-rolled static SVG. No animations / transitions / spinners.
  High contrast, `eink:` / `not-eink:` variants, touch targets >= 44px.

## Data (`StatisticsDb`, `src/services/statistics/statisticsDb.ts`)

Existing KOReader schema: `book`, `page_stat_data(id_book, page, start_time, duration, total_pages)`
(UTC epoch seconds; UNIQUE(id_book, page, start_time); index on start_time). `book.md5 == Book.hash`.

New aggregate methods (all tested on an in-memory DB with the production migrations):

| Method | Purpose |
|---|---|
| `getDailyReadingSecs(fromSec, toSec, tzOffsetSecs, md5?)` | `SUM(duration)` grouped by local day `(start_time + tzOffsetSecs) / 86400` |
| `getPeriodTotals(fromSec, toSec, md5?)` | total secs, distinct (book, page) pairs, distinct books |
| `getBooksStartedInPeriod(fromSec, toSec)` | md5s whose all-time `MIN(start_time)` falls in the period |
| `getBooksReadInPeriod(fromSec, toSec)` | md5s with any event in the period (to scope notes loading) |
| `getBookSummary(md5, tzOffsetSecs)` | total secs, distinct local read days, first/last read, distinct pages |

### Time-zone bucketing

Timestamps are UTC. A local day is `floor((start_time + offset) / 86400)` where `offset` is the
local UTC offset in seconds, derived from the period's start date (`-date.getTimezoneOffset() * 60`).
Russia has no DST, so one offset per query is exact; in DST zones a period crossing a switch can shift
an hour of reading near midnight into a neighbour day — accepted. Zero-filling of missing days
(<= 31 items) and the All-time month roll-up (one row per day with reading) are done in JS.

### Library-derived figures

- **Finished in period**: library books with `readingStatus === 'finished'` and
  `readingStatusUpdatedAt` in the period (single memoised pass over the library store).
- **Notes in period**: annotations + excerpts + notebook notes (not bookmarks), `createdAt` in the
  period, not deleted, counted only over books with reading events in the period. Their configs are
  loaded in parallel after the main figures render.

## Screen `/statistics` (`src/app/statistics/page.tsx`)

Entry: "Reading Statistics" in the library settings menu. Static export → book mode is
`/statistics?book=<hash>` (no dynamic segment).

- Header with back button. Segmented control Week | Month (book mode adds All time).
  `‹ label ›` period navigation; week starts Monday; "next" disabled on the current period.
  Labels via `Intl.DateTimeFormat` with the app locale.
- Tiles: Today (independent of period), Total for period, Avg per day (total / days elapsed; current
  period counts days so far), vs previous period ±% (for a partial current period compare with the
  same number of days of the previous period; "—" when the previous value is 0).
- `MinutesLineChart` (`src/components/stats/MinutesLineChart.tsx`): static SVG polyline of minutes
  per day, `currentColor` 2px stroke, dots, light gridlines with a "nice" rounded max, x labels
  (week: Mon..Sun; month: 1,5,10,15,20,25,last; all time: months). Future days are not drawn.
  Tapping a point shows its value in a text line under the chart.
- Summary: books started, books finished, total time, notes.
- Finished books grid with covers → tap opens book mode.
- Loading: layout renders immediately with "—" placeholders, no spinners.

Book mode: title + cover header; Week | Month | All time (All time buckets by month); summary:
total time, days read, pages/hour, first & last read date, progress % from `Book.progress`;
"Manually added" list with delete.

Book details (`BookDetailView`): collapsible "Statistics" section, collapsed by default; data is
loaded only when expanded: last-30-days mini chart, total time, days read, "More" →
`/statistics?book=<hash>`.

## Manual backfill

"+ Add reading" on the screen (and in book mode, book preselected). Dialog: book (searchable library
list), date (default today, not in the future), minutes (1–1440, required), pages (optional).

Storage decision: a NEW append-only migration adds
`readest_manual_session(id, book_hash, start_time, duration, pages, first_page, created_at)`.
`readest_page_ext` was considered but it marks single events; a session (date, minutes, pages) would
have to be re-derived from its events, and deletion would need to parse `ext`. The session row holds
everything needed to re-derive the exact event keys, so delete is exact.

Event layout (KOReader semantics: one row = time spent on one page):

- Session start = local noon of the chosen date (shifted past any earlier manual session of the same
  book that day so keys never collide).
- With `pages = N`: N events on pages `first_page .. first_page + N - 1`, where `first_page` is the
  book's current `MAX(page) + 1` (so distinct-page counts add up across sessions); event `i` starts at
  `start + i * floor(total / N)`, the last event takes the remainder. N must be <= total seconds.
- Without pages: one event with the whole duration on `first_page` (same rule). The pages/hour figure
  counts it as one page.
- `total_pages` = max(known book pages, last page used). The `book` row is upserted with
  title/authors/md5 as the tracker does, then `recomputeBookTotals`.
- Delete removes exactly those event keys plus the session row, then recomputes totals.
- Sync: push sends events with `start_time > cursor`, so a backfill dated before the cursor is not
  pushed. Acceptable (sync is unused in this fork); they are ordinary rows otherwise.

## i18n

All strings via `_()`; `pnpm i18n:extract`; Russian translations filled; other locales get the
English text. Labels avoid count-dependent sentences (label + number), so no plural forms are needed.

## Pure helpers (`src/utils/readingStats.ts`)

Period math (week/month ranges, shifting, elapsed days, local epoch day), % change, nice axis max,
zero-fill, month roll-up, finished-in-period and notes-in-period filters — unit tested.
