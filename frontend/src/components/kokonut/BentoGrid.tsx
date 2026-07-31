import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type BentoGridProps = HTMLAttributes<HTMLDivElement> & {
  /** Base column count at the widest breakpoint. */
  columns?: 2 | 3 | 4 | 6;
  gap?: 'sm' | 'md' | 'lg';
};

const COLUMNS = {
  2: 'sm:grid-cols-2',
  3: 'sm:grid-cols-2 lg:grid-cols-3',
  4: 'sm:grid-cols-2 lg:grid-cols-4',
  6: 'sm:grid-cols-3 lg:grid-cols-6',
} as const;

const GAP = { sm: 'gap-2.5', md: 'gap-4', lg: 'gap-5' } as const;

export function BentoGrid({
  columns = 4,
  gap = 'md',
  className,
  children,
  ...rest
}: BentoGridProps) {
  return (
    <div
      className={cn('grid grid-cols-1 auto-rows-[minmax(0,auto)]', COLUMNS[columns], GAP[gap], className)}
      {...rest}
    >
      {children}
    </div>
  );
}

export type BentoItemProps = HTMLAttributes<HTMLDivElement> & {
  colSpan?: 1 | 2 | 3 | 4 | 6;
  rowSpan?: 1 | 2 | 3;
  /** Optional heading rendered inside the tile. */
  title?: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  tone?: 'default' | 'raised' | 'pitch' | 'accent';
  padding?: 'none' | 'sm' | 'md' | 'lg';
};

const COL_SPAN = {
  1: '',
  2: 'sm:col-span-2',
  3: 'sm:col-span-2 lg:col-span-3',
  4: 'sm:col-span-2 lg:col-span-4',
  6: 'sm:col-span-3 lg:col-span-6',
} as const;

const ROW_SPAN = { 1: '', 2: 'row-span-2', 3: 'row-span-3' } as const;

const TONE = {
  default: 'bg-surface border-border',
  raised: 'bg-surface-raised border-border',
  pitch:
    'border-transparent bg-[linear-gradient(150deg,var(--color-pitch-turf-deep),var(--color-pitch-turf))] text-[color:var(--color-pitch-line)]',
  accent: 'border-transparent bg-accent-soft text-accent-ink',
} as const;

const PADDING = { none: '', sm: 'p-3', md: 'p-4 sm:p-5', lg: 'p-5 sm:p-7' } as const;

export function BentoItem({
  colSpan = 1,
  rowSpan = 1,
  title,
  subtitle,
  actions,
  tone = 'default',
  padding = 'md',
  className,
  children,
  ...rest
}: BentoItemProps) {
  return (
    <div
      className={cn(
        'relative isolate flex min-w-0 flex-col overflow-hidden rounded-[28px] border shadow-soft',
        'transition-[transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        COL_SPAN[colSpan],
        ROW_SPAN[rowSpan],
        TONE[tone],
        PADDING[padding],
        className,
      )}
      {...rest}
    >
      {title || actions ? (
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title ? (
              <h3 className="font-display text-[14.5px] font-semibold tracking-[-0.01em]">{title}</h3>
            ) : null}
            {subtitle ? (
              <p
                className={cn(
                  'mt-0.5 text-[12.5px] leading-snug',
                  tone === 'pitch' || tone === 'accent' ? 'opacity-80' : 'text-text-muted',
                )}
              >
                {subtitle}
              </p>
            ) : null}
          </div>
          {actions ? <div className="flex shrink-0 items-center gap-1.5">{actions}</div> : null}
        </div>
      ) : null}
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
