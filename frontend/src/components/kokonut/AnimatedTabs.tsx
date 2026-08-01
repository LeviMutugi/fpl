import { useId, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type AnimatedTabItem<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
};

export type AnimatedTabsProps<T extends string> = {
  items: readonly AnimatedTabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `pill` slides a filled capsule; `glow` slides a soft accent halo. */
  indicator?: 'pill' | 'glow';
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel: string;
};

/**
 * The expressive sibling of `Tabs` — a shared `layoutId` indicator that springs
 * between items. Same tablist semantics; arrow keys move selection.
 */
export function AnimatedTabs<T extends string>({
  items,
  value,
  onChange,
  indicator = 'pill',
  size = 'md',
  className,
  ariaLabel,
}: AnimatedTabsProps<T>) {
  const layoutId = useId();
  const reduced = useReducedMotion();

  const shift = (delta: number) => {
    const index = items.findIndex((i) => i.value === value);
    const next = items[(index + delta + items.length) % items.length];
    if (next) onChange(next.value);
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={(event) => {
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          shift(1);
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault();
          shift(-1);
        }
      }}
      className={cn(
        'inline-flex min-w-0 items-center gap-1 rounded-[999px] border border-border bg-surface-sunken p-1',
        className,
      )}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative inline-flex items-center gap-1.5 rounded-[999px] font-medium transition-colors duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
              size === 'sm' ? 'h-7 px-3 text-[12.5px]' : 'h-9 px-4 text-[13.5px]',
              selected ? 'text-text' : 'text-text-muted hover:text-text',
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`atabs-${layoutId}`}
                aria-hidden
                className={cn(
                  'absolute inset-0 -z-10 rounded-[999px]',
                  indicator === 'pill'
                    ? 'bg-surface-raised shadow-soft'
                    : 'bg-accent-soft ring-1 ring-inset ring-[color:var(--color-accent)]/30',
                )}
                transition={
                  reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 34 }
                }
              />
            ) : null}
            {item.icon ? (
              <span aria-hidden className="shrink-0">
                {item.icon}
              </span>
            ) : null}
            <span className="whitespace-nowrap">{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
