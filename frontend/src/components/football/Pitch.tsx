import { createContext, useContext, useId, useMemo, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { parseFormation, rowCounts, slotX, slotY, ROW_BENCH } from './FormationSlots';

/* -------------------------------------------------------------------------- *
 * Geometry of the drawing. The viewBox is a portrait pitch; the SVG is drawn
 * with `preserveAspectRatio="none"` so the markings stretch to whatever shape
 * the container ends up, exactly like a broadcast graphic. Stroke widths are
 * pinned with `vector-effect` so nothing smears.
 * -------------------------------------------------------------------------- */

const VB_W = 1000;
const VB_H = 1400;
/** Touchline inset. */
const M = 34;
const BOX_W = 660;
const BOX_D = 200;
const SIX_W = 300;
const SIX_D = 76;
const SPOT_D = 134;
const ARC_R = 130;
const CORNER_R = 26;
const GOAL_W = 168;
const GOAL_D = 24;
const STRIPES = 14;

/** Fraction of the wrapper's height taken by the green board. */
const BOARD_FRACTION = 0.845;
const BENCH_HEIGHT_PCT = 13.5;

type PitchContextValue = {
  showBench: boolean;
  /** Row counts of the current formation, so `PitchSlot` can infer `of`. */
  counts: readonly number[];
};

const PitchContext = createContext<PitchContextValue>({
  showBench: false,
  counts: [1, 4, 4, 2],
});

/* ------------------------------------------------------------------ Pitch -- */

export type PitchProps = {
  /** e.g. `"3-4-3"`. Unparseable strings fall back to 4-4-2. */
  formation: string;
  /** `PitchSlot` children — anything else is simply rendered on the overlay. */
  children?: ReactNode;
  className?: string;
  /** Render the four-slot dugout strip beneath the pitch. */
  showBench?: boolean;
  /** Cap the drawing's height so a tall pitch never dominates a wide screen. */
  maxHeightVh?: number;
  /** Small formation chip in the corner. */
  showFormationLabel?: boolean;
  /** Accessible name for the whole board. */
  ariaLabel?: string;
};

/**
 * The squad pitch.
 *
 * Light theme is fresh, bright, freshly-mown turf; dark theme is deep emerald
 * under floodlights. Every colour comes from a `--color-pitch-*` token, so the
 * two themes are the same drawing with a different palette rather than two
 * separate artworks.
 *
 * Children are placed with {@link PitchSlot}, which positions by
 * `row`/`col`/`of` — the slot overlay spans the pitch *and* the bench strip,
 * so a bench token lands in the dugout with the same API.
 */
export function Pitch({
  formation,
  children,
  className,
  showBench = false,
  maxHeightVh = 78,
  showFormationLabel = true,
  ariaLabel,
}: PitchProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const shape = useMemo(() => parseFormation(formation), [formation]);
  const counts = useMemo(() => rowCounts(formation), [formation]);

  const ratioW = 10;
  const ratioH = showBench ? 14.6 : 12.4;
  const wrapperStyle: CSSProperties = {
    aspectRatio: `${ratioW} / ${ratioH}`,
    maxWidth: `calc(${maxHeightVh}vh * ${ratioW} / ${ratioH})`,
    containerType: 'inline-size',
  };

  const stripes = Array.from({ length: STRIPES }, (_, i) => i);

  return (
    <div
      className={cn('relative isolate mx-auto w-full min-w-0', className)}
      style={wrapperStyle}
      role="group"
      aria-label={ariaLabel ?? `Pitch, ${shape.name} formation`}
    >
      {/* ------------------------------------------------------ the board -- */}
      <div
        className={cn(
          'absolute inset-x-0 top-0 overflow-hidden',
          'rounded-[26px] sm:rounded-[34px] lg:rounded-[44px]',
        )}
        style={{
          bottom: showBench ? `${100 - BOARD_FRACTION * 100}%` : 0,
          boxShadow: [
            'inset 0 0 0 1px color-mix(in oklch, var(--color-pitch-edge) 78%, transparent)',
            'inset 0 1.5px 0 color-mix(in oklch, var(--color-pitch-rim) 46%, transparent)',
            'inset 0 -18px 40px -22px var(--color-pitch-shadow)',
            'var(--shadow-lift)',
          ].join(', '),
        }}
      >
        <svg
          aria-hidden
          className="absolute inset-0 h-full w-full"
          viewBox={`0 0 ${VB_W} ${VB_H}`}
          preserveAspectRatio="none"
          focusable="false"
        >
          <defs>
            <linearGradient id={`turf-${uid}`} x1="0" y1="0" x2="0.18" y2="1">
              <stop offset="0%" stopColor="var(--color-pitch-turf-alt)" />
              <stop offset="42%" stopColor="var(--color-pitch-turf)" />
              <stop offset="100%" stopColor="var(--color-pitch-turf-deep)" />
            </linearGradient>

            <radialGradient id={`flood-${uid}`} cx="0.5" cy="0.02" r="0.85">
              <stop
                offset="0%"
                stopColor="color-mix(in oklch, var(--color-pitch-rim) 34%, transparent)"
              />
              <stop offset="100%" stopColor="transparent" />
            </radialGradient>

            <radialGradient id={`vignette-${uid}`} cx="0.5" cy="0.44" r="0.78">
              <stop offset="52%" stopColor="transparent" />
              <stop
                offset="100%"
                stopColor="color-mix(in oklch, var(--color-pitch-shadow) 52%, transparent)"
              />
            </radialGradient>

            <pattern
              id={`net-${uid}`}
              width="14"
              height="14"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M14 0 H0 V14"
                fill="none"
                stroke="color-mix(in oklch, var(--color-pitch-line) 52%, transparent)"
                strokeWidth="1.6"
              />
            </pattern>

            <filter id={`grain-${uid}`} x="0" y="0" width="100%" height="100%">
              <feTurbulence
                type="fractalNoise"
                baseFrequency="0.85"
                numOctaves={3}
                stitchTiles="stitch"
                result="noise"
              />
              <feColorMatrix in="noise" type="saturate" values="0" />
            </filter>

            <clipPath id={`play-${uid}`}>
              <rect x="0" y="0" width={VB_W} height={VB_H} />
            </clipPath>
          </defs>

          <g clipPath={`url(#play-${uid})`}>
            {/* Turf ------------------------------------------------------- */}
            <rect x="0" y="0" width={VB_W} height={VB_H} fill={`url(#turf-${uid})`} />

            {/* Mown stripes ---------------------------------------------- */}
            {stripes.map((i) => (
              <rect
                key={i}
                x="0"
                y={(i * VB_H) / STRIPES}
                width={VB_W}
                height={VB_H / STRIPES}
                fill={
                  i % 2 === 0
                    ? 'var(--color-pitch-turf-alt)'
                    : 'var(--color-pitch-turf-deep)'
                }
                opacity={i % 2 === 0 ? 0.34 : 0.15}
              />
            ))}
            {/* A faint cross-mow so the stripes do not read as flat bands. */}
            {[0, 1, 2, 3].map((i) => (
              <rect
                key={`v${i}`}
                x={(i * VB_W) / 4}
                y="0"
                width={VB_W / 4}
                height={VB_H}
                fill="var(--color-pitch-turf-alt)"
                opacity={i % 2 === 0 ? 0.07 : 0}
              />
            ))}

            {/* Floodlight wash -------------------------------------------- */}
            <rect x="0" y="0" width={VB_W} height={VB_H} fill={`url(#flood-${uid})`} />

            {/* Markings --------------------------------------------------- */}
            <g
              fill="none"
              stroke="var(--color-pitch-line)"
              strokeOpacity={0.82}
              strokeWidth={3}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            >
              {/* Touchlines */}
              <rect x={M} y={M} width={VB_W - 2 * M} height={VB_H - 2 * M} rx="6" />

              {/* Halfway line, centre circle and spot */}
              <line x1={M} y1={VB_H / 2} x2={VB_W - M} y2={VB_H / 2} />
              <circle cx={VB_W / 2} cy={VB_H / 2} r={ARC_R} />
              <circle
                cx={VB_W / 2}
                cy={VB_H / 2}
                r={7}
                fill="var(--color-pitch-line)"
                fillOpacity={0.82}
                stroke="none"
              />

              {/* Penalty + six-yard boxes, both ends */}
              <rect x={(VB_W - BOX_W) / 2} y={M} width={BOX_W} height={BOX_D} />
              <rect x={(VB_W - SIX_W) / 2} y={M} width={SIX_W} height={SIX_D} />
              <rect
                x={(VB_W - BOX_W) / 2}
                y={VB_H - M - BOX_D}
                width={BOX_W}
                height={BOX_D}
              />
              <rect
                x={(VB_W - SIX_W) / 2}
                y={VB_H - M - SIX_D}
                width={SIX_W}
                height={SIX_D}
              />

              {/* Penalty spots */}
              <circle
                cx={VB_W / 2}
                cy={M + SPOT_D}
                r={6}
                fill="var(--color-pitch-line)"
                fillOpacity={0.82}
                stroke="none"
              />
              <circle
                cx={VB_W / 2}
                cy={VB_H - M - SPOT_D}
                r={6}
                fill="var(--color-pitch-line)"
                fillOpacity={0.82}
                stroke="none"
              />

              {/* D arcs — the slice of the penalty circle outside each box */}
              <path d={`M388 ${M + BOX_D} A ${ARC_R} ${ARC_R} 0 0 0 612 ${M + BOX_D}`} />
              <path
                d={`M388 ${VB_H - M - BOX_D} A ${ARC_R} ${ARC_R} 0 0 1 612 ${VB_H - M - BOX_D}`}
              />

              {/* Corner arcs */}
              <path d={`M${M} ${M + CORNER_R} A ${CORNER_R} ${CORNER_R} 0 0 0 ${M + CORNER_R} ${M}`} />
              <path
                d={`M${VB_W - M - CORNER_R} ${M} A ${CORNER_R} ${CORNER_R} 0 0 0 ${VB_W - M} ${M + CORNER_R}`}
              />
              <path
                d={`M${VB_W - M} ${VB_H - M - CORNER_R} A ${CORNER_R} ${CORNER_R} 0 0 0 ${VB_W - M - CORNER_R} ${VB_H - M}`}
              />
              <path
                d={`M${M + CORNER_R} ${VB_H - M} A ${CORNER_R} ${CORNER_R} 0 0 0 ${M} ${VB_H - M - CORNER_R}`}
              />
            </g>

            {/* Goal frames + netting ------------------------------------- */}
            <g>
              <rect
                x={(VB_W - GOAL_W) / 2}
                y={M - GOAL_D}
                width={GOAL_W}
                height={GOAL_D}
                fill={`url(#net-${uid})`}
                opacity={0.7}
              />
              <rect
                x={(VB_W - GOAL_W) / 2}
                y={VB_H - M}
                width={GOAL_W}
                height={GOAL_D}
                fill={`url(#net-${uid})`}
                opacity={0.7}
              />
              <g
                fill="none"
                stroke="var(--color-pitch-line)"
                strokeWidth={4}
                strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              >
                <path
                  d={`M${(VB_W - GOAL_W) / 2} ${M} V ${M - GOAL_D} H ${(VB_W + GOAL_W) / 2} V ${M}`}
                />
                <path
                  d={`M${(VB_W - GOAL_W) / 2} ${VB_H - M} V ${VB_H - M + GOAL_D} H ${
                    (VB_W + GOAL_W) / 2
                  } V ${VB_H - M}`}
                />
              </g>
            </g>

            {/* Vignette + grain ------------------------------------------- */}
            <rect x="0" y="0" width={VB_W} height={VB_H} fill={`url(#vignette-${uid})`} />
            <rect
              x="0"
              y="0"
              width={VB_W}
              height={VB_H}
              filter={`url(#grain-${uid})`}
              opacity={0.055}
              style={{ mixBlendMode: 'overlay' }}
            />
          </g>
        </svg>

        {showFormationLabel ? (
          <span
            className={cn(
              'pointer-events-none absolute left-3 top-3 rounded-[999px] px-2.5 py-1 sm:left-4 sm:top-4',
              'text-[10.5px] font-semibold uppercase tracking-[0.1em]',
              'text-[color:var(--color-pitch-line)]',
            )}
            style={{
              background: 'color-mix(in oklch, var(--color-pitch-shadow) 34%, transparent)',
              boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--color-pitch-line) 22%, transparent)',
              backdropFilter: 'blur(6px)',
            }}
          >
            {shape.name}
          </span>
        ) : null}
      </div>

      {/* ------------------------------------------------------ the bench -- */}
      {showBench ? (
        <div
          className={cn(
            'absolute inset-x-0 bottom-0 overflow-hidden rounded-[20px] sm:rounded-[26px]',
            'border border-border',
          )}
          style={{
            height: `${BENCH_HEIGHT_PCT}%`,
            background:
              'linear-gradient(180deg, color-mix(in oklch, var(--color-pitch-turf-deep) 14%, var(--color-surface-sunken)) 0%, var(--color-surface-sunken) 100%)',
          }}
        >
          <span
            className={cn(
              'pointer-events-none absolute left-3 top-1.5 text-[9.5px] font-semibold uppercase',
              'tracking-[0.12em] text-text-faint sm:left-4',
            )}
          >
            Bench
          </span>
        </div>
      ) : null}

      {/* ---------------------------------------------------- slot overlay -- */}
      <PitchContext.Provider value={{ showBench, counts }}>
        <div className="pointer-events-none absolute inset-0">{children}</div>
      </PitchContext.Provider>
    </div>
  );
}

/* --------------------------------------------------------------- PitchSlot -- */

export type PitchSlotProps = {
  /** 0 = goalkeeper, 1 = defence, 2 = midfield, 3 = attack, 4 = bench. */
  row: number;
  /** 0-based index within the row, left to right. */
  col: number;
  /** Tokens in this row. Inferred from the pitch's formation when omitted. */
  of?: number;
  children?: ReactNode;
  className?: string;
};

/**
 * Positions one token on the pitch. Widths shrink with the row's occupancy
 * (measured against the pitch's own inline size, not the viewport), so six
 * across on a phone still leaves a comfortable tap target for each.
 */
export function PitchSlot({ row, col, of, children, className }: PitchSlotProps) {
  const { showBench, counts } = useContext(PitchContext);
  const occupancy = of ?? counts[row] ?? 1;

  const isBench = row === ROW_BENCH;
  const xPct = isBench ? ((col + 0.5) / occupancy) * 100 : slotX(col, occupancy);
  const yPct = isBench
    ? 100 - BENCH_HEIGHT_PCT / 2
    : slotY(row) * (showBench ? BOARD_FRACTION : 1);

  const spread = isBench ? 100 / occupancy : Math.min(26, 88 / occupancy);
  const width = `clamp(44px, ${(spread * 0.94).toFixed(2)}cqi, 116px)`;

  return (
    <div
      className={cn(
        'pointer-events-auto absolute flex -translate-x-1/2 -translate-y-1/2 justify-center',
        className,
      )}
      style={{ left: `${xPct}%`, top: `${yPct}%`, width }}
    >
      {children}
    </div>
  );
}
