import type { CSSProperties, ReactNode, TdHTMLAttributes, ThHTMLAttributes } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export type SortDirection = 'asc' | 'desc';
export type SortState<K extends string = string> = { key: K; direction: SortDirection } | null;

export type TableProps = {
  children: ReactNode;
  className?: string;
  /** Adds `table-layout: fixed`, needed when column widths are pinned. */
  fixed?: boolean;
  dense?: boolean;
  /** Caption is the table's accessible name; visually hidden by default. */
  caption?: string;
  captionVisible?: boolean;
};

/**
 * A presentational table. It intentionally does not own its data: rows are
 * children, so a virtualiser can render a windowed slice inside `TableBody`
 * with spacer rows above and below.
 */
export function Table({
  children,
  className,
  fixed = false,
  dense = false,
  caption,
  captionVisible = false,
}: TableProps) {
  return (
    <table
      data-dense={dense || undefined}
      className={cn(
        'w-full border-separate border-spacing-0 text-[13.5px]',
        fixed && 'table-fixed',
        className,
      )}
    >
      {caption ? (
        <caption
          className={cn(
            'text-left text-[13px] text-text-muted',
            captionVisible ? 'px-4 pb-2' : 'sr-only',
          )}
        >
          {caption}
        </caption>
      ) : null}
      {children}
    </table>
  );
}

/**
 * Wrap a `Table` in this to get the rounded, clipped, scrollable frame with a
 * sticky header. `maxHeight` turns on vertical scrolling.
 */
export function TableFrame({
  children,
  className,
  maxHeight,
  style,
}: {
  children: ReactNode;
  className?: string;
  maxHeight?: number | string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={cn(
        'relative overflow-auto scrollbar-slim rounded-[22px] border border-border bg-surface',
        className,
      )}
      style={{ maxHeight, ...style }}
    >
      {children}
    </div>
  );
}

export function TableHead({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <thead
      className={cn(
        '[&_th]:sticky [&_th]:top-0 [&_th]:z-20 [&_th]:bg-surface-sunken',
        '[&_th]:border-b [&_th]:border-border',
        className,
      )}
    >
      {children}
    </thead>
  );
}

export function TableBody({ children, className }: { children: ReactNode; className?: string }) {
  return <tbody className={cn('[&_tr:last-child_td]:border-b-0', className)}>{children}</tbody>;
}

export type TableRowProps = {
  children: ReactNode;
  className?: string;
  selected?: boolean;
  onClick?: () => void;
  /** Fixed row height — required for windowed rendering. */
  height?: number;
  ariaLabel?: string;
};

export function TableRow({
  children,
  className,
  selected = false,
  onClick,
  height,
  ariaLabel,
}: TableRowProps) {
  const interactive = Boolean(onClick);
  return (
    <tr
      aria-selected={selected || undefined}
      aria-label={ariaLabel}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        interactive
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      style={height ? { height } : undefined}
      className={cn(
        'group transition-colors duration-150',
        interactive && 'cursor-pointer',
        interactive &&
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
        'hover:bg-surface-sunken/70',
        selected && 'bg-accent-soft/60',
        className,
      )}
    >
      {children}
    </tr>
  );
}

export type TableHeaderCellProps<K extends string = string> = ThHTMLAttributes<HTMLTableCellElement> & {
  /** Provide with `sort`/`onSort` to make the header a sort control. */
  sortKey?: K;
  sort?: SortState<K>;
  onSort?: (key: K) => void;
  align?: 'left' | 'right' | 'center';
  /** Pin the column to the left edge while scrolling horizontally. */
  sticky?: boolean;
  width?: number | string;
};

export function TableHeaderCell<K extends string = string>({
  sortKey,
  sort,
  onSort,
  align = 'left',
  sticky = false,
  width,
  className,
  children,
  style,
  ...rest
}: TableHeaderCellProps<K>) {
  const sortable = Boolean(sortKey && onSort);
  const active = Boolean(sortKey && sort && sort.key === sortKey);
  const direction = active ? sort!.direction : undefined;

  return (
    <th
      scope="col"
      aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : sortable ? 'none' : undefined}
      style={{ width, ...style }}
      className={cn(
        'whitespace-nowrap px-3 py-2.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-text-muted',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        sticky && 'left-0 z-30',
        className,
      )}
      {...rest}
    >
      {sortable ? (
        <button
          type="button"
          onClick={() => onSort!(sortKey!)}
          className={cn(
            'inline-flex items-center gap-1 rounded-[8px] transition-colors hover:text-text',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
            active && 'text-text',
            align === 'right' && 'flex-row-reverse',
          )}
        >
          <span>{children}</span>
          {active ? (
            direction === 'asc' ? (
              <ArrowUp size={12} aria-hidden />
            ) : (
              <ArrowDown size={12} aria-hidden />
            )
          ) : (
            <ChevronsUpDown size={12} aria-hidden className="opacity-40" />
          )}
        </button>
      ) : (
        children
      )}
    </th>
  );
}

export type TableCellProps = TdHTMLAttributes<HTMLTableCellElement> & {
  align?: 'left' | 'right' | 'center';
  numeric?: boolean;
  sticky?: boolean;
  muted?: boolean;
};

export function TableCell({
  align,
  numeric = false,
  sticky = false,
  muted = false,
  className,
  children,
  ...rest
}: TableCellProps) {
  const resolved = align ?? (numeric ? 'right' : 'left');
  return (
    <td
      data-numeric={numeric || undefined}
      className={cn(
        'border-b border-border px-3 py-2 align-middle',
        '[[data-dense]_&]:py-1.5',
        resolved === 'right' && 'text-right',
        resolved === 'center' && 'text-center',
        numeric && 'num',
        muted && 'text-text-muted',
        sticky && 'sticky left-0 z-10 bg-surface group-hover:bg-surface-sunken',
        className,
      )}
      {...rest}
    >
      {children}
    </td>
  );
}

/** Spacer row for windowed lists — keeps the scrollbar honest. */
export function TableSpacerRow({ height, colSpan }: { height: number; colSpan: number }) {
  if (height <= 0) return null;
  return (
    <tr aria-hidden style={{ height }}>
      <td colSpan={colSpan} className="border-0 p-0" />
    </tr>
  );
}

/** Toggle a sort key, cycling desc -> asc -> desc for the same column. */
export function nextSort<K extends string>(current: SortState<K>, key: K): SortState<K> {
  if (!current || current.key !== key) return { key, direction: 'desc' };
  return { key, direction: current.direction === 'desc' ? 'asc' : 'desc' };
}
