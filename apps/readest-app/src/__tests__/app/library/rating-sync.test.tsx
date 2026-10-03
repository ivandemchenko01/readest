import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { Book } from '@/types/book';

const appService = vi.hoisted(() => ({
  saveLibraryBooks: vi.fn(async () => {}),
  generateCoverImageUrl: vi.fn(async () => 'blob:cover'),
  downloadBookCovers: vi.fn(async () => {}),
}));

const ensureFeedBookCover = vi.hoisted(() =>
  vi.fn(async (_appService: unknown, _book: Book) => 'blob:feed-cover'),
);

const syncState = vi.hoisted(() => ({
  useSyncInited: true,
  syncedBooks: null as Book[] | null,
  syncBooks: vi.fn(async (_books?: Book[], _op?: string, _since?: number) => 0),
  lastSyncedAtBooks: 1000,
}));

vi.mock('@/context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'user-1' } }),
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService }),
}));

vi.mock('@/context/SyncContext', () => ({
  useSyncContext: () => ({ syncClient: {} }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('@/hooks/useSync', () => ({
  useSync: () => syncState,
}));

vi.mock('@/services/sync/cloudSyncProvider', () => ({
  isReadestCloudEnabled: () => true,
  getActiveFileSyncBackends: () => [],
}));

vi.mock('@/services/sync/file/runLibrarySync', () => ({
  runFileLibrarySyncPass: vi.fn(async () => ({ booksSynced: 0 })),
}));

vi.mock('@/services/rss/feedBook', () => ({ ensureFeedBookCover }));

const { useBooksSync } = await import('@/app/library/hooks/useBooksSync');
const { useLibraryStore } = await import('@/store/libraryStore');
const { buildFeedBookUrl } = await import('@/services/rss/feedBookUrl');
const { transformBookFromDB, transformBookToDB } = await import('@/utils/transform');

const FEED_URL = 'https://8sidor.se/feed/';

const makeFeedBook = (over: Partial<Book> = {}): Book => ({
  hash: 'feed-1',
  format: 'EPUB',
  title: '8 Sidor',
  author: '',
  url: buildFeedBookUrl(FEED_URL),
  metadata: { title: '8 Sidor', author: '', language: '', feedUrl: FEED_URL },
  uploadedAt: null,
  createdAt: 1000,
  updatedAt: 1000,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  syncState.syncedBooks = null;
  useLibraryStore.setState({ library: [], libraryLoaded: false, isSyncing: false });
});

describe('rating and review survive a cloud pull (local only)', () => {
  it('keeps the local rating when a newer cloud row wins whole-row LWW', async () => {
    const local = makeFeedBook({
      updatedAt: 2000,
      rating: 5,
      review: 'Loved it',
      ratingUpdatedAt: 1500,
    });
    useLibraryStore.getState().setLibrary([local]);
    useLibraryStore.setState({ libraryLoaded: true });
    // The cloud never stores rating/review: round-trip the row through the
    // same whitelist the push uses.
    syncState.syncedBooks = [
      transformBookFromDB(transformBookToDB({ ...local, updatedAt: 9000 }, 'user-1')),
    ];

    renderHook(() => useBooksSync());

    await waitFor(() => {
      const merged = useLibraryStore.getState().library.find((b) => b.hash === 'feed-1');
      expect(merged?.updatedAt).toBe(9000);
      expect(merged?.rating).toBe(5);
      expect(merged?.review).toBe('Loved it');
      expect(merged?.ratingUpdatedAt).toBe(1500);
    });
  });
});
