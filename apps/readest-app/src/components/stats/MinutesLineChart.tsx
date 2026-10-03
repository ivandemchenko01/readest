import React, { useState } from 'react';
import { niceAxisMax } from '@/utils/readingStats';

interface MinutesLineChartProps {
  /** Minutes per bucket; null = not reached yet (not drawn). */
  values: (number | null)[];
  /** X label per bucket; '' hides it. */
  labels: string[];
  /** Text shown under the chart when a bucket is tapped. */
  describe: (index: number) => string;
  height?: number;
}

const WIDTH = 320;
const LEFT = 30;
const RIGHT = 8;
const TOP = 8;
const BOTTOM = 18;

/**
 * Static SVG line chart for e-ink: no animation, no library, currentColor ink.
 * Responsive through the viewBox; tapping a column prints its value below.
 */
const MinutesLineChart: React.FC<MinutesLineChartProps> = ({
  values,
  labels,
  describe,
  height = 150,
}) => {
  const [selected, setSelected] = useState<number | null>(null);
  const max = niceAxisMax(Math.max(0, ...values.map((v) => v ?? 0)));
  const plotW = WIDTH - LEFT - RIGHT;
  const plotH = height - TOP - BOTTOM;
  const step = values.length > 1 ? plotW / (values.length - 1) : 0;
  const x = (i: number) => LEFT + (values.length > 1 ? i * step : plotW / 2);
  const y = (v: number) => TOP + plotH - (v / max) * plotH;
  const known = values.flatMap((v, i) => (v === null ? [] : [{ i, v }]));
  const columnW = values.length > 1 ? step : plotW;

  return (
    <div className='w-full'>
      <svg
        viewBox={`0 0 ${WIDTH} ${height}`}
        className='text-base-content block h-auto w-full'
        role='img'
      >
        {[0, max / 2, max].map((tick) => (
          <g key={tick}>
            <line
              x1={LEFT}
              x2={WIDTH - RIGHT}
              y1={y(tick)}
              y2={y(tick)}
              stroke='currentColor'
              strokeOpacity={tick === 0 ? 0.6 : 0.25}
              strokeDasharray={tick === 0 ? undefined : '2 3'}
              strokeWidth={1}
            />
            <text x={LEFT - 4} y={y(tick) + 3} textAnchor='end' fontSize={9} fill='currentColor'>
              {tick}
            </text>
          </g>
        ))}
        {labels.map((label, i) =>
          label ? (
            <text
              key={i}
              x={x(i)}
              y={height - 4}
              textAnchor={i === labels.length - 1 ? 'end' : 'middle'}
              fontSize={9}
              fill='currentColor'
            >
              {label}
            </text>
          ) : null,
        )}
        <polyline
          points={known.map(({ i, v }) => `${x(i)},${y(v)}`).join(' ')}
          fill='none'
          stroke='currentColor'
          strokeWidth={2}
          strokeLinejoin='round'
        />
        {known.map(({ i, v }) => (
          <circle
            key={i}
            cx={x(i)}
            cy={y(v)}
            r={selected === i ? 4 : 2.5}
            fill={selected === i ? 'none' : 'currentColor'}
            stroke='currentColor'
            strokeWidth={selected === i ? 2 : 0}
          />
        ))}
        {known.map(({ i }) => (
          <rect
            key={i}
            role='button'
            aria-label={describe(i)}
            x={x(i) - columnW / 2}
            y={0}
            width={columnW}
            height={height}
            fill='transparent'
            onClick={() => setSelected(i)}
          />
        ))}
      </svg>
      <p className='text-base-content min-h-5 text-center text-sm'>
        {selected !== null ? describe(selected) : ''}
      </p>
    </div>
  );
};

export default MinutesLineChart;
