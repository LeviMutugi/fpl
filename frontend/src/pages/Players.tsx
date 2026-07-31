import { LayoutGrid, Rows3, Search, SlidersHorizontal } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Sparkline } from '@/components/charts';
import { AvailabilityDot, PlayerCard, PlayerImage, TeamBadge } from '@/components/football';
import { PageHeader, Section } from '@/components/layout';
import {
  Badge,
  Button,
  Card,
  CardBody,
  EmptyState,
  ErrorState,
  Input,
  SegmentedControl,
  Select,
  SkeletonRows,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
  nextSort,
  type SortState,
} from '@/components/ui';
import { NO, money, num, pct } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { useUiStore } from '@/lib/uiStore';
import { usePlayers, useTeams } from '@/hooks/useEngine';
import type { PlayerRow } from '@/types/api';

/**
 * The research table. Sorting happens server-side so the ordering is over the
 * whole player set, not just the page you can see — a client-side sort of the
 * first 200 rows would quietly answer a different question.
 */

const SORTS: { value: string; label: string }[] = [
  { value: 'xp', label: 'xP this gameweek' },
  { value: 'xp_horizon', label: 'xP over horizon' },
  { value: 'value', label: 'xP per £m' },
  { value: 'price', label: 'Price' },
  { value: 'ownership', label: 'Ownership' },
  { value: 'points', label: 'Points last season' },
  { value: 'xgi90', label: 'xGI per 90' },
  { value: 'minutes', label: 'Minutes played' },
  { value: 'name', label: 'Name' },
];

const POSITIONS = ['ALL', 'GKP', 'DEF', 'MID', 'FWD'];

function PlayerRowCells({ player, onOpen }: { player: PlayerRow; onOpen: () => void }) {
  const spark = player.horizon?.per_event.map((entry) => entry.xp) ?? [];
  return (
    <TableRow onClick={onOpen} interactive>
      <TableCell>
        <div className="flex items-center gap-2.5">
          <PlayerImage
            code={player.code}
            name={player.web_name}
            candidates={player.photo.candidates}
            size="xs"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate font-medium">{player.web_name}</span>
              <AvailabilityDot
                status={player.status}
                news={player.news}
                chanceOfPlaying={player.chance_of_playing}
                availability={player.availability}
              />
            </div>
            <div className="flex items-center gap-1.5 text-[11.5px] text-text-faint">
              <TeamBadge code={player.team_code} name={player.team} size="xs" />
              {player.team}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <Badge tone="neutral" variant="soft">
          {player.position}
        </Badge>
      </TableCell>
      <TableCell align="right" numeric>
        {money(player.price)}
      </TableCell>
      <TableCell align="right" numeric>
        {player.prediction ? num(player.prediction.xp, 2) : NO}
      </TableCell>
      <TableCell align="right" numeric>
        {player.prediction ? (
          <span className="text-text-faint">
            {num(player.prediction.p10, 0)}–{num(player.prediction.p90, 0)}
          </span>
        ) : (
          NO
        )}
      </TableCell>
      <TableCell align="right" numeric>
        {player.horizon ? num(player.horizon.xp_total, 1) : NO}
      </TableCell>
      <TableCell align="right" numeric>
        {player.value_per_million === null ? NO : num(player.value_per_million, 2)}
      </TableCell>
      <TableCell align="right" numeric>
        {pct(player.ownership)}
      </TableCell>
      <TableCell align="right" numeric>
        {player.season ? num(player.season.xgi90, 2) : NO}
      </TableCell>
      <TableCell align="right">
        {spark.length > 1 ? <Sparkline data={spark} width={72} height={22} /> : NO}
      </TableCell>
    </TableRow>
  );
}

export default function PlayersPage() {
  const navigate = useNavigate();
  const prefs = usePrefs();
  const dense = useUiStore((s) => s.dense);
  const teams = useTeams();

  const [search, setSearch] = useState('');
  const [position, setPosition] = useState('ALL');
  const [team, setTeam] = useState<number | null>(null);
  const [maxCost, setMaxCost] = useState(15);
  const [minMinutes, setMinMinutes] = useState(0);
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [sort, setSort] = useState<SortState>({ key: 'xp', direction: 'desc' });
  const [view, setView] = useState<'table' | 'cards'>('table');

  const deferredSearch = useDeferredValue(search);

  const query = useMemo(
    () => ({
      model: prefs.model,
      horizon: prefs.horizon,
      position: position === 'ALL' ? undefined : position,
      team: team ?? undefined,
      maxCost: maxCost < 15 ? maxCost : undefined,
      minMinutes: minMinutes > 0 ? minMinutes : undefined,
      search: deferredSearch || undefined,
      sort: sort.key,
      order: sort.direction,
      onlyAvailable: onlyAvailable || undefined,
      limit: 400,
    }),
    [prefs.model, prefs.horizon, position, team, maxCost, minMinutes, deferredSearch, sort, onlyAvailable],
  );

  const players = usePlayers(query);
  const rows = players.data?.players ?? [];

  return (
    <>
      <PageHeader
        title="Player explorer"
        subtitle={
          players.data
            ? `${players.data.total.toLocaleString()} players · GW${players.data.event} · ${players.data.model}`
            : 'Loading the player set…'
        }
        actions={
          <SegmentedControl
            value={view}
            onChange={(value) => setView(value as typeof view)}
            options={[
              { value: 'table', label: 'Table', icon: <Rows3 className="size-3.5" /> },
              { value: 'cards', label: 'Cards', icon: <LayoutGrid className="size-3.5" /> },
            ]}
          />
        }
      />

      <Card>
        <CardBody className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Input
            label="Search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Name…"
            icon={<Search className="size-4" />}
          />
          <div className="space-y-1.5">
            <span className="text-[12.5px] font-medium text-text-muted">Position</span>
            <SegmentedControl
              value={position}
              onChange={setPosition}
              options={POSITIONS.map((value) => ({ value, label: value === 'ALL' ? 'All' : value }))}
            />
          </div>
          <Select
            label="Club"
            value={team === null ? '' : String(team)}
            onChange={(value) => setTeam(value ? Number(value) : null)}
            options={[
              { value: '', label: 'All clubs' },
              ...(teams.data ?? []).map((t) => ({ value: String(t.id), label: t.name })),
            ]}
          />
          <Select
            label="Sort by"
            value={sort.key}
            onChange={(value) => setSort({ key: value, direction: value === 'name' ? 'asc' : 'desc' })}
            options={SORTS}
          />
          <Slider
            label="Max price"
            min={4}
            max={15}
            step={0.5}
            value={maxCost}
            onChange={setMaxCost}
            format={(value) => (value >= 15 ? 'any' : money(value))}
          />
          <Slider
            label="Minimum minutes last season"
            min={0}
            max={3000}
            step={100}
            value={minMinutes}
            onChange={setMinMinutes}
            format={(value) => (value === 0 ? 'any' : `${value}′`)}
          />
          <div className="flex items-end">
            <Button
              variant={onlyAvailable ? 'primary' : 'secondary'}
              size="sm"
              onClick={() => setOnlyAvailable((value) => !value)}
            >
              <SlidersHorizontal className="size-3.5" />
              Available only
            </Button>
          </div>
        </CardBody>
      </Card>

      <Section title="Results">
        {players.isLoading && <SkeletonRows rows={8} />}
        {players.isError && <ErrorState error={players.error} onRetry={() => void players.refetch()} />}
        {players.data && rows.length === 0 && (
          <EmptyState
            title="No players match those filters"
            description="Try widening the price range or clearing the club filter."
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  setSearch('');
                  setPosition('ALL');
                  setTeam(null);
                  setMaxCost(15);
                  setMinMinutes(0);
                  setOnlyAvailable(false);
                }}
              >
                Reset filters
              </Button>
            }
          />
        )}

        {rows.length > 0 && view === 'table' && (
          <Card padded={false}>
            <Table dense={dense}>
              <TableHead>
                <TableRow>
                  <TableHeaderCell
                    sort={sort.key === 'name' ? sort.direction : undefined}
                    onSort={() => setSort(nextSort(sort, 'name'))}
                  >
                    Player
                  </TableHeaderCell>
                  <TableHeaderCell>Pos</TableHeaderCell>
                  <TableHeaderCell
                    align="right"
                    sort={sort.key === 'price' ? sort.direction : undefined}
                    onSort={() => setSort(nextSort(sort, 'price'))}
                  >
                    Price
                  </TableHeaderCell>
                  <TableHeaderCell
                    align="right"
                    sort={sort.key === 'xp' ? sort.direction : undefined}
                    onSort={() => setSort(nextSort(sort, 'xp'))}
                  >
                    xP
                  </TableHeaderCell>
                  <TableHeaderCell align="right">p10–p90</TableHeaderCell>
                  <TableHeaderCell
                    align="right"
                    sort={sort.key === 'xp_horizon' ? sort.direction : undefined}
                    onSort={() => setSort(nextSort(sort, 'xp_horizon'))}
                  >
                    {prefs.horizon}GW
                  </TableHeaderCell>
                  <TableHeaderCell
                    align="right"
                    sort={sort.key === 'value' ? sort.direction : undefined}
                    onSort={() => setSort(nextSort(sort, 'value'))}
                  >
                    xP/£m
                  </TableHeaderCell>
                  <TableHeaderCell
                    align="right"
                    sort={sort.key === 'ownership' ? sort.direction : undefined}
                    onSort={() => setSort(nextSort(sort, 'ownership'))}
                  >
                    Owned
                  </TableHeaderCell>
                  <TableHeaderCell
                    align="right"
                    sort={sort.key === 'xgi90' ? sort.direction : undefined}
                    onSort={() => setSort(nextSort(sort, 'xgi90'))}
                  >
                    xGI/90
                  </TableHeaderCell>
                  <TableHeaderCell align="right">Run</TableHeaderCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.map((player) => (
                  <PlayerRowCells
                    key={player.id}
                    player={player}
                    onOpen={() => navigate(`/players/${player.id}`)}
                  />
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {rows.length > 0 && view === 'cards' && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.slice(0, 60).map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                onSelect={(id) => navigate(`/players/${id}`)}
              >
                {player.horizon && player.horizon.per_event.length > 1 && (
                  <Sparkline data={player.horizon.per_event.map((entry) => entry.xp)} height={26} />
                )}
              </PlayerCard>
            ))}
          </div>
        )}
      </Section>
    </>
  );
}
