import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Book } from '@/types/book';
import BookItem from '@/app/library/components/BookItem';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('@/context/EnvContext', () => ({ useEnv: () => ({ appService: null }) }));
vi.mock('@/context/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (text: string, o?: Record<string, unknown>) =>
    o ? text.replace(/\{\{(\w+)\}\}/g, (_m, k: string) => String(o[k])) : text,
}));
vi.mock('@/hooks/useResponsiveSize', () => ({ useResponsiveSize: (size: number) => size }));
vi.mock('@/hooks/useMedianPageDurationSecs', () => ({
  useMedianPageDurationSecs: () => undefined,
}));
vi.mock('@/components/BookCover', () => ({ default: () => null }));

const book: Book = {
  hash: 'rated',
  title: 'Rated',
  author: 'Author',
  format: 'EPUB',
  createdAt: 1,
  updatedAt: 1,
  downloadedAt: 1,
  uploadedAt: 1,
};
const props = {
  coverFit: 'crop' as const,
  isSelectMode: false,
  bookSelected: false,
  transferProgress: null,
  handleBookUpload: vi.fn(),
  handleBookDownload: vi.fn(),
  showBookDetailsModal: vi.fn(),
  showTimeRemaining: false,
};
afterEach(cleanup);

describe('rating stars on library tiles', () => {
  it.each([
    'grid',
    'list',
  ] as const)('shows one filled star per rating point in %s view', (mode) => {
    render(<BookItem {...props} book={{ ...book, rating: 4 }} mode={mode} />);
    const stars = screen.getByRole('img', { name: 'Rated 4 out of 5' });
    expect(stars.textContent).toBe('★★★★');
  });

  it('shows nothing for an unrated book', () => {
    render(<BookItem {...props} book={book} mode='grid' />);
    expect(screen.queryByRole('img', { name: /out of 5/ })).toBeNull();
  });
});
