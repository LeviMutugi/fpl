import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type ShineBorderProps = {
  children: ReactNode;
  /** Token names used in the travelling gradient. */
  tokens?: readonly string[];
  /** Seconds per revolution. */
  duration?: number;
  borderWidth?: number;
  radius?: number;
  className?: string;
  innerClassName?: string;
};

/**
 * A conic-gradient hairline that travels around the border. Falls back to a
 * static gradient hairline under reduced motion.
 */
export function ShineBorder({
  children,
  tokens = ['color-accent', 'color-pitch-turf', 'color-series-5'],
  duration = 8,
  borderWidth = 1.5,
  radius = 28,
  className,
  innerClassName,
}: ShineBorderProps) {
  const reduced = useReducedMotion();
  const stops = tokens.map((t) => `var(--${t})`).join(', ');

  return (
    <div
      className={cn('relative isolate', className)}
      style={{ padding: borderWidth, borderRadius: radius }}
    >
      <style>{`@keyframes fpl-shine{to{--fpl-shine-angle:360deg}}@property --fpl-shine-angle{syntax:'<angle>';initial-value:0deg;inherits:false}`}</style>
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          borderRadius: radius,
          background: reduced
            ? `linear-gradient(135deg, ${stops})`
            : `conic-gradient(from var(--fpl-shine-angle), transparent 0turn, ${stops}, transparent 1turn)`,
          animation: reduced ? undefined : `fpl-shine ${duration}s linear infinite`,
        }}
      />
      <div
        className={cn('h-full w-full bg-surface', innerClassName)}
        style={{ borderRadius: Math.max(0, radius - borderWidth) }}
      >
        {children}
      </div>
    </div>
  );
}
