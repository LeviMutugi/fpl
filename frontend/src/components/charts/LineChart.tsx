import { useMemo, useState } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { CHART, CHART_GEOMETRY, seriesColor } from '@/lib/tokens';
import { NO_DATA } from '@/lib/format';
import { XAxis, YAxis, type AxisTick } from './ChartAxis';
import { ChartTable } from './ChartTable';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import {
  extentX,
  extentY,
  hasData,
  linePath,
  linear,
  niceTicks,
  segments,
} from './scales';
import { plotArea, withMargin, type LineSeries, type Margin } from './types';

export type LineChartProps = {
  series: readonly LineSeries[];
  height?: number;
  margin?: Partial<Margin>;
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
  className?: string;
  ariaLabel: string;
  /** Optional horizontal reference rule (e.g. a league average). */
  reference?: { y: number; label: string } | null;
  /** Caption for the screen-reader table twin. */
  tableCaption?: string;
};

/**
 * Multi-series line chart. `null` y values become gaps; a single point renders
 * as a marker; an empty dataset renders nothing (let `ChartFrame` show the
 * empty state).
 */
export function LineChart({
  series,
  height = 220,
  margin,
  curved = true,
  formatX = (v) => String(v),
  formatY = (v) => v.toFixed(1),
  xTicks = 6,
  yTicks = 5,
  includeZero = false,
  activeSeriesId = null,
  showPoints = false,
  className,
  ariaLabel,
  reference = null,
  tableCaption,
}: LineChartProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const tip = useChartTooltip<{ seriesId: string; x: number; y: number }>();
  const [hoverX, setHoverX] = useState<number | null>(null);

  const m = withMargin(margin ?? {});
  const area = plotArea(size, m);
  const ready = size.width > 0 && size.height > 0 && hasData(series);

  const { sx, sy, xTickList, yTickList } = useMemo(() => {
    const dx = extentX(series);
    const dy = extentY(series, { includeZero });
    const scaleX = linear(dx, [area.x, area.x + area.width]);
    const scaleY = linear(dy, [area.y + area.height, area.y]);
    return {
      sx: scaleX,
      sy: scaleY,
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
  }, [area.height, area.width, area.x, area.y, formatX, formatY, includeZero, series, xTicks, yTicks]);

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
          <YAxis area={area} ticks={yTickList} />
          <XAxis area={area} ticks={xTickList} />

          {reference ? (
            <g aria-hidden>
              <line
                x1={area.x}
                x2={area.x + area.width}
                y1={sy(reference.y)}
                y2={sy(reference.y)}
                stroke={CHART.axis}
                strokeWidth={1.25}
                strokeDasharray="4 4"
              />
              <text
                x={area.x + area.width}
                y={sy(reference.y) - 5}
                textAnchor="end"
                fill={CHART.label}
                fontSize={10}
              >
                {reference.label}
              </text>
            </g>
          ) : null}

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
            const colour = s.token ? `var(--${s.token})` : seriesColor(index);
            const dimmed = activeSeriesId !== null && activeSeriesId !== s.id;
            const runs = segments(s.points);
            return (
              <g key={s.id} opacity={dimmed ? 0.25 : 1}>
                {runs.map((run, runIndex) =>
                  run.length === 1 ? (
                    <circle
                      key={`p-${runIndex}`}
                      cx={sx(run[0]!.x)}
                      cy={sy(run[0]!.y as number)}
                      r={CHART_GEOMETRY.markerSize / 2}
                      fill={colour}
                      stroke={CHART.surface}
                      strokeWidth={CHART_GEOMETRY.gapWidth}
                    />
                  ) : (
                    <path
                      key={`s-${runIndex}`}
                      d={linePath(run, (p) => sx(p.x), (p) => sy(p.y as number), curved)}
                      fill="none"
                      stroke={colour}
                      strokeWidth={CHART_GEOMETRY.lineWidth}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeDasharray={s.dashed ? '5 4' : undefined}
                    />
                  ),
                )}
                {(showPoints || runs.some((r) => r.length === 1)) && !dimmed
                  ? s.points.map((point) =>
                      point.y === null ? null : (
                        <circle
                          key={`m-${point.x}`}
                          cx={sx(point.x)}
                          cy={sy(point.y)}
                          r={CHART_GEOMETRY.markerSize / 2}
                          fill={colour}
                          stroke={CHART.surface}
                          strokeWidth={CHART_GEOMETRY.gapWidth}
                        />
                      ),
                    )
                  : null}
                {/* Keyboard-focusable hit targets, one per real point. */}
                <g role="list" aria-label={`${s.label} data points`}>
                  {s.points.map((point) =>
                    point.y === null ? null : (
                      <circle
                        key={`h-${point.x}`}
                        role="listitem"
                        tabIndex={0}
                        aria-label={`${s.label}, ${formatX(point.x)}: ${formatY(point.y)}`}
                        cx={sx(point.x)}
                        cy={sy(point.y)}
                        r={9}
                        fill="transparent"
                        className="cursor-pointer outline-none focus-visible:[outline:2px_solid_var(--color-ring)] focus-visible:[outline-offset:2px]"
                        onPointerEnter={(event) => {
                          setHoverX(sx(point.x));
                          tip.show(event, { seriesId: s.id, x: point.x, y: point.y as number });
                        }}
                        onPointerMove={tip.move}
                        onFocus={() => setHoverX(sx(point.x))}
                        onBlur={() => setHoverX(null)}
                      />
                    ),
                  )}
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
                    const s = series[idx];
                    return s?.token ? `var(--${s.token})` : seriesColor(Math.max(0, idx));
                  })(),
                },
              ]
            : []
        }
      />

      <ChartTable
        caption={tableCaption ?? ariaLabel}
        columns={['x', ...series.map((s) => s.label)]}
        rows={(() => {
          const xs = [...new Set(series.flatMap((s) => s.points.map((p) => p.x)))].sort(
            (a, b) => a - b,
          );
          return xs.map((x) => [
            formatX(x),
            ...series.map((s) => {
              const point = s.points.find((p) => p.x === x);
              return point && point.y !== null && Number.isFinite(point.y)
                ? formatY(point.y)
                : NO_DATA;
            }),
          ]);
        })()}
      />
    </div>
  );
}
