/**
 * Formatting helpers. Every one of these renders `null`/`undefined`/`NaN` as
 * the explicit no-data marker rather than inventing a number.
 */

export const NO_DATA = '—';

function bad(value: number | null | undefined): value is null | undefined {
  return value === null || value === undefined || Number.isNaN(value);
}

/** `4.5` -> `£4.5m` */
export function money(value: number | null | undefined): string {
  if (bad(value)) return NO_DATA;
  return `£${value.toFixed(1)}m`;
}

/** Signed price delta, e.g. `+0.2` / `-0.1`. */
export function priceDelta(value: number | null | undefined): string {
  if (bad(value)) return NO_DATA;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(1)}`;
}

export function num(value: number | null | undefined, digits = 1): string {
  if (bad(value)) return NO_DATA;
  return value.toFixed(digits);
}

export function int(value: number | null | undefined): string {
  if (bad(value)) return NO_DATA;
  return Math.round(value).toLocaleString('en-GB');
}

/** Probability in [0,1] -> `62%`. */
export function pct(value: number | null | undefined, digits = 0): string {
  if (bad(value)) return NO_DATA;
  return `${(value * 100).toFixed(digits)}%`;
}

/** Ownership already arrives as a percentage number. */
export function ownership(value: number | null | undefined, digits = 1): string {
  if (bad(value)) return NO_DATA;
  return `${value.toFixed(digits)}%`;
}

export function signed(value: number | null | undefined, digits = 1): string {
  if (bad(value)) return NO_DATA;
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(digits)}`;
}

const DATE_TIME = new Intl.DateTimeFormat('en-GB', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
});

const DATE_ONLY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
});

export function dateTime(iso: string | null | undefined): string {
  if (!iso) return NO_DATA;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NO_DATA : DATE_TIME.format(d);
}

export function dateOnly(iso: string | null | undefined): string {
  if (!iso) return NO_DATA;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? NO_DATA : DATE_ONLY.format(d);
}

/** `2h 14m ago` / `in 3d 4h`. */
export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return NO_DATA;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return NO_DATA;
  const deltaMs = t - now;
  const future = deltaMs > 0;
  let s = Math.abs(deltaMs) / 1000;
  const d = Math.floor(s / 86400);
  s -= d * 86400;
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);

  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (d || h) parts.push(`${h}h`);
  if (!d) parts.push(`${m}m`);
  const body = parts.slice(0, 2).join(' ');
  return future ? `in ${body}` : `${body} ago`;
}

/** "Kevin De Bruyne" -> "KD"; falls back to a single glyph. */
export function initials(name: string, max = 2): string {
  const words = name
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0]!.slice(0, max).toUpperCase();
  return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase().slice(0, max);
}

/** Deterministic hue in [0,360) from any integer — used by monogram avatars. */
export function hueFromCode(code: number): number {
  const x = Math.abs(Math.trunc(code) || 1);
  return (x * 137.508) % 360;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
