import { describe, test, expect, beforeEach, vi } from 'vitest';

vi.mock('@/services/environment', () => ({
  isTauriAppPlatform: () => false,
}));

import { useLibraryStore } from '@/store/libraryStore';
import { requestFinishPrompt, useFinishPromptStore } from '@/store/finishPromptStore';
import type { Book } from '@/types/book';

const makeBook = (overrides: Partial<Book> = {}): Book => ({
  hash: 'h1',
  format: 'EPUB',
  title: 'Book',
  author: 'Author',
  createdAt: 1000,
  updatedAt: 2000,
  ...overrides,
});

describe('requestFinishPrompt', () => {
  beforeEach(() => {
    useFinishPromptStore.setState({ pending: null });
    useLibraryStore.getState().setLibrary([]);
  });

  test('queues the prompt for an unrated book', () => {
    useLibraryStore.getState().setLibrary([makeBook()]);
    requestFinishPrompt('h1', 'finished');
    expect(useFinishPromptStore.getState().pending).toEqual({
      bookHash: 'h1',
      mode: 'finished',
      deferred: false,
    });
  });

  test('skips the finished prompt when the book is already rated', () => {
    useLibraryStore.getState().setLibrary([makeBook({ rating: 4 })]);
    requestFinishPrompt('h1', 'finished');
    expect(useFinishPromptStore.getState().pending).toBeNull();
  });

  test('skips the finished prompt when the book already has a review', () => {
    useLibraryStore.getState().setLibrary([makeBook({ review: 'Great' })]);
    requestFinishPrompt('h1', 'finished');
    expect(useFinishPromptStore.getState().pending).toBeNull();
  });

  test('still asks to confirm finishing a rated book closed at 95%+', () => {
    useLibraryStore.getState().setLibrary([makeBook({ rating: 4 })]);
    requestFinishPrompt('h1', 'confirm', true);
    expect(useFinishPromptStore.getState().pending?.mode).toBe('confirm');
  });
});
