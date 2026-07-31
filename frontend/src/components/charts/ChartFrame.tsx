import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';
import { ChartLegend, type LegendEntry } from './ChartLegend';

export type ChartFrameProps = {
  title?: ReactNode;
  subtitle?: ReactNode;
  /** Two or more series must always ship a legend. */
  legend?: readonly LegendEntry[];
  legendPosition?: 'top' | 'bottom';
  activeLegendId?: string | null;
  onLegendHover?: (id: string | null) => void;
  actions?: ReactNode;
  /** Right-hand note, e.g. the source or the run id. */
  footnote?: ReactNode;
  height?: number;
  loading?: boolean;
  /** `true` renders the empty state instead of the plot. */
  empty?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  error?: { title: string; detail?: string | null; hint?: string | null } | null;
  onRetry?: () => void;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
};

/**
 * The chrome every chart sits in: title, subtitle, legend, and the three
 * non-happy states (loading / empty / error). It never renders axes itself.
 */
export function ChartFrame({
  title,
  subtitle,
  legend,
  legendPosition = 'top',
  activeLegendId = null,
  onLegendHover,
  actions,
  footnote,
  height = 220,
  loading = false,
  empty = false,
  emptyTitle = 'No data for this selection',
  emptyDescription,
  error = null,
  onRetry,
  className,
  bodyClassName,
  children,
}: ChartFrameProps) {
  const legendNode =
    legend && legend.length > 1 ? (
      <ChartLegend
        entries={legend}
        activeId={activeLegendId}
        {...(onLegendHover ? { onHover: onLegendHover } : {})}
      />
    ) : null;

  return (
    <figure className={cn('min-w-0', className)}>
      {title || subtitle || actions || (legendNode && legendPosition === 'top') ? (
        <figcaption className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            {title ? (
              <h4 className="font-display text-[14px] font-semibold leading-tight text-text">
                {title}
              </h4>
            ) : null}
            {subtitle ? (
              <p className="mt-0.5 text-[12.5px] leading-snug text-text-muted">{subtitle}</p>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-3">
            {legendPosition === 'top' ? legendNode : null}
            {actions}
          </div>
        </figcaption>
      ) : null}

      <div className={cn('relative min-w-0', bodyClassName)} style={{ height }}>
        {loading ? (
          <div className="flex h-full flex-col justify-end gap-2">
            <Skeleton height="100%" className="rounded-[18px]" />
          </div>
        ) : error ? (
          <ErrorState
            size="sm"
            title={error.title}
            detail={error.detail ?? null}
            hint={error.hint ?? null}
            {...(onRetry ? { onRetry } : {})}
          />
        ) : empty ? (
          <EmptyState size="sm" title={emptyTitle} description={emptyDescription} className="h-full" />
        ) : (
          children
        )}
      </div>

      {legendNode && legendPosition === 'bottom' ? <div className="mt-3">{legendNode}</div> : null}
      {footnote ? <p className="mt-2 text-[11px] text-text-faint">{footnote}</p> : null}
    </figure>
  );
}
