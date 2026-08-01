import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
  /** Accessible name when `label` is only an icon. */
  ariaLabel?: string;
};

export type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  ariaLabel: string;
  block?: boolean;
};

const SIZE = {
  xs: 'h-7 text-[11px]',
  sm: 'h-8 text-[12px]',
  md: 'h-10 text-[13px]',
} as const;

/**
 * A radiogroup that looks like a pill track. Arrow keys move between segments.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = 'sm',
  className,
  ariaLabel,
  block = false,
}: SegmentedControlProps<T>) {
  const layoutId = useId();
  const reduced = useReducedMotion();

  const shift = (delta: number) => {
    const enabled = options.filter((o) => !o.disabled);
    const idx = enabled.findIndex((o) => o.value === value);
    const next = enabled[(idx + delta + enabled.length) % enabled.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
          event.preventDefault();
          shift(1);
        } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
          event.preventDefault();
          shift(-1);
        }
      }}
      className={cn(
        'inline-flex min-w-0 items-center gap-0.5 rounded-[999px] border border-border bg-surface-sunken p-[3px]',
        block && 'flex w-full',
        className,
      )}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.ariaLabel}
            disabled={option.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative inline-flex flex-1 items-center justify-center gap-1.5 rounded-[999px] px-3 font-medium transition-colors duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
              'disabled:pointer-events-none disabled:opacity-40',
              SIZE[size],
              selected ? 'text-text' : 'text-text-muted hover:text-text',
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`seg-${layoutId}`}
                aria-hidden
                className="absolute inset-0 -z-10 rounded-[999px] bg-surface-raised shadow-soft"
                transition={
                  reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 38 }
                }
              />
            ) : null}
            {option.icon ? (
              <span className="shrink-0" aria-hidden>
                {option.icon}
              </span>
            ) : null}
            <span className="whitespace-nowrap">{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
