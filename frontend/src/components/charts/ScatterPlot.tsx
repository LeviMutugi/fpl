import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { CHART, CHART_GEOMETRY, seriesColor, token } from '@/lib/tokens';
import { XAxis, YAxis, type AxisTick } from './ChartAxis';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { linear, niceTicks } from './scales';
import {
  boxesOverlap,
  estimateTextWidth,
  slotColor,
  valueExtent,
  type LabelBox,
} from './chartUtils';
import { plotArea, withMargin, type Margin, type ScatterDatum } from './types';

export type ScatterGroup = { id: string; label: string; token?: string };

export type ScatterPlotProps = {
  data: readonly ScatterDatum[];
  height?: number;
  margin?: Partial<Margin>;
  formatX?: (value: number) => string;
  formatY?: (value: number) => string;
  xTicks?: number;
  yTicks?: number;
  xLabel?: string;
  yLabel?: string;
  /** `true` splits on the medians; an object pins the crosshair explicitly. */
  quadrants?: boolean | { x: number; y: number };
  /** Corner notes, clockwise from the top left. */
  quadrantLabels?: {
    topLeft?: string;
    topRight?: string;
    bottomRight?: string;
    bottomLeft?: string;
  };
  /** Direct-label points, collision-avoided and capped. */
  showLabels?: boolean;
  maxLabels?: number;
  /** Radius range when `size` is present on the data. */
  radiusRange?: [number, number];
  /** Identity colour by group; capped at three by the all-pairs rule. */
  groups?: readonly ScatterGroup[];
  /** Single-group fill token. */
  token?: string;
  activeGroupId?: string | null;
  onSelect?: (id: string) => void;
  className?: string;
  ariaLabel: string;
};

type Placed = { datum: ScatterDatum; x: number; y: number; r: number; colour: string };

/**
 * Two measures, one mark per player. Optional quadrant guides, a size channel,
 * and sparing direct labels that are dropped rather than overlapped. Points
 * missing either coordinate are skipped; an empty dataset renders nothing.
 */
export function ScatterPlot({
  data,
  height = 320,
  margin,
  formatX = (value) => value.toFixed(1),
  formatY = (value) => value.toFixed(1),
  xTicks = 6,
  yTicks = 5,
  xLabel,
  yLabel,
  quadrants = false,
  quadrantLabels,
  showLabels = false,
  maxLabels = 12,
  radiusRange = [4, 13],
  groups,
  token: pointToken,
  activeGroupId = null,
  onSelect,
  className,
  ariaLabel,
}: ScatterPlotProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const tip = useChartTooltip<ScatterDatum>();

  const m = withMargin(margin ?? { top: 16, right: 20, bottom: xLabel ? 42 : 30, left: 48 });
  const area = plotArea(size, m);

  const usable = useMemo(
    () =>
      data.filter(
        (d) =>
          d.x !== null && d.y !== null && Number.isFinite(d.x) && Number.isFinite(d.y),
      ),
    [data],
  );
  const ready = size.width > 0 && size.height > 0 && usable.length > 0;

  const { points, xTickList, yTickList, guides } = useMemo(() => {
    const dx = valueExtent(
      usable.map((d) => d.x),
      { includeZero: false, pad: 0.08 },
    );
    const dy = valueExtent(
      usable.map((d) => d.y),
      { includeZero: false, pad: 0.08 },
    );
    const scaleX = linear(dx, [area.x, area.x + area.width]);
    const scaleY = linear(dy, [area.y + area.height, area.y]);

    const sizes = usable
      .map((d) => d.size)
      .filter((value): value is number => value !== undefined && Number.isFinite(value));
    const sizeMax = sizes.length ? Math.max(...sizes) : 0;
    const sizeMin = sizes.length ? Math.min(...sizes) : 0;
    const radius = (value: number | undefined): number => {
      if (value === undefined || !Number.isFinite(value) || sizeMax === sizeMin) {
        return radiusRange[0];
      }
      const t = Math.sqrt((value - sizeMin) / (sizeMax - sizeMin));
      return radiusRange[0] + t * (radiusRange[1] - radiusRange[0]);
    };

    const groupIndex = new Map(groups?.map((group, index) => [group.id, index]) ?? []);

    const placed: Placed[] = usable.map((datum) => {
      const index = datum.group !== undefined ? (groupIndex.get(datum.group) ?? 0) : 0;
      const groupToken = datum.group !== undefined ? groups?.[index]?.token : pointToken;
      return {
        datum,
        x: scaleX(datum.x as number),
        y: scaleY(datum.y as number),
        r: radius(datum.size),
        colour: slotColor(groupToken ?? pointToken, groups ? index : 0),
      };
    });

    const guideValues =
      quadrants === false
        ? null
        : quadrants === true
          ? {
              x: median(usable.map((d) => d.x as number)),
              y: median(usable.map((d) => d.y as number)),
            }
          : quadrants;

    return {
      points: placed,
      guides: guideValues ? { x: scaleX(guideValues.x), y: scaleY(guideValues.y) } : null,
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
    groups,
    pointToken,
    quadrants,
    radiusRange,
    usable,
    xTicks,
    yTicks,
  ]);

  const labels = useMemo(
    () => (showLabels ? placeLabels(points, area, maxLabels) : []),
    [area, maxLabels, points, showLabels],
  );

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

          {guides ? (
            <g aria-hidden>
              <line
                x1={guides.x}
                x2={guides.x}
                y1={area.y}
                y2={area.y + area.height}
                stroke={CHART.axis}
                strokeWidth={1}
              />
              <line
                x1={area.x}
                x2={area.x + area.width}
                y1={guides.y}
                y2={guides.y}
                stroke={CHART.axis}
                strokeWidth={1}
              />
              {quadrantLabels
                ? (
                    [
                      { text: quadrantLabels.topLeft, x: area.x + 6, y: area.y + 12, anchor: 'start' },
                      {
                        text: quadrantLabels.topRight,
                        x: area.x + area.width - 6,
                        y: area.y + 12,
                        anchor: 'end',
                      },
                      {
                        text: quadrantLabels.bottomRight,
                        x: area.x + area.width - 6,
                        y: area.y + area.height - 6,
                        anchor: 'end',
                      },
                      {
                        text: quadrantLabels.bottomLeft,
                        x: area.x + 6,
                        y: area.y + area.height - 6,
                        anchor: 'start',
                      },
                    ] as const
                  ).map((corner) =>
                    corner.text ? (
                      <text
                        key={corner.text}
                        x={corner.x}
                        y={corner.y}
                        textAnchor={corner.anchor}
                        fill={CHART.label}
                        fontSize={10}
                        letterSpacing="0.04em"
                      >
                        {corner.text.toUpperCase()}
                      </text>
                    ) : null,
                  )
                : null}
            </g>
          ) : null}

          {xLabel ? (
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
          ) : null}
          {yLabel ? (
            <text
              aria-hidden
              x={area.x - m.left + 10}
              y={area.y}
              textAnchor="start"
              fill={CHART.label}
              fontSize={10.5}
            >
              {yLabel}
            </text>
          ) : null}

          <g role="list" aria-label={ariaLabel}>
            {points.map((point) => {
              const dimmed =
                activeGroupId !== null && point.datum.group !== activeGroupId;
              return (
                <g key={point.datum.id} opacity={dimmed ? 0.2 : 1}>
                  <circle
                    aria-hidden
                    cx={point.x}
                    cy={point.y}
                    r={point.r}
                    fill={point.colour}
                    stroke={CHART.surface}
                    strokeWidth={CHART_GEOMETRY.gapWidth}
                  />
                  <circle
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${point.datum.label}: ${formatX(
                      point.datum.x as number,
                    )}, ${formatY(point.datum.y as number)}`}
                    cx={point.x}
                    cy={point.y}
                    r={Math.max(12, point.r + 6)}
                    fill="transparent"
                    className={cn(
                      'outline-none focus-visible:[outline:2px_solid_var(--color-ring)] focus-visible:[outline-offset:2px]',
                      onSelect && 'cursor-pointer',
                    )}
                    onPointerEnter={(event) => tip.show(event, point.datum)}
                    onPointerMove={tip.move}
                    onClick={onSelect ? () => onSelect(point.datum.id) : undefined}
                    onKeyDown={
                      onSelect
                        ? (event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault();
                              onSelect(point.datum.id);
                            }
                          }
                        : undefined
                    }
                  />
                </g>
              );
            })}
          </g>

          {labels.map((label) => (
            <text
              key={label.id}
              aria-hidden
              x={label.x}
              y={label.y}
              textAnchor={label.anchor}
              dy="0.32em"
              fill={CHART.muted}
              fontSize={10.5}
            >
              {label.text}
            </text>
          ))}
        </svg>
      ) : null}

      <ChartTooltip
        anchor={tip.anchor}
        {...(tip.datum ? { title: tip.datum.label } : {})}
        rows={
          tip.datum
            ? [
                {
                  label: xLabel ?? 'x',
                  value: formatX(tip.datum.x as number),
                  colour: pointToken ? token(pointToken) : seriesColor(0),
                },
                { label: yLabel ?? 'y', value: formatY(tip.datum.y as number) },
              ]
            : []
        }
      />
    </div>
  );
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? ((sorted[mid - 1]! + sorted[mid]!) / 2) : sorted[mid]!;
}

type PlacedLabel = { id: string; text: string; x: number; y: number; anchor: 'start' | 'end' };

/**
 * Greedy placement: emphasised points first, then the biggest marks. A label
 * that cannot find a free slot is dropped — never stacked or clipped, because
 * the value is still in the tooltip.
 */
function placeLabels(
  points: readonly Placed[],
  area: { x: number; y: number; width: number; height: number },
  maxLabels: number,
): PlacedLabel[] {
  const fontSize = 10.5;
  const height = fontSize + 2;
  const ordered = [...points].sort((a, b) => {
    const rank = Number(Boolean(b.datum.emphasise)) - Number(Boolean(a.datum.emphasise));
    return rank !== 0 ? rank : b.r - a.r;
  });

  const taken: LabelBox[] = points.map((point) => ({
    x: point.x - point.r,
    y: point.y - point.r,
    width: point.r * 2,
    height: point.r * 2,
  }));
  const out: PlacedLabel[] = [];

  for (const point of ordered) {
    if (out.length >= maxLabels) break;
    const text = point.datum.label;
    const width = estimateTextWidth(text, fontSize);
    const candidates: { x: number; y: number; anchor: 'start' | 'end' }[] = [
      { x: point.x + point.r + 5, y: point.y, anchor: 'start' },
      { x: point.x - point.r - 5, y: point.y, anchor: 'end' },
      { x: point.x + point.r + 5, y: point.y - height, anchor: 'start' },
      { x: point.x - point.r - 5, y: point.y + height, anchor: 'end' },
    ];

    for (const candidate of candidates) {
      const box: LabelBox = {
        x: candidate.anchor === 'start' ? candidate.x : candidate.x - width,
        y: candidate.y - height / 2,
        width,
        height,
      };
      if (box.x < area.x || box.x + box.width > area.x + area.width) continue;
      if (box.y < area.y || box.y + box.height > area.y + area.height) continue;
      if (taken.some((other) => boxesOverlap(box, other, 2))) continue;
      taken.push(box);
      out.push({ id: point.datum.id, text, x: candidate.x, y: candidate.y, anchor: candidate.anchor });
      break;
    }
  }

  return out;
}
