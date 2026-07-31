import { useCallback, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '@/lib/cn';
import { usePortal } from '@/lib/usePortal';

export type TooltipAnchor = { clientX: number; clientY: number };

export type ChartTooltipRow = {
  label: string;
  value: string;
  /** Token name or resolved colour for the swatch. */
  colour?: string;
  dashed?: boolean;
  muted?: boolean;
};

export type ChartTooltipProps = {
  /** `null` hides the tooltip. */
  anchor: TooltipAnchor | null;
  title?: string;
  rows?: readonly ChartTooltipRow[];
  children?: ReactNode;
  className?: string;
};

/**
 * A cursor-following chart tooltip in a portal. Charts drive it with
 * `useChartTooltip()`; the DOM node is `aria-hidden` because the underlying
 * marks already carry `aria-label`s.
 */
export function ChartTooltip({ anchor, title, rows, children, className }: ChartTooltipProps) {
  const host = usePortal();
  if (!host || !anchor) return null;

  const pad = 14;
  const left = Math.min(anchor.clientX + pad, window.innerWidth - 240);
  const top = Math.max(8, anchor.clientY - pad - 8);

  return createPortal(
    <div
      aria-hidden
      style={{ position: 'fixed', left, top, zIndex: 95, pointerEvents: 'none' }}
      className={cn(
        'min-w-[140px] max-w-[260px] rounded-[16px] border border-border bg-surface-raised px-2.5 py-2 shadow-pop',
        className,
      )}
    >
      {title ? (
        <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-text-muted">
          {title}
        </p>
      ) : null}
      {rows?.map((row) => (
        <div key={row.label} className="flex items-center justify-between gap-3 py-[1px]">
          <span className="flex min-w-0 items-center gap-1.5">
            {row.colour ? (
              row.dashed ? (
                <span
                  className="h-0 w-3 shrink-0 border-t-2 border-dashed"
                  style={{ borderColor: row.colour }}
                />
              ) : (
                <span
                  className="h-2 w-2 shrink-0 rounded-[3px]"
                  style={{ background: row.colour }}
                />
              )
            ) : null}
            <span className={cn('truncate text-[12px]', row.muted ? 'text-text-faint' : 'text-text-muted')}>
              {row.label}
            </span>
          </span>
          <span className="num shrink-0 text-[12.5px] font-semibold text-text">{row.value}</span>
        </div>
      ))}
      {children}
    </div>,
    host,
  );
}

export type ChartTooltipState<T> = {
  anchor: TooltipAnchor | null;
  datum: T | null;
  show: (event: { clientX: number; clientY: number }, datum: T) => void;
  move: (event: { clientX: number; clientY: number }) => void;
  hide: () => void;
};

/** Small state helper so every chart wires its hover layer the same way. */
export function useChartTooltip<T>(): ChartTooltipState<T> {
  const [anchor, setAnchor] = useState<TooltipAnchor | null>(null);
  const [datum, setDatum] = useState<T | null>(null);

  const show = useCallback((event: { clientX: number; clientY: number }, next: T) => {
    setAnchor({ clientX: event.clientX, clientY: event.clientY });
    setDatum(next);
  }, []);

  const move = useCallback((event: { clientX: number; clientY: number }) => {
    setAnchor((prev) => (prev ? { clientX: event.clientX, clientY: event.clientY } : prev));
  }, []);

  const hide = useCallback(() => {
    setAnchor(null);
    setDatum(null);
  }, []);

  return { anchor, datum, show, move, hide };
}
