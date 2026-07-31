import { cn } from '@/lib/cn';
import { NO_DATA, num } from '@/lib/format';
import { difficultyColor, difficultyInk, difficultyStep } from '@/lib/tokens';
import { ScrollArea } from '@/components/ui/ScrollArea';
import { Tooltip } from '@/components/ui/Tooltip';

/**
 * The shape every fixture-bearing payload already satisfies — `HorizonEvent`,
 * `PlayerFixture` and `PredictionFixture` all structurally match, so callers
 * can hand a slice of the API response straight in.
 */
export type TickerFixture = {
  event?: number;
  opponent: string | null;
  is_home: boolean | null;
  difficulty: number | null;
  xp?: number | null;
  kickoff?: string | null;
};

export type FixtureTickerSize = 'xs' | 'sm' | 'md';

export type FixtureTickerProps = {
  fixtures: readonly TickerFixture[];
  /** Trim to the first N. */
  max?: number;
  /** Add the per-fixture xP under the opponent. */
  showXp?: boolean;
  /** Show the gameweek number above each chip. */
  showEvent?: boolean;
  size?: FixtureTickerSize;
  className?: string;
  onSelect?: (fixture: TickerFixture, index: number) => void;
  /** Rendered when there are no fixtures at all. */
  emptyLabel?: string;
};

const SIZE: Record<FixtureTickerSize, { chip: string; text: string; sub: string; gap: string }> = {
  xs: { chip: 'h-[22px] px-1.5 rounded-[8px]', text: 'text-[10px]', sub: 'text-[8.5px]', gap: 'gap-1' },
  sm: { chip: 'h-[28px] px-2 rounded-[11px]', text: 'text-[11.5px]', sub: 'text-[9.5px]', gap: 'gap-1.5' },
  md: { chip: 'h-[34px] px-2.5 rounded-[14px]', text: 'text-[13px]', sub: 'text-[10.5px]', gap: 'gap-2' },
};

/**
 * A run of upcoming opponents as curvy difficulty-tinted chips.
 *
 * Each chip carries the opponent's short name, an H/A marker and the
 * difficulty digit; the colour repeats information that is already legible in
 * text. Overflow scrolls horizontally rather than wrapping, so a ticker inside
 * a table row can never push the layout sideways.
 */
export function FixtureTicker({
  fixtures,
  max = 6,
  showXp = false,
  showEvent = false,
  size = 'sm',
  className,
  onSelect,
  emptyLabel = 'No fixtures',
}: FixtureTickerProps) {
  const shown = fixtures.slice(0, max);
  const dims = SIZE[size];

  if (shown.length === 0) {
    return <span className={cn('text-[12px] text-text-faint', className)}>{emptyLabel}</span>;
  }

  return (
    <ScrollArea axis="x" fade={shown.length > 4} className={cn('max-w-full', className)}>
      <div className={cn('flex w-max items-stretch', dims.gap)}>
        {shown.map((fixture, index) => {
          const step = difficultyStep(fixture.difficulty);
          const venue = fixture.is_home === null ? '' : fixture.is_home ? 'H' : 'A';
          const opponent = fixture.opponent ?? NO_DATA;
          const interactive = Boolean(onSelect);

          const body = (
            <div
              className={cn(
                'flex min-w-0 flex-col items-center justify-center leading-none',
                dims.chip,
                interactive &&
                  'transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:-translate-y-0.5',
              )}
              style={{
                background: difficultyColor(step),
                color: difficultyInk(step),
                boxShadow: 'inset 0 0 0 1px color-mix(in oklch, var(--color-text) 8%, transparent)',
              }}
            >
              <span className={cn('flex items-baseline gap-1 font-semibold', dims.text)}>
                <span className="truncate uppercase tracking-[0.02em]">{opponent}</span>
                {venue ? <span className="opacity-70">{venue}</span> : null}
                <span className="num opacity-90">{step}</span>
              </span>
              {showXp ? (
                <span className={cn('num mt-0.5 font-medium opacity-80', dims.sub)}>
                  {fixture.xp === null || fixture.xp === undefined ? NO_DATA : num(fixture.xp, 1)}
                </span>
              ) : null}
            </div>
          );

          const labelled = (
            <Tooltip
              content={
                <span className="block">
                  <span className="block font-semibold">
                    {fixture.event ? `GW${fixture.event} · ` : ''}
                    {opponent} {fixture.is_home === null ? '' : fixture.is_home ? '(home)' : '(away)'}
                  </span>
                  <span className="block text-text-muted">Difficulty {step} of 5</span>
                  {fixture.xp !== null && fixture.xp !== undefined ? (
                    <span className="block text-text-muted">{num(fixture.xp, 2)} expected points</span>
                  ) : null}
                </span>
              }
            >
              {interactive ? (
                <button
                  type="button"
                  onClick={() => onSelect?.(fixture, index)}
                  className="block cursor-pointer rounded-[11px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]"
                  aria-label={`${opponent} ${venue === 'H' ? 'home' : venue === 'A' ? 'away' : ''}, difficulty ${step}`}
                >
                  {body}
                </button>
              ) : (
                <span
                  className="block"
                  aria-label={`${opponent} ${venue === 'H' ? 'home' : venue === 'A' ? 'away' : ''}, difficulty ${step}`}
                >
                  {body}
                </span>
              )}
            </Tooltip>
          );

          return (
            <div key={`${fixture.event ?? 'x'}-${index}`} className="flex flex-col items-center">
              {showEvent ? (
                <span className="num mb-0.5 text-[9.5px] font-medium text-text-faint">
                  {fixture.event ? `GW${fixture.event}` : NO_DATA}
                </span>
              ) : null}
              {labelled}
            </div>
          );
        })}
      </div>
    </ScrollArea>
  );
}
