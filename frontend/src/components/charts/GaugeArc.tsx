import { useId } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { CHART, token } from '@/lib/tokens';
import { NO_DATA, pct } from '@/lib/format';
import { arcPath, polar } from './scales';
import { clampUnit } from './chartUtils';

export type GaugeBand = {
  /** Fraction of the sweep this band starts at, 0..1. */
  from: number;
  to: number;
  token: string;
  label: string;
};

export type GaugeArcProps = {
  /** `null` renders the track plus an explicit no-data readout. */
  value: number | null;
  min?: number;
  max?: number;
  height?: number;
  /** Total sweep in degrees, centred on 6 o'clock. */
  sweep?: number;
  thickness?: number;
  /** Fill token; the track is a lighter step of the same ramp by default. */
  token?: string;
  trackToken?: string;
  /** Qualitative bands drawn as ticks on the outside of the track. */
  bands?: readonly GaugeBand[];
  /** A second value drawn as a needle-style tick (e.g. the league median). */
  comparison?: number | null;
  comparisonLabel?: string;
  label?: string;
  formatValue?: (value: number) => string;
  className?: string;
  ariaLabel: string;
};

/**
 * A single bounded reading — a probability by default. The arc is the mark; the
 * number in the middle is the answer, so the gauge never depends on reading an
 * angle.
 */
export function GaugeArc({
  value,
  min = 0,
  max = 1,
  height = 160,
  sweep = 240,
  thickness = 12,
  token: fillToken = 'color-seq-400',
  trackToken = 'color-seq-100',
  bands,
  comparison = null,
  comparisonLabel = 'Comparison',
  label,
  formatValue = (v) => pct(v, 0),
  className,
  ariaLabel,
}: GaugeArcProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const reduced = useReducedMotion();

  const ready = size.width > 0;
  const span = max - min;
  const fraction =
    value === null || !Number.isFinite(value) || span === 0
      ? null
      : clampUnit((value - min) / span);

  // 12 o'clock is angle 0 in `polar`, so a symmetric sweep opens at the bottom.
  const half = Math.min(Math.PI, Math.max(0.1, (sweep / 2) * (Math.PI / 180)));
  const start = -half;
  const end = half;
  // The arc spans `r(1 - cos h)` vertically and `2r·sin h` horizontally.
  const spanY = 1 - Math.cos(half);
  const spanX = 2 * (half >= Math.PI / 2 ? 1 : Math.sin(half));
  const radius = Math.max(
    0,
    Math.min((height - thickness) / spanY, (size.width - thickness) / spanX),
  );
  const cx = size.width / 2;
  const cy = thickness / 2 + radius;
  const angleAt = (t: number) => start + (end - start) * t;

  const arcFor = (t: number) => arcPath(cx, cy, radius, angleAt(0), angleAt(t));

  return (
    <div ref={ref} className={cn('relative w-full', className)} style={{ height }}>
      {ready ? (
        <svg
          width={size.width}
          height={height}
          role="img"
          aria-label={`${ariaLabel}: ${fraction === null || value === null ? 'no data' : formatValue(value)}`}
          className="overflow-visible"
        >
          <defs>
            <clipPath id={uid}>
              <rect x={0} y={0} width={size.width} height={height} />
            </clipPath>
          </defs>

          <g clipPath={`url(#${uid})`}>
            <path
              aria-hidden
              d={arcPath(cx, cy, radius, start, end)}
              fill="none"
              stroke={token(trackToken)}
              strokeWidth={thickness}
              strokeLinecap="round"
            />

            {bands?.map((band) => (
              <path
                key={band.label}
                aria-hidden
                d={arcPath(
                  cx,
                  cy,
                  radius + thickness / 2 + 5,
                  angleAt(clampUnit(band.from)),
                  angleAt(clampUnit(band.to)),
                )}
                fill="none"
                stroke={token(band.token)}
                strokeWidth={3}
                strokeLinecap="round"
              />
            ))}

            {fraction !== null ? (
              <path
                aria-hidden
                d={arcFor(fraction)}
                fill="none"
                stroke={token(fillToken)}
                strokeWidth={thickness}
                strokeLinecap="round"
                className={reduced ? undefined : 'transition-[d] duration-500 ease-[var(--ease-calm)]'}
              />
            ) : null}

            {comparison !== null && Number.isFinite(comparison) && span !== 0 ? (
              (() => {
                const t = clampUnit((comparison - min) / span);
                const [x0, y0] = polar(cx, cy, radius - thickness / 2 - 3, angleAt(t));
                const [x1, y1] = polar(cx, cy, radius + thickness / 2 + 3, angleAt(t));
                return (
                  <line
                    aria-hidden
                    x1={x0}
                    y1={y0}
                    x2={x1}
                    y2={y1}
                    stroke={CHART.text}
                    strokeWidth={2}
                    strokeLinecap="round"
                  />
                );
              })()
            ) : null}
          </g>

          <text
            aria-hidden
            x={cx}
            y={cy - radius * 0.16}
            textAnchor="middle"
            fill={CHART.text}
            fontSize={Math.max(18, Math.min(34, radius * 0.4))}
            fontWeight={600}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {value === null || !Number.isFinite(value) ? NO_DATA : formatValue(value)}
          </text>
          {label ? (
            <text
              aria-hidden
              x={cx}
              y={cy - radius * 0.16 + 18}
              textAnchor="middle"
              fill={CHART.label}
              fontSize={11.5}
            >
              {label}
            </text>
          ) : null}
        </svg>
      ) : null}

      {comparison !== null && Number.isFinite(comparison) ? (
        <p className="sr-only">{`${comparisonLabel}: ${formatValue(comparison)}`}</p>
      ) : null}
      {bands?.length ? (
        <ul className="mt-1 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
          {bands.map((band) => (
            <li key={band.label} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="h-1.5 w-3 shrink-0 rounded-[2px]"
                style={{ background: token(band.token) }}
              />
              {band.label}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
