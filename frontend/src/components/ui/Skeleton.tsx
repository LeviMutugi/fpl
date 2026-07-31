import { cn } from '@/lib/cn';

export type SkeletonProps = {
  className?: string;
  /** Convenience shapes. */
  variant?: 'block' | 'text' | 'circle' | 'pill';
  width?: number | string;
  height?: number | string;
};

const VARIANT = {
  block: 'rounded-[16px]',
  text: 'rounded-[8px] h-3.5',
  circle: 'rounded-full aspect-square',
  pill: 'rounded-[999px] h-6',
} as const;

/**
 * Shimmering placeholder. The shimmer is suppressed under
 * `prefers-reduced-motion` by the global stylesheet.
 */
export function Skeleton({ className, variant = 'block', width, height }: SkeletonProps) {
  return (
    <div
      aria-hidden
      style={{ width, height }}
      className={cn('shimmer bg-surface-sunken', VARIANT[variant], className)}
    />
  );
}

export function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div className={cn('space-y-2', className)} aria-hidden>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          variant="text"
          width={i === lines - 1 ? '62%' : '100%'}
        />
      ))}
    </div>
  );
}

export function SkeletonRows({
  rows = 6,
  className,
  height = 40,
}: {
  rows?: number;
  className?: string;
  height?: number;
}) {
  return (
    <div className={cn('space-y-1.5', className)} aria-hidden>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} height={height} />
      ))}
    </div>
  );
}
