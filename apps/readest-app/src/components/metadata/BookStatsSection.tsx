import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MdExpandLess, MdExpandMore } from 'react-icons/md';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import { StatisticsDb } from '@/services/statistics/statisticsDb';
import { localEpochDay, toEpochSecs, tzOffsetSecs, zeroFill } from '@/utils/readingStats';
import { formatDuration } from '@/app/statistics/utils/format';
import MinutesLineChart from '@/components/stats/MinutesLineChart';

const DAYS = 30;

// Mounted only once expanded, so the collapsed section needs no app router
// (book details also render outside one, e.g. in isolated component tests).
const MoreButton = ({ bookHash, label }: { bookHash: string; label: string }) => {
  const router = useRouter();
  return (
    <button
      type='button'
      className='btn btn-outline h-11 min-h-11 self-end'
      onClick={() => router.push(`/statistics?book=${bookHash}`)}
    >
      {label}
    </button>
  );
};

interface Figures {
  daily: number[];
  totalSecs: number;
  days: number;
}

interface BookStatsSectionProps {
  bookHash: string;
  /** Owned by the details view, which persists it. */
  expanded: boolean;
  onToggle: () => void;
}

/**
 * Collapsible reading statistics for one book. statistics.db is only opened
 * while the section is expanded.
 */
const BookStatsSection: React.FC<BookStatsSectionProps> = ({ bookHash, expanded, onToggle }) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const [figures, setFigures] = useState<Figures | null>(null);

  useEffect(() => {
    if (!expanded || !appService) return;
    let cancelled = false;
    const load = async () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (DAYS - 1));
      const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      const db = await StatisticsDb.open(appService);
      const [rows, summary] = await Promise.all([
        db.getDailyReadingSecs(toEpochSecs(start), toEpochSecs(end), tzOffsetSecs(start), bookHash),
        db.getBookSummary(bookHash, tzOffsetSecs(now)),
      ]);
      if (cancelled) return;
      setFigures({
        daily: zeroFill(rows, localEpochDay(start), DAYS),
        totalSecs: summary?.totalSecs ?? 0,
        days: summary?.days ?? 0,
      });
    };
    void load().catch((err) => console.warn('[stats] book stats failed:', err));
    return () => {
      cancelled = true;
    };
  }, [expanded, appService, bookHash]);

  const labels = Array.from({ length: DAYS }, (_v, i) =>
    i === 0 ? '-30' : i === DAYS - 1 ? _('Today') : '',
  );

  return (
    <div className='metadata-statistics'>
      <button
        type='button'
        className='flex min-h-11 w-full items-center justify-between rounded-lg px-4 py-3 text-left'
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className='text-neutral-content/85 text-base font-semibold'>{_('Statistics')}</span>
        {expanded ? <MdExpandLess className='h-5 w-5' /> : <MdExpandMore className='h-5 w-5' />}
      </button>
      {expanded && (
        <div className='flex flex-col gap-2 px-4 py-1 text-sm'>
          <MinutesLineChart
            values={figures ? figures.daily.map((s) => s / 60) : new Array<null>(DAYS).fill(null)}
            labels={labels}
            describe={(i) => (figures ? formatDuration(_, figures.daily[i] ?? 0) : '')}
            height={110}
          />
          <div className='flex justify-between'>
            <span>{_('Total time')}</span>
            <span className='font-semibold'>
              {figures ? formatDuration(_, figures.totalSecs) : '—'}
            </span>
          </div>
          <div className='flex justify-between'>
            <span>{_('Days read')}</span>
            <span className='font-semibold'>{figures ? figures.days : '—'}</span>
          </div>
          <MoreButton bookHash={bookHash} label={_('More')} />
        </div>
      )}
    </div>
  );
};

export default BookStatsSection;
