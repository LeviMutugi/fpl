import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { CHART, CHART_GEOMETRY } from '@/lib/tokens';
import { NO_DATA, num } from '@/lib/format';
import { XAxis, type AxisTick } from './ChartAxis';
import { ChartTable } from './ChartTable';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { linear, niceTicks } from './scales';
import { fade, pillBar, slotColor, valueExtent } from './chartUtils';
import { plotArea, withMargin, type Margin, type ViolinDatum } from './types';

export type BoxRowProps = {
  data: readonly ViolinDatum[];
  /** Vertical pitch of one item's row. */
  rowHeight?: number;
  labelWidth?: number;
  margin?: Partial<Margin>;
  /** Pin the shared value scale; otherwise it spans every quantile shown. */
  domain?: [number, number] | null;
  formatValue?: (value: number) => string;
  ticks?: number;
  /** Draw the point estimate as a diamond on the row. */
  showMean?: boolean;
  activeId?: string | null;
  onSelect?: (id: string) => void;
  tableCaption?: string;
  className?: string;
  ariaLabel: string;
};

const BOX_MAX_HEIGHT = 16;

/**
 * One horizontal uncertainty row per item: p10–p90 whisker, p25–p75 box,
 * median tick, optional mean diamond. Every row shares a single value scale, so
 * two players' spreads are directly comparable. An empty dataset renders
 * nothing; let `ChartFrame` show the empty state.
 */
export function BoxRow({
  data,
  rowHeight = 30,
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
}: BoxRowProps) {
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

  const boxHeight = Math.min(BOX_MAX_HEIGHT, rowHeight * 0.52);

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

                  <line
                    aria-hidden
                    x1={scale(datum.p10)}
                    x2={scale(datum.p90)}
                    y1={centre}
                    y2={centre}
                    stroke={fade(colour, 0.5)}
                    strokeWidth={3}
                    strokeLinecap="round"
                  />
                  <path
                    aria-hidden
                    d={pillBar(
                      scale(datum.p25),
                      centre - boxHeight / 2,
                      Math.max(2, scale(datum.p75) - scale(datum.p25)),
                      boxHeight,
                      CHART_GEOMETRY.barRadius,
                    )}
                    fill={colour}
                  />
                  <line
                    aria-hidden
                    x1={scale(datum.p50)}
                    x2={scale(datum.p50)}
                    y1={centre - boxHeight / 2}
                    y2={centre + boxHeight / 2}
                    stroke={CHART.surface}
                    strokeWidth={CHART_GEOMETRY.gapWidth}
                    strokeLinecap="round"
                  />
                  {showMean && datum.mean !== null && datum.mean !== undefined ? (
                    <path
                      aria-hidden
                      d={`M${scale(datum.mean)},${centre - 5} l5,5 -5,5 -5,-5 Z`}
                      fill={CHART.text}
                      stroke={CHART.surface}
                      strokeWidth={1}
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
