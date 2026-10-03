import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { Book, BooksGroup } from '@/types/book';

/**
 * Issue #5596 — long-pressing a book on Android selected it and then
 * deselected it again ~100ms later, while the finger was still down.
 *
 * A long press produces two independent signals: our own 500ms timer and the
 * WebView's native `contextmenu` event, and on Android both are wired to the
 * same "select this item" action. Whichever arrives first cancels the other,
 * so on most devices only one of them runs — but when the WebView fires
 * `contextmenu` *after* our timer has already fired, the item is toggled
 * twice by a single press.
 */

vi.mock('@tauri-apps/api/menu', () => ({
  Menu: { new: vi.fn(async () => ({ popup: vi.fn(), close: vi.fn() })) },
  MenuItem: { new: vi.fn(async (options: { text: string }) => ({ ...options, close: vi.fn() })) },
}));

// The in-app menu claims the Android back key through the native bridge.
vi.mock('@/utils/bridge', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/bridge')>()),
  interceptKeys: vi.fn(async () => {}),
}));

vi.mock('@tauri-apps/plugin-opener', () => ({
  revealItemInDir: vi.fn(),
}));

const appService = vi.hoisted(() => ({
  hasContextMenu: false,
  isLinuxApp: false,
  isAndroidApp: true,
  isMobileApp: true,
}));

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ envConfig: {}, appService }),
}));

vi.mock('@/store/settingsStore', () => ({
  useSettingsStore: () => ({ settings: { localBooksDir: '/books' } }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string) => text,
}));

vi.mock('@/app/library/hooks/useOpenBook', () => ({
  useOpenBook: () => ({ openBook: vi.fn() }),
}));

vi.mock('@/app/library/components/BookItem', () => ({
  default: () => null,
}));

vi.mock('@/app/library/components/GroupItem', () => ({
  default: () => null,
}));

const BookshelfItem = (await import('@/app/library/components/BookshelfItem')).default;

const book: Book = {
  hash: 'hash-1',
  format: 'EPUB',
  title: 'Test Book',
  author: 'Test Author',
  createdAt: 0,
  updatedAt: 0,
  downloadedAt: 1,
};

/**
 * Mirrors the library page: select mode and the selected set live above the
 * item, so every toggle re-renders it with new props.
 */
const Harness = ({
  onToggle,
  onStatus = vi.fn(),
  onDetails = vi.fn(),
}: {
  onToggle: (id: string) => void;
  onStatus?: (book: Book, status: string | undefined) => void;
  onDetails?: (book: Book) => void;
}) => {
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selected, setSelected] = useState(false);
  return (
    <BookshelfItem
      mode='grid'
      item={book}
      coverFit='crop'
      isSelectMode={isSelectMode}
      itemSelected={selected}
      transferProgress={null}
      setLoading={vi.fn()}
      toggleSelection={(id: string) => {
        setSelected((prev) => !prev);
        onToggle(id);
      }}
      handleGroupBooks={vi.fn()}
      handleBookDownload={vi.fn(async () => true)}
      handleBookUpload={vi.fn(async () => true)}
      handleBookDelete={vi.fn(async () => true)}
      handleSetSelectMode={setIsSelectMode}
      handleShowDetailsBook={onDetails}
      handleLibraryNavigation={vi.fn()}
      handleUpdateReadingStatus={onStatus}
      showTimeRemaining={false}
    />
  );
};

const getItem = () => screen.getByRole('button', { name: 'Test Book' });

const longPress = (item: HTMLElement, pointerId = 1) => {
  fireEvent.pointerDown(item, { pointerId, clientX: 50, clientY: 50 });
  act(() => void vi.advanceTimersByTime(500));
  fireEvent.pointerUp(item, { pointerId, clientX: 50, clientY: 50 });
  act(() => void vi.advanceTimersByTime(500));
};

describe('long-press on a book on mobile opens the in-app action menu', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    cleanup();
  });

  it('shows the status actions, Details and Select', () => {
    render(<Harness onToggle={vi.fn()} />);
    longPress(getItem());

    expect(screen.getAllByRole('menuitem').map((el) => el.textContent)).toEqual([
      'Mark as Want to Read',
      'Mark as Reading',
      'Mark as Finished',
      'Details',
      'Select',
    ]);
  });

  it('opens once when the WebView fires contextmenu after the long-press timer (#5596)', () => {
    const onToggle = vi.fn();
    render(<Harness onToggle={onToggle} />);
    const item = getItem();

    fireEvent.pointerDown(item, { pointerId: 1, clientX: 50, clientY: 50 });
    act(() => void vi.advanceTimersByTime(500));
    expect(screen.getAllByRole('menuitem')).toHaveLength(5);

    // The WebView's native long-press callout lands a moment later.
    fireEvent.contextMenu(item, { clientX: 50, clientY: 50 });
    act(() => void vi.advanceTimersByTime(500));
    fireEvent.pointerUp(item, { pointerId: 1, clientX: 50, clientY: 50 });
    act(() => void vi.advanceTimersByTime(500));

    expect(screen.getAllByRole('menuitem')).toHaveLength(5);
    expect(onToggle).not.toHaveBeenCalled();
  });

  it('sets the status through the shared handler and closes the menu', () => {
    const onStatus = vi.fn();
    render(<Harness onToggle={vi.fn()} onStatus={onStatus} />);
    longPress(getItem());

    fireEvent.click(screen.getByRole('menuitem', { name: 'Mark as Reading' }));

    expect(onStatus).toHaveBeenCalledWith(book, 'reading');
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('enters select mode from "Select", then plain taps toggle the selection', () => {
    const onToggle = vi.fn();
    render(<Harness onToggle={onToggle} />);
    longPress(getItem());

    fireEvent.click(screen.getByRole('menuitem', { name: 'Select' }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(getItem(), { pointerId: 2, clientX: 50, clientY: 50 });
    fireEvent.pointerUp(getItem(), { pointerId: 2, clientX: 50, clientY: 50 });
    act(() => void vi.advanceTimersByTime(500));
    expect(onToggle).toHaveBeenCalledTimes(2);

    // In select mode a long press keeps toggling instead of opening the menu.
    longPress(getItem(), 3);
    expect(onToggle).toHaveBeenCalledTimes(3);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('still selects a group once on long press, even with a late contextmenu (#5596)', () => {
    const onSelection = vi.fn();
    const group: BooksGroup = {
      id: 'fiction',
      name: 'Fiction',
      displayName: 'Fiction',
      books: [book],
      updatedAt: 0,
    };
    render(
      <BookshelfItem
        mode='grid'
        item={group}
        coverFit='crop'
        isSelectMode={false}
        itemSelected={false}
        transferProgress={null}
        setLoading={vi.fn()}
        toggleSelection={onSelection}
        handleGroupBooks={vi.fn()}
        handleBookDownload={vi.fn(async () => true)}
        handleBookUpload={vi.fn(async () => true)}
        handleBookDelete={vi.fn(async () => true)}
        handleSetSelectMode={vi.fn()}
        handleShowDetailsBook={vi.fn()}
        handleLibraryNavigation={vi.fn()}
        handleUpdateReadingStatus={vi.fn()}
        showTimeRemaining={false}
      />,
    );
    const card = screen.getByRole('button', { name: 'Fiction' });

    fireEvent.pointerDown(card, { pointerId: 1, clientX: 50, clientY: 50 });
    act(() => void vi.advanceTimersByTime(500));
    fireEvent.contextMenu(card, { clientX: 50, clientY: 50 });
    act(() => void vi.advanceTimersByTime(500));
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 50, clientY: 50 });
    act(() => void vi.advanceTimersByTime(500));

    expect(onSelection).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it.each(['added', 'removed'])('selects current group members after a book is %s', (change) => {
    const secondBook = { ...book, hash: 'hash-2' };
    const onSelection = vi.fn();
    const groupCard = (books: Book[]) => {
      const group: BooksGroup = {
        id: 'fiction',
        name: 'Fiction',
        displayName: 'Fiction',
        books,
        updatedAt: 0,
      };
      return (
        <BookshelfItem
          mode='grid'
          item={group}
          coverFit='crop'
          isSelectMode
          itemSelected={false}
          transferProgress={null}
          setLoading={vi.fn()}
          toggleSelection={() => onSelection(group.books.map((member) => member.hash))}
          handleGroupBooks={vi.fn()}
          handleBookDownload={vi.fn(async () => true)}
          handleBookUpload={vi.fn(async () => true)}
          handleBookDelete={vi.fn(async () => true)}
          handleSetSelectMode={vi.fn()}
          handleShowDetailsBook={vi.fn()}
          handleLibraryNavigation={vi.fn()}
          handleUpdateReadingStatus={vi.fn()}
          showTimeRemaining={false}
        />
      );
    };
    const initial = change === 'added' ? [book] : [book, secondBook];
    const current = change === 'added' ? [book, secondBook] : [book];
    const { rerender } = render(groupCard(initial));
    const card = screen.getByRole('button', { name: 'Fiction' });
    rerender(groupCard(current));
    expect(screen.getByRole('button', { name: 'Fiction' })).toBe(card);

    fireEvent.click(card);

    expect(onSelection).toHaveBeenCalledExactlyOnceWith(current.map((member) => member.hash));
  });
});
