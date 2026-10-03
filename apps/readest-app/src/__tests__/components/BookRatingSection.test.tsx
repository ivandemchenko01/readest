import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import type { Book } from '@/types/book';
import BookRatingSection from '@/components/metadata/BookRatingSection';

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation:
    () =>
    (key: string, options?: Record<string, unknown>): string =>
      key.replace(/{{(\w+)}}/g, (_m, name: string) => String(options?.[name] ?? '')),
}));

afterEach(() => cleanup());

const book = (over: Partial<Book> = {}): Book => ({
  hash: 'h',
  format: 'EPUB',
  title: 'T',
  author: 'A',
  createdAt: 1,
  updatedAt: 1,
  ...over,
});

const star = (n: number) => screen.getByRole('button', { name: `Rate ${n} out of 5` });

describe('BookRatingSection', () => {
  it('rates the book with a tap on a star and keeps the review', () => {
    const onChange = vi.fn();
    render(<BookRatingSection book={book({ review: 'Nice' })} onChange={onChange} />);
    fireEvent.click(star(4));
    expect(onChange).toHaveBeenCalledWith({ rating: 4, review: 'Nice' });
  });

  it('marks the stars up to the current rating as pressed', () => {
    render(<BookRatingSection book={book({ rating: 3 })} onChange={vi.fn()} />);
    expect(star(3).getAttribute('aria-pressed')).toBe('true');
    expect(star(4).getAttribute('aria-pressed')).toBe('false');
  });

  it('clears the rating when the current value is tapped again', () => {
    const onChange = vi.fn();
    render(<BookRatingSection book={book({ rating: 3 })} onChange={onChange} />);
    fireEvent.click(star(3));
    expect(onChange).toHaveBeenCalledWith({ rating: undefined, review: undefined });
  });

  it('saves the review only on an explicit Save, not per keystroke', () => {
    const onChange = vi.fn();
    render(<BookRatingSection book={book({ rating: 5 })} onChange={onChange} />);
    const textarea = screen.getByRole('textbox', { name: 'My review' });
    fireEvent.change(textarea, { target: { value: 'A classic' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange).toHaveBeenCalledWith({ rating: 5, review: 'A classic' });
  });

  it('shows an existing review with an Edit action', () => {
    const onChange = vi.fn();
    render(<BookRatingSection book={book({ review: 'Old words' })} onChange={onChange} />);
    expect(screen.getByText('Old words')).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const textarea = screen.getByRole('textbox', { name: 'My review' }) as HTMLTextAreaElement;
    expect(textarea.value).toBe('Old words');
    fireEvent.change(textarea, { target: { value: 'New words' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onChange).toHaveBeenCalledWith({ rating: undefined, review: 'New words' });
  });

  it('cancels an edit without saving', () => {
    const onChange = vi.fn();
    render(<BookRatingSection book={book({ review: 'Keep me' })} onChange={onChange} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByRole('textbox', { name: 'My review' }), {
      target: { value: 'discard' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText('Keep me')).toBeTruthy();
  });
});
