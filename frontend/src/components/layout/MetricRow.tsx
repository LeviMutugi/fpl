import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { StatTile, type StatTileProps } from '@/components/kokonut/StatTile';
import { Skeleton } from '@/components/ui/Skeleton';

export type MetricRowItem = StatTileProps & { id?: string };

export type MetricRowProps = {
  /** Tiles to render. Ignored when `children` is supplied. */
  items?: readonly MetricRowItem[];
  /** Arbitrary tiles instead of `items` — same grid, your own contents. */
  children?: ReactNode;
  /** Columns at the widest breakpoint; narrower screens step down. */
  columns?: 2 | 3 | 4 | 5 | 6;
  /** Show placeholder tiles instead of values. */
  loading?: boolean;
  /** How many placeholders to draw while loading. */
  loadingCount?: number;
  className?: string;
};

const COLUMNS: Record<NonNullable<MetricRowProps['columns']>, string> = {
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 lg:grid-cols-4',
  5: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-5',
  6: 'grid-cols-2 md:grid-cols-3 xl:grid-cols-6',
};

/**
 * A responsive band of KPI tiles.
 *
 * Two across on a phone, stepping up with the viewport — the tiles never
 * shrink below a legible width, and the row never scrolls sideways.
 */
export function MetricRow({
  items,
  children,
  columns = 4,
  loading = false,
  loadingCount,
  className,
}: MetricRowProps) {
  const grid = cn('grid min-w-0 gap-3 sm:gap-4', COLUMNS[columns], className);

  if (loading) {
    const count = loadingCount ?? items?.length ?? columns;
    return (
      <div className={grid} aria-busy="true">
        {Array.from({ length: count }, (_, index) => (
          <Skeleton key={index} height={104} className="rounded-[22px]" />
        ))}
      </div>
    );
  }

  return (
    <div className={grid}>
      {children ??
        items?.map((item, index) => {
          const { id, ...tile } = item;
          return <StatTile key={id ?? `${item.label}-${index}`} {...tile} />;
        })}
    </div>
  );
}
