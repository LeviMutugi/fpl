import { useId, useMemo, useState } from 'react';
import { area as d3Area, curveLinear, curveMonotoneX } from 'd3-shape';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { CHART, CHART_GEOMETRY } from '@/lib/tokens';
import { XAxis, YAxis, type AxisTick } from './ChartAxis';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { extentX, hasData, linePath, linear, niceTicks } from './scales';
import { fade, slotColor, valueExtent } from './chartUtils';
import { plotArea, withMargin, type LineSeries, type Margin, type NumericPoint } from './types';

export type AreaChartProps = {
  series: readonly LineSeries[];
  height?: number;
  margin?: Partial<Margin>;
  /** Stack the series on top of each other rather than overlaying them. */
  stacked?: boolean;
  /** Monotone curve (default) vs straight segments. */
  curved?: boolean;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  xTicks?: number;
  yTicks?: number;
  includeZero?: boolean;
  /** Dim every series except this one. */
  activeSeriesId?: string | null;
  /** Draw a marker at every point rather than only on hover. */
  showPoints?: boolean;
  /** Opacity of the gradient where it meets the line. */
  fillOpacity?: number;
  className?: string;
  ariaLabel: string;
};

type Band = { x: number; y: number; y0: number; y1: number };

/**
 * Gradient-filled area chart, overlaid or stacked. `null` y values are gaps,
 * never zeroes — in stacked mode a gap contributes nothing to the bands above
 * it. An empty dataset renders nothing; let `ChartFrame` show the empty state.
 */
export function AreaChart({
  series,
  height = 220,
  margin,
  stacked = false,
  curved = true,
  formatX = (v) => String(v),
  formatY = (v) => v.toFixed(1),
  xTicks = 6,
  yTicks = 5,
  includeZero = true,
  activeSeriesId = null,
  showPoints = false,
  fillOpacity = 0.22,
  className,
  ariaLabel,
}: AreaChartProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const tip = useChartTooltip<{ seriesId: string; x: number; y: number }>();
  const [hoverX, setHoverX] = useState<number | null>(null);

  const m = withMargin(margin ?? {});
  const area = plotArea(size, m);
  const ready = size.width > 0 && size.height > 0 && hasData(series);

  const { sx, sy, xTickList, yTickList, aligned } = useMemo(() => {
    const stacks = buildBands(series, stacked);
    const dx = extentX(series);
    const dy = valueExtent(
      stacks.flatMap((rows) =>
        rows.flatMap((row) => (row ? [row.y0, row.y1] : [])),
      ),
      { includeZero: includeZero || stacked, pad: 0.08 },
    );
    const scaleX = linear(dx, [area.x, area.x + area.width]);
    const scaleY = linear(dy, [area.y + area.height, area.y]);
    return {
      sx: scaleX,
      sy: scaleY,
      aligned: stacks,
      xTickList: niceTicks(dx, xTicks).map<AxisTick>((v) => ({
        value: v,
        label: formatX(v),
        offset: scaleX(v),
      })),
      yTickList: niceTicks(dy, yTicks).map<AxisTick>((v) => ({
        value: v,
        label: formatY(v),
        offset: scaleY(v),
      })),
    };
  }, [
    area.height,
    area.width,
    area.x,
    area.y,
    formatX,
    formatY,
    includeZero,
    series,
    stacked,
    xTicks,
    yTicks,
  ]);

  const zeroOffset = sy(0);
  const crossesZero = zeroOffset >= area.y && zeroOffset <= area.y + area.height;

  return (
    <div ref={ref} className={cn('relative h-full w-full', className)} style={{ height }}>
      {ready ? (
        <svg
          width={size.width}
          height={size.height}
          role="img"
          aria-label={ariaLabel}
          className="overflow-visible"
          onPointerLeave={() => {
            tip.hide();
            setHoverX(null);
          }}
        >
          <defs>
            {series.map((s, index) => {
              const colour = slotColor(s.token, index);
              return (
                <linearGradient key={s.id} id={`${uid}-${index}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={fade(colour, fillOpacity)} />
                  <stop
                    offset="100%"
                    stopColor={fade(colour, stacked ? fillOpacity * 0.75 : 0.02)}
                  />
                </linearGradient>
              );
            })}
          </defs>

          <YAxis
            area={area}
            ticks={yTickList}
            zeroAt={crossesZero && !stacked ? zeroOffset : null}
          />
          <XAxis area={area} ticks={xTickList} />

          {hoverX !== null ? (
            <line
              aria-hidden
              x1={hoverX}
              x2={hoverX}
              y1={area.y}
              y2={area.y + area.height}
              stroke={CHART.axis}
              strokeWidth={1}
            />
          ) : null}

          {series.map((s, index) => {
            const colour = slotColor(s.token, index);
            const dimmed = activeSeriesId !== null && activeSeriesId !== s.id;
            const rows = aligned[index] ?? [];
            const runs = splitRuns(rows);
            const present = rows.filter((row): row is Band => row !== null);

            return (
              <g key={s.id} opacity={dimmed ? 0.25 : 1}>
                {runs.map((run, runIndex) =>
                  run.length > 1 ? (
                    <path
                      key={`a-${runIndex}`}
                      aria-hidden
                      d={bandPath(run, sx, sy, curved)}
                      fill={`url(#${uid}-${index})`}
                      stroke="none"
                    />
                  ) : null,
                )}
                {runs.map((run, runIndex) =>
                  run.length === 1 ? (
                    <circle
                      key={`p-${runIndex}`}
                      aria-hidden
                      cx={sx(run[0]!.x)}
                      cy={sy(run[0]!.y1)}
                      r={CHART_GEOMETRY.markerSize / 2}
                      fill={colour}
                      stroke={CHART.surface}
                      strokeWidth={CHART_GEOMETRY.gapWidth}
                    />
                  ) : (
                    <path
                      key={`l-${runIndex}`}
                      aria-hidden
                      d={linePath(
                        run.map<NumericPoint>((row) => ({ x: row.x, y: row.y1 })),
                        (p) => sx(p.x),
                        (p) => sy(p.y as number),
                        curved,
                      )}
                      fill="none"
                      stroke={colour}
                      strokeWidth={CHART_GEOMETRY.lineWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={s.dashed ? '5 4' : undefined}
                    />
                  ),
                )}
                {showPoints && !dimmed
                  ? present.map((row) => (
                      <circle
                        key={`m-${row.x}`}
                        aria-hidden
                        cx={sx(row.x)}
                        cy={sy(row.y1)}
                        r={CHART_GEOMETRY.markerSize / 2}
                        fill={colour}
                        stroke={CHART.surface}
                        strokeWidth={CHART_GEOMETRY.gapWidth}
                      />
                    ))
                  : null}
                <g role="list" aria-label={`${s.label} data points`}>
                  {present.map((row) => (
                    <circle
                      key={`h-${row.x}`}
                      role="listitem"
                      tabIndex={0}
                      aria-label={`${s.label}, ${formatX(row.x)}: ${formatY(row.y)}`}
                      cx={sx(row.x)}
                      cy={sy(row.y1)}
                      r={9}
                      fill="transparent"
                      className="cursor-pointer outline-none focus-visible:[outline:2px_solid_var(--color-ring)] focus-visible:[outline-offset:2px]"
                      onPointerEnter={(event) => {
                        setHoverX(sx(row.x));
                        tip.show(event, { seriesId: s.id, x: row.x, y: row.y });
                      }}
                      onPointerMove={tip.move}
                      onFocus={() => setHoverX(sx(row.x))}
                      onBlur={() => setHoverX(null)}
                    />
                  ))}
                </g>
              </g>
            );
          })}
        </svg>
      ) : null}

      <ChartTooltip
        anchor={tip.anchor}
        {...(tip.datum ? { title: formatX(tip.datum.x) } : {})}
        rows={
          tip.datum
            ? [
                {
                  label:
                    series.find((s) => s.id === tip.datum!.seriesId)?.label ?? tip.datum.seriesId,
                  value: formatY(tip.datum.y),
                  colour: (() => {
                    const idx = series.findIndex((s) => s.id === tip.datum!.seriesId);
                    return slotColor(series[idx]?.token, Math.max(0, idx));
                  })(),
                },
              ]
            : []
        }
      />
    </div>
  );
}

/**
 * Turn each series into `[y0, y1]` bands aligned 1:1 with its points. Overlaid
 * areas sit on zero; stacked areas sit on the running total below them at the
 * same x. `null` stays `null` so it can become a gap.
 */
function buildBands(series: readonly LineSeries[], stacked: boolean): (Band | null)[][] {
  const totals = new Map<number, number>();
  return series.map((s) =>
    s.points.map((point) => {
      if (point.y === null || !Number.isFinite(point.y) || !Number.isFinite(point.x)) return null;
      const base = stacked ? (totals.get(point.x) ?? 0) : 0;
      const top = base + point.y;
      if (stacked) totals.set(point.x, top);
      return { x: point.x, y: point.y, y0: base, y1: top };
    }),
  );
}

/** Runs of consecutive non-null bands, so a gap stays a gap. */
function splitRuns(rows: readonly (Band | null)[]): Band[][] {
  const runs: Band[][] = [];
  let current: Band[] = [];
  for (const row of rows) {
    if (row === null) {
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push(row);
    }
  }
  if (current.length) runs.push(current);
  return runs;
}

function bandPath(
  rows: readonly Band[],
  sx: (value: number) => number,
  sy: (value: number) => number,
  curved: boolean,
): string {
  const generator = d3Area<Band>()
    .x((row) => sx(row.x))
    .y0((row) => sy(row.y0))
    .y1((row) => sy(row.y1))
    .curve(curved ? curveMonotoneX : curveLinear);
  return generator([...rows]) ?? '';
}
