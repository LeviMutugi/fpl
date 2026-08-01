import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ProgressProps = {
  /** Current value; `null` renders the explicit no-data track. */
  value: number | null;
  min?: number;
  max?: number;
  label: string;
  hideLabel?: boolean;
  valueLabel?: ReactNode;
  size?: 'xs' | 'sm' | 'md';
  /** Token name for the fill, e.g. `color-accent`, `color-pos-mid`. */
  fillToken?: string;
  className?: string;
};

const HEIGHT = { xs: 'h-1.5', sm: 'h-2.5', md: 'h-3.5' } as const;

export function Progress({
  value,
  min = 0,
  max = 100,
  label,
  hideLabel = false,
  valueLabel,
  size = 'sm',
  fillToken = 'color-accent',
  className,
}: ProgressProps) {
  const span = max - min || 1;
  const ratio = value === null ? 0 : Math.max(0, Math.min(1, (value - min) / span));

  return (
    <div className={cn('min-w-0', className)}>
      {hideLabel && valueLabel === undefined ? null : (
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          {hideLabel ? <span /> : <span className="text-[12.5px] text-text-muted">{label}</span>}
          {valueLabel !== undefined ? (
            <span className="num text-[12.5px] font-semibold text-text">{valueLabel}</span>
          ) : null}
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value ?? undefined}
        aria-valuetext={value === null ? 'No data' : undefined}
        className={cn(
          'w-full overflow-hidden rounded-[999px] bg-surface-sunken ring-1 ring-inset ring-border',
          HEIGHT[size],
        )}
      >
        {value === null ? (
          <div
            aria-hidden
            className="h-full w-full opacity-40"
            style={{
              backgroundImage:
                'repeating-linear-gradient(135deg, var(--color-border-strong) 0 4px, transparent 4px 8px)',
            }}
          />
        ) : (
          <div
            aria-hidden
            className="h-full rounded-[999px] transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
            style={{ width: `${ratio * 100}%`, background: `var(--${fillToken})` }}
          />
        )}
      </div>
    </div>
  );
}

export type MeterSegment = {
  label: string;
  value: number;
  /** Token name for this segment's fill. */
  token: string;
};

export type MeterProps = {
  segments: MeterSegment[];
  label: string;
  total?: number;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
  /** Show the legend row under the bar. */
  legend?: boolean;
};

/**
 * A single stacked bar — e.g. xP decomposition in a compact row. Adjacent
 * fills get a 2px surface gap so they never bleed into each other.
 */
export function Meter({
  segments,
  label,
  total,
  size = 'sm',
  className,
  legend = false,
}: MeterProps) {
  const sum = total ?? segments.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const denom = sum || 1;

  return (
    <div className={cn('min-w-0', className)}>
      <div
        role="img"
        aria-label={`${label}: ${segments.map((s) => `${s.label} ${s.value}`).join(', ')}`}
        className={cn(
          'flex w-full overflow-hidden rounded-[999px] bg-surface-sunken ring-1 ring-inset ring-border',
          HEIGHT[size],
        )}
      >
        {segments.map((segment, index) => {
          const width = (Math.max(0, segment.value) / denom) * 100;
          if (width <= 0) return null;
          return (
            <div
              key={segment.label}
              className="h-full first:rounded-l-[999px] last:rounded-r-[999px]"
              style={{
                width: `${width}%`,
                background: `var(--${segment.token})`,
                marginLeft: index === 0 ? 0 : 2,
              }}
            />
          );
        })}
      </div>
      {legend ? (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {segments.map((segment) => (
            <li key={segment.label} className="flex items-center gap-1.5 text-[11.5px] text-text-muted">
              <span
                aria-hidden
                className="h-2 w-2 rounded-full"
                style={{ background: `var(--${segment.token})` }}
              />
              <span>{segment.label}</span>
              <span className="num font-semibold text-text">{segment.value.toFixed(1)}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
