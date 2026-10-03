import type { Book, ReadingStatus } from '@/types/book';

/** Page turns in one reading session after which a book becomes Reading. */
export const AUTO_READING_PAGE_TURNS = 3;
/** Closing a book at or past this fraction asks whether it was finished. */
export const FINISH_PROMPT_FRACTION = 0.95;

/** How the finish prompt was raised: a book just became finished, or may be. */
export type FinishPromptMode = 'finished' | 'confirm';

export interface PageTurnState {
  page: number;
  turns: number;
}

/** O(1) per relocation: the first call records the opening page, each page change counts. */
export const nextPageTurnState = (prev: PageTurnState | undefined, page: number): PageTurnState =>
  !prev ? { page, turns: 0 } : prev.page === page ? prev : { page, turns: prev.turns + 1 };

/**
 * The status the reader stamps after a relocation. A finished book stays
 * finished; reaching 100% finishes it; the session's third page turn (exactly
 * that one, so a manual change later in the session sticks) makes it Reading.
 */
export const nextAutoReadingStatus = (
  status: ReadingStatus | undefined,
  pageTurns: number,
  percentage: number,
): ReadingStatus | undefined => {
  if (status === 'finished') return status;
  if (percentage >= 100) return 'finished';
  if (pageTurns === AUTO_READING_PAGE_TURNS) return 'reading';
  return status;
};

/** Prompt to raise when the reader closes this book, if any. */
export const getCloseFinishPrompt = (book: Book): FinishPromptMode | null => {
  const [current, total] = book.progress ?? [0, 0];
  if (book.readingStatus === 'finished' || total <= 0) return null;
  return current / total >= FINISH_PROMPT_FRACTION ? 'confirm' : null;
};
