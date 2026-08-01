/**
 * The chart kit. Every chart here is responsive, renders nothing until it has
 * been measured, treats `null` as a gap rather than a zero, carries an
 * `aria-label`, and takes every colour from a design token.
 */

/* ------------------------------------------------------------- primitives -- */
export { ChartFrame, type ChartFrameProps } from './ChartFrame';
export { ChartLegend, type ChartLegendProps, type LegendEntry } from './ChartLegend';
export { ChartTable, type ChartTableProps } from './ChartTable';
export {
  ChartTooltip,
  useChartTooltip,
  type ChartTooltipProps,
  type ChartTooltipRow,
  type ChartTooltipState,
  type TooltipAnchor,
} from './ChartTooltip';
export {
  CategoryAxis,
  XAxis,
  YAxis,
  type AxisTick,
  type CategoryAxisProps,
  type XAxisProps,
  type YAxisProps,
} from './ChartAxis';

/* ------------------------------------------------------------------ charts -- */
export { AreaChart, type AreaChartProps } from './AreaChart';
export { BarChart, type BarChartProps } from './BarChart';
export { BoxRow, type BoxRowProps } from './BoxRow';
export { BulletChart, type BulletBand, type BulletChartProps } from './BulletChart';
export {
  CalibrationChart,
  type CalibrationBin,
  type CalibrationChartProps,
  type CalibrationSeries,
} from './CalibrationChart';
export {
  Distribution,
  type DistributionPoint,
  type DistributionProps,
  type DistributionRegion,
} from './Distribution';
export { GaugeArc, type GaugeArcProps, type GaugeBand } from './GaugeArc';
export {
  HeatmapGrid,
  type HeatmapCell,
  type HeatmapEntry,
  type HeatmapGridProps,
  type HeatmapRow,
} from './HeatmapGrid';
export { LineChart, type LineChartProps } from './LineChart';
export {
  RadarChart,
  type RadarAxis,
  type RadarChartProps,
  type RadarSeries,
} from './RadarChart';
export { ScatterPlot, type ScatterGroup, type ScatterPlotProps } from './ScatterPlot';
export { Sparkline, type SparklineProps } from './Sparkline';
export { StackedBarChart, type StackedBarChartProps } from './StackedBarChart';
export { ViolinRow, type ViolinRowProps } from './ViolinRow';
export { WaffleChart, type WafflePart, type WaffleChartProps } from './WaffleChart';

/* --------------------------------------------------------- shapes & maths -- */
export {
  DEFAULT_MARGIN,
  plotArea,
  withMargin,
  type CategoryDatum,
  type LineSeries,
  type Margin,
  type NumericPoint,
  type PlotArea,
  type ScatterDatum,
  type StackKey,
  type StackedDatum,
  type ViolinDatum,
} from './types';
export {
  arcPath,
  areaPath,
  barPath,
  extentX,
  extentY,
  hasData,
  linePath,
  linear,
  nearestIndex,
  niceTicks,
  polar,
  roundedRect,
  segments,
  type Accessor,
} from './scales';
export {
  bandLayout,
  blend,
  boxesOverlap,
  cappedBar,
  clampUnit,
  estimateTextWidth,
  fade,
  fillCount,
  pillBar,
  slotColor,
  valueExtent,
  type BandLayout,
  type LabelBox,
} from './chartUtils';
