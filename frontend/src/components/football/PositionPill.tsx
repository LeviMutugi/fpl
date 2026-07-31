import { cn } from '@/lib/cn';
import { positionColor, positionInk, positionSoft } from '@/lib/tokens';
import type { Position } from '@/types/api';

export type PositionPillVariant = 'soft' | 'solid' | 'outline' | 'dot';
export type PositionPillSize = 'xs' | 'sm' | 'md';

export type PositionPillProps = {
  position: Position;
  size?: PositionPillSize;
  variant?: PositionPillVariant;
  /** Override the visible text (defaults to the three-letter code). */
  label?: string;
  className?: string;
};

const SIZE: Record<PositionPillSize, string> = {
  xs: 'h-[18px] min-w-[32px] px-1.5 text-[9.5px] tracking-[0.06em]',
  sm: 'h-[22px] min-w-[38px] px-2 text-[11px] tracking-[0.05em]',
  md: 'h-[26px] min-w-[44px] px-2.5 text-[12px] tracking-[0.04em]',
};

const DOT_SIZE: Record<PositionPillSize, string> = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2.5 w-2.5',
};

/**
 * Position, always spelled out. Colour is the secondary channel: the pill
 * carries `GKP`/`DEF`/`MID`/`FWD` as text in every variant, so nothing depends
 * on hue alone.
 *
 * The `solid` variant is for use on the pitch, where a soft fill would vanish
 * into the turf.
 */
export function PositionPill({
  position,
  size = 'sm',
  variant = 'soft',
  label,
  className,
}: PositionPillProps) {
  const fill = positionColor(position);
  const ink = positionInk(position);
  const soft = positionSoft(position);

  const style =
    variant === 'solid'
      ? {
          background: fill,
          color: 'var(--color-surface)',
          boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--color-pitch-shadow) 18%, transparent)',
        }
      : variant === 'outline'
        ? { color: ink, boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${fill} 55%, transparent)` }
        : { background: soft, color: ink };

  if (variant === 'dot') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 leading-none', className)}>
        <span
          aria-hidden
          className={cn('shrink-0 rounded-full', DOT_SIZE[size])}
          style={{ background: fill }}
        />
        <span className="text-[11.5px] font-semibold uppercase tracking-[0.04em] text-text-muted">
          {label ?? position}
        </span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center rounded-[999px] font-semibold uppercase leading-none',
        SIZE[size],
        className,
      )}
      style={style}
    >
      {label ?? position}
    </span>
  );
}
