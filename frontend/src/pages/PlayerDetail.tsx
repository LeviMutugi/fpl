import { ArrowLeft, Info } from 'lucide-react';
import { Link, useParams } from 'react-router-dom';

import { BarChart, Distribution, RadarChart } from '@/components/charts';
import { DifficultyPill, PlayerImage, TeamBadge } from '@/components/football';
import { StatTile } from '@/components/kokonut';
import { MetricRow, PageHeader, Section } from '@/components/layout';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  Skeleton,
  Tooltip,
} from '@/components/ui';
import { NO, dateTime, money, num, pct } from '@/lib/format';
import { usePrefs } from '@/lib/prefs';
import { usePlayer } from '@/hooks/useEngine';

/**
 * Everything the engine knows about one player, with the provenance attached.
 * The distribution is the centrepiece: a point estimate hides whether 5.0 xP is
 * a reliable 5 or a coin-flip between a blank and a haul.
 */

const COMPONENT_LABELS: Record<string, string> = {
  appearance: 'Appearance',
  goals: 'Goals',
  assists: 'Assists',
  clean_sheet: 'Clean sheet',
  saves: 'Saves',
  defcon: 'Defensive contribution',
  bonus: 'Bonus',
  negative: 'Deductions',
};

export default function PlayerDetailPage() {
  const params = useParams<{ id: string }>();
  const prefs = usePrefs();
  const playerId = params.id ? Number(params.id) : null;
  const query = usePlayer(playerId, { model: prefs.model, horizon: prefs.horizon });

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-32 w-full rounded-3xl" />
        <Skeleton className="h-64 w-full rounded-3xl" />
      </div>
    );
  }
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;

  const player = query.data;
  if (!player) return <EmptyState title="Player not found" description="No player with that id." />;

  const prediction = player.prediction;
  const season = player.season;
  const components = prediction
    ? Object.entries(prediction.components)
        .filter(([, value]) => Math.abs(value) > 0.001)
        .map(([key, value]) => ({ label: COMPONENT_LABELS[key] ?? key, value }))
    : [];

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
        <Link to="/players">
          <ArrowLeft className="size-4" /> Back to explorer
        </Link>
      </Button>

      <div className="flex flex-wrap items-start gap-6 rounded-3xl bg-surface-raised p-6 shadow-sm ring-1 ring-border">
        <PlayerImage
          code={player.code}
          name={player.web_name}
          candidates={player.photo.candidates}
          size="xl"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-[26px] font-semibold leading-tight">{player.full_name}</h1>
            <Badge tone="neutral">{player.position}</Badge>
            {player.status !== 'a' && (
              <Badge tone={player.status === 'd' ? 'warning' : 'critical'}>
                {player.availability.injury_status ?? 'Flagged'}
              </Badge>
            )}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-text-muted">
            <span className="flex items-center gap-1.5">
              <TeamBadge code={player.team_code} name={player.team} size="sm" />
              {player.team_name}
            </span>
            <span className="tabular-nums">{money(player.price)}</span>
            <span className="tabular-nums">{pct(player.ownership)} owned</span>
            {player.set_pieces.penalties !== null && (
              <Tooltip content="Penalty order published by the game">
                <span>Pens #{player.set_pieces.penalties}</span>
              </Tooltip>
            )}
          </div>
          {player.news && (
            <p className="mt-3 rounded-xl bg-warning-soft px-3 py-2 text-[12.5px] text-text">
              {player.news}
              {player.chance_of_playing !== null && (
                <span className="ml-1.5 font-medium">({player.chance_of_playing}% chance of playing)</span>
              )}
            </p>
          )}
          {player.availability.source === 'news_agent' && player.availability.rationale && (
            <p className="mt-2 rounded-xl bg-accent-soft px-3 py-2 text-[12.5px] text-accent-ink">
              <Info className="mr-1.5 inline size-3.5" />
              Availability overridden by the news agent: {player.availability.rationale}
            </p>
          )}
        </div>
      </div>

      <MetricRow>
        <StatTile label="Expected points" value={prediction?.xp ?? null} decimals={2} hint={`GW${prediction?.event ?? '—'}`} />
        <StatTile
          label="Expected minutes"
          value={prediction?.exp_minutes ?? null}
          decimals={0}
          hint={prediction ? `${pct((prediction.p_start ?? 0) * 100)} chance of starting` : undefined}
        />
        <StatTile
          label="Haul probability"
          value={prediction ? prediction.p_haul * 100 : null}
          decimals={1}
          suffix="%"
          hint="10 or more points"
        />
        <StatTile
          label="Blank probability"
          value={prediction ? prediction.p_blank * 100 : null}
          decimals={1}
          suffix="%"
          hint="2 or fewer points"
          invertDelta
        />
      </MetricRow>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section
          title="Points distribution"
          description="The exact convolution of every scoring component, not a normal approximation."
        >
          <Card>
            <CardBody>
              {player.pmf && player.pmf.length > 0 ? (
                <Distribution
                  data={player.pmf}
                  mean={prediction?.xp ?? null}
                  p10={prediction?.p10 ?? null}
                  p90={prediction?.p90 ?? null}
                  height={260}
                  ariaLabel={`Points distribution for ${player.web_name}`}
                />
              ) : (
                <EmptyState
                  title="No distribution stored"
                  description="The full distribution is only kept for the run's target gameweek."
                />
              )}
            </CardBody>
          </Card>
        </Section>

        <Section title="Where the points come from" description="Component expectations summing to the forecast.">
          <Card>
            <CardBody>
              {components.length > 0 ? (
                <BarChart
                  data={components}
                  orientation="horizontal"
                  height={260}
                  ariaLabel="Expected points by component"
                />
              ) : (
                <EmptyState title="No prediction" description="This player has no forecast in the active run." />
              )}
            </CardBody>
          </Card>
        </Section>
      </div>

      <Section title="Fixtures" description="The published calendar, with this player's forecast per gameweek.">
        <Card>
          <CardBody>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[480px] text-[13px]">
                <thead>
                  <tr className="text-left text-text-faint">
                    <th className="pb-2 font-medium">GW</th>
                    <th className="pb-2 font-medium">Opponent</th>
                    <th className="pb-2 font-medium">Difficulty</th>
                    <th className="pb-2 font-medium">Kickoff</th>
                    <th className="pb-2 text-right font-medium">xP</th>
                  </tr>
                </thead>
                <tbody>
                  {player.fixtures.map((fixture) => (
                    <tr key={`${fixture.event}-${fixture.opponent_id}`} className="border-t border-border">
                      <td className="py-2 tabular-nums">{fixture.event}</td>
                      <td className="py-2">
                        {fixture.opponent} {fixture.is_home ? '(H)' : '(A)'}
                      </td>
                      <td className="py-2">
                        <DifficultyPill value={fixture.difficulty} />
                      </td>
                      <td className="py-2 text-text-faint">
                        {fixture.kickoff ? dateTime(fixture.kickoff) : NO}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {fixture.xp === null ? NO : num(fixture.xp, 2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title={`Observed profile — ${season?.season ?? 'no season data'}`}>
          <Card>
            <CardBody>
              {season ? (
                <>
                  <RadarChart
                    height={260}
                    ariaLabel={`Per-90 profile for ${player.web_name}`}
                    axes={[
                      { key: 'xg90', label: 'xG/90', max: 1 },
                      { key: 'xa90', label: 'xA/90', max: 0.6 },
                      { key: 'bps90', label: 'BPS/90', max: 35 },
                      { key: 'starts', label: 'Start rate', max: 1 },
                      { key: 'pts90', label: 'Pts/90', max: 8 },
                    ]}
                    series={[
                      {
                        label: player.web_name,
                        values: {
                          xg90: season.xg90,
                          xa90: season.xa90,
                          bps90: season.bps90,
                          starts: season.minutes ? season.starts / 38 : 0,
                          pts90: season.pts90,
                        },
                      },
                    ]}
                  />
                  <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[12.5px] sm:grid-cols-3">
                    {(
                      [
                        ['Minutes', season.minutes],
                        ['Starts', season.starts],
                        ['Goals', season.goals],
                        ['Assists', season.assists],
                        ['Clean sheets', season.clean_sheets],
                        ['Bonus', season.bonus],
                        ['xG', num(season.xg, 2)],
                        ['xA', num(season.xa, 2)],
                        ['xGC', num(season.xgc, 2)],
                        ['Total points', season.total_points],
                      ] as const
                    ).map(([label, value]) => (
                      <div key={label}>
                        <dt className="text-text-faint">{label}</dt>
                        <dd className="font-medium tabular-nums">{value ?? NO}</dd>
                      </div>
                    ))}
                  </dl>
                </>
              ) : (
                <EmptyState title="No season data" description="This player has no recorded minutes." />
              )}
            </CardBody>
          </Card>
        </Section>

        <Section title="Model agreement" description="What each model in the run says about this gameweek.">
          <Card>
            <CardBody className="space-y-4">
              <BarChart
                data={player.model_spread.map((entry) => ({ label: entry.name, value: entry.xp }))}
                orientation="horizontal"
                height={140}
                ariaLabel="Expected points by model"
              />
              {player.explain && player.explain.length > 0 && (
                <div>
                  <h4 className="mb-2 text-[13px] font-medium">
                    Strongest feature contributions (LightGBM)
                  </h4>
                  <BarChart
                    data={player.explain
                      .slice(0, 8)
                      .map((entry) => ({ label: entry.feature, value: entry.contribution }))}
                    orientation="horizontal"
                    height={180}
                    ariaLabel="Feature contributions"
                  />
                  <p className="mt-2 text-[11.5px] text-text-faint">
                    Exact tree-additive contributions to the points-per-90 prediction, not an approximation.
                  </p>
                </div>
              )}
            </CardBody>
          </Card>
        </Section>
      </div>

      {(player.odds.length > 0 || player.news.length > 0 || player.fbref) && (
        <Section title="External sources">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Bookmaker markets</CardTitle>
              </CardHeader>
              <CardBody>
                {player.odds.length === 0 ? (
                  <p className="text-[12.5px] text-text-muted">
                    No odds ingested. Configure <code className="font-mono">ODDS_API_KEY</code> to add them —
                    nothing is estimated in their place.
                  </p>
                ) : (
                  <ul className="space-y-1.5 text-[12.5px]">
                    {player.odds.slice(0, 6).map((market, index) => (
                      <li key={index} className="flex justify-between gap-2">
                        <span className="text-text-muted">{market.market}</span>
                        <span className="tabular-nums">{pct(market.implied_prob * 100)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Underlying metrics</CardTitle>
              </CardHeader>
              <CardBody>
                {!player.fbref ? (
                  <p className="text-[12.5px] text-text-muted">
                    FBref not ingested. Install <code className="font-mono">soccerdata</code> and run the
                    FBref adapter to add shot- and goal-creating actions.
                  </p>
                ) : (
                  <ul className="space-y-1.5 text-[12.5px]">
                    {Object.entries(player.fbref)
                      .slice(0, 8)
                      .map(([key, value]) => (
                        <li key={key} className="flex justify-between gap-2">
                          <span className="text-text-muted">{key.replace(/_/g, ' ')}</span>
                          <span className="tabular-nums">{num(value, 2)}</span>
                        </li>
                      ))}
                  </ul>
                )}
              </CardBody>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>News</CardTitle>
              </CardHeader>
              <CardBody>
                {player.news.length === 0 ? (
                  <p className="text-[12.5px] text-text-muted">No availability reports linked.</p>
                ) : (
                  <ul className="space-y-2 text-[12.5px]">
                    {player.news.slice(0, 4).map((item, index) => (
                      <li key={index}>
                        <p className="leading-relaxed">{item.text}</p>
                        <p className="mt-0.5 text-text-faint">
                          {item.source}
                          {item.published_at ? ` · ${dateTime(item.published_at)}` : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </div>
        </Section>
      )}
    </>
  );
}
