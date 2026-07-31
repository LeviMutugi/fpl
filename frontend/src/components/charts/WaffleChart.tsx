import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { token } from '@/lib/tokens';
import { NO_DATA, pct } from '@/lib/format';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { clampUnit, fillCount, slotColor } from './chartUtils';

export type WafflePart = {
  id: string;
  label: string;
  /** Share of the whole, 0..1. */
  value: number;
  token?: string;
};

export type WaffleChartProps = {
  /** A single share, 0..1. Ignored when `parts` is supplied. */
  value?: number | null;
  /** Two or more shares of the same whole. */
  parts?: readonly WafflePart[];
  columns?: number;
  rows?: number;
  height?: number;
  /** Fill token for the single-share form. */
  token?: string;
  /** The unfilled squares — a lighter step of the same ramp. */
  trackToken?: string;
  cellGap?: number;
  cellRadius?: number;
  label?: string;
  formatValue?: (value: number) => string;
  className?: string;
  ariaLabel: string;
};

/**
 * A hundred squares standing in for a probability, so "18%" reads as eighteen
 * things out of a hundred rather than a length. Squares fill from the bottom
 * left. A `null` value renders the empty grid plus an explicit no-data readout.
 */
export function WaffleChart({
  value = null,
  parts,
  columns = 10,
  rows = 10,
  height = 180,
  token: fillToken,
  trackToken = 'color-seq-100',
  cellGap = 3,
  cellRadius = 3,
  label,
  formatValue = (v) => pct(v, 0),
  className,
  ariaLabel,
}: WaffleChartProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const tip = useChartTooltip<{ label: string; value: number; colour: string }>();

  const cells = Math.max(1, columns * rows);
  const legend = useMemo<readonly WafflePart[]>(() => {
    if (parts && parts.length > 0) return parts;
    if (value === null || !Number.isFinite(value)) return [];
    return [
      {
        id: 'share',
        label: label ?? ariaLabel,
        value: clampUnit(value),
        ...(fillToken ? { token: fillToken } : {}),
      },
    ];
  }, [ariaLabel, fillToken, label, parts, value]);

  /** Slot -> the part that owns it, largest-first so rounding never overruns. */
  const assignment = useMemo(() => {
    const slots: (WafflePart & { colour: string })[] = [];
    legend.forEach((part, index) => {
      const count = Math.min(
        fillCount(part.value, cells),
        Math.max(0, cells - slots.length),
      );
      const colour = slotColor(part.token, index);
      for (let i = 0; i < count; i += 1) slots.push({ ...part, colour });
    });
    return slots;
  }, [cells, legend]);

  const ready = size.width > 0;
  const cell = Math.max(
    0,
    Math.min(
      (size.width - cellGap * (columns - 1)) / columns,
      (height - cellGap * (rows - 1)) / rows,
    ),
  );
  const gridWidth = cell * columns + cellGap * (columns - 1);
  const gridHeight = cell * rows + cellGap * (rows - 1);
  const originX = Math.max(0, (size.width - gridWidth) / 2);

  return (
    <div ref={ref} className={cn('relative w-full', className)} style={{ minHeight: height }}>
      {ready ? (
        <svg
          width={size.width}
          height={gridHeight}
          role="img"
          aria-label={`${ariaLabel}: ${
            legend.length === 0
              ? 'no data'
              : legend.map((part) => `${part.label} ${formatValue(part.value)}`).join(', ')
          }`}
          onPointerLeave={tip.hide}
        >
          {Array.from({ length: cells }, (_, index) => {
            // Fill bottom-up, left-to-right, so growth reads upward.
            const column = index % columns;
            const row = rows - 1 - Math.floor(index / columns);
            const owner = assignment[index];
            const x = originX + column * (cell + cellGap);
            const y = row * (cell + cellGap);
            return (
              <rect
                key={index}
                x={x}
                y={y}
                width={cell}
                height={cell}
                rx={cellRadius}
                fill={owner ? owner.colour : token(trackToken)}
                onPointerEnter={
                  owner
                    ? (event) =>
                        tip.show(event, {
                          label: owner.label,
                          value: owner.value,
                          colour: owner.colour,
                        })
                    : undefined
                }
                onPointerMove={owner ? tip.move : undefined}
              />
            );
          })}
        </svg>
      ) : null}

      <div className="mt-2 flex flex-wrap items-baseline justify-center gap-x-3 gap-y-1">
        {legend.length === 0 ? (
          <span className="text-[12px] text-text-faint">{NO_DATA}</span>
        ) : (
          legend.map((part, index) => (
            <span key={part.id} className="inline-flex items-center gap-1.5 text-[12px]">
              <span
                aria-hidden
                className="h-2.5 w-2.5 shrink-0 rounded-[3px]"
                style={{ background: slotColor(part.token, index) }}
              />
              <span className="text-text-muted">{part.label}</span>
              <span className="num font-semibold text-text">{formatValue(part.value)}</span>
            </span>
          ))
        )}
      </div>

      <ChartTooltip
        anchor={tip.anchor}
        rows={
          tip.datum
            ? [
                {
                  label: tip.datum.label,
                  value: formatValue(tip.datum.value),
                  colour: tip.datum.colour,
                },
              ]
            : []
        }
      />
    </div>
  );
}
