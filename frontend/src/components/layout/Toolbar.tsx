import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ToolbarProps = {
  /** Filters and controls, left-aligned. */
  children?: ReactNode;
  /** Pinned to the right — result counts, view switches, exports. */
  end?: ReactNode;
  /** A label or summary rendered before the controls. */
  start?: ReactNode;
  /** Stick beneath the shell's top bar while the results scroll. */
  sticky?: boolean;
  /** Sticky offset in px; the shell's top bar is 64px tall. */
  stickyTop?: number;
  /** Flat strip instead of a raised card. */
  tone?: 'card' | 'bare';
  className?: string;
  ariaLabel?: string;
};

/**
 * The shell for a filter bar. It owns no filter state — pages drop `Select`,
 * `SegmentedControl`, `RangeSlider` and friends inside it.
 *
 * Controls wrap onto new lines rather than compressing, so a phone gets a
 * two-row toolbar instead of six unreadable stubs.
 */
export function Toolbar({
  children,
  end,
  start,
  sticky = false,
  stickyTop = 64,
  tone = 'card',
  className,
  ariaLabel = 'Filters',
}: ToolbarProps) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(
        'flex min-w-0 flex-wrap items-center gap-2 sm:gap-3',
        tone === 'card'
          ? 'rounded-[22px] border border-border bg-surface p-2.5 shadow-soft sm:p-3'
          : 'py-1',
        sticky && 'sticky z-20 backdrop-blur-xl',
        sticky && tone === 'card' && 'bg-surface/88',
        className,
      )}
      style={sticky ? { top: stickyTop } : undefined}
    >
      {start ? <div className="flex min-w-0 items-center gap-2">{start}</div> : null}
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-2.5">{children}</div>
      {end ? <div className="flex shrink-0 flex-wrap items-center gap-2">{end}</div> : null}
    </div>
  );
}

export type ToolbarGroupProps = {
  label?: string;
  children: ReactNode;
  className?: string;
};

/** A labelled cluster inside a `Toolbar` — keeps related controls together. */
export function ToolbarGroup({ label, children, className }: ToolbarGroupProps) {
  return (
    <div className={cn('flex min-w-0 items-center gap-2', className)}>
      {label ? (
        <span className="shrink-0 text-[11.5px] font-medium uppercase tracking-[0.05em] text-text-faint">
          {label}
        </span>
      ) : null}
      {children}
    </div>
  );
}

/** A thin vertical rule between toolbar clusters. */
export function ToolbarDivider({ className }: { className?: string }) {
  return <span aria-hidden className={cn('hidden h-6 w-px shrink-0 bg-border sm:block', className)} />;
}
