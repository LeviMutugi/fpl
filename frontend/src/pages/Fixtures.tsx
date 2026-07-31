import { CalendarRange, Shield, Swords } from 'lucide-react';
import { useMemo, useState } from 'react';

import { HeatmapGrid, type HeatmapRow } from '@/components/charts';
import { FixtureTicker, TeamBadge } from '@/components/football';
import { StatTile } from '@/components/kokonut';
import { MetricRow, PageHeader, Section } from '@/components/layout';
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  SegmentedControl,
  SkeletonRows,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { NO_DATA, num } from '@/lib/format';
import { useFdr, useMeta, useTeams } from '@/hooks/useEngine';
import type { FdrTeamRow } from '@/types/api';

/**
 * The fixture planner. Two different readings of the same fixture sit side by
 * side here on purpose: the game's own 1–5 difficulty, and the engine's
 * league-relative attack/defence indices. Blending them would hide which one is
 * driving a decision, so the grid shows the digit and the lists show the index.
 */

/** Window lengths offered by the picker, in gameweeks. */
const WINDOWS = [4, 6, 8, 12] as const;
type WindowLength = (typeof WINDOWS)[number];

type SortKey = 'attack' | 'defence';

/**
 * `/fdr` returns `null` for a team with no fixture at all in the window, which
 * the shared type states as a plain number. Narrow it here rather than treating
 * a missing average as zero.
 */
type FdrTeam = Omit<FdrTeamRow, 'attack_score' | 'defence_score'> & {
  attack_score: number | null;
  defence_score: number | null;
};

function errorProps(error: unknown): {
  detail: string;
  hint: string | null;
  tone: 'error' | 'unavailable';
} {
  // The backend writes `detail`/`hint` for humans — pass them through verbatim.
  if (error instanceof ApiRequestError) {
    return {
      detail: error.detail,
      hint: error.hint ?? null,
      tone: error.isUnavailable ? 'unavailable' : 'error',
    };
  }
  return {
    detail: error instanceof Error ? error.message : String(error),
    hint: null,
    tone: 'error',
  };
}

/** Mean of the game's own difficulty across every fixture a team has in the window. */
function meanDifficulty(team: FdrTeam): number | null {
  const values = team.cells.flatMap((cell) => cell.fixtures.map((fixture) => fixture.difficulty));
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** One ranked run — attack or defence — with the fixtures that produced it. */
function RunRow({
  team,
  score,
  badgeCode,
  rank,
}: {
  team: FdrTeam;
  score: number | null;
  badgeCode: number | null;
  rank: number;
}) {
  return (
    <li className="flex flex-wrap items-center gap-3 rounded-[16px] px-2 py-2 hover:bg-surface-sunken">
      <span className="w-5 shrink-0 text-right text-[12px] tabular-nums text-text-faint">{rank}</span>
      {badgeCode === null ? null : (
        <TeamBadge code={badgeCode} name={team.short_name} size="sm" primaryHex={team.primary_hex} />
      )}
      <span className="w-11 shrink-0 text-[13px] font-semibold">{team.short_name}</span>
      <FixtureTicker
        size="xs"
        max={12}
        fixtures={team.cells.flatMap((cell) =>
          cell.fixtures.map((fixture) => ({
            event: cell.event,
            opponent: fixture.opponent,
            is_home: fixture.is_home,
            difficulty: fixture.difficulty,
          })),
        )}
        emptyLabel="No fixtures in this window"
      />
      <span className="ml-auto font-display text-[15px] font-semibold tabular-nums">
        {score === null ? <span className="text-text-faint">{NO_DATA}</span> : num(score, 2)}
      </span>
    </li>
  );
}

export default function FixturesPage() {
  const meta = useMeta();
  const teams = useTeams();
  const [length, setLength] = useState<WindowLength>(8);
  const [sortKey, setSortKey] = useState<SortKey>('attack');

  // The planner always starts at the gameweek you can still make transfers for.
  const startEvent = meta.data?.next_event ?? meta.data?.current_event ?? null;
  const from = startEvent ?? 1;
  const to = from + length - 1;
  const fdr = useFdr(from, to);

  const badgeByTeamId = useMemo(() => {
    const map = new Map<number, number>();
    for (const team of teams.data ?? []) map.set(team.id, team.code);
    return map;
  }, [teams.data]);

  const rows = useMemo<FdrTeam[]>(() => (fdr.data?.teams ?? []) as FdrTeam[], [fdr.data]);

  const events = useMemo(() => {
    const first = fdr.data?.from_event ?? from;
    const last = fdr.data?.to_event ?? to;
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, index) => first + index);
  }, [fdr.data, from, to]);

  /** A gameweek where at least one club plays twice, or not at all. */
  const shape = useMemo(() => {
    const blanks: number[] = [];
    const doubles: number[] = [];
    for (const event of events) {
      let hasBlank = false;
      let hasDouble = false;
      for (const team of rows) {
        const count = team.cells.find((cell) => cell.event === event)?.fixtures.length ?? 0;
        if (count === 0) hasBlank = true;
        if (count > 1) hasDouble = true;
      }
      if (hasBlank) blanks.push(event);
      if (hasDouble) doubles.push(event);
    }
    return { blanks, doubles };
  }, [events, rows]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    // Attack index above 1 means an easier defence to play into, so higher is
    // better. Defence index above 1 means a stronger opponent attack, so lower
    // is better. Teams with no fixtures at all sink to the bottom either way.
    copy.sort((a, b) => {
      if (sortKey === 'attack') {
        return (b.attack_score ?? -Infinity) - (a.attack_score ?? -Infinity);
      }
      return (a.defence_score ?? Infinity) - (b.defence_score ?? Infinity);
    });
    return copy;
  }, [rows, sortKey]);

  const heatRows = useMemo<HeatmapRow[]>(
    () =>
      sorted.map((team) => ({
        id: String(team.team_id),
        label: team.short_name,
        summary: meanDifficulty(team),
        cells: team.cells.map((cell) => ({
          event: cell.event,
          entries: cell.fixtures.map((fixture) => ({
            difficulty: fixture.difficulty,
            label: fixture.opponent,
            isHome: fixture.is_home,
            detail: `attack index ${num(fixture.attack_index, 2)} · defence index ${num(
              fixture.defence_index,
              2,
            )}`,
          })),
        })),
      })),
    [sorted],
  );

  const attackRuns = useMemo(
    () =>
      [...rows]
        .filter((team) => team.attack_score !== null)
        .sort((a, b) => (b.attack_score ?? 0) - (a.attack_score ?? 0))
        .slice(0, 8),
    [rows],
  );

  const defenceRuns = useMemo(
    () =>
      [...rows]
        .filter((team) => team.defence_score !== null)
        .sort((a, b) => (a.defence_score ?? 0) - (b.defence_score ?? 0))
        .slice(0, 8),
    [rows],
  );

  if (meta.isError) {
    return (
      <ErrorState
        title="Could not load the gameweek calendar"
        {...errorProps(meta.error)}
        onRetry={() => void meta.refetch()}
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Fixture planner"
        icon={<CalendarRange className="size-5" />}
        subtitle={
          startEvent
            ? `Difficulty and fixture congestion from GW${from} to GW${to}.`
            : 'Waiting for the calendar to publish a next gameweek.'
        }
        actions={
          <SegmentedControl<string>
            ariaLabel="Planning window length"
            value={String(length)}
            onChange={(value) => setLength(Number(value) as WindowLength)}
            options={WINDOWS.map((option) => ({ value: String(option), label: `${option} GW` }))}
          />
        }
      />

      <MetricRow loading={fdr.isLoading}>
        <StatTile
          label="Window"
          value={events.length === 0 ? null : events.length}
          decimals={0}
          hint={startEvent ? `GW${from} – GW${to}` : 'no next gameweek published'}
        />
        <StatTile
          label="Teams in the grid"
          value={rows.length === 0 ? null : rows.length}
          decimals={0}
          hint="Every club with a published calendar"
        />
        <StatTile
          label="Blank gameweeks"
          value={fdr.data ? shape.blanks.length : null}
          decimals={0}
          hint={shape.blanks.length > 0 ? shape.blanks.map((e) => `GW${e}`).join(', ') : 'none in this window'}
        />
        <StatTile
          label="Double gameweeks"
          value={fdr.data ? shape.doubles.length : null}
          decimals={0}
          hint={
            shape.doubles.length > 0 ? shape.doubles.map((e) => `GW${e}`).join(', ') : 'none in this window'
          }
        />
      </MetricRow>

      <Section
        title="Difficulty grid"
        description={
          <>
            <code className="font-mono text-[12px] text-text">difficulty</code> is the game's own 1–5
            rating and is always printed inside the cell, so colour is never the only channel.{' '}
            <code className="font-mono text-[12px] text-text">attack_index</code> and{' '}
            <code className="font-mono text-[12px] text-text">defence_index</code> are the model's
            league-relative view of the same fixture and are what the xP numbers actually use. The two
            are shown side by side rather than blended into one score.
          </>
        }
        actions={
          <SegmentedControl<SortKey>
            ariaLabel="Sort teams by"
            value={sortKey}
            onChange={setSortKey}
            options={[
              { value: 'attack', label: 'Attack' },
              { value: 'defence', label: 'Defence' },
            ]}
          />
        }
      >
        {fdr.isLoading && <SkeletonRows rows={8} />}
        {fdr.isError && (
          <ErrorState
            title="Could not load the fixture grid"
            {...errorProps(fdr.error)}
            onRetry={() => void fdr.refetch()}
          />
        )}
        {fdr.data && heatRows.length === 0 && (
          <EmptyState
            title="No fixtures in this window"
            description="The published calendar has nothing scheduled between these gameweeks."
            icon={CalendarRange}
          />
        )}
        {fdr.data && heatRows.length > 0 && (
          <Card padding="sm">
            {/* Twelve gameweeks never fit a phone, so the grid — and only the
                grid — scrolls sideways inside its own frame. */}
            <div className="overflow-x-auto scrollbar-slim">
              <div style={{ minWidth: 120 + events.length * 62 }}>
                <HeatmapGrid
                  ariaLabel={`Fixture difficulty from gameweek ${from} to gameweek ${to}`}
                  rows={heatRows}
                  columns={events.map((event) => ({ event, label: `GW${event}` }))}
                  summaryLabel="FDR"
                  formatSummary={(value) => value.toFixed(1)}
                  tableCaption={`Fixture difficulty, GW${from} to GW${to}`}
                />
              </div>
            </div>
            <CardBody className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 text-[12.5px] text-text-muted">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-3 w-6 rounded-[6px] bg-surface-sunken ring-1 ring-border" />
                Blank gameweek — no fixture, not missing data
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-flex gap-0.5">
                  <span className="inline-block h-3 w-3 rounded-[4px] bg-[color:var(--color-fdr-2)]" />
                  <span className="inline-block h-3 w-3 rounded-[4px] bg-[color:var(--color-fdr-4)]" />
                </span>
                Double gameweek — the cell splits in two
              </span>
              <span className="uppercase tracking-[0.06em] text-text-faint">
                UPPERCASE = home · lowercase = away
              </span>
            </CardBody>
          </Card>
        )}
      </Section>

      {fdr.data && (shape.blanks.length > 0 || shape.doubles.length > 0) && (
        <Section
          title="Blanks and doubles in this window"
          description="Read from the published calendar as it currently stands; cup and European rescheduling moves these."
          spacing="sm"
        >
          <Card>
            <CardBody className="flex flex-wrap gap-2">
              {shape.blanks.length === 0 ? (
                <Badge tone="neutral">No blank gameweeks</Badge>
              ) : (
                shape.blanks.map((event) => (
                  <Badge key={`blank-${event}`} tone="warning" dot>
                    GW{event} blank
                  </Badge>
                ))
              )}
              {shape.doubles.length === 0 ? (
                <Badge tone="neutral">No double gameweeks</Badge>
              ) : (
                shape.doubles.map((event) => (
                  <Badge key={`double-${event}`} tone="good" dot>
                    GW{event} double
                  </Badge>
                ))
              )}
            </CardBody>
          </Card>
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Best attacking runs"
          description="Mean attack_index over the window. Above 1 means the opponents' defences are weaker than league average once venue is applied."
          icon={<Swords className="size-4" />}
        >
          {fdr.isLoading && <SkeletonRows rows={4} />}
          {fdr.data && attackRuns.length === 0 && (
            <EmptyState title="No attack scores" description="No team has a fixture in this window." />
          )}
          {attackRuns.length > 0 && (
            <Card>
              <CardBody>
                <ol className="space-y-1">
                  {attackRuns.map((team, index) => (
                    <RunRow
                      key={team.team_id}
                      team={team}
                      rank={index + 1}
                      score={team.attack_score}
                      badgeCode={badgeByTeamId.get(team.team_id) ?? null}
                    />
                  ))}
                </ol>
              </CardBody>
            </Card>
          )}
        </Section>

        <Section
          title="Best defensive runs"
          description="Mean defence_index over the window. Below 1 means the opponents' attacks are weaker than league average — clean sheets are more likely."
          icon={<Shield className="size-4" />}
        >
          {fdr.isLoading && <SkeletonRows rows={4} />}
          {fdr.data && defenceRuns.length === 0 && (
            <EmptyState title="No defence scores" description="No team has a fixture in this window." />
          )}
          {defenceRuns.length > 0 && (
            <Card>
              <CardBody>
                <ol className="space-y-1">
                  {defenceRuns.map((team, index) => (
                    <RunRow
                      key={team.team_id}
                      team={team}
                      rank={index + 1}
                      score={team.defence_score}
                      badgeCode={badgeByTeamId.get(team.team_id) ?? null}
                    />
                  ))}
                </ol>
              </CardBody>
            </Card>
          )}
        </Section>
      </div>
    </>
  );
}
