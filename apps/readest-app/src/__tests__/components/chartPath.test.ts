import { describe, it, expect } from 'vitest';
import { monotonePath } from '@/components/stats/chartPath';

type Seg = { x0: number; y0: number; c1y: number; c2y: number; x1: number; y1: number };

// Parses "M x,y C c1x,c1y c2x,c2y x,y ..." into cubic segments.
const segments = (d: string): Seg[] => {
  const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
  const segs: Seg[] = [];
  for (let i = 2; i + 6 <= nums.length; i += 6) {
    segs.push({
      x0: nums[i - 2]!,
      y0: nums[i - 1]!,
      c1y: nums[i + 1]!,
      c2y: nums[i + 3]!,
      x1: nums[i + 4]!,
      y1: nums[i + 5]!,
    });
  }
  return segs;
};

describe('monotonePath', () => {
  it('returns nothing for no points and a bare move for one point', () => {
    expect(monotonePath([])).toBe('');
    expect(monotonePath([{ x: 5, y: 7 }])).toBe('M5,7');
  });

  it('draws a straight line between two points', () => {
    expect(
      monotonePath([
        { x: 0, y: 10 },
        { x: 20, y: 30 },
      ]),
    ).toBe('M0,10L20,30');
  });

  it('passes through every point without NaN', () => {
    const points = [
      { x: 0, y: 100 },
      { x: 10, y: 100 },
      { x: 20, y: 40 },
      { x: 30, y: 100 },
      { x: 40, y: 0 },
    ];
    const d = monotonePath(points);
    expect(d).not.toMatch(/NaN|Infinity/);
    const segs = segments(d);
    expect(segs).toHaveLength(4);
    segs.forEach((s, i) => {
      expect(s.x1).toBe(points[i + 1]!.x);
      expect(s.y1).toBe(points[i + 1]!.y);
    });
  });

  it('keeps every segment inside the range of its two endpoints', () => {
    // Zero days next to peaks: an ordinary spline would dip below the baseline.
    const ys = [0, 0, 80, 0, 5, 60, 60, 0, 100, 3];
    const d = monotonePath(ys.map((y, i) => ({ x: i * 10, y })));
    for (const s of segments(d)) {
      const lo = Math.min(s.y0, s.y1);
      const hi = Math.max(s.y0, s.y1);
      expect(s.c1y).toBeGreaterThanOrEqual(lo);
      expect(s.c1y).toBeLessThanOrEqual(hi);
      expect(s.c2y).toBeGreaterThanOrEqual(lo);
      expect(s.c2y).toBeLessThanOrEqual(hi);
    }
  });

  it('flattens at local extrema and on flat runs', () => {
    const d = monotonePath([
      { x: 0, y: 0 },
      { x: 10, y: 50 },
      { x: 20, y: 0 },
    ]);
    const [a, b] = segments(d);
    expect(a!.c2y).toBe(50); // horizontal tangent at the peak
    expect(b!.c1y).toBe(50);
  });
});
