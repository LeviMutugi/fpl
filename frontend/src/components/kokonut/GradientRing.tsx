import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type GradientRingProps = {
  children?: ReactNode;
  /** Fraction of the ring to fill, 0..1. `null` shows the empty track. */
  progress?: number | null;
  size?: number;
  thickness?: number;
  /** Token names for the sweep, first -> last. */
  tokens?: readonly string[];
  label?: string;
  className?: string;
};

/**
 * A circular gradient ring — used as a decorative frame around avatars and as
 * a compact completion indicator. The value, when present, is exposed through
 * `role="img"` + `aria-label`.
 */
export function GradientRing({
  children,
  progress = 1,
  size = 72,
  thickness = 4,
  tokens = ['color-pitch-turf', 'color-accent'],
  label,
  className,
}: GradientRingProps) {
  const stops = tokens.map((t) => `var(--${t})`).join(', ');
  const fraction = progress === null ? 0 : Math.max(0, Math.min(1, progress));
  const sweep = `${fraction * 360}deg`;

  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      className={cn('relative grid shrink-0 place-items-center', className)}
      style={{ width: size, height: size }}
    >
      <div
        aria-hidden
        className="absolute inset-0 rounded-full"
        style={{
          background:
            progress === null
              ? 'var(--color-border)'
              : `conic-gradient(from -90deg, ${stops} ${sweep}, var(--color-border) ${sweep})`,
          mask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), black calc(100% - ${thickness}px))`,
          WebkitMask: `radial-gradient(farthest-side, transparent calc(100% - ${thickness}px), black calc(100% - ${thickness}px))`,
        }}
      />
      <div
        className="grid place-items-center overflow-hidden rounded-full"
        style={{ width: size - thickness * 2 - 4, height: size - thickness * 2 - 4 }}
      >
        {children}
      </div>
    </div>
  );
}
