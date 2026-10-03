import { describe, expect, it } from 'vitest';

import {
  getBookContextMenuItemIds,
  getMobileBookContextMenuItemIds,
} from '@/app/library/utils/libraryUtils';
import { buildFeedBookUrl } from '@/services/rss/feedBookUrl';
import { Book } from '@/types/book';

const createBook = (overrides: Partial<Book> = {}): Book => ({
  hash: 'hash-1',
  format: 'EPUB',
  title: 'Test Book',
  author: 'Test Author',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('getBookContextMenuItemIds', () => {
  it('returns a deterministic order for a local downloaded book', () => {
    const book = createBook({ downloadedAt: 1 });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markUnread',
      'markReading',
      'markFinished',
      'markAbandoned',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'upload',
      'share',
      'delete',
    ]);
  });

  it('offers an offline download for Audiobookshelf audiobooks and ebooks (#6256)', () => {
    const audiobook = createBook({ format: 'ABS', filePath: 'abs://srv/item' });
    const ebook = createBook({
      format: 'ABS',
      filePath: 'abs://srv/item',
      metadata: { absMediaType: 'ebook' } as never,
    });
    expect(getBookContextMenuItemIds(audiobook, { absOffline: true })).toContain('offlineDownload');
    expect(getBookContextMenuItemIds(ebook, { absOffline: true })).toContain('offlineDownload');
    // Web builds have nowhere to keep the files.
    expect(getBookContextMenuItemIds(audiobook)).not.toContain('offlineDownload');

    const downloaded = { ...audiobook, absDownloadedAt: 1 };
    const ids = getBookContextMenuItemIds(downloaded, { absOffline: true });
    expect(ids).toContain('offlineRemove');
    expect(ids).not.toContain('offlineDownload');
  });

  it('never offers an offline download for podcasts or regular books', () => {
    const podcast = createBook({
      format: 'ABS',
      filePath: 'abs://srv/item',
      metadata: { absMediaType: 'podcast' } as never,
    });
    const podcastWithoutMirror = createBook({
      format: 'ABS',
      filePath: 'abs://srv/item',
      absMediaType: 'podcast',
    });
    const offlineIds = ['offlineDownload', 'offlineRemove'];
    for (const book of [podcast, podcastWithoutMirror, createBook({ downloadedAt: 1 })]) {
      const ids = getBookContextMenuItemIds(book, { absOffline: true });
      expect(ids.filter((id) => offlineIds.includes(id))).toEqual([]);
    }
  });

  it('offers sendNearby for a local book only when LocalSend is enabled', () => {
    const local = createBook({ downloadedAt: 1 });
    expect(getBookContextMenuItemIds(local, { localSend: true })).toContain('sendNearby');
    expect(getBookContextMenuItemIds(local)).not.toContain('sendNearby');
    // Cloud-only books have no local file to send.
    const cloudOnly = createBook({ uploadedAt: 1 });
    expect(getBookContextMenuItemIds(cloudOnly, { localSend: true })).not.toContain('sendNearby');
  });

  it('hides markFinished and offers clearStatus for a finished book', () => {
    const book = createBook({ downloadedAt: 1, readingStatus: 'finished' });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markUnread',
      'markReading',
      'markAbandoned',
      'clearStatus',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'upload',
      'share',
      'delete',
    ]);
  });

  it('hides "Mark as Want to Read" and offers "Clear Status" for a want-to-read book', () => {
    const book = createBook({ downloadedAt: 1, readingStatus: 'unread' });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markReading',
      'markFinished',
      'markAbandoned',
      'clearStatus',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'upload',
      'share',
      'delete',
    ]);
  });

  it('hides markAbandoned but offers the other statuses + clearStatus for an abandoned book', () => {
    const book = createBook({ downloadedAt: 1, readingStatus: 'abandoned' });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markUnread',
      'markReading',
      'markFinished',
      'clearStatus',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'upload',
      'share',
      'delete',
    ]);
  });

  it('offers Download (not Upload) for a cloud-only book', () => {
    const book = createBook({ uploadedAt: 1 });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markUnread',
      'markReading',
      'markFinished',
      'markAbandoned',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'download',
      'share',
      'delete',
    ]);
  });

  it('omits download/upload/share for a book that is neither downloaded nor uploaded', () => {
    const book = createBook({ filePath: '/some/external/file.epub' });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markUnread',
      'markReading',
      'markFinished',
      'markAbandoned',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'delete',
    ]);
  });

  // Issue #5307 — a feed subscription has no file anywhere: the cloud has
  // nothing to upload it to and nothing to hand a share link. Offering those
  // actions only produces a failed transfer.
  it('omits download/upload/share for a feed book (issue #5307)', () => {
    const book = createBook({
      downloadedAt: 1,
      url: buildFeedBookUrl('https://www.saastr.com/feed/'),
    });
    expect(getBookContextMenuItemIds(book)).toEqual([
      'select',
      'group',
      'markUnread',
      'markReading',
      'markFinished',
      'markAbandoned',
      'showDetails',
      'showInFinder',
      'searchGoodreads',
      'delete',
    ]);
  });

  it('produces the same order on repeated calls and never duplicates an item (issue #4389)', () => {
    const book = createBook({ downloadedAt: 1, uploadedAt: 1, readingStatus: 'finished' });
    const first = getBookContextMenuItemIds(book);
    const second = getBookContextMenuItemIds(book);
    expect(second).toEqual(first);
    expect(new Set(first).size).toBe(first.length);
  });

  it('hides markReading and offers clearStatus for an explicitly reading book', () => {
    const book = createBook({ downloadedAt: 1, readingStatus: 'reading' });
    expect(getBookContextMenuItemIds(book).slice(0, 6)).toEqual([
      'select',
      'group',
      'markUnread',
      'markFinished',
      'markAbandoned',
      'clearStatus',
    ]);
  });

  it('treats a statusless book with progress as reading (no clearStatus: nothing to clear)', () => {
    const book = createBook({ downloadedAt: 1, progress: [10, 100] });
    expect(getBookContextMenuItemIds(book).slice(0, 6)).toEqual([
      'select',
      'group',
      'markUnread',
      'markFinished',
      'markAbandoned',
      'showDetails',
    ]);
  });
});

describe('getMobileBookContextMenuItemIds', () => {
  it('lists the status actions, then details, then select', () => {
    expect(getMobileBookContextMenuItemIds(createBook({ downloadedAt: 1 }))).toEqual([
      'markUnread',
      'markReading',
      'markFinished',
      'markAbandoned',
      'showDetails',
      'select',
    ]);
  });

  it('hides the current status and offers clearStatus for an explicit one', () => {
    const book = createBook({ downloadedAt: 1, readingStatus: 'finished' });
    expect(getMobileBookContextMenuItemIds(book)).toEqual([
      'markUnread',
      'markReading',
      'markAbandoned',
      'clearStatus',
      'showDetails',
      'select',
    ]);
  });
});
