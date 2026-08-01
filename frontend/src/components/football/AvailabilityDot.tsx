import { cn } from '@/lib/cn';
import { pct } from '@/lib/format';
import { Tooltip } from '@/components/ui/Tooltip';
import type { Availability } from '@/types/api';

export type AvailabilityLevel = 'available' | 'doubt' | 'risk' | 'out' | 'unknown';

export type AvailabilityDotProps = {
  /** `player.status` — FPL's single-letter code. */
  status?: string | null;
  /** `player.chance_of_playing`, 0-100. */
  chanceOfPlaying?: number | null;
  /** `player.news` — surfaced verbatim in the tooltip. */
  news?: string | null;
  /** `player.availability` — adds the model's start probability and rationale. */
  availability?: Availability | null;
  size?: 'xs' | 'sm' | 'md';
  /** Keep the dot visible even when the player is fully fit. */
  alwaysShow?: boolean;
  /** Wrap in a hover/focus tooltip. Turn off inside an existing tooltip. */
  withTooltip?: boolean;
  className?: string;
};

const SIZE = {
  xs: 'h-[7px] w-[7px]',
  sm: 'h-[9px] w-[9px]',
  md: 'h-[11px] w-[11px]',
} as const;

const LEVEL_TOKEN: Record<AvailabilityLevel, string> = {
  available: 'var(--color-good)',
  doubt: 'var(--color-warning)',
  risk: 'var(--color-serious)',
  out: 'var(--color-critical)',
  unknown: 'var(--color-text-faint)',
};

const LEVEL_LABEL: Record<AvailabilityLevel, string> = {
  available: 'Available',
  doubt: 'Doubt',
  risk: 'Major doubt',
  out: 'Out',
  unknown: 'Availability unknown',
};

/**
 * Resolve FPL's status letter and chance-of-playing into one of five levels.
 * `chance_of_playing` wins when present, because it is the finer signal.
 */
export function availabilityLevel(
  status?: string | null,
  chanceOfPlaying?: number | null,
): AvailabilityLevel {
  if (chanceOfPlaying !== null && chanceOfPlaying !== undefined && !Number.isNaN(chanceOfPlaying)) {
    if (chanceOfPlaying <= 0) return 'out';
    if (chanceOfPlaying <= 25) return 'risk';
    if (chanceOfPlaying < 100) return 'doubt';
    return 'available';
  }
  switch ((status ?? '').toLowerCase()) {
    case 'a':
      return 'available';
    case 'd':
      return 'doubt';
    case 'i':
    case 's':
    case 'u':
    case 'n':
      return 'out';
    default:
      return 'unknown';
  }
}

/**
 * The availability indicator: a coloured dot that always ships with a text
 * label through its tooltip, so colour is never the only channel. Fully fit
 * players with nothing to report render nothing at all.
 */
export function AvailabilityDot({
  status,
  chanceOfPlaying = null,
  news = null,
  availability = null,
  size = 'sm',
  alwaysShow = false,
  withTooltip = true,
  className,
}: AvailabilityDotProps) {
  const level = availabilityLevel(status, chanceOfPlaying);
  const hasNews = Boolean(news && news.trim());

  if (level === 'available' && !hasNews && !alwaysShow) return null;

  const headline =
    chanceOfPlaying !== null && chanceOfPlaying !== undefined
      ? `${LEVEL_LABEL[level]} · ${Math.round(chanceOfPlaying)}% chance of playing`
      : LEVEL_LABEL[level];

  const colour = LEVEL_TOKEN[level];

  const dot = (
    <span
      role="img"
      aria-label={headline}
      tabIndex={withTooltip ? 0 : -1}
      className={cn(
        'inline-block shrink-0 rounded-full align-middle',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
        SIZE[size],
        className,
      )}
      style={{
        background: colour,
        boxShadow: `0 0 0 1.5px color-mix(in oklch, var(--color-surface) 88%, transparent), 0 0 8px -1px ${colour}`,
      }}
    />
  );

  if (!withTooltip) return dot;

  return (
    <Tooltip
      content={
        <span className="block max-w-[240px]">
          <span className="block font-semibold">{headline}</span>
          {hasNews ? <span className="mt-0.5 block text-text-muted">{news}</span> : null}
          {availability?.p_start !== null && availability?.p_start !== undefined ? (
            <span className="mt-1 block text-[11.5px] text-text-faint">
              Model start probability {pct(availability.p_start)}
              {availability.source === 'news_agent' ? ' · from news' : ''}
            </span>
          ) : null}
          {availability?.rationale ? (
            <span className="mt-0.5 block text-[11.5px] text-text-faint">
              {availability.rationale}
            </span>
          ) : null}
        </span>
      }
    >
      {dot}
    </Tooltip>
  );
}
