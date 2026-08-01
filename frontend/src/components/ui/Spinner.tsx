import { cn } from '@/lib/cn';

export type SpinnerProps = {
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  label?: string;
};

const SIZE = {
  xs: 'h-3 w-3 border-[1.5px]',
  sm: 'h-4 w-4 border-2',
  md: 'h-5 w-5 border-2',
  lg: 'h-8 w-8 border-[3px]',
} as const;

/**
 * A pure-CSS ring. Under `prefers-reduced-motion` the global stylesheet stops
 * the rotation, so it reads as a static indeterminate ring instead.
 */
export function Spinner({ size = 'md', className, label = 'Loading' }: SpinnerProps) {
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'inline-block shrink-0 rounded-full border-current border-b-transparent border-l-transparent align-[-0.125em]',
        'opacity-70 [animation:fpl-spin_0.7s_linear_infinite]',
        SIZE[size],
        className,
      )}
    />
  );
}
