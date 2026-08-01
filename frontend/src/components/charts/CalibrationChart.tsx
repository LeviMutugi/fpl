import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { CHART, CHART_GEOMETRY } from '@/lib/tokens';
import { int } from '@/lib/format';
import { XAxis, YAxis, type AxisTick } from './ChartAxis';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { linePath, linear, niceTicks } from './scales';
import { slotColor, valueExtent } from './chartUtils';
import { plotArea, withMargin, type Margin, type NumericPoint } from './types';

/** One reliability bin as returned by `/api/models/leaderboard`. */
export type CalibrationBin = {
  pred_mean: number;
  actual_mean: number | null;
  /** Rows in the bin — drives the marker area. */
  n: number;
};

export type CalibrationSeries = {
  id: string;
  label: string;
  bins: readonly CalibrationBin[];
  token?: string;
};

export type CalibrationChartProps = {
  series: readonly CalibrationSeries[];
  height?: number;
  margin?: Partial<Margin>;
  formatValue?: (value: number) => string;
  ticks?: number;
  xLabel?: string;
  yLabel?: string;
  /** Join a model's bins in prediction order. */
  connect?: boolean;
  radiusRange?: [number, number];
  activeSeriesId?: string | null;
  /** Label for the y = x rule. */
  referenceLabel?: string;
  className?: string;
  ariaLabel: string;
};

/**
 * Predicted against actual, on one shared square scale, with the y = x rule a
 * model is trying to sit on. Marker area carries the bin count, so a bin built
 * from twelve rows never argues as loudly as one built from twelve hundred.
 * Bins with no observed mean are skipped; an empty dataset renders nothing.
 */
export function CalibrationChart({
  series,
  height = 300,
  margin,
  formatValue = (value) => value.toFixed(1),
  ticks = 5,
  xLabel = 'Predicted',
  yLabel = 'Actual',
  connect = true,
  radiusRange = [4, 12],
  activeSeriesId = null,
  referenceLabel = 'Perfect calibration',
  className,
  ariaLabel,
}: CalibrationChartProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const tip = useChartTooltip<{ seriesId: string; bin: CalibrationBin }>();

  const m = withMargin(margin ?? { top: 16, right: 20, bottom: 42, left: 48 });
  const area = plotArea(size, m);

  const usable = useMemo(
    () =>
      series.map((s) => ({
        ...s,
        bins: s.bins
          .filter(
            (bin) =>
              Number.isFinite(bin.pred_mean) &&
              bin.actual_mean !== null &&
              Number.isFinite(bin.actual_mean),
          )
          .slice()
          .sort((a, b) => a.pred_mean - b.pred_mean),
      })),
    [series],
  );
  const hasAny = usable.some((s) => s.bins.length > 0);
  const ready = size.width > 0 && size.height > 0 && hasAny;

  const { sx, sy, tickList, radius, domain } = useMemo(() => {
    const all = usable.flatMap((s) =>
      s.bins.flatMap((bin) => [bin.pred_mean, bin.actual_mean as number]),
    );
    const shared = valueExtent(all, { includeZero: true, pad: 0.08 });
    const counts = usable.flatMap((s) => s.bins.map((bin) => bin.n));
    const lo = counts.length ? Math.min(...counts) : 0;
    const hi = counts.length ? Math.max(...counts) : 0;
    const scaleX = linear(shared, [area.x, area.x + area.width]);
    const scaleY = linear(shared, [area.y + area.height, area.y]);
    return {
      sx: scaleX,
      sy: scaleY,
      domain: shared,
      radius: (n: number) => {
        if (!Number.isFinite(n) || hi === lo) return radiusRange[0];
        const t = Math.sqrt(Math.max(0, n - lo) / (hi - lo));
        return radiusRange[0] + t * (radiusRange[1] - radiusRange[0]);
      },
      tickList: niceTicks(shared, ticks).map<AxisTick>((v) => ({
        value: v,
        label: formatValue(v),
        offset: 0,
      })),
    };
  }, [area.height, area.width, area.x, area.y, formatValue, radiusRange, ticks, usable]);

  const xTickList = tickList.map<AxisTick>((tick) => ({ ...tick, offset: sx(tick.value) }));
  const yTickList = tickList.map<AxisTick>((tick) => ({ ...tick, offset: sy(tick.value) }));

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
          <YAxis area={area} ticks={yTickList} />
          <XAxis area={area} ticks={xTickList} />

          <g aria-hidden>
            <line
              x1={sx(domain[0])}
              y1={sy(domain[0])}
              x2={sx(domain[1])}
              y2={sy(domain[1])}
              stroke={CHART.axis}
              strokeWidth={1.25}
              strokeDasharray="4 4"
            />
            <text
              x={sx(domain[1]) - 4}
              y={sy(domain[1]) + 14}
              textAnchor="end"
              fill={CHART.label}
              fontSize={10}
            >
              {referenceLabel}
            </text>
          </g>

          <text
            aria-hidden
            x={area.x + area.width}
            y={area.y + area.height + 34}
            textAnchor="end"
            fill={CHART.label}
            fontSize={10.5}
          >
            {xLabel}
          </text>
          <text
            aria-hidden
            x={area.x - m.left + 10}
            y={area.y}
            fill={CHART.label}
            fontSize={10.5}
          >
            {yLabel}
          </text>

          {usable.map((s, index) => {
            const colour = slotColor(s.token, index);
            const dimmed = activeSeriesId !== null && activeSeriesId !== s.id;
            return (
              <g key={s.id} opacity={dimmed ? 0.25 : 1}>
                {connect && s.bins.length > 1 ? (
                  <path
                    aria-hidden
                    d={linePath(
                      s.bins.map<NumericPoint>((bin) => ({
                        x: bin.pred_mean,
                        y: bin.actual_mean,
                      })),
                      (p) => sx(p.x),
                      (p) => sy(p.y as number),
                      false,
                    )}
                    fill="none"
                    stroke={colour}
                    strokeWidth={CHART_GEOMETRY.lineWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={0.55}
                  />
                ) : null}
                <g role="list" aria-label={`${s.label} calibration bins`}>
                  {s.bins.map((bin) => (
                    <g key={`${bin.pred_mean}-${bin.n}`}>
                      <circle
                        aria-hidden
                        cx={sx(bin.pred_mean)}
                        cy={sy(bin.actual_mean as number)}
                        r={radius(bin.n)}
                        fill={colour}
                        stroke={CHART.surface}
                        strokeWidth={CHART_GEOMETRY.gapWidth}
                      />
                      <circle
                        role="listitem"
                        tabIndex={0}
                        aria-label={`${s.label}: predicted ${formatValue(
                          bin.pred_mean,
                        )}, actual ${formatValue(bin.actual_mean as number)}, ${int(
                          bin.n,
                        )} rows`}
                        cx={sx(bin.pred_mean)}
                        cy={sy(bin.actual_mean as number)}
                        r={Math.max(12, radius(bin.n) + 6)}
                        fill="transparent"
                        className="cursor-pointer outline-none focus-visible:[outline:2px_solid_var(--color-ring)] focus-visible:[outline-offset:2px]"
                        onPointerEnter={(event) => tip.show(event, { seriesId: s.id, bin })}
                        onPointerMove={tip.move}
                      />
                    </g>
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
          ? { title: usable.find((s) => s.id === tip.datum!.seriesId)?.label ?? tip.datum.seriesId }
          : {})}
        rows={
          tip.datum
            ? [
                {
                  label: xLabel,
                  value: formatValue(tip.datum.bin.pred_mean),
                  colour: slotColor(
                    usable.find((s) => s.id === tip.datum!.seriesId)?.token,
                    Math.max(0, usable.findIndex((s) => s.id === tip.datum!.seriesId)),
                  ),
                },
                { label: yLabel, value: formatValue(tip.datum.bin.actual_mean as number) },
                { label: 'Rows', value: int(tip.datum.bin.n), muted: true },
              ]
            : []
        }
      />
    </div>
  );
}
