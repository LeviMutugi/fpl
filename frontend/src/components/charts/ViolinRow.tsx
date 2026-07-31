import { useMemo } from 'react';
import { area as d3Area, curveMonotoneX } from 'd3-shape';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { CHART, CHART_GEOMETRY } from '@/lib/tokens';
import { NO_DATA, num } from '@/lib/format';
import { XAxis, type AxisTick } from './ChartAxis';
import { ChartTable } from './ChartTable';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { linear, niceTicks } from './scales';
import { fade, slotColor, valueExtent } from './chartUtils';
import { plotArea, withMargin, type Margin, type ViolinDatum } from './types';

export type ViolinRowProps = {
  data: readonly ViolinDatum[];
  rowHeight?: number;
  labelWidth?: number;
  margin?: Partial<Margin>;
  domain?: [number, number] | null;
  formatValue?: (value: number) => string;
  ticks?: number;
  showMean?: boolean;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  tableCaption?: string;
  className?: string;
  ariaLabel: string;
};

/**
 * The same comparison as `BoxRow`, drawn as a shape. Width is interpolated
 * from the five quantiles the API returns — it is a readable stand-in for the
 * density, not a kernel estimate, so the quantile ticks stay on top of it.
 */
export function ViolinRow({
  data,
  rowHeight = 36,
  labelWidth = 108,
  margin,
  domain = null,
  formatValue = (value) => num(value, 1),
  ticks = 5,
  showMean = true,
  activeId = null,
  onSelect,
  tableCaption,
  className,
  ariaLabel,
}: ViolinRowProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const tip = useChartTooltip<ViolinDatum>();

  const m = withMargin(margin ?? { top: 8, right: 20, bottom: 26, left: labelWidth });
  const totalHeight = m.top + m.bottom + Math.max(rowHeight, data.length * rowHeight);
  const area = plotArea({ width: size.width, height: totalHeight }, m);
  const ready = size.width > 0 && data.length > 0;

  const { scale, tickList } = useMemo(() => {
    const span =
      domain ??
      valueExtent(
        data.flatMap((datum) => [datum.p10, datum.p90, datum.mean ?? null]),
        { includeZero: false, pad: 0.06 },
      );
    const valueScale = linear(span, [area.x, area.x + area.width]);
    return {
      scale: valueScale,
      tickList: niceTicks(span, ticks).map<AxisTick>((v) => ({
        value: v,
        label: formatValue(v),
        offset: valueScale(v),
      })),
    };
  }, [area.width, area.x, data, domain, formatValue, ticks]);

  const maxHalf = Math.min(13, rowHeight * 0.38);

  return (
    <div ref={ref} className={cn('relative w-full', className)} style={{ height: totalHeight }}>
      {ready ? (
        <svg
          width={size.width}
          height={totalHeight}
          role="img"
          aria-label={ariaLabel}
          className="overflow-visible"
          onPointerLeave={tip.hide}
        >
          <g aria-hidden>
            {tickList.map((tick) => (
              <line
                key={`grid-${tick.value}`}
                x1={tick.offset}
                x2={tick.offset}
                y1={area.y}
                y2={area.y + area.height}
                stroke={CHART.grid}
                strokeWidth={1}
              />
            ))}
          </g>
          <XAxis area={area} ticks={tickList} line={false} tickSize={0} />

          <g role="list" aria-label={ariaLabel}>
            {data.map((datum, index) => {
              const centre = area.y + rowHeight * (index + 0.5);
              const colour = slotColor(datum.token, index);
              const dimmed = activeId !== null && activeId !== datum.id;
              const description = `${datum.label}: median ${formatValue(
                datum.p50,
              )}, p25–p75 ${formatValue(datum.p25)} to ${formatValue(
                datum.p75,
              )}, p10–p90 ${formatValue(datum.p10)} to ${formatValue(datum.p90)}`;

              return (
                <g key={datum.id} opacity={dimmed ? 0.3 : 1}>
                  <text
                    aria-hidden
                    x={0}
                    y={centre}
                    dy="0.32em"
                    fill={CHART.text}
                    fontSize={11.5}
                    fontWeight={600}
                  >
                    {datum.label}
                  </text>

                  <path
                    aria-hidden
                    d={violinPath(datum, scale, centre, maxHalf)}
                    fill={fade(colour, 0.35)}
                    stroke={colour}
                    strokeWidth={1.5}
                    strokeLinejoin="round"
                  />
                  <line
                    aria-hidden
                    x1={scale(datum.p25)}
                    x2={scale(datum.p75)}
                    y1={centre}
                    y2={centre}
                    stroke={colour}
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                  <line
                    aria-hidden
                    x1={scale(datum.p50)}
                    x2={scale(datum.p50)}
                    y1={centre - maxHalf}
                    y2={centre + maxHalf}
                    stroke={CHART.surface}
                    strokeWidth={CHART_GEOMETRY.gapWidth}
                    strokeLinecap="round"
                  />
                  {showMean && datum.mean !== null && datum.mean !== undefined ? (
                    <circle
                      aria-hidden
                      cx={scale(datum.mean)}
                      cy={centre}
                      r={CHART_GEOMETRY.markerSize / 2}
                      fill={CHART.text}
                      stroke={CHART.surface}
                      strokeWidth={CHART_GEOMETRY.gapWidth}
                    />
                  ) : null}

                  <rect
                    role="listitem"
                    tabIndex={0}
                    aria-label={description}
                    x={area.x}
                    y={centre - rowHeight / 2}
                    width={area.width}
                    height={rowHeight}
                    fill="transparent"
                    className={cn(
                      'outline-none focus-visible:[outline:2px_solid_var(--color-ring)] focus-visible:[outline-offset:-2px]',
                      onSelect && 'cursor-pointer',
                    )}
                    onPointerEnter={(event) => tip.show(event, datum)}
                    onPointerMove={tip.move}
                    onClick={onSelect ? () => onSelect(datum.id) : undefined}
                    onKeyDown={
                      onSelect
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onSelect(datum.id);
                            }
                          }
                        : undefined
                    }
                  />
                </g>
              );
            })}
          </g>
        </svg>
      ) : null}

      <ChartTooltip
        anchor={tip.anchor}
        {...(tip.datum ? { title: tip.datum.label } : {})}
        rows={
          tip.datum
            ? [
                { label: 'p90', value: formatValue(tip.datum.p90) },
                { label: 'p75', value: formatValue(tip.datum.p75) },
                { label: 'Median', value: formatValue(tip.datum.p50) },
                { label: 'p25', value: formatValue(tip.datum.p25) },
                { label: 'p10', value: formatValue(tip.datum.p10) },
                {
                  label: 'Mean',
                  value:
                    tip.datum.mean === null || tip.datum.mean === undefined
                      ? NO_DATA
                      : formatValue(tip.datum.mean),
                  muted: true,
                },
              ]
            : []
        }
      />

      <ChartTable
        caption={tableCaption ?? ariaLabel}
        columns={['Item', 'p10', 'p25', 'Median', 'p75', 'p90', 'Mean']}
        rows={data.map((datum) => [
          datum.label,
          formatValue(datum.p10),
          formatValue(datum.p25),
          formatValue(datum.p50),
          formatValue(datum.p75),
          formatValue(datum.p90),
          datum.mean === null || datum.mean === undefined ? NO_DATA : formatValue(datum.mean),
        ])}
      />
    </div>
  );
}

type Rib = { x: number; half: number };

/** Half-widths interpolated across the five quantiles, mirrored about the row. */
function violinPath(
  datum: ViolinDatum,
  scale: (value: number) => number,
  centre: number,
  maxHalf: number,
): string {
  const ribs: Rib[] = [
    { x: scale(datum.p10), half: maxHalf * 0.08 },
    { x: scale(datum.p25), half: maxHalf * 0.6 },
    { x: scale(datum.p50), half: maxHalf },
    { x: scale(datum.p75), half: maxHalf * 0.6 },
    { x: scale(datum.p90), half: maxHalf * 0.08 },
  ];
  const generator = d3Area<Rib>()
    .x((rib) => rib.x)
    .y0((rib) => centre + rib.half)
    .y1((rib) => centre - rib.half)
    .curve(curveMonotoneX);
  return generator(ribs) ?? '';
}
