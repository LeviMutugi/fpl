import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ScatterPlot } from '@/components/charts';
import { PlayerImage, TeamBadge } from '@/components/football';
import { QueryError } from '@/components/QueryState';
import { PageHeader, Section } from '@/components/layout';
import {
  Badge,
  Card,
  CardBody,
  EmptyState,
  SkeletonRows,
  Slider,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from '@/components/ui';
import { NO_DATA, money, num, pct } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { useDifferentials } from '@/hooks/useEngine';

/**
 * Rank is a relative game: points everyone else also has move you nowhere. This
 * page plots the two axes that matter together — expected points against how
 * many managers already own the player — so the trade-off is visible rather
 * than argued about.
 */
export default function DifferentialsPage() {
  const navigate = useNavigate();
  const prefs = usePrefs();
  const [maxOwnership, setMaxOwnership] = useState(8);
  const query = useDifferentials(maxOwnership, prefs.model);
  const players = query.data?.players ?? [];

  return (
    <>
      <PageHeader
        title="Differentials"
        subtitle={`High expected points below ${maxOwnership}% ownership, ranked over the ${prefs.horizon}-gameweek horizon.`}
      />

      <Card>
        <CardBody>
          <Slider
            label="Maximum ownership"
            min={1}
            max={15}
            step={0.5}
            value={maxOwnership}
            onChange={setMaxOwnership}
            valueLabel={`${maxOwnership}%`}
          />
        </CardBody>
      </Card>

      {query.isLoading && <SkeletonRows rows={6} />}
      {query.isError && <QueryError error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && players.length === 0 && (
        <EmptyState
          title="Nothing clears the bar"
          description={`No player under ${maxOwnership}% ownership reaches the minimum expected points. Raise the ownership ceiling to widen the net.`}
        />
      )}

      {players.length > 0 && (
        <>
          <Section
            title="Ownership against expected points"
            description="The upper-left quadrant is where rank comes from: strong forecast, few owners."
          >
            <Card>
              <CardBody>
                <ScatterPlot
                  height={360}
                  ariaLabel="Ownership against expected points"
                  xLabel="Ownership (%)"
                  yLabel="Expected points"
                  quadrants={{ x: maxOwnership / 2, y: 4 }}
                  showLabels
                  maxLabels={12}
                  onSelect={(id) => navigate(`/players/${id}`)}
                  data={players.map((player) => ({
                    id: String(player.id),
                    label: player.web_name,
                    x: player.ownership,
                    y: player.xp,
                    group: player.position,
                    size: player.price,
                  }))}
                />
              </CardBody>
            </Card>
          </Section>

          <Section title="Ranked board">
            <Card padding="none">
              <Table>
                <TableHead>
                  <TableRow>
                    <TableHeaderCell>Player</TableHeaderCell>
                    <TableHeaderCell>Pos</TableHeaderCell>
                    <TableHeaderCell align="right">Price</TableHeaderCell>
                    <TableHeaderCell align="right">Owned</TableHeaderCell>
                    <TableHeaderCell align="right">xP</TableHeaderCell>
                    <TableHeaderCell align="right">{prefs.horizon}GW</TableHeaderCell>
                    <TableHeaderCell align="right">Haul</TableHeaderCell>
                    <TableHeaderCell align="right">xP/£m</TableHeaderCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {players.map((player) => (
                    <TableRow key={player.id} onClick={() => navigate(`/players/${player.id}`)}>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <PlayerImage
                            code={player.code}
                            name={player.web_name}
                            candidates={player.photo.candidates}
                            size="xs"
                          />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{player.web_name}</p>
                            <p className="flex items-center gap-1.5 text-[11.5px] text-text-faint">
                              <TeamBadge code={player.team_code} name={player.team} size="xs" />
                              {player.team}
                              {player.is_home !== null && player.opponent
                                ? ` · ${player.is_home ? 'vs' : 'at'} ${player.opponent}`
                                : ''}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge tone="neutral">{player.position}</Badge>
                      </TableCell>
                      <TableCell align="right" numeric>
                        {money(player.price)}
                      </TableCell>
                      <TableCell align="right" numeric>
                        {pct(player.ownership)}
                      </TableCell>
                      <TableCell align="right" numeric>
                        {num(player.xp, 2)}
                      </TableCell>
                      <TableCell align="right" numeric>
                        {player.xp_horizon === null ? NO_DATA : num(player.xp_horizon, 1)}
                      </TableCell>
                      <TableCell align="right" numeric>
                        {pct(player.p_haul * 100)}
                      </TableCell>
                      <TableCell align="right" numeric>
                        {player.value_per_million === null
                          ? NO_DATA
                          : num(player.value_per_million, 2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          </Section>
        </>
      )}
    </>
  );
}
