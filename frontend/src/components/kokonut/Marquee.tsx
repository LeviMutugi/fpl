import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type MarqueeProps = {
  children: ReactNode;
  /** Seconds for one full pass. */
  speed?: number;
  reverse?: boolean;
  /** Fade the leading/trailing edges into the surface. */
  fade?: boolean;
  pauseOnHover?: boolean;
  gap?: number;
  className?: string;
  ariaLabel?: string;
};

/**
 * Infinite horizontal ticker (two copies of the content, translated). Under
 * reduced motion it becomes an ordinary horizontally scrollable row.
 */
export function Marquee({
  children,
  speed = 26,
  reverse = false,
  fade = true,
  pauseOnHover = true,
  gap = 16,
  className,
  ariaLabel,
}: MarqueeProps) {
  const reduced = useReducedMotion();

  if (reduced) {
    return (
      <div
        role="group"
        aria-label={ariaLabel}
        className={cn('flex items-center overflow-x-auto scrollbar-slim', className)}
        style={{ gap }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('group relative flex overflow-hidden', className)}
      style={
        fade
          ? {
              maskImage:
                'linear-gradient(90deg, transparent, black 6%, black 94%, transparent)',
              WebkitMaskImage:
                'linear-gradient(90deg, transparent, black 6%, black 94%, transparent)',
            }
          : undefined
      }
    >
      <style>{`@keyframes fpl-marquee{from{transform:translateX(0)}to{transform:translateX(calc(-100% - var(--fpl-marquee-gap)))}}`}</style>
      {[0, 1].map((copy) => (
        <div
          key={copy}
          aria-hidden={copy === 1}
          className={cn(
            'flex shrink-0 items-center',
            pauseOnHover && 'group-hover:[animation-play-state:paused]',
          )}
          style={{
            gap,
            paddingRight: gap,
            ['--fpl-marquee-gap' as string]: `${gap}px`,
            animation: `fpl-marquee ${speed}s linear infinite`,
            animationDirection: reverse ? 'reverse' : 'normal',
          }}
        >
          {children}
        </div>
      ))}
    </div>
  );
}
