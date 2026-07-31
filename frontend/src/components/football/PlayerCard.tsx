import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { money, num, ownership as fmtOwnership } from '@/lib/format';
import { positionColor } from '@/lib/tokens';
import { Card } from '@/components/ui/Card';
import { Skeleton } from '@/components/ui/Skeleton';
import { Tooltip } from '@/components/ui/Tooltip';
import type { PlayerRow, Prediction } from '@/types/api';
import { AvailabilityDot } from './AvailabilityDot';
import { FixtureTicker } from './FixtureTicker';
import { PlayerImage } from './PlayerImage';
import { PositionPill } from './PositionPill';
import { PriceTag } from './PriceTag';
import { TeamBadge } from './TeamBadge';
import { XpBadge } from './XpBadge';

export type PlayerCardVariant = 'default' | 'compact' | 'wide';

/** The slice of `Team` a card needs to draw a crest. */
export type PlayerCardTeam = {
  code?: number;
  short_name?: string;
  name?: string;
  primary_hex?: string;
};

export type PlayerCardProps = {
  player: PlayerRow;
  variant?: PlayerCardVariant;
  /** Club colours and badge code. Without it the crest falls back to initials. */
  team?: PlayerCardTeam | null;
  selected?: boolean;
  onSelect?: (playerId: number) => void;
  /** Buttons or menus pinned to the top-right. */
  actions?: ReactNode;
  /** Show the horizon fixtures as a difficulty ticker. */
  showFixtures?: boolean;
  /** A sparkline (or any small mark) rendered in the card's footer. */
  children?: ReactNode;
  className?: string;
};

/* ------------------------------------------------------ uncertainty bar --- */

function XpUncertainty({
  prediction,
  compact = false,
}: {
  prediction: Prediction | null;
  compact?: boolean;
}) {
  if (!prediction) {
    return (
      <div className="flex h-[26px] items-center text-[11.5px] text-text-faint">
        No prediction for this gameweek
      </div>
    );
  }

  const { p10, p90, xp } = prediction;
  const domain = Math.max(6, Math.ceil(Math.max(p90, xp) * 1.05));
  const clampPct = (value: number) => Math.max(0, Math.min(100, (value / domain) * 100));
  const left = clampPct(p10);
  const right = clampPct(p90);
  const width = Math.max(2, right - left);
  const marker = clampPct(xp);

  return (
    <Tooltip
      content={
        <span className="block">
          <span className="block font-semibold">{num(xp, 2)} expected points</span>
          <span className="block text-text-muted">
            80% of outcomes fall between {num(p10, 1)} and {num(p90, 1)}
          </span>
          <span className="block text-text-faint">Median {num(prediction.p50, 1)}</span>
        </span>
      }
    >
      <div
        role="img"
        tabIndex={0}
        aria-label={`Expected points ${num(xp, 1)}, 80 percent interval ${num(p10, 1)} to ${num(p90, 1)}`}
        className={cn(
          'relative w-full rounded-[999px] bg-surface-sunken ring-1 ring-inset ring-border',
          compact ? 'h-1.5' : 'h-2.5',
        )}
      >
        <span
          aria-hidden
          className="absolute inset-y-0 rounded-[999px]"
          style={{
            left: `${left}%`,
            width: `${width}%`,
            background:
              'linear-gradient(90deg, color-mix(in oklch, var(--color-accent) 32%, transparent), color-mix(in oklch, var(--color-accent) 72%, transparent))',
          }}
        />
        <span
          aria-hidden
          className="absolute top-1/2 h-[150%] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-[2px]"
          style={{ left: `${marker}%`, background: 'var(--color-accent)' }}
        />
      </div>
    </Tooltip>
  );
}

/* ------------------------------------------------------------ meta chips --- */

function MetaStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-medium uppercase tracking-[0.07em] text-text-faint">{label}</p>
      <p className="num truncate text-[13px] font-semibold text-text">{value}</p>
    </div>
  );
}

/* ----------------------------------------------------------- PlayerCard --- */

/**
 * The list/grid representation of a player.
 *
 * `default` is a portrait tile for grids, `compact` a single dense row for
 * lists and shortlists, `wide` a horizontal record for tables of one. All
 * three carry the same information hierarchy: who, then what they cost, then
 * what the model expects — with the p10–p90 band always shown next to xP so a
 * point estimate never reads as a certainty.
 */
export function PlayerCard({
  player,
  variant = 'default',
  team = null,
  selected = false,
  onSelect,
  actions,
  showFixtures = true,
  children,
  className,
}: PlayerCardProps) {
  const ring = positionColor(player.position);
  const xp = player.prediction?.xp ?? null;
  const interactive = Boolean(onSelect);

  const clickProps = interactive
    ? {
        role: 'button' as const,
        tabIndex: 0,
        onClick: () => onSelect?.(player.id),
        onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect?.(player.id);
          }
        },
      }
    : {};

  const crest = (
    <TeamBadge
      code={team?.code ?? 0}
      name={team?.name ?? player.team_name}
      shortName={team?.short_name ?? player.team}
      size={variant === 'compact' ? 'xs' : 'sm'}
      {...(team?.primary_hex ? { primaryHex: team.primary_hex } : {})}
    />
  );

  const identity = (
    <div className="flex min-w-0 flex-col gap-0.5">
      <div className="flex min-w-0 items-center gap-1.5">
        <span className="truncate font-display text-[15px] font-semibold leading-tight text-text">
          {player.web_name}
        </span>
        <AvailabilityDot
          status={player.status}
          chanceOfPlaying={player.chance_of_playing}
          news={player.news}
          availability={player.availability}
          size="xs"
        />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 text-[12px] text-text-muted">
        {crest}
        <span className="truncate">{team?.short_name ?? player.team}</span>
        <span aria-hidden className="opacity-40">
          ·
        </span>
        <PositionPill position={player.position} size="xs" />
      </div>
    </div>
  );

  const shell = cn(
    'group min-w-0',
    interactive &&
      'cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]',
    className,
  );

  const selectedStyle = selected ? { boxShadow: `inset 0 0 0 2px ${ring}, var(--shadow-lift)` } : undefined;

  /* ------------------------------------------------------------- compact -- */
  if (variant === 'compact') {
    return (
      <Card
        {...clickProps}
        radius="md"
        padding="none"
        interactive={interactive}
        className={cn(shell, 'flex items-center gap-3 p-2.5')}
        style={selectedStyle}
        aria-label={`${player.web_name}, ${player.position}, ${player.team}`}
      >
        <PlayerImage
          code={player.code}
          name={player.web_name}
          size="sm"
          shape="squircle"
          candidates={player.photo?.candidates}
          ring={ring}
        />
        <div className="min-w-0 flex-1">{identity}</div>
        <div className="flex shrink-0 items-center gap-2.5">
          <PriceTag price={player.price} delta={player.price_change_start} size="xs" />
          <XpBadge xp={xp} size="xs" tone="accent" />
          {actions}
        </div>
      </Card>
    );
  }

  /* ---------------------------------------------------------------- wide -- */
  if (variant === 'wide') {
    return (
      <Card
        {...clickProps}
        radius="xl"
        padding="md"
        interactive={interactive}
        className={cn(shell, 'flex flex-col gap-4 lg:flex-row lg:items-center')}
        style={selectedStyle}
        aria-label={`${player.web_name}, ${player.position}, ${player.team}`}
      >
        <div className="flex min-w-0 flex-1 items-center gap-3.5">
          <PlayerImage
            code={player.code}
            name={player.web_name}
            size="lg"
            shape="squircle"
            candidates={player.photo?.candidates}
            ring={ring}
          />
          <div className="min-w-0 flex-1">
            {identity}
            <div className="mt-2 max-w-[260px]">
              <XpUncertainty prediction={player.prediction} compact />
            </div>
          </div>
        </div>

        <div className="grid shrink-0 grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <MetaStat label="Price" value={money(player.price)} />
          <MetaStat label="xP" value={xp === null ? NO_DATA : num(xp, 2)} />
          <MetaStat label="Owned" value={fmtOwnership(player.ownership)} />
          <MetaStat label="Form" value={num(player.form, 1)} />
        </div>

        {showFixtures && player.horizon ? (
          <div className="min-w-0 shrink-0 lg:max-w-[280px]">
            <FixtureTicker fixtures={player.horizon.per_event} max={5} size="xs" />
          </div>
        ) : null}

        {children ? <div className="min-w-0 shrink-0 lg:w-[140px]">{children}</div> : null}
        {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
      </Card>
    );
  }

  /* ------------------------------------------------------------- default -- */
  return (
    <Card
      {...clickProps}
      radius="xl"
      padding="md"
      interactive={interactive}
      className={cn(shell, 'flex flex-col gap-3.5')}
      style={selectedStyle}
      aria-label={`${player.web_name}, ${player.position}, ${player.team}`}
    >
      <div className="flex items-start gap-3">
        <PlayerImage
          code={player.code}
          name={player.web_name}
          size="lg"
          shape="squircle"
          candidates={player.photo?.candidates}
          ring={ring}
        />
        <div className="min-w-0 flex-1 pt-0.5">{identity}</div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <PriceTag price={player.price} delta={player.price_change_start} size="sm" />
          {actions}
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-2">
          <span className="text-[11px] font-medium uppercase tracking-[0.07em] text-text-faint">
            Expected points
          </span>
          <XpBadge xp={xp} size="sm" tone="accent" />
        </div>
        <XpUncertainty prediction={player.prediction} />
      </div>

      <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
        <MetaStat label="Owned" value={fmtOwnership(player.ownership)} />
        <MetaStat label="Form" value={num(player.form, 1)} />
        <MetaStat label="Pts/£m" value={num(player.value_per_million, 2)} />
      </div>

      {showFixtures && player.horizon ? (
        <FixtureTicker fixtures={player.horizon.per_event} max={5} size="xs" />
      ) : null}

      {children ? <div className="min-w-0">{children}</div> : null}
    </Card>
  );
}

/* --------------------------------------------------- PlayerCardSkeleton --- */

export type PlayerCardSkeletonProps = {
  variant?: PlayerCardVariant;
  className?: string;
};

/** Layout-matched placeholder, so a loading grid does not reflow on arrival. */
export function PlayerCardSkeleton({ variant = 'default', className }: PlayerCardSkeletonProps) {
  if (variant === 'compact') {
    return (
      <Card radius="md" padding="none" className={cn('flex items-center gap-3 p-2.5', className)}>
        <Skeleton variant="block" className="h-[40px] w-[40px] rounded-[13px]" />
        <div className="flex-1 space-y-1.5">
          <Skeleton variant="text" width="52%" />
          <Skeleton variant="text" width="34%" />
        </div>
        <Skeleton variant="pill" width={54} />
      </Card>
    );
  }

  if (variant === 'wide') {
    return (
      <Card radius="xl" padding="md" className={cn('flex items-center gap-4', className)}>
        <Skeleton variant="block" className="h-[80px] w-[80px] rounded-[24px]" />
        <div className="flex-1 space-y-2">
          <Skeleton variant="text" width="30%" />
          <Skeleton variant="text" width="18%" />
          <Skeleton height={10} className="rounded-[999px]" width="60%" />
        </div>
        <Skeleton variant="pill" width={120} />
      </Card>
    );
  }

  return (
    <Card radius="xl" padding="md" className={cn('flex flex-col gap-3.5', className)}>
      <div className="flex items-start gap-3">
        <Skeleton variant="block" className="h-[80px] w-[80px] rounded-[24px]" />
        <div className="flex-1 space-y-2 pt-1">
          <Skeleton variant="text" width="64%" />
          <Skeleton variant="text" width="42%" />
        </div>
        <Skeleton variant="pill" width={56} />
      </div>
      <Skeleton height={10} className="rounded-[999px]" />
      <div className="grid grid-cols-3 gap-3 border-t border-border pt-3">
        <Skeleton variant="text" width="70%" />
        <Skeleton variant="text" width="70%" />
        <Skeleton variant="text" width="70%" />
      </div>
    </Card>
  );
}
