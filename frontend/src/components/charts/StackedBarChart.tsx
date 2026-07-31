import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { CHART, CHART_GEOMETRY } from '@/lib/tokens';
import { NO_DATA } from '@/lib/format';
import { CategoryAxis, XAxis, YAxis, type AxisTick } from './ChartAxis';
import { ChartTable } from './ChartTable';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { linear, niceTicks } from './scales';
import { bandLayout, cappedBar, categoryGutter, slotColor, valueExtent } from './chartUtils';
import { plotArea, withMargin, type Margin, type StackKey, type StackedDatum } from './types';

export type StackedBarChartProps = {
  data: readonly StackedDatum[];
  /** Stack order, bottom/left first. Also the legend order. */
  keys: readonly StackKey[];
  orientation?: 'vertical' | 'horizontal';
  height?: number;
  margin?: Partial<Margin>;
  formatValue?: (value: number) => string;
  valueTicks?: number;
  maxBarThickness?: number;
  labelEvery?: number;
  rotateLabels?: number;
  /** Dim every segment except this stack key. */
  activeKeyId?: string | null;
  /** Print the net total at the outer end of each stack. */
  showTotals?: boolean;
  tableCaption?: string;
  className?: string;
  ariaLabel: string;
};

type Segment = {
  keyId: string;
  keyLabel: string;
  colour: string;
  value: number;
  /** Value-space bounds; `v0 < v1` always. */
  v0: number;
  v1: number;
  /** The last segment on its side of zero — the one that gets the rounded cap. */
  outer: boolean;
};

type Stack = {
  key: string;
  label: string;
  segments: Segment[];
  total: number;
  positiveTotal: number;
  negativeTotal: number;
};

/**
 * Stacked bars built for the xP decomposition, where `negative` is genuinely
 * negative: positive components stack up from zero, negative ones stack down
 * below the same baseline. `null` components are skipped (no data), not zeroed.
 * An empty dataset renders nothing; let `ChartFrame` show the empty state.
 */
export function StackedBarChart({
  data,
  keys,
  orientation = 'vertical',
  height = 240,
  margin,
  formatValue = (v) => v.toFixed(2),
  valueTicks = 5,
  maxBarThickness = 24,
  labelEvery = 1,
  rotateLabels = 0,
  activeKeyId = null,
  showTotals = false,
  tableCaption,
  className,
  ariaLabel,
}: StackedBarChartProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const tip = useChartTooltip<{ stack: Stack; segment: Segment }>();

  const vertical = orientation === 'vertical';
  const gutter = vertical ? 0 : categoryGutter(data.map((d) => d.label ?? d.key), size.width);
  const m = withMargin(margin ?? (vertical ? {} : { left: gutter, bottom: 24, right: 30 }));
  const area = plotArea(size, m);

  const stacks = useMemo(() => buildStacks(data, keys), [data, keys]);
  const hasAny = stacks.some((stack) => stack.segments.length > 0);
  const ready = size.width > 0 && size.height > 0 && hasAny;

  const { scale, ticks, band } = useMemo(() => {
    const domain = valueExtent(
      stacks.flatMap((stack) => [stack.positiveTotal, stack.negativeTotal]),
      { includeZero: true, pad: 0.06 },
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
        stacks.length,
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
    formatValue,
    maxBarThickness,
    stacks,
    valueTicks,
    vertical,
  ]);

  const zero = scale(0);
  const bands = stacks.map((stack, index) => ({
    key: stack.key,
    label: stack.label,
    centre: band.centre(index),
  }));
  const gap = CHART_GEOMETRY.gapWidth;

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
                <line
                  x1={zero}
                  x2={zero}
                  y1={area.y}
                  y2={area.y + area.height}
                  stroke={CHART.axis}
                  strokeWidth={1.25}
                />
              </g>
              <XAxis area={area} ticks={ticks} line={false} tickSize={0} />
              <CategoryAxis
                area={area}
                bands={bands}
                orientation="left"
                every={labelEvery}
                labelWidth={gutter}
              />
            </>
          )}

          {stacks.map((stack, index) => {
            const centre = band.centre(index);
            const totalEnd = scale(stack.total >= 0 ? stack.positiveTotal : stack.negativeTotal);

            return (
              <g key={stack.key} role="list" aria-label={stack.label}>
                {stack.segments.map((segment) => {
                  const a = scale(segment.v0);
                  const b = scale(segment.v1);
                  const lo = Math.min(a, b);
                  const span = Math.abs(b - a);
                  const shrink = span > gap + 1 ? gap : 0;
                  const positive = segment.value > 0;
                  const dimmed = activeKeyId !== null && activeKeyId !== segment.keyId;

                  // Each segment gives up the gap at its *outward* end, so the
                  // segment touching zero stays anchored to the baseline.
                  const rect = vertical
                    ? {
                        x: centre - band.thickness / 2,
                        y: positive ? lo + shrink : lo,
                        width: band.thickness,
                        height: span - shrink,
                      }
                    : {
                        x: positive ? lo : lo + shrink,
                        y: centre - band.thickness / 2,
                        width: span - shrink,
                        height: band.thickness,
                      };

                  const cap = vertical
                    ? positive
                      ? ('top' as const)
                      : ('bottom' as const)
                    : positive
                      ? ('right' as const)
                      : ('left' as const);

                  return (
                    <path
                      key={segment.keyId}
                      role="listitem"
                      tabIndex={0}
                      aria-label={`${stack.label}, ${segment.keyLabel}: ${formatValue(
                        segment.value,
                      )}`}
                      d={cappedBar(
                        rect.x,
                        rect.y,
                        rect.width,
                        rect.height,
                        segment.outer ? CHART_GEOMETRY.barRadius : 0,
                        cap,
                      )}
                      fill={segment.colour}
                      opacity={dimmed ? 0.28 : 1}
                      className="outline-none focus-visible:[outline:2px_solid_var(--color-ring)] focus-visible:[outline-offset:2px]"
                      onPointerEnter={(event) => tip.show(event, { stack, segment })}
                      onPointerMove={tip.move}
                    />
                  );
                })}

                {showTotals ? (
                  <text
                    aria-hidden
                    x={vertical ? centre : totalEnd + (stack.total >= 0 ? 6 : -6)}
                    y={vertical ? totalEnd + (stack.total >= 0 ? -6 : 14) : centre}
                    dy={vertical ? 0 : '0.32em'}
                    textAnchor={vertical ? 'middle' : stack.total >= 0 ? 'start' : 'end'}
                    fill={CHART.muted}
                    fontSize={11}
                    fontWeight={600}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {formatValue(stack.total)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}

      <ChartTooltip
        anchor={tip.anchor}
        {...(tip.datum ? { title: tip.datum.stack.label } : {})}
        rows={
          tip.datum
            ? [
                {
                  label: tip.datum.segment.keyLabel,
                  value: formatValue(tip.datum.segment.value),
                  colour: tip.datum.segment.colour,
                },
                {
                  label: 'Total',
                  value: formatValue(tip.datum.stack.total),
                  muted: true,
                },
              ]
            : []
        }
      />

      <ChartTable
        caption={tableCaption ?? ariaLabel}
        columns={['Category', ...keys.map((key) => key.label), 'Total']}
        rows={stacks.map((stack) => [
          stack.label,
          ...keys.map((key) => {
            const segment = stack.segments.find((s) => s.keyId === key.id);
            return segment ? formatValue(segment.value) : NO_DATA;
          }),
          formatValue(stack.total),
        ])}
      />
    </div>
  );
}

/** Positive components stack up from zero; negative ones stack down from it. */
function buildStacks(data: readonly StackedDatum[], keys: readonly StackKey[]): Stack[] {
  return data.map((datum) => {
    const segments: Segment[] = [];
    let positiveTotal = 0;
    let negativeTotal = 0;
    let lastPositive = -1;
    let lastNegative = -1;

    keys.forEach((key, index) => {
      const raw = datum.values[key.id];
      if (raw === null || raw === undefined || !Number.isFinite(raw) || raw === 0) return;
      const colour = slotColor(key.token, index);
      if (raw > 0) {
        segments.push({
          keyId: key.id,
          keyLabel: key.label,
          colour,
          value: raw,
          v0: positiveTotal,
          v1: positiveTotal + raw,
          outer: false,
        });
        positiveTotal += raw;
        lastPositive = segments.length - 1;
      } else {
        segments.push({
          keyId: key.id,
          keyLabel: key.label,
          colour,
          value: raw,
          v0: negativeTotal + raw,
          v1: negativeTotal,
          outer: false,
        });
        negativeTotal += raw;
        lastNegative = segments.length - 1;
      }
    });

    if (lastPositive >= 0) segments[lastPositive]!.outer = true;
    if (lastNegative >= 0) segments[lastNegative]!.outer = true;

    return {
      key: datum.key,
      label: datum.label ?? datum.key,
      segments,
      total: positiveTotal + negativeTotal,
      positiveTotal,
      negativeTotal,
    };
  });
}
