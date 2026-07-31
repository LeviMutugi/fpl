import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import type { Position } from '@/types/api';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'good'
  | 'warning'
  | 'serious'
  | 'critical'
  | 'pitch';

export type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: BadgeTone;
  size?: 'xs' | 'sm' | 'md';
  /** Outline-only rather than a soft fill. */
  outline?: boolean;
  icon?: ReactNode;
  /** Small leading dot — the secondary channel when tone carries meaning. */
  dot?: boolean;
};

const TONE_FILL: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-text-muted border-border',
  accent: 'bg-accent-soft text-accent-ink border-transparent',
  good: 'bg-good-soft text-[color:var(--color-delta-up)] border-transparent',
  warning: 'bg-warning-soft text-[color:var(--color-fdr-4-ink)] border-transparent',
  serious: 'bg-serious-soft text-[color:var(--color-fdr-4-ink)] border-transparent',
  critical: 'bg-critical-soft text-[color:var(--color-fdr-5-ink)] border-transparent',
  pitch: 'bg-[color:var(--color-pos-mid-soft)] text-[color:var(--color-pos-mid-ink)] border-transparent',
};

const TONE_OUTLINE: Record<BadgeTone, string> = {
  neutral: 'bg-transparent text-text-muted border-border',
  accent: 'bg-transparent text-accent border-accent/50',
  good: 'bg-transparent text-[color:var(--color-delta-up)] border-[color:var(--color-good)]/50',
  warning: 'bg-transparent text-[color:var(--color-fdr-4-ink)] border-[color:var(--color-warning)]/60',
  serious: 'bg-transparent text-[color:var(--color-fdr-4-ink)] border-[color:var(--color-serious)]/60',
  critical: 'bg-transparent text-[color:var(--color-delta-down)] border-[color:var(--color-critical)]/50',
  pitch:
    'bg-transparent text-[color:var(--color-pos-mid-ink)] border-[color:var(--color-pos-mid)]/50',
};

const TONE_DOT: Record<BadgeTone, string> = {
  neutral: 'bg-text-faint',
  accent: 'bg-accent',
  good: 'bg-[color:var(--color-good)]',
  warning: 'bg-[color:var(--color-warning)]',
  serious: 'bg-[color:var(--color-serious)]',
  critical: 'bg-[color:var(--color-critical)]',
  pitch: 'bg-[color:var(--color-pos-mid)]',
};

const SIZE = {
  xs: 'h-[18px] gap-1 px-1.5 text-[10px]',
  sm: 'h-[22px] gap-1 px-2 text-[11px]',
  md: 'h-[26px] gap-1.5 px-2.5 text-[12px]',
} as const;

export function Badge({
  tone = 'neutral',
  size = 'sm',
  outline = false,
  icon,
  dot = false,
  className,
  children,
  ...rest
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[999px] border font-medium leading-none tracking-[0.01em] whitespace-nowrap',
        SIZE[size],
        outline ? TONE_OUTLINE[tone] : TONE_FILL[tone],
        className,
      )}
      {...rest}
    >
      {dot ? <span className={cn('h-1.5 w-1.5 rounded-full', TONE_DOT[tone])} aria-hidden /> : null}
      {icon ? (
        <span className="shrink-0" aria-hidden>
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  );
}

/** `Pill` is `Badge` with the fuller padding used for standalone chips. */
export function Pill({ className, size = 'md', ...rest }: BadgeProps) {
  return <Badge size={size} className={cn('px-3', className)} {...rest} />;
}

const POSITION_CLASS: Record<Position, string> = {
  GKP: 'bg-[color:var(--color-pos-gkp-soft)] text-[color:var(--color-pos-gkp-ink)]',
  DEF: 'bg-[color:var(--color-pos-def-soft)] text-[color:var(--color-pos-def-ink)]',
  MID: 'bg-[color:var(--color-pos-mid-soft)] text-[color:var(--color-pos-mid-ink)]',
  FWD: 'bg-[color:var(--color-pos-fwd-soft)] text-[color:var(--color-pos-fwd-ink)]',
};

export type PositionPillProps = {
  position: Position;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
};

/**
 * Position always carries its own three-letter label, so the colour is a
 * reinforcement rather than the only channel.
 */
export function PositionPill({ position, size = 'sm', className }: PositionPillProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-[999px] border border-transparent font-semibold uppercase leading-none tracking-[0.04em]',
        SIZE[size],
        POSITION_CLASS[position],
        className,
      )}
    >
      {position}
    </span>
  );
}
