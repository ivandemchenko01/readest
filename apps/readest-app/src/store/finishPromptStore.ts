import { create } from 'zustand';
import type { FinishPromptMode } from '@/utils/readingSession';

export interface FinishPromptRequest {
  bookHash: string;
  mode: FinishPromptMode;
  /**
   * Raised by the reader itself (100% reached, or closed at 95%+): only the
   * library shows it, once the reader has closed. A user action (Mark as
   * Finished) is shown by whichever screen hosts the prompt.
   */
  deferred: boolean;
}

interface FinishPromptState {
  pending: FinishPromptRequest | null;
  dismiss: () => void;
}

/** The one pending "Finished this book?" prompt; tiny in-memory state, never persisted. */
export const useFinishPromptStore = create<FinishPromptState>((set) => ({
  pending: null,
  dismiss: () => set({ pending: null }),
}));

export const requestFinishPrompt = (bookHash: string, mode: FinishPromptMode, deferred = false) =>
  useFinishPromptStore.setState({ pending: { bookHash, mode, deferred } });
