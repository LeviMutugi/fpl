import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { CHART, CHART_GEOMETRY, ALL_PAIRS_SERIES_CAP } from '@/lib/tokens';
import { NO_DATA } from '@/lib/format';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { polar } from './scales';
import { clampUnit, fade, slotColor } from './chartUtils';

export type RadarAxis = {
  id: string;
  /** Short label — it sits outside the outer ring, so keep it to a word or two. */
  label: string;
};

export type RadarSeries = {
  id: string;
  label: string;
  /** Normalised 0..1 per axis id. `null` is a missing axis, not a zero. */
  values: Readonly<Record<string, number | null>>;
  token?: string;
};

export type RadarChartProps = {
  axes: readonly RadarAxis[];
  /** Capped at three overlaid series by the all-pairs colour rule. */
  series: readonly RadarSeries[];
  height?: number;
  /** Concentric reference rings. */
  levels?: number;
  /** Room reserved outside the outer ring for the axis labels. */
  labelInset?: number;
  fillOpacity?: number;
  /** Dim every series except this one. */
  activeSeriesId?: string | null;
  /** Renders the raw reading in the tooltip; the plot itself is normalised. */
  formatValue?: (value: number) => string;
  className?: string;
  ariaLabel: string;
};

/**
 * A player profile across 5–8 normalised axes. Values are expected in 0..1 and
 * are clamped; `null` leaves that axis empty rather than pulling the polygon to
 * the centre. No axes means nothing renders.
 */
export function RadarChart({
  axes,
  series,
  height = 260,
  levels = 4,
  labelInset = 46,
  fillOpacity = 0.14,
  activeSeriesId = null,
  formatValue = (value) => `${Math.round(value * 100)}`,
  className,
  ariaLabel,
}: RadarChartProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const tip = useChartTooltip<{ seriesId: string; axisId: string; value: number }>();

  const shown = useMemo(() => series.slice(0, ALL_PAIRS_SERIES_CAP), [series]);
  const hasAny = shown.some((s) =>
    axes.some((axis) => {
      const value = s.values[axis.id];
      return value !== null && value !== undefined && Number.isFinite(value);
    }),
  );
  const ready = size.width > 0 && size.height > 0 && axes.length >= 3 && hasAny;

  const cx = size.width / 2;
  const cy = size.height / 2;
  const radius = Math.max(0, Math.min(size.width, size.height) / 2 - labelInset / 2);
  const angleFor = (index: number) => (index / Math.max(1, axes.length)) * Math.PI * 2;

  return (
    <div ref={ref} className={cn('relative h-full w-full', className)} style={{ height }}>
      {ready ? (
        <svg
          width={size.width}
          height={size.height}
          role="img"
          aria-label={ariaLabel}
          className="overflow-visible"
          onPointerLeave={tip.hide}
        >
          <g aria-hidden>
            {Array.from({ length: levels }, (_, level) => {
              const r = (radius * (level + 1)) / levels;
              const points = axes
                .map((_, index) => polar(cx, cy, r, angleFor(index)).join(','))
                .join(' ');
              return (
                <polygon
                  key={`ring-${level}`}
                  points={points}
                  fill="none"
                  stroke={CHART.grid}
                  strokeWidth={1}
                />
              );
            })}
            {axes.map((axis, index) => {
              const [x, y] = polar(cx, cy, radius, angleFor(index));
              return (
                <line
                  key={`spoke-${axis.id}`}
                  x1={cx}
                  y1={cy}
                  x2={x}
                  y2={y}
                  stroke={CHART.grid}
                  strokeWidth={1}
                />
              );
            })}
            {axes.map((axis, index) => {
              const angle = angleFor(index);
              const [x, y] = polar(cx, cy, radius + 14, angle);
              const sin = Math.sin(angle);
              const anchor = sin > 0.3 ? 'start' : sin < -0.3 ? 'end' : 'middle';
              return (
                <text
                  key={`label-${axis.id}`}
                  x={x}
                  y={y}
                  dy="0.32em"
                  textAnchor={anchor}
                  fill={CHART.label}
                  fontSize={10.5}
                >
                  {axis.label}
                </text>
              );
            })}
          </g>

          {shown.map((s, seriesIndex) => {
            const colour = slotColor(s.token, seriesIndex);
            const dimmed = activeSeriesId !== null && activeSeriesId !== s.id;
            const vertices = axes.flatMap((axis, index) => {
              const raw = s.values[axis.id];
              if (raw === null || raw === undefined || !Number.isFinite(raw)) return [];
              const value = clampUnit(raw);
              const [x, y] = polar(cx, cy, radius * value, angleFor(index));
              return [{ axis, value, x, y }];
            });
            if (vertices.length === 0) return null;

            return (
              <g key={s.id} opacity={dimmed ? 0.25 : 1}>
                {vertices.length >= 3 ? (
                  <polygon
                    aria-hidden
                    points={vertices.map((v) => `${v.x},${v.y}`).join(' ')}
                    fill={fade(colour, fillOpacity)}
                    stroke={colour}
                    strokeWidth={CHART_GEOMETRY.lineWidth}
                    strokeLinejoin="round"
                    strokeDasharray={vertices.length < axes.length ? '5 4' : undefined}
                  />
                ) : null}
                <g role="list" aria-label={`${s.label} axes`}>
                  {vertices.map((vertex) => (
                    <circle
                      key={vertex.axis.id}
                      role="listitem"
                      tabIndex={0}
                      aria-label={`${s.label}, ${vertex.axis.label}: ${formatValue(vertex.value)}`}
                      cx={vertex.x}
                      cy={vertex.y}
                      r={CHART_GEOMETRY.markerSize / 2}
                      fill={colour}
                      stroke={CHART.surface}
                      strokeWidth={CHART_GEOMETRY.gapWidth}
                      className="cursor-pointer outline-none focus-visible:[outline:2px_solid_var(--color-ring)] focus-visible:[outline-offset:2px]"
                      onPointerEnter={(event) =>
                        tip.show(event, {
                          seriesId: s.id,
                          axisId: vertex.axis.id,
                          value: vertex.value,
                        })
                      }
                      onPointerMove={tip.move}
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
        {...(tip.datum
          ? { title: axes.find((axis) => axis.id === tip.datum!.axisId)?.label ?? tip.datum.axisId }
          : {})}
        rows={
          tip.datum
            ? shown.map((s, index) => {
                const raw = s.values[tip.datum!.axisId];
                return {
                  label: s.label,
                  value:
                    raw === null || raw === undefined || !Number.isFinite(raw)
                      ? NO_DATA
                      : formatValue(clampUnit(raw)),
                  colour: slotColor(s.token, index),
                  muted: s.id !== tip.datum!.seriesId,
                };
              })
            : []
        }
      />
    </div>
  );
}
