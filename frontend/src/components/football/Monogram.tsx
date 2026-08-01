import { useMemo } from 'react';
import { cn } from '@/lib/cn';
import { hueFromCode, initials } from '@/lib/format';

export type MonogramProps = {
  /** Full name — initials are derived from it. */
  label: string;
  /** Any integer; drives the deterministic hue. */
  code: number;
  /**
   * A team colour arriving as a prop — the single place a hex is allowed in
   * this codebase. When absent the hue is derived from `code`.
   */
  tintHex?: string;
  /** Glyph budget: 2 for people, 3 for club short names. */
  maxChars?: number;
  className?: string;
};

/**
 * The terminal rung of every image ladder: a locally rendered initials plate.
 *
 * It is drawn as an SVG with a fixed `viewBox`, so the glyphs scale exactly
 * with whatever box it is dropped into — no font-size plumbing, legible at
 * 24px and at 200px. The tint is always mixed into a surface token, which
 * keeps it light-on-pastel in the light theme and light-on-deep in the dark
 * theme without a single hardcoded colour.
 */
/** Stable small integer from a string — used when no usable code is supplied. */
function hashLabel(value: string): number {
  let hash = 7;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) % 100003;
  }
  return hash || 1;
}

export function Monogram({ label, code, tintHex, maxChars = 2, className }: MonogramProps) {
  const text = useMemo(() => initials(label, maxChars), [label, maxChars]);
  const seed = Number.isFinite(code) && code > 0 ? code : hashLabel(label);
  const base = tintHex ?? `oklch(68% 0.135 ${hueFromCode(seed).toFixed(1)})`;
  const baseDeep = tintHex ?? `oklch(56% 0.15 ${hueFromCode(seed + 7).toFixed(1)})`;

  return (
    <span
      aria-hidden
      className={cn('relative block h-full w-full overflow-hidden', className)}
      style={{
        background: [
          `radial-gradient(120% 88% at 28% 8%, color-mix(in oklch, var(--color-pitch-rim) 26%, transparent) 0%, transparent 62%)`,
          `linear-gradient(152deg,` +
            ` color-mix(in oklch, ${base} 40%, var(--color-surface-raised)) 0%,` +
            ` color-mix(in oklch, ${baseDeep} 54%, var(--color-surface-sunken)) 100%)`,
        ].join(','),
      }}
    >
      <svg
        viewBox="0 0 100 100"
        className="absolute inset-0 h-full w-full"
        role="presentation"
        focusable="false"
      >
        {/* A soft shoulder curve so the plate reads as a portrait stand-in. */}
        <ellipse
          cx="50"
          cy="118"
          rx="44"
          ry="42"
          fill="color-mix(in oklch, var(--color-text) 7%, transparent)"
        />
        <text
          x="50"
          y="52"
          textAnchor="middle"
          dominantBaseline="central"
          className="font-display"
          fontSize={text.length > 2 ? 30 : 38}
          fontWeight={650}
          letterSpacing={text.length > 2 ? -0.5 : 0.5}
          fill="color-mix(in oklch, var(--color-text) 88%, transparent)"
        >
          {text}
        </text>
      </svg>
    </span>
  );
}
