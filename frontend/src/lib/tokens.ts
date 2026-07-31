import type { Position } from '@/types/api';

/**
 * Bridges design tokens into places that need a colour *string* — SVG
 * presentation attributes, gradient stops, inline styles.
 *
 * We always emit `var(--token)` rather than a resolved value so light/dark
 * swaps happen in CSS with no re-render, and so no component ever contains a
 * literal hex. `color-mix()` gives us translucent variants of the same token.
 */

export type TokenColor = `var(--${string})`;

export function token(name: string): TokenColor {
  return `var(--${name.replace(/^--/, '')})` as TokenColor;
}

/** `alpha('color-series-1', 0.2)` -> a 20% version over the surface. */
export function alpha(name: string, amount: number): string {
  const pctValue = Math.round(Math.max(0, Math.min(1, amount)) * 100);
  return `color-mix(in oklch, ${token(name)} ${pctValue}%, transparent)`;
}

/** Mix a token toward another token (e.g. darken a series colour). */
export function mix(a: string, b: string, amount: number): string {
  const pctValue = Math.round(Math.max(0, Math.min(1, amount)) * 100);
  return `color-mix(in oklch, ${token(a)} ${pctValue}%, ${token(b)})`;
}

/* --------------------------------------------------------- categorical ---- */

/** Fixed categorical order. Never cycled — slot 9+ must fold into "Other". */
export const SERIES_TOKENS = [
  'color-series-1',
  'color-series-2',
  'color-series-3',
  'color-series-4',
  'color-series-5',
  'color-series-6',
  'color-series-7',
  'color-series-8',
] as const;

export const SERIES_COUNT = SERIES_TOKENS.length;

/**
 * Colour for categorical slot `index` (0-based). Slots past the eighth are
 * deliberately rendered in the neutral "other" ink rather than a made-up hue.
 */
export function seriesColor(index: number): string {
  const name = SERIES_TOKENS[index];
  return name ? token(name) : token('color-text-faint');
}

/**
 * All-pairs charts (scatter, bubble, small multiples) are capped at three
 * slots — past that, fold to "Other" or facet.
 */
export const ALL_PAIRS_SERIES_CAP = 3;

/* ------------------------------------------------------------ sequential -- */

export const SEQ_TOKENS = [
  'color-seq-100',
  'color-seq-200',
  'color-seq-300',
  'color-seq-400',
  'color-seq-500',
  'color-seq-600',
  'color-seq-700',
] as const;

/** Continuous magnitude in [0,1] -> a step of the single-hue blue ramp. */
export function sequentialColor(t: number): string {
  if (!Number.isFinite(t)) return token('color-chart-grid');
  const clamped = Math.max(0, Math.min(1, t));
  const idx = Math.round(clamped * (SEQ_TOKENS.length - 1));
  return token(SEQ_TOKENS[idx]!);
}

/* ------------------------------------------------------------- diverging -- */

export const DIVERGING_TOKENS = [
  'color-div-neg-2',
  'color-div-neg-1',
  'color-div-mid',
  'color-div-pos-1',
  'color-div-pos-2',
] as const;

/** Signed magnitude in [-1,1] -> a diverging step with a neutral midpoint. */
export function divergingColor(t: number): string {
  if (!Number.isFinite(t)) return token('color-div-mid');
  const clamped = Math.max(-1, Math.min(1, t));
  const idx = Math.round(((clamped + 1) / 2) * (DIVERGING_TOKENS.length - 1));
  return token(DIVERGING_TOKENS[idx]!);
}

/* --------------------------------------------------------------- status --- */

export type StatusTone = 'good' | 'warning' | 'serious' | 'critical' | 'neutral' | 'info';

export const STATUS_TOKENS: Record<StatusTone, string> = {
  good: 'color-good',
  warning: 'color-warning',
  serious: 'color-serious',
  critical: 'color-critical',
  info: 'color-accent',
  neutral: 'color-text-faint',
};

export function statusColor(tone: StatusTone): string {
  return token(STATUS_TOKENS[tone]);
}

/* ------------------------------------------------------------- position --- */

export const POSITIONS: readonly Position[] = ['GKP', 'DEF', 'MID', 'FWD'];

const POSITION_SLUG: Record<Position, string> = {
  GKP: 'gkp',
  DEF: 'def',
  MID: 'mid',
  FWD: 'fwd',
};

export function positionColor(position: Position): string {
  return token(`color-pos-${POSITION_SLUG[position]}`);
}

export function positionInk(position: Position): string {
  return token(`color-pos-${POSITION_SLUG[position]}-ink`);
}

export function positionSoft(position: Position): string {
  return token(`color-pos-${POSITION_SLUG[position]}-soft`);
}

/* ----------------------------------------------------------- difficulty --- */

/** Clamp any number the API hands us into the 1..5 ramp. */
export function difficultyStep(value: number | null | undefined): 1 | 2 | 3 | 4 | 5 {
  if (value === null || value === undefined || Number.isNaN(value)) return 3;
  const rounded = Math.round(value);
  return (rounded < 1 ? 1 : rounded > 5 ? 5 : rounded) as 1 | 2 | 3 | 4 | 5;
}

export function difficultyColor(value: number | null | undefined): string {
  return token(`color-fdr-${difficultyStep(value)}`);
}

export function difficultyInk(value: number | null | undefined): string {
  return token(`color-fdr-${difficultyStep(value)}-ink`);
}

/* ------------------------------------------------------ chart chrome ------ */

export const CHART = {
  grid: token('color-chart-grid'),
  axis: token('color-chart-axis'),
  label: token('color-chart-label'),
  surface: token('color-chart-surface'),
  text: token('color-text'),
  muted: token('color-text-muted'),
  /** 2px surface-coloured gap between adjacent fills / overlapping marks. */
  gap: token('color-chart-surface'),
} as const;

export const CHART_GEOMETRY = {
  /** Line stroke width. */
  lineWidth: 2,
  /** Rounded data-end radius on bars. */
  barRadius: 4,
  /** Minimum marker diameter. */
  markerSize: 8,
  /** Surface gap between neighbouring fills. */
  gapWidth: 2,
} as const;
