import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { CHART, CHART_GEOMETRY, seriesColor, token } from '@/lib/tokens';
import { NO_DATA } from '@/lib/format';
import { CategoryAxis, XAxis, YAxis, type AxisTick } from './ChartAxis';
import { ChartTable } from './ChartTable';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { linear, niceTicks } from './scales';
import { bandLayout, cappedBar, estimateTextWidth, slotColor, valueExtent } from './chartUtils';
import { plotArea, withMargin, type CategoryDatum, type Margin } from './types';

export type BarChartProps = {
  data: readonly CategoryDatum[];
  /** Columns (default) or bars. */
  orientation?: 'vertical' | 'horizontal';
  height?: number;
  margin?: Partial<Margin>;
  /** Fill for every bar; a datum's own `token` still wins. */
  token?: string;
  /** Print the value at the data end of each bar. */
  showValues?: boolean;
  formatValue?: (value: number) => string;
  valueTicks?: number;
  maxBarThickness?: number;
  /** Label every nth category when the axis gets crowded. */
  labelEvery?: number;
  rotateLabels?: number;
  /** Dim every bar except this one. */
  activeKey?: string | null;
  onSelect?: (key: string) => void;
  /** Caption for the screen-reader table twin. */
  tableCaption?: string;
  className?: string;
  ariaLabel: string;
};

/**
 * A single-measure bar chart in either orientation. One series means one
 * colour — per-datum `token` exists for genuine encodings (position, status),
 * not for a value ramp. `null` values are drawn as an explicit no-data slot,
 * never as a zero-height bar. An empty dataset renders nothing.
 */
export function BarChart({
  data,
  orientation = 'vertical',
  height = 220,
  margin,
  token: fillToken,
  showValues = false,
  formatValue = (v) => v.toFixed(1),
  valueTicks = 5,
  maxBarThickness = 24,
  labelEvery = 1,
  rotateLabels = 0,
  activeKey = null,
  onSelect,
  tableCaption,
  className,
  ariaLabel,
}: BarChartProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const reduced = useReducedMotion();
  const tip = useChartTooltip<{ key: string; label: string; value: number }>();

  const vertical = orientation === 'vertical';
  const m = withMargin(
    margin ?? (vertical ? {} : { left: 96, bottom: 24, right: 30 }),
  );
  const area = plotArea(size, m);
  const hasAny = data.some((d) => d.value !== null && Number.isFinite(d.value));
  const ready = size.width > 0 && size.height > 0 && hasAny;

  const { scale, ticks, band } = useMemo(() => {
    const domain = valueExtent(
      data.map((d) => d.value),
      { includeZero: true },
    );
    const valueScale = vertical
      ? linear(domain, [area.y + area.height, area.y])
      : linear(domain, [area.x, area.x + area.width]);
    return {
      scale: valueScale,
      ticks: niceTicks(domain, valueTicks).map<AxisTick>((v) => ({
        value: v,
        label: formatValue(v),
        offset: valueScale(v),
      })),
      band: bandLayout(
        data.length,
        vertical ? area.x : area.y,
        vertical ? area.width : area.height,
        { maxThickness: maxBarThickness },
      ),
    };
  }, [
    area.height,
    area.width,
    area.x,
    area.y,
    data,
    formatValue,
    maxBarThickness,
    valueTicks,
    vertical,
  ]);

  const zero = scale(0);
  const bands = data.map((datum, index) => ({
    key: datum.key,
    label: datum.label ?? datum.key,
    centre: band.centre(index),
  }));

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
          {vertical ? (
            <>
              <YAxis area={area} ticks={ticks} zeroAt={zero} />
              <CategoryAxis
                area={area}
                bands={bands}
                orientation="bottom"
                every={labelEvery}
                rotate={rotateLabels}
              />
            </>
          ) : (
            <>
              <g aria-hidden>
                {ticks.map((tick) => (
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
              <XAxis area={area} ticks={ticks} line={false} tickSize={0} />
              <CategoryAxis area={area} bands={bands} orientation="left" every={labelEvery} />
              <line
                aria-hidden
                x1={zero}
                x2={zero}
                y1={area.y}
                y2={area.y + area.height}
                stroke={CHART.axis}
                strokeWidth={1.25}
              />
            </>
          )}

          <g role="list" aria-label={ariaLabel}>
            {data.map((datum, index) => {
              const label = datum.label ?? datum.key;
              const dimmed = activeKey !== null && activeKey !== datum.key;
              const centre = band.centre(index);

              if (datum.value === null || !Number.isFinite(datum.value)) {
                return (
                  <text
                    key={datum.key}
                    role="listitem"
                    aria-label={`${label}: no data`}
                    x={vertical ? centre : zero + 8}
                    y={vertical ? zero - 8 : centre}
                    dy={vertical ? 0 : '0.32em'}
                    textAnchor={vertical ? 'middle' : 'start'}
                    fill={CHART.label}
                    fontSize={11}
                  >
                    {NO_DATA}
                  </text>
                );
              }

              const value = datum.value;
              const positive = value >= 0;
              const end = scale(value);
              const colour = slotColor(datum.token ?? fillToken, 0);
              const rect = vertical
                ? {
                    x: centre - band.thickness / 2,
                    y: Math.min(zero, end),
                    width: band.thickness,
                    height: Math.abs(end - zero),
                  }
                : {
                    x: Math.min(zero, end),
                    y: centre - band.thickness / 2,
                    width: Math.abs(end - zero),
                    height: band.thickness,
                  };
              const cap = vertical
                ? positive
                  ? ('top' as const)
                  : ('bottom' as const)
                : positive
                  ? ('right' as const)
                  : ('left' as const);

              const text = formatValue(value);
              const textWidth = estimateTextWidth(text, 11);
              const labelPos = vertical
                ? { x: centre, y: positive ? end - 6 : end + 14, anchor: 'middle' as const }
                : {
                    x: positive ? end + 6 : end - 6,
                    y: centre,
                    anchor: positive ? ('start' as const) : ('end' as const),
                  };
              const labelFits = vertical
                ? band.thickness >= textWidth * 0.7
                : positive
                  ? labelPos.x + textWidth <= area.x + area.width + m.right
                  : labelPos.x - textWidth >= 0;

              return (
                <g key={datum.key} opacity={dimmed ? 0.3 : 1}>
                  <path
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${label}: ${text}`}
                    d={cappedBar(
                      rect.x,
                      rect.y,
                      rect.width,
                      rect.height,
                      CHART_GEOMETRY.barRadius,
                      cap,
                    )}
                    fill={colour}
                    className={cn(
                      'outline-none focus-visible:[outline:2px_solid_var(--color-ring)] focus-visible:[outline-offset:2px]',
                      onSelect && 'cursor-pointer',
                      !reduced && 'transition-[opacity] duration-200',
                    )}
                    onPointerEnter={(event) => tip.show(event, { key: datum.key, label, value })}
                    onPointerMove={tip.move}
                    onClick={onSelect ? () => onSelect(datum.key) : undefined}
                    onKeyDown={
                      onSelect
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onSelect(datum.key);
                            }
                          }
                        : undefined
                    }
                  />
                  {showValues && labelFits ? (
                    <text
                      aria-hidden
                      x={labelPos.x}
                      y={labelPos.y}
                      dy={vertical ? 0 : '0.32em'}
                      textAnchor={labelPos.anchor}
                      fill={CHART.muted}
                      fontSize={11}
                      fontWeight={600}
                      style={{ fontVariantNumeric: 'tabular-nums' }}
                    >
                      {text}
                    </text>
                  ) : null}
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
                {
                  label: ariaLabel,
                  value: formatValue(tip.datum.value),
                  colour: fillToken ? token(fillToken) : seriesColor(0),
                },
              ]
            : []
        }
      />

      <ChartTable
        caption={tableCaption ?? ariaLabel}
        columns={['Category', 'Value']}
        rows={data.map((datum) => [
          datum.label ?? datum.key,
          datum.value === null || !Number.isFinite(datum.value)
            ? NO_DATA
            : formatValue(datum.value),
        ])}
      />
    </div>
  );
}
