import { motion } from 'motion/react';
import { cn } from '@/lib/cn';
import { money, num, ownership as fmtOwnership, NO_DATA } from '@/lib/format';
import { positionColor } from '@/lib/tokens';
import { useReducedMotion } from '@/lib/useReducedMotion';
import type { PlayerRow, SquadPlayer } from '@/types/api';
import { AvailabilityDot } from './AvailabilityDot';
import { PlayerImage } from './PlayerImage';

/**
 * `PlayerRow` plus the squad-only flags. `SquadPlayer` satisfies this exactly,
 * and a plain `PlayerRow` satisfies it too — so the chip works both for a
 * solved XI and for a hand-assembled shortlist.
 */
export type ChipPlayer = PlayerRow &
  Partial<Pick<SquadPlayer, 'is_captain' | 'is_vice' | 'role' | 'bench_order'>>;

export type PlayerChipProps = {
  player: ChipPlayer;
  /** Overrides `player.is_captain`. */
  isCaptain?: boolean;
  /** Overrides `player.is_vice`. */
  isVice?: boolean;
  /** Overrides `player.prediction.xp`. */
  xp?: number | null;
  /** Append selected-by percentage to the second line. */
  showOwnership?: boolean;
  /** The bench form: smaller photo, one line of numbers. */
  compact?: boolean;
  selected?: boolean;
  /** Fade the chip back (e.g. filtered out, or transferred away). */
  dimmed?: boolean;
  onSelect?: (playerId: number) => void;
  className?: string;
};

/**
 * The on-pitch player token: photo in a position-coloured ring, a curvy name
 * plate underneath, and the two numbers that matter at a glance.
 *
 * Sizing is driven by the pitch's container width (`cqi`), so a five-at-the-
 * back line on a phone shrinks its tokens instead of overlapping them.
 */
export function PlayerChip({
  player,
  isCaptain,
  isVice,
  xp,
  showOwnership = false,
  compact = false,
  selected = false,
  dimmed = false,
  onSelect,
  className,
}: PlayerChipProps) {
  const reduced = useReducedMotion();

  const captain = isCaptain ?? player.is_captain ?? false;
  const vice = isVice ?? player.is_vice ?? false;
  const points = xp !== undefined ? xp : (player.prediction?.xp ?? null);
  const ring = positionColor(player.position);

  const photoSize = compact
    ? 'clamp(26px, 7.6cqi, 44px)'
    : 'clamp(30px, 9.6cqi, 60px)';
  const nameSize = compact ? 'clamp(8px, 2.5cqi, 11px)' : 'clamp(8.5px, 2.85cqi, 12.5px)';
  const metaSize = compact ? 'clamp(7.5px, 2.2cqi, 10px)' : 'clamp(8px, 2.5cqi, 11px)';

  const armband = captain ? 'C' : vice ? 'V' : null;

  const label = [
    player.web_name,
    player.position,
    player.team,
    money(player.price),
    points === null ? 'expected points unavailable' : `${num(points, 1)} expected points`,
    captain ? 'captain' : vice ? 'vice-captain' : '',
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <motion.button
      type="button"
      aria-label={label}
      aria-pressed={selected || undefined}
      onClick={() => onSelect?.(player.id)}
      whileHover={reduced || !onSelect ? undefined : { y: -5, scale: 1.045 }}
      whileTap={reduced || !onSelect ? undefined : { scale: 0.97 }}
      transition={reduced ? { duration: 0 } : { type: 'spring', stiffness: 520, damping: 26 }}
      className={cn(
        'group relative flex w-full min-w-0 flex-col items-center gap-1 rounded-[18px] p-0.5',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
        onSelect ? 'cursor-pointer' : 'cursor-default',
        dimmed && 'opacity-45 saturate-50',
        className,
      )}
    >
      {/* Hover halo in the position colour — decorative, never the only cue. */}
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute -inset-1 -z-10 rounded-[24px] opacity-0 blur-md transition-opacity duration-300',
          onSelect && 'group-hover:opacity-100',
          selected && 'opacity-90',
        )}
        style={{ background: `color-mix(in oklch, ${ring} 34%, transparent)` }}
      />

      {/* ---------------------------------------------------------- photo -- */}
      <span className="relative block shrink-0" style={{ width: photoSize, height: photoSize }}>
        <PlayerImage
          code={player.code}
          name={player.web_name}
          size={compact ? 'sm' : 'md'}
          shape="circle"
          candidates={player.photo?.candidates}
          ring={ring}
          className="h-full w-full"
        />

        {armband ? (
          <span
            className={cn(
              'absolute -left-[8%] -top-[6%] grid place-items-center rounded-full',
              'font-display font-bold leading-none text-text',
            )}
            style={{
              width: `calc(${photoSize} * 0.42)`,
              height: `calc(${photoSize} * 0.42)`,
              fontSize: `calc(${photoSize} * 0.24)`,
              background: 'var(--color-surface-raised)',
              boxShadow: captain
                ? '0 0 0 2px var(--color-warning), 0 0 10px -2px var(--color-warning)'
                : '0 0 0 2px var(--color-border-strong)',
            }}
            title={captain ? 'Captain' : 'Vice-captain'}
          >
            {armband}
          </span>
        ) : null}

        <span className="absolute -right-[2%] top-[2%]">
          <AvailabilityDot
            status={player.status}
            chanceOfPlaying={player.chance_of_playing}
            news={player.news}
            availability={player.availability}
            size={compact ? 'xs' : 'sm'}
          />
        </span>
      </span>

      {/* ----------------------------------------------------- name plate -- */}
      <span
        className={cn(
          'block w-full min-w-0 overflow-hidden rounded-[13px] px-1 py-[3px] text-center',
          'bg-surface/92 backdrop-blur-[3px]',
          'transition-shadow duration-300',
        )}
        style={{
          boxShadow: selected
            ? `0 0 0 1.5px ${ring}, var(--shadow-soft)`
            : 'inset 0 0 0 1px color-mix(in oklch, var(--color-border) 80%, transparent), var(--shadow-soft)',
        }}
      >
        <span
          className="block truncate font-semibold leading-tight text-text"
          style={{ fontSize: nameSize }}
        >
          {player.web_name}
        </span>
        <span
          className="num block truncate leading-tight text-text-muted"
          style={{ fontSize: metaSize }}
        >
          {money(player.price)}
          <span aria-hidden className="mx-[0.28em] opacity-50">
            ·
          </span>
          {points === null ? NO_DATA : num(points, 1)}
          {showOwnership ? (
            <>
              <span aria-hidden className="mx-[0.28em] opacity-50">
                ·
              </span>
              {fmtOwnership(player.ownership, 0)}
            </>
          ) : null}
        </span>
      </span>
    </motion.button>
  );
}
