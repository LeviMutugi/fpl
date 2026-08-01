import { motion } from 'motion/react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { useTheme } from '@/providers/ThemeProvider';
import type { ThemeMode } from '@/lib/theme';

const MODES: { value: ThemeMode; label: string; Icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: Moon },
  { value: 'system', label: 'System', Icon: Monitor },
];

export type ThemeToggleProps = {
  /** `switch` is the compact curvy two-state control; `segmented` shows all three modes. */
  variant?: 'switch' | 'segmented';
  className?: string;
};

/**
 * The curvy theme control. In `switch` form it is a pill whose knob springs
 * between sun and moon; long-press-free, one click, plus a right-click-free
 * `System` option available in the `segmented` form.
 */
export function ThemeToggle({ variant = 'switch', className }: ThemeToggleProps) {
  const { mode, resolved, setMode, toggle } = useTheme();
  const reduced = useReducedMotion();

  if (variant === 'segmented') {
    return (
      <div
        role="radiogroup"
        aria-label="Colour theme"
        className={cn(
          'inline-flex items-center gap-0.5 rounded-[999px] border border-border bg-surface-sunken p-[3px]',
          className,
        )}
      >
        {MODES.map(({ value, label, Icon }) => {
          const selected = mode === value;
          return (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              onClick={() => setMode(value)}
              className={cn(
                'relative grid h-7 w-8 place-items-center rounded-[999px] transition-colors',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
                selected ? 'text-text' : 'text-text-faint hover:text-text',
              )}
            >
              {selected ? (
                <motion.span
                  layoutId="theme-seg"
                  aria-hidden
                  className="absolute inset-0 -z-10 rounded-[999px] bg-surface-raised shadow-soft"
                  transition={
                    reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 36 }
                  }
                />
              ) : null}
              <Icon size={14} aria-hidden />
            </button>
          );
        })}
      </div>
    );
  }

  const dark = resolved === 'dark';

  return (
    <button
      type="button"
      role="switch"
      aria-checked={dark}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} theme`}
      onClick={toggle}
      className={cn(
        'group relative inline-flex h-8 w-[58px] shrink-0 items-center rounded-[999px] border p-[3px]',
        'transition-colors duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
        dark
          ? 'border-transparent bg-[color:var(--color-pitch-turf-deep)]'
          : 'border-border bg-[color:var(--color-accent-soft)]',
        className,
      )}
    >
      {/* Track glyphs sit behind the knob so both states are legible. */}
      <span aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-between px-[7px]">
        <Sun
          size={13}
          className={cn('transition-opacity', dark ? 'opacity-35 text-[color:var(--color-pitch-line)]' : 'opacity-0')}
        />
        <Moon
          size={13}
          className={cn('transition-opacity', dark ? 'opacity-0' : 'opacity-40 text-accent-ink')}
        />
      </span>
      <motion.span
        aria-hidden
        className="relative grid h-[26px] w-[26px] place-items-center rounded-[999px] bg-surface-raised shadow-lift"
        animate={{ x: dark ? 26 : 0, rotate: reduced ? 0 : dark ? 0 : -20 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 620, damping: 30 }}
      >
        {dark ? (
          <Moon size={13} className="text-[color:var(--color-pitch-turf)]" />
        ) : (
          <Sun size={13} className="text-[color:var(--color-warning)]" />
        )}
      </motion.span>
    </button>
  );
}
