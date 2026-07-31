import { useId, useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { CHART, CHART_GEOMETRY, seriesColor, token } from '@/lib/tokens';
import { areaPath, extentY, linePath, linear, segments } from './scales';
import { fade } from './chartUtils';
import type { NumericPoint } from './types';

export type SparklineProps = {
  /** Bare numbers are indexed by position; `null` is a gap, never a zero. */
  points: readonly NumericPoint[] | readonly (number | null)[];
  height?: number;
  /** Design-token name for the stroke. Defaults to categorical slot 1. */
  token?: string;
  /** Wash the area under the line. */
  area?: boolean;
  /** Emphasise the most recent reading with a ringed dot. */
  lastPoint?: boolean;
  curved?: boolean;
  strokeWidth?: number;
  /** Horizontal reference rule in data space (e.g. a season average). */
  baseline?: number | null;
  /** Inset so the stroke and the end dot are never clipped. */
  pad?: number;
  className?: string;
  ariaLabel: string;
};

/**
 * A trend at glyph size: no axes, no grid, no tooltip — it supports a number
 * rather than replacing it. An empty series renders nothing.
 */
export function Sparkline({
  points,
  height = 32,
  token: strokeToken,
  area = false,
  lastPoint = false,
  curved = true,
  strokeWidth = CHART_GEOMETRY.lineWidth,
  baseline = null,
  pad = 5,
  className,
  ariaLabel,
}: SparklineProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');

  const normalised = useMemo(() => toPoints(points), [points]);
  const colour = strokeToken ? token(strokeToken) : seriesColor(0);
  const ready =
    size.width > 0 && normalised.some((p) => p.y !== null && Number.isFinite(p.y));

  const { sx, sy, runs, last } = useMemo(() => {
    const series = [{ id: 'spark', label: ariaLabel, points: normalised }];
    const xs = normalised.map((p) => p.x);
    const dx: [number, number] =
      xs.length > 1 ? [Math.min(...xs), Math.max(...xs)] : [(xs[0] ?? 0) - 0.5, (xs[0] ?? 0) + 0.5];
    const dy = extentY(series, { pad: 0.12 });
    const scaleX = linear(dx, [pad, Math.max(pad, size.width - pad)]);
    const scaleY = linear(dy, [height - pad, pad]);
    const defined = normalised.filter((p) => p.y !== null && Number.isFinite(p.y));
    return {
      sx: scaleX,
      sy: scaleY,
      runs: segments(normalised),
      last: defined.length > 0 ? defined[defined.length - 1]! : null,
    };
  }, [ariaLabel, height, normalised, pad, size.width]);

  return (
    <div ref={ref} className={cn('relative w-full', className)} style={{ height }}>
      {ready ? (
        <svg width={size.width} height={height} role="img" aria-label={ariaLabel}>
          {area ? (
            <defs>
              <linearGradient id={uid} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={fade(colour, 0.24)} />
                <stop offset="100%" stopColor={fade(colour, 0.02)} />
              </linearGradient>
            </defs>
          ) : null}

          {baseline !== null && Number.isFinite(baseline) ? (
            <line
              aria-hidden
              x1={0}
              x2={size.width}
              y1={sy(baseline)}
              y2={sy(baseline)}
              stroke={CHART.grid}
              strokeWidth={1}
            />
          ) : null}

          {area
            ? runs.map((run, index) =>
                run.length > 1 ? (
                  <path
                    key={`a-${index}`}
                    d={areaPath(
                      run,
                      (p) => sx(p.x),
                      (p) => sy(p.y as number),
                      height - pad,
                      curved,
                    )}
                    fill={`url(#${uid})`}
                    stroke="none"
                  />
                ) : null,
              )
            : null}

          {runs.map((run, index) =>
            run.length === 1 ? (
              <circle
                key={`p-${index}`}
                cx={sx(run[0]!.x)}
                cy={sy(run[0]!.y as number)}
                r={CHART_GEOMETRY.markerSize / 2}
                fill={colour}
              />
            ) : (
              <path
                key={`s-${index}`}
                d={linePath(
                  run,
                  (p) => sx(p.x),
                  (p) => sy(p.y as number),
                  curved,
                )}
                fill="none"
                stroke={colour}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ),
          )}

          {lastPoint && last ? (
            <circle
              cx={sx(last.x)}
              cy={sy(last.y as number)}
              r={CHART_GEOMETRY.markerSize / 2}
              fill={colour}
              stroke={CHART.surface}
              strokeWidth={CHART_GEOMETRY.gapWidth}
            />
          ) : null}
        </svg>
      ) : null}
    </div>
  );
}

function toPoints(
  input: readonly NumericPoint[] | readonly (number | null)[],
): NumericPoint[] {
  const list = input as readonly (NumericPoint | number | null)[];
  return list.map((entry, index) =>
    entry === null || typeof entry === 'number'
      ? { x: index, y: entry }
      : { x: entry.x, y: entry.y, ...(entry.label ? { label: entry.label } : {}) },
  );
}
