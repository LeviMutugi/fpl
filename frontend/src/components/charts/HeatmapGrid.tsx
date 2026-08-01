import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { useMeasure } from '@/lib/useMeasure';
import { CHART, difficultyColor, difficultyInk, difficultyStep, token } from '@/lib/tokens';
import { NO_DATA } from '@/lib/format';
import { ChartTable } from './ChartTable';
import { ChartTooltip, useChartTooltip } from './ChartTooltip';
import { pillBar } from './chartUtils';

/** One fixture inside a gameweek cell. Two entries means a double gameweek. */
export type HeatmapEntry = {
  /** FDR 1..5; anything else is clamped into the ramp. */
  difficulty: number;
  /** Short opponent label, e.g. `ARS`. */
  label: string;
  isHome?: boolean;
  /** Overrides the tooltip line for this fixture. */
  detail?: string;
};

export type HeatmapCell = {
  event: number;
  /** Empty array = a blank gameweek, which is a real state, not missing data. */
  entries: readonly HeatmapEntry[];
};

export type HeatmapRow = {
  id: string;
  label: string;
  cells: readonly HeatmapCell[];
  /** Optional trailing figure, e.g. the mean difficulty over the window. */
  summary?: number | null;
};

export type HeatmapGridProps = {
  rows: readonly HeatmapRow[];
  columns: readonly { event: number; label: string }[];
  cellHeight?: number;
  rowLabelWidth?: number;
  /** Width of the trailing summary column; 0 hides it. */
  summaryWidth?: number;
  summaryLabel?: string;
  formatSummary?: (value: number) => string;
  onSelectCell?: (rowId: string, event: number) => void;
  tableCaption?: string;
  className?: string;
  ariaLabel: string;
};

const HEADER_HEIGHT = 22;
const CELL_GAP = 2;

/**
 * The fixture-difficulty grid: teams down, gameweeks across. The difficulty
 * digit is always drawn inside the cell, so colour is never the only encoding;
 * a doubled gameweek splits its cell into two, and a blank one says so.
 */
export function HeatmapGrid({
  rows,
  columns,
  cellHeight = 34,
  rowLabelWidth = 56,
  summaryWidth = 44,
  summaryLabel = 'Avg',
  formatSummary = (value) => value.toFixed(1),
  onSelectCell,
  tableCaption,
  className,
  ariaLabel,
}: HeatmapGridProps) {
  const [ref, size] = useMeasure<HTMLDivElement>();
  const tip = useChartTooltip<{ row: HeatmapRow; cell: HeatmapCell }>();

  const showSummary = summaryWidth > 0 && rows.some((row) => row.summary !== undefined);
  const height = HEADER_HEIGHT + rows.length * cellHeight;
  const gridWidth = Math.max(
    0,
    size.width - rowLabelWidth - (showSummary ? summaryWidth : 0),
  );
  const columnWidth = columns.length > 0 ? gridWidth / columns.length : 0;
  const ready = size.width > 0 && rows.length > 0 && columns.length > 0;

  const byEvent = useMemo(
    () =>
      rows.map((row) => {
        const map = new Map<number, HeatmapCell>();
        for (const cell of row.cells) map.set(cell.event, cell);
        return map;
      }),
    [rows],
  );

  return (
    <div ref={ref} className={cn('relative w-full', className)} style={{ minHeight: height }}>
      {ready ? (
        <svg width={size.width} height={height} role="img" aria-label={ariaLabel}>
          <g aria-hidden>
            {columns.map((column, index) => (
              <text
                key={column.event}
                x={rowLabelWidth + columnWidth * (index + 0.5)}
                y={HEADER_HEIGHT - 8}
                textAnchor="middle"
                fill={CHART.label}
                fontSize={10.5}
                style={{ fontVariantNumeric: 'tabular-nums' }}
              >
                {column.label}
              </text>
            ))}
            {showSummary ? (
              <text
                x={size.width - summaryWidth / 2}
                y={HEADER_HEIGHT - 8}
                textAnchor="middle"
                fill={CHART.label}
                fontSize={10.5}
              >
                {summaryLabel}
              </text>
            ) : null}
          </g>

          {rows.map((row, rowIndex) => {
            const y = HEADER_HEIGHT + rowIndex * cellHeight;
            const lookup = byEvent[rowIndex]!;
            return (
              <g key={row.id} role="list" aria-label={row.label}>
                <text
                  aria-hidden
                  x={0}
                  y={y + cellHeight / 2}
                  dy="0.32em"
                  fill={CHART.text}
                  fontSize={11.5}
                  fontWeight={600}
                >
                  {row.label}
                </text>

                {columns.map((column, columnIndex) => {
                  const cell = lookup.get(column.event) ?? { event: column.event, entries: [] };
                  const x = rowLabelWidth + columnWidth * columnIndex;
                  const w = Math.max(0, columnWidth - CELL_GAP);
                  const h = Math.max(0, cellHeight - CELL_GAP);
                  const count = cell.entries.length;
                  const description =
                    count === 0
                      ? `${row.label}, ${column.label}: blank gameweek`
                      : `${row.label}, ${column.label}: ${cell.entries
                          .map(
                            (entry) =>
                              `${entry.label}${
                                entry.isHome === undefined ? '' : entry.isHome ? ' (H)' : ' (A)'
                              } difficulty ${difficultyStep(entry.difficulty)}`,
                          )
                          .join(', ')}`;

                  return (
                    <g
                      key={column.event}
                      role="listitem"
                      tabIndex={0}
                      aria-label={description}
                      className={cn(
                        'outline-none focus-visible:[outline:2px_solid_var(--color-ring)] focus-visible:[outline-offset:1px]',
                        onSelectCell && 'cursor-pointer',
                      )}
                      onPointerEnter={(event) => tip.show(event, { row, cell })}
                      onPointerMove={tip.move}
                      onClick={onSelectCell ? () => onSelectCell(row.id, column.event) : undefined}
                      onKeyDown={
                        onSelectCell
                          ? (event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                onSelectCell(row.id, column.event);
                              }
                            }
                          : undefined
                      }
                    >
                      {count === 0 ? (
                        <>
                          <path
                            d={pillBar(x, y, w, h, 8)}
                            fill={token('color-surface-sunken')}
                            stroke={CHART.grid}
                            strokeWidth={1}
                          />
                          <text
                            x={x + w / 2}
                            y={y + h / 2}
                            dy="0.32em"
                            textAnchor="middle"
                            fill={CHART.label}
                            fontSize={11}
                          >
                            {NO_DATA}
                          </text>
                        </>
                      ) : (
                        cell.entries.map((entry, entryIndex) => {
                          const slotWidth = (w - (count - 1) * CELL_GAP) / count;
                          const slotX = x + entryIndex * (slotWidth + CELL_GAP);
                          const wide = slotWidth >= 42;
                          const digit = String(difficultyStep(entry.difficulty));
                          return (
                            <g key={`${entry.label}-${entryIndex}`}>
                              <path
                                d={pillBar(slotX, y, slotWidth, h, 8)}
                                fill={difficultyColor(entry.difficulty)}
                              />
                              {wide ? (
                                <>
                                  <text
                                    x={slotX + 7}
                                    y={y + h / 2}
                                    dy="0.32em"
                                    fill={difficultyInk(entry.difficulty)}
                                    fontSize={10.5}
                                    fontWeight={600}
                                  >
                                    {entry.isHome === false
                                      ? entry.label.toLowerCase()
                                      : entry.label.toUpperCase()}
                                  </text>
                                  <text
                                    x={slotX + slotWidth - 7}
                                    y={y + h / 2}
                                    dy="0.32em"
                                    textAnchor="end"
                                    fill={difficultyInk(entry.difficulty)}
                                    fontSize={11}
                                    fontWeight={700}
                                    style={{ fontVariantNumeric: 'tabular-nums' }}
                                  >
                                    {digit}
                                  </text>
                                </>
                              ) : (
                                <text
                                  x={slotX + slotWidth / 2}
                                  y={y + h / 2}
                                  dy="0.32em"
                                  textAnchor="middle"
                                  fill={difficultyInk(entry.difficulty)}
                                  fontSize={11.5}
                                  fontWeight={700}
                                  style={{ fontVariantNumeric: 'tabular-nums' }}
                                >
                                  {digit}
                                </text>
                              )}
                            </g>
                          );
                        })
                      )}
                    </g>
                  );
                })}

                {showSummary ? (
                  <text
                    aria-hidden
                    x={size.width - summaryWidth / 2}
                    y={y + cellHeight / 2}
                    dy="0.32em"
                    textAnchor="middle"
                    fill={CHART.muted}
                    fontSize={11.5}
                    fontWeight={600}
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {row.summary === null || row.summary === undefined
                      ? NO_DATA
                      : formatSummary(row.summary)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      ) : null}

      <ChartTooltip
        anchor={tip.anchor}
        {...(tip.datum ? { title: `${tip.datum.row.label} · GW${tip.datum.cell.event}` } : {})}
        rows={
          tip.datum
            ? tip.datum.cell.entries.length === 0
              ? [{ label: 'Blank gameweek', value: NO_DATA, muted: true }]
              : tip.datum.cell.entries.map((entry) => ({
                  label:
                    entry.detail ??
                    `${entry.label}${
                      entry.isHome === undefined ? '' : entry.isHome ? ' (H)' : ' (A)'
                    }`,
                  value: `FDR ${difficultyStep(entry.difficulty)}`,
                  colour: difficultyColor(entry.difficulty),
                }))
            : []
        }
      />

      <ChartTable
        caption={tableCaption ?? ariaLabel}
        columns={['Team', ...columns.map((column) => column.label)]}
        rows={rows.map((row, rowIndex) => [
          row.label,
          ...columns.map((column) => {
            const cell = byEvent[rowIndex]!.get(column.event);
            if (!cell || cell.entries.length === 0) return 'Blank';
            return cell.entries
              .map((entry) => `${entry.label} ${difficultyStep(entry.difficulty)}`)
              .join(' + ');
          }),
        ])}
      />
    </div>
  );
}
