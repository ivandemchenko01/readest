import React from 'react';

interface HourBarsProps {
  /** Seconds read per local hour of day, 24 values. */
  secs: number[];
}

const WIDTH = 320;
const HEIGHT = 64;
const LABEL_H = 14;
const SLOT = WIDTH / 24;

/** Static 24-bar SVG histogram of reading by hour of day (e-ink: solid ink, no animation). */
const HourBars: React.FC<HourBarsProps> = ({ secs }) => {
  const max = Math.max(0, ...secs);
  const plotH = HEIGHT - LABEL_H;
  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className='text-base-content block h-auto w-full'>
      <line
        x1={0}
        x2={WIDTH}
        y1={plotH}
        y2={plotH}
        stroke='currentColor'
        strokeOpacity={0.6}
        strokeWidth={1}
      />
      {secs.map((v, h) => {
        const barH = max > 0 ? (v / max) * (plotH - 2) : 0;
        return (
          <rect
            key={h}
            data-hour={h}
            x={h * SLOT + 1.5}
            y={plotH - barH}
            width={SLOT - 3}
            height={barH}
            fill='currentColor'
          />
        );
      })}
      {[0, 6, 12, 18].map((h) => (
        <text
          key={h}
          x={h * SLOT + SLOT / 2}
          y={HEIGHT - 3}
          textAnchor='middle'
          fontSize={9}
          fill='currentColor'
        >
          {h}
        </text>
      ))}
    </svg>
  );
};

export default HourBars;
