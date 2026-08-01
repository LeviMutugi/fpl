import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { CHART, CHART_GEOMETRY, seriesColor, token } from '@/lib/tokens';
import { NO_DATA, num } from '@/lib/format';
import { XAxis, type AxisTick } from './ChartAxis';
import { ChartTooltip, useChartTooltip, type ChartTooltipRow } from './ChartTooltip';
import { linear, niceTicks } from './scales';
import { cappedBar, fade, valueExtent } from './chartUtils';

export type BulletBand = {
  /** Upper bound of the band; bands are read in order from the domain floor. */
  to: number;
  label: string;
  /** Token for the band wash. Defaults to a step of the sequential ramp. */
  token?: string;
};

export type BulletChartProps = {
  /** The measure. `null` renders the bands plus an explicit no-data readout. */
  value: number | null;
  /** The marker to beat, e.g. FPL's own `ep_next`. */
  comparison?: number | null;
  comparisonLabel?: string;
  label?: string;
  /** Qualitative ranges behind the bar, in increasing order. */
  bands?: readonly BulletBand[];
  domain?: [number, number] | null;
  height?: number;
  /** Track height; the measure bar is a third of it. */
  trackHeight?: number;
  labelWidth?: number;
  valueWidth?: number;
  token?: string;
  showAxis?: boolean;
  ticks?: number;
  formatValue?: (value: number) => string;
  className?: string;
  ariaLabel: string;
};

const BAND_TOKENS = ['color-seq-100', 'color-seq-200', 'color-seq-300'] as const;

/**
 * One measure against one marker, on a track of qualitative ranges — the
 * compact form for "our xP against FPL's ep_next". The bands are an ordered
 * scale, so they use steps of the single sequential hue rather than categorical
 * colours, and each one is named in the tooltip.
 */
export function BulletChart({
  value,
  comparison = null,
  comparisonLabel = 'Comparison',
  label,
  bands,
  domain = null,
  height,
  trackHeight = 22,
  labelWidth = 0,
  valueWidth = 56,
  token: fillToken,
  showAxis = true,
  ticks = 5,
  formatValue = (v) => num(v, 1),
  className,
  ariaLabel,
}: BulletChartProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const tip = useChartTooltip<readonly ChartTooltipRow[]>();

  const axisHeight = showAxis ? 22 : 0;
  const totalHeight = height ?? trackHeight + axisHeight + 8;
  const trackTop = 4;
  const plotX = labelWidth;
  const plotWidth = Math.max(0, size.width - labelWidth - valueWidth);
  const ready = size.width > 0 && plotWidth > 0;

  const { scale, tickList, bandStops } = useMemo(() => {
    const span =
      domain ??
      valueExtent([value, comparison, ...(bands?.map((band) => band.to) ?? [])], {
        includeZero: true,
        pad: 0.04,
      });
    const valueScale = linear(span, [plotX, plotX + plotWidth]);
    let floor = span[0];
    const stops = (bands ?? []).map((band, index) => {
      const from = floor;
      floor = band.to;
      return {
        ...band,
        from,
        colour: token(band.token ?? BAND_TOKENS[Math.min(index, BAND_TOKENS.length - 1)]!),
      };
    });
    return {
      scale: valueScale,
      bandStops: stops,
      tickList: niceTicks(span, ticks).map<AxisTick>((v) => ({
        value: v,
        label: formatValue(v),
        offset: valueScale(v),
      })),
    };
  }, [bands, comparison, domain, formatValue, plotWidth, plotX, ticks, value]);

  const hasValue = value !== null && Number.isFinite(value);
  const barHeight = Math.max(6, trackHeight / 3);
  const barTop = trackTop + (trackHeight - barHeight) / 2;
  const zero = scale(0);
  const rows: ChartTooltipRow[] = [
    {
      label: label ?? ariaLabel,
      value: hasValue ? formatValue(value) : NO_DATA,
      colour: fillToken ? token(fillToken) : seriesColor(0),
    },
    ...(comparison !== null && Number.isFinite(comparison)
      ? [{ label: comparisonLabel, value: formatValue(comparison) }]
      : []),
  ];

  return (
    <div ref={ref} className={cn('relative w-full', className)} style={{ height: totalHeight }}>
      {ready ? (
        <svg
          width={size.width}
          height={totalHeight}
          role="img"
          aria-label={`${ariaLabel}: ${hasValue ? formatValue(value) : 'no data'}${
            comparison !== null && Number.isFinite(comparison)
              ? `, ${comparisonLabel} ${formatValue(comparison)}`
              : ''
          }`}
          className="overflow-visible"
          onPointerLeave={tip.hide}
          onPointerEnter={(event) => tip.show(event, rows)}
          onPointerMove={tip.move}
        >
          {bandStops.length > 0 ? (
            bandStops.map((band) => (
              <rect
                key={band.label}
                aria-hidden
                x={scale(band.from)}
                y={trackTop}
                width={Math.max(0, scale(band.to) - scale(band.from) - CHART_GEOMETRY.gapWidth)}
                height={trackHeight}
                rx={6}
                fill={band.colour}
              />
            ))
          ) : (
            <rect
              aria-hidden
              x={plotX}
              y={trackTop}
              width={plotWidth}
              height={trackHeight}
              rx={6}
              fill={fade(token('color-seq-100'), 0.6)}
            />
          )}

          {hasValue ? (
            <path
              aria-hidden
              d={cappedBar(
                Math.min(zero, scale(value)),
                barTop,
                Math.abs(scale(value) - zero),
                barHeight,
                CHART_GEOMETRY.barRadius,
                value >= 0 ? 'right' : 'left',
              )}
              fill={fillToken ? token(fillToken) : seriesColor(0)}
            />
          ) : null}

          {comparison !== null && Number.isFinite(comparison) ? (
            <line
              aria-hidden
              x1={scale(comparison)}
              x2={scale(comparison)}
              y1={trackTop - 2}
              y2={trackTop + trackHeight + 2}
              stroke={CHART.text}
              strokeWidth={2.5}
              strokeLinecap="round"
            />
          ) : null}

          <text
            aria-hidden
            x={size.width}
            y={trackTop + trackHeight / 2}
            dy="0.32em"
            textAnchor="end"
            fill={CHART.text}
            fontSize={12.5}
            fontWeight={600}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {hasValue ? formatValue(value) : NO_DATA}
          </text>

          {label && labelWidth > 0 ? (
            <text
              aria-hidden
              x={0}
              y={trackTop + trackHeight / 2}
              dy="0.32em"
              fill={CHART.muted}
              fontSize={11.5}
            >
              {label}
            </text>
          ) : null}

          {showAxis ? (
            <XAxis
              area={{ x: plotX, y: trackTop, width: plotWidth, height: trackHeight + 2 }}
              ticks={tickList}
              line={false}
              tickSize={0}
            />
          ) : null}
        </svg>
      ) : null}

      <ChartTooltip
        anchor={tip.anchor}
        {...(label ? { title: label } : {})}
        rows={tip.datum ?? []}
      />
    </div>
  );
}
