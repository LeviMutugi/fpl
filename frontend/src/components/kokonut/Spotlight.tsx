import { cn } from '@/lib/cn';

export type SpotlightProps = {
  className?: string;
  /** Token name for the light. */
  token?: string;
  /** 0..1 */
  intensity?: number;
  /** Where the cone originates, as CSS percentages. */
  x?: string;
  y?: string;
  size?: number;
};

/**
 * A soft off-screen light source. Purely decorative, so it is `aria-hidden`
 * and never animates — drop it into a `relative isolate overflow-hidden`
 * container as the bottom layer.
 */
export function Spotlight({
  className,
  token = 'color-pitch-rim',
  intensity = 0.14,
  x = '20%',
  y = '-10%',
  size = 620,
}: SpotlightProps) {
  return (
    <div
      aria-hidden
      className={cn('pointer-events-none absolute inset-0 -z-10', className)}
      style={{
        background: `radial-gradient(${size}px circle at ${x} ${y}, color-mix(in oklch, var(--${token}) ${Math.round(
          intensity * 100,
        )}%, transparent), transparent 72%)`,
      }}
    />
  );
}
