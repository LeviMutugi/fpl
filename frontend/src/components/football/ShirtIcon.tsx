import { useId } from 'react';
import { cn } from '@/lib/cn';

export type ShirtPattern = 'solid' | 'stripes' | 'hoops' | 'halves' | 'sash' | 'sleeves';

export type ShirtIconProps = {
  /** `team.primary_hex` — a team colour arriving as a prop. */
  primaryHex: string;
  /** `team.secondary_hex`; drives sleeves, trim and the pattern. */
  secondaryHex?: string;
  pattern?: ShirtPattern;
  size?: number;
  className?: string;
  /** Accessible name; omit to render the shirt as decoration. */
  title?: string;
};

const BODY =
  'M50 8 L30 14 L10 24 L4 44 L20 50 L24 42 L24 90 Q50 96 76 90 L76 42 L80 50 L96 44 L90 24 L70 14 L50 8 Z';
const LEFT_SLEEVE = 'M30 14 L10 24 L4 44 L20 50 L26 30 Z';
const RIGHT_SLEEVE = 'M70 14 L90 24 L96 44 L80 50 L74 30 Z';
const COLLAR = 'M38 11 Q50 24 62 11 L58 9.5 Q50 18 42 9.5 Z';

/**
 * A club shirt, tinted by the team's own colours. This is the only component
 * that renders raw hexes, and only ever ones handed to it as props.
 *
 * Used as a lightweight stand-in for a player photo in dense views, and as the
 * club marker in the transfer planner.
 */
export function ShirtIcon({
  primaryHex,
  secondaryHex,
  pattern = 'solid',
  size = 28,
  className,
  title,
}: ShirtIconProps) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const second = secondaryHex ?? primaryHex;

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={cn('shrink-0', className)}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <defs>
        <clipPath id={`shirt-${uid}`}>
          <path d={BODY} />
        </clipPath>
        <linearGradient id={`sheen-${uid}`} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor="color-mix(in oklch, var(--color-pitch-rim) 34%, transparent)" />
          <stop offset="55%" stopColor="transparent" />
          <stop
            offset="100%"
            stopColor="color-mix(in oklch, var(--color-pitch-shadow) 26%, transparent)"
          />
        </linearGradient>
      </defs>

      <path d={BODY} fill={primaryHex} />

      <g clipPath={`url(#shirt-${uid})`}>
        {pattern === 'stripes'
          ? [0, 1, 2, 3].map((i) => (
              <rect key={i} x={16 + i * 18} y="0" width="9" height="100" fill={second} />
            ))
          : null}
        {pattern === 'hoops'
          ? [0, 1, 2, 3].map((i) => (
              <rect key={i} x="0" y={22 + i * 18} width="100" height="9" fill={second} />
            ))
          : null}
        {pattern === 'halves' ? <rect x="50" y="0" width="50" height="100" fill={second} /> : null}
        {pattern === 'sash' ? (
          <path d="M14 100 L74 0 L92 0 L32 100 Z" fill={second} opacity={0.95} />
        ) : null}
        <rect x="0" y="0" width="100" height="100" fill={`url(#sheen-${uid})`} />
      </g>

      {pattern === 'solid' || pattern === 'sleeves' || secondaryHex ? (
        <>
          <path d={LEFT_SLEEVE} fill={second} opacity={pattern === 'solid' ? 0.9 : 1} />
          <path d={RIGHT_SLEEVE} fill={second} opacity={pattern === 'solid' ? 0.9 : 1} />
        </>
      ) : null}

      <path d={COLLAR} fill={second} />
      <path
        d={BODY}
        fill="none"
        stroke="color-mix(in oklch, var(--color-pitch-shadow) 30%, transparent)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}
