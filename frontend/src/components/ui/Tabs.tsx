import { useCallback, useId, useRef, type ReactNode } from 'react';
import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type TabItem<T extends string = string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  count?: number;
  disabled?: boolean;
};

export type TabsProps<T extends string = string> = {
  items: readonly TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `underline` for page-level sections, `pill` for inline filters. */
  variant?: 'underline' | 'pill';
  size?: 'sm' | 'md';
  className?: string;
  ariaLabel?: string;
};

/**
 * Roving-tabindex tablist. Left/Right/Home/End move focus and selection; the
 * active indicator is a shared `layoutId` so it slides between tabs (and simply
 * jumps when the user prefers reduced motion).
 */
export function Tabs<T extends string = string>({
  items,
  value,
  onChange,
  variant = 'underline',
  size = 'md',
  className,
  ariaLabel = 'Sections',
}: TabsProps<T>) {
  const layoutId = useId();
  const reduced = useReducedMotion();
  const listRef = useRef<HTMLDivElement | null>(null);

  const move = useCallback(
    (delta: number) => {
      const enabled = items.filter((i) => !i.disabled);
      if (enabled.length === 0) return;
      const current = enabled.findIndex((i) => i.value === value);
      const nextIndex = (current + delta + enabled.length) % enabled.length;
      const next = enabled[nextIndex];
      if (!next) return;
      onChange(next.value);
      listRef.current
        ?.querySelector<HTMLButtonElement>(`[data-tab-value="${next.value}"]`)
        ?.focus();
    },
    [items, onChange, value],
  );

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      const first = items.find((i) => !i.disabled);
      if (first) onChange(first.value);
    } else if (event.key === 'End') {
      event.preventDefault();
      const last = [...items].reverse().find((i) => !i.disabled);
      if (last) onChange(last.value);
    }
  };

  const pillShell =
    variant === 'pill'
      ? 'gap-1 rounded-[999px] border border-border bg-surface-sunken p-1'
      : 'gap-1 border-b border-border';

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('relative flex min-w-0 items-center overflow-x-auto scrollbar-slim', pillShell, className)}
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            type="button"
            data-tab-value={item.value}
            aria-selected={selected}
            disabled={item.disabled}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(item.value)}
            className={cn(
              'relative inline-flex shrink-0 items-center gap-2 font-medium transition-colors duration-200',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
              'disabled:pointer-events-none disabled:opacity-40',
              size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-[14px]',
              variant === 'pill' ? 'rounded-[999px]' : 'rounded-t-[14px]',
              selected ? 'text-text' : 'text-text-muted hover:text-text',
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`tabs-${layoutId}`}
                aria-hidden
                className={cn(
                  'absolute inset-0 -z-10',
                  variant === 'pill'
                    ? 'rounded-[999px] bg-surface-raised shadow-soft'
                    : 'rounded-t-[14px] bg-surface-sunken',
                )}
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 480, damping: 38, mass: 0.7 }
                }
              />
            ) : null}
            {item.icon ? (
              <span className="shrink-0" aria-hidden>
                {item.icon}
              </span>
            ) : null}
            <span className="whitespace-nowrap">{item.label}</span>
            {item.count !== undefined ? (
              <span className="num rounded-[999px] bg-surface-sunken px-1.5 py-0.5 text-[11px] text-text-muted">
                {item.count}
              </span>
            ) : null}
            {variant === 'underline' && selected ? (
              <motion.span
                layoutId={`tabs-underline-${layoutId}`}
                aria-hidden
                className="absolute inset-x-2 -bottom-px h-[2.5px] rounded-[999px] bg-accent"
                transition={
                  reduced
                    ? { duration: 0 }
                    : { type: 'spring', stiffness: 520, damping: 40, mass: 0.6 }
                }
              />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export type TabPanelProps = {
  value: string;
  active: string;
  children: ReactNode;
  className?: string;
};

export function TabPanel({ value, active, children, className }: TabPanelProps) {
  if (value !== active) return null;
  return (
    <div role="tabpanel" className={cn('min-w-0 outline-none', className)} tabIndex={-1}>
      {children}
    </div>
  );
}
