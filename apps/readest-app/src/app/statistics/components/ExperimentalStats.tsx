import { useEffect, useState } from 'react';
import { MdExpandLess, MdExpandMore } from 'react-icons/md';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import {
  StatisticsDb,
  type PeriodTotals,
  type SessionStats,
  type Streaks,
} from '@/services/statistics/statisticsDb';
import { type StatsPeriod, localEpochDay, pagesPerHour, tzOffsetSecs } from '@/utils/readingStats';
import HourBars from '@/components/stats/HourBars';
import MinutesLineChart from '@/components/stats/MinutesLineChart';
import { loadDailyPages, loadMonthlyPages, periodRange } from '../utils/loadStats';
import { PLACEHOLDER, formatDuration } from '../utils/format';

/** Events further apart than this start a new reading session. */
const SESSION_GAP_SECS = 10 * 60;

interface ExperimentalStatsProps {
  /** null = All time (book mode only). */
  period: StatsPeriod | null;
  now: Date;
  bookHash?: string;
  /** X labels and bucket names shared with the main chart (days, or months for All time). */
  labels: string[];
  bucketName: (index: number) => string;
}

const Row = ({ label, value }: { label: string; value: string }) => (
  <div className='flex justify-between py-2'>
    <span>{label}</span>
    <span className='font-semibold'>{value}</span>
  </div>
);

/**
 * Collapsed by default; its aggregates run only while it is expanded, one
 * query per figure, each shown as soon as it arrives.
 */
const ExperimentalStats = ({
  period,
  now,
  bookHash,
  labels,
  bucketName,
}: ExperimentalStatsProps) => {
  const _ = useTranslation();
  const { appService } = useEnv();
  const [expanded, setExpanded] = useState(false);
  const [pages, setPages] = useState<(number | null)[] | null>(null);
  const [sessions, setSessions] = useState<SessionStats | null>(null);
  const [streaks, setStreaks] = useState<Streaks | null>(null);
  const [hours, setHours] = useState<number[] | null>(null);
  const [totals, setTotals] = useState<PeriodTotals | null>(null);

  useEffect(() => {
    setPages(null);
    setSessions(null);
    setStreaks(null);
    setHours(null);
    setTotals(null);
    if (!expanded || !appService || (!period && !bookHash)) return;
    let cancelled = false;
    const run = <T,>(load: (db: StatisticsDb) => Promise<T>, set: (value: T) => void) =>
      StatisticsDb.open(appService)
        .then(load)
        .then((value) => {
          if (!cancelled) set(value);
        })
        .catch((err) => console.warn('[stats] experimental figure failed:', err));
    const { from, to } = periodRange(period, now);
    const offset = tzOffsetSecs(period?.start ?? now);
    run(
      async (db) =>
        period
          ? loadDailyPages(db, period, now, bookHash)
          : (await loadMonthlyPages(db, now, bookHash!)).map((m) => m.secs),
      setPages,
    );
    run((db) => db.getSessionStats(from, to, SESSION_GAP_SECS, bookHash), setSessions);
    run((db) => db.getStreaks(localEpochDay(now), tzOffsetSecs(now), bookHash), setStreaks);
    run((db) => db.getHourlyReadingSecs(from, to, offset, bookHash), setHours);
    run((db) => db.getPeriodTotals(from, to, bookHash), setTotals);
    return () => {
      cancelled = true;
    };
  }, [expanded, appService, period, now, bookHash]);

  const num = (value: number | undefined) => (value === undefined ? PLACEHOLDER : String(value));
  const avgSession =
    sessions && sessions.sessions > 0
      ? formatDuration(_, sessions.secs / sessions.sessions)
      : PLACEHOLDER;
  const speed = totals ? pagesPerHour(totals.pages, totals.secs) : null;
  const pageValues = pages ?? new Array<null>(labels.length).fill(null);

  return (
    <section className='eink-bordered border-base-content/20 rounded-lg border'>
      <button
        type='button'
        className='flex min-h-11 w-full items-center justify-between px-3 py-2 text-start'
        aria-expanded={expanded}
        onClick={() => setExpanded((e) => !e)}
      >
        <span className='font-semibold'>{_('Experimental')}</span>
        {expanded ? <MdExpandLess className='h-6 w-6' /> : <MdExpandMore className='h-6 w-6' />}
      </button>
      {expanded && (
        <div className='flex flex-col gap-3 px-3 pb-3'>
          <div>
            <MinutesLineChart
              values={pageValues}
              labels={labels}
              describe={(i) =>
                `${bucketName(i)}: ${_('{{pages}} pages', { pages: pageValues[i] ?? 0 })}`
              }
              height={100}
            />
            <p className='text-base-content/80 text-center text-xs'>
              {period ? _('Pages per day') : _('Pages per month')}
            </p>
          </div>
          <div className='divide-base-content/20 flex flex-col divide-y'>
            <Row label={_('Sessions')} value={num(sessions?.sessions)} />
            <Row label={_('Avg session length')} value={avgSession} />
            <Row
              label={_('Avg speed, pages per hour')}
              value={speed === null ? PLACEHOLDER : String(speed)}
            />
            <Row label={_('Current streak, days')} value={num(streaks?.current)} />
            <Row label={_('Longest streak, days')} value={num(streaks?.longest)} />
          </div>
          <div>
            {hours ? <HourBars secs={hours} /> : <p className='text-center'>{PLACEHOLDER}</p>}
            <p className='text-base-content/80 text-center text-xs'>
              {_('Reading by hour of day')}
            </p>
          </div>
        </div>
      )}
    </section>
  );
};

export default ExperimentalStats;
