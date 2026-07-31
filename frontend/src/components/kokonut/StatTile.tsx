import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/cn';
import { NO_DATA } from '@/lib/format';
import { AnimatedNumber } from './AnimatedNumber';

export type StatTileProps = {
  label: string;
  /** `null` renders the explicit no-data state instead of a plausible zero. */
  value: number | null;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  /** Signed change; sign drives the arrow icon as well as the colour. */
  delta?: number | null;
  deltaSuffix?: string;
  /** For metrics where lower is better (price, xGC). */
  invertDelta?: boolean;
  hint?: string;
  /** A `Sparkline` (or any small mark) rendered under the value. */
  sparkline?: ReactNode;
  icon?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  /** Skip the counter animation (e.g. inside a dense table). */
  animate?: boolean;
};

const VALUE_SIZE = {
  sm: 'text-[20px]',
  md: 'text-[26px]',
  lg: 'text-[34px]',
} as const;

/**
 * The KPI tile. Delta always ships with an arrow glyph and a sign, so the
 * direction never depends on colour alone.
 */
export function StatTile({
  label,
  value,
  decimals = 1,
  prefix = '',
  suffix = '',
  delta = null,
  deltaSuffix = '',
  invertDelta = false,
  hint,
  sparkline,
  icon,
  size = 'md',
  className,
  animate = true,
}: StatTileProps) {
  const good = delta === null ? null : invertDelta ? delta < 0 : delta > 0;
  const flat = delta !== null && Math.abs(delta) < 1e-9;
  const DeltaIcon = delta === null || flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div
      className={cn(
        'flex min-w-0 flex-col justify-between gap-2 rounded-[22px] border border-border bg-surface p-4',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-text-muted">
          {label}
        </p>
        {icon ? (
          <span aria-hidden className="shrink-0 text-text-faint">
            {icon}
          </span>
        ) : null}
      </div>

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className={cn('font-display font-semibold leading-none text-text', VALUE_SIZE[size])}>
            {value === null ? (
              <span className="text-text-faint">{NO_DATA}</span>
            ) : animate ? (
              <AnimatedNumber
                value={value}
                decimals={decimals}
                prefix={prefix}
                suffix={suffix}
              />
            ) : (
              <span className="num">{`${prefix}${value.toFixed(decimals)}${suffix}`}</span>
            )}
          </p>
          {delta !== null ? (
            <p
              className={cn(
                'mt-1.5 inline-flex items-center gap-1 text-[12.5px] font-medium',
                flat
                  ? 'text-text-muted'
                  : good
                    ? 'text-[color:var(--color-delta-up)]'
                    : 'text-[color:var(--color-delta-down)]',
              )}
            >
              <DeltaIcon size={13} aria-hidden />
              <span className="num">
                {flat ? '0' : `${delta > 0 ? '+' : '−'}${Math.abs(delta).toFixed(decimals)}`}
                {deltaSuffix}
              </span>
            </p>
          ) : null}
          {hint ? <p className="mt-1 text-[11.5px] text-text-faint">{hint}</p> : null}
        </div>
        {sparkline ? <div className="w-[92px] shrink-0">{sparkline}</div> : null}
      </div>
    </div>
  );
}
