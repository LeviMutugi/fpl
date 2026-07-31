import { line as d3Line, area as d3Area, curveMonotoneX, curveLinear } from 'd3-shape';
import { scaleLinear } from 'd3-scale';
import type { LineSeries, NumericPoint } from './types';

/** True when a series has at least one real (non-null) y. */
export function hasData(series: readonly LineSeries[]): boolean {
  return series.some((s) => s.points.some((p) => p.y !== null && Number.isFinite(p.y)));
}

export function extentX(series: readonly LineSeries[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (const p of s.points) {
      if (!Number.isFinite(p.x)) continue;
      if (p.x < lo) lo = p.x;
      if (p.x > hi) hi = p.x;
    }
  }
  if (!Number.isFinite(lo)) return [0, 1];
  if (lo === hi) return [lo - 0.5, hi + 0.5];
  return [lo, hi];
}

export function extentY(
  series: readonly LineSeries[],
  options: { includeZero?: boolean; pad?: number } = {},
): [number, number] {
  const { includeZero = false, pad = 0.08 } = options;
  let lo = Infinity;
  let hi = -Infinity;
  for (const s of series) {
    for (const p of s.points) {
      if (p.y === null || !Number.isFinite(p.y)) continue;
      if (p.y < lo) lo = p.y;
      if (p.y > hi) hi = p.y;
    }
  }
  if (!Number.isFinite(lo)) return [0, 1];
  if (includeZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (lo === hi) {
    const bump = Math.abs(lo) > 1 ? Math.abs(lo) * 0.1 : 0.5;
    return [lo - bump, hi + bump];
  }
  const span = hi - lo;
  return [lo - span * pad, hi + span * pad];
}

/** `scaleLinear` with a guaranteed non-degenerate range. */
export function linear(domain: [number, number], range: [number, number]) {
  return scaleLinear().domain(domain).range(range);
}

/** Round, human-friendly ticks. Returns at most `count` values. */
export function niceTicks(domain: [number, number], count = 5): number[] {
  // `.nice()` widens the domain to round numbers, so its ticks can sit outside
  // the domain the caller actually scaled with — those ticks then land beyond
  // the plot area and, because charts render with `overflow-visible`, print
  // outside the card. Only ticks the scale can place are returned.
  const [lo, hi] = domain[0] <= domain[1] ? domain : [domain[1], domain[0]];
  const epsilon = (hi - lo) * 1e-9;
  const scale = scaleLinear().domain(domain).nice(count);
  const inside = scale.ticks(count).filter((v) => v >= lo - epsilon && v <= hi + epsilon);
  // A domain narrower than one tick step would otherwise leave a bare axis.
  return inside.length > 0 ? inside : [lo, hi];
}

/**
 * Split a series into runs of consecutive non-null points, so `null` becomes a
 * visual gap instead of a line through zero.
 */
export function segments(points: readonly NumericPoint[]): NumericPoint[][] {
  const runs: NumericPoint[][] = [];
  let current: NumericPoint[] = [];
  for (const point of points) {
    if (point.y === null || !Number.isFinite(point.y) || !Number.isFinite(point.x)) {
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push(point);
    }
  }
  if (current.length) runs.push(current);
  return runs;
}

export type Accessor = (point: NumericPoint) => number;

export function linePath(
  points: readonly NumericPoint[],
  sx: Accessor,
  sy: Accessor,
  curved = true,
): string {
  const generator = d3Line<NumericPoint>()
    .x(sx)
    .y(sy)
    .curve(curved ? curveMonotoneX : curveLinear);
  return generator([...points]) ?? '';
}

export function areaPath(
  points: readonly NumericPoint[],
  sx: Accessor,
  sy: Accessor,
  baseline: number,
  curved = true,
): string {
  const generator = d3Area<NumericPoint>()
    .x(sx)
    .y1(sy)
    .y0(baseline)
    .curve(curved ? curveMonotoneX : curveLinear);
  return generator([...points]) ?? '';
}

/**
 * A rounded-top bar path. Only the data end is rounded; the baseline end stays
 * square so the bar stays anchored to the axis.
 */
export function barPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  orientation: 'vertical' | 'horizontal' = 'vertical',
): string {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (w === 0 || h === 0) return '';

  if (orientation === 'vertical') {
    const r = Math.min(radius, w / 2, h);
    return [
      `M${x},${y + h}`,
      `L${x},${y + r}`,
      `Q${x},${y} ${x + r},${y}`,
      `L${x + w - r},${y}`,
      `Q${x + w},${y} ${x + w},${y + r}`,
      `L${x + w},${y + h}`,
      'Z',
    ].join(' ');
  }

  const r = Math.min(radius, h / 2, w);
  return [
    `M${x},${y}`,
    `L${x + w - r},${y}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `L${x + w},${y + h - r}`,
    `Q${x + w},${y + h} ${x + w - r},${y + h}`,
    `L${x},${y + h}`,
    'Z',
  ].join(' ');
}

/** A fully rounded rect path (both ends), for stack middles and pills. */
export function roundedRect(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  return [
    `M${x + r},${y}`,
    `L${x + w - r},${y}`,
    `Q${x + w},${y} ${x + w},${y + r}`,
    `L${x + w},${y + h - r}`,
    `Q${x + w},${y + h} ${x + w - r},${y + h}`,
    `L${x + r},${y + h}`,
    `Q${x},${y + h} ${x},${y + h - r}`,
    `L${x},${y + r}`,
    `Q${x},${y} ${x + r},${y}`,
    'Z',
  ].join(' ');
}

/** Polar helper for radar/gauge geometry. Angles in radians, 12 o'clock = 0. */
export function polar(cx: number, cy: number, radius: number, angle: number): [number, number] {
  return [cx + radius * Math.sin(angle), cy - radius * Math.cos(angle)];
}

/** SVG arc path along a circle, sweeping from `a0` to `a1` (radians). */
export function arcPath(
  cx: number,
  cy: number,
  radius: number,
  a0: number,
  a1: number,
): string {
  const [x0, y0] = polar(cx, cy, radius, a0);
  const [x1, y1] = polar(cx, cy, radius, a1);
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${x0},${y0} A${radius},${radius} 0 ${large} ${sweep} ${x1},${y1}`;
}

/** Nearest index in a sorted-by-x series to a given x value. */
export function nearestIndex(points: readonly NumericPoint[], x: number): number {
  let best = -1;
  let bestDistance = Infinity;
  points.forEach((point, index) => {
    const d = Math.abs(point.x - x);
    if (d < bestDistance) {
      bestDistance = d;
      best = index;
    }
  });
  return best;
}
