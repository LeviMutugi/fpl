/**
 * Geometry and colour helpers shared by the chart kit.
 *
 * Colour never becomes a literal here: every function takes an already-resolved
 * `var(--token)` string (from `@/lib/tokens`) and hands back a `color-mix()`
 * expression built on top of it, so light/dark still swap in CSS.
 */

import { seriesColor, token } from '@/lib/tokens';
import { barPath } from './scales';

/** Blend a resolved colour toward transparent. `fade(c, 0.12)` -> a 12% wash. */
export function fade(colour: string, amount: number): string {
  const pctValue = Math.round(clampUnit(amount) * 100);
  return `color-mix(in oklch, ${colour} ${pctValue}%, transparent)`;
}

/** Blend two resolved colours: `blend(a, b, 0.3)` is 30% `a`, 70% `b`. */
export function blend(a: string, b: string, amount: number): string {
  const pctValue = Math.round(clampUnit(amount) * 100);
  return `color-mix(in oklch, ${a} ${pctValue}%, ${b})`;
}

export function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

/**
 * A datum's own colour wins; otherwise the categorical slot for its index.
 *
 * Usually the caller names a design token (`'color-series-3'`) and it is
 * wrapped in `var()`. Some colours arrive as data rather than design — a club's
 * `primary_hex`, a model's registered hue — and those are already resolvable
 * colours. Wrapping one of those in `var()` yields a custom property that does
 * not exist, and SVG silently paints it black, so a value that already looks
 * like a colour is passed straight through.
 */
const RESOLVED_COLOUR = /^(#|rgb|hsl|oklch|oklab|lab|lch|color\(|color-mix\(|var\(|transparent$|currentColor$)/i;

export function slotColor(name: string | undefined, index: number): string {
  if (!name) return seriesColor(index);
  return RESOLVED_COLOUR.test(name) ? name : token(name);
}

/**
 * A bar rounded on one edge only — the data end — so it stays anchored to its
 * baseline. `cap` names the rounded edge; `'top'`/`'right'` reuse `barPath`.
 */
export function cappedBar(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  cap: 'top' | 'bottom' | 'left' | 'right',
): string {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (w === 0 || h === 0) return '';

  if (cap === 'top') return barPath(x, y, w, h, radius, 'vertical');
  if (cap === 'right') return barPath(x, y, w, h, radius, 'horizontal');

  if (cap === 'bottom') {
    const r = Math.min(radius, w / 2, h);
    return [
      `M${x},${y}`,
      `L${x + w},${y}`,
      `L${x + w},${y + h - r}`,
      `Q${x + w},${y + h} ${x + w - r},${y + h}`,
      `L${x + r},${y + h}`,
      `Q${x},${y + h} ${x},${y + h - r}`,
      'Z',
    ].join(' ');
  }

  const r = Math.min(radius, h / 2, w);
  return [
    `M${x + w},${y}`,
    `L${x + r},${y}`,
    `Q${x},${y} ${x},${y + r}`,
    `L${x},${y + h - r}`,
    `Q${x},${y + h} ${x + r},${y + h}`,
    `L${x + w},${y + h}`,
    'Z',
  ].join(' ');
}

/** Both ends rounded — for interior stack segments that never touch a baseline. */
export function pillBar(
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): string {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  const r = Math.max(0, Math.min(radius, w / 2, h / 2));
  if (w === 0 || h === 0) return '';
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

/** Extent over a loose list of values; `null` and non-finite entries are ignored. */
export function valueExtent(
  values: readonly (number | null | undefined)[],
  options: { includeZero?: boolean; pad?: number } = {},
): [number, number] {
  const { includeZero = true, pad = 0 } = options;
  let lo = Infinity;
  let hi = -Infinity;
  for (const value of values) {
    if (value === null || value === undefined || !Number.isFinite(value)) continue;
    if (value < lo) lo = value;
    if (value > hi) hi = value;
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
  if (pad > 0) {
    const span = hi - lo;
    return [lo - span * pad, hi + span * pad];
  }
  return [lo, hi];
}

export type BandLayout = {
  /** Distance between two band centres. */
  step: number;
  /** Rendered mark thickness — capped, so wide slots keep their air. */
  thickness: number;
  centre: (index: number) => number;
  /** Leading edge of the mark for `index`. */
  start: (index: number) => number;
};

/**
 * Evenly spaced categorical bands. Marks are capped at `maxThickness` (24px by
 * default) so a four-bar chart never renders four slabs.
 */
export function bandLayout(
  count: number,
  origin: number,
  extent: number,
  options: { padding?: number; maxThickness?: number; minThickness?: number } = {},
): BandLayout {
  const { padding = 0.3, maxThickness = 24, minThickness = 2 } = options;
  const n = Math.max(1, count);
  const step = extent / n;
  const thickness = Math.max(minThickness, Math.min(maxThickness, step * (1 - padding)));
  const centre = (index: number) => origin + step * (index + 0.5);
  return { step, thickness, centre, start: (index) => centre(index) - thickness / 2 };
}

export type LabelBox = { x: number; y: number; width: number; height: number };

/** Rough advance width for a label, good enough to reject collisions. */
export function estimateTextWidth(text: string, fontSize: number): number {
  return text.length * fontSize * 0.54;
}

export function boxesOverlap(a: LabelBox, b: LabelBox, gap = 2): boolean {
  return (
    a.x - gap < b.x + b.width &&
    a.x + a.width + gap > b.x &&
    a.y - gap < b.y + b.height &&
    a.y + a.height + gap > b.y
  );
}

/** Quantise a probability into the 0..1 fraction of a discrete grid. */
export function fillCount(fraction: number, cells: number): number {
  return Math.round(clampUnit(fraction) * cells);
}
