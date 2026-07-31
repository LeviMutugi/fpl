import { cn } from '@/lib/cn';
import { seriesColor } from '@/lib/tokens';

export type LegendEntry = {
  id: string;
  label: string;
  /** Token name; when omitted, the categorical slot for `index` is used. */
  token?: string;
  /** Draw as a dashed rule rather than a solid swatch. */
  dashed?: boolean;
  /** Optional trailing value, e.g. the latest reading. */
  value?: string;
};

export type ChartLegendProps = {
  entries: readonly LegendEntry[];
  /** Highlight one entry (usually driven by hover). */
  activeId?: string | null;
  onHover?: (id: string | null) => void;
  onSelect?: (id: string) => void;
  size?: 'sm' | 'md';
  className?: string;
};

/**
 * A legend is always present for two or more series. Swatch + text label means
 * identity never depends on colour alone.
 */
export function ChartLegend({
  entries,
  activeId = null,
  onHover,
  onSelect,
  size = 'sm',
  className,
}: ChartLegendProps) {
  if (entries.length === 0) return null;
  const interactive = Boolean(onHover || onSelect);

  return (
    <ul
      className={cn(
        'flex flex-wrap items-center gap-x-3.5 gap-y-1.5',
        size === 'sm' ? 'text-[11.5px]' : 'text-[12.5px]',
        className,
      )}
    >
      {entries.map((entry, index) => {
        const colour = entry.token ? `var(--${entry.token})` : seriesColor(index);
        const dimmed = activeId !== null && activeId !== entry.id;
        const content = (
          <>
            <span aria-hidden className="grid h-2.5 w-3.5 shrink-0 place-items-center">
              {entry.dashed ? (
                <span
                  className="h-0 w-full border-t-2 border-dashed"
                  style={{ borderColor: colour }}
                />
              ) : (
                <span className="h-2.5 w-2.5 rounded-[4px]" style={{ background: colour }} />
              )}
            </span>
            <span className="text-text-muted">{entry.label}</span>
            {entry.value ? <span className="num font-semibold text-text">{entry.value}</span> : null}
          </>
        );

        return (
          <li key={entry.id} className={cn('transition-opacity', dimmed && 'opacity-40')}>
            {interactive ? (
              <button
                type="button"
                onPointerEnter={() => onHover?.(entry.id)}
                onPointerLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(entry.id)}
                onBlur={() => onHover?.(null)}
                onClick={() => onSelect?.(entry.id)}
                className="inline-flex items-center gap-1.5 rounded-[8px] px-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]"
              >
                {content}
              </button>
            ) : (
              <span className="inline-flex items-center gap-1.5">{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
