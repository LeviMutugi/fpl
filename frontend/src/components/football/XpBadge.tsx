import { cn } from '@/lib/cn';
import { NO_DATA, num } from '@/lib/format';

export type XpBadgeSize = 'xs' | 'sm' | 'md' | 'lg';
export type XpBadgeTone = 'neutral' | 'accent' | 'pitch' | 'plain';

export type XpBadgeProps = {
  /** Expected points. `null` renders the explicit no-data marker. */
  xp: number | null | undefined;
  /** Leading caption; set to `''` to drop it. */
  label?: string;
  size?: XpBadgeSize;
  tone?: XpBadgeTone;
  decimals?: number;
  /** Extra context for assistive tech, e.g. "over the next 5 gameweeks". */
  ariaSuffix?: string;
  className?: string;
};

const SIZE: Record<XpBadgeSize, string> = {
  xs: 'h-[18px] gap-1 px-1.5 text-[10px]',
  sm: 'h-[22px] gap-1 px-2 text-[11.5px]',
  md: 'h-[26px] gap-1.5 px-2.5 text-[13px]',
  lg: 'h-[32px] gap-2 px-3 text-[15px]',
};

const TONE: Record<XpBadgeTone, string> = {
  neutral: 'bg-surface-sunken text-text ring-1 ring-inset ring-border',
  accent: 'bg-accent-soft text-accent-ink',
  pitch:
    'bg-[color:var(--color-pos-mid-soft)] text-[color:var(--color-pos-mid-ink)]',
  plain: 'bg-transparent text-text',
};

/**
 * The expected-points chip. `xP` is always spelled out next to the number so
 * the figure is never mistaken for actual points scored.
 */
export function XpBadge({
  xp,
  label = 'xP',
  size = 'sm',
  tone = 'neutral',
  decimals = 1,
  ariaSuffix,
  className,
}: XpBadgeProps) {
  const missing = xp === null || xp === undefined || Number.isNaN(xp);
  const text = missing ? NO_DATA : num(xp, decimals);

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-[999px] font-semibold leading-none whitespace-nowrap',
        SIZE[size],
        TONE[tone],
        className,
      )}
      aria-label={
        missing
          ? `Expected points unavailable${ariaSuffix ? ` ${ariaSuffix}` : ''}`
          : `${text} expected points${ariaSuffix ? ` ${ariaSuffix}` : ''}`
      }
    >
      {label ? (
        <span
          aria-hidden
          className="font-medium uppercase tracking-[0.06em] opacity-70"
          style={{ fontSize: '0.82em' }}
        >
          {label}
        </span>
      ) : null}
      <span aria-hidden className={cn('num', missing && 'text-text-faint')}>
        {text}
      </span>
    </span>
  );
}
