import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type ScrollAreaProps = {
  children: ReactNode;
  className?: string;
  maxHeight?: number | string;
  /** Direction(s) allowed to scroll. */
  axis?: 'y' | 'x' | 'both';
  /** Fade the content out at the scrollable edges. */
  fade?: boolean;
  style?: CSSProperties;
};

/**
 * A slim-scrollbar scroll container with optional edge fades that appear only
 * when there is actually content beyond the edge.
 */
export function ScrollArea({
  children,
  className,
  maxHeight,
  axis = 'y',
  fade = true,
  style,
}: ScrollAreaProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const onScroll = () => {
    const node = ref.current;
    if (!node || !fade) return;
    if (axis === 'x') {
      setEdges({
        start: node.scrollLeft > 2,
        end: node.scrollLeft + node.clientWidth < node.scrollWidth - 2,
      });
    } else {
      setEdges({
        start: node.scrollTop > 2,
        end: node.scrollTop + node.clientHeight < node.scrollHeight - 2,
      });
    }
  };

  return (
    <div className={cn('relative min-w-0', className)}>
      <div
        ref={ref}
        onScroll={onScroll}
        style={{ maxHeight, ...style }}
        className={cn(
          'scrollbar-slim min-w-0',
          axis === 'y' && 'overflow-y-auto overflow-x-hidden',
          axis === 'x' && 'overflow-x-auto overflow-y-hidden',
          axis === 'both' && 'overflow-auto',
        )}
      >
        {children}
      </div>
      {fade && edges.start ? (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute',
            axis === 'x'
              ? 'inset-y-0 left-0 w-8 bg-[linear-gradient(90deg,var(--color-surface),transparent)]'
              : 'inset-x-0 top-0 h-8 bg-[linear-gradient(180deg,var(--color-surface),transparent)]',
          )}
        />
      ) : null}
      {fade && edges.end ? (
        <div
          aria-hidden
          className={cn(
            'pointer-events-none absolute',
            axis === 'x'
              ? 'inset-y-0 right-0 w-8 bg-[linear-gradient(270deg,var(--color-surface),transparent)]'
              : 'inset-x-0 bottom-0 h-8 bg-[linear-gradient(0deg,var(--color-surface),transparent)]',
          )}
        />
      ) : null}
    </div>
  );
}
