import React from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import { useFinishPromptStore } from '@/store/finishPromptStore';
import FinishBookDialog from './FinishBookDialog';

/**
 * Shows the pending "Finished this book?" prompt. The library hosts every
 * prompt; screens the reader can be open behind (`immediateOnly`) show only the
 * ones a user action raised, leaving the reader's own for the library.
 */
const FinishPromptHost: React.FC<{ immediateOnly?: boolean }> = ({ immediateOnly }) => {
  const pending = useFinishPromptStore((state) => state.pending);
  const dismiss = useFinishPromptStore((state) => state.dismiss);
  const shown = pending && !(immediateOnly && pending.deferred) ? pending : null;
  const book = useLibraryStore((state) => (shown ? state.getBookByHash(shown.bookHash) : null));
  if (!shown || !book) return null;
  return <FinishBookDialog key={book.hash} book={book} mode={shown.mode} onClose={dismiss} />;
};

export default FinishPromptHost;
