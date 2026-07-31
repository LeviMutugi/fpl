import { useId } from 'react';
import { cn } from '@/lib/cn';

export type PatternProps = {
  className?: string;
  /** Cell size in px. */
  size?: number;
  /** Token name for the pattern ink. */
  token?: string;
  opacity?: number;
};

/**
 * Decorative dotted background. Absolutely positioned by default so it can be
 * dropped into any `relative isolate` container as a `-z-10` layer.
 */
export function DotPattern({
  className,
  size = 18,
  token = 'color-border-strong',
  opacity = 0.6,
}: PatternProps) {
  const id = useId();
  return (
    <svg
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
      style={{ opacity }}
    >
      <defs>
        <pattern id={`dots-${id}`} width={size} height={size} patternUnits="userSpaceOnUse">
          <circle cx={1.4} cy={1.4} r={1.2} fill={`var(--${token})`} />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#dots-${id})`} />
    </svg>
  );
}

/** Decorative hairline grid background. */
export function GridPattern({
  className,
  size = 32,
  token = 'color-border',
  opacity = 0.8,
}: PatternProps) {
  const id = useId();
  return (
    <svg
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 h-full w-full', className)}
      style={{ opacity }}
    >
      <defs>
        <pattern id={`grid-${id}`} width={size} height={size} patternUnits="userSpaceOnUse">
          <path
            d={`M ${size} 0 L 0 0 0 ${size}`}
            fill="none"
            stroke={`var(--${token})`}
            strokeWidth={1}
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill={`url(#grid-${id})`} />
    </svg>
  );
}

/**
 * The 45°/135° hand-drawn-ish line fill used as the accessibility texture
 * channel on charts (CVD, print, forced-colors). Never on by default.
 */
export function LinesPattern({
  id,
  angle = 45,
  token = 'color-text',
  spacing = 6,
  strokeWidth = 1.4,
}: {
  id: string;
  angle?: 45 | 135;
  token?: string;
  spacing?: number;
  strokeWidth?: number;
}) {
  return (
    <pattern
      id={id}
      width={spacing}
      height={spacing}
      patternUnits="userSpaceOnUse"
      patternTransform={`rotate(${angle})`}
    >
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={spacing}
        stroke={`var(--${token})`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    </pattern>
  );
}
