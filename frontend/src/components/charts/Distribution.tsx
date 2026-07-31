import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { CHART, CHART_GEOMETRY, seriesColor, token } from '@/lib/tokens';
import { NO_DATA, num, pct } from '@/lib/format';
import { XAxis, YAxis, type AxisTick } from './ChartAxis';
import { ChartTable } from './ChartTable';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { linear, niceTicks } from './scales';
import { cappedBar, fade, valueExtent } from './chartUtils';
import { plotArea, withMargin, type Margin } from './types';

/** One mass point of the discrete points distribution. */
export type DistributionPoint = { points: number; prob: number | null };

export type DistributionRegion = {
  id: string;
  label: string;
  /** Inclusive integer bounds; omit either end for an open region. */
  from?: number;
  to?: number;
  /** Token for the wash and the rail. Defaults to good (upside) / critical. */
  token?: string;
};

export type DistributionProps = {
  pmf: readonly DistributionPoint[];
  height?: number;
  margin?: Partial<Margin>;
  /** The p10–p90 interval, shaded behind the bars. */
  band?: { lo: number; hi: number } | null;
  /** Point estimate drawn as a labelled rule (xP). */
  mean?: number | null;
  meanLabel?: string;
  /** Annotated outcome regions; `true` uses P(haul ≥10) and P(blank ≤2). */
  regions?: readonly DistributionRegion[] | boolean;
  /** Token for the bars. One distribution is one colour. */
  token?: string;
  probTicks?: number;
  formatPoints?: (value: number) => string;
  formatProb?: (value: number) => string;
  tableCaption?: string;
  className?: string;
  ariaLabel: string;
};

const DEFAULT_REGIONS: readonly DistributionRegion[] = [
  { id: 'blank', label: 'Blank ≤2', to: 2, token: 'color-critical' },
  { id: 'haul', label: 'Haul ≥10', from: 10, token: 'color-good' },
];

/**
 * The discrete points PMF: a bar per attainable score, the p10–p90 interval
 * shaded behind it, the point estimate as a labelled rule, and outcome regions
 * annotated on a rail beneath the axis. Region colour is never the only
 * encoding — every region carries its name and its probability as text.
 *
 * `null` probabilities are gaps (no bar), not zeroes. An empty pmf renders
 * nothing; let `ChartFrame` show the empty state.
 */
export function Distribution({
  pmf,
  height = 260,
  margin,
  band = null,
  mean = null,
  meanLabel = 'xP',
  regions = false,
  token: barToken,
  probTicks = 4,
  formatPoints = (value) => String(value),
  formatProb = (value) => pct(value, 0),
  tableCaption,
  className,
  ariaLabel,
}: DistributionProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const tip = useChartTooltip<{ points: number; prob: number }>();

  const m = withMargin(margin ?? { top: 26, right: 16, bottom: 44, left: 46 });
  const area = plotArea(size, m);
  const colour = barToken ? token(barToken) : seriesColor(0);

  const activeRegions = useMemo<readonly DistributionRegion[]>(
    () => (regions === true ? DEFAULT_REGIONS : regions === false ? [] : regions),
    [regions],
  );

  const bars = useMemo(
    () =>
      pmf
        .filter((entry) => Number.isFinite(entry.points))
        .slice()
        .sort((a, b) => a.points - b.points),
    [pmf],
  );
  const hasAny = bars.some((entry) => entry.prob !== null && Number.isFinite(entry.prob));
  const ready = size.width > 0 && size.height > 0 && hasAny;

  const { sx, sy, step, thickness, probTickList, pointTickList } = useMemo(() => {
    const values = bars.map((entry) => entry.points);
    const lo = values.length ? Math.min(...values) : 0;
    const hi = values.length ? Math.max(...values) : 1;
    const slots = Math.max(1, hi - lo + 1);
    const scaleX = linear([lo - 0.5, hi + 0.5], [area.x, area.x + area.width]);
    const probDomain = valueExtent(
      bars.map((entry) => entry.prob),
      { includeZero: true },
    );
    const capped: [number, number] = [0, Math.max(probDomain[1], 0.02)];
    const scaleY = linear(capped, [area.y + area.height, area.y]);
    const bandStep = area.width / slots;
    const every = Math.max(1, Math.ceil(slots / 14));

    return {
      sx: scaleX,
      sy: scaleY,
      step: bandStep,
      thickness: Math.max(2, Math.min(24, bandStep * 0.72)),
      probTickList: niceTicks(capped, probTicks).map<AxisTick>((v) => ({
        value: v,
        label: formatProb(v),
        offset: scaleY(v),
      })),
      pointTickList: values
        .filter((_, index) => index % every === 0)
        .map<AxisTick>((v) => ({ value: v, label: formatPoints(v), offset: scaleX(v) })),
    };
  }, [area.height, area.width, area.x, area.y, bars, formatPoints, formatProb, probTicks]);

  const baseline = area.y + area.height;
  const regionMass = useMemo(
    () => activeRegions.map((region) => ({ region, mass: massIn(bars, region) })),
    [activeRegions, bars],
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
          {/* p10–p90: the honest width of the forecast, behind everything. */}
          {band && Number.isFinite(band.lo) && Number.isFinite(band.hi) ? (
            <g aria-hidden>
              <rect
                x={sx(band.lo)}
                y={area.y}
                width={Math.max(0, sx(band.hi) - sx(band.lo))}
                height={area.height}
                fill={fade(token('color-seq-100'), 0.55)}
                rx={CHART_GEOMETRY.barRadius}
              />
              {[band.lo, band.hi].map((edge, index) => (
                <line
                  key={`edge-${index}`}
                  x1={sx(edge)}
                  x2={sx(edge)}
                  y1={area.y}
                  y2={baseline}
                  stroke={token('color-seq-300')}
                  strokeWidth={1}
                />
              ))}
              <text
                x={sx(band.lo) + 4}
                y={area.y + 10}
                fill={CHART.label}
                fontSize={9.5}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                p10–p90
              </text>
            </g>
          ) : null}

          {/* Outcome regions: a wash plus a labelled rail under the axis. */}
          {regionMass.map(({ region, mass }) => {
            const from = region.from ?? bars[0]?.points ?? 0;
            const to = region.to ?? bars[bars.length - 1]?.points ?? 0;
            if (to < from) return null;
            const x0 = sx(from - 0.5);
            const x1 = sx(to + 0.5);
            const tint = token(region.token ?? 'color-accent');
            return (
              <g key={region.id} aria-hidden>
                <rect
                  x={x0}
                  y={area.y}
                  width={Math.max(0, x1 - x0)}
                  height={area.height}
                  fill={fade(tint, 0.1)}
                />
                <line
                  x1={x0 + 1}
                  x2={x1 - 1}
                  y1={baseline + 26}
                  y2={baseline + 26}
                  stroke={tint}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
                <text
                  x={(x0 + x1) / 2}
                  y={baseline + 38}
                  textAnchor="middle"
                  fill={CHART.muted}
                  fontSize={10.5}
                  style={{ fontVariantNumeric: 'tabular-nums' }}
                >
                  {`${region.label} · ${pct(mass, 0)}`}
                </text>
              </g>
            );
          })}

          <YAxis area={area} ticks={probTickList} />
          <XAxis area={area} ticks={pointTickList} />

          <g role="list" aria-label={ariaLabel}>
            {bars.map((entry) => {
              if (entry.prob === null || !Number.isFinite(entry.prob)) return null;
              const prob = entry.prob;
              const top = sy(prob);
              const barHeight = Math.max(0, baseline - top);
              return (
                <g key={entry.points}>
                  <path
                    role="listitem"
                    tabIndex={0}
                    aria-label={`${formatPoints(entry.points)} points: ${formatProb(prob)}`}
                    d={cappedBar(
                      sx(entry.points) - thickness / 2,
                      top,
                      thickness,
                      barHeight,
                      CHART_GEOMETRY.barRadius,
                      'top',
                    )}
                    fill={colour}
                    className="outline-none focus-visible:[outline:2px_solid_var(--color-ring)] focus-visible:[outline-offset:2px]"
                    onPointerEnter={(event) => tip.show(event, { points: entry.points, prob })}
                    onPointerMove={tip.move}
                  />
                  {/* A hit target wide enough to land on without aiming. */}
                  <rect
                    aria-hidden
                    x={sx(entry.points) - step / 2}
                    y={area.y}
                    width={step}
                    height={area.height}
                    fill="transparent"
                    onPointerEnter={(event) => tip.show(event, { points: entry.points, prob })}
                    onPointerMove={tip.move}
                  />
                </g>
              );
            })}
          </g>

          {/* The point estimate, in ink so it never competes with the bars. */}
          {mean !== null && Number.isFinite(mean) ? (
            <g aria-hidden>
              <line
                x1={sx(mean)}
                x2={sx(mean)}
                y1={area.y - 2}
                y2={baseline}
                stroke={CHART.text}
                strokeWidth={1.5}
              />
              <path
                d={`M${sx(mean)},${area.y - 8} l4,4 -4,4 -4,-4 Z`}
                fill={CHART.text}
                stroke={CHART.surface}
                strokeWidth={1}
              />
              <text
                x={sx(mean)}
                y={area.y - 14}
                textAnchor="middle"
                fill={CHART.text}
                fontSize={11}
                fontWeight={600}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {`${meanLabel} ${num(mean, 1)}`}
              </text>
            </g>
          ) : null}
        </svg>
      ) : null}

      <ChartTooltip
        anchor={tip.anchor}
        {...(tip.datum ? { title: `${formatPoints(tip.datum.points)} points` } : {})}
        rows={
          tip.datum
            ? [{ label: 'Probability', value: pct(tip.datum.prob, 1), colour }]
            : []
        }
      />

      <ChartTable
        caption={tableCaption ?? summarise(ariaLabel, band, mean, regionMass)}
        columns={['Points', 'Probability']}
        rows={bars.map((entry) => [
          formatPoints(entry.points),
          entry.prob === null || !Number.isFinite(entry.prob) ? NO_DATA : pct(entry.prob, 1),
        ])}
      />
    </div>
  );
}

/** Total probability mass inside a region's inclusive bounds. */
function massIn(bars: readonly DistributionPoint[], region: DistributionRegion): number {
  let total = 0;
  for (const entry of bars) {
    if (entry.prob === null || !Number.isFinite(entry.prob)) continue;
    if (region.from !== undefined && entry.points < region.from) continue;
    if (region.to !== undefined && entry.points > region.to) continue;
    total += entry.prob;
  }
  return total;
}

function summarise(
  ariaLabel: string,
  band: { lo: number; hi: number } | null,
  mean: number | null,
  regionMass: readonly { region: DistributionRegion; mass: number }[],
): string {
  const parts = [ariaLabel];
  if (mean !== null && Number.isFinite(mean)) parts.push(`mean ${num(mean, 2)}`);
  if (band) parts.push(`p10–p90 ${num(band.lo, 1)} to ${num(band.hi, 1)}`);
  for (const { region, mass } of regionMass) parts.push(`${region.label} ${pct(mass, 0)}`);
  return parts.join('; ');
}
