import { describe, expect, it } from 'vitest';

import type { Book } from '@/types/book';
import {
  AUTO_READING_PAGE_TURNS,
  getCloseFinishPrompt,
  nextAutoReadingStatus,
  nextPageTurnState,
} from '@/utils/readingSession';

const createBook = (overrides: Partial<Book> = {}): Book => ({
  hash: 'h',
  format: 'EPUB',
  title: 'T',
  author: 'A',
  createdAt: 0,
  updatedAt: 0,
  ...overrides,
});

describe('nextPageTurnState', () => {
  it('records the opening page without counting a turn', () => {
    expect(nextPageTurnState(undefined, 12)).toEqual({ page: 12, turns: 0 });
  });

  it('counts a turn whenever the page changes, in either direction', () => {
    let state = nextPageTurnState(undefined, 12);
    state = nextPageTurnState(state, 13);
    state = nextPageTurnState(state, 12);
    expect(state).toEqual({ page: 12, turns: 2 });
  });

  it('ignores relocations that stay on the same page', () => {
    const state = nextPageTurnState({ page: 5, turns: 1 }, 5);
    expect(state).toEqual({ page: 5, turns: 1 });
  });
});

describe('nextAutoReadingStatus', () => {
  const turns = AUTO_READING_PAGE_TURNS;

  it('marks a book as Reading on the third page turn of a session', () => {
    expect(nextAutoReadingStatus(undefined, turns, 40)).toBe('reading');
    expect(nextAutoReadingStatus('unread', turns, 40)).toBe('reading');
    expect(nextAutoReadingStatus('abandoned', turns, 40)).toBe('reading');
  });

  it('leaves the status alone before the third turn and after it', () => {
    expect(nextAutoReadingStatus('unread', turns - 1, 40)).toBe('unread');
    expect(nextAutoReadingStatus(undefined, 0, 40)).toBeUndefined();
    // A manual change later in the same session is not overridden.
    expect(nextAutoReadingStatus(undefined, turns + 1, 40)).toBeUndefined();
  });

  it('keeps a finished book finished whatever happens', () => {
    expect(nextAutoReadingStatus('finished', turns, 10)).toBe('finished');
    expect(nextAutoReadingStatus('finished', 0, 100)).toBe('finished');
  });

  it('marks a book finished when it reaches 100%', () => {
    expect(nextAutoReadingStatus('reading', 1, 100)).toBe('finished');
    expect(nextAutoReadingStatus(undefined, turns, 100)).toBe('finished');
  });
});

describe('getCloseFinishPrompt', () => {
  it('asks to confirm when a book is closed at 95% or more and not finished', () => {
    expect(
      getCloseFinishPrompt(createBook({ progress: [95, 100], readingStatus: 'reading' })),
    ).toBe('confirm');
    expect(getCloseFinishPrompt(createBook({ progress: [99, 100] }))).toBe('confirm');
  });

  it('stays quiet below 95%, without progress, or for a finished book', () => {
    expect(getCloseFinishPrompt(createBook({ progress: [94, 100] }))).toBeNull();
    expect(getCloseFinishPrompt(createBook())).toBeNull();
    expect(
      getCloseFinishPrompt(createBook({ progress: [100, 100], readingStatus: 'finished' })),
    ).toBeNull();
  });
});
