import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { money, NO_DATA, priceDelta } from '@/lib/format';

export type PriceTagSize = 'xs' | 'sm' | 'md';

export type PriceTagProps = {
  /** `player.price` in £m as a float. `null` renders the no-data marker. */
  price: number | null | undefined;
  /** `player.price_change_start`; shown as a signed rise/fall when non-zero. */
  delta?: number | null;
  size?: PriceTagSize;
  /** Draw a chip around the value rather than bare text. */
  chip?: boolean;
  className?: string;
};

const SIZE: Record<PriceTagSize, string> = {
  xs: 'text-[10.5px] gap-1',
  sm: 'text-[12px] gap-1',
  md: 'text-[13.5px] gap-1.5',
};

const CHIP: Record<PriceTagSize, string> = {
  xs: 'h-[18px] px-1.5',
  sm: 'h-[22px] px-2',
  md: 'h-[26px] px-2.5',
};

const ICON: Record<PriceTagSize, number> = { xs: 10, sm: 11, md: 12 };

/**
 * Price, and optionally the season-to-date price change. The delta always
 * carries an arrow glyph and a sign so the direction survives greyscale.
 */
export function PriceTag({ price, delta = null, size = 'sm', chip = false, className }: PriceTagProps) {
  const hasDelta = delta !== null && delta !== undefined && !Number.isNaN(delta);
  const flat = hasDelta && Math.abs(delta) < 0.05;
  const up = hasDelta && delta > 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={cn(
        'num inline-flex items-center font-semibold leading-none text-text',
        SIZE[size],
        chip && cn('rounded-[999px] bg-surface-sunken ring-1 ring-inset ring-border', CHIP[size]),
        className,
      )}
    >
      <span>{price === null || price === undefined ? NO_DATA : money(price)}</span>
      {hasDelta && !flat ? (
        <span
          className={cn(
            'inline-flex items-center gap-0.5 font-medium',
            up
              ? 'text-[color:var(--color-delta-up)]'
              : 'text-[color:var(--color-delta-down)]',
          )}
          title={`Price change this season: ${priceDelta(delta)}`}
        >
          <Icon size={ICON[size]} aria-hidden />
          {priceDelta(delta)}
        </span>
      ) : null}
    </span>
  );
}
