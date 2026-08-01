import { CHART } from '@/lib/tokens';
import { truncateToWidth } from './chartUtils';
import type { PlotArea } from './types';

export type AxisTick = { value: number; label: string; offset: number };

export type XAxisProps = {
  area: PlotArea;
  ticks: readonly AxisTick[];
  /** Draw the baseline rule. */
  line?: boolean;
  tickSize?: number;
  /** Rotate labels when they are long. */
  rotate?: number;
};

/** Bottom axis: recessive baseline, small muted labels, no tick forest. */
export function XAxis({ area, ticks, line = true, tickSize = 4, rotate = 0 }: XAxisProps) {
  const y = area.y + area.height;
  return (
    <g aria-hidden>
      {line ? (
        <line
          x1={area.x}
          x2={area.x + area.width}
          y1={y}
          y2={y}
          stroke={CHART.axis}
          strokeWidth={1}
        />
      ) : null}
      {ticks.map((tick) => (
        <g key={`${tick.value}-${tick.label}`} transform={`translate(${tick.offset},${y})`}>
          {tickSize > 0 ? (
            <line y2={tickSize} stroke={CHART.axis} strokeWidth={1} />
          ) : null}
          <text
            y={tickSize + 11}
            textAnchor={rotate ? 'end' : 'middle'}
            transform={rotate ? `rotate(${-rotate})` : undefined}
            fill={CHART.label}
            fontSize={10.5}
            style={{ fontVariantNumeric: 'tabular-nums' }}
          >
            {tick.label}
          </text>
        </g>
      ))}
    </g>
  );
}

export type YAxisProps = {
  area: PlotArea;
  ticks: readonly AxisTick[];
  /** Hairline gridlines across the plot. */
  grid?: boolean;
  side?: 'left' | 'right';
  /** Emphasise the zero rule when the domain crosses it. */
  zeroAt?: number | null;
};

/** Left axis + recessive gridlines. Labels are muted and tabular. */
export function YAxis({ area, ticks, grid = true, side = 'left', zeroAt = null }: YAxisProps) {
  const x = side === 'left' ? area.x : area.x + area.width;
  return (
    <g aria-hidden>
      {grid
        ? ticks.map((tick) => (
            <line
              key={`grid-${tick.value}`}
              x1={area.x}
              x2={area.x + area.width}
              y1={tick.offset}
              y2={tick.offset}
              stroke={CHART.grid}
              strokeWidth={1}
            />
          ))
        : null}
      {zeroAt !== null ? (
        <line
          x1={area.x}
          x2={area.x + area.width}
          y1={zeroAt}
          y2={zeroAt}
          stroke={CHART.axis}
          strokeWidth={1.25}
        />
      ) : null}
      {ticks.map((tick) => (
        <text
          key={`label-${tick.value}`}
          x={side === 'left' ? x - 8 : x + 8}
          y={tick.offset}
          dy="0.32em"
          textAnchor={side === 'left' ? 'end' : 'start'}
          fill={CHART.label}
          fontSize={10.5}
          style={{ fontVariantNumeric: 'tabular-nums' }}
        >
          {tick.label}
        </text>
      ))}
    </g>
  );
}

export type CategoryAxisProps = {
  area: PlotArea;
  /** Pre-computed band centres. */
  bands: readonly { key: string; label: string; centre: number }[];
  orientation?: 'bottom' | 'left';
  /** Show every nth label when space is tight. */
  every?: number;
  rotate?: number;
  /** Available width for a left-orientation label; longer text is ellipsised. */
  labelWidth?: number;
};

/** Categorical axis for bar/stacked charts. */
export function CategoryAxis({
  area,
  bands,
  orientation = 'bottom',
  every = 1,
  rotate = 0,
  labelWidth,
}: CategoryAxisProps) {
  return (
    <g aria-hidden>
      {orientation === 'bottom' ? (
        <line
          x1={area.x}
          x2={area.x + area.width}
          y1={area.y + area.height}
          y2={area.y + area.height}
          stroke={CHART.axis}
          strokeWidth={1}
        />
      ) : null}
      {bands.map((band, index) =>
        index % every === 0 ? (
          orientation === 'bottom' ? (
            <text
              key={band.key}
              x={band.centre}
              y={area.y + area.height + 15}
              textAnchor={rotate ? 'end' : 'middle'}
              transform={rotate ? `rotate(${-rotate},${band.centre},${area.y + area.height + 15})` : undefined}
              fill={CHART.label}
              fontSize={10.5}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            >
              {band.label}
            </text>
          ) : (
            <text
              key={band.key}
              x={area.x - 8}
              y={band.centre}
              dy="0.32em"
              textAnchor="end"
              fill={CHART.label}
              fontSize={10.5}
            >
              <title>{band.label}</title>
              {labelWidth ? truncateToWidth(band.label, labelWidth - 10) : band.label}
            </text>
          )
        ) : null,
      )}
    </g>
  );
}
