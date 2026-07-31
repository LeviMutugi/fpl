import { ArrowRight, Repeat, Search, Trash2, Wand2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { PlayerImage, PositionPill, TeamBadge } from '@/components/football';
import { StatTile } from '@/components/kokonut';
import { MetricRow, PageHeader, Section, Toolbar, ToolbarGroup } from '@/components/layout';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Input,
  SegmentedControl,
  SkeletonRows,
  Table,
  TableBody,
  TableCell,
  TableFrame,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { ApiRequestError } from '@/lib/api';
import { money, num, signed } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { useMeta, useOptimize, usePlayers, useTeams } from '@/hooks/useEngine';
import type { OptimizeRequest, OptimizeResponse, PlayerRow } from '@/types/api';

/**
 * The transfer planner. Everything on this page is the solver's answer to a
 * question you asked it — so the constraints you set, the notes it returns and
 * the constraints that actually bound the solution are all shown next to the
 * squad, rather than a bare list of swaps you have to take on trust.
 */

const SQUAD_SIZE = 15;

/** The solver's own commentary, which the shared response type does not carry yet. */
type SolveResult = OptimizeResponse & { notes?: string[]; pool_size?: number };

type Mode = 'existing' | 'scratch';

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

const POSITION_ORDER = ['GKP', 'DEF', 'MID', 'FWD'] as const;
/** The game's own squad shape, shown as a target rather than enforced here. */
const POSITION_TARGET: Record<(typeof POSITION_ORDER)[number], number> = {
  GKP: 2,
  DEF: 5,
  MID: 5,
  FWD: 3,
};

export default function TransfersPage() {
  const prefs = usePrefs();
  const meta = useMeta();
  const teams = useTeams();
  const optimize = useOptimize();

  const [mode, setMode] = useState<Mode>('existing');
  const [query, setQuery] = useState('');
  const [squad, setSquad] = useState<PlayerRow[]>([]);
  const [bank, setBank] = useState(0);
  const [budget, setBudget] = useState(100);
  const [freeTransfers, setFreeTransfers] = useState(1);
  const [horizon, setHorizon] = useState(prefs.horizon);
  const [maxPerTeam, setMaxPerTeam] = useState(3);
  const [transferPenalty, setTransferPenalty] = useState(4);

  const search = usePlayers({
    model: prefs.model,
    horizon,
    search: query.trim().length > 0 ? query.trim() : undefined,
    sort: 'xp',
    order: 'desc',
    limit: 20,
  });

  const badgeByTeamId = useMemo(() => {
    const map = new Map<number, number>();
    for (const team of teams.data ?? []) map.set(team.id, team.code);
    return map;
  }, [teams.data]);

  const squadCost = useMemo(
    () => squad.reduce((total, player) => total + player.price, 0),
    [squad],
  );

  const counts = useMemo(() => {
    const tally: Record<string, number> = { GKP: 0, DEF: 0, MID: 0, FWD: 0 };
    for (const player of squad) tally[player.position] = (tally[player.position] ?? 0) + 1;
    return tally;
  }, [squad]);

  const chosen = useMemo(() => new Set(squad.map((player) => player.id)), [squad]);
  const result = optimize.data as SolveResult | undefined;

  // With an existing squad the money you can spend is what the squad is already
  // worth plus whatever is in the bank; from scratch it is just the budget.
  const effectiveBudget = mode === 'existing' ? Number((squadCost + bank).toFixed(1)) : budget;

  function plan() {
    const request: OptimizeRequest = {
      budget: effectiveBudget,
      horizon,
      model: prefs.model,
      max_per_team: maxPerTeam,
      free_transfers: freeTransfers,
      transfer_penalty: transferPenalty,
    };
    if (mode === 'existing' && squad.length > 0) {
      request.existing_squad = squad.map((player) => player.id);
    }
    optimize.mutate(request);
  }

  const wildcardStyle = mode === 'scratch' || squad.length === 0;

  return (
    <>
      <PageHeader
        title="Transfer planner"
        icon={<Repeat className="size-5" />}
        subtitle={
          meta.data?.next_event
            ? `Solved against the ${prefs.model} model for GW${meta.data.next_event} over ${horizon} gameweeks.`
            : `Solved against the ${prefs.model} model over ${horizon} gameweeks.`
        }
        actions={
          <SegmentedControl<Mode>
            ariaLabel="Planning mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'existing', label: 'From my squad' },
              { value: 'scratch', label: 'Build from scratch' },
            ]}
          />
        }
      />

      {mode === 'scratch' && (
        <Card tone="sunken" className="mb-6">
          <CardBody className="text-[13px] leading-relaxed text-text-muted">
            With no existing squad the solver has nothing to transfer <em>out of</em>. What comes back
            is a wildcard-style squad: the best fifteen it can buy inside the budget, not a set of
            swaps. No hit is ever charged in this mode because no transfer is being made.
          </CardBody>
        </Card>
      )}

      <Section
        title="Constraints"
        description="Everything the solver is told. Nothing here is inferred from your FPL account — the engine has no login."
      >
        <Toolbar ariaLabel="Solver constraints">
          <ToolbarGroup label="Bank">
            <Input
              label="Bank"
              hideLabel
              type="number"
              step="0.1"
              min="0"
              size="sm"
              className="w-24"
              value={mode === 'existing' ? bank : budget}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (!Number.isFinite(value)) return;
                if (mode === 'existing') setBank(value);
                else setBudget(value);
              }}
            />
          </ToolbarGroup>
          <ToolbarGroup label="Free transfers">
            <Input
              label="Free transfers"
              hideLabel
              type="number"
              min="0"
              max="5"
              size="sm"
              className="w-20"
              value={freeTransfers}
              onChange={(event) => setFreeTransfers(Math.max(0, Number(event.target.value) || 0))}
            />
          </ToolbarGroup>
          <ToolbarGroup label="Horizon">
            <Input
              label="Horizon"
              hideLabel
              type="number"
              min="1"
              max="12"
              size="sm"
              className="w-20"
              value={horizon}
              onChange={(event) =>
                setHorizon(Math.min(12, Math.max(1, Number(event.target.value) || 1)))
              }
            />
          </ToolbarGroup>
          <ToolbarGroup label="Max per team">
            <Input
              label="Max per team"
              hideLabel
              type="number"
              min="1"
              max="15"
              size="sm"
              className="w-20"
              value={maxPerTeam}
              onChange={(event) =>
                setMaxPerTeam(Math.min(15, Math.max(1, Number(event.target.value) || 1)))
              }
            />
          </ToolbarGroup>
          <ToolbarGroup label="Hit cost">
            <Input
              label="Points per hit"
              hideLabel
              type="number"
              min="0"
              step="1"
              size="sm"
              className="w-20"
              value={transferPenalty}
              onChange={(event) => setTransferPenalty(Math.max(0, Number(event.target.value) || 0))}
            />
          </ToolbarGroup>
        </Toolbar>
      </Section>

      <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
        <Section
          title="Your squad"
          description={`Click a player to add them. ${squad.length} of ${SQUAD_SIZE} picked.`}
          spacing="sm"
          actions={
            squad.length > 0 ? (
              <Button size="sm" variant="ghost" onClick={() => setSquad([])}>
                <Trash2 className="size-3.5" /> Clear
              </Button>
            ) : null
          }
        >
          <Card>
            <CardBody className="space-y-4">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px] text-text-muted">
                <span>
                  Squad value <span className="num font-semibold text-text">{money(squadCost)}</span>
                </span>
                <span>
                  Budget the solver gets{' '}
                  <span className="num font-semibold text-text">{money(effectiveBudget)}</span>
                </span>
                {POSITION_ORDER.map((position) => (
                  <Badge
                    key={position}
                    tone={counts[position] === POSITION_TARGET[position] ? 'good' : 'neutral'}
                  >
                    {position} {counts[position] ?? 0}/{POSITION_TARGET[position]}
                  </Badge>
                ))}
              </div>

              {squad.length === 0 ? (
                <EmptyState
                  size="sm"
                  title="No squad entered"
                  description="Add up to fifteen players to plan transfers, or switch to build-from-scratch for a wildcard-style squad."
                />
              ) : (
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {squad.map((player) => (
                    <li
                      key={player.id}
                      className="flex items-center gap-2 rounded-[14px] bg-surface-sunken px-2 py-1.5"
                    >
                      <PlayerImage
                        code={player.code}
                        name={player.web_name}
                        candidates={player.photo.candidates}
                        size="xs"
                      />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {player.web_name}
                      </span>
                      <PositionPill position={player.position} size="xs" />
                      <span className="num text-[12px] text-text-muted">{money(player.price)}</span>
                      <button
                        type="button"
                        aria-label={`Remove ${player.web_name}`}
                        className="rounded-[8px] p-1 text-text-faint transition-colors hover:bg-surface hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]"
                        onClick={() =>
                          setSquad((current) => current.filter((entry) => entry.id !== player.id))
                        }
                      >
                        <X className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </Section>

        <Section
          title="Add players"
          description="Searches the same prediction table the rest of the app reads."
          spacing="sm"
        >
          <Card>
            <CardBody className="space-y-3">
              <Input
                label="Search players"
                hideLabel
                placeholder="Search by name…"
                iconLeft={<Search className="size-4" />}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                block
              />
              {search.isLoading && <SkeletonRows rows={5} />}
              {search.isError && (
                <ErrorState
                  size="sm"
                  title="Player search failed"
                  {...errorProps(search.error)}
                  onRetry={() => void search.refetch()}
                />
              )}
              {search.data && search.data.players.length === 0 && (
                <EmptyState size="sm" title="No players match" description="Try a shorter search." />
              )}
              {search.data && search.data.players.length > 0 && (
                <ul className="max-h-[420px] space-y-1 overflow-y-auto scrollbar-slim">
                  {search.data.players.map((player) => {
                    const already = chosen.has(player.id);
                    return (
                      <li key={player.id}>
                        <button
                          type="button"
                          disabled={already || squad.length >= SQUAD_SIZE}
                          onClick={() => setSquad((current) => [...current, player])}
                          className="flex w-full items-center gap-2.5 rounded-[14px] px-2 py-1.5 text-left transition-colors hover:bg-surface-sunken disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--color-ring)]"
                        >
                          <PlayerImage
                            code={player.code}
                            name={player.web_name}
                            candidates={player.photo.candidates}
                            size="xs"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-medium">
                              {player.web_name}
                            </span>
                            <span className="block text-[11.5px] text-text-faint">
                              {player.team} · {money(player.price)}
                            </span>
                          </span>
                          <PositionPill position={player.position} size="xs" />
                          <span className="num w-12 text-right text-[12.5px] font-semibold">
                            {num(player.horizon?.xp_total ?? null, 1)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </Section>
      </div>

      <Section title="Plan" spacing="md">
        <div className="flex flex-wrap items-center gap-3">
          <Button loading={optimize.isPending} onClick={plan}>
            <Wand2 className="size-4" />
            {wildcardStyle ? 'Build a squad from scratch' : 'Plan transfers'}
          </Button>
          <span className="text-[12.5px] text-text-muted">
            {wildcardStyle
              ? 'No existing squad is sent, so the answer is a wildcard-style fifteen.'
              : `${squad.length} owned players sent as the starting point.`}
          </span>
        </div>

        {optimize.isPending && <SkeletonRows rows={5} className="mt-4" />}

        {optimize.isError && (
          <ErrorState
            className="mt-4"
            title="The solver could not return a squad"
            {...errorProps(optimize.error)}
            onRetry={plan}
          />
        )}

        {result && (
          <div className="mt-4 space-y-6">
            <MetricRow columns={4}>
              <StatTile
                label="Total xP"
                value={result.total_xp}
                decimals={2}
                hint={`XI ${num(result.xi_xp, 1)} · bench ${num(result.bench_xp, 1)}`}
              />
              <StatTile label="Squad cost" value={result.squad_cost} decimals={1} prefix="£" suffix="m" />
              <StatTile label="Bank left" value={result.bank} decimals={1} prefix="£" suffix="m" />
              <StatTile
                label="Hits"
                value={result.hits}
                decimals={0}
                hint={
                  result.hits > 0
                    ? `${result.hits * transferPenalty} points charged at ${transferPenalty} each`
                    : 'no points charged'
                }
              />
            </MetricRow>

            <Section
              title="Transfers"
              description={
                result.transfers && result.transfers.length > 0
                  ? 'Each swap is scored on total xP across the whole horizon, not just the next gameweek.'
                  : undefined
              }
              level={3}
              spacing="sm"
            >
              {!result.transfers || result.transfers.length === 0 ? (
                <EmptyState
                  size="sm"
                  title={wildcardStyle ? 'A fresh squad, not a set of swaps' : 'No transfer improves the squad'}
                  description={
                    wildcardStyle
                      ? 'No existing squad was sent, so there is nothing to transfer out of. The fifteen below are the wildcard-style answer.'
                      : 'Holding scores at least as well as anything the solver could buy inside the budget.'
                  }
                />
              ) : (
                <ul className="space-y-2">
                  {result.transfers.map((pair, index) => (
                    <li
                      key={`${pair.out?.id ?? 'out'}-${pair.in?.id ?? 'in'}-${index}`}
                      className="flex flex-wrap items-center gap-3 rounded-[18px] border border-border bg-surface p-3"
                    >
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {pair.out ? (
                          <>
                            <PlayerImage
                              code={pair.out.code}
                              name={pair.out.web_name}
                              candidates={pair.out.photo.candidates}
                              size="xs"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[13.5px] font-medium">
                                {pair.out.web_name}
                              </span>
                              <span className="block text-[11.5px] text-text-faint">
                                out · {money(pair.out.price)}
                              </span>
                            </span>
                          </>
                        ) : (
                          <span className="text-[13px] text-text-faint">no outgoing player returned</span>
                        )}
                      </div>
                      <ArrowRight className="size-4 shrink-0 text-text-faint" aria-hidden />
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {pair.in ? (
                          <>
                            <PlayerImage
                              code={pair.in.code}
                              name={pair.in.web_name}
                              candidates={pair.in.photo.candidates}
                              size="xs"
                            />
                            <span className="min-w-0">
                              <span className="block truncate text-[13.5px] font-medium">
                                {pair.in.web_name}
                              </span>
                              <span className="block text-[11.5px] text-text-faint">
                                in · {money(pair.in.price)}
                              </span>
                            </span>
                          </>
                        ) : (
                          <span className="text-[13px] text-text-faint">no incoming player returned</span>
                        )}
                      </div>
                      <span className="num ml-auto text-[14px] font-semibold">
                        {signed(pair.delta_xp, 2)}
                        <span className="ml-1 text-[11px] font-normal text-text-faint">xP</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section
              title="Resulting squad"
              description={`${result.formation} · captain and vice picked on expected points for the first gameweek.`}
              level={3}
              spacing="sm"
            >
              <TableFrame>
                <Table caption="Solved squad" captionVisible={false}>
                  <TableHead>
                    <TableRow>
                      <TableHeaderCell>Player</TableHeaderCell>
                      <TableHeaderCell>Pos</TableHeaderCell>
                      <TableHeaderCell>Team</TableHeaderCell>
                      <TableHeaderCell align="right">Price</TableHeaderCell>
                      <TableHeaderCell align="right">xP</TableHeaderCell>
                      <TableHeaderCell>Role</TableHeaderCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {[...result.xi, ...result.bench].map((player) => (
                      <TableRow key={player.id}>
                        <TableCell>
                          <Link
                            to={`/players/${player.id}`}
                            className="flex items-center gap-2 hover:text-accent"
                          >
                            <PlayerImage
                              code={player.code}
                              name={player.web_name}
                              candidates={player.photo.candidates}
                              size="xs"
                            />
                            <span className="truncate text-[13px] font-medium">{player.web_name}</span>
                          </Link>
                        </TableCell>
                        <TableCell>
                          <PositionPill position={player.position} size="xs" />
                        </TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5 text-[12.5px]">
                            {badgeByTeamId.has(player.team_id) ? (
                              <TeamBadge
                                code={badgeByTeamId.get(player.team_id)!}
                                name={player.team_name}
                                size="xs"
                              />
                            ) : null}
                            {player.team}
                          </span>
                        </TableCell>
                        <TableCell numeric>{money(player.price)}</TableCell>
                        <TableCell numeric>{num(player.prediction?.xp ?? null, 2)}</TableCell>
                        <TableCell>
                          <span className="flex flex-wrap gap-1">
                            <Badge tone={player.role === 'xi' ? 'accent' : 'neutral'} size="xs">
                              {player.role === 'xi' ? 'XI' : `Bench ${(player.bench_order ?? 0) + 1}`}
                            </Badge>
                            {player.is_captain && (
                              <Badge tone="pitch" size="xs">
                                C
                              </Badge>
                            )}
                            {player.is_vice && (
                              <Badge tone="neutral" size="xs">
                                V
                              </Badge>
                            )}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableFrame>
            </Section>

            <div className="grid gap-6 lg:grid-cols-2">
              <Section
                title="What is binding"
                description="The constraints with no slack left are the ones actually shaping this squad."
                level={3}
                spacing="sm"
              >
                <Card>
                  <CardBody>
                    {result.binding.length === 0 ? (
                      <p className="text-[13px] text-text-muted">
                        The solver did not report a binding constraint for this solve.
                      </p>
                    ) : (
                      <ul className="space-y-2.5">
                        {result.binding.map((entry) => (
                          <li key={entry.constraint} className="text-[13px]">
                            <span className="font-medium">{entry.constraint}</span>{' '}
                            <span className="num text-text-faint">slack {num(entry.slack, 2)}</span>
                            <p className="mt-0.5 leading-relaxed text-text-muted">{entry.note}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>
              </Section>

              <Section
                title="Expected points per gameweek"
                description="The starting XI's xP in each gameweek of the horizon, with the captain the solver would pick."
                level={3}
                spacing="sm"
              >
                <Card>
                  <CardBody>
                    {result.per_event.length === 0 ? (
                      <p className="text-[13px] text-text-muted">
                        The solve returned no per-gameweek breakdown.
                      </p>
                    ) : (
                      <ul className="space-y-1.5">
                        {result.per_event.map((entry) => (
                          <li
                            key={entry.event}
                            className="flex items-center gap-3 text-[13px] tabular-nums"
                          >
                            <span className="w-14 shrink-0 text-text-faint">GW{entry.event}</span>
                            <span className="w-16 font-semibold">{num(entry.xi_xp, 1)}</span>
                            <span className="min-w-0 truncate text-text-muted">
                              {entry.captain ? `(C) ${entry.captain}` : 'no captain returned'}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardBody>
                </Card>
              </Section>
            </div>

            <Section
              title="Solver notes"
              description="Returned by the optimiser itself and shown verbatim — they state what the search actually covered."
              level={3}
              spacing="sm"
            >
              <Card tone="sunken">
                <CardHeader>
                  <CardTitle
                    as="h4"
                    subtitle={`${result.status} · solved in ${result.solve_ms}ms · run ${result.run_id}`}
                  >
                    {result.solve_id}
                  </CardTitle>
                </CardHeader>
                <CardBody>
                  {!result.notes || result.notes.length === 0 ? (
                    <p className="text-[13px] text-text-muted">This solve returned no notes.</p>
                  ) : (
                    <ul className="list-disc space-y-1.5 pl-5 text-[13px] leading-relaxed text-text-muted">
                      {result.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </Section>
          </div>
        )}
      </Section>
    </>
  );
}
