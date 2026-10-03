import type { TranslationFunc } from '@/hooks/useTranslation';
import type { StatsPeriod } from '@/utils/readingStats';

export const PLACEHOLDER = '—';

export const formatDuration = (_: TranslationFunc, secs: number) => {
  const total = Math.round(secs / 60);
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return hours > 0
    ? _('{{hours}}h {{minutes}}m', { hours, minutes })
    : _('{{minutes}}m', { minutes });
};

export const formatPeriodLabel = (period: StatsPeriod, locale: string) => {
  if (period.kind === 'month') {
    return new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(period.start);
  }
  const fmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' });
  const last = new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate() - 1);
  return `${fmt.format(period.start)} – ${fmt.format(last)}`;
};

/** Short weekday names, Monday first. */
export const weekdayLabels = (locale: string) => {
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'short' });
  // 2024-01-01 was a Monday.
  return Array.from({ length: 7 }, (_, i) => fmt.format(new Date(2024, 0, 1 + i)));
};

export const formatDate = (date: Date, locale: string) =>
  new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', year: 'numeric' }).format(date);

export const formatMonth = (year: number, month: number, locale: string) =>
  new Intl.DateTimeFormat(locale, { month: 'short', year: '2-digit' }).format(
    new Date(year, month, 1),
  );
