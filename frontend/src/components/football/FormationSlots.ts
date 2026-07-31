import type { Position } from '@/types/api';

/**
 * Pitch geometry for the starting XI and the bench.
 *
 * Everything here is pure maths — no React, no DOM. `Pitch`/`PitchSlot`
 * consume it to place tokens, and pages use it to lay a squad out without
 * having to know the pixel geometry of the pitch drawing.
 *
 * Coordinate space: `xPct`/`yPct` are percentages of the *pitch board* (the
 * green area), with `0,0` at the top-left. The goalkeeper sits near the
 * bottom (`yPct` ~ 89) because we always draw the managed team attacking
 * upward.
 */

export const FORMATIONS = [
  '3-4-3',
  '3-5-2',
  '4-4-2',
  '4-3-3',
  '4-5-1',
  '5-3-2',
  '5-4-1',
  '5-2-3',
  '3-6-1',
] as const;

export type FormationName = (typeof FORMATIONS)[number];

/** Fallback used whenever a formation string cannot be understood. */
export const DEFAULT_FORMATION: FormationName = '4-4-2';

export type FormationShape = {
  /** The canonical `d-m-f` string. */
  name: string;
  def: number;
  mid: number;
  fwd: number;
  /** `true` when the input string was not a legal 10-outfielder shape. */
  fallback: boolean;
};

/** Row indices, goal-line first. Bench is a synthetic row below the pitch. */
export const ROW_GKP = 0;
export const ROW_DEF = 1;
export const ROW_MID = 2;
export const ROW_FWD = 3;
export const ROW_BENCH = 4;

export const BENCH_SIZE = 4;

const ROW_POSITION: Record<number, Position> = {
  [ROW_GKP]: 'GKP',
  [ROW_DEF]: 'DEF',
  [ROW_MID]: 'MID',
  [ROW_FWD]: 'FWD',
};

/**
 * Vertical band centres, as a percentage of the pitch board's height.
 * Tuned so a five-at-the-back line never collides with the six-yard box and
 * the front line never sits on the far penalty spot.
 */
export const ROW_Y: Record<number, number> = {
  [ROW_GKP]: 88,
  [ROW_DEF]: 68.5,
  [ROW_MID]: 45,
  [ROW_FWD]: 20.5,
  [ROW_BENCH]: 50,
};

export type SlotPosition = {
  row: number;
  col: number;
  /** How many tokens share this row — drives the horizontal spread. */
  of: number;
  xPct: number;
  yPct: number;
  position: Position;
};

/** The nominal position for a pitch row. Bench rows report `MID` as filler. */
export function rowPosition(row: number): Position {
  return ROW_POSITION[row] ?? 'MID';
}

/**
 * Horizontal centre for token `col` of `of` in a row, as a percentage.
 * Spacing tightens as the row fills so six across still fits a phone.
 */
export function slotX(col: number, of: number): number {
  if (of <= 1) return 50;
  const spacing = Math.min(26, 88 / of);
  return 50 + (col - (of - 1) / 2) * spacing;
}

/** Vertical centre for a row, as a percentage of the pitch board. */
export function slotY(row: number): number {
  return ROW_Y[row] ?? 50;
}

function isPositiveInt(value: number): boolean {
  return Number.isInteger(value) && value > 0;
}

export function isFormationName(value: string): value is FormationName {
  return (FORMATIONS as readonly string[]).includes(value);
}

/**
 * `"3-4-3"` -> `{ def: 3, mid: 4, fwd: 3 }`.
 *
 * Anything that is not three positive integers summing to ten (a legal FPL
 * outfield) falls back to {@link DEFAULT_FORMATION} with `fallback: true`, so
 * a bad string from the solver degrades into a drawable pitch instead of an
 * exception.
 */
export function parseFormation(formation: string): FormationShape {
  const parts = formation.trim().split('-');
  if (parts.length === 3) {
    const [def, mid, fwd] = parts.map((part) => Number(part));
    if (
      def !== undefined &&
      mid !== undefined &&
      fwd !== undefined &&
      isPositiveInt(def) &&
      isPositiveInt(mid) &&
      isPositiveInt(fwd) &&
      def + mid + fwd === 10
    ) {
      return { name: `${def}-${mid}-${fwd}`, def, mid, fwd, fallback: false };
    }
  }
  const [def, mid, fwd] = DEFAULT_FORMATION.split('-').map(Number) as [number, number, number];
  return { name: DEFAULT_FORMATION, def, mid, fwd, fallback: true };
}

/** Build a formation string from row counts, e.g. `(3, 4, 3)` -> `"3-4-3"`. */
export function formationFromCounts(def: number, mid: number, fwd: number): string {
  return `${def}-${mid}-${fwd}`;
}

/** How many tokens sit in each row of a formation, GK row first. */
export function rowCounts(formation: string): [number, number, number, number] {
  const { def, mid, fwd } = parseFormation(formation);
  return [1, def, mid, fwd];
}

/**
 * The eleven starting slots, ordered goalkeeper -> defence -> midfield ->
 * attack, left to right within each line. The order matches how an XI array
 * usually arrives from `/api/optimize`.
 */
export function slotPositions(formation: string): SlotPosition[] {
  const counts = rowCounts(formation);
  const slots: SlotPosition[] = [];
  counts.forEach((of, row) => {
    for (let col = 0; col < of; col += 1) {
      slots.push({
        row,
        col,
        of,
        xPct: slotX(col, of),
        yPct: slotY(row),
        position: rowPosition(row),
      });
    }
  });
  return slots;
}

/** The four bench slots, in bench order. */
export function benchSlots(count: number = BENCH_SIZE): SlotPosition[] {
  return Array.from({ length: count }, (_, col) => ({
    row: ROW_BENCH,
    col,
    of: count,
    xPct: ((col + 0.5) / count) * 100,
    yPct: ROW_Y[ROW_BENCH] ?? 50,
    position: rowPosition(ROW_BENCH),
  }));
}

/** Starting XI slots plus the bench row, in one list. */
export function squadSlots(formation: string, bench: number = BENCH_SIZE): SlotPosition[] {
  return [...slotPositions(formation), ...benchSlots(bench)];
}
