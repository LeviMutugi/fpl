import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { useReducedMotion } from '@/lib/useReducedMotion';

export type SwitchProps = {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  /** Hide the visible label but keep it as the accessible name. */
  hideLabel?: boolean;
  description?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function Switch({
  checked,
  onChange,
  label,
  hideLabel = false,
  description,
  size = 'md',
  disabled = false,
  className,
  id,
}: SwitchProps) {
  const reduced = useReducedMotion();
  const track = size === 'sm' ? 'h-5 w-9' : 'h-6 w-11';
  const knob = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';

  const control = (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={hideLabel ? label : undefined}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex shrink-0 items-center rounded-[999px] border p-[2px] transition-colors duration-250',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
        'disabled:pointer-events-none disabled:opacity-45',
        track,
        checked ? 'border-transparent bg-accent' : 'border-border bg-surface-sunken',
      )}
    >
      <motion.span
        aria-hidden
        layout
        className={cn(
          'rounded-[999px] bg-surface-raised shadow-soft',
          knob,
          checked && 'bg-[color:var(--color-accent-contrast)]',
        )}
        animate={{ x: checked ? (size === 'sm' ? 16 : 20) : 0 }}
        transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 700, damping: 34 }}
      />
    </button>
  );

  if (hideLabel) return <span className={className}>{control}</span>;

  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-4 select-none',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      <span className="min-w-0">
        <span className="block text-[14px] font-medium text-text">{label}</span>
        {description ? (
          <span className="mt-0.5 block text-[12.5px] leading-snug text-text-muted">
            {description}
          </span>
        ) : null}
      </span>
      {control}
    </label>
  );
}
