/** Shared shapes for the chart kit. */

export type Margin = { top: number; right: number; bottom: number; left: number };

export type PlotArea = { x: number; y: number; width: number; height: number };

/**
 * A point in a continuous series. `y === null` means "no data" and is rendered
 * as a **gap**, never as zero.
 */
export type NumericPoint = { x: number; y: number | null; label?: string };

export type LineSeries = {
  id: string;
  label: string;
  points: readonly NumericPoint[];
  /** Design-token name; defaults to the categorical slot for its index. */
  token?: string;
  /** Dashed stroke — the secondary channel when two series share a hue family. */
  dashed?: boolean;
  /** Render as a reference line rather than a data series (excluded from legend hover). */
  reference?: boolean;
};

/** One bar / cell keyed by a categorical label. */
export type CategoryDatum = {
  key: string;
  label?: string;
  value: number | null;
  /** Override the fill for this single datum (e.g. a positional colour). */
  token?: string;
};

/** A stack: one x category, one value per stack key. */
export type StackedDatum = {
  key: string;
  label?: string;
  values: Readonly<Record<string, number | null>>;
};

export type StackKey = { id: string; label: string; token?: string };

export type ScatterDatum = {
  id: string;
  x: number | null;
  y: number | null;
  label: string;
  /** Optional group for colour — capped at three groups by the all-pairs rule. */
  group?: string;
  /** Optional size channel. */
  size?: number;
  /** Force a direct label for this point. */
  emphasise?: boolean;
};

export type ViolinDatum = {
  id: string;
  label: string;
  /** Quantiles from the API: p10/p25/p50/p75/p90. */
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /** Optional point estimate (mean/xP) drawn as a tick. */
  mean?: number | null;
  token?: string;
};

export const DEFAULT_MARGIN: Margin = { top: 12, right: 16, bottom: 28, left: 40 };

export function plotArea(
  size: { width: number; height: number },
  margin: Margin = DEFAULT_MARGIN,
): PlotArea {
  return {
    x: margin.left,
    y: margin.top,
    width: Math.max(0, size.width - margin.left - margin.right),
    height: Math.max(0, size.height - margin.top - margin.bottom),
  };
}

export function withMargin(overrides: Partial<Margin>): Margin {
  return { ...DEFAULT_MARGIN, ...overrides };
}
