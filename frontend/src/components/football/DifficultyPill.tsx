import { cn } from '@/lib/cn';
import { difficultyColor, difficultyInk, difficultyStep } from '@/lib/tokens';

export type DifficultyPillSize = 'xs' | 'sm' | 'md' | 'lg';

export type DifficultyPillProps = {
  /** Fixture difficulty. Anything outside 1..5 is clamped; `null` reads as 3. */
  value: number | null | undefined;
  size?: DifficultyPillSize;
  /** Text shown before the digit, e.g. an opponent's short name. */
  label?: string;
  /** Square-ish tile instead of a pill — used inside the FDR grid. */
  shape?: 'pill' | 'tile';
  className?: string;
  title?: string;
};

const SIZE: Record<DifficultyPillSize, string> = {
  xs: 'h-[18px] min-w-[18px] gap-1 px-1.5 text-[10px]',
  sm: 'h-[22px] min-w-[22px] gap-1 px-2 text-[11.5px]',
  md: 'h-[26px] min-w-[26px] gap-1.5 px-2.5 text-[13px]',
  lg: 'h-[32px] min-w-[32px] gap-2 px-3 text-[15px]',
};

const DIFFICULTY_WORD = ['', 'very easy', 'easy', 'average', 'hard', 'very hard'] as const;

/**
 * Fixture difficulty, 1..5.
 *
 * The digit is *always* rendered — the ramp is diverging and several steps sit
 * close together in lightness, so the number, not the colour, is what carries
 * the value.
 */
export function DifficultyPill({
  value,
  size = 'sm',
  label,
  shape = 'pill',
  className,
  title,
}: DifficultyPillProps) {
  const step = difficultyStep(value);
  const known = value !== null && value !== undefined && !Number.isNaN(value);

  return (
    <span
      title={title}
      aria-label={`Difficulty ${step}${known ? `, ${DIFFICULTY_WORD[step]}` : ', assumed average'}`}
      className={cn(
        'inline-flex items-center justify-center font-semibold leading-none whitespace-nowrap',
        shape === 'pill' ? 'rounded-[999px]' : 'rounded-[10px]',
        SIZE[size],
        !known && 'opacity-70',
        className,
      )}
      style={{
        background: difficultyColor(step),
        color: difficultyInk(step),
        boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--color-text) 8%, transparent)',
      }}
    >
      {label ? (
        <span className="truncate font-semibold uppercase tracking-[0.03em]">{label}</span>
      ) : null}
      <span className="num tabular-nums">{step}</span>
    </span>
  );
}
