export interface ChartPoint {
  x: number;
  y: number;
}

const r = (n: number) => String(Math.round(n * 100) / 100);

/**
 * SVG path through `points` (x strictly increasing) as a monotone cubic
 * (Fritsch–Carlson, same tangents as d3's curveMonotoneX): every segment stays
 * within the y range of its two endpoints, so the curve never dips below zero
 * or invents a peak between days.
 */
export const monotonePath = (points: ChartPoint[]): string => {
  const n = points.length;
  if (n === 0) return '';
  const head = `M${r(points[0]!.x)},${r(points[0]!.y)}`;
  if (n === 1) return head;
  if (n === 2) return `${head}L${r(points[1]!.x)},${r(points[1]!.y)}`;

  const h: number[] = [];
  const d: number[] = []; // secant slopes
  for (let i = 0; i < n - 1; i++) {
    h.push(points[i + 1]!.x - points[i]!.x);
    d.push((points[i + 1]!.y - points[i]!.y) / h[i]!);
  }
  const m = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const d0 = d[i - 1]!;
    const d1 = d[i]!;
    if (d0 * d1 <= 0) continue; // local extremum or flat: horizontal tangent
    const p = (d0 * h[i]! + d1 * h[i - 1]!) / (h[i - 1]! + h[i]!);
    m[i] = Math.sign(d0) * Math.min(Math.abs(d0), Math.abs(d1), 0.5 * Math.abs(p)) * 2;
  }
  // One-sided end tangents (d3 slope2), still within [0, 3 * secant].
  m[0] = (3 * d[0]! - m[1]!) / 2;
  m[n - 1] = (3 * d[n - 2]! - m[n - 2]!) / 2;
  if (m[0] * d[0]! <= 0) m[0] = 0;
  if (m[n - 1]! * d[n - 2]! <= 0) m[n - 1] = 0;

  let path = head;
  for (let i = 0; i < n - 1; i++) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const third = h[i]! / 3;
    path +=
      `C${r(a.x + third)},${r(a.y + m[i]! * third)} ` +
      `${r(b.x - third)},${r(b.y - m[i + 1]! * third)} ${r(b.x)},${r(b.y)}`;
  }
  return path;
};
